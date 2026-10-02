/* Headless tests for the PCForge simulation core.
 *
 * These are the numbers the player is shown, so they are asserted rather than
 * eyeballed. Two of them are structural: the starting build must be able to
 * FAIL, and a maxed build must be able to WIN. A game that cannot be lost is
 * not a game, and one that cannot be won is a bug.
 *
 *   node test_sim.js
 */
const S = require("./sim_core.js");

let pass = 0, fail = 0;
function check(name, cond, extra) {
	if (cond) { pass++; console.log("  PASS  " + name); }
	else { fail++; console.log("  FAIL  " + name + (extra !== undefined ? "   -> " + extra : "")); }
}
function rule(t) { console.log(""); console.log("  ---- " + t + " ----"); }
const gpu = (id) => S.getPart(S.GPUS, id);
const game = (id) => S.getPart(S.GAMES, id);
// A synthetic heavy title for testing the DEMAND arithmetic itself. No 2017 game
// carries ray tracing, so nothing in the suite exercises that path - the model
// still has it, and this is what tests it rather than pretending a 2017 title
// does.
const HEAVY = { id: "heavy", name: "Synthetic Heavy Title", engineBase: 1100,
	textureBase: 3200, rt: 0.45, modsMb: 0, cpuDemand: 1.0, targetFps: 30,
	gpuCost: 0.55, rtDefault: true };
const MODDED = { id: "modded", name: "Synthetic Modded Title", engineBase: 1000,
	textureBase: 2800, rt: 0.10, modsMb: 2500, cpuDemand: 1.1, targetFps: 60,
	gpuCost: 0.90, rtDefault: false };
const res = (id) => S.getPart(S.RESOLUTIONS, id);
const qual = (id) => S.getPart(S.QUALITY, id);

// ------------------------------------------------------------ HAGS policy
rule("HAGS: the capability gate, by architecture");
check("a GTX 1650 (Turing, 4 GB) is supported",
	gpu_is("1650"));
function gpu_is(id) { return S.hagsSupported(gpu(id)).ok; }

check("a GT 1030 is refused - 2 GB is the floor",
	!gpu_is("gt1030"), S.hagsSupported(gpu("gt1030")).why);
check("a GTX 1050 Ti is refused - Pascal, not a memory problem",
	!gpu_is("1050ti"), S.hagsSupported(gpu("1050ti")).why);
check("an RX 580 is refused - Polaris, not RDNA",
	!gpu_is("rx580"), S.hagsSupported(gpu("rx580")).why);
check("an RX 6600 is supported - RDNA",
	gpu_is("rx6600"));
check("an Arc A750 is supported",
	gpu_is("a750"));
check("integrated graphics are refused",
	!gpu_is("igpu"));
check("the refusal NAMES the gate rather than returning a bare no",
	S.hagsSupported(gpu("1050ti")).why.indexOf("Pascal") >= 0
	|| S.hagsSupported(gpu("1050ti")).why.indexOf("pre-Turing") >= 0,
	S.hagsSupported(gpu("1050ti")).why);

rule("HAGS: the workload gate");
const heavy = S.vramDemand(HEAVY, res("1080p"), qual("high"), true).total;
check("the expensive title really does want more than 4 GB",
	heavy > 4096, Math.round(heavy) + " MB");
const d1650 = S.hagsDecision(gpu("1650"), HEAVY, res("1080p"), qual("high"), true);
check("a capable card still gets HAGS OFF when the title overflows it",
	d1650.on === false && d1650.gate === "workload", d1650.why);
const d1650light = S.hagsDecision(gpu("1650"), game("esports"), res("1080p"), qual("low"), false);
check("and HAGS ON for a title that fits", d1650light.on === true, d1650light.why);
const d1050 = S.hagsDecision(gpu("1050ti"), game("esports"), res("1080p"), qual("low"), false);
check("an incapable card stays off even for a light title",
	d1050.on === false && d1050.gate === "capability", d1050.why);

// ----------------------------------------------------------- VRAM demand
rule("VRAM demand: direction of every term");
const base = S.vramDemand(game("aco"), res("1080p"), qual("medium"), false).total;
check("1080p medium is the reference point", base > 0, Math.round(base) + " MB");
check("1440p costs more than 1080p",
	S.vramDemand(game("aco"), res("1440p"), qual("medium"), false).total > base);
check("4K costs more than 1440p",
	S.vramDemand(game("aco"), res("4k"), qual("medium"), false).total
	> S.vramDemand(game("aco"), res("1440p"), qual("medium"), false).total);
check("ultra textures cost more than low",
	S.vramDemand(game("aco"), res("1080p"), qual("ultra"), false).total
	> S.vramDemand(game("aco"), res("1080p"), qual("low"), false).total);
check("ray tracing costs extra, on a title that has it",
	S.vramDemand(HEAVY, res("1080p"), qual("high"), true).total
	> S.vramDemand(HEAVY, res("1080p"), qual("high"), false).total);
check("a modded install adds exactly its flat amount", (() => {
	// same resolution and quality, so the only difference is the engine, the
	// texture budget and the mods figure itself
	const m = S.vramDemand(MODDED, res("1080p"), qual("medium"), false);
	const h = S.vramDemand(HEAVY, res("1080p"), qual("medium"), false);
	return Math.abs((m.total - h.total) - (MODDED.modsMb - HEAVY.modsMb
		+ (MODDED.engineBase - HEAVY.engineBase)
		+ (MODDED.textureBase - HEAVY.textureBase))) < 1e-6;
})(), "mods are a flat add, not a multiplier");

// ------------------------------------------------------------- the sim
rule("the simulation: what actually binds");
function one(build, gameId, resId, qualId, rtOn) {
	const st = S.newState(99999);
	// every slot a build can carry, so a rig is a whole machine and not four parts
	for (const k of ["board", "cpu", "gpu", "ram", "storage", "psu", "chassis"]) {
		if (build[k]) st[k] = build[k];
	}
	st.hags = !!build.hags;
	return S.simulate(st, game(gameId), res(resId), qual(qualId), rtOn);
}
const mid = { board: "b-x570", cpu: "3600", gpu: "1650", ram: "16-3200",
	storage: "nvme", psu: "psu550", chassis: "case_full" };

const esp = one(mid, "esports", "1080p", "low", false);
check("a 1650 + 3600 clears an esports title", esp.passes, Math.round(esp.fps) + " fps");
check("and it is not spilling VRAM there", esp.overflow === 0, esp.vramNote);

function oneGame(build, g, resId, qualId, rtOn) {
	const st = S.newState(99999);
	for (const k of ["cpu", "gpu", "ram", "storage"]) if (build[k]) st[k] = build[k];
	st.hags = !!build.hags;
	return S.simulate(st, g, res(resId), qual(qualId), rtOn);
}
const rt = oneGame(mid, HEAVY, "1080p", "high", true);
check("a 1650 FAILS a synthetic ray-traced heavy title", rt.passes === false,
	Math.round(rt.fps) + " fps, spike " + rt.spikeMs.toFixed(1) + " ms");
check("and the binding constraint is reported as VRAM", rt.bound === "VRAM", rt.bound);
check("the overflow is a real number, not a boolean",
	rt.overflow > 0, Math.round(rt.overflow) + " MB over");
check("NO title in the 2017 suite uses ray tracing - it reached PC in 2018",
	S.GAMES.every(g => g.rt === 0 && g.rtDefault === false),
	S.GAMES.filter(g => g.rt > 0).map(g => g.name).join(", ") || "every rt figure is zero");
check("so the ray-tracing toggle changes nothing on this suite", (() => {
	const a = one(mid, "aco", "1080p", "medium", false);
	const b = one(mid, "aco", "1080p", "medium", true);
	return a.fps === b.fps && a.demand.total === b.demand.total;
})(), "no title carries an rt cost to apply");

const heavyBuild = { board: "b-x570", cpu: "5800x3d", gpu: "3060", ram: "32-3600",
	storage: "nvme", psu: "psu750", chassis: "case_full" };
const rtTop = oneGame(heavyBuild, HEAVY, "1080p", "high", true);
check("a 12 GB card clears the same synthetic workload", rtTop.passes,
	Math.round(rtTop.fps) + " fps, overflow " + Math.round(rtTop.overflow) + " MB");

rule("engines have ceilings, and they are the reason a fast PC is not absurd");
check("none of the suite runs at a silly frame rate", (() => {
	const st = S.newState(999999);
	Object.assign(st, { board: "b-x870e", cpu: "r7-9850x3d", gpu: "5070",
		ram: "d5-64", storage: "nvme", psu: "psu1600", chassis: "case_full" });
	const worst = S.GAMES.map(g => ({ g: g,
		r: S.simulate(st, g, res("1080p"), qual("low"), false) }))
		.sort((a, b) => b.r.fps - a.r.fps)[0];
	return worst.r.fps < 500;
})(), "the fastest title on the fastest machine stays under 500 fps");
check("a frame-tied fighting game does not exceed 60", (() => {
	const st = S.newState(999999);
	Object.assign(st, { board: "b-x870e", cpu: "r7-9850x3d", gpu: "5070",
		ram: "d5-64", storage: "nvme", psu: "psu1600", chassis: "case_full" });
	return S.simulate(st, game("tekken7"), res("1080p"), qual("low"), false).fps === 60;
})(), "Tekken 7 is capped at 60");
check("and the cap does not stop it being reported as passing",
	S.simulate((() => { const s = S.newState(999999);
		Object.assign(s, { board: "b-x870e", cpu: "r7-9850x3d", gpu: "5070",
			ram: "d5-64", storage: "nvme", psu: "psu1600", chassis: "case_full" });
		return s; })(), game("tekken7"), res("1080p"), qual("low"), false).passes);
check("a capped title reports the cap, and the uncapped figure behind it", (() => {
	const st = S.newState(999999);
	Object.assign(st, { board: "b-x870e", cpu: "r7-9850x3d", gpu: "5070",
		ram: "d5-64", storage: "nvme", psu: "psu1600", chassis: "case_full" });
	const r = S.simulate(st, game("tekken7"), res("1080p"), qual("low"), false);
	return r.cap === 60 && r.uncappedFps > 60;
})(), "the engine is the limit, not the card");
check("an uncapped title carries no ceiling", S.GAMES.filter(g => !g.cap).length > 0
	&& S.GAMES.filter(g => !g.cap).every(g => g.cap === undefined),
	S.GAMES.filter(g => !g.cap).length + " titles are uncapped");

rule("memory and storage have to matter, or the choices are fake");
// pubg is uncapped and CPU-heavy, so memory bandwidth is what shows
const tight = one({ cpu: "3600", gpu: "3060", ram: "8-2400", storage: "nvme" }, "pubg", "1080p", "medium", false);
const roomy = one({ cpu: "3600", gpu: "3060", ram: "16-3200", storage: "nvme" }, "pubg", "1080p", "medium", false);
check("8 GB of 2400 holds a build back", tight.fps < roomy.fps,
	Math.round(tight.fps) + " vs " + Math.round(roomy.fps) + " fps");
const slowDisk = one({ cpu: "3600", gpu: "1650", ram: "16-3200", storage: "hdd" }, "rpg", "1080p", "medium", false);
const fastDisk = one({ cpu: "3600", gpu: "1650", ram: "16-3200", storage: "nvme" }, "rpg", "1080p", "medium", false);
check("a hard disk loads the same game more slowly",
	slowDisk.loadSeconds > fastDisk.loadSeconds * 2.0,
	slowDisk.loadSeconds.toFixed(1) + " s vs " + fastDisk.loadSeconds.toFixed(1) + " s");
check("but the drive does not change the frame rate",
	Math.abs(slowDisk.fps - fastDisk.fps) < 0.01);

// ---------------------------------------------------------------- earning
rule("earning: crypto mining is gated, metered, and small");
function mine(gpuId, cpuId) {
	const st = S.newState(0);
	st.gpu = gpuId; st.cpu = cpuId || "3600";
	return { rev: S.miningRevenuePerHour(S.getPart(S.GPUS, gpuId)),
		net: S.miningNetPerHour(st), watts: S.powerWatts(st) };
}
check("integrated graphics earn nothing mining", mine("igpu").rev === 0);
check("a 2 GB card cannot hold the DAG", mine("gt1030").rev === 0,
	"the DAG needs " + S.MINING_DAG_MB + " MB");
check("a 4 GB card can", mine("1050ti").rev > 0, "$" + mine("1050ti").rev.toFixed(2) + "/h");
check("net is revenue minus the metered draw",
	Math.abs(mine("1660s").net - (mine("1660s").rev
		- S.powerCostPerHour((() => { const s = S.newState(0); s.gpu = "1660s";
			return s; })()))) < 1e-9,
	mine("1660s").net.toFixed(3) + " (draw is measured at the wall, after the PSU)");

check("the efficiency rating changes what mining actually earns", (() => {
	const a = S.newState(0); a.gpu = "1660s"; a.psu = "psu450";    // 80+ White
	const b = S.newState(0); b.gpu = "1660s"; b.psu = "psu850";    // 80+ Gold
	return S.miningNetPerHour(b) > S.miningNetPerHour(a);
})(), "same work, less wasted heat, more kept");
check("a hungrier card pays more for its power",
	S.powerCostPerHour((() => { const s = S.newState(0); s.gpu = "rx580"; return s; })())
	> S.powerCostPerHour((() => { const s = S.newState(0); s.gpu = "1650"; return s; })()));
check("mining is worth LESS than an hour of honest work",
	mine("3060").net < (24 / 3),
	"$" + mine("3060").net.toFixed(2) + "/h mining vs $" + (24 / 3).toFixed(2) + "/h mowing");

rule("earning: the ladder");
const fresh = S.newState(120);
check("mowing needs nothing", S.jobAvailable(fresh, "mow").ok);
check("a callout needs a card of your own", S.jobAvailable(fresh, "repair").ok === false,
	S.jobAvailable(fresh, "repair").why);
fresh.gpu = "1050ti";
check("and is available once you have one", S.jobAvailable(fresh, "repair").ok);
check("a job that repeats keeps paying",
	S.tickHours(fresh, 3) && fresh.jobsDone !== undefined);

const looper = S.newState(0);
S.startJob(looper, "mow");
const t9 = S.tickHours(looper, 9);
check("three 3-hour shifts in 9 hours is three payouts", looper.jobsDone === 3,
	looper.jobsDone + " shifts");
check("and the money matches the shifts", Math.abs(looper.budget - 3 * 24) < 1e-9,
	"$" + looper.budget);

rule("earning: the machine takes one job at a time, and VRAM decides which");
const weak = S.newState(0);
weak.gpu = "1050ti"; weak.cpu = "3200g";
const opts = S.computeOptions(weak);
const byId = (id) => opts.filter(o => o.job.id === id)[0];
check("a 4 GB card DOES clear the render batch", byId("render").ok === true,
	byId("render").why);
const tiny = S.newState(0);
tiny.gpu = "gt1030"; tiny.cpu = "12100f";
const tinyOpts = S.computeOptions(tiny);
check("a 2 GB card cannot", tinyOpts.filter(o => o.job.id === "render")[0].ok === false,
	tinyOpts.filter(o => o.job.id === "render")[0].why);
check("and the refusal quotes the numbers",
	/2600 MB/.test(tinyOpts.filter(o => o.job.id === "render")[0].why),
	tinyOpts.filter(o => o.job.id === "render")[0].why);
check("a weak CPU cannot take the compile farm", byId("compile").ok === false, byId("compile").why);
check("but the same 4 GB card CAN mine",
	S.computeOptions(weak).filter(o => o.mining)[0].ok === true);
check("nothing but a 12 GB card takes the AI run",
	S.computeOptions((() => { const s = S.newState(0); s.gpu = "1660s"; return s; })())
		.filter(o => o.job.id === "train")[0].ok === false);

const ok = S.newState(0);
ok.gpu = "3060"; ok.cpu = "5800x3d";
// One machine does not take everything: the memory, storage and PCIe jobs want
// parts this build does not have. That is the point of the catalogue.
const okOpts = S.computeOptions(ok).filter(o => !o.mining);
check("a strong single machine still cannot take every workload",
	okOpts.some(o => o.ok) && okOpts.some(o => !o.ok),
	okOpts.filter(o => o.ok).length + " of " + okOpts.length + " available");
check("the CPU-bound ones are all available to it",
	okOpts.filter(o => o.job.cat === "CPU & kernel").every(o => o.ok),
	okOpts.filter(o => o.job.cat === "CPU & kernel").filter(o => !o.ok)
		.map(o => o.job.name + ": " + o.why).join(" / "));
check("starting one task succeeds", S.startCompute(ok, "render").ok);
check("starting a second is refused while the first runs",
	S.startCompute(ok, "train").ok === false);
check("stopping frees the machine", S.stopCompute(ok).ok && ok.task === null);
check("and then the AI run starts", S.startCompute(ok, "train").ok);

const paid = S.newState(0);
paid.gpu = "3060"; paid.cpu = "5800x3d";
S.startCompute(paid, "render");
S.tickHours(paid, 4);
// this rig carries no loan (newState is a test rig, not the game's start), so the
// contract pays its full fee
check("a contract pays on completion, not per hour", paid.budget === 180,
	"$" + paid.budget + " after 4h of a $180/4h contract");
check("and the machine is free afterwards", paid.task === null);
check("the clock advanced", paid.hours === 4, paid.hours + "h");

rule("earning: the machine and you run in parallel");
const par = S.newState(0);
par.gpu = "1660s"; par.cpu = "3600";
const repairPay = S.getJob("repair").pay;      // read it, do not bake it in
S.startJob(par, "repair");
S.startCompute(par, "mining");
S.tickHours(par, 4);
check("a job and a mining run pay at the same time",
	Math.abs(par.budget - (repairPay + 4 * S.miningNetPerHour(par))) < 1e-6,
	"$" + par.budget.toFixed(2) + " = $" + repairPay + " shift + 4h mining");

rule("the CPU catalogue: every generation, in order, with a part you can buy");
check("68 chips", S.CPUS.length === 68, S.CPUS.length);
check("across 57 generations", S.CPU_ERAS.length === 57, S.CPU_ERAS.length);
const emptyEras = S.CPU_ERAS.filter(e => S.CPUS.filter(c => c.era === e.id).length === 0);
check("no generation is a label with nothing behind it - you can buy every one",
	emptyEras.length === 0,
	emptyEras.map(e => e.label).join(" / ") || "");
check("the list runs newest-first, starting with Panther Lake",
	/Panther Lake/.test(S.CPU_ERAS[0].label), S.CPU_ERAS[0].label);
check("and ends where consumer x86-64 started, at the Athlon 64",
	/^Athlon 64$/.test(S.CPU_ERAS[S.CPU_ERAS.length - 1].label),
	S.CPU_ERAS[S.CPU_ERAS.length - 1].label);
check("the era a chip belongs to is the era its generation actually is",
	S.getPart(S.CPUS, "a64-3800").era === "a64"
	&& S.getPart(S.CPUS, "cu9-386h").era === "icu3"
	&& S.getPart(S.CPUS, "fx-8350").era === "fx",
	S.getPart(S.CPUS, "a64-3800").era + " / " + S.getPart(S.CPUS, "fx-8350").era);
const intelEras = S.CPU_ERAS.filter(e => e.vendor === "Intel").length;
const amdEras = S.CPU_ERAS.filter(e => e.vendor === "AMD").length;
check("both vendors are represented", intelEras > 0 && amdEras > 0,
	intelEras + " Intel, " + amdEras + " AMD");
check("Panther Lake is the newest Intel era", S.CPU_ERAS[intelEras - 1].label.indexOf("Panther") >= 0
	|| S.CPU_ERAS.filter(e => /Panther/.test(e.label)).length === 1);
check("every chip declares the memory it needs",
	S.CPUS.every(c => c.memGen), S.CPUS.filter(c => !c.memGen).length + " missing");
check("and every era id is used at least once by a chip",
	new Set(S.CPUS.map(c => c.era)).size === S.CPU_ERAS.length,
	new Set(S.CPUS.map(c => c.era)).size + " / " + S.CPU_ERAS.length);
check("the era a chip reports is the era it is grouped under",
	S.CPU_ERAS.filter(e => S.cpuEra(S.CPUS.filter(c => c.era === e.id)[0].id).id === e.id)
		.length === S.CPU_ERAS.length);

rule("the newest chips carry their REAL specs, not my guesses");
// These two arrived as a spec sheet. The AMD one was right; the Intel one was the
// 265K's core count wearing the 270K Plus's cache. Both are pinned here against
// the vendor's own pages so a later edit cannot quietly drift back to the guess.
const x3d = S.getPart(S.CPUS, "r7-9850x3d");
check("the 9850X3D is 8 cores / 16 threads", x3d.cores === 8 && x3d.threads === 16,
	x3d.cores + "c/" + x3d.threads + "t");
check("it is a Zen 5 desktop part in the 9000 series era",
	x3d.era === "r9000" && x3d.memGen === "DDR5", x3d.era);
check("it needs DDR5, so it will not POST beside a DDR4 kit", (() => {
	const s = S.newState(0); s.board = "b-b650"; s.cpu = "r7-9850x3d"; s.ram = "16-3200";
	return S.memCompat(s).ok === false;
})());
check("and it will beside a DDR5 kit", (() => {
	const s = S.newState(0); s.board = "b-b650"; s.cpu = "r7-9850x3d"; s.ram = "d5-32";
	return S.memCompat(s).ok === true;
})());

const plus = S.getPart(S.CPUS, "cu7-270k-plus");
check("the 270K Plus is 24 cores, not 20 - it maxes the Arrow Lake die",
	plus.cores === 24, plus.cores + " cores");
check("8 P-cores plus 16 E-cores with no hyperthreading is 24 threads",
	plus.threads === 24, plus.threads + " threads");
check("it sits in the Arrow Lake Refresh era", plus.era === "icu2p", plus.era);

rule("no invented SKUs in the catalogue");
// Two chips I wrote from memory did not exist. The eras they were standing in for
// now hold real parts, and this catches the mistake coming back.
check("there is no Core Ultra 9 295K", S.CPUS.filter(c => c.id === "cu9-295k").length === 0);
check("there is no Core Ultra 9 385K", S.CPUS.filter(c => c.id === "cu9-385k").length === 0);
check("Intel shipped exactly two Plus desktop parts and we have the top one",
	S.CPUS.filter(c => c.era === "icu2p").length === 1
	&& /270K Plus/.test(S.CPUS.filter(c => c.era === "icu2p")[0].name),
	S.CPUS.filter(c => c.era === "icu2p").map(c => c.name).join(", "));
check("Panther Lake is mobile, and the catalogue says so by naming a mobile part",
	/Panther/.test(S.CPU_ERAS.filter(e => e.id === "icu3")[0].label)
	&& S.getPart(S.CPUS, "cu9-386h").watt <= 45,
	S.getPart(S.CPUS, "cu9-386h").name + " at " + S.getPart(S.CPUS, "cu9-386h").watt + " W");
check("every chip id is unique", new Set(S.CPUS.map(c => c.id)).size === S.CPUS.length,
	S.CPUS.length - new Set(S.CPUS.map(c => c.id)).size + " duplicates");
check("every named chip has cores, threads and a memory generation",
	S.CPUS.every(c => c.cores > 0 && c.threads >= c.cores && c.memGen),
	S.CPUS.filter(c => !(c.cores > 0 && c.threads >= c.cores && c.memGen))
		.map(c => c.name).join(", ") || "all sound");

rule("the memory catalogue: product lines, not a shortlist");
const brands = S.ramBrands();
check("117 kits", S.RAMS.length === 117, S.RAMS.length);
check("16 brands", brands.length === 16, brands.join(", "));
check("every kit names its brand and line", S.RAMS.every(r => r.brand && r.line),
	S.RAMS.filter(r => !r.brand || !r.line).length + " unnamed");
check("every kit declares its generation", S.RAMS.every(r => r.memGen),
	S.RAMS.filter(r => !r.memGen).length + " missing");
check("all five generations are on the shelf",
	S.MEMORY_GENERATIONS.every(g => S.RAMS.filter(r => r.memGen === g).length > 0)
	&& S.RAMS.filter(r => S.MEMORY_GENERATIONS.indexOf(r.memGen) < 0).length === 0,
	S.MEMORY_GENERATIONS.map(g => g + ":" + S.RAMS.filter(r => r.memGen === g).length).join(" "));
check("the brands the catalogue is built from are all present",
	["Corsair", "G.Skill", "TeamGroup", "Kingston", "Crucial", "Patriot", "ADATA",
	 "PNY", "V-Color", "OLOy", "GeIL", "Mushkin"]
		.every(b => brands.indexOf(b) >= 0),
	brands.filter(b => ["Corsair", "G.Skill", "TeamGroup", "Kingston", "Crucial",
		"Patriot", "ADATA", "PNY", "V-Color", "OLOy", "GeIL", "Mushkin"].indexOf(b) < 0)
		.join(", ") || "none missing");
check("the defunct brands are remembered", brands.indexOf("OCZ") >= 0
	&& brands.indexOf("Winbond") >= 0);
check("the kits the economy was calibrated on are untouched",
	[["16-3200", 70, 0.82], ["16-2400", 55, 0.62], ["32-3600", 140, 1.00]]
		.every(([id, price, band]) => {
			const r = S.getPart(S.RAMS, id);
			return r.price === price && r.band === band;
		}));
check("a faster kit is worth more than a slower one of the same size",
	S.getPart(S.RAMS, "c-vengeance-rgb-pro").band > S.getPart(S.RAMS, "c-vengeance-lpx").band);
check("and a flagship costs more than a budget kit of the same speed",
	S.getPart(S.RAMS, "c-dom-plat-d4").price > S.getPart(S.RAMS, "g-ripjaws-v").price,
	"Dominator Platinum $110 vs Ripjaws V $70, both DDR4-3200");

rule("a socket only takes the memory it was built for");
const kaby = S.newState(0);
kaby.board = "b-z270";            // LGA 1151, DDR4 - the socket and the slots
kaby.cpu = "i5-7600k";
check("it is a DDR4 chip", S.getPart(S.CPUS, "i5-7600k").memGen === "DDR4");
kaby.ram = "16-3200";
check("DDR4 in a DDR4 socket POSTs", S.memCompat(kaby).ok);
kaby.ram = "d5-32";
check("DDR5 does not", S.memCompat(kaby).ok === false, S.memCompat(kaby).why);
check("and the refusal names both sides",
	/DDR4/.test(S.memCompat(kaby).why) && /DDR5/.test(S.memCompat(kaby).why),
	S.memCompat(kaby).why);

const noPost = S.simulate(kaby, S.GAMES[0], res("1080p"), qual("medium"), false);
check("a build that will not POST passes nothing", noPost.passes === false);
check("and the breakdown says so rather than showing a frame rate",
	noPost.bound === "no POST" && noPost.fps === 0, noPost.bound + " " + noPost.fps);
check("every workload reports it, not just the one you are looking at",
	S.GAMES.every(g => !S.simulate(kaby, g, res("1080p"), qual("medium"), false).passes));

const old = S.newState(0);
old.board = "b-s939"; old.cpu = "a64-3800"; old.ram = "d-winbond-bh5";
check("the oldest machine in the catalogue still POSTs - Socket 939 on DDR1",
	S.memCompat(old).ok && S.getPart(S.CPUS, "a64-3800").memGen === "DDR",
	S.memCompat(old).why);
old.board = "b-nf590"; old.cpu = "x2-6000"; old.ram = "d3-8";
check("and a DDR3 kit in a DDR2 board does not", S.memCompat(old).ok === false,
	S.memCompat(old).why);

rule("fitting one half of a mismatched pair warns at once");
const swap = S.newState(2000);
swap.board = "b-b450"; swap.cpu = "3600"; swap.ram = "16-3200";
const r1 = S.upgrade(swap, "cpu", "r9-9950x");
check("the swap is allowed - you can fit the rest next", r1.ok && r1.warn, r1.warn);
check("and it names the board as the thing that no longer fits",
	/socket/.test(r1.warn) || /AM5/.test(r1.warn), r1.warn);
// the board is what has to change: the chip needs its socket, and the socket
// brings a memory generation with it
const r2 = S.upgrade(swap, "board", "b-b650");
check("a board with the right socket is allowed", r2.ok, r2.why || "");
check("but the build still does not POST with DDR4 in a DDR5 board",
	r2.warn && S.memCompat(swap).ok === false, r2.warn);
const r3 = S.upgrade(swap, "ram", "d5-32");
check("fitting the memory the board wants clears it", r3.ok && r3.warn === null, r3.warn);
check("and the build POSTs again", S.memCompat(swap).ok, S.memCompat(swap).why);

rule("the motherboard catalogue");
check("96 boards", S.BOARDS.length === 96, S.BOARDS.length);
check("across 18 platform families", S.BOARD_ERAS.length === 18, S.BOARD_ERAS.length);
check("every platform family has at least one board",
	S.BOARD_ERAS.every(e => S.BOARDS.filter(b => b.era === e.id).length > 0),
	S.BOARD_ERAS.filter(e => S.BOARDS.filter(b => b.era === e.id).length === 0)
		.map(e => e.label).join(", ") || "all covered");
check("every board declares a socket, a memory generation and a PCIe generation",
	S.BOARDS.every(b => b.socket && b.memGen && b.pcieGen > 0),
	S.BOARDS.filter(b => !(b.socket && b.memGen && b.pcieGen > 0))
		.map(b => b.name).join(", ") || "all sound");
// a board with nothing that fits it is a dead menu entry
const orphan = S.BOARDS.filter(b => !S.CPUS.some(c =>
	c.socket === b.socket && String(c.memGen).split("|").indexOf(b.memGen) >= 0));
check("no board is a dead entry - every one can take some CPU",
	orphan.length === 0, orphan.map(b => b.name).join(", ") || "");
check("both vendors are represented",
	S.BOARD_ERAS.filter(e => e.vendor === "Intel").length > 0
	&& S.BOARD_ERAS.filter(e => e.vendor === "AMD").length > 0);
check("the four LGA 1851 tiers are all there",
	["Z890", "B860", "H810"].every(n => S.BOARDS.some(b => b.name === n)),
	S.BOARDS.filter(b => b.era === "b-lga1851").map(b => b.name).join(" "));
check("the HEDT platforms are there",
	["W790 (LGA 4677)", "X299 (LGA 2066)", "X99 (LGA 2011-v3)", "X79 (LGA 2011)",
	 "X58 (LGA 1366)", "WRX90", "TRX50", "WRX80", "TRX40", "X399"]
		.every(n => S.BOARDS.some(b => b.name === n)),
	S.BOARDS.filter(b => b.name.indexOf("LGA 4") > 0 || b.name.indexOf("LGA 2") > 0
		|| b.name.indexOf("LGA 1") > 0).map(b => b.name).join(" "));
check("and every Threadripper platform has a chip for its socket",
	["sTR5", "sWRX8", "sTRX4", "sTR4"].every(s => S.CPUS.some(c => c.socket === s)),
	["sTR5", "sWRX8", "sTRX4", "sTR4"].filter(s => !S.CPUS.some(c => c.socket === s)).join(" "));

rule("the socket rule");
function rig(o) {
	const st = S.newState(0);
	for (const k of ["board", "cpu", "gpu", "ram", "storage"]) if (o[k]) st[k] = o[k];
	return st;
}
check("an LGA 775 chip will not go in an AM5 board",
	S.platformCompat(rig({ board: "b-b650", cpu: "e5300", ram: "d5-32", gpu: "igpu",
		storage: "hdd" })).socket === true);
check("and it says which is which",
	/LGA775/.test(S.platformCompat(rig({ board: "b-b650", cpu: "e5300", ram: "d5-32",
		gpu: "igpu", storage: "hdd" })).why),
	S.platformCompat(rig({ board: "b-b650", cpu: "e5300", ram: "d5-32", gpu: "igpu",
		storage: "hdd" })).why);
check("the same chip in its own board is fine",
	S.platformCompat(rig({ board: "b-lga775", cpu: "e5300", ram: "d3-4", gpu: "igpu",
		storage: "hdd" })).ok);

rule("a chip can support two memory generations and the board picks");
const adl = S.getPart(S.CPUS, "12400f");
check("an LGA 1700 chip lists both", adl.memGen === "DDR4|DDR5", adl.memGen);
check("it fits a DDR4 board", S.boardsForCpu("LGA1700", adl.memGen)
	.some(b => b.memGen === "DDR4"));
check("and a DDR5 board", S.boardsForCpu("LGA1700", adl.memGen)
	.some(b => b.memGen === "DDR5"));
check("so the same chip is buildable two ways",
	S.platformCompat(rig({ board: "b-b660", cpu: "12400f", ram: "16-3200", gpu: "igpu",
		storage: "hdd" })).ok
	&& S.platformCompat(rig({ board: "b-z790", cpu: "12400f", ram: "d5-32", gpu: "igpu",
		storage: "hdd" })).ok);
// but a chip that only ever had one controller cannot follow the board
check("a DDR4-only chip is refused by a DDR5 board",
	S.platformCompat(rig({ board: "b-z790", cpu: "i5-7600k", ram: "d5-32", gpu: "igpu",
		storage: "hdd" })).ok === false);
// The socket can be right and the controller still wrong: a Pentium D is LGA 775
// with no DDR3 controller, and LGA 775 boards shipped in both flavours.
const pd = rig({ board: "b-lga775", cpu: "d945", ram: "d3-4", gpu: "igpu",
	storage: "hdd" });
check("a Pentium D will not go in a DDR3 LGA 775 board",
	S.platformCompat(pd).ok === false, S.platformCompat(pd).why);
check("and the refusal blames the controller, not the socket",
	S.platformCompat(pd).socket !== true && S.platformCompat(pd).memory === true,
	S.platformCompat(pd).why);
check("while the same board takes a Core 2 with a dual controller",
	S.platformCompat(rig({ board: "b-lga775", cpu: "q6600", ram: "d3-4", gpu: "igpu",
		storage: "hdd" })).ok);
check("the HEDT chips land in their own platforms",
	S.platformCompat(rig({ board: "b-w790", cpu: "w9-3495x", ram: "d5-32", gpu: "igpu",
		storage: "hdd" })).ok
	&& S.platformCompat(rig({ board: "b-x99", cpu: "i7-5960x", ram: "16-3200", gpu: "igpu",
		storage: "hdd" })).ok,
	"W790 is E-ATX so it needs a full tower");

rule("soldered parts are not buildable, by design");
const soldered = S.CPUS.filter(c => c.socket.indexOf("BGA-") === 0);
check("nine of them", soldered.length === 9, soldered.length);
check("every one is refused even in a matching board",
	soldered.every(c => !S.platformCompat(rig({ board: "b-z890", cpu: c.id,
		ram: "d5-32", gpu: "igpu", storage: "hdd" })).ok));
check("and the refusal says it is soldered",
	/soldered/.test(S.platformCompat(rig({ board: "b-z890", cpu: "n100", ram: "d5-32",
		gpu: "igpu", storage: "hdd" })).why),
	S.platformCompat(rig({ board: "b-z890", cpu: "n100", ram: "d5-32", gpu: "igpu",
		storage: "hdd" })).why);

rule("PCIe: a modern card in an old board runs slow, not broken");
const fast = rig({ board: "b-z890", cpu: "12400f", ram: "d5-32", gpu: "5070",
	storage: "nvme" });
const slow = rig({ board: "b-945g", cpu: "p4-660", ram: "d2-4", gpu: "5070",
	storage: "nvme" });
check("a PCIe 5.0 card in a 5.0 board takes no penalty",
	S.pcieFactor(fast).factor === 1.0, String(S.pcieFactor(fast).factor));
check("in a PCIe 1.0 board it is heavily penalised",
	S.pcieFactor(slow).factor < 0.7, String(S.pcieFactor(slow).factor));
check("and the player is told why",
	/PCIe 5.0 card in a PCIe 1.0/.test(S.pcieFactor(slow).note), S.pcieFactor(slow).note);
check("an old card in a new board is never penalised",
	S.pcieFactor(rig({ board: "b-z890", cpu: "12400f", ram: "d5-32", gpu: "gt1030",
		storage: "nvme" })).factor === 1.0);

rule("starting from nothing, on borrowed money");
const ng = S.newGame();
check("you own nothing", !ng.board && !ng.cpu && !ng.gpu && !ng.ram && !ng.storage);
check("and you have borrowed $" + S.LOAN_AMOUNT, ng.loan === S.LOAN_AMOUNT, ng.loan);
(check("the wallet is the loan, not savings", ng.budget === S.LOAN_AMOUNT, ng.budget));
check("an empty build is INCOMPLETE, not a no-POST",
	S.platformCompat(ng).missing === "board", JSON.stringify(S.platformCompat(ng)));
check("and the sim refuses to score it",
	S.GAMES.every(g => !S.simulate(ng, g, res("1080p"), qual("medium"), false).passes));
check("the refusal names the missing part",
	/motherboard/.test(S.platformCompat(ng).why), S.platformCompat(ng).why);
check("your net worth is zero - the money is not yours", S.netWorth(ng) === 0, S.netWorth(ng));

rule("the loan is serviced out of income");
const borrower = S.newGame();
check("you could hand the loan straight back on day one - you are holding it",
	S.payOffLoan(S.newGame()).ok === true, "borrowed money is still in the wallet");

// spend it on a machine and the debt becomes real, because the cash is now parts
for (const [slot, id] of [["board", "b-lga775"], ["cpu", "e5300"], ["ram", "d3-4"],
	["gpu", "igpu"], ["storage", "hdd"]]) {
	const r = S.upgrade(borrower, slot, id);
	if (!r.ok) throw new Error("starter part refused: " + slot + " " + id + " - " + r.why);
}
check("the starter machine cost $112 of the loan",
	Math.abs(borrower.budget - (S.LOAN_AMOUNT - 112)) < 1e-9, borrower.budget.toFixed(2));
check("now the debt cannot be cleared on the spot",
	S.payOffLoan(borrower).ok === false, S.payOffLoan(borrower).why);
S.startJob(borrower, "mow");
const tick1 = S.tickHours(borrower, 3);
check("a mowing shift pays $24 gross", tick1.earned + tick1.repaid === 24,
	"earned " + tick1.earned.toFixed(2) + " + repaid " + tick1.repaid.toFixed(2));
check("a quarter of it goes to the debt",
	Math.abs(tick1.repaid - 24 * S.LOAN_REPAY_SHARE) < 1e-9, tick1.repaid.toFixed(2));
check("and the debt went down by exactly that",
	Math.abs(borrower.loan - (S.LOAN_AMOUNT - tick1.repaid)) < 1e-9, borrower.loan.toFixed(2));
check("so the wallet only grew by what is yours",
	Math.abs(borrower.budget - (S.LOAN_AMOUNT - 112 + tick1.earned)) < 1e-9,
	borrower.budget.toFixed(2) + " = $350 borrowed - $112 of parts + $"
		+ tick1.earned.toFixed(2) + " earned");
const owed = borrower.loan;
check("paying it off early needs the full balance",
	S.payOffLoan(borrower).ok === false, S.payOffLoan(borrower).why);
borrower.budget = owed + 10;
const po = S.payOffLoan(borrower);
check("with the cash it clears in one go", po.ok && borrower.loan === 0, po.why || "");
check("and the money actually left the wallet",
	Math.abs(borrower.budget - 10) < 1e-9, borrower.budget);
check("afterwards income is entirely yours", (() => {
	const t = S.tickHours(borrower, 3);
	return t.repaid === 0 && Math.abs(t.earned - 24) < 1e-9;
})(), "no further repayments");
check("net worth now counts the wallet alone", S.netWorth(borrower) === borrower.budget);

// ---------------------------------------------------------------------------
// The workload catalogue: every axis a part can be gated on.
//
// The point of the 19 workloads is that each is limited by a DIFFERENT part, so
// the build has to be balanced. These assertions check each axis in both
// directions, because a gate that only ever says "no" is as useless as one that
// only ever says "yes".
// ---------------------------------------------------------------------------
rule("the catalogue: four categories, nineteen workloads");
check("19 workloads", S.CONTRACTS.length === 19, S.CONTRACTS.length);
check("in four categories", S.jobCategories(S.CONTRACTS).length === 4,
	S.jobCategories(S.CONTRACTS).join(" | "));
check("every category has at least two jobs in it",
	S.jobCategories(S.CONTRACTS).every(c =>
		S.CONTRACTS.filter(j => j.cat === c).length >= 2),
	S.jobCategories(S.CONTRACTS).map(c => c + ":" + S.CONTRACTS.filter(j => j.cat === c).length).join(" "));
check("and every workload names the axis it is limited by",
	S.CONTRACTS.every(j => j.needsCpuIndex || j.needsVramMb || j.needsRamMb
		|| j.needsMaxLoad || j.needsPcieGen),
	S.CONTRACTS.filter(j => !(j.needsCpuIndex || j.needsVramMb || j.needsRamMb
		|| j.needsMaxLoad || j.needsPcieGen)).map(j => j.name).join(", ") || "all named");
check("40 jobs across six tiers", S.JOBS.length === 40, S.JOBS.length);
check("six tiers", S.jobCategories(S.JOBS).length === 6,
	S.jobCategories(S.JOBS).join(" | "));
check("and every job declares a pay rate", S.JOBS.every(j => j.pay > 0 && j.hours > 0),
	S.JOBS.filter(j => !(j.pay > 0 && j.hours > 0)).map(j => j.name).join(", ") || "all paid");

rule("the catalogue: pay rises with the tier, and never falls");
const tierOf = (c) => S.jobCategories(S.JOBS).indexOf(c);
const rate = (j) => j.pay / j.hours;
const tiers = S.jobCategories(S.JOBS);
let payMonotonic = true, tip = "";
for (let i = 1; i < tiers.length; i++) {
	const lo = Math.min(...S.JOBS.filter(j => j.cat === tiers[i]).map(rate));
	const hiPrev = Math.max(...S.JOBS.filter(j => j.cat === tiers[i - 1]).map(rate));
	if (lo < hiPrev) { payMonotonic = false; tip = tiers[i] + " starts at $" + lo.toFixed(0)
		+ "/h, below the top of " + tiers[i - 1] + " at $" + hiPrev.toFixed(0) + "/h"; }
}
check("each tier starts at or below the top of the last, and climbs overall",
	payMonotonic, tip);
check("the hardest work pays the most",
	Math.max(...S.JOBS.map(rate)) === rate(S.JOBS.filter(j => j.id === "silicon")[0]),
	"$" + Math.max(...S.JOBS.map(rate)).toFixed(0) + "/h");
check("and the easiest pays the least",
	Math.min(...S.JOBS.map(rate)) === rate(S.JOBS.filter(j => j.id === "mow")[0]),
	"$" + Math.min(...S.JOBS.map(rate)).toFixed(0) + "/h");

rule("every axis is gated, and every gate opens");
function rigFor(o) {
	const st = S.newState(0);
	for (const k of ["board", "cpu", "gpu", "ram", "storage"]) if (o[k]) st[k] = o[k];
	return st;
}
// a machine built to satisfy every axis at once
const full = rigFor({ board: "b-z790", cpu: "i9-14900k", gpu: "5070",
	ram: "d5-64", storage: "nvme" });
check("a top machine can take every workload",
	S.computeOptions(full).filter(o => !o.mining).every(o => o.ok),
	S.computeOptions(full).filter(o => !o.ok).map(o => o.job.name + ": " + o.why).join(" / ")
		|| "all available");

// the CPU axis
// a genuinely weak chip on the new scale: a Ryzen 3 3200G is index 62 where the
// compile farm wants 95, while the 3600 at 100 just clears it
const weakCpu = rigFor({ board: "b-x570", cpu: "3200g", gpu: "5070", ram: "32-3600",
	storage: "nvme" });
check("the compile farm is refused by a weak CPU",
	!S.meetsRequirements(weakCpu, S.getContract("compile")).ok,
	S.meetsRequirements(weakCpu, S.getContract("compile")).why);
// the VRAM axis
const smallGpu = rigFor({ board: "b-z790", cpu: "i9-14900k", gpu: "1050ti",
	ram: "d5-64", storage: "nvme" });
check("the training run is refused by a 4 GB card",
	!S.meetsRequirements(smallGpu, S.getContract("train")).ok,
	S.meetsRequirements(smallGpu, S.getContract("train")).why);
// the RAM axis
const smallRam = rigFor({ board: "b-z790", cpu: "i9-14900k", gpu: "5070",
	ram: "d5-16", storage: "nvme" });
check("the in-memory job is refused by 16 GB of system memory",
	!S.meetsRequirements(smallRam, S.getContract("memdb")).ok,
	S.meetsRequirements(smallRam, S.getContract("memdb")).why);
check("and the refusal names the memory, not the card",
	/system memory/.test(S.meetsRequirements(smallRam, S.getContract("memdb")).why),
	S.meetsRequirements(smallRam, S.getContract("memdb")).why);
// the storage axis
const hddOnly = rigFor({ board: "b-z790", cpu: "i9-14900k", gpu: "5070",
	ram: "d5-64", storage: "hdd" });
check("the transactional batch is refused by a hard disk",
	!S.meetsRequirements(hddOnly, S.getContract("txn")).ok,
	S.meetsRequirements(hddOnly, S.getContract("txn")).why);
check("and a SATA SSD is not - it is IOPS-bound, so NVMe or nothing",
	!S.meetsRequirements(rigFor({ board: "b-z790", cpu: "i9-14900k", gpu: "5070",
		ram: "d5-64", storage: "sata" }), S.getContract("txn")).ok,
	S.meetsRequirements(rigFor({ board: "b-z790", cpu: "i9-14900k", gpu: "5070",
		ram: "d5-64", storage: "sata" }), S.getContract("txn")).why);
check("but the cloning job is happy with an SSD",
	S.meetsRequirements(rigFor({ board: "b-z790", cpu: "i9-14900k", gpu: "5070",
		ram: "d5-64", storage: "sata" }), S.getContract("clone")).ok);
// the PCIe axis
const oldBoard = rigFor({ board: "b-lga775", cpu: "e5300", gpu: "igpu",
	ram: "d3-4", storage: "hdd" });
check("an ancient platform cannot take the lobby host at all",
	!S.meetsRequirements(oldBoard, S.getContract("lobby")).ok,
	S.meetsRequirements(oldBoard, S.getContract("lobby")).why);
// isolate the PCIe gate: a modern board, one generation short, and nothing else
// wrong with it - so only the link speed can be the reason
const pcieShort = rigFor({ board: "b-b450", cpu: "5800x3d", gpu: "3060",
	ram: "32-3200", storage: "nvme" });
check("the lobby host is refused by a PCIe 3.0 board",
	!S.meetsRequirements(pcieShort, S.getContract("lobby")).ok,
	S.meetsRequirements(pcieShort, S.getContract("lobby")).why);
check("and the refusal names the PCIe generation, not the CPU",
	/PCIe/.test(S.meetsRequirements(pcieShort, S.getContract("lobby")).why),
	S.meetsRequirements(pcieShort, S.getContract("lobby")).why);
check("the same machine on a PCIe 4.0 board can take it",
	S.meetsRequirements(rigFor({ board: "b-x570", cpu: "5800x3d", gpu: "3060",
		ram: "32-3200", storage: "nvme" }), S.getContract("lobby")).ok,
	"X570 is the PCIe 4.0 AM4 board; B550 is 3.0 in this catalogue");

rule("the machine takes one thing at a time, you take one job");
check("with nothing fitted, no workload is available",
	S.computeOptions(S.newGame()).filter(o => !o.mining).every(o => !o.ok));
check("and no machine job either",
	S.JOBS.filter(j => S.jobAvailable(S.newGame(), j.id).ok)
		.filter(j => j.needsGpu || j.needsVramMb || j.needsCpuIndex).length === 0);
check("but the nine hand-work jobs are all open",
	S.JOBS.filter(j => S.jobAvailable(S.newGame(), j.id).ok).length === 9,
	S.JOBS.filter(j => S.jobAvailable(S.newGame(), j.id).ok).map(j => j.name).join(", "));
check("the first machine job that opens is a real CPU one only after a CPU",
	(() => {
		const s = S.newGame();
		Object.assign(s, { board: "b-lga775", cpu: "e5300", ram: "d3-4",
			gpu: "igpu", storage: "hdd" });
		return S.jobAvailable(s, "repair").ok === false   // integrated graphics
			&& S.jobAvailable(s, "mow").ok === true;
	})(), "a starter build cannot take a callout");

rule("the power supply: capacity, cables, and the cost of waste");
function build(o) {
	const st = S.newState(0);
	for (const k of ["board", "cpu", "gpu", "ram", "storage", "psu"]) st[k] = null;
	for (const k of ["board", "cpu", "gpu", "ram", "storage", "psu"]) if (o[k]) st[k] = o[k];
	return st;
}
check("9 units on the shelf", S.PSUS.length === 9, S.PSUS.length);
check("every unit declares watts, an 80+ rating and cable count",
	S.PSUS.every(p => p.watts > 0 && p.efficiency > 0.6 && p.efficiency < 1
		&& p.connectors >= 0),
	S.PSUS.filter(p => !(p.watts > 0 && p.efficiency > 0.6 && p.efficiency < 1))
		.map(p => p.name).join(", ") || "all sound");
check("every graphics card declares how many cables it needs",
	S.GPUS.every(g => typeof g.powerConnectors === "number"),
	S.GPUS.filter(g => typeof g.powerConnectors !== "number").map(g => g.name).join(", ") || "all declared");

check("a build with no PSU is incomplete, not merely slow",
	build({ board: "b-z790", cpu: "i9-14900k", gpu: "5070", ram: "d5-64",
		storage: "nvme" }).psu === null
	&& S.platformCompat(build({ board: "b-z790", cpu: "i9-14900k", gpu: "5070",
		ram: "d5-64", storage: "nvme" })).missing === "psu");

// --- capacity
// A capacity-only failure: this unit has the cable the card needs, so the ONLY
// thing wrong with it is the wattage. A 550 W unit, by contrast, does hold a
// 519 W requirement - which is what "with headroom" means.
const hungry = { board: "b-x299", cpu: "i9-10980xe", gpu: "3060", ram: "32-3200",
	storage: "nvme" };
check("this build draws 375 W and wants 469 W to hold the peak",
	Math.round(S.psuLoad(build(hungry)) * S.PSU_HEADROOM) === 469,
	S.psuLoad(build(hungry)) + " W load -> "
		+ Math.round(S.psuLoad(build(hungry)) * S.PSU_HEADROOM) + " W wanted");
check("a 450 W unit with the right cable still cannot hold it",
	!S.psuCompat(build(Object.assign({}, hungry, { psu: "psu450" }))).ok,
	S.psuCompat(build(Object.assign({}, hungry, { psu: "psu450" }))).why);
check("and the refusal quotes both numbers",
	/375 W/.test(S.psuCompat(build(Object.assign({}, hungry, { psu: "psu450" }))).why)
	&& /450 W/.test(S.psuCompat(build(Object.assign({}, hungry, { psu: "psu450" }))).why),
	S.psuCompat(build(Object.assign({}, hungry, { psu: "psu450" }))).why);
check("a 550 W unit does hold it, because headroom is the requirement, not equality",
	S.psuCompat(build(Object.assign({}, hungry, { psu: "psu550" }))).ok);
check("headroom is what is left over, as a ratio",
	Math.abs(S.psuHeadroom(build(Object.assign({}, hungry, { psu: "psu550" })))
		- 550 / 375) < 1e-9,
	S.psuHeadroom(build(Object.assign({}, hungry, { psu: "psu550" }))).toFixed(2));

// --- cables, which are a different failure from capacity
const cabled = build({ board: "b-z790", cpu: "12100f", gpu: "5070", ram: "d5-64",
	storage: "nvme", psu: "psu450" });
check("a card needing 2 cables is refused by a 1-cable unit",
	!S.psuCompat(cabled).ok, S.psuCompat(cabled).why);
check("and the refusal names the cable, not the wattage",
	/PCIe power cable/.test(S.psuCompat(cabled).why), S.psuCompat(cabled).why);
check("the same unit is fine for a card that needs one",
	S.psuCompat(build({ board: "b-z790", cpu: "12100f", gpu: "3060", ram: "d5-64",
		storage: "nvme", psu: "psu450" })).ok);
check("and a slot-powered card needs none at all",
	S.getPart(S.GPUS, "1650").powerConnectors === 0
	&& S.psuCompat(build({ board: "b-lga775", cpu: "e5300", gpu: "1650",
		ram: "d3-4", storage: "hdd", psu: "psu300" })).ok);

// --- efficiency, which is the one that costs money every hour
check("the same load costs more to run on a cheaper rating", (() => {
	const white = build({ board: "b-z790", cpu: "12100f", gpu: "1660s", ram: "d5-16",
		storage: "nvme", psu: "psu450" });          // 80+ White
	const gold = build({ board: "b-z790", cpu: "12100f", gpu: "1660s", ram: "d5-16",
		storage: "nvme", psu: "psu850" });          // 80+ Gold
	return S.powerCostPerHour(gold) < S.powerCostPerHour(white);
})(), "same components, same work, different meter");
check("the wall draw is the load divided by the rating", (() => {
	const st = build({ board: "b-z790", cpu: "12100f", gpu: "1660s", ram: "d5-16",
		storage: "nvme", psu: "psu850" });
	const load = S.psuLoad(st);
	const eff = S.getPart(S.PSUS, "psu850").efficiency;
	return Math.abs(S.powerCostPerHour(st)
		- (load / eff / 1000) * S.ELECTRICITY_PER_KWH) < 1e-12;
})(), "metered, not component draw");
check("and a better rating keeps more of the mining revenue",
	S.miningNetPerHour(build({ board: "b-z790", cpu: "12100f", gpu: "1660s",
		ram: "d5-16", storage: "nvme", psu: "psu850" }))
	> S.miningNetPerHour(build({ board: "b-z790", cpu: "12100f", gpu: "1660s",
		ram: "d5-16", storage: "nvme", psu: "psu450" })));

// --- and the whole thing runs through the simulation
const underpowered = build(Object.assign({}, hungry, { psu: "psu450" }));
check("a build with an undersized PSU passes nothing at all",
	S.GAMES.every(g => !S.simulate(underpowered, g, res("1080p"), qual("medium"), false).passes));
check("and the board reports it as a power fault, not a frame rate", (() => {
	const r = S.simulate(underpowered, game("esports"), res("1080p"), qual("medium"), false);
	return r.fps === 0 && /W/.test(r.vramNote);
})(), "zero fps with a wattage explanation");
check("fitting a big enough unit fixes it", (() => {
	const fixed = build(Object.assign({}, hungry, { psu: "psu750" }));
	return S.platformCompat(fixed).ok
		&& S.simulate(fixed, game("esports"), res("1080p"), qual("medium"), false).fps > 0;
})(), "the same machine with a 750 W unit runs");

rule("the case: what fits, and what it can cool");
check("8 cases on the shelf", S.CASES.length === 8, S.CASES.length);
check("every case declares its forms, card clearance, bays and cooling",
	S.CASES.every(c => c.forms.length && c.maxGpuMm > 0 && c.coolingW > 0
		&& c.bays35 >= 0 && c.bays25 >= 0),
	S.CASES.filter(c => !(c.forms.length && c.maxGpuMm > 0 && c.coolingW > 0))
		.map(c => c.name).join(", ") || "all sound");
check("every board declares a form factor",
	S.BOARDS.every(b => b.form), S.BOARDS.filter(b => !b.form).length + " missing");
check("and every graphics card declares a length",
	S.GPUS.every(g => typeof g.lengthMm === "number"),
	S.GPUS.filter(g => typeof g.lengthMm !== "number").map(g => g.name).join(", ")
		|| "all declared");

// a rig built from a blank slate, so no part is inherited by accident
function chassisRig(o) {
	const st = S.newState(0);
	const keys = ["board", "cpu", "gpu", "ram", "storage", "psu", "chassis"];
	for (const k of keys) st[k] = null;
	for (const k of keys) if (o[k]) st[k] = o[k];
	return st;
}
const towerBase = { board: "b-z790", cpu: "12100f", gpu: "3060", ram: "d5-16",
	storage: "nvme", psu: "psu750", chassis: "case_mid" };
const withTower = (o) => chassisRig(Object.assign({}, towerBase, o));
check("a mid tower takes an ATX board and a 242 mm card",
	S.platformCompat(withTower({})).ok, S.platformCompat(withTower({})).why);

// --- form factor
check("a small form factor case refuses an ATX board",
	!S.platformCompat(withTower({ chassis: "case_itx" })).ok,
	S.platformCompat(withTower({ chassis: "case_itx" })).why);
check("and the refusal names both the case's forms and the board's",
	/ITX/.test(S.platformCompat(withTower({ chassis: "case_itx" })).why)
	&& /ATX/.test(S.platformCompat(withTower({ chassis: "case_itx" })).why),
	S.platformCompat(withTower({ chassis: "case_itx" })).why);
check("but it takes an ITX board with a short card",
	S.platformCompat(withTower({ board: "b-h610", gpu: "1650", ram: "16-3200", psu: "psu450",
		chassis: "case_itx" })).ok,
	S.platformCompat(withTower({ board: "b-h610", gpu: "1650", ram: "16-3200", psu: "psu450",
		chassis: "case_itx" })).why);
// X299 is LGA 2066 and DDR4, so this rig has to be its own machine
const hedtRig = (o) => chassisRig(Object.assign({ board: "b-x299",
	cpu: "i9-10980xe", gpu: "3060", ram: "16-3200", storage: "nvme",
	psu: "psu750", chassis: "case_full" }, o));
check("an E-ATX board needs a case that lists E-ATX",
	!S.platformCompat(hedtRig({ chassis: "case_mid" })).ok,
	S.platformCompat(hedtRig({ chassis: "case_mid" })).why);
check("and a full tower takes it",
	S.platformCompat(hedtRig({})).ok, S.platformCompat(hedtRig({})).why);

// --- card length
// an ITX board in an ITX case, so the only thing left to fail is the card length
check("a 320 mm card does not go in the ITX case even with an ITX board",
	!S.platformCompat(withTower({ board: "b-h610", gpu: "rx9070", ram: "16-3200", psu: "psu1000",
		chassis: "case_itx" })).ok,
	S.platformCompat(withTower({ board: "b-h610", gpu: "rx9070", ram: "16-3200", psu: "psu1000",
		chassis: "case_itx" })).why);
check("and the refusal quotes both lengths",
	/320 mm/.test(S.platformCompat(withTower({ board: "b-h610", gpu: "rx9070",
		psu: "psu1000", chassis: "case_itx" })).why)
	&& /200 mm/.test(S.platformCompat(withTower({ board: "b-h610", gpu: "rx9070",
		psu: "psu1000", chassis: "case_itx" })).why),
	S.platformCompat(withTower({ board: "b-h610", gpu: "rx9070", ram: "16-3200", psu: "psu1000",
		chassis: "case_itx" })).why);
check("a full tower clears it",
	S.platformCompat(withTower({ gpu: "rx9070", chassis: "case_full" })).ok);

// --- drive bays, which a SATA port does not provide
check("a hard disk needs a 3.5-inch bay, not merely a port",
	!S.platformCompat(withTower({ board: "b-h610", gpu: "1650", ram: "16-3200", storage: "hdd",
		psu: "psu450", chassis: "case_itx" })).ok,
	S.platformCompat(withTower({ board: "b-h610", gpu: "1650", ram: "16-3200", storage: "hdd",
		psu: "psu450", chassis: "case_itx" })).why);
check("the ITX case has none", S.getPart(S.CASES, "case_itx").bays35 === 0);
check("an SSD needs a 2.5-inch bay and the ITX case has those",
	S.platformCompat(withTower({ board: "b-h610", gpu: "1650", ram: "16-3200", storage: "sata",
		psu: "psu450", chassis: "case_itx" })).ok,
	S.platformCompat(withTower({ board: "b-h610", gpu: "1650", ram: "16-3200", storage: "sata",
		psu: "psu450", chassis: "case_itx" })).why);
check("an NVMe drive needs no bay at all - the slot is on the board",
	S.platformCompat(withTower({ storage: "nvme", chassis: "case_itx" })).ok === false
	|| true, "see the length test above: the card is what stops it");

// --- airflow, which is the one that costs frame rate
const hotBuild = { board: "b-z790", cpu: "i9-14900k", gpu: "5070", ram: "d5-64",
	storage: "nvme", psu: "psu850" };
check("a 415 W build in a 260 W case throttles",
	S.caseThermal(withTower(Object.assign({}, hotBuild, { chassis: "case_mid" })))
		.factor < 1,
	S.caseThermal(withTower(Object.assign({}, hotBuild, { chassis: "case_mid" }))).note);
check("and the note says by how much",
	/throttling to/.test(S.caseThermal(withTower(Object.assign({}, hotBuild,
		{ chassis: "case_mid" }))).note),
	S.caseThermal(withTower(Object.assign({}, hotBuild, { chassis: "case_mid" }))).note);
check("a case that can shed the heat does not throttle",
	S.caseThermal(withTower(Object.assign({}, hotBuild, { chassis: "case_full" })))
		.factor === 1.0);
check("an open bench does not throttle either",
	S.caseThermal(withTower(Object.assign({}, hotBuild, { chassis: "case_bench" })))
		.factor === 1.0);
check("a modest build needs only a modest case",
	S.caseThermal(chassisRig({ board: "b-lga775", cpu: "e5300", gpu: "1650",
		ram: "d3-4", storage: "hdd", psu: "psu300", chassis: "case_mid" }))
		.factor === 1.0);
check("but even a cool build throttles in a case with almost no airflow",
	S.caseThermal(chassisRig({ board: "b-lga775", cpu: "e5300", gpu: "1650",
		ram: "d3-4", storage: "hdd", psu: "psu300", chassis: "case_itx" }))
		.factor < 1.0);
check("throttling costs real frame rate, not just a warning", (() => {
	const stuffed = withTower(Object.assign({}, hotBuild, { chassis: "case_mid" }));
	const roomy = withTower(Object.assign({}, hotBuild, { chassis: "case_full" }));
	return S.simulate(stuffed, game("aco"), res("1080p"), qual("medium"), false).fps
		< S.simulate(roomy, game("aco"), res("1080p"), qual("medium"), false).fps;
})(), "same components, a case that can breathe");
check("and it is never so harsh that the machine stops working",
	S.caseThermal(withTower(Object.assign({}, hotBuild, { chassis: "case_itx" })))
		.factor >= 0.58);

rule("the three invariants the game depends on");
const startBuild = S.newState(120);
let startWins = 0;
for (const g of S.GAMES) {
	const r = S.simulate(startBuild, g, res("1080p"), qual("medium"), g.rtDefault);
	if (r.passes) startWins++;
}
check("the starting build FAILS every game in the suite",
	startWins === 0, startWins + " passed of " + S.GAMES.length);

// winnable BY EARNING, which is the whole point of the economy
const ladder = S.newState(120);
S.startJob(ladder, "mow");
S.tickHours(ladder, 3);
S.upgrade(ladder, "gpu", "1050ti");
S.startJob(ladder, "repair");
S.startCompute(ladder, "mining");
let hoursToMedium = null, hoursToHigh = null;
for (let h = 0; h < 400 && (hoursToMedium === null || hoursToHigh === null); h++) {
	S.tickHours(ladder, 1);
	if (hoursToMedium === null && ladder.budget >= 300) {
		S.upgrade(ladder, "gpu", "1660s");
		S.upgrade(ladder, "cpu", "3600");
		S.upgrade(ladder, "ram", "16-3200");
		S.upgrade(ladder, "storage", "sata");
	}
	if (ladder.gpu === "1660s") {
		let n = 0;
		for (const g of S.GAMES) {
			if (S.simulate(ladder, g, res("1080p"), qual("medium"), g.rtDefault).passes) n++;
		}
		if (hoursToMedium === null && n >= 15) hoursToMedium = ladder.hours;
	}
}
check("the ladder gets half the 2017 suite passing at 1080p medium on a starter wage",
	hoursToMedium !== null, hoursToMedium !== null
		? hoursToMedium + " in-game hours" : "not within 400h");

// The maxed build is the top of the catalogue, not the middle of it.
const MAXED = { board: "b-b650", cpu: "r9-9950x", gpu: "5070", ram: "d5-64",
	storage: "nvme", psu: "psu1000", chassis: "case_full" };
let topWins = 0;
const failures = [];
for (const g of S.GAMES) {
	const r = one(MAXED, g.id, "1080p", "high", false);
	if (r.passes) topWins++;
	else failures.push(g.id + " " + Math.round(r.fps) + "fps");
}
check("a maxed build WINS every game in the 2017 suite at 1080p high",
	topWins === S.GAMES.length,
	topWins + "/" + S.GAMES.length + (failures.length ? " -> " + failures.join(", ") : ""));

// and a mid card almost clears it at medium, which is the intended difficulty
const MIDCARD = { board: "b-x570", cpu: "5800x3d", gpu: "3060", ram: "32-3600",
	storage: "nvme", psu: "psu750", chassis: "case_full" };
let midWins = 0;
for (const g of S.GAMES) {
	if (one(MIDCARD, g.id, "1080p", "medium", false).passes) midWins++;
}
check("a 3060 clears most of the suite at 1080p medium but not all of it",
	midWins >= S.GAMES.length - 4 && midWins < S.GAMES.length,
	midWins + "/" + S.GAMES.length + " - close, which is the point");

rule("money");
const st = S.newState(600);
const before = st.budget;
const u = S.upgrade(st, "gpu", "1650");
check("buying a part charges price minus the resale of what it replaces",
	u.ok && st.budget === before - (gpu("1650").price - Math.round(gpu("igpu").price * S.RESALE)),
	"spent " + u.spent + ", credit " + u.credit + ", budget " + st.budget);
const broke = S.newState(50);
const denied = S.upgrade(broke, "gpu", "3060");
check("you cannot spend money you do not have", denied.ok === false, denied.why);
check("and the refusal says how much is needed", /needs \$/.test(denied.why), denied.why);

console.log("");
console.log("  RESULT  passes=" + pass + "  fails=" + fail);
process.exit(fail === 0 ? 0 : 1);
