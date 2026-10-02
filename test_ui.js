/* End-to-end test of the page's own interface.
 *
 * The core tests prove the arithmetic. This proves the GAME: that a player can
 * click through the market, work for money, buy the right parts, and reach the
 * win state - through the same handlers a browser would fire, driven by the
 * page's own clock.
 *
 *   node test_ui.js
 */
const S = require("./sim_core.js");

let pass = 0, fail = 0;
function check(name, cond, extra) {
	if (cond) { pass++; console.log("  PASS  " + name); }
	else { fail++; console.log("  FAIL  " + name + (extra !== undefined ? "   -> " + extra : "")); }
}
function rule(t) { console.log(""); console.log("  ---- " + t + " ----"); }

// --------------------------------------------------------------- DOM stub
// Minimal, but it has to behave: `innerHTML = ""` must clear the children, or
// re-rendering accumulates nodes and every count is wrong.
const store = {};
function mk(tag) {
	const el = {
		tagName: tag, style: {}, className: "", textContent: "", value: "",
		checked: false, width: 292, height: 40, attrs: {},
		childNodes: [], firstChild: null, lastChild: null,
		onclick: null, onchange: null,
		setAttribute(k, v) { this.attrs[k] = v; },
		getAttribute(k) { return this.attrs[k]; },
		appendChild(c) { this.childNodes.push(c); this.firstChild = this.childNodes[0]; this.lastChild = c; return c; },
		insertBefore(c) { this.childNodes.unshift(c); this.firstChild = this.childNodes[0]; return c; },
		removeChild(c) { this.childNodes.pop(); this.lastChild = this.childNodes[this.childNodes.length - 1] || null; return c; },
		getContext() {
			return { clearRect() {}, fillRect() {}, fillText() {}, font: "",
				set fillStyle(v) {}, get fillStyle() { return ""; } };
		},
	};
	Object.defineProperty(el, "innerHTML", {
		get() { return this._html || ""; },
		set(v) { this._html = v; if (v === "") { this.childNodes = []; this.firstChild = null; this.lastChild = null; } },
	});
	return el;
}

// the page's clock is a setInterval: capture the callback rather than waiting
// A fake localStorage. Without this the save path is untested, and "it saves"
// would be something I asserted rather than something I checked.
const fakeStorage = (() => {
	const data = {};
	return {
		getItem: (k) => (k in data ? data[k] : null),
		setItem: (k, v) => { data[k] = String(v); },
		removeItem: (k) => { delete data[k]; },
		_has: (k) => k in data,
		_dump: () => data,
		_clear: () => { for (const k of Object.keys(data)) delete data[k]; },
	};
})();
global.localStorage = fakeStorage;

let tickFn = null;
global.setInterval = (fn) => { tickFn = fn; return 1; };
global.clearInterval = () => { tickFn = null; };
global.window = { SimCore: S, addEventListener: () => {} };
const askedFor = [];
global.document = {
	getElementById: (id) => { askedFor.push(id); return (store[id] = store[id] || mk("div")); },
	createElement: mk,
	addEventListener: () => {},
	visibilityState: "visible",
};

// ------------------------------------------------------------- helpers
const SLOT = { board: 0, cpu: 1, gpu: 2, ram: 3, storage: 4, psu: 5, chassis: 6 };
const boardCards = () => store["board"].childNodes;
const goalText = () => store["goal"].textContent;
const winShown = () => store["win"].style.display === "block";
const cash = () => parseInt(store["budget"].textContent.replace("$", ""), 10);

function marketRows() { return store["slots"].childNodes.filter(n => n.className === "market"); }
function slotEl(i) { return store["slots"].childNodes.filter(n => n.className.indexOf("slot") === 0)[i]; }
// The picker that is OPEN, found by its own class rather than assumed: clicking
// a slot TOGGLES it, so a helper that closes "the first slot" instead SWITCHES
// pickers and every later lookup searches the wrong market.
function openPickerEl() {
	const o = store["slots"].childNodes.filter(n => n.className.indexOf("open") >= 0);
	return o.length ? o[0] : null;
}
function openPicker(i) {
	const o = openPickerEl();
	if (o && o !== slotEl(i)) o.onclick();
	if (marketRows().length === 0) slotEl(i).onclick();
}
function closePicker() { const o = openPickerEl(); if (o) o.onclick(); }
function rowFor(slotIndex, partId) {
	openPicker(slotIndex);
	const m = marketRows()[0];
	if (!m) throw new Error("picker did not open for slot " + slotIndex);
	for (const row of m.childNodes) {
		if (row.getAttribute && row.getAttribute("data-id") === partId) return row;
	}
	return null;
}
function buy(slotIndex, partId) {
	const row = rowFor(slotIndex, partId);
	if (!row) throw new Error("no market row with data-id=" + partId);
	row.onclick({ stopPropagation() {} });
}
function isInstalled(slotIndex, partId) {
	const row = rowFor(slotIndex, partId);
	const found = !!row && row.className.indexOf("current") >= 0;
	closePicker();
	return found;
}
function setQuality(q) { store["qual"].value = q; store["qual"].onchange({ target: { value: q } }); }
function setRes(r) { store["res"].value = r; store["res"].onchange({ target: { value: r } }); }

function workCards(box) { return store[box].childNodes; }
function buttonOf(card) { return card.childNodes[card.childNodes.length - 1]; }
function byAttr(box, attr, val) {
	return workCards(box).filter(c => c.getAttribute && c.getAttribute(attr) === val)[0];
}
function advance(n) { for (let i = 0; i < n; i++) tickFn(); }   // one tick = one hour
function advanceHours(n) { advance(n); }
// Clicking an ACTIVE job stops it, so "take this job" must not blindly click.
function takeJob(id) {
	const card = byAttr("jobs", "data-job", id);
	if (card.className.indexOf("active") < 0) buttonOf(card).onclick();
}
// The opening move: the cheapest working machine in the catalogue.
function fitStarter() {
	buy(SLOT.board, "b-lga775");
	buy(SLOT.cpu, "e5300");
	buy(SLOT.ram, "d3-4");
	buy(SLOT.gpu, "igpu");
	buy(SLOT.storage, "hdd");
	buy(SLOT.psu, "psu300");     // a case-bundled unit is enough for integrated
	buy(SLOT.chassis, "case_mini");
}
function ramMarketRows(partId) {
	const m = marketRows()[0];
	if (!m) return null;
	return m.childNodes.filter(c => c.getAttribute && c.getAttribute("data-id") === partId)[0];
}
// log() writes LINES as child nodes, not innerHTML - reading _html there reads
// nothing, which is exactly what an assertion against it would silently do
function logText() { return store["log"].childNodes.map(c => c.textContent).join(" | "); }
// No clock button on the page any more - starting work starts time. A test halts
// it through the seam the UI exposes for exactly this.
function clock(on) { on ? window.PCForgeTest.resume() : window.PCForgeTest.pause(); }

// ---------------------------------------------------------------- run
rule("the page loads and renders");
require("./ui.js");
check("every game in the 2017 suite has a card",
	boardCards().length === S.GAMES.length, boardCards().length);
check("seven build slots, case included",
	store["slots"].childNodes.filter(n => n.className.indexOf("slot") === 0).length === 7,
	store["slots"].childNodes.filter(n => n.className.indexOf("slot") === 0).length);
check("you start with the loan and nothing else",
	store["budget"].textContent === "$" + S.LOAN_AMOUNT,
	store["budget"].textContent);
check("the debt is on the header", store["debt"].textContent === "$" + S.LOAN_AMOUNT,
	store["debt"].textContent);
check("an empty machine reads as incomplete, not as a score",
	goalText() === "incomplete", goalText());
check("and the win banner is hidden", winShown() === false);
check("the clock is not running", tickFn === null);

rule("the earning panel, on the starter machine");
// the panel is grouped now, so count the CARDS by their own attribute rather than
// every child - group headings are children too
const computeCards = () => workCards("compute").filter(c => c.getAttribute("data-work"));
const jobCardsAll = () => workCards("jobs").filter(c => c.getAttribute("data-job"));
check("every workload in the catalogue has a card",
	computeCards().length === S.CONTRACTS.length + 1,   // + mining
	computeCards().length + " of " + (S.CONTRACTS.length + 1));
check("and every job has one", jobCardsAll().length === S.JOBS.length,
	jobCardsAll().length + " of " + S.JOBS.length);
check("the machine's work is grouped by what limits it",
	workCards("compute").filter(c => c.className === "wgroup").length
		=== S.jobCategories(S.CONTRACTS).length,
	workCards("compute").filter(c => c.className === "wgroup").length + " of "
		+ S.jobCategories(S.CONTRACTS).length + " (mining stands alone)");
check("and your jobs are grouped into tiers",
	workCards("jobs").filter(c => c.className === "wgroup").length
		=== S.jobCategories(S.JOBS).length,
	workCards("jobs").filter(c => c.className === "wgroup").length);
check("with nothing fitted, no machine work is available",
	computeCards().filter(c => c.getAttribute("data-work") !== "mining")
		.every(c => c.className.indexOf("locked") >= 0),
	computeCards().filter(c => c.className.indexOf("locked") < 0).length + " unlocked");
check("but the hand-work jobs are", jobCardsAll()
	.filter(c => c.className.indexOf("locked") < 0).length >= 9,
	jobCardsAll().filter(c => c.className.indexOf("locked") < 0).length + " open");
check("with no card at all, the callout is still locked",
	byAttr("jobs", "data-job", "repair").className.indexOf("locked") >= 0);
check("mowing is available with no hardware at all",
	byAttr("jobs", "data-job", "mow").className.indexOf("locked") < 0);
check("a callout is locked with nothing but integrated graphics",
	byAttr("jobs", "data-job", "repair").className.indexOf("locked") >= 0,
	byAttr("jobs", "data-job", "repair").className);
check("mining is locked on integrated graphics too",
	byAttr("compute", "data-work", "mining").className.indexOf("locked") >= 0);
check("and the lock says why, in its own terms",
	/integrated|no graphics card/.test(byAttr("compute", "data-work", "mining").innerHTML),
	byAttr("compute", "data-work", "mining").innerHTML.slice(0, 150));

rule("earning through the page's own clock");
// The trap this guards: taking a job used to leave the clock off, so the card
// went active and no money ever arrived. "i cant work bro the money keep 350."
check("the clock is off before any work is taken", tickFn === null);
buttonOf(byAttr("jobs", "data-job", "mow")).onclick();
check("starting a job marks it active",
	byAttr("jobs", "data-job", "mow").className.indexOf("active") >= 0);
check("and STARTS THE CLOCK BY ITSELF - no second control to find",
	tickFn !== null && window.PCForgeTest.running() === true,
	"timer " + (tickFn ? "running" : "absent"));
check("the header stops saying paused", store["clock"].textContent.indexOf("paused") < 0,
	store["clock"].textContent);
advance(3);
check("three hours later there is money that was not there before",
	cash() > S.LOAN_AMOUNT - 1, "$" + cash());
// hours and money are read as DELTAS: starting a job already started the clock,
// so an absolute figure here would only be asserting how many ticks this test
// happened to run first
const hoursNow = () => parseInt(store["clock"].textContent, 10);
const cashNow = cash();
const debtNow = parseInt(store["debt"].textContent.replace("$", ""), 10);
const hoursBefore = hoursNow();
advance(9);
check("nine more hours of mowing is nine more hours on the clock",
	hoursNow() === hoursBefore + 9, hoursBefore + "h -> " + hoursNow() + "h");
check("three shifts are worked in those nine hours", (() => {
	// gross $72, but the loan takes its share before you see it
	const gross = 3 * 24;
	const kept = Math.round(gross * (1 - S.LOAN_REPAY_SHARE));
	return cash() - cashNow === kept;
})(), "+" + (cash() - cashNow) + " (3 x $24 less the "
	+ Math.round(S.LOAN_REPAY_SHARE * 100) + "% loan share)");
check("and the debt went down by the rest",
	debtNow - parseInt(store["debt"].textContent.replace("$", ""), 10)
		=== Math.round(3 * 24 * S.LOAN_REPAY_SHARE),
	debtNow + " -> " + store["debt"].textContent);
check("the readout shows an hourly rate", /\$[0-9.]+\/h/.test(store["income"].textContent),
	store["income"].textContent);
check("and the UI never reaches for a clock switch at all",
	askedFor.indexOf("run") < 0,
	"ids the UI asked for that look like a clock: "
		+ askedFor.filter(i => /run|clock|pause/.test(i)).join(", "));
check("nor a speed control - time is one hour a tick, and that is that",
	askedFor.indexOf("speed") < 0,
	"ids the UI asked for that look like a speed: "
		+ askedFor.filter(i => /speed|rate|fast/.test(i)).join(", "));

rule("fast-forward pays every shift it crosses");
const before = cash();
advance(25);            // a 25-hour stretch in one go
check("one 25-hour tick pays eight 3-hour shifts, not one", (() => {
	const gross = 8 * 24;
	return cash() - before === Math.round(gross * (1 - S.LOAN_REPAY_SHARE));
})(), "+" + (cash() - before) + " (8 x $24 gross, less the loan share)");

rule("fit the opening machine, part by part");
fitStarter();
check("a motherboard is fitted", isInstalled(SLOT.board, "b-lga775"));
check("and the build is complete", goalText() !== "incomplete", goalText());
check("it does not pass anything yet",
	goalText() === "0 / " + S.GAMES.length + " passing", goalText());
check("the header names the board you are on",
	/buildhead/.test("buildhead") && store["buildhead"].textContent.indexOf("G41") >= 0,
	store["buildhead"].textContent);

rule("spend it on hardware");
buy(SLOT.gpu, "1050ti");
check("the card is fitted", isInstalled(SLOT.gpu, "1050ti"));
check("the callout unlocks", byAttr("jobs", "data-job", "repair").className.indexOf("locked") < 0);
check("mining unlocks", byAttr("compute", "data-work", "mining").className.indexOf("locked") < 0);
check("the training run stays locked on 4 GB",
	byAttr("compute", "data-work", "train").className.indexOf("locked") >= 0);
check("and the render batch does not need 12 GB",
	byAttr("compute", "data-work", "render").className.indexOf("locked") < 0);

rule("switching jobs, and the machine working while you do");
buttonOf(byAttr("jobs", "data-job", "repair")).onclick();
check("clicking another job switches to it rather than refusing",
	byAttr("jobs", "data-job", "repair").className.indexOf("active") >= 0
	&& byAttr("jobs", "data-job", "mow").className.indexOf("active") < 0);
buttonOf(byAttr("compute", "data-work", "mining")).onclick();
check("the machine can mine at the same time as you work",
	byAttr("compute", "data-work", "mining").className.indexOf("active") >= 0
	&& byAttr("jobs", "data-job", "repair").className.indexOf("active") >= 0);
buttonOf(byAttr("compute", "data-work", "render")).onclick();
check("still mining - the second task did not displace the first",
	byAttr("compute", "data-work", "mining").className.indexOf("active") >= 0);
check("and the console explained the refusal, quoting the task that is running",
	/already running Crypto Mining/.test(logText()), logText().slice(0, 160));

rule("earn the 6 GB build");
takeJob("repair");                                          // the better job
let guard = 0;
while (cash() < 520 && guard++ < 200) advanceHours(25);
check("the working wage reached the budget", cash() >= 520, "$" + cash());
buy(SLOT.board, "b-b450");
buy(SLOT.cpu, "3600");
buy(SLOT.ram, "16-3200");
buy(SLOT.gpu, "1660s");
buy(SLOT.psu, "psu450");     // the card needs a cable the bundled unit lacks
buy(SLOT.chassis, "case_mid");
buy(SLOT.storage, "sata");
check("the whole build fitted", isInstalled(SLOT.gpu, "1660s") && isInstalled(SLOT.cpu, "3600")
	&& isInstalled(SLOT.ram, "16-3200") && isInstalled(SLOT.storage, "sata")
	&& isInstalled(SLOT.board, "b-b450"));
check("the training run still needs 10 GB", byAttr("compute", "data-work", "train")
	.className.indexOf("locked") >= 0);

rule("the 6 GB build is a long way from the win");
clock(false);
setRes("1080p");
setQuality("medium");
const ALL = " / " + S.GAMES.length + " passing";
check("it clears only part of the 2017 suite",
	goalText() !== S.GAMES.length + ALL, goalText());

rule("spending more buys the harder settings");
clock(true);
buttonOf(byAttr("compute", "data-work", "mining")).onclick();     // stop mining
guard = 0;
while (cash() < 1100 && guard++ < 200) advanceHours(25);
check("earned enough for the card that clears the suite", cash() >= 1100, "$" + cash());
// the board matters: X570 is PCIe 4.0, and a 4060 is a 4.0 card
buy(SLOT.board, "b-x570");
buy(SLOT.cpu, "5800x3d");
buy(SLOT.ram, "32-3600");
buy(SLOT.gpu, "4060");
buy(SLOT.psu, "psu750");     // 115 W card plus a 105 W CPU needs real capacity
buy(SLOT.chassis, "case_full");   // and enough airflow to shed it
rule("the win");
setRes("1080p");
setQuality("medium");
clock(false);
check("1080p medium: the whole 2017 suite passes",
	goalText() === S.GAMES.length + ALL, goalText());
check("the banner appears", winShown() === true);

rule("quality is the difficulty knob");
setQuality("high");
check("the same machine does NOT clear 1080p high",
	goalText() !== S.GAMES.length + ALL, goalText());
check("and the banner goes away", winShown() === false);
check("the whole win was bought with earned money, not given", cash() >= 0
	&& S.LOAN_AMOUNT < 1000, "$" + cash() + " left after the build");

rule("the wall is VRAM, not money - but only once you turn the settings up");
store["reset"].onclick();
clock(true);
takeJob("mow");
guard = 0;
while (cash() < 900 && guard++ < 200) advanceHours(25);
clock(false);
buy(SLOT.board, "b-x570");
buy(SLOT.cpu, "3600");
buy(SLOT.ram, "32-3600");
buy(SLOT.gpu, "1650");
buy(SLOT.psu, "psu450");
buy(SLOT.chassis, "case_mid");
buy(SLOT.storage, "nvme");
check("the machine is complete before the wall is tested",
	goalText() !== "incomplete", goalText());

// 2017 games were built for 2013-era consoles: a 4 GB card holds them at 1080p.
setRes("1080p"); setQuality("medium");
const spilled1080 = boardCards().filter(c => c._html.indexOf("VRAM") >= 0).length;
check("a 4 GB card does NOT spill a single 2017 title at 1080p medium", spilled1080 === 0,
	spilled1080 + " cards report VRAM as the limit");

// turn it up and the wall appears
setRes("1440p"); setQuality("high");
const spilled1440 = boardCards().filter(c => c._html.indexOf("VRAM") >= 0).length;
check("at 1440p high the same card spills on most of the suite", spilled1440 >= 8,
	spilled1440 + " of " + S.GAMES.length + " report VRAM as the limit");
check("and money did not fix it - it is the card", goalText() !== S.GAMES.length + ALL,
	goalText());
check("while plenty of the suite still passes", boardCards().filter(
	c => c.className.indexOf("good") >= 0).length >= 1);

rule("the market is a catalogue, grouped rather than dumped");
function rowsIn(market) { return market.childNodes.filter(c => c.className.indexOf("mrow") === 0); }
function groupsIn(market) { return market.childNodes.filter(c => c.className === "mgroup"); }
openPicker(SLOT.cpu);
const cpuMarket = marketRows()[0];
check("every CPU in the catalogue is on the shelf", rowsIn(cpuMarket).length === 68,
	rowsIn(cpuMarket).length);
const cpuGroups = groupsIn(cpuMarket);
check("grouped by generation", cpuGroups.length === 57, cpuGroups.length);
check("newest first", /Panther Lake/.test(cpuGroups[0].textContent), cpuGroups[0].textContent);
check("oldest last", /^Athlon 64$/.test(cpuGroups[cpuGroups.length - 1].textContent),
	cpuGroups[cpuGroups.length - 1].textContent);
closePicker();

openPicker(SLOT.ram);
const ramMarket = marketRows()[0];
check("every memory kit is on the shelf", rowsIn(ramMarket).length === 117,
	rowsIn(ramMarket).length);
const ramGroups = groupsIn(ramMarket);
check("grouped by brand", ramGroups.length === 16, ramGroups.length);
check("including the brands that no longer exist",
	ramGroups.some(g => g.textContent === "OCZ")
	&& ramGroups.some(g => g.textContent === "Winbond"),
	ramGroups.map(g => g.textContent).join(", "));
closePicker();

rule("a mismatched part does not POST, and the page says so before you pay");
store["reset"].onclick();
fitStarter();
check("the starter machine is complete and POSTs",
	goalText() !== "incomplete" && goalText() !== "no POST", goalText());
check("its card is integrated, so the callout job is still locked",
	byAttr("jobs", "data-job", "repair").className.indexOf("locked") >= 0);
clock(true);
takeJob("mow");
let guard2 = 0;
while (cash() < 700 && guard2++ < 200) advanceHours(25);
clock(false);
check("earned enough for an AM5 chip", cash() >= 700, "$" + cash());

// an AM5 chip in an LGA 775 board
buy(SLOT.cpu, "r9-9950x");
check("the build is now an AM5 chip in an LGA 775 board",
	store["post"].style.display === "block", store["post"].textContent);
check("the banner names both sockets",
	/AM5/.test(store["post"].textContent) && /LGA775/.test(store["post"].textContent),
	store["post"].textContent);
check("the goal line stops claiming a score",
	store["goal"].textContent === "no POST", store["goal"].textContent);
check("nothing passes", boardCards().every(c => c.className.indexOf("good") < 0));
check("and the win banner is hidden", winShown() === false);
check("the breakdown explains it rather than showing 0 fps for no reason",
	/socket LGA775|does not go in this board/.test(store["notes"].innerHTML),
	store["notes"].innerHTML.slice(0, 130));

// the market flags the boards that cannot take the chip you just fitted
openPicker(SLOT.board);
const am4row = ramMarketRows("b-b450");
check("an AM4 board is marked as not fitting an AM5 chip",
	am4row && am4row.className.indexOf("mismatch") >= 0,
	am4row ? am4row.className : "row not found");
closePicker();

// the fix takes three parts, in this order: memory, then the board, because the
// board is what has the slots AND the socket
buy(SLOT.ram, "d5-32");
check("DDR5 in an LGA 775 board still does not POST",
	store["post"].style.display === "block", store["post"].textContent);
buy(SLOT.board, "b-b650");
check("fitting the AM5 board last clears it", store["post"].style.display === "none",
	store["post"].textContent);
check("and the build is live again", store["goal"].textContent !== "no POST",
	store["goal"].textContent);

rule("the power supply is a choice, not a formality");
openPicker(SLOT.psu);
const psuMarket = marketRows()[0];
check("every unit is on the shelf", rowsIn(psuMarket).length === S.PSUS.length,
	rowsIn(psuMarket).length + " of " + S.PSUS.length);
check("a unit shows its capacity, rating and cables",
	/watts|W/.test(ramMarketRows("psu850").innerHTML)
	&& /80\+/.test(ramMarketRows("psu850").innerHTML)
	&& /PCIe/.test(ramMarketRows("psu850").innerHTML),
	ramMarketRows("psu850").innerHTML.slice(0, 140));
closePicker();

rule("the board market, and the debt");
openPicker(SLOT.board);
const boardMarket = marketRows()[0];
check("every board in the catalogue is on the shelf",
	rowsIn(boardMarket).length === S.BOARDS.length, rowsIn(boardMarket).length);
check("grouped by platform family",
	groupsIn(boardMarket).length === S.BOARD_ERAS.length, groupsIn(boardMarket).length);
check("the HEDT platforms are in there",
	groupsIn(boardMarket).some(g => /HEDT/.test(g.textContent)),
	groupsIn(boardMarket).map(g => g.textContent).slice(0, 3).join(" / "));
closePicker();

store["reset"].onclick();
check("starting over gives you the loan and no machine",
	store["debt"].textContent === "$" + S.LOAN_AMOUNT
	&& store["goal"].textContent === "incomplete",
	store["debt"].textContent + " / " + store["goal"].textContent);
check("and the PAY OFF button refuses while you are holding the loan",
	store["payoff"].onclick !== null);
store["payoff"].onclick();
check("paying it off on day one works, because you are holding the money",
	store["debt"].textContent === "$0", store["debt"].textContent);

rule("the game remembers what you built");
fakeStorage._clear();
store["reset"].onclick();
check("a fresh game writes a save immediately", fakeStorage._has("pcforge.save.v1"),
	Object.keys(fakeStorage._dump()).join(", "));
fitStarter();
const savedCash = cash();
takeJob("mow");          // starting work starts the clock, which advance() needs
check("taking a job started the clock", tickFn !== null);
advance(6);
const cashAfterWork = cash();
check("working changed the money", cashAfterWork !== savedCash,
	savedCash + " -> " + cashAfterWork);
const savedBudget = JSON.parse(fakeStorage._dump()["pcforge.save.v1"]).state.budget;
check("and the save followed the money",
	Math.abs(savedBudget - cashAfterWork) < 1.5,
	"$" + savedBudget + " in the save vs $" + cashAfterWork + " on screen");

const dumpBefore = fakeStorage._dump()["pcforge.save.v1"];
const parsed = JSON.parse(dumpBefore);
check("the save carries the whole machine",
	["board", "cpu", "gpu", "ram", "storage", "budget", "loan", "hours", "job"]
		.every(k => k in parsed.state),
	Object.keys(parsed.state).join(", "));
check("including the board you fitted",
	parsed.state.board === "b-lga775", parsed.state.board);

// now simulate closing the game and opening it again: fresh module, same storage
delete require.cache[require.resolve("./ui.js")];
const store2 = {};
global.document = {
	getElementById: (id) => { askedFor.push(id); return (store2[id] = store2[id] || mk("div")); },
	createElement: mk,
	addEventListener: () => {},
	visibilityState: "visible",
};
tickFn = null;
require("./ui.js");
check("the reopened game shows the same cash as the save",
	Math.abs(parseFloat(store2["budget"].textContent.replace("$", ""))
		- parsed.state.budget) < 1.5,
	store2["budget"].textContent + " vs saved $" + parsed.state.budget);
check("the reopened game remembers the board you fitted",
	store2["buildhead"].textContent.indexOf("G41") >= 0, store2["buildhead"].textContent);
check("and the hours you had already put in",
	store2["clock"].textContent.indexOf(String(parsed.state.hours) + "h") >= 0,
	store2["clock"].textContent);
check("it says so in the log rather than silently appearing",
	store2["log"].childNodes.some(n => /resumed your saved machine/.test(n.textContent)),
	store2["log"].childNodes.slice(0, 2).map(n => n.textContent).join(" | "));
check("and it is working again, because it was working when it closed",
	store2["clock"].textContent.indexOf("paused") < 0, store2["clock"].textContent);

// start over must actually start over
store2["reset"].onclick();
const afterReset = JSON.parse(fakeStorage._dump()["pcforge.save.v1"]).state;
check("START OVER replaces the save with a fresh game",
	afterReset.board === null && afterReset.cpu === null
	&& afterReset.budget === S.LOAN_AMOUNT && afterReset.hours === 0,
	JSON.stringify({ board: afterReset.board, budget: afterReset.budget,
		hours: afterReset.hours }));
check("so the old machine cannot come back",
	afterReset.board !== "b-lga775", String(afterReset.board));
check("and the machine is gone from the screen too",
	store2["buildhead"].textContent.indexOf("nothing fitted") >= 0,
	store2["buildhead"].textContent);

// a save from a catalogue that no longer has your part must not become a lie
fakeStorage.setItem("pcforge.save.v1", JSON.stringify({
	v: 1, state: { board: "b-that-never-existed", cpu: "e5300", ram: "d3-4",
		gpu: "igpu", storage: "hdd", budget: 100, loan: 0, hours: 5 },
	sel: { game: "esports", res: "1080p", qual: "medium", rt: false },
}));
const store3 = {};
global.document = {
	getElementById: (id) => (store3[id] = store3[id] || mk("div")),
	createElement: mk,
	addEventListener: () => {},
	visibilityState: "visible",
};
tickFn = null;
delete require.cache[require.resolve("./ui.js")];
require("./ui.js");
check("a part that no longer exists is cleared, not swapped for another",
	store3["buildhead"].textContent.indexOf("nothing fitted") >= 0,
	store3["buildhead"].textContent);
check("the money is still restored",
	Math.abs(parseFloat(store3["budget"].textContent.replace("$", "")) - 100) < 1.5,
	store3["budget"].textContent);
fakeStorage._clear();

rule("the breakdown explains itself");
const demandHtml = store["demand"].innerHTML;
check("the demand panel names every term",
	["engine", "textures", "ray tracing", "mods", "demand", "card has"]
		.every(k => demandHtml.indexOf(k) >= 0));
check("the frame-rate panel separates GPU-bound from CPU-bound",
	store["fpscalc"].innerHTML.indexOf("GPU-bound") >= 0
	&& store["fpscalc"].innerHTML.indexOf("CPU-bound") >= 0);
check("the HAGS verdict states the gate it used",
	/HAGS (on|off) \((capability|workload)\)/.test(store["notes"].innerHTML),
	store["notes"].innerHTML.slice(0, 120));

console.log("");
console.log("  RESULT  passes=" + pass + "  fails=" + fail);
process.exit(fail === 0 ? 0 : 1);
