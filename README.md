# PCForge

Build a PC, then find the wall it hits.

Six workloads, one budget, and a rule: **every workload must pass at once.** You
start with **nothing** — no machine at all, and $350 you do not own. The game is
working out which part to spend it on, and the answer is not "the fastest GPU".

## Run it

```
LAUNCHER.bat                        the game in a browser app window
webview/PCForge.exe                 the game in its own window (WebView2)
```

## Your machine is saved

Work is written to browser storage as it happens, so closing the window does not
cost you the shift. Reopening says what it found:

```
resumed your saved machine: $418 and $120 of debt, 34h in.
it was still working, so the clock is running again.
```

**START OVER** replaces the save with a fresh game. A saved part that no longer
exists in the catalogue is cleared rather than swapped for something else — the
build reads as incomplete, which is honest, instead of quietly becoming a
different machine.

One real limitation: opened as a plain `file://` page, browser storage is
**undefined behaviour by specification**. Chrome and Edge give every `file:` URL
its own storage area, and it works in practice, but the spec reserves the right to
change that. The WebView2 build (`webview/PCForge.exe`) maps a folder to a virtual
HTTPS host instead, so the game gets a real origin and its storage is guaranteed.

Or open `PCForge.html` directly — it is one self-contained file with no
dependencies, no internet, and no install. `launcher.py` is the same thing
without the packaging.

## How you get money

You start with **$120**, which buys a 2 GB card and nothing else. There are three
ways to earn, and they are not interchangeable:

**Jobs are YOU** — 40 of them, in six tiers. They need no machine time, so they
run while the computer works. The tiers are ordered by what they require, and each
one starts above the ceiling of the last:

```
No hardware needed    3 jobs   $  8 - $ 12/h   mowing, retail, stock control
Side hustle           6 jobs   $ 12 - $ 22/h   car washing, pet sitting, delivery, Amazon Flex
You need a machine    8 jobs   $ 24 - $ 40/h   callouts, setup, helpdesk, microsoldering, field work
A real CPU            7 jobs   $ 42 - $ 55/h   QA, journalism, web dev, sysadmin, DevOps
A serious build      10 jobs   $ 57 - $ 67/h   DBA, data science, cloud, network, pentest, buyers
Engineering           6 jobs   $ 70 - $ 90/h   embedded, PCB, thermal, kernel, drivers, silicon
```

**Workloads are the MACHINE** — 19 of them, in four categories, one at a time.
Every one is gated on the axis it is actually limited by, which is the whole
lesson: the build has to be balanced.

```
CPU & kernel        5   telemetry, log parsing, scheduler, compile farm, cipher batch
GPU & accelerator   6   rasterise, 3D render, CAD viewport, inference, CFD, ML training
Memory & storage    5   in-memory data, ETL load, 8K video, transactional batch, cloning
Networking          3   lobby hosting, live ingest, VPN gateway
```

That means the parts are gated on **five different axes** — CPU index, VRAM,
system memory, drive speed and PCIe generation:

```
compile farm      needs CPU index 55      a 3200G is 20
ML training       needs 10240 MB VRAM     a 12 GB card or nothing
in-memory data    needs 32 GB of RAM      16 GB is refused, by name
transactional     needs NVMe              IOPS-bound: a SATA SSD is not enough
lobby hosting     needs PCIe 4.0          a B450 is 3.0 and is refused

**Mining runs in the background.** It needs a 3072 MB DAG resident in VRAM, so
integrated graphics and a 2 GB card cannot do it at all, and it is metered
against electricity at $0.24/kWh.

**And mining is worth less than working.** Measured at the prices in the game:

```
1650     $1.06/h net      vs  $8/h mowing
1660S    $2.34/h net
3060     $3.03/h net
```

That is the honest relationship and the game does not pretend otherwise: mining
is the thing your machine does *while you are out mowing*, not a replacement for
mowing. Its real value is that it scales with hardware you were going to buy
anyway — and the moment you fit a card, the callout job unlocks and your wage
nearly triples.

There is no speed control and no clock switch. **Starting work starts time**, at
one hour a tick, and jobs repeat until you stop them. The game is played by
deciding what to do with the hours, not by choosing how fast they pass.

## The arc, measured

```
mow 20h .................................. $280, still 0/6
+ fit a 1050 Ti, take callouts, mine ..... 41h  ->  6/6 at 1080p medium
+ render contracts, swap to a 12 GB card . 161h ->  6/6 at 1080p HIGH
```

So the medium win is reachable in about 40 in-game hours on a starter wage, and
the hard win in about 160. Money is the pacing; **VRAM is still the puzzle** —
and the last test in the suite proves it, by buying a 4 GB card with earned money
and showing it cannot clear the set whatever you spend around it.

## Starting from nothing

You own no computer. You have **$350, and it is borrowed.** Until the loan is
clear, a quarter of everything you earn goes back to it — or you can hand it all
back at once with **PAY OFF DEBT**, which is possible on day one because you are
still holding the cash, and stops being possible the moment you spend it on
parts.

The first purchase is the **motherboard**, and that is the order that matters:
the board carries one socket and one memory generation, and the CPU and the
memory both have to agree with it. Nothing else in the build can be chosen
before it.

There are **seven slots**: motherboard, CPU, graphics, memory, storage, **power**
and **case**.

```
G41 / P45 (LGA 775) + Pentium E5300 + 2x2 GB DDR3-1333
  + 300 W unit + compact mATX tower                                  $126
```

That is a real machine, it POSTs, and it passes nothing. Then a card, then a
callout job, then the machine starts paying for itself.

## The power supply

The part that decides whether any of the rest of it runs, on three rules that all
tie into numbers the simulation already had.

**Capacity.** The per-part wattage figures were already there, feeding the cost of
electricity. Now they also decide whether the machine works: a build has to be
covered with headroom, not merely equal to its load.

```
an RTX 5070 + i9-14900K draws about 415 W and wants 519 W to hold the peak
a 550 W unit does hold it. A 450 W unit does not, and says so with both numbers.
```

**Cables.** A card needs a certain number of PCIe power cables, and no wattage
figure makes up for not having them. A case-bundled 300 W unit has none, so a 1660
Super cannot be plugged into it — and that is a different failure from being
underpowered, so the refusal says which one it is.

**Efficiency.** The 80+ rating is what makes mining profitability depend on the
PSU, because the draw that gets metered is the load divided by the rating:

```
a Gold unit turns 100 W of useful work into 111 W of draw
a White unit turns the same 100 W into 122 W
```

Same components, same work, different meter. On a machine that runs all night, the
better unit pays for itself — which is a real reason to buy one, not a nicer
sticker.

```
300 W  Generic (case bundled)   70%   0 PCIe cables    $22
450 W  80+ White                82%   1 cable          $38
550 W  80+ Bronze               85%   2 cables         $52
650 W  80+ Bronze               85%   2 cables         $68
750 W  80+ Gold                 90%   3 cables         $95
850 W  80+ Gold                 90%   3 cables        $125
1000 W 80+ Platinum             92%   4 cables        $175
1200 W 80+ Titanium             94%   4 cables        $250
1600 W 80+ Titanium             94%   6 cables        $420
```

## The case

Four physical gates and one thermal one, and the thermal number is the same
wattage the power supply has to carry — so the case and the PSU are arguing about
the same thing from opposite ends.

**Form factor.** A board only bolts into a case that lists its form. Z790 is ATX;
an ITX case takes ITX boards and refuses it by name. HEDT boards are E-ATX and need
a full tower.

**Card length.** A 320 mm card does not go in a 200 mm case, and the refusal quotes
both numbers.

**Drive bays.** A 3.5-inch hard disk needs somewhere to spin. The ITX case has no
3.5-inch bay at all, so a spinning disk is not an option in it — that is a
different failure from a SATA port being unavailable. An NVMe drive needs no bay,
because the slot is on the board.

**Airflow, which is the one that costs frame rate.** The case has to shed the heat
the components make:

```
case sheds 260 W but the build makes 415 W - throttling to 67%
```

That is a real multiplier on the GPU-bound figure, not a warning. The same
components in a full tower run at full speed. It is capped so a badly-ventilated
build is slow, never dead.

```
Compact mATX Tower          mATX/ITX          250 mm   1x3.5"  130 W   $42
ITX Small Form Factor       ITX               200 mm   0x3.5"   95 W   $55
Mid Tower                   ATX/mATX/ITX      320 mm   2x3.5"  260 W   $68
Mesh-Front Airflow Tower    ATX/mATX/ITX      340 mm   2x3.5"  380 W   $95
Sound-Dampened Tower        ATX/mATX/ITX      330 mm   3x3.5"  240 W  $110
Full Tower                  E-ATX/ATX/mATX    400 mm   4x3.5"  460 W  $150
Open Test Bench             E-ATX/ATX/mATX    420 mm   2x3.5"  620 W  $130
Workstation Rack Chassis    E-ATX/ATX         350 mm   8x3.5"  800 W  $260
```

The silent case is the trap: it cools less than the mesh tower that costs $15
less. Damping absorbs noise and airflow both.

## The shelf

**96 motherboards across 18 platform families**, with the tiers kept distinct
because they are different products: LGA 1851 (Z890/Z990, B860/B960, H810/H910),
LGA 1700 (Z790/Z690, H770/H670, B760/B660, H610), LGA 1200, LGA 1151, the legacy
Intel sockets, the HEDT platforms (W790, X299, X99, X79, X58), AM5 (X870E down to
A620), AM4 (X570 down to A320), all five Threadripper platforms, AM3+, FM2+ and
the old AMD sockets back to Socket 939.

Two catalogues, and a rule that makes both of them matter. **What is verified and
what is authored is stated in the file itself**: `cores`, `threads` and `memGen`
are the real specs of the named part; `index`, `price` and `watt` are game values.

**64 CPUs across 56 generations**, one for every generation from the Athlon 64
and the Pentium 4 through Core 2, Nehalem, Sandy Bridge and every numbered Intel
generation since, to Panther Lake on one side and Zen 5, Strix Halo and
Threadripper on the other. The market groups them by generation, because a flat
list of 63 chips is a wall rather than a choice.

**117 memory kits across 16 brands**, by product line: Dominator Titanium,
Trident Z5 Royal, T-Force Xtreem, FURY Renegade, Ballistix MAX, Viper Extreme 5,
XPG Lancer, Manta xFinity, Blade, Polaris, Redline, and the defunct ones worth
remembering — OCZ Reaper HPC, Winbond BH-5, the OEM green sticks that shipped by
the million. Grouped by brand.

Two chips I first wrote from memory were **not real** — a "Core Ultra 9 295K" and
a "Core Ultra 9 385K". Both eras now hold actual parts (the 270K Plus and the
Core Ultra 9 386H), and the suite asserts the invented ids stay gone.

And the rules, which are the board's:

**The socket.** A chip only goes in a board that carries its socket, and the
refusal names both sides:

```
G41 / P45 (LGA 775) is socket LGA775 and the Ryzen 9 9950X is socket AM5
                              - the chip does not go in this board
```

**The memory generation.** The board has the slots, so the board decides. A
DDR5 chip next to a DDR4 kit does not run slowly, it does not run — the notch is
in a different place.

**And a chip can support two generations.** An LGA 1700 CPU ran DDR4 or DDR5
depending on the board it was fitted to, so those chips list both and the board
is what picks. A chip that only ever had one controller cannot follow the board
to the other — a Pentium D is LGA 775 and still will not go in a DDR3 LGA 775
board, because it has no DDR3 controller.

**PCIe is a speed penalty, not a wall.** A PCIe 5.0 card in a PCIe 3.0 board
runs, at a narrower link, and the game says so rather than hiding it. Fitting a
12 GB card to a B450 and wondering why the ray-traced showcase still fails is
the intended lesson.

The market marks the kits that would not fit *before* you pay for them, fitting
one half of a mismatched pair warns you immediately, and the workload board
reports `no POST` instead of a frame rate. You can still fit it — you have to be
able to fit the other half next — it just tells you the truth while you do.

## The loop

Pick **resolution** and **quality** at the top; the workload board re-evaluates
live. Click a part to open the market, and a swap costs the new price minus 60%
of what it replaces. The win banner appears when all six cards are green at your
current settings.

```
Esports Shooter       144 fps      CPU-bound on weak chips, VRAM-irrelevant
Open World RPG         60 fps
Racing Sim             60 fps
Ray-traced Showcase    30 fps      the VRAM killer
Modded Survival        60 fps      +2.5 GB of mods on top
VR Title               90 fps      brutal, and unforgiving of 8 GB of RAM
```

A workload passes on **frame rate AND frame-time spikes** — a card that averages
60 fps while spiking to 25 ms has not passed, which is the distinction that makes
the simulation worth anything.

## What is actually modelled

**The wattage model is real arithmetic.** The PSU gates are the same numbers the
electricity cost uses, so the part you buy and the bill you pay cannot disagree.

**The VRAM rules are real.** They are a policy, not a measurement, so they are
implemented exactly: the 2 GB floor, the architecture gates (Turing+ NVIDIA,
RDNA+ AMD, Arc), and the rule that HAGS stays **off** when the title needs more
memory than the card has. That last one comes from `hags_policy.py`, the same
file the Vortex Optimizer and HAGS Selector call, so the game and the tools
cannot disagree.

**The performance figures are indices**, chosen so the *ordering* matches real
hardware. They are not benchmarks and the game does not claim they are. The
breakdown panel prints the arithmetic that produced every number — the demand
terms, the GPU-bound and CPU-bound figures, the VRAM factor, the memory and
storage penalties — so a player can see *why*, not just *what*.

```
demand = engine + textures x quality + ray tracing + mods
         all scaled by pixels^0.85
over the card's capacity -> spill, frame-time spikes, and a rising fps penalty
past the RAM headroom    -> thrashing
```

**1 GB = 1024 MB and every figure is shown in MB**, because that is the unit the
real tools use and the misleading one is GB printed as if it were decimal.

## Verified

```
node test_sim.js  228 assertions   the model, the rules, the catalogues, the economy
node test_ui.js   104 assertions   the game, played through its own interface
```

The catalogue tests are completeness checks, not vibes: **every one of the 56
generations has a chip you can actually buy** (a generation label with nothing
behind it is a dead menu entry), both vendors are represented, all five memory
generations are on the shelf, and the twelve named brands plus the defunct ones
are all present. Memory kits that would break a pairing are tested in both
directions, and the three kits the economy was calibrated on are pinned to their
exact price and bandwidth so the balance cannot drift under the tests silently.

The core tests assert direction on every demand term, the HAGS gates, and two
structural invariants: **the starting build fails all six** (a game you cannot
lose is not a game) and **a maxed build wins all six** (one you cannot win is a
bug). The UI tests drive the real click handlers — buying parts, changing the
resolution and quality, reaching the win state — and they pinned down the actual
economy:

```
1660 Super + Ryzen 5 3600 + 16 GB-3200 + SATA, 1080p medium ... 6/6, $277 left
the same build at 1080p high .................................. 2/6
GTX 1650 (4 GB), 1080p medium ................................. 2/6  <- VRAM, not money
RTX 3060 12 GB, 1080p high .................................... 6/6, $177 left
```

The earning loop is tested the same way: the UI test drives the page's own
`setInterval` clock, mows for nine hours and checks that exactly three shifts were
paid, fast-forwards a 25-hour tick and checks that **eight** shifts were paid, then
works its way up to the win. That fast-forward assertion is a bug that shipped for
ten minutes: the payout was an `if` where it needed a `while`, so at 5x and 25x
speed you were paid for one shift per tick instead of every shift you crossed.

The first version of this test also asserted a win with an $800 build when the
budget was $600 — it was asserting that an unwinnable game is winnable, and it
took a measurement to find that rather than a guess.

**The board catalogue is completeness-checked, not eyeballed:** every one of the
18 platform families has a board, every board has at least one CPU that can
actually go in it (a board you can never use is a dead menu entry), every
Threadripper platform has a chip for its socket, and the nine soldered BGA parts
are refused everywhere, by design — they are real hardware that comes attached
to a board and cannot be fitted to one.

## The WebView2 window

`webview/PCForge.exe` is a frameless WinForms shell around WebView2: no title bar,
no menu, no address bar, no right-click menu, no browser accelerator keys. Drag it
by the header, resize from any edge, F11 to maximise. It carries the page *inside*
the executable, so there is no second file to lose.

It also fixes the storage problem properly, which is the reason it exists.

```
PCForge.exe --check       verify the payload without opening a window
PCForge.exe --savecheck   drive the real runtime and report what the game saved
```

**The pay ladder is asserted, and it caught two real bugs.** The suite checks that
each tier starts above the ceiling of the one below it — and it failed twice while
this was being built. "Engineering" opened at $51/h beneath a $64/h job in the tier
below it, and "A serious build" opened at $45/h beneath a $55/h job. Both were
rebalanced. The tier test is the reason that is fixed rather than shipped.

**The thermal model is the same wattage as the power model.** The case gate and
the PSU gate cannot disagree about what a build draws, because they read one
number.

## Verified by playing it

**The layout is confirmed at seven slots, and the save survives a close and
reopen.** Both were checked by playing the game, which is the only way to check
them: the headless suite drives a hand-written DOM stub and proves the handlers,
the maths and the state changes, and it can prove nothing about CSS, the canvas
bar, or whether a window that closes comes back with your machine in it.

That matters most for the save, because it was the one claim in here that was
argued rather than measured. Opened as a plain `file://` page, browser storage is
undefined behaviour by specification — so the WebView2 build exists to give the
game a real origin, and it works.

What is still unmeasured: the indices against a real benchmark. They are ordered
like real hardware, which is what the game needs, but no part in this catalogue
has been measured here.

## The bug that made the game unplayable

A player reported that the money never moved. They were right, and the cause was
that taking a job did nothing on its own — time was a **separate checkbox** you had
to find, so the job card went green and the cash stayed at $350.

The fix is the obvious one: starting work starts time. There is no clock control
left to find, and the header says `(paused)` in amber whenever time is genuinely not
passing. The speed selector went the same way — two knobs in front of a game whose
only real decision is what to do with the hours. The trap is now an assertion: the
suite checks that taking a job starts the clock by itself, and that the UI never
reaches for a clock switch or a speed control at all.

## Layout

```
sim_core.js        the model: boards, parts, VRAM, HAGS policy, scoring. No DOM.
ui.js              rendering and input. No game rules.
index.html         the page shell and CSS, referencing the two above
build_page.py      inlines them into the self-contained page, then verifies it
PCForge.html       the built artefact - what to ship
test_sim.js        the model's tests
test_ui.js         the game's tests, through its own click handlers
launcher.py        opens the page in an app-mode browser window
shell/             the WebView2 window: Program.cs, ShellForm.cs, SaveCheck.cs
webview/PCForge.exe the built shell, page carried inside it
PCForge.spec       PyInstaller one-file build
LAUNCHER.bat       what the user runs
```

Two files, one source of truth: the tests load `sim_core.js` and `ui.js` directly,
and `build_page.py` inlines those same files into the shipped page. The page
cannot reference a sibling that was not copied, because it has no siblings.
