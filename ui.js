/* PCForge UI. Reads the simulation core, writes DOM. No game rules live here.
 *
 * The design rule that matters: every number shown must be traceable to the
 * term that produced it. The breakdown panel prints the demand arithmetic and
 * the frame-rate components rather than a single score, because the point of
 * the thing is that a player learns WHICH part is holding them back.
 */
(function () {
	"use strict";
	const S = window.SimCore;
	const $ = (id) => document.getElementById(id);

	// You start with nothing but a loan. See S.newGame.
	let state = S.newGame();
	let sel = { game: "esports", res: "1080p", qual: "medium", rt: false };
	let openSlot = null;

	const SLOT_LABEL = { board: "Motherboard", cpu: "CPU", gpu: "Graphics",
		ram: "Memory", storage: "Storage", psu: "Power", chassis: "Case" };
	const SLOT_ORDER = ["board", "cpu", "gpu", "ram", "storage", "psu", "chassis"];

	// The CPU market is grouped by generation and the memory market by brand,
	// because a flat list of 63 chips or 117 kits is a wall, not a choice.
	function marketGroups(slot) {
		const list = S.partLists()[slot];
		if (slot === "gpu") {
			// 217 cards ungrouped is a wall, so they are grouped by the era that
			// produced them - which is also how you would shop for one.
			const BANDS = [
				{ label: "Pre-3D accelerators (1993-1998)", lo: 0, hi: 1998 },
				{ label: "The first 3D cards (1999-2005)", lo: 1999, hi: 2005 },
				{ label: "The shader era (2006-2012)", lo: 2006, hi: 2012 },
				{ label: "Modern (2013-2019)", lo: 2013, hi: 2019 },
				{ label: "Current (2020 onwards)", lo: 2020, hi: 9999 },
			];
			const out = [];
			for (const b of BANDS) {
				const parts = list.filter(p => (p.year || 2019) >= b.lo
					&& (p.year || 2019) <= b.hi);
				if (parts.length) out.push({ label: b.label, parts: parts });
			}
			return out;
		}
		if (slot === "board") {
			const out = [];
			for (const era of S.BOARD_ERAS) {
				const parts = list.filter(p => p.era === era.id);
				if (parts.length) out.push({ label: era.label, parts: parts });
			}
			return out;
		}
		if (slot === "cpu") {
			const out = [];
			for (const era of S.CPU_ERAS) {
				const parts = list.filter(p => p.era === era.id);
				if (parts.length) out.push({ label: era.label, parts: parts });
			}
			return out;
		}
		if (slot === "ram") {
			return S.ramBrands().map(b => ({ label: b, parts: list.filter(p => p.brand === b) }));
		}
		return [{ label: null, parts: list }];
	}

	function log(line, kind) {
		const box = $("log");
		const row = document.createElement("div");
		row.className = "logline " + (kind || "");
		row.textContent = line;
		box.insertBefore(row, box.firstChild);
		while (box.childNodes.length > 60) box.removeChild(box.lastChild);
	}

	// ------------------------------------------------------------- rendering
	function render() {
		$("budget").textContent = "$" + Math.round(state.budget);
		$("debt").textContent = "$" + Math.round(state.loan || 0);
		$("debt").style.color = (state.loan > 0) ? "var(--red)" : "var(--green)";
		const rate = S.incomePerHour(state);
		$("income").textContent = "$" + rate.toFixed(1) + "/h";
		// Time has no switch of its own any more: it runs while you are working.
		// The readout says paused only when nothing is actually driving it.
		$("clock").textContent = state.hours + "h elapsed" + (timer ? "" : "  (paused)");
		$("clock").style.color = timer ? "var(--green)" : "var(--amber)";

		// --- the build slots
		const slots = $("slots");
		slots.innerHTML = "";
		$("buildhead").textContent = "The build" + (state.board
			? "  ·  " + S.getPart(S.BOARDS, state.board).name
			: "  ·  nothing fitted yet");
		for (const slot of SLOT_ORDER) {
			const part = S.getPart(S.partLists()[slot], state[slot]);
			const el = document.createElement("div");
			el.className = "slot" + (openSlot === slot ? " open" : "");
			el.setAttribute("data-slot", slot);
			// An empty slot has no specifications at all, and saying "null MB"
			// is worse than saying nothing.
			const none = !state[slot];
			let spec = "";
			if (none) {
				spec = "nothing fitted";
			} else if (slot === "board") {
				spec = part.socket + "  ·  " + part.memGen + "  ·  PCIe " + part.pcieGen
					+ ".0  ·  " + part.tier;
			} else if (slot === "gpu") {
				const h = S.hagsSupported(part);
				// A card PassMark never scored says so, rather than showing a zero
				// that looks like a measurement.
				spec = part.vramMb + " MB" + (part.shared ? " shared" : "")
					+ "  ·  " + part.arch.toUpperCase()
					+ (part.unscored ? "  ·  no benchmark on record"
						: "  ·  HAGS " + (h.ok ? "capable" : "no"));
				spec = part.vramMb + " MB" + (part.shared ? " shared" : "")
					+ "  ·  " + part.arch.toUpperCase()
					+ "  ·  HAGS " + (h.ok ? "capable" : "no");
			} else if (slot === "cpu") spec = part.cores + "c/" + part.threads + "t  ·  "
				+ part.socket + "  ·  " + (part.memGen || "").replace("|", " / ");
			else if (slot === "chassis") {
				spec = part.forms.join("/") + "  ·  " + part.maxGpuMm + " mm GPU  ·  "
					+ part.coolingW + " W cooling";
			} else if (slot === "psu") {
				const h = S.psuHeadroom(state);
				spec = part.watts + " W  ·  80+ " + Math.round(part.efficiency * 100)
					+ "%  ·  " + part.connectors + " PCIe"
					+ (h > 0 ? "  ·  " + Math.round(S.psuLoad(state)) + " W load" : "");
			}
			else if (slot === "ram") spec = (part.mb / 1024) + " GB @" + part.speed + "  ·  " + part.memGen;
			else spec = "load x" + part.loadFactor.toFixed(1);
			el.innerHTML = '<div class="slothead"><span class="slotlabel">' + SLOT_LABEL[slot]
				+ '</span><span class="slotprice">$' + part.price + '</span></div>'
				+ '<div class="slotname">' + part.name + '</div>'
				+ '<div class="slotspec">' + spec + '</div>';
			el.onclick = () => { openSlot = (openSlot === slot ? null : slot); render(); };
			slots.appendChild(el);

			if (openSlot === slot) {
				const market = document.createElement("div");
				market.className = "market";
				// Would this part sit with the rest of the machine as it stands?
				// Judged by the same rule the simulation uses, so the market and
				// the scoreboard can never disagree about what fits.
				const wouldFit = (opt) => {
					const probe = {};
					for (const k of SLOT_ORDER) probe[k] = state[k];
					probe[slot] = opt.id;
					return S.platformCompat(probe);
				};
				for (const group of marketGroups(slot)) {
				if (group.label) {
					const gh = document.createElement("div");
					gh.className = "mgroup";
					gh.textContent = group.label;
					market.appendChild(gh);
				}
				for (const opt of group.parts) {
					const credit = Math.round(part.price * S.RESALE);
					const cost = opt.price - credit;
					const fit = wouldFit(opt);
					// Only flag a genuine conflict, never an empty slot you have not
					// filled yet - "no CPU fitted" is not this part's fault.
					const mismatched = !fit.ok && !fit.missing;
					const row = document.createElement("div");
					row.className = "mrow" + (opt.id === part.id ? " current" : "")
						+ (mismatched ? " mismatch" : "");
					row.setAttribute("data-id", opt.id);
					row.setAttribute("data-slot", slot);
					let sub = "";
					if (slot === "gpu") {
						const h = S.hagsSupported(opt);
						sub = opt.unscored
							? opt.vramMb + " MB · " + opt.year + " · no score"
							: opt.vramMb + " MB · idx " + opt.index
								+ " · HAGS " + (h.ok ? "yes" : "no");
					} else if (slot === "board") {
						sub = opt.socket + " · " + opt.memGen + " · PCIe " + opt.pcieGen + ".0";
					} else if (slot === "cpu") {
						sub = opt.cores + "c/" + opt.threads + "t · idx " + opt.index
							+ " · " + opt.socket + " · " + opt.memGen.replace("|", "/");
					} else if (slot === "ram") {
						sub = (opt.mb / 1024) + " GB @" + opt.speed + " " + opt.memGen;
					} else if (slot === "psu") {
						sub = opt.watts + " W · 80+ " + Math.round(opt.efficiency * 100)
							+ "% · " + opt.connectors + " PCIe";
					} else if (slot === "chassis") {
						sub = opt.forms.join("/") + " · " + opt.maxGpuMm + " mm · "
							+ opt.coolingW + " W";
					}
					else sub = "x" + opt.loadFactor.toFixed(1) + " load";
					row.innerHTML = '<span class="mname">' + opt.name + '</span>'
						+ '<span class="msub">' + sub + '</span>'
						+ '<span class="mcost">' + (opt.id === part.id ? "installed"
							: (mismatched ? "wont fit"
								: (cost > 0 ? "+$" + cost : "-$" + Math.abs(cost)))) + '</span>';
					if (opt.id !== part.id) {
						row.onclick = (e) => {
							e.stopPropagation();
							const r = S.upgrade(state, slot, opt.id);
							if (r.ok) {
								log("fitted " + opt.name + " for $" + r.spent, "ok");
								if (r.warn) log(r.warn, "bad");
								openSlot = null;
							} else log("cannot fit " + opt.name + ": " + r.why, "bad");
							saveGame();
							render();
						};
					}
					market.appendChild(row);
				}
				}
				slots.appendChild(market);
			}
		}

		// --- the workload board
		const board = $("board");
		board.innerHTML = "";
		let passing = 0;
		for (const g of S.GAMES) {
			const rtOn = sel.rt && g.rtDefault;
			const r = S.simulate(state, g, S.getPart(S.RESOLUTIONS, sel.res),
				S.getPart(S.QUALITY, sel.qual), rtOn);
			if (r.passes) passing++;
			const el = document.createElement("div");
			el.className = "wl " + (r.passes ? "good" : "bad")
				+ (sel.game === g.id ? " sel" : "");
			// when the engine is the ceiling, say so - a 60 next to a 5070 looks like
			// a bug otherwise, and the uncapped figure is the interesting part
			const capNote = r.cap ? '  ·  engine cap ' + r.cap : '';
			el.innerHTML = '<div class="wlname">' + g.name + '</div>'
				+ '<div class="wlnum">' + Math.round(r.fps) + '<span class="unit">fps</span></div>'
				+ '<div class="wlt">target ' + g.targetFps + ' · spike '
				+ r.spikeMs.toFixed(1) + 'ms</div>'
				+ '<div class="wlt">' + (r.cap
					? 'capped at ' + r.cap + ' (would run ' + Math.round(r.uncappedFps) + ')'
					: 'bound: ' + r.bound) + '</div>';
			el.onclick = () => { sel.game = g.id; render(); };
			board.appendChild(el);
		}

		const total = S.GAMES.length;
		const post = S.platformCompat(state);
		$("post").style.display = post.ok ? "none" : "block";
		$("post").textContent = post.ok ? "" : post.why;
		$("goal").textContent = post.ok ? passing + " / " + total + " passing"
			: (post.missing ? "incomplete" : "no POST");
		$("goalbar").style.width = Math.round((passing / total) * 100) + "%";
		$("goalbar").style.background = post.ok ? "var(--green)" : "var(--red)";
		$("win").style.display = (post.ok && passing === total) ? "block" : "none";
		$("wintitle").textContent = "ALL " + total + " PASS";

		// --- the breakdown for the selected workload
		const g = S.getPart(S.GAMES, sel.game);
		const resP = S.getPart(S.RESOLUTIONS, sel.res);
		const qualP = S.getPart(S.QUALITY, sel.qual);
		const rtOn = sel.rt && g.rtDefault;
		const r = S.simulate(state, g, resP, qualP, rtOn);
		const gpu = S.getPart(S.GPUS, state.gpu);
		const d = r.demand;

		$("btitle").textContent = g.name + "  ·  " + resP.name + "  ·  " + qualP.name
			+ (rtOn ? "  ·  RT ON" : "");
		$("demand").innerHTML =
			'<div class="calc"><span>engine</span><b>' + Math.round(d.engine) + ' MB</b></div>'
			+ '<div class="calc"><span>textures</span><b>' + Math.round(d.textures) + ' MB</b></div>'
			+ '<div class="calc"><span>ray tracing</span><b>' + Math.round(d.rt) + ' MB</b></div>'
			+ '<div class="calc"><span>mods</span><b>' + Math.round(d.mods) + ' MB</b></div>'
			+ '<div class="calc total"><span>demand</span><b>' + Math.round(d.total) + ' MB</b></div>'
			+ '<div class="calc"><span>card has</span><b>' + gpu.vramMb + ' MB</b></div>'
			+ (r.overflow > 0
				? '<div class="calc over"><span>over budget</span><b>' + Math.round(r.overflow)
					+ ' MB</b></div>'
				: '<div class="calc under"><span>headroom</span><b>'
					+ Math.round(gpu.vramMb - d.total) + ' MB</b></div>');

		$("fpscalc").innerHTML =
			'<div class="calc"><span>GPU-bound</span><b>' + Math.round(r.gpuFps) + ' fps</b></div>'
			+ '<div class="calc"><span>CPU-bound</span><b>' + Math.round(r.cpuFps) + ' fps</b></div>'
			+ '<div class="calc"><span>VRAM factor</span><b>x'
				+ (r.fps / Math.max(0.001, Math.min(r.gpuFps, r.cpuFps))).toFixed(2) + '</b></div>'
			+ '<div class="calc total"><span>result</span><b>' + Math.round(r.fps) + ' fps</b></div>'
			+ '<div class="calc' + (r.spikeMs > S.STUTTER_MS_BUDGET ? ' over' : '') + '">'
				+ '<span>frame spikes</span><b>' + r.spikeMs.toFixed(1) + ' ms</b></div>'
			+ '<div class="calc"><span>load time</span><b>' + r.loadSeconds.toFixed(1) + ' s</b></div>';

		$("notes").innerHTML =
			(r.post && !r.post.ok ? '<div class="note bad">' + r.post.why + '</div>' : "")
			+ (r.link && r.link.note ? '<div class="note warn">' + r.link.note + '</div>' : "")
			+ (r.thermal && r.thermal.note
				? '<div class="note warn">' + r.thermal.note + '</div>' : "")
			+ (r.vramNote && (!r.post || r.post.ok) ? '<div class="note bad">' + r.vramNote + '</div>' : "")
			+ (r.ramNote ? '<div class="note warn">' + r.ramNote + '</div>' : "")
			+ '<div class="note ' + (r.hags.on ? "good" : "warn") + '">HAGS '
				+ (r.hags.on ? "on" : "off") + " (" + r.hags.gate + "): " + r.hags.why + '</div>';

		renderWork();

		const vramBar = $("vrambar");
		const ctx = vramBar.getContext("2d");
		const W = vramBar.width, H = vramBar.height;
		ctx.clearRect(0, 0, W, H);
		ctx.fillStyle = "#0b0f16";
		ctx.fillRect(0, 0, W, H);
		const frac = Math.min(1.35, d.total / Math.max(1, gpu.vramMb));
		ctx.fillStyle = frac > 1 ? "#f43f5e" : "#10b981";
		ctx.fillRect(2, 2, Math.min(1, frac) * (W - 4), H - 4);
		if (frac > 1) {
			ctx.fillStyle = "#f59e0b";
			ctx.fillRect(W - 6, 2, 4, H - 4);           // the wall, marked
		}
		ctx.fillStyle = "#8290a6";
		ctx.font = "10px Consolas, monospace";
		ctx.fillText("VRAM  " + Math.round(d.total) + " / " + gpu.vramMb + " MB", 6, H - 5);
	}

	// ---------------------------------------------------------- earning
	function money(n) { return "$" + Math.round(n); }

	function jobRate(job) { return job.pay / job.hours; }

	// Starting work starts TIME. The clock used to be a separate control a player
	// had to find, and until they did, taking a job did nothing at all: the card
	// went active and the money never moved.
	function ensureClock() {
		if (timer) return false;
		setRunning(true);
		log("clock started - time is now passing", "info");
		return true;
	}

	// ------------------------------------------------------------ save and load
	// The machine you built is not something to lose because a window closed.
	const SAVE_KEY = "pcforge.save.v1";
	const SAVE_VERSION = 1;

	const store = {
		read() {
			try {
				return (typeof localStorage !== "undefined")
					? localStorage.getItem(SAVE_KEY) : null;
			} catch (e) { return null; }
		},
		write(v) {
			try {
				if (typeof localStorage !== "undefined") localStorage.setItem(SAVE_KEY, v);
			} catch (e) { /* no storage: play on, just without saving */ }
		},
		wipe() {
			try {
				if (typeof localStorage !== "undefined") localStorage.removeItem(SAVE_KEY);
			} catch (e) { /* nothing to wipe */ }
		},
	};

	// A saved part that no longer exists in the catalogue must not silently become
	// a different part. Unknown ids are cleared, and the build reads as incomplete
	// - which is honest - rather than quietly swapping in something else.
	function validId(list, id) {
		if (!id) return null;
		for (const p of list) if (p.id === id) return id;
		return null;
	}

	function saveGame() {
		if (!loaded) return;
		store.write(JSON.stringify({
			v: SAVE_VERSION, state: state, sel: sel, savedAt: Date.now(),
		}));
	}

	function loadGame() {
		const raw = store.read();
		if (!raw) return null;
		let d;
		try { d = JSON.parse(raw); } catch (e) { return null; }
		if (!d || d.v !== SAVE_VERSION || !d.state) return null;
		const st = Object.assign(S.newGame(), d.state);
		const lists = S.partLists();
		for (const k of SLOT_ORDER) st[k] = validId(lists[k], st[k]);
		if (typeof st.budget !== "number" || !isFinite(st.budget)) return null;
		if (typeof st.loan !== "number" || !isFinite(st.loan)) st.loan = 0;
		if (typeof st.hours !== "number" || !isFinite(st.hours)) st.hours = 0;
		return { state: st, sel: Object.assign(sel, d.sel || {}) };
	}

	function renderWork() {
		// --- the machine
		const box = $("compute");
		box.innerHTML = "";
		const options = S.computeOptions(state);
		// grouped by the axis each job is limited by, so the list reads as a lesson
		// in what the parts are for rather than a wall of contracts
		for (const cat of S.jobCategories(S.CONTRACTS)) {
			const inCat = options.filter(o => o.job.cat === cat);
			if (!inCat.length) continue;
			const open = inCat.filter(o => o.ok).length;
			const head = document.createElement("div");
			head.className = "wgroup";
			head.textContent = cat + "  ·  " + open + "/" + inCat.length;
			box.appendChild(head);
			for (const opt of inCat) renderComputeCard(box, opt);
		}
		for (const opt of options.filter(o => o.mining)) renderComputeCard(box, opt);

		// --- you
		const jbox = $("jobs");
		jbox.innerHTML = "";
		for (const cat of S.jobCategories(S.JOBS)) {
			const inCat = S.JOBS.filter(j => j.cat === cat);
			const open = inCat.filter(j => S.jobAvailable(state, j.id).ok).length;
			const head = document.createElement("div");
			head.className = "wgroup";
			head.textContent = cat + "  ·  " + open + "/" + inCat.length;
			jbox.appendChild(head);
			for (const job of inCat) renderJobCard(jbox, job);
		}
	}

	function renderComputeCard(box, opt) {
		{
			const job = opt.job;
			const active = state.task && state.task.id === job.id;
			const el = document.createElement("div");
			el.className = "wcard" + (active ? " active" : "") + (opt.ok ? "" : " locked");
			el.setAttribute("data-work", job.id);
			const pay = opt.mining
				? "$" + Math.max(0, S.miningNetPerHour(state)).toFixed(2) + "/h net"
				: money(job.pay) + " / " + job.hours + "h";
			el.innerHTML =
				'<div class="wtop"><span class="wname">' + job.name + '</span>'
				+ '<span class="wpay">' + pay + '</span></div>'
				+ '<div class="wsub">' + opt.why + '</div>'
				+ '<div class="wblurb">' + job.blurb + '</div>';
			if (active) {
				const done = Math.min(state.task.done, state.task.total || state.task.done);
				el.innerHTML += '<div class="wprog"><i style="width:'
					+ (opt.mining ? 100 : Math.round((done / state.task.total) * 100))
					+ '%"></i></div>';
			}
			const btn = document.createElement("button");
			btn.className = "wbtn" + (active ? " on" : "");
			btn.textContent = active ? "STOP" : "START";
			btn.setAttribute("data-act", "compute");
			btn.onclick = () => {
				if (active) { S.stopCompute(state); log("stopped " + job.name, "info"); }
				else {
					const r = S.startCompute(state, job.id);
					if (r.ok) { log("started " + job.name, "ok"); ensureClock(); }
					else log("cannot start " + job.name + ": " + r.why, "bad");
				}
				render();
			};
			el.appendChild(btn);
			box.appendChild(el);
		}
	}

	// --- you: jobs grouped the same way, because they are a ladder too
	function renderJobCard(jbox, job) {
		{
			const avail = S.jobAvailable(state, job.id);
			const active = state.job && state.job.id === job.id;
			const el = document.createElement("div");
			el.className = "wcard" + (active ? " active" : "") + (avail.ok ? "" : " locked");
			el.setAttribute("data-job", job.id);
			el.innerHTML =
				'<div class="wtop"><span class="wname">' + job.name + '</span>'
				+ '<span class="wpay">' + money(jobRate(job)) + '/h</span></div>'
				+ '<div class="wsub">' + (avail.ok ? money(job.pay) + " per " + job.hours + "h shift"
					: avail.why) + '</div>'
				+ '<div class="wblurb">' + job.blurb + '</div>';
			if (active) {
				el.innerHTML += '<div class="wprog"><i style="width:'
					+ Math.round((state.job.done / state.job.total) * 100) + '%"></i></div>';
			}
			const btn = document.createElement("button");
			btn.className = "wbtn" + (active ? " on" : "");
			btn.textContent = active ? "STOP" : "START";
			btn.setAttribute("data-act", "job");
			btn.onclick = () => {
				if (active) { S.stopJob(state); log("stopped " + job.name, "info"); }
				else {
					// switching jobs is a stop then a start: a player clicking a
					// second job means "do this instead", not "refuse me"
					if (state.job) S.stopJob(state);
					const r = S.startJob(state, job.id);
					if (r.ok) {
						log("started " + job.name + " (" + money(jobRate(job))
							+ "/h, repeating)", "ok");
						ensureClock();
					} else log("cannot take " + job.name + ": " + r.why, "bad");
					saveGame();
				}
				render();
			};
			el.appendChild(btn);
			jbox.appendChild(el);
		}
	}

	// ------------------------------------------------------------- the clock
	// One hour per tick, fixed. There is no speed control: the game is played by
	// deciding what to do with the time, not by choosing how fast it goes.
	const HOURS_PER_TICK = 1;
	let timer = null;
	function tick() {
		const hours = HOURS_PER_TICK;
		const out = S.tickHours(state, hours);
		for (const e of out.events) log(e, "ok");
		// Save EVERY tick. A throttle looked reasonable and was not: at 25 hours a
		// tick, a two-second window is several ticks and thousands of dollars, so
		// "it saves" would still have lost the player money on a bad close. The
		// payload is a couple of kilobytes.
		saveGame();
		if (out.earned > 0 && Math.random() < 0.18) {
			log("income +" + money(out.earned) + "  (cash " + money(state.budget) + ")", "info");
		}
		render();
	}
	function setRunning(on) {
		if (on && !timer) timer = setInterval(tick, 700);
		if (!on && timer) { clearInterval(timer); timer = null; }
	}

	function bind() {
		$("res").innerHTML = S.RESOLUTIONS.map(g =>
			'<option value="' + g.id + '">' + g.name + '</option>').join("");
		$("qual").innerHTML = S.QUALITY.map(g =>
			'<option value="' + g.id + '">' + g.name + '</option>').join("");
		$("res").value = sel.res;
		$("qual").value = sel.qual;
		$("res").onchange = (e) => { sel.res = e.target.value; render(); };
		$("qual").onchange = (e) => { sel.qual = e.target.value; render(); };
		$("rt").onchange = (e) => { sel.rt = e.target.checked; render(); };
		$("payoff").onclick = () => {
			const r = S.payOffLoan(state);
			if (r.ok) log("paid off the loan - $" + Math.round(r.paid)
				+ ". The machine is yours.", "ok");
			else log("cannot pay off the loan: " + r.why, "bad");
			saveGame();
			render();
		};
		$("hags").onchange = (e) => {
			state.hags = e.target.checked;
			log("HAGS " + (state.hags ? "enabled" : "disabled"), "info");
			render();
		};
		$("reset").onclick = () => {
			setRunning(false);
			store.wipe();
			state = S.newGame();
			$("hags").checked = false;
			sel = { game: "esports", res: "1080p", qual: "medium", rt: false };
			$("rt").checked = false; $("res").value = "1080p"; $("qual").value = "medium";
			log("starting over from nothing: $" + S.LOAN_AMOUNT + " borrowed, nothing owned",
				"info");
			saveGame();
			render();
		};
	}

	// The player has no clock control any more - starting work starts time. The
	// headless tests still need to halt it to read a settled state, so that is
	// exposed here rather than re-adding a control nobody should have to find.
	window.PCForgeTest = {
		pause: () => setRunning(false),
		resume: () => setRunning(true),
		tick: () => tick(),
		running: () => !!timer,
	};

	bind();

	// Restore before the first render, so a player never sees a blank machine flash
	// past. A save with work in progress resumes working - that is the point.
	let loaded = false;
	const saved = loadGame();
	if (saved) {
		state = saved.state;
		sel = saved.sel;
		$("res").value = sel.res;
		$("qual").value = sel.qual;
		$("rt").checked = !!sel.rt;
		$("hags").checked = !!state.hags;
		loaded = true;
		log("resumed your saved machine: $" + Math.round(state.budget)
			+ (state.loan > 0 ? " and $" + Math.round(state.loan) + " of debt" : "")
			+ ", " + state.hours + "h in.", "ok");
		if (state.job || state.task) {
			setRunning(true);
			log("it was still working, so the clock is running again.", "info");
		}
	} else {
		loaded = true;
		saveGame();          // a brand-new game is saved from the first moment
	}

	// The last write has to happen as the page goes away, or a player who closes
	// the window mid-shift loses that shift.
	window.addEventListener("beforeunload", saveGame);
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") saveGame();
	});

	bind();
	log("PCForge 1.3 - " + S.BOARDS.length + " motherboards, " + S.CPUS.length
		+ " CPUs across " + S.CPU_ERAS.length + " generations, " + S.RAMS.length
		+ " memory kits across " + S.ramBrands().length + " brands.", "info");
	log("You own nothing. You borrowed $" + S.LOAN_AMOUNT + ", and "
		+ Math.round(S.LOAN_REPAY_SHARE * 100) + "% of everything you earn goes back to it.",
		"info");
	log("Start with a motherboard. It decides which CPU and which memory can go in it, "
		+ "and nothing else fits without it.", "info");
	log("Then take a job - Lawn Mowing needs no hardware, and starting one starts "
		+ "the clock. There is nothing else to switch on.", "info");
	log("Six workloads must all pass at once. Mow lawns until the machine can pay for "
		+ "itself.", "info");
	render();
})();
