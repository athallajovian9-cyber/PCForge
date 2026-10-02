/* PCForge simulation core.
 *
 * Pure logic, no DOM. Loaded by the page and by test_sim.js under node, so the
 * numbers the player sees are the numbers the tests assert.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS MODELLED AND WHAT IS NOT
 *
 * Every performance figure here is an INDEX - a relative number chosen so the
 * ordering matches real hardware - not a measured benchmark. The demand model
 * is an approximation with stated terms, and the page prints the formula so a
 * player can see what produced a number rather than being told to trust it.
 *
 * The VRAM rules ARE the real ones, because they are a policy rather than a
 * measurement: the 2 GB floor, the architecture gates, and the "leave HAGS off
 * if the title needs more memory than the card has" rule are taken from
 * hags_policy.py, the same file the Vortex Optimizer and HAGS Selector call.
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
	if (typeof module === "object" && module.exports) module.exports = factory();
	else root.SimCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
	"use strict";

	// ---------------------------------------------------------------- GPUs
	// `index` is PassMark G3D Mark divided by 100 - a real published score from one
	// source, not a figure chosen for looks. PassMark measures thousands of
	// submissions, so the ORDERING is real; converting it to frames per second is
	// calibrated separately (see FPS_PER_G3D), and the residual error against
	// in-game benchmarks is documented in the README rather than hidden.
	//
	// `g3dDerived` marks the cards PassMark does not list directly, scaled from the
	// nearest published relative figure. Everything else is the published score.
	//
	// vramMb is the real capacity. `arch` drives HAGS support by RULE, below.
	const GPUS = [
		{ id: "igpu",   name: "Integrated Vega 7", year: 2019, api: 5,  vramMb: 512,   vendor: "AMD",   arch: "igpu",    index: 18.0, g3dDerived: true,  price: 0,    shared: true, watt: 0, pcieGen: 3, powerConnectors: 0, lengthMm: 0 },
		{ id: "gt1030", name: "GeForce GT 1030", year: 2017, api: 5,    vramMb: 2048,  vendor: "NVIDIA", arch: "pascal",  index: 11.0, g3dDerived: true, price: 40,  watt: 30, pcieGen: 3, powerConnectors: 0, lengthMm: 150 },
		{ id: "1050ti", name: "GeForce GTX 1050 Ti", year: 2016, api: 5, vramMb: 4096, vendor: "NVIDIA", arch: "pascal",  index: 63.65, price: 70,  watt: 75, pcieGen: 3, powerConnectors: 0, lengthMm: 170 },
		{ id: "1650",   name: "GeForce GTX 1650", year: 2019, api: 5,   vramMb: 4096,  vendor: "NVIDIA", arch: "turing",  index: 78.68, price: 110, watt: 75, pcieGen: 3, powerConnectors: 0, lengthMm: 180 },
		{ id: "1660s",  name: "GeForce GTX 1660 Super", year: 2019, api: 5, vramMb: 6144, vendor: "NVIDIA", arch: "turing", index: 126.66, price: 150, watt: 125, pcieGen: 3, powerConnectors: 1, lengthMm: 230 },
		{ id: "3050",   name: "GeForce RTX 3050 8GB", year: 2022, api: 5, vramMb: 8192, vendor: "NVIDIA", arch: "ampere", index: 125.1, price: 180, watt: 130, pcieGen: 4, powerConnectors: 1, lengthMm: 200 },
		{ id: "3060",   name: "GeForce RTX 3060 12GB", year: 2021, api: 5, vramMb: 12288, vendor: "NVIDIA", arch: "ampere", index: 167.1, price: 250, watt: 170, pcieGen: 4, powerConnectors: 1, lengthMm: 242 },
		{ id: "4060",   name: "GeForce RTX 4060", year: 2023, api: 5,   vramMb: 8192,  vendor: "NVIDIA", arch: "ada",     index: 195.3, price: 300, watt: 115, pcieGen: 4, powerConnectors: 1, lengthMm: 200 },
		{ id: "5060ti", name: "GeForce RTX 5060 Ti 16GB", year: 2025, api: 5, vramMb: 16384, vendor: "NVIDIA", arch: "blackwell", index: 240.0, g3dDerived: true, price: 450, watt: 180, pcieGen: 5, powerConnectors: 1, lengthMm: 250 },
		{ id: "5070",   name: "GeForce RTX 5070", year: 2025, api: 5,   vramMb: 12288, vendor: "NVIDIA", arch: "blackwell", index: 286.59, price: 600, watt: 250, pcieGen: 5, powerConnectors: 2, lengthMm: 300 },
		{ id: "rx580",  name: "Radeon RX 580 8GB", year: 2017, api: 5,  vramMb: 8192,  vendor: "AMD",   arch: "polaris", index: 87.85, price: 90,  watt: 185, pcieGen: 3, powerConnectors: 1, lengthMm: 280 },
		{ id: "rx6600", name: "Radeon RX 6600", year: 2021, api: 5,     vramMb: 8192,  vendor: "AMD",   arch: "rdna",    index: 150.71, price: 200, watt: 132, pcieGen: 4, powerConnectors: 1, lengthMm: 190 },
		{ id: "rx9070", name: "Radeon RX 9070", year: 2026, api: 5,     vramMb: 16384, vendor: "AMD",   arch: "rdna4",   index: 253.59, price: 650, watt: 220, pcieGen: 5, powerConnectors: 2, lengthMm: 320 },
		{ id: "a750",   name: "Arc A750", year: 2022, api: 5,           vramMb: 8192,  vendor: "Intel", arch: "arc",     index: 139.0, g3dDerived: true, price: 220, watt: 225, pcieGen: 4, powerConnectors: 1, lengthMm: 270 },
		{ id: "b580",   name: "Arc B580 12GB", year: 2024, api: 5,      vramMb: 12288, vendor: "Intel", arch: "battlemage", index: 160.22, price: 280, watt: 190, pcieGen: 4, powerConnectors: 1, lengthMm: 272 },
		{ id: "nv1", name: "NVIDIA NV1", year: 1995, api: 2, vramMb: 2, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 10, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 150, unscored: true },
		{ id: "riva128", name: "RIVA 128", year: 1997, api: 2, vramMb: 4, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 14, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 150, unscored: true },
		{ id: "riva128zx", name: "RIVA 128ZX", year: 1998, api: 2, vramMb: 8, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 16, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 150, unscored: true },
		{ id: "tnt", name: "RIVA TNT", year: 1998, api: 2, vramMb: 16, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 16, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 160, unscored: true },
		{ id: "tnt2vanta", name: "RIVA TNT2 Vanta", year: 1999, api: 2, vramMb: 8, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 20, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 160, unscored: true },
		{ id: "tnt2m64", name: "RIVA TNT2 M64", year: 1999, api: 2, vramMb: 16, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 20, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 160, unscored: true },
		{ id: "tnt2pro", name: "RIVA TNT2 Pro", year: 1999, api: 2, vramMb: 32, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 20, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 160, unscored: true },
		{ id: "tnt2ultra", name: "RIVA TNT2 Ultra", year: 1999, api: 2, vramMb: 32, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 20, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 160, unscored: true },
		{ id: "gf256sdr", name: "GeForce 256 SDR", year: 1999, api: 2, vramMb: 32, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 20, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 168, unscored: true },
		{ id: "gf256ddr", name: "GeForce 256 DDR", year: 1999, api: 2, vramMb: 32, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 20, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 168, unscored: true },
		{ id: "gf2mx", name: "GeForce 2 MX 400", year: 2000, api: 2, vramMb: 32, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 24, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 168, unscored: true },
		{ id: "gf2gts", name: "GeForce 2 GTS", year: 2000, api: 2, vramMb: 32, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 24, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 168, unscored: true },
		{ id: "gf2ultra", name: "GeForce 2 Ultra", year: 2000, api: 2, vramMb: 64, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 24, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 168, unscored: true },
		{ id: "gf3", name: "GeForce 3 Ti 200", year: 2001, api: 2, vramMb: 64, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 28, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 175, unscored: true },
		{ id: "gf3ti500", name: "GeForce 3 Ti 500", year: 2001, api: 2, vramMb: 64, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 28, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 175, unscored: true },
		{ id: "gf4mx440", name: "GeForce 4 MX 440", year: 2002, api: 2, vramMb: 64, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 32, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 175, unscored: true },
		{ id: "gf4ti4200", name: "GeForce 4 Ti 4200", year: 2002, api: 2, vramMb: 64, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 32, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 175, unscored: true },
		{ id: "gf4ti4800", name: "GeForce 4 Ti 4800", year: 2002, api: 2, vramMb: 128, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 32, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 175, unscored: true },
		{ id: "fx5200", name: "GeForce FX 5200", year: 2003, api: 2, vramMb: 128, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 36, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 175, unscored: true },
		{ id: "fx5600", name: "GeForce FX 5600", year: 2003, api: 2, vramMb: 128, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 36, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 175, unscored: true },
		{ id: "fx5700u", name: "GeForce FX 5700 Ultra", year: 2003, api: 2, vramMb: 128, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 36, watt: 0, pcieGen: 1, powerConnectors: 1, lengthMm: 180, unscored: true },
		{ id: "fx5800u", name: "GeForce FX 5800 Ultra", year: 2003, api: 2, vramMb: 128, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 36, watt: 0, pcieGen: 1, powerConnectors: 1, lengthMm: 220, unscored: true },
		{ id: "fx5900u", name: "GeForce FX 5900 Ultra", year: 2003, api: 2, vramMb: 256, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 36, watt: 0, pcieGen: 1, powerConnectors: 1, lengthMm: 220, unscored: true },
		{ id: "fx5950u", name: "GeForce FX 5950 Ultra", year: 2003, api: 2, vramMb: 256, vendor: "NVIDIA", arch: "nvgfx", index: 0, price: 36, watt: 0, pcieGen: 1, powerConnectors: 1, lengthMm: 220, unscored: true },
		{ id: "6200", name: "GeForce 6200", year: 2004, api: 3, vramMb: 128, vendor: "NVIDIA", arch: "curie", index: 0, price: 42, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 168, unscored: true },
		{ id: "6600gt", name: "GeForce 6600 GT", year: 2004, api: 3, vramMb: 128, vendor: "NVIDIA", arch: "curie", index: 0, price: 42, watt: 0, pcieGen: 1, powerConnectors: 1, lengthMm: 190, unscored: true },
		{ id: "6800gs", name: "GeForce 6800 GS", year: 2005, api: 3, vramMb: 256, vendor: "NVIDIA", arch: "curie", index: 0, price: 48, watt: 0, pcieGen: 1, powerConnectors: 1, lengthMm: 200, unscored: true },
		{ id: "6800gt", name: "GeForce 6800 GT", year: 2004, api: 3, vramMb: 256, vendor: "NVIDIA", arch: "curie", index: 0, price: 42, watt: 0, pcieGen: 1, powerConnectors: 1, lengthMm: 200, unscored: true },
		{ id: "6800ultra", name: "GeForce 6800 Ultra", year: 2004, api: 3, vramMb: 256, vendor: "NVIDIA", arch: "curie", index: 0, price: 42, watt: 0, pcieGen: 1, powerConnectors: 2, lengthMm: 210, unscored: true },
		{ id: "7300gt", name: "GeForce 7300 GT", year: 2006, api: 3, vramMb: 256, vendor: "NVIDIA", arch: "curie", index: 0, price: 55, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 170, unscored: true },
		{ id: "7600gt", name: "GeForce 7600 GT", year: 2006, api: 3, vramMb: 256, vendor: "NVIDIA", arch: "curie", index: 0, price: 55, watt: 0, pcieGen: 1, powerConnectors: 1, lengthMm: 180, unscored: true },
		{ id: "7800gtx", name: "GeForce 7800 GTX", year: 2005, api: 3, vramMb: 256, vendor: "NVIDIA", arch: "curie", index: 0, price: 48, watt: 0, pcieGen: 1, powerConnectors: 1, lengthMm: 210, unscored: true },
		{ id: "7900gtx", name: "GeForce 7900 GTX", year: 2006, api: 3, vramMb: 512, vendor: "NVIDIA", arch: "curie", index: 0, price: 55, watt: 0, pcieGen: 1, powerConnectors: 1, lengthMm: 220, unscored: true },
		{ id: "7950gx2", name: "GeForce 7950 GX2", year: 2006, api: 3, vramMb: 1024, vendor: "NVIDIA", arch: "curie", index: 0, price: 55, watt: 0, pcieGen: 1, powerConnectors: 2, lengthMm: 230, unscored: true },
		{ id: "8400gs", name: "GeForce 8400 GS", year: 2007, api: 4, vramMb: 256, vendor: "NVIDIA", arch: "tesla", index: 0, price: 62, watt: 0, pcieGen: 2, powerConnectors: 0, lengthMm: 168, unscored: true },
		{ id: "8600gts", name: "GeForce 8600 GTS", year: 2007, api: 4, vramMb: 256, vendor: "NVIDIA", arch: "tesla", index: 0, price: 62, watt: 0, pcieGen: 2, powerConnectors: 1, lengthMm: 190, unscored: true },
		{ id: "8800gt", name: "GeForce 8800 GT", year: 2007, api: 4, vramMb: 512, vendor: "NVIDIA", arch: "tesla", index: 0, price: 62, watt: 0, pcieGen: 2, powerConnectors: 1, lengthMm: 230, unscored: true },
		{ id: "8800gtx", name: "GeForce 8800 GTX", year: 2006, api: 4, vramMb: 768, vendor: "NVIDIA", arch: "tesla", index: 0, price: 55, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "8800ultra", name: "GeForce 8800 Ultra", year: 2007, api: 4, vramMb: 768, vendor: "NVIDIA", arch: "tesla", index: 0, price: 62, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "9600gt", name: "GeForce 9600 GT", year: 2008, api: 4, vramMb: 512, vendor: "NVIDIA", arch: "tesla", index: 0, price: 70, watt: 0, pcieGen: 2, powerConnectors: 1, lengthMm: 230, unscored: true },
		{ id: "9800gt", name: "GeForce 9800 GT", year: 2008, api: 4, vramMb: 512, vendor: "NVIDIA", arch: "tesla", index: 0, price: 70, watt: 0, pcieGen: 2, powerConnectors: 1, lengthMm: 230, unscored: true },
		{ id: "9800gtx", name: "GeForce 9800 GTX+", year: 2008, api: 4, vramMb: 512, vendor: "NVIDIA", arch: "tesla", index: 0, price: 70, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "9800gx2", name: "GeForce 9800 GX2", year: 2008, api: 4, vramMb: 1024, vendor: "NVIDIA", arch: "tesla", index: 0, price: 70, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "gt220", name: "GeForce GT 220", year: 2009, api: 4, vramMb: 1024, vendor: "NVIDIA", arch: "tesla", index: 0, price: 78, watt: 0, pcieGen: 2, powerConnectors: 0, lengthMm: 168, unscored: true },
		{ id: "gts250", name: "GeForce GTS 250", year: 2009, api: 4, vramMb: 1024, vendor: "NVIDIA", arch: "tesla", index: 0, price: 78, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 240, unscored: true },
		{ id: "gtx260", name: "GeForce GTX 260", year: 2008, api: 4, vramMb: 896, vendor: "NVIDIA", arch: "tesla", index: 0, price: 70, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "gtx275", name: "GeForce GTX 275", year: 2009, api: 4, vramMb: 896, vendor: "NVIDIA", arch: "tesla", index: 0, price: 78, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "gtx280", name: "GeForce GTX 280", year: 2008, api: 4, vramMb: 1024, vendor: "NVIDIA", arch: "tesla", index: 0, price: 70, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "gtx285", name: "GeForce GTX 285", year: 2009, api: 4, vramMb: 1024, vendor: "NVIDIA", arch: "tesla", index: 0, price: 78, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "gtx295", name: "GeForce GTX 295", year: 2009, api: 4, vramMb: 1792, vendor: "NVIDIA", arch: "tesla", index: 0, price: 78, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "gts450", name: "GeForce GTS 450", year: 2010, api: 4, vramMb: 1024, vendor: "NVIDIA", arch: "fermi", index: 0, price: 88, watt: 0, pcieGen: 2, powerConnectors: 1, lengthMm: 210, unscored: true },
		{ id: "gtx460", name: "GeForce GTX 460", year: 2010, api: 4, vramMb: 1024, vendor: "NVIDIA", arch: "fermi", index: 0, price: 88, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 210, unscored: true },
		{ id: "gtx470", name: "GeForce GTX 470", year: 2010, api: 4, vramMb: 1280, vendor: "NVIDIA", arch: "fermi", index: 0, price: 88, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 250, unscored: true },
		{ id: "gtx480", name: "GeForce GTX 480", year: 2010, api: 4, vramMb: 1536, vendor: "NVIDIA", arch: "fermi", index: 0, price: 88, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "gtx550ti", name: "GeForce GTX 550 Ti", year: 2011, api: 4, vramMb: 1024, vendor: "NVIDIA", arch: "fermi", index: 0, price: 98, watt: 0, pcieGen: 2, powerConnectors: 1, lengthMm: 210, unscored: true },
		{ id: "gtx560ti", name: "GeForce GTX 560 Ti", year: 2011, api: 4, vramMb: 1024, vendor: "NVIDIA", arch: "fermi", index: 0, price: 98, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 230, unscored: true },
		{ id: "gtx570", name: "GeForce GTX 570", year: 2010, api: 4, vramMb: 1280, vendor: "NVIDIA", arch: "fermi", index: 0, price: 88, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "gtx580", name: "GeForce GTX 580", year: 2010, api: 4, vramMb: 1536, vendor: "NVIDIA", arch: "fermi", index: 0, price: 88, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "gtx590", name: "GeForce GTX 590", year: 2011, api: 4, vramMb: 3072, vendor: "NVIDIA", arch: "fermi", index: 0, price: 98, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 280, unscored: true },
		{ id: "gtx660", name: "GeForce GTX 660", year: 2012, api: 4, vramMb: 2048, vendor: "NVIDIA", arch: "kepler", index: 0, price: 110, watt: 0, pcieGen: 3, powerConnectors: 1, lengthMm: 240, unscored: true },
		{ id: "gtx670", name: "GeForce GTX 670", year: 2012, api: 4, vramMb: 2048, vendor: "NVIDIA", arch: "kepler", index: 0, price: 110, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 240, unscored: true },
		{ id: "gtx680", name: "GeForce GTX 680", year: 2012, api: 4, vramMb: 2048, vendor: "NVIDIA", arch: "kepler", index: 0, price: 110, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 250, unscored: true },
		{ id: "gtx690", name: "GeForce GTX 690", year: 2012, api: 4, vramMb: 4096, vendor: "NVIDIA", arch: "kepler", index: 0, price: 110, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 280, unscored: true },
		{ id: "gt710", name: "GeForce GT 710", year: 2016, api: 4, vramMb: 2048, vendor: "NVIDIA", arch: "kepler", index: 0, price: 170, watt: 0, pcieGen: 2, powerConnectors: 0, lengthMm: 145, unscored: true },
		{ id: "gt730", name: "GeForce GT 730", year: 2014, api: 4, vramMb: 2048, vendor: "NVIDIA", arch: "kepler", index: 0, price: 140, watt: 0, pcieGen: 2, powerConnectors: 0, lengthMm: 145, unscored: true },
		{ id: "gtx760", name: "GeForce GTX 760", year: 2013, api: 4, vramMb: 2048, vendor: "NVIDIA", arch: "kepler", index: 0, price: 125, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 240, unscored: true },
		{ id: "gtx770", name: "GeForce GTX 770", year: 2013, api: 4, vramMb: 2048, vendor: "NVIDIA", arch: "kepler", index: 0, price: 125, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 250, unscored: true },
		{ id: "gtx780", name: "GeForce GTX 780", year: 2013, api: 4, vramMb: 3072, vendor: "NVIDIA", arch: "kepler", index: 0, price: 125, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 260, unscored: true },
		{ id: "gtx780ti", name: "GeForce GTX 780 Ti", year: 2013, api: 4, vramMb: 3072, vendor: "NVIDIA", arch: "kepler", index: 0, price: 125, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 260, unscored: true },
		{ id: "titan", name: "GeForce GTX TITAN", year: 2013, api: 4, vramMb: 6144, vendor: "NVIDIA", arch: "kepler", index: 0, price: 125, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 260, unscored: true },
		{ id: "titanblack", name: "GeForce GTX TITAN Black", year: 2014, api: 4, vramMb: 6144, vendor: "NVIDIA", arch: "kepler", index: 0, price: 140, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 260, unscored: true },
		{ id: "titanz", name: "GeForce GTX TITAN Z", year: 2014, api: 4, vramMb: 12288, vendor: "NVIDIA", arch: "kepler", index: 0, price: 140, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 280, unscored: true },
		{ id: "gtx750ti", name: "GeForce GTX 750 Ti", year: 2014, api: 4, vramMb: 2048, vendor: "NVIDIA", arch: "maxwell", index: 0, price: 140, watt: 0, pcieGen: 3, powerConnectors: 0, lengthMm: 190, unscored: true },
		{ id: "gtx960", name: "GeForce GTX 960", year: 2015, api: 4, vramMb: 4096, vendor: "NVIDIA", arch: "maxwell", index: 0, price: 155, watt: 0, pcieGen: 3, powerConnectors: 1, lengthMm: 220, unscored: true },
		{ id: "gtx970", name: "GeForce GTX 970", year: 2014, api: 4, vramMb: 4096, vendor: "NVIDIA", arch: "maxwell", index: 0, price: 140, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "gtx980", name: "GeForce GTX 980", year: 2014, api: 4, vramMb: 4096, vendor: "NVIDIA", arch: "maxwell", index: 0, price: 140, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "gtx980ti", name: "GeForce GTX 980 Ti", year: 2015, api: 4, vramMb: 6144, vendor: "NVIDIA", arch: "maxwell", index: 0, price: 155, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 280, unscored: true },
		{ id: "titanx", name: "GeForce GTX TITAN X", year: 2015, api: 4, vramMb: 12288, vendor: "NVIDIA", arch: "maxwell", index: 0, price: 155, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 280, unscored: true },
		{ id: "gtx1050", name: "GeForce GTX 1050", year: 2016, api: 4, vramMb: 2048, vendor: "NVIDIA", arch: "pascal", index: 0, price: 170, watt: 0, pcieGen: 3, powerConnectors: 0, lengthMm: 170, unscored: true },
		{ id: "gtx1060", name: "GeForce GTX 1060 6GB", year: 2016, api: 4, vramMb: 6144, vendor: "NVIDIA", arch: "pascal", index: 100.30, price: 222, watt: 0, pcieGen: 3, powerConnectors: 1, lengthMm: 220 },
		{ id: "gtx1070", name: "GeForce GTX 1070", year: 2016, api: 4, vramMb: 8192, vendor: "NVIDIA", arch: "pascal", index: 0, price: 170, watt: 0, pcieGen: 3, powerConnectors: 1, lengthMm: 270, unscored: true },
		{ id: "gtx1080", name: "GeForce GTX 1080", year: 2016, api: 4, vramMb: 8192, vendor: "NVIDIA", arch: "pascal", index: 0, price: 170, watt: 0, pcieGen: 3, powerConnectors: 1, lengthMm: 270, unscored: true },
		{ id: "gtx1080ti", name: "GeForce GTX 1080 Ti", year: 2017, api: 4, vramMb: 11264, vendor: "NVIDIA", arch: "pascal", index: 0, price: 185, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "titanxp", name: "TITAN Xp", year: 2017, api: 4, vramMb: 12288, vendor: "NVIDIA", arch: "pascal", index: 0, price: 185, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "gtx1630", name: "GeForce GTX 1630", year: 2022, api: 5, vramMb: 4096, vendor: "NVIDIA", arch: "turing", index: 0, price: 270, watt: 0, pcieGen: 3, powerConnectors: 0, lengthMm: 170, unscored: true },
		{ id: "gtx1650s", name: "GeForce GTX 1650 Super", year: 2019, api: 5, vramMb: 4096, vendor: "NVIDIA", arch: "turing", index: 101.94, price: 226, watt: 0, pcieGen: 3, powerConnectors: 1, lengthMm: 200 },
		{ id: "gtx1660", name: "GeForce GTX 1660", year: 2019, api: 5, vramMb: 6144, vendor: "NVIDIA", arch: "turing", index: 0, price: 215, watt: 0, pcieGen: 3, powerConnectors: 1, lengthMm: 220, unscored: true },
		{ id: "gtx1660ti", name: "GeForce GTX 1660 Ti", year: 2019, api: 5, vramMb: 6144, vendor: "NVIDIA", arch: "turing", index: 0, price: 215, watt: 0, pcieGen: 3, powerConnectors: 1, lengthMm: 230, unscored: true },
		{ id: "rtx2060", name: "GeForce RTX 2060", year: 2019, api: 5, vramMb: 6144, vendor: "NVIDIA", arch: "turing", index: 140.78, price: 312, watt: 0, pcieGen: 3, powerConnectors: 1, lengthMm: 230 },
		{ id: "rtx2060s", name: "GeForce RTX 2060 Super", year: 2019, api: 5, vramMb: 8192, vendor: "NVIDIA", arch: "turing", index: 0, price: 215, watt: 0, pcieGen: 3, powerConnectors: 1, lengthMm: 230, unscored: true },
		{ id: "rtx2070", name: "GeForce RTX 2070", year: 2018, api: 5, vramMb: 8192, vendor: "NVIDIA", arch: "turing", index: 0, price: 200, watt: 0, pcieGen: 3, powerConnectors: 1, lengthMm: 230, unscored: true },
		{ id: "rtx2070s", name: "GeForce RTX 2070 Super", year: 2019, api: 5, vramMb: 8192, vendor: "NVIDIA", arch: "turing", index: 0, price: 215, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "rtx2080", name: "GeForce RTX 2080", year: 2018, api: 5, vramMb: 8192, vendor: "NVIDIA", arch: "turing", index: 0, price: 200, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "rtx2080s", name: "GeForce RTX 2080 Super", year: 2019, api: 5, vramMb: 8192, vendor: "NVIDIA", arch: "turing", index: 0, price: 215, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "rtx2080ti", name: "GeForce RTX 2080 Ti", year: 2018, api: 5, vramMb: 11264, vendor: "NVIDIA", arch: "turing", index: 0, price: 200, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "titanrtx", name: "TITAN RTX", year: 2018, api: 5, vramMb: 24576, vendor: "NVIDIA", arch: "turing", index: 0, price: 200, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "rtx3060ti", name: "GeForce RTX 3060 Ti", year: 2020, api: 5, vramMb: 8192, vendor: "NVIDIA", arch: "ampere", index: 202.88, price: 450, watt: 0, pcieGen: 4, powerConnectors: 1, lengthMm: 240 },
		{ id: "rtx3070", name: "GeForce RTX 3070", year: 2020, api: 5, vramMb: 8192, vendor: "NVIDIA", arch: "ampere", index: 220.78, price: 490, watt: 0, pcieGen: 4, powerConnectors: 1, lengthMm: 240 },
		{ id: "rtx3070ti", name: "GeForce RTX 3070 Ti", year: 2021, api: 5, vramMb: 8192, vendor: "NVIDIA", arch: "ampere", index: 0, price: 250, watt: 0, pcieGen: 4, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "rtx3080", name: "GeForce RTX 3080", year: 2020, api: 5, vramMb: 10240, vendor: "NVIDIA", arch: "ampere", index: 249.86, price: 555, watt: 0, pcieGen: 4, powerConnectors: 2, lengthMm: 285 },
		{ id: "rtx3080ti", name: "GeForce RTX 3080 Ti", year: 2021, api: 5, vramMb: 12288, vendor: "NVIDIA", arch: "ampere", index: 0, price: 250, watt: 0, pcieGen: 4, powerConnectors: 2, lengthMm: 285, unscored: true },
		{ id: "rtx3090", name: "GeForce RTX 3090", year: 2020, api: 5, vramMb: 24576, vendor: "NVIDIA", arch: "ampere", index: 0, price: 230, watt: 0, pcieGen: 4, powerConnectors: 2, lengthMm: 313, unscored: true },
		{ id: "rtx3090ti", name: "GeForce RTX 3090 Ti", year: 2022, api: 5, vramMb: 24576, vendor: "NVIDIA", arch: "ampere", index: 0, price: 270, watt: 0, pcieGen: 4, powerConnectors: 3, lengthMm: 313, unscored: true },
		{ id: "rtx4060ti", name: "GeForce RTX 4060 Ti 8GB", year: 2023, api: 5, vramMb: 8192, vendor: "NVIDIA", arch: "ada", index: 0, price: 300, watt: 0, pcieGen: 4, powerConnectors: 1, lengthMm: 240, unscored: true },
		{ id: "rtx4070s", name: "GeForce RTX 4070 Super", year: 2024, api: 5, vramMb: 12288, vendor: "NVIDIA", arch: "ada", index: 0, price: 340, watt: 0, pcieGen: 4, powerConnectors: 2, lengthMm: 305, unscored: true },
		{ id: "rtx4070ti", name: "GeForce RTX 4070 Ti", year: 2023, api: 5, vramMb: 12288, vendor: "NVIDIA", arch: "ada", index: 0, price: 300, watt: 0, pcieGen: 4, powerConnectors: 2, lengthMm: 305, unscored: true },
		{ id: "rtx4080", name: "GeForce RTX 4080", year: 2022, api: 5, vramMb: 16384, vendor: "NVIDIA", arch: "ada", index: 344.30, price: 765, watt: 0, pcieGen: 4, powerConnectors: 2, lengthMm: 310 },
		{ id: "rtx4090", name: "GeForce RTX 4090", year: 2022, api: 5, vramMb: 24576, vendor: "NVIDIA", arch: "ada", index: 380.42, price: 845, watt: 0, pcieGen: 4, powerConnectors: 4, lengthMm: 336 },
		{ id: "rtx5060", name: "GeForce RTX 5060", year: 2025, api: 5, vramMb: 8192, vendor: "NVIDIA", arch: "blackwell", index: 0, price: 400, watt: 0, pcieGen: 5, powerConnectors: 1, lengthMm: 200, unscored: true },
		{ id: "rtx5070ti", name: "GeForce RTX 5070 Ti", year: 2025, api: 5, vramMb: 16384, vendor: "NVIDIA", arch: "blackwell", index: 0, price: 400, watt: 0, pcieGen: 5, powerConnectors: 2, lengthMm: 300, unscored: true },
		{ id: "rtx5080", name: "GeForce RTX 5080", year: 2025, api: 5, vramMb: 16384, vendor: "NVIDIA", arch: "blackwell", index: 356.18, price: 791, watt: 0, pcieGen: 5, powerConnectors: 2, lengthMm: 304 },
		{ id: "rtx5090", name: "GeForce RTX 5090", year: 2025, api: 5, vramMb: 32768, vendor: "NVIDIA", arch: "blackwell", index: 389.88, price: 866, watt: 0, pcieGen: 5, powerConnectors: 4, lengthMm: 304 },
		{ id: "mach64", name: "ATI Mach 64 GX", year: 1996, api: 2, vramMb: 4, vendor: "AMD", arch: "atimach", index: 0, price: 12, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 170, unscored: true },
		{ id: "rage2", name: "ATI 3D Rage II", year: 1996, api: 2, vramMb: 4, vendor: "AMD", arch: "atimach", index: 0, price: 12, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 170, unscored: true },
		{ id: "ragepro", name: "ATI Rage Pro", year: 1997, api: 2, vramMb: 8, vendor: "AMD", arch: "atimach", index: 0, price: 14, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 170, unscored: true },
		{ id: "rage128", name: "ATI Rage 128", year: 1998, api: 2, vramMb: 32, vendor: "AMD", arch: "atimach", index: 0, price: 16, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 170, unscored: true },
		{ id: "ragefury", name: "ATI Rage Fury MAXX", year: 1999, api: 2, vramMb: 64, vendor: "AMD", arch: "atimach", index: 0, price: 20, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 200, unscored: true },
		{ id: "r7500", name: "Radeon 7500", year: 2001, api: 3, vramMb: 64, vendor: "AMD", arch: "r100", index: 0, price: 28, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 170, unscored: true },
		{ id: "r8500", name: "Radeon 8500", year: 2001, api: 3, vramMb: 64, vendor: "AMD", arch: "r100", index: 0, price: 28, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 180, unscored: true },
		{ id: "r9700pro", name: "Radeon 9700 Pro", year: 2002, api: 3, vramMb: 128, vendor: "AMD", arch: "r300", index: 0, price: 32, watt: 0, pcieGen: 1, powerConnectors: 1, lengthMm: 200, unscored: true },
		{ id: "r9800pro", name: "Radeon 9800 Pro", year: 2003, api: 3, vramMb: 128, vendor: "AMD", arch: "r300", index: 0, price: 36, watt: 0, pcieGen: 1, powerConnectors: 1, lengthMm: 210, unscored: true },
		{ id: "r9800xt", name: "Radeon 9800 XT", year: 2003, api: 3, vramMb: 256, vendor: "AMD", arch: "r300", index: 0, price: 36, watt: 0, pcieGen: 1, powerConnectors: 1, lengthMm: 210, unscored: true },
		{ id: "x800xl", name: "Radeon X800 XL", year: 2004, api: 3, vramMb: 256, vendor: "AMD", arch: "r400", index: 0, price: 42, watt: 0, pcieGen: 1, powerConnectors: 1, lengthMm: 210, unscored: true },
		{ id: "x850xt", name: "Radeon X850 XT", year: 2004, api: 3, vramMb: 256, vendor: "AMD", arch: "r400", index: 0, price: 42, watt: 0, pcieGen: 1, powerConnectors: 1, lengthMm: 210, unscored: true },
		{ id: "x1900xtx", name: "Radeon X1900 XTX", year: 2006, api: 3, vramMb: 512, vendor: "AMD", arch: "r500", index: 0, price: 55, watt: 0, pcieGen: 1, powerConnectors: 2, lengthMm: 230, unscored: true },
		{ id: "x1950xtx", name: "Radeon X1950 XTX", year: 2006, api: 3, vramMb: 512, vendor: "AMD", arch: "r500", index: 0, price: 55, watt: 0, pcieGen: 1, powerConnectors: 2, lengthMm: 230, unscored: true },
		{ id: "hd2600xt", name: "Radeon HD 2600 XT", year: 2007, api: 4, vramMb: 256, vendor: "AMD", arch: "r600", index: 0, price: 62, watt: 0, pcieGen: 2, powerConnectors: 0, lengthMm: 190, unscored: true },
		{ id: "hd3850", name: "Radeon HD 3850", year: 2007, api: 4, vramMb: 512, vendor: "AMD", arch: "r600", index: 0, price: 62, watt: 0, pcieGen: 2, powerConnectors: 1, lengthMm: 230, unscored: true },
		{ id: "hd3870", name: "Radeon HD 3870", year: 2007, api: 4, vramMb: 512, vendor: "AMD", arch: "r600", index: 0, price: 62, watt: 0, pcieGen: 2, powerConnectors: 1, lengthMm: 230, unscored: true },
		{ id: "hd4670", name: "Radeon HD 4670", year: 2008, api: 4, vramMb: 512, vendor: "AMD", arch: "r600", index: 0, price: 70, watt: 0, pcieGen: 2, powerConnectors: 0, lengthMm: 200, unscored: true },
		{ id: "hd4850", name: "Radeon HD 4850", year: 2008, api: 4, vramMb: 512, vendor: "AMD", arch: "r600", index: 0, price: 70, watt: 0, pcieGen: 2, powerConnectors: 1, lengthMm: 230, unscored: true },
		{ id: "hd4870", name: "Radeon HD 4870", year: 2008, api: 4, vramMb: 1024, vendor: "AMD", arch: "r600", index: 0, price: 70, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 240, unscored: true },
		{ id: "hd4890", name: "Radeon HD 4890", year: 2009, api: 4, vramMb: 1024, vendor: "AMD", arch: "r600", index: 0, price: 78, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 240, unscored: true },
		{ id: "hd5770", name: "Radeon HD 5770", year: 2009, api: 4, vramMb: 1024, vendor: "AMD", arch: "evergreen", index: 0, price: 78, watt: 0, pcieGen: 2, powerConnectors: 1, lengthMm: 210, unscored: true },
		{ id: "hd5850", name: "Radeon HD 5850", year: 2009, api: 4, vramMb: 1024, vendor: "AMD", arch: "evergreen", index: 0, price: 78, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 240, unscored: true },
		{ id: "hd5870", name: "Radeon HD 5870", year: 2009, api: 4, vramMb: 1024, vendor: "AMD", arch: "evergreen", index: 0, price: 78, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "hd5970", name: "Radeon HD 5970", year: 2009, api: 4, vramMb: 2048, vendor: "AMD", arch: "evergreen", index: 0, price: 78, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 300, unscored: true },
		{ id: "hd6850", name: "Radeon HD 6850", year: 2010, api: 4, vramMb: 1024, vendor: "AMD", arch: "evergreen", index: 0, price: 88, watt: 0, pcieGen: 2, powerConnectors: 1, lengthMm: 240, unscored: true },
		{ id: "hd6870", name: "Radeon HD 6870", year: 2010, api: 4, vramMb: 1024, vendor: "AMD", arch: "evergreen", index: 0, price: 88, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 250, unscored: true },
		{ id: "hd6970", name: "Radeon HD 6970", year: 2010, api: 4, vramMb: 2048, vendor: "AMD", arch: "evergreen", index: 0, price: 88, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "hd6990", name: "Radeon HD 6990", year: 2011, api: 4, vramMb: 4096, vendor: "AMD", arch: "evergreen", index: 0, price: 98, watt: 0, pcieGen: 2, powerConnectors: 2, lengthMm: 300, unscored: true },
		{ id: "hd7750", name: "Radeon HD 7750", year: 2012, api: 4, vramMb: 1024, vendor: "AMD", arch: "gcn", index: 0, price: 110, watt: 0, pcieGen: 3, powerConnectors: 0, lengthMm: 190, unscored: true },
		{ id: "hd7850", name: "Radeon HD 7850", year: 2012, api: 4, vramMb: 2048, vendor: "AMD", arch: "gcn", index: 0, price: 110, watt: 0, pcieGen: 3, powerConnectors: 1, lengthMm: 230, unscored: true },
		{ id: "hd7870", name: "Radeon HD 7870", year: 2012, api: 4, vramMb: 2048, vendor: "AMD", arch: "gcn", index: 0, price: 110, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 240, unscored: true },
		{ id: "hd7950", name: "Radeon HD 7950", year: 2012, api: 4, vramMb: 3072, vendor: "AMD", arch: "gcn", index: 0, price: 110, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "hd7970", name: "Radeon HD 7970", year: 2012, api: 4, vramMb: 3072, vendor: "AMD", arch: "gcn", index: 0, price: 110, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "hd7990", name: "Radeon HD 7990", year: 2013, api: 4, vramMb: 6144, vendor: "AMD", arch: "gcn", index: 0, price: 125, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 300, unscored: true },
		{ id: "r9-270x", name: "Radeon R9 270X", year: 2013, api: 4, vramMb: 2048, vendor: "AMD", arch: "gcn", index: 0, price: 125, watt: 0, pcieGen: 3, powerConnectors: 1, lengthMm: 240, unscored: true },
		{ id: "r9-280x", name: "Radeon R9 280X", year: 2013, api: 4, vramMb: 3072, vendor: "AMD", arch: "gcn", index: 0, price: 125, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "r9-290", name: "Radeon R9 290", year: 2013, api: 4, vramMb: 4096, vendor: "AMD", arch: "gcn", index: 0, price: 125, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "r9-290x", name: "Radeon R9 290X", year: 2013, api: 4, vramMb: 4096, vendor: "AMD", arch: "gcn", index: 0, price: 125, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "r9-295x2", name: "Radeon R9 295X2", year: 2014, api: 4, vramMb: 8192, vendor: "AMD", arch: "gcn", index: 0, price: 140, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 300, unscored: true },
		{ id: "r9-380", name: "Radeon R9 380", year: 2015, api: 4, vramMb: 4096, vendor: "AMD", arch: "gcn", index: 0, price: 155, watt: 0, pcieGen: 3, powerConnectors: 1, lengthMm: 250, unscored: true },
		{ id: "r9-390x", name: "Radeon R9 390X", year: 2015, api: 4, vramMb: 8192, vendor: "AMD", arch: "gcn", index: 0, price: 155, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "r9-furyx", name: "Radeon R9 Fury X", year: 2015, api: 4, vramMb: 4096, vendor: "AMD", arch: "gcn", index: 0, price: 155, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "rx480", name: "Radeon RX 480", year: 2016, api: 4, vramMb: 8192, vendor: "AMD", arch: "polaris", index: 0, price: 170, watt: 0, pcieGen: 3, powerConnectors: 1, lengthMm: 240, unscored: true },
		{ id: "rx550", name: "Radeon RX 550", year: 2017, api: 4, vramMb: 2048, vendor: "AMD", arch: "polaris", index: 0, price: 185, watt: 0, pcieGen: 3, powerConnectors: 0, lengthMm: 170, unscored: true },
		{ id: "rx560", name: "Radeon RX 560", year: 2017, api: 4, vramMb: 4096, vendor: "AMD", arch: "polaris", index: 0, price: 185, watt: 0, pcieGen: 3, powerConnectors: 0, lengthMm: 190, unscored: true },
		{ id: "rx570", name: "Radeon RX 570", year: 2017, api: 4, vramMb: 8192, vendor: "AMD", arch: "polaris", index: 0, price: 185, watt: 0, pcieGen: 3, powerConnectors: 1, lengthMm: 240, unscored: true },
		{ id: "rx590", name: "Radeon RX 590", year: 2018, api: 4, vramMb: 8192, vendor: "AMD", arch: "polaris", index: 0, price: 200, watt: 0, pcieGen: 3, powerConnectors: 1, lengthMm: 250, unscored: true },
		{ id: "vega56", name: "Radeon RX Vega 56", year: 2017, api: 4, vramMb: 8192, vendor: "AMD", arch: "vega", index: 0, price: 185, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 280, unscored: true },
		{ id: "vega64", name: "Radeon RX Vega 64", year: 2017, api: 4, vramMb: 8192, vendor: "AMD", arch: "vega", index: 0, price: 185, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 280, unscored: true },
		{ id: "radeonvii", name: "Radeon VII", year: 2019, api: 4, vramMb: 16384, vendor: "AMD", arch: "vega", index: 0, price: 215, watt: 0, pcieGen: 3, powerConnectors: 2, lengthMm: 280, unscored: true },
		{ id: "rx5500xt", name: "Radeon RX 5500 XT", year: 2019, api: 5, vramMb: 8192, vendor: "AMD", arch: "rdna", index: 0, price: 215, watt: 0, pcieGen: 4, powerConnectors: 1, lengthMm: 220, unscored: true },
		{ id: "rx5600xt", name: "Radeon RX 5600 XT", year: 2020, api: 5, vramMb: 6144, vendor: "AMD", arch: "rdna", index: 0, price: 230, watt: 0, pcieGen: 4, powerConnectors: 1, lengthMm: 250, unscored: true },
		{ id: "rx5700", name: "Radeon RX 5700", year: 2019, api: 5, vramMb: 8192, vendor: "AMD", arch: "rdna", index: 0, price: 215, watt: 0, pcieGen: 4, powerConnectors: 1, lengthMm: 270, unscored: true },
		{ id: "rx5700xt", name: "Radeon RX 5700 XT", year: 2019, api: 5, vramMb: 8192, vendor: "AMD", arch: "rdna", index: 0, price: 215, watt: 0, pcieGen: 4, powerConnectors: 2, lengthMm: 270, unscored: true },
		{ id: "rx6500xt", name: "Radeon RX 6500 XT", year: 2022, api: 5, vramMb: 4096, vendor: "AMD", arch: "rdna", index: 0, price: 270, watt: 0, pcieGen: 4, powerConnectors: 1, lengthMm: 200, unscored: true },
		{ id: "rx6600xt", name: "Radeon RX 6600 XT", year: 2021, api: 5, vramMb: 8192, vendor: "AMD", arch: "rdna", index: 0, price: 250, watt: 0, pcieGen: 4, powerConnectors: 1, lengthMm: 230, unscored: true },
		{ id: "rx6650xt", name: "Radeon RX 6650 XT", year: 2022, api: 5, vramMb: 8192, vendor: "AMD", arch: "rdna", index: 0, price: 270, watt: 0, pcieGen: 4, powerConnectors: 1, lengthMm: 240, unscored: true },
		{ id: "rx6700xt", name: "Radeon RX 6700 XT", year: 2021, api: 5, vramMb: 12288, vendor: "AMD", arch: "rdna", index: 0, price: 250, watt: 0, pcieGen: 4, powerConnectors: 2, lengthMm: 267, unscored: true },
		{ id: "rx6800", name: "Radeon RX 6800", year: 2020, api: 5, vramMb: 16384, vendor: "AMD", arch: "rdna", index: 0, price: 230, watt: 0, pcieGen: 4, powerConnectors: 2, lengthMm: 267, unscored: true },
		{ id: "rx6800xt", name: "Radeon RX 6800 XT", year: 2020, api: 5, vramMb: 16384, vendor: "AMD", arch: "rdna", index: 0, price: 230, watt: 0, pcieGen: 4, powerConnectors: 2, lengthMm: 267, unscored: true },
		{ id: "rx6900xt", name: "Radeon RX 6900 XT", year: 2020, api: 5, vramMb: 16384, vendor: "AMD", arch: "rdna", index: 0, price: 230, watt: 0, pcieGen: 4, powerConnectors: 2, lengthMm: 267, unscored: true },
		{ id: "rx6950xt", name: "Radeon RX 6950 XT", year: 2022, api: 5, vramMb: 16384, vendor: "AMD", arch: "rdna", index: 0, price: 270, watt: 0, pcieGen: 4, powerConnectors: 2, lengthMm: 267, unscored: true },
		{ id: "rx7600", name: "Radeon RX 7600", year: 2023, api: 5, vramMb: 8192, vendor: "AMD", arch: "rdna", index: 0, price: 300, watt: 0, pcieGen: 4, powerConnectors: 1, lengthMm: 204, unscored: true },
		{ id: "rx7700xt", name: "Radeon RX 7700 XT", year: 2023, api: 5, vramMb: 12288, vendor: "AMD", arch: "rdna", index: 0, price: 300, watt: 0, pcieGen: 4, powerConnectors: 2, lengthMm: 267, unscored: true },
		{ id: "rx7800xt", name: "Radeon RX 7800 XT", year: 2023, api: 5, vramMb: 16384, vendor: "AMD", arch: "rdna", index: 0, price: 300, watt: 0, pcieGen: 4, powerConnectors: 2, lengthMm: 267, unscored: true },
		{ id: "rx7900xt", name: "Radeon RX 7900 XT", year: 2022, api: 5, vramMb: 20480, vendor: "AMD", arch: "rdna", index: 0, price: 270, watt: 0, pcieGen: 4, powerConnectors: 2, lengthMm: 276, unscored: true },
		{ id: "rx7900xtx", name: "Radeon RX 7900 XTX", year: 2022, api: 5, vramMb: 24576, vendor: "AMD", arch: "rdna", index: 0, price: 270, watt: 0, pcieGen: 4, powerConnectors: 2, lengthMm: 287, unscored: true },
		{ id: "rx9060xt", name: "Radeon RX 9060 XT 16GB", year: 2026, api: 5, vramMb: 16384, vendor: "AMD", arch: "rdna4", index: 0, price: 460, watt: 0, pcieGen: 5, powerConnectors: 1, lengthMm: 200, unscored: true },
		{ id: "rx9070xt", name: "Radeon RX 9070 XT", year: 2026, api: 5, vramMb: 16384, vendor: "AMD", arch: "rdna4", index: 269.08, price: 597, watt: 0, pcieGen: 5, powerConnectors: 2, lengthMm: 267 },
		{ id: "arc-a380", name: "Arc A380", year: 2022, api: 5, vramMb: 6144, vendor: "Intel", arch: "arc", index: 0, price: 270, watt: 0, pcieGen: 4, powerConnectors: 1, lengthMm: 222, unscored: true },
		{ id: "arc-a580", name: "Arc A580", year: 2023, api: 5, vramMb: 8192, vendor: "Intel", arch: "arc", index: 120.69, price: 268, watt: 0, pcieGen: 4, powerConnectors: 1, lengthMm: 267 },
		{ id: "arc-a770", name: "Arc A770 16GB", year: 2022, api: 5, vramMb: 16384, vendor: "Intel", arch: "arc", index: 0, price: 270, watt: 0, pcieGen: 4, powerConnectors: 2, lengthMm: 280, unscored: true },
		{ id: "arc-b570", name: "Arc B570", year: 2024, api: 5, vramMb: 10240, vendor: "Intel", arch: "battlemage", index: 0, price: 340, watt: 0, pcieGen: 4, powerConnectors: 1, lengthMm: 249, unscored: true },
		{ id: "arc-b390", name: "Arc B390", year: 2025, api: 5, vramMb: 8192, vendor: "Intel", arch: "battlemage", index: 0, price: 400, watt: 0, pcieGen: 4, powerConnectors: 1, lengthMm: 200, unscored: true },
		{ id: "voodoo1", name: "3dfx Voodoo Graphics", year: 1996, api: 2, vramMb: 4, vendor: "3dfx", arch: "3dfx", index: 0, price: 12, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 170, unscored: true },
		{ id: "voodoo2", name: "3dfx Voodoo2", year: 1998, api: 2, vramMb: 12, vendor: "3dfx", arch: "3dfx", index: 0, price: 16, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 180, unscored: true },
		{ id: "banshee", name: "3dfx Voodoo Banshee", year: 1998, api: 2, vramMb: 16, vendor: "3dfx", arch: "3dfx", index: 0, price: 16, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 170, unscored: true },
		{ id: "voodoo3", name: "3dfx Voodoo3 3000", year: 1999, api: 2, vramMb: 16, vendor: "3dfx", arch: "3dfx", index: 0, price: 20, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 170, unscored: true },
		{ id: "voodoo5", name: "3dfx Voodoo5 5500", year: 2000, api: 2, vramMb: 64, vendor: "3dfx", arch: "3dfx", index: 0, price: 24, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 200, unscored: true },
		{ id: "millennium", name: "Matrox Millennium G400 MAX", year: 1999, api: 2, vramMb: 32, vendor: "Matrox", arch: "matrox", index: 0, price: 20, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 170, unscored: true },
		{ id: "parhelia", name: "Matrox Parhelia 512", year: 2002, api: 2, vramMb: 256, vendor: "Matrox", arch: "matrox", index: 0, price: 32, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 190, unscored: true },
		{ id: "savage4", name: "S3 Savage4", year: 1999, api: 2, vramMb: 32, vendor: "S3", arch: "s3", index: 0, price: 20, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 170, unscored: true },
		{ id: "chrome-s27", name: "S3 Chrome S27", year: 2006, api: 3, vramMb: 256, vendor: "S3", arch: "s3", index: 0, price: 55, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 180, unscored: true },
		{ id: "volari-v8", name: "XGI Volari V8 Ultra", year: 2003, api: 3, vramMb: 256, vendor: "XGI", arch: "xgi", index: 0, price: 36, watt: 0, pcieGen: 1, powerConnectors: 1, lengthMm: 200, unscored: true },
		{ id: "sis-xabre", name: "SiS Xabre 600", year: 2002, api: 2, vramMb: 128, vendor: "SiS", arch: "sis", index: 0, price: 32, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 180, unscored: true },
		{ id: "n9-ticket", name: "Number Nine Ticket to Ride IV", year: 1999, api: 2, vramMb: 32, vendor: "Number Nine", arch: "n9", index: 0, price: 20, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 180, unscored: true },
		{ id: "verite2200", name: "Rendition Verite V2200", year: 1997, api: 2, vramMb: 8, vendor: "Rendition", arch: "rendition", index: 0, price: 14, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 170, unscored: true },
		{ id: "et4000", name: "Tseng ET4000/W32", year: 1993, api: 1, vramMb: 2, vendor: "Tseng", arch: "tseng", index: 0, price: 8, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 160, unscored: true },
		{ id: "kyro2", name: "PowerVR Kyro II", year: 2001, api: 2, vramMb: 64, vendor: "PowerVR", arch: "powervr", index: 0, price: 28, watt: 0, pcieGen: 1, powerConnectors: 0, lengthMm: 180, unscored: true },
	];

	// VERIFIED vs AUTHORED. `cores`, `threads` and `memGen` are the real
	// specifications of the named part, checked against the vendor's own pages and
	// the review press. `index`, `price` and `watt` are GAME VALUES: the index is a
	// relative figure chosen for ordering, the price is rounded to roughly the real
	// launch price where the part had one, and `watt` is TDP as a stand-in for draw.
	//
	// The CPU market is a CATALOGUE, not a shortlist: one representative chip for
	// every generation from the Athlon 64 and Pentium 4 to Panther Lake and Zen 5,
	// grouped by the era it belongs to. `memGen` is not decoration - a chip only
	// runs the memory generation its socket was built for, and the sim refuses to
	// POST a mismatched pair rather than pretending an Athlon 64 can take DDR5.
	const CPU_ERAS = [
		{ id: "icu3", label: "Intel Core Ultra Series 3 (Panther Lake)", vendor: "Intel" },
		{ id: "icu2p", label: "Intel Core Ultra Series 2 Plus (Arrow Lake Refresh)", vendor: "Intel" },
		{ id: "icu2", label: "Intel Core Ultra Series 2 (Arrow Lake / Lunar Lake)", vendor: "Intel" },
		{ id: "icu1", label: "Intel Core Ultra Series 1 (Meteor Lake)", vendor: "Intel" },
		{ id: "i14", label: "14th Generation (Raptor Lake Refresh)", vendor: "Intel" },
		{ id: "i13", label: "13th Generation (Raptor Lake)", vendor: "Intel" },
		{ id: "i12", label: "12th Generation (Alder Lake)", vendor: "Intel" },
		{ id: "i11", label: "11th Generation (Rocket Lake / Tiger Lake)", vendor: "Intel" },
		{ id: "i10", label: "10th Generation (Comet Lake / Ice Lake)", vendor: "Intel" },
		{ id: "i9", label: "9th Generation (Coffee Lake Refresh)", vendor: "Intel" },
		{ id: "i8", label: "8th Generation (Coffee Lake)", vendor: "Intel" },
		{ id: "i7", label: "7th Generation (Kaby Lake)", vendor: "Intel" },
		{ id: "i6", label: "6th Generation (Skylake)", vendor: "Intel" },
		{ id: "i5", label: "5th Generation (Broadwell)", vendor: "Intel" },
		{ id: "i4", label: "4th Generation (Haswell)", vendor: "Intel" },
		{ id: "i3", label: "3rd Generation (Ivy Bridge)", vendor: "Intel" },
		{ id: "i2", label: "2nd Generation (Sandy Bridge)", vendor: "Intel" },
		{ id: "i1", label: "1st Generation (Nehalem)", vendor: "Intel" },
		{ id: "ihedt", label: "Intel HEDT / Workstation (Xeon W, Core X)", vendor: "Intel" },
		{ id: "c2x", label: "Core 2 Extreme", vendor: "Intel" },
		{ id: "c2q", label: "Core 2 Quad", vendor: "Intel" },
		{ id: "c2d", label: "Core 2 Duo", vendor: "Intel" },
		{ id: "c2s", label: "Core 2 Solo", vendor: "Intel" },
		{ id: "pdc", label: "Pentium Dual-Core", vendor: "Intel" },
		{ id: "pd", label: "Pentium D", vendor: "Intel" },
		{ id: "pee", label: "Pentium Extreme Edition", vendor: "Intel" },
		{ id: "p4e", label: "Pentium 4 (EM64T / Intel 64)", vendor: "Intel" },
		{ id: "iproc", label: "Intel Processor (modern baseline)", vendor: "Intel" },
		{ id: "pgold", label: "Pentium Gold", vendor: "Intel" },
		{ id: "psilver", label: "Pentium Silver", vendor: "Intel" },
		{ id: "cel", label: "Celeron G / Celeron D", vendor: "Intel" },
		{ id: "atom", label: "Atom (64-bit mobile)", vendor: "Intel" },
		{ id: "rai", label: "Ryzen AI 400 / AI Max (Zen 5, Strix Halo)", vendor: "AMD" },
		{ id: "r9000", label: "Ryzen 9000 Series (Zen 5 desktop)", vendor: "AMD" },
		{ id: "r8000", label: "Ryzen 8000 Series (Zen 4 APU / mobile)", vendor: "AMD" },
		{ id: "r7000", label: "Ryzen 7000 Series (Zen 4 desktop)", vendor: "AMD" },
		{ id: "r6000", label: "Ryzen 6000 Series (Zen 3+ mobile)", vendor: "AMD" },
		{ id: "r5000", label: "Ryzen 5000 Series (Zen 3)", vendor: "AMD" },
		{ id: "r4000", label: "Ryzen 4000 Series (Zen 2 APU / mobile)", vendor: "AMD" },
		{ id: "r3000", label: "Ryzen 3000 Series (Zen 2 desktop)", vendor: "AMD" },
		{ id: "r2000", label: "Ryzen 2000 Series (Zen+)", vendor: "AMD" },
		{ id: "r1000", label: "Ryzen 1000 Series (Zen)", vendor: "AMD" },
		{ id: "tr7000", label: "Threadripper 7000 Series", vendor: "AMD" },
		{ id: "tr5000", label: "Threadripper 5000 Series", vendor: "AMD" },
		{ id: "tr3000", label: "Threadripper 3000 Series", vendor: "AMD" },
		{ id: "tr2000", label: "Threadripper 2000 Series", vendor: "AMD" },
		{ id: "tr1000", label: "Threadripper 1000 Series", vendor: "AMD" },
		{ id: "fx", label: "FX-Series (Bulldozer - Excavator)", vendor: "AMD" },
		{ id: "aapu", label: "A-Series APUs (A12/A10/A8/A6/A4)", vendor: "AMD" },
		{ id: "ax4", label: "Athlon X4 (FM2 / AM4)", vendor: "AMD" },
		{ id: "phenom2", label: "Phenom II (X6/X4/X3/X2)", vendor: "AMD" },
		{ id: "athlon2", label: "Athlon II (X4/X3/X2)", vendor: "AMD" },
		{ id: "sempron", label: "Sempron (64-bit AM2/AM3)", vendor: "AMD" },
		{ id: "phenom", label: "Phenom (X4/X3)", vendor: "AMD" },
		{ id: "a64x2", label: "Athlon 64 X2", vendor: "AMD" },
		{ id: "a64fx", label: "Athlon 64 FX", vendor: "AMD" },
		{ id: "a64", label: "Athlon 64", vendor: "AMD" },
	];

	// `index` is a gaming-performance index on a real scale: **Ryzen 5 3600 = 100**,
// and the 5800X3D at 156 is the one ratio taken directly from review measurements
// (TechSpot, 12-game average: the X3D is 56% faster than the 3600). The rest are
// placed from generation, clocks and core count, which is an ESTIMATE - the
// ordering is sound, the exact spacing is not measured. Kept in the file so no
// reader mistakes one for the other.
const CPUS = [
		{ id: "3200g", era: "r3000", socket: "AM4", name: "Ryzen 3 3200G", cores: 4, threads: 4, index: 62, price: 60, ramCap: 64, watt: 65, memGen: "DDR4" },
		{ id: "12100f", era: "i12", socket: "LGA1700", name: "Core i3-12100F", cores: 4, threads: 8, index: 118, price: 90, ramCap: 128, watt: 58, memGen: "DDR4|DDR5" },
		{ id: "3600", era: "r3000", socket: "AM4", name: "Ryzen 5 3600", cores: 6, threads: 12, index: 100, price: 110, ramCap: 128, watt: 65, memGen: "DDR4" },
		{ id: "5600", era: "r5000", socket: "AM4", name: "Ryzen 5 5600", cores: 6, threads: 12, index: 126, price: 140, ramCap: 128, watt: 65, memGen: "DDR4" },
		{ id: "12400f", era: "i12", socket: "LGA1700", name: "Core i5-12400F", cores: 6, threads: 12, index: 128, price: 150, ramCap: 128, watt: 65, memGen: "DDR4|DDR5" },
		{ id: "5800x3d", era: "r5000", socket: "AM4", name: "Ryzen 7 5800X3D", cores: 8, threads: 16, index: 156, price: 320, ramCap: 128, watt: 105, memGen: "DDR4" },
		{ id: "cu9-386h", era: "icu3", socket: "BGA-PantherLake", name: "Core Ultra 9 386H", cores: 16, threads: 16, index: 104, price: 320, ramCap: 128, watt: 25, memGen: "DDR5" },
		{ id: "cu7-270k-plus", era: "icu2p", socket: "LGA1851", name: "Core Ultra 7 270K Plus", cores: 24, threads: 24, index: 190, price: 300, ramCap: 256, watt: 125, memGen: "DDR5" },
		{ id: "cu9-285k", era: "icu2", socket: "LGA1851", name: "Core Ultra 9 285K", cores: 24, threads: 24, index: 188, price: 400, ramCap: 192, watt: 125, memGen: "DDR5" },
		{ id: "cu7-155h", era: "icu1", socket: "BGA-MeteorLake", name: "Core Ultra 7 155H", cores: 16, threads: 22, index: 112, price: 300, ramCap: 96, watt: 45, memGen: "DDR5" },
		{ id: "i9-14900k", era: "i14", socket: "LGA1700", name: "Core i9-14900K", cores: 24, threads: 32, index: 196, price: 380, ramCap: 192, watt: 125, memGen: "DDR4|DDR5" },
		{ id: "i7-13700k", era: "i13", socket: "LGA1700", name: "Core i7-13700K", cores: 16, threads: 24, index: 180, price: 300, ramCap: 128, watt: 125, memGen: "DDR4|DDR5" },
		{ id: "i9-12900k", era: "i12", socket: "LGA1700", name: "Core i9-12900K", cores: 16, threads: 24, index: 176, price: 280, ramCap: 128, watt: 125, memGen: "DDR4|DDR5" },
		{ id: "i7-11700k", era: "i11", socket: "LGA1200", name: "Core i7-11700K", cores: 8, threads: 16, index: 130, price: 160, ramCap: 128, watt: 125, memGen: "DDR4" },
		{ id: "i5-10400f", era: "i10", socket: "LGA1200", name: "Core i5-10400F", cores: 6, threads: 12, index: 106, price: 95, ramCap: 128, watt: 65, memGen: "DDR4" },
		{ id: "i5-9600k", era: "i9", socket: "LGA1151", name: "Core i5-9600K", cores: 6, threads: 6, index: 104, price: 85, ramCap: 128, watt: 95, memGen: "DDR4" },
		{ id: "i5-8400", era: "i8", socket: "LGA1151", name: "Core i5-8400", cores: 6, threads: 6, index: 92, price: 70, ramCap: 128, watt: 65, memGen: "DDR4" },
		{ id: "i5-7600k", era: "i7", socket: "LGA1151", name: "Core i5-7600K", cores: 4, threads: 4, index: 84, price: 60, ramCap: 64, watt: 91, memGen: "DDR4" },
		{ id: "i5-6600k", era: "i6", socket: "LGA1151", name: "Core i5-6600K", cores: 4, threads: 4, index: 80, price: 50, ramCap: 64, watt: 91, memGen: "DDR4" },
		{ id: "i5-5675c", era: "i5", socket: "LGA1150", name: "Core i5-5675C", cores: 4, threads: 4, index: 70, price: 45, ramCap: 32, watt: 65, memGen: "DDR3" },
		{ id: "i5-4690k", era: "i4", socket: "LGA1150", name: "Core i5-4690K", cores: 4, threads: 4, index: 68, price: 40, ramCap: 32, watt: 88, memGen: "DDR3" },
		{ id: "i5-3570k", era: "i3", socket: "LGA1155", name: "Core i5-3570K", cores: 4, threads: 4, index: 58, price: 32, ramCap: 32, watt: 77, memGen: "DDR3" },
		{ id: "i5-2500k", era: "i2", socket: "LGA1155", name: "Core i5-2500K", cores: 4, threads: 4, index: 50, price: 28, ramCap: 32, watt: 95, memGen: "DDR3" },
		{ id: "i7-920", era: "i1", socket: "LGA1366", name: "Core i7-920", cores: 4, threads: 8, index: 42, price: 22, ramCap: 24, watt: 130, memGen: "DDR3" },
		{ id: "qx9650", era: "c2x", socket: "LGA775", name: "Core 2 Extreme QX9650", cores: 4, threads: 4, index: 33, price: 24, ramCap: 16, watt: 130, memGen: "DDR2|DDR3" },
		{ id: "q6600", era: "c2q", socket: "LGA775", name: "Core 2 Quad Q6600", cores: 4, threads: 4, index: 28, price: 16, ramCap: 8, watt: 105, memGen: "DDR2|DDR3" },
		{ id: "e8400", era: "c2d", socket: "LGA775", name: "Core 2 Duo E8400", cores: 2, threads: 2, index: 22, price: 12, ramCap: 8, watt: 65, memGen: "DDR2|DDR3" },
		{ id: "u2200", era: "c2s", socket: "BGA-479", name: "Core 2 Solo U2200", cores: 1, threads: 1, index: 8, price: 8, ramCap: 4, watt: 5, memGen: "DDR2" },
		{ id: "e5300", era: "pdc", socket: "LGA775", name: "Pentium Dual-Core E5300", cores: 2, threads: 2, index: 19, price: 10, ramCap: 8, watt: 65, memGen: "DDR2|DDR3" },
		{ id: "d945", era: "pd", socket: "LGA775", name: "Pentium D 945", cores: 2, threads: 2, index: 10, price: 8, ramCap: 8, watt: 95, memGen: "DDR2" },
		{ id: "ee965", era: "pee", socket: "LGA775", name: "Pentium Extreme Edition 965", cores: 2, threads: 4, index: 12, price: 12, ramCap: 8, watt: 130, memGen: "DDR2" },
		{ id: "p4-660", era: "p4e", socket: "LGA775", name: "Pentium 4 660 (EM64T)", cores: 1, threads: 2, index: 9, price: 7, ramCap: 4, watt: 84, memGen: "DDR2" },
		{ id: "n100", era: "iproc", socket: "BGA-AlderLake-N", name: "Intel Processor N100", cores: 4, threads: 4, index: 52, price: 60, ramCap: 16, watt: 6, memGen: "DDR4" },
		{ id: "g7400", era: "pgold", socket: "LGA1700", name: "Pentium Gold G7400", cores: 2, threads: 4, index: 86, price: 45, ramCap: 128, watt: 46, memGen: "DDR4|DDR5" },
		{ id: "j5040", era: "psilver", socket: "BGA-GeminiLake", name: "Pentium Silver J5040", cores: 4, threads: 4, index: 20, price: 25, ramCap: 8, watt: 10, memGen: "DDR4" },
		{ id: "g5920", era: "cel", socket: "LGA1200", name: "Celeron G5920", cores: 2, threads: 2, index: 46, price: 22, ramCap: 64, watt: 58, memGen: "DDR4" },
		{ id: "d360", era: "cel", socket: "LGA775", name: "Celeron D 360", cores: 1, threads: 1, index: 4, price: 6, ramCap: 4, watt: 65, memGen: "DDR2" },
		{ id: "z8350", era: "atom", socket: "BGA-CherryTrail", name: "Atom x5-Z8350", cores: 4, threads: 4, index: 12, price: 12, ramCap: 4, watt: 4, memGen: "DDR3" },
		{ id: "w9-3495x", era: "ihedt", socket: "LGA4677", name: "Xeon w9-3495X", cores: 56, threads: 112, index: 150, price: 2400, ramCap: 512, watt: 350, memGen: "DDR5" },
		{ id: "i9-10980xe", era: "ihedt", socket: "LGA2066", name: "Core i9-10980XE", cores: 18, threads: 36, index: 108, price: 320, ramCap: 256, watt: 165, memGen: "DDR4" },
		{ id: "i7-5960x", era: "ihedt", socket: "LGA2011-3", name: "Core i7-5960X", cores: 8, threads: 16, index: 78, price: 130, ramCap: 128, watt: 140, memGen: "DDR4" },
		{ id: "i7-3960x", era: "ihedt", socket: "LGA2011", name: "Core i7-3960X", cores: 6, threads: 12, index: 62, price: 95, ramCap: 64, watt: 130, memGen: "DDR3" },
		{ id: "ai-max-395", era: "rai", socket: "BGA-StrixHalo", name: "Ryzen AI Max+ 395", cores: 16, threads: 32, index: 176, price: 500, ramCap: 256, watt: 120, memGen: "DDR5" },
		{ id: "r9-9950x", era: "r9000", socket: "AM5", name: "Ryzen 9 9950X", cores: 16, threads: 32, index: 186, price: 480, ramCap: 192, watt: 170, memGen: "DDR5" },
		{ id: "r7-9850x3d", era: "r9000", socket: "AM5", name: "Ryzen 7 9850X3D", cores: 8, threads: 16, index: 172, price: 500, ramCap: 256, watt: 120, memGen: "DDR5" },
		{ id: "r7-8700g", era: "r8000", socket: "AM5", name: "Ryzen 7 8700G", cores: 8, threads: 16, index: 138, price: 240, ramCap: 192, watt: 65, memGen: "DDR5" },
		{ id: "r7-7800x3d", era: "r7000", socket: "AM5", name: "Ryzen 7 7800X3D", cores: 8, threads: 16, index: 168, price: 380, ramCap: 128, watt: 120, memGen: "DDR5" },
		{ id: "r9-6900hx", era: "r6000", socket: "BGA-Rembrandt", name: "Ryzen 9 6900HX", cores: 8, threads: 16, index: 118, price: 200, ramCap: 64, watt: 45, memGen: "DDR5" },
		{ id: "r5-5500", era: "r5000", socket: "AM4", name: "Ryzen 5 5500", cores: 6, threads: 12, index: 108, price: 95, ramCap: 128, watt: 65, memGen: "DDR4" },
		{ id: "r7-4700u", era: "r4000", socket: "BGA-Renoir", name: "Ryzen 7 4700U", cores: 8, threads: 8, index: 84, price: 120, ramCap: 64, watt: 15, memGen: "DDR4" },
		{ id: "r9-3950x", era: "r3000", socket: "AM4", name: "Ryzen 9 3950X", cores: 16, threads: 32, index: 118, price: 200, ramCap: 128, watt: 105, memGen: "DDR4" },
		{ id: "r5-2600", era: "r2000", socket: "AM4", name: "Ryzen 5 2600", cores: 6, threads: 12, index: 78, price: 60, ramCap: 64, watt: 65, memGen: "DDR4" },
		{ id: "r7-1700", era: "r1000", socket: "AM4", name: "Ryzen 7 1700", cores: 8, threads: 16, index: 72, price: 50, ramCap: 64, watt: 65, memGen: "DDR4" },
		{ id: "tr-7980x", era: "tr7000", socket: "sTR5", name: "Threadripper 7980X", cores: 64, threads: 128, index: 172, price: 900, ramCap: 512, watt: 350, memGen: "DDR5" },
		{ id: "tr-5975wx", era: "tr5000", socket: "sWRX8", name: "Threadripper 5975WX", cores: 32, threads: 64, index: 148, price: 600, ramCap: 512, watt: 280, memGen: "DDR4" },
		{ id: "tr-3970x", era: "tr3000", socket: "sTRX4", name: "Threadripper 3970X", cores: 32, threads: 64, index: 120, price: 350, ramCap: 256, watt: 280, memGen: "DDR4" },
		{ id: "tr-2950x", era: "tr2000", socket: "sTR4", name: "Threadripper 2950X", cores: 16, threads: 32, index: 96, price: 200, ramCap: 128, watt: 180, memGen: "DDR4" },
		{ id: "tr-1950x", era: "tr1000", socket: "sTR4", name: "Threadripper 1950X", cores: 16, threads: 32, index: 78, price: 150, ramCap: 128, watt: 180, memGen: "DDR4" },
		{ id: "fx-8350", era: "fx", socket: "AM3+", name: "FX-8350", cores: 8, threads: 8, index: 46, price: 30, ramCap: 32, watt: 125, memGen: "DDR3" },
		{ id: "a10-7850k", era: "aapu", socket: "FM2+", name: "A10-7850K", cores: 4, threads: 4, index: 32, price: 22, ramCap: 32, watt: 95, memGen: "DDR3" },
		{ id: "x4-860k", era: "ax4", socket: "FM2+", name: "Athlon X4 860K", cores: 4, threads: 4, index: 30, price: 20, ramCap: 32, watt: 95, memGen: "DDR3" },
		{ id: "x6-1100t", era: "phenom2", socket: "AM3", name: "Phenom II X6 1100T", cores: 6, threads: 6, index: 26, price: 18, ramCap: 16, watt: 125, memGen: "DDR2|DDR3" },
		{ id: "x4-640", era: "athlon2", socket: "AM3", name: "Athlon II X4 640", cores: 4, threads: 4, index: 18, price: 12, ramCap: 16, watt: 95, memGen: "DDR2|DDR3" },
		{ id: "sempron-140", era: "sempron", socket: "AM3", name: "Sempron 140", cores: 1, threads: 1, index: 9, price: 6, ramCap: 8, watt: 45, memGen: "DDR3" },
		{ id: "x4-9950", era: "phenom", socket: "AM2+", name: "Phenom X4 9950", cores: 4, threads: 4, index: 16, price: 10, ramCap: 8, watt: 125, memGen: "DDR2" },
		{ id: "x2-6000", era: "a64x2", socket: "AM2", name: "Athlon 64 X2 6000+", cores: 2, threads: 2, index: 11, price: 8, ramCap: 8, watt: 89, memGen: "DDR2" },
		{ id: "fx-62", era: "a64fx", socket: "AM2", name: "Athlon 64 FX-62", cores: 2, threads: 2, index: 9, price: 9, ramCap: 8, watt: 125, memGen: "DDR2" },
		{ id: "a64-3800", era: "a64", socket: "939", name: "Athlon 64 3800+", cores: 1, threads: 1, index: 6, price: 6, ramCap: 4, watt: 89, memGen: "DDR" },
	];

	// Memory kits. `rated` is what the box says, `stable` is what actually posts
	// on a budget board - an above-spec kit that fails training falls back to
	// JEDEC, which is a real and very common way to lose performance silently.
	// THE MOTHERBOARD. This is the part that decides whether anything else fits:
	// it carries one socket and one memory generation, and a CPU that does not sit
	// in that socket will not go in it. `pcieGen` is the platform's PCIe generation,
	// which the graphics card is checked against - a PCIe 5.0 card in a 3.0 board
	// runs, at reduced link speed, and the sim says so instead of hiding it.
	//
	// Every chipset family from the vendor lists is here: LGA 1851, 1700, 1200 and
	// 1151 in all four tiers each, the legacy Intel sockets, HEDT (W790, X299, X99,
	// X79, X58), AM5, AM4, the Threadripper platforms, AM3+, FM2+ and the old AMD
	// sockets back to 939.
	const BOARD_ERAS = [
		{ id: "b-lga1851", label: "LGA 1851 - Core Ultra Series 2 / 2 Plus", vendor: "Intel" },
		{ id: "b-lga1700", label: "LGA 1700 - 12th, 13th & 14th Gen Core", vendor: "Intel" },
		{ id: "b-lga1200", label: "LGA 1200 - 10th & 11th Gen Core", vendor: "Intel" },
		{ id: "b-lga1151", label: "LGA 1151 - 6th through 9th Gen Core", vendor: "Intel" },
		{ id: "b-lga1150", label: "LGA 1150 - Haswell / Broadwell", vendor: "Intel" },
		{ id: "b-lga1155", label: "LGA 1155 - Sandy Bridge / Ivy Bridge", vendor: "Intel" },
		{ id: "b-hedt-intel", label: "Intel HEDT - Extreme Workstation", vendor: "Intel" },
		{ id: "b-lga775", label: "LGA 775 - Core 2 (DDR3 era)", vendor: "Intel" },
		{ id: "b-lga775d2", label: "LGA 775 - Pentium D / early Core 2 (DDR2)", vendor: "Intel" },
		{ id: "b-am5", label: "AM5 - Ryzen 7000 / 8000 / 9000", vendor: "AMD" },
		{ id: "b-am4", label: "AM4 - Ryzen 1000 through 5000", vendor: "AMD" },
		{ id: "b-tr", label: "Threadripper - WRX90 / TRX50 / WRX80 / TRX40 / X399", vendor: "AMD" },
		{ id: "b-am3plus", label: "AM3+ - FX Series", vendor: "AMD" },
		{ id: "b-fm2", label: "FM2+ / FM2 - A-Series APUs", vendor: "AMD" },
		{ id: "b-am3", label: "AM3 - Phenom II / Athlon II", vendor: "AMD" },
		{ id: "b-am2plus", label: "AM2+ - Phenom / late Athlon 64", vendor: "AMD" },
		{ id: "b-am2", label: "AM2 - Athlon 64 X2 / FX", vendor: "AMD" },
		{ id: "b-939", label: "Socket 939 - Athlon 64", vendor: "AMD" },
	];

	const BOARDS = [
		{ id: "b-z890", era: "b-lga1851", name: "Z890", socket: "LGA1851", memGen: "DDR5", price: 260, tier: "flagship", form: "ATX", pcieGen: 5 },
		{ id: "b-z990", era: "b-lga1851", name: "Z990", socket: "LGA1851", memGen: "DDR5", price: 300, tier: "flagship", form: "ATX", pcieGen: 5 },
		{ id: "b-b860", era: "b-lga1851", name: "B860", socket: "LGA1851", memGen: "DDR5", price: 140, tier: "mainstream", form: "mATX", pcieGen: 5 },
		{ id: "b-b960", era: "b-lga1851", name: "B960", socket: "LGA1851", memGen: "DDR5", price: 155, tier: "mainstream", form: "mATX", pcieGen: 5 },
		{ id: "b-h810", era: "b-lga1851", name: "H810", socket: "LGA1851", memGen: "DDR5", price: 95, tier: "entry", form: "mATX", pcieGen: 4 },
		{ id: "b-h910", era: "b-lga1851", name: "H910", socket: "LGA1851", memGen: "DDR5", price: 105, tier: "entry", form: "mATX", pcieGen: 4 },
		{ id: "b-z790", era: "b-lga1700", name: "Z790", socket: "LGA1700", memGen: "DDR5", price: 220, tier: "flagship", form: "ATX", pcieGen: 5 },
		{ id: "b-z690", era: "b-lga1700", name: "Z690", socket: "LGA1700", memGen: "DDR5", price: 180, tier: "flagship", form: "ATX", pcieGen: 5 },
		{ id: "b-h770", era: "b-lga1700", name: "H770", socket: "LGA1700", memGen: "DDR5", price: 130, tier: "mid", form: "mATX", pcieGen: 4 },
		{ id: "b-h670", era: "b-lga1700", name: "H670", socket: "LGA1700", memGen: "DDR5", price: 115, tier: "mid", form: "mATX", pcieGen: 4 },
		{ id: "b-b760", era: "b-lga1700", name: "B760", socket: "LGA1700", memGen: "DDR4", price: 105, tier: "mainstream", form: "mATX", pcieGen: 4 },
		{ id: "b-b660", era: "b-lga1700", name: "B660", socket: "LGA1700", memGen: "DDR4", price: 90, tier: "mainstream", form: "mATX", pcieGen: 4 },
		{ id: "b-h610", era: "b-lga1700", name: "H610", socket: "LGA1700", memGen: "DDR4", price: 65, tier: "entry", form: "ITX", pcieGen: 4 },
		{ id: "b-z590", era: "b-lga1200", name: "Z590", socket: "LGA1200", memGen: "DDR4", price: 170, tier: "flagship", form: "ATX", pcieGen: 4 },
		{ id: "b-z490", era: "b-lga1200", name: "Z490", socket: "LGA1200", memGen: "DDR4", price: 140, tier: "flagship", form: "ATX", pcieGen: 3 },
		{ id: "b-h570", era: "b-lga1200", name: "H570", socket: "LGA1200", memGen: "DDR4", price: 110, tier: "mid", form: "mATX", pcieGen: 4 },
		{ id: "b-h470", era: "b-lga1200", name: "H470", socket: "LGA1200", memGen: "DDR4", price: 95, tier: "mid", form: "mATX", pcieGen: 3 },
		{ id: "b-b560", era: "b-lga1200", name: "B560", socket: "LGA1200", memGen: "DDR4", price: 95, tier: "mainstream", form: "mATX", pcieGen: 4 },
		{ id: "b-b460", era: "b-lga1200", name: "B460", socket: "LGA1200", memGen: "DDR4", price: 80, tier: "mainstream", form: "mATX", pcieGen: 3 },
		{ id: "b-h510", era: "b-lga1200", name: "H510", socket: "LGA1200", memGen: "DDR4", price: 60, tier: "entry", form: "mATX", pcieGen: 3 },
		{ id: "b-h410", era: "b-lga1200", name: "H410", socket: "LGA1200", memGen: "DDR4", price: 55, tier: "entry", form: "mATX", pcieGen: 3 },
		{ id: "b-z390", era: "b-lga1151", name: "Z390", socket: "LGA1151", memGen: "DDR4", price: 150, tier: "flagship", form: "ATX", pcieGen: 3 },
		{ id: "b-z370", era: "b-lga1151", name: "Z370", socket: "LGA1151", memGen: "DDR4", price: 130, tier: "flagship", form: "ATX", pcieGen: 3 },
		{ id: "b-h370", era: "b-lga1151", name: "H370", socket: "LGA1151", memGen: "DDR4", price: 105, tier: "mid", form: "mATX", pcieGen: 3 },
		{ id: "b-b365", era: "b-lga1151", name: "B365", socket: "LGA1151", memGen: "DDR4", price: 85, tier: "mainstream", form: "mATX", pcieGen: 3 },
		{ id: "b-b360", era: "b-lga1151", name: "B360", socket: "LGA1151", memGen: "DDR4", price: 80, tier: "mainstream", form: "mATX", pcieGen: 3 },
		{ id: "b-h310", era: "b-lga1151", name: "H310", socket: "LGA1151", memGen: "DDR4", price: 55, tier: "entry", form: "mATX", pcieGen: 3 },
		{ id: "b-z270", era: "b-lga1151", name: "Z270", socket: "LGA1151", memGen: "DDR4", price: 120, tier: "flagship", form: "ATX", pcieGen: 3 },
		{ id: "b-z170", era: "b-lga1151", name: "Z170", socket: "LGA1151", memGen: "DDR4", price: 110, tier: "flagship", form: "ATX", pcieGen: 3 },
		{ id: "b-h270", era: "b-lga1151", name: "H270", socket: "LGA1151", memGen: "DDR4", price: 90, tier: "mid", form: "mATX", pcieGen: 3 },
		{ id: "b-h170", era: "b-lga1151", name: "H170", socket: "LGA1151", memGen: "DDR4", price: 80, tier: "mid", form: "mATX", pcieGen: 3 },
		{ id: "b-b250", era: "b-lga1151", name: "B250", socket: "LGA1151", memGen: "DDR4", price: 70, tier: "mainstream", form: "mATX", pcieGen: 3 },
		{ id: "b-b150", era: "b-lga1151", name: "B150", socket: "LGA1151", memGen: "DDR4", price: 65, tier: "mainstream", form: "mATX", pcieGen: 3 },
		{ id: "b-h110", era: "b-lga1151", name: "H110", socket: "LGA1151", memGen: "DDR4", price: 50, tier: "entry", form: "mATX", pcieGen: 3 },
		{ id: "b-z97", era: "b-lga1150", name: "Z97", socket: "LGA1150", memGen: "DDR3", price: 100, tier: "flagship", form: "ATX", pcieGen: 3 },
		{ id: "b-z87", era: "b-lga1150", name: "Z87", socket: "LGA1150", memGen: "DDR3", price: 85, tier: "flagship", form: "ATX", pcieGen: 3 },
		{ id: "b-h97", era: "b-lga1150", name: "H97", socket: "LGA1150", memGen: "DDR3", price: 75, tier: "mid", form: "mATX", pcieGen: 3 },
		{ id: "b-h87", era: "b-lga1150", name: "H87", socket: "LGA1150", memGen: "DDR3", price: 65, tier: "mid", form: "mATX", pcieGen: 3 },
		{ id: "b-b85", era: "b-lga1150", name: "B85", socket: "LGA1150", memGen: "DDR3", price: 55, tier: "mainstream", form: "mATX", pcieGen: 3 },
		{ id: "b-h81", era: "b-lga1150", name: "H81", socket: "LGA1150", memGen: "DDR3", price: 40, tier: "entry", form: "mATX", pcieGen: 2 },
		{ id: "b-z77", era: "b-lga1155", name: "Z77", socket: "LGA1155", memGen: "DDR3", price: 70, tier: "flagship", form: "ATX", pcieGen: 3 },
		{ id: "b-z68", era: "b-lga1155", name: "Z68", socket: "LGA1155", memGen: "DDR3", price: 55, tier: "flagship", form: "ATX", pcieGen: 2 },
		{ id: "b-p67", era: "b-lga1155", name: "P67", socket: "LGA1155", memGen: "DDR3", price: 45, tier: "mid", form: "mATX", pcieGen: 2 },
		{ id: "b-h77", era: "b-lga1155", name: "H77", socket: "LGA1155", memGen: "DDR3", price: 50, tier: "mid", form: "mATX", pcieGen: 3 },
		{ id: "b-h61", era: "b-lga1155", name: "H61", socket: "LGA1155", memGen: "DDR3", price: 30, tier: "entry", form: "mATX", pcieGen: 2 },
		{ id: "b-h55", era: "b-lga1155", name: "H55", socket: "LGA1155", memGen: "DDR3", price: 25, tier: "entry", form: "mATX", pcieGen: 2 },
		{ id: "b-w790", era: "b-hedt-intel", name: "W790 (LGA 4677)", socket: "LGA4677", memGen: "DDR5", price: 700, tier: "workstation", form: "E-ATX", pcieGen: 5 },
		{ id: "b-x299", era: "b-hedt-intel", name: "X299 (LGA 2066)", socket: "LGA2066", memGen: "DDR4", price: 300, tier: "hedt", form: "E-ATX", pcieGen: 3 },
		{ id: "b-x99", era: "b-hedt-intel", name: "X99 (LGA 2011-v3)", socket: "LGA2011-3", memGen: "DDR4", price: 220, tier: "hedt", form: "E-ATX", pcieGen: 3 },
		{ id: "b-x79", era: "b-hedt-intel", name: "X79 (LGA 2011)", socket: "LGA2011", memGen: "DDR3", price: 170, tier: "hedt", form: "E-ATX", pcieGen: 3 },
		{ id: "b-x58", era: "b-hedt-intel", name: "X58 (LGA 1366)", socket: "LGA1366", memGen: "DDR3", price: 120, tier: "hedt", form: "ATX", pcieGen: 2 },
		{ id: "b-p45", era: "b-lga775", name: "P45 (LGA 775)", socket: "LGA775", memGen: "DDR3", price: 55, tier: "flagship", form: "ATX", pcieGen: 2 },
		{ id: "b-p43", era: "b-lga775", name: "P43 (LGA 775)", socket: "LGA775", memGen: "DDR3", price: 42, tier: "mainstream", form: "mATX", pcieGen: 2 },
		{ id: "b-lga775", era: "b-lga775", name: "G41 / P45 (LGA 775)", socket: "LGA775", memGen: "DDR3", price: 40, tier: "legacy", form: "mATX", pcieGen: 2 },
		{ id: "b-x870e", era: "b-am5", name: "X870E", socket: "AM5", memGen: "DDR5", price: 380, tier: "flagship", form: "ATX", pcieGen: 5 },
		{ id: "b-x670e", era: "b-am5", name: "X670E", socket: "AM5", memGen: "DDR5", price: 340, tier: "flagship", form: "ATX", pcieGen: 5 },
		{ id: "b-x870", era: "b-am5", name: "X870", socket: "AM5", memGen: "DDR5", price: 260, tier: "high", form: "ATX", pcieGen: 5 },
		{ id: "b-x670", era: "b-am5", name: "X670", socket: "AM5", memGen: "DDR5", price: 230, tier: "high", form: "ATX", pcieGen: 5 },
		{ id: "b-b850", era: "b-am5", name: "B850", socket: "AM5", memGen: "DDR5", price: 180, tier: "mainstream", form: "mATX", pcieGen: 5 },
		{ id: "b-b650e", era: "b-am5", name: "B650E", socket: "AM5", memGen: "DDR5", price: 170, tier: "mainstream", form: "mATX", pcieGen: 5 },
		{ id: "b-b840", era: "b-am5", name: "B840", socket: "AM5", memGen: "DDR5", price: 120, tier: "mainstream", form: "ITX", pcieGen: 4 },
		{ id: "b-b650", era: "b-am5", name: "B650", socket: "AM5", memGen: "DDR5", price: 130, tier: "mainstream", form: "mATX", pcieGen: 4 },
		{ id: "b-a620", era: "b-am5", name: "A620", socket: "AM5", memGen: "DDR5", price: 85, tier: "entry", form: "mATX", pcieGen: 4 },
		{ id: "b-x570", era: "b-am4", name: "X570", socket: "AM4", memGen: "DDR4", price: 190, tier: "flagship", form: "ATX", pcieGen: 4 },
		{ id: "b-b550", era: "b-am4", name: "B550", socket: "AM4", memGen: "DDR4", price: 120, tier: "mainstream", form: "mATX", pcieGen: 3 },
		{ id: "b-a520", era: "b-am4", name: "A520", socket: "AM4", memGen: "DDR4", price: 70, tier: "entry", form: "mATX", pcieGen: 3 },
		{ id: "b-x470", era: "b-am4", name: "X470", socket: "AM4", memGen: "DDR4", price: 100, tier: "high", form: "ATX", pcieGen: 3 },
		{ id: "b-b450", era: "b-am4", name: "B450", socket: "AM4", memGen: "DDR4", price: 75, tier: "mainstream", form: "mATX", pcieGen: 3 },
		{ id: "b-x370", era: "b-am4", name: "X370", socket: "AM4", memGen: "DDR4", price: 85, tier: "high", form: "ATX", pcieGen: 3 },
		{ id: "b-b350", era: "b-am4", name: "B350", socket: "AM4", memGen: "DDR4", price: 60, tier: "mainstream", form: "mATX", pcieGen: 3 },
		{ id: "b-a320", era: "b-am4", name: "A320", socket: "AM4", memGen: "DDR4", price: 45, tier: "entry", form: "ITX", pcieGen: 3 },
		{ id: "b-wrx90", era: "b-tr", name: "WRX90", socket: "sTR5", memGen: "DDR5", price: 1200, tier: "workstation", form: "E-ATX", pcieGen: 5 },
		{ id: "b-trx50", era: "b-tr", name: "TRX50", socket: "sTR5", memGen: "DDR5", price: 650, tier: "hedt", form: "E-ATX", pcieGen: 5 },
		{ id: "b-wrx80", era: "b-tr", name: "WRX80", socket: "sWRX8", memGen: "DDR4", price: 900, tier: "workstation", form: "E-ATX", pcieGen: 4 },
		{ id: "b-trx40", era: "b-tr", name: "TRX40", socket: "sTRX4", memGen: "DDR4", price: 500, tier: "hedt", form: "E-ATX", pcieGen: 4 },
		{ id: "b-x399", era: "b-tr", name: "X399", socket: "sTR4", memGen: "DDR4", price: 300, tier: "hedt", form: "E-ATX", pcieGen: 3 },
		{ id: "b-990fx", era: "b-am3plus", name: "990FX", socket: "AM3+", memGen: "DDR3", price: 90, tier: "flagship", form: "ATX", pcieGen: 2 },
		{ id: "b-990x", era: "b-am3plus", name: "990X", socket: "AM3+", memGen: "DDR3", price: 75, tier: "high", form: "ATX", pcieGen: 2 },
		{ id: "b-980g", era: "b-am3plus", name: "980G", socket: "AM3+", memGen: "DDR3", price: 60, tier: "mid", form: "mATX", pcieGen: 2 },
		{ id: "b-970", era: "b-am3plus", name: "970", socket: "AM3+", memGen: "DDR3", price: 50, tier: "mainstream", form: "mATX", pcieGen: 2 },
		{ id: "b-a88x", era: "b-fm2", name: "A88X", socket: "FM2+", memGen: "DDR3", price: 60, tier: "flagship", form: "ATX", pcieGen: 2 },
		{ id: "b-a85x", era: "b-fm2", name: "A85X", socket: "FM2+", memGen: "DDR3", price: 50, tier: "high", form: "ATX", pcieGen: 2 },
		{ id: "b-a78", era: "b-fm2", name: "A78", socket: "FM2+", memGen: "DDR3", price: 40, tier: "mid", form: "mATX", pcieGen: 2 },
		{ id: "b-a75", era: "b-fm2", name: "A75", socket: "FM2+", memGen: "DDR3", price: 35, tier: "mainstream", form: "mATX", pcieGen: 2 },
		{ id: "b-a68h", era: "b-fm2", name: "A68H", socket: "FM2+", memGen: "DDR3", price: 30, tier: "entry", form: "mATX", pcieGen: 2 },
		{ id: "b-a58", era: "b-fm2", name: "A58", socket: "FM2+", memGen: "DDR3", price: 25, tier: "entry", form: "mATX", pcieGen: 2 },
		{ id: "b-890fxa", era: "b-am3", name: "890FX (AM3)", socket: "AM3", memGen: "DDR3", price: 70, tier: "flagship", form: "ATX", pcieGen: 2 },
		{ id: "b-870a", era: "b-am3", name: "870 (AM3)", socket: "AM3", memGen: "DDR3", price: 45, tier: "mainstream", form: "mATX", pcieGen: 2 },
		{ id: "b-790fx", era: "b-am2plus", name: "790FX (AM2+)", socket: "AM2+", memGen: "DDR2", price: 55, tier: "flagship", form: "ATX", pcieGen: 2 },
		{ id: "b-780g", era: "b-am2plus", name: "780G (AM2+)", socket: "AM2+", memGen: "DDR2", price: 35, tier: "mainstream", form: "mATX", pcieGen: 2 },
		{ id: "b-nf590", era: "b-am2", name: "nForce 590 (AM2)", socket: "AM2", memGen: "DDR2", price: 30, tier: "high", form: "ATX", pcieGen: 1 },
		{ id: "b-s939", era: "b-939", name: "nForce4 (Socket 939)", socket: "939", memGen: "DDR", price: 25, tier: "legacy", form: "mATX", pcieGen: 1 },
		{ id: "b-h61s", era: "b-am3", name: "760G (AM3)", socket: "AM3", memGen: "DDR3", price: 35, tier: "entry", form: "mATX", pcieGen: 2 },
		{ id: "b-945g", era: "b-lga775d2", name: "945G (LGA 775)", socket: "LGA775", memGen: "DDR2", price: 28, tier: "legacy", form: "mATX", pcieGen: 1 },
		{ id: "b-975x", era: "b-lga775d2", name: "975X (LGA 775)", socket: "LGA775", memGen: "DDR2", price: 45, tier: "flagship", form: "ATX", pcieGen: 1 },
		{ id: "b-965p", era: "b-lga775d2", name: "P965 (LGA 775)", socket: "LGA775", memGen: "DDR2", price: 35, tier: "mainstream", form: "ATX", pcieGen: 1 },
	];

	// The memory market, by product line. Every line from the Corsair, G.Skill,
	// TeamGroup, Kingston, Crucial, Patriot, ADATA, PNY, V-Color, OLOy, GeIL and
	// Mushkin catalogues is here, plus the defunct brands and the OEM green
	// sticks. `band` is a bandwidth index normalised so DDR4-3600 = 1.0, and
	// `memGen` is what the socket has to match: a DDR5 chip will not POST with a
	// DDR4 kit, and the sim refuses it rather than pretending.
	const RAMS = [
		{ id: "8-2400", brand: "Generic", line: "JEDEC DDR4-2400", name: "JEDEC DDR4-2400", memGen: "DDR4", speed: 2400, mb: 8192, band: 0.62, price: 35 },
		{ id: "16-2400", brand: "Generic", line: "JEDEC DDR4-2400", name: "JEDEC DDR4-2400", memGen: "DDR4", speed: 2400, mb: 16384, band: 0.62, price: 55 },
		{ id: "16-3200", brand: "Generic", line: "JEDEC DDR4-3200", name: "JEDEC DDR4-3200", memGen: "DDR4", speed: 3200, mb: 16384, band: 0.82, price: 70 },
		{ id: "32-3200", brand: "Generic", line: "JEDEC DDR4-3200", name: "JEDEC DDR4-3200", memGen: "DDR4", speed: 3200, mb: 32768, band: 0.82, price: 120 },
		{ id: "32-3600", brand: "Generic", line: "JEDEC DDR4-3600 (above spec)", name: "JEDEC DDR4-3600 (above spec)", memGen: "DDR4", speed: 3600, mb: 32768, band: 1.00, price: 140 },
		{ id: "d2-2", brand: "Generic", line: "JEDEC DDR2-800", name: "JEDEC DDR2-800", memGen: "DDR2", speed: 800, mb: 2048, band: 0.30, price: 10 },
		{ id: "d2-4", brand: "Generic", line: "JEDEC DDR2-800", name: "JEDEC DDR2-800", memGen: "DDR2", speed: 800, mb: 4096, band: 0.30, price: 16 },
		{ id: "d3-4", brand: "Generic", line: "JEDEC DDR3-1333", name: "JEDEC DDR3-1333", memGen: "DDR3", speed: 1333, mb: 4096, band: 0.44, price: 12 },
		{ id: "d3-8", brand: "Generic", line: "JEDEC DDR3-1600", name: "JEDEC DDR3-1600", memGen: "DDR3", speed: 1600, mb: 8192, band: 0.55, price: 20 },
		{ id: "d3-16", brand: "Generic", line: "JEDEC DDR3-1600", name: "JEDEC DDR3-1600", memGen: "DDR3", speed: 1600, mb: 16384, band: 0.55, price: 34 },
		{ id: "d5-16", brand: "Generic", line: "JEDEC DDR5-5200", name: "JEDEC DDR5-5200", memGen: "DDR5", speed: 5200, mb: 16384, band: 1.42, price: 80 },
		{ id: "d5-32", brand: "Generic", line: "JEDEC DDR5-5600", name: "JEDEC DDR5-5600", memGen: "DDR5", speed: 5600, mb: 32768, band: 1.55, price: 130 },
		{ id: "d5-64", brand: "Generic", line: "JEDEC DDR5-6000", name: "JEDEC DDR5-6000", memGen: "DDR5", speed: 6000, mb: 65536, band: 1.66, price: 220 },
		{ id: "c-dom-tit-rgb", brand: "Corsair", line: "Dominator Titanium RGB", name: "Dominator Titanium RGB", memGen: "DDR5", speed: 6000, mb: 32768, band: 1.66, price: 210 },
		{ id: "c-dom-plat-rgb", brand: "Corsair", line: "Dominator Platinum RGB", name: "Dominator Platinum RGB", memGen: "DDR5", speed: 5600, mb: 32768, band: 1.55, price: 190 },
		{ id: "c-dom-plat-d4", brand: "Corsair", line: "Dominator Platinum", name: "Dominator Platinum", memGen: "DDR4", speed: 3200, mb: 16384, band: 0.82, price: 110 },
		{ id: "c-dom-gt", brand: "Corsair", line: "Dominator GT", name: "Dominator GT", memGen: "DDR3", speed: 2133, mb: 8192, band: 0.66, price: 40 },
		{ id: "c-vengeance-rgb-pro", brand: "Corsair", line: "Vengeance RGB Pro", name: "Vengeance RGB Pro", memGen: "DDR4", speed: 3600, mb: 16384, band: 1.00, price: 95 },
		{ id: "c-vengeance-lpx", brand: "Corsair", line: "Vengeance LPX", name: "Vengeance LPX", memGen: "DDR4", speed: 3200, mb: 16384, band: 0.82, price: 72 },
		{ id: "c-vengeance-sodimm", brand: "Corsair", line: "Vengeance SODIMM", name: "Vengeance SODIMM", memGen: "DDR4", speed: 3200, mb: 16384, band: 0.82, price: 80 },
		{ id: "c-xms3", brand: "Corsair", line: "XMS3", name: "XMS3", memGen: "DDR3", speed: 1600, mb: 8192, band: 0.55, price: 24 },
		{ id: "c-xms2", brand: "Corsair", line: "XMS2", name: "XMS2", memGen: "DDR2", speed: 800, mb: 4096, band: 0.30, price: 18 },
		{ id: "c-valueselect", brand: "Corsair", line: "ValueSelect", name: "ValueSelect", memGen: "DDR4", speed: 2666, mb: 8192, band: 0.68, price: 32 },
		{ id: "c-mac-memory", brand: "Corsair", line: "Mac Memory", name: "Mac Memory", memGen: "DDR3", speed: 1333, mb: 8192, band: 0.44, price: 30 },
		{ id: "g-trident-z5-royal", brand: "G.Skill", line: "Trident Z5 Royal", name: "Trident Z5 Royal", memGen: "DDR5", speed: 6400, mb: 32768, band: 1.78, price: 240 },
		{ id: "g-trident-z5-rgb", brand: "G.Skill", line: "Trident Z5 RGB", name: "Trident Z5 RGB", memGen: "DDR5", speed: 6000, mb: 32768, band: 1.66, price: 195 },
		{ id: "g-trident-z5-neo", brand: "G.Skill", line: "Trident Z5 Neo", name: "Trident Z5 Neo", memGen: "DDR5", speed: 6000, mb: 32768, band: 1.66, price: 190 },
		{ id: "g-trident-z-rgb", brand: "G.Skill", line: "Trident Z RGB", name: "Trident Z RGB", memGen: "DDR4", speed: 3600, mb: 16384, band: 1.00, price: 98 },
		{ id: "g-trident-x", brand: "G.Skill", line: "Trident X", name: "Trident X", memGen: "DDR3", speed: 2133, mb: 8192, band: 0.66, price: 45 },
		{ id: "g-ripjaws-s5", brand: "G.Skill", line: "Ripjaws S5", name: "Ripjaws S5", memGen: "DDR5", speed: 5200, mb: 16384, band: 1.42, price: 88 },
		{ id: "g-ripjaws-v", brand: "G.Skill", line: "Ripjaws V", name: "Ripjaws V", memGen: "DDR4", speed: 3200, mb: 16384, band: 0.82, price: 70 },
		{ id: "g-ripjaws-x", brand: "G.Skill", line: "Ripjaws X", name: "Ripjaws X", memGen: "DDR3", speed: 1600, mb: 8192, band: 0.55, price: 22 },
		{ id: "g-flare-x5", brand: "G.Skill", line: "Flare X5", name: "Flare X5", memGen: "DDR5", speed: 5600, mb: 32768, band: 1.55, price: 145 },
		{ id: "g-flare-x", brand: "G.Skill", line: "Flare X", name: "Flare X", memGen: "DDR4", speed: 3200, mb: 16384, band: 0.82, price: 74 },
		{ id: "g-sniper-x", brand: "G.Skill", line: "Sniper X", name: "Sniper X", memGen: "DDR4", speed: 3200, mb: 16384, band: 0.82, price: 68 },
		{ id: "g-aegis", brand: "G.Skill", line: "Aegis", name: "Aegis", memGen: "DDR4", speed: 3000, mb: 8192, band: 0.76, price: 30 },
		{ id: "g-fortis", brand: "G.Skill", line: "Fortis", name: "Fortis", memGen: "DDR4", speed: 2400, mb: 8192, band: 0.62, price: 26 },
		{ id: "g-ares", brand: "G.Skill", line: "Ares", name: "Ares", memGen: "DDR3", speed: 1600, mb: 8192, band: 0.55, price: 20 },
		{ id: "g-eco", brand: "G.Skill", line: "Eco", name: "Eco", memGen: "DDR3", speed: 1600, mb: 8192, band: 0.55, price: 22 },
		{ id: "g-pi", brand: "G.Skill", line: "Pi", name: "Pi", memGen: "DDR3", speed: 1600, mb: 8192, band: 0.55, price: 25 },
		{ id: "g-nq-pk-hz", brand: "G.Skill", line: "NQ / PK / HZ", name: "NQ / PK / HZ", memGen: "DDR2", speed: 800, mb: 4096, band: 0.30, price: 14 },
		{ id: "t-xtreem-argb", brand: "TeamGroup", line: "T-Force Xtreem ARGB", name: "T-Force Xtreem ARGB", memGen: "DDR5", speed: 7200, mb: 32768, band: 1.98, price: 290 },
		{ id: "t-delta-rgb", brand: "TeamGroup", line: "T-Force Delta RGB", name: "T-Force Delta RGB", memGen: "DDR5", speed: 6000, mb: 32768, band: 1.66, price: 180 },
		{ id: "t-vulcan", brand: "TeamGroup", line: "T-Force Vulcan", name: "T-Force Vulcan", memGen: "DDR5", speed: 5200, mb: 16384, band: 1.42, price: 82 },
		{ id: "t-siren", brand: "TeamGroup", line: "T-Force Siren", name: "T-Force Siren", memGen: "DDR5", speed: 6000, mb: 32768, band: 1.66, price: 210 },
		{ id: "t-dark-pro", brand: "TeamGroup", line: "T-Force Dark Pro", name: "T-Force Dark Pro", memGen: "DDR4", speed: 3200, mb: 16384, band: 0.82, price: 78 },
		{ id: "t-night-hawk", brand: "TeamGroup", line: "T-Force Night Hawk RGB", name: "T-Force Night Hawk RGB", memGen: "DDR4", speed: 3000, mb: 16384, band: 0.76, price: 70 },
		{ id: "t-blitz", brand: "TeamGroup", line: "T-Force Blitz", name: "T-Force Blitz", memGen: "DDR4", speed: 2666, mb: 16384, band: 0.68, price: 60 },
		{ id: "t-create-expert", brand: "TeamGroup", line: "T-Create Expert", name: "T-Create Expert", memGen: "DDR5", speed: 6000, mb: 32768, band: 1.66, price: 165 },
		{ id: "t-create-classic", brand: "TeamGroup", line: "T-Create Classic", name: "T-Create Classic", memGen: "DDR4", speed: 3200, mb: 32768, band: 0.82, price: 115 },
		{ id: "t-create-cinema", brand: "TeamGroup", line: "T-Create Cinema", name: "T-Create Cinema", memGen: "DDR5", speed: 5600, mb: 65536, band: 1.55, price: 260 },
		{ id: "t-elite", brand: "TeamGroup", line: "Team Elite", name: "Team Elite", memGen: "DDR4", speed: 2400, mb: 8192, band: 0.62, price: 28 },
		{ id: "t-vulcan-legacy", brand: "TeamGroup", line: "Team Vulcan", name: "Team Vulcan", memGen: "DDR3", speed: 1600, mb: 8192, band: 0.55, price: 18 },
		{ id: "k-fury-renegade", brand: "Kingston", line: "FURY Renegade RGB", name: "FURY Renegade RGB", memGen: "DDR5", speed: 6400, mb: 32768, band: 1.78, price: 220 },
		{ id: "k-fury-beast", brand: "Kingston", line: "FURY Beast", name: "FURY Beast", memGen: "DDR5", speed: 5600, mb: 32768, band: 1.55, price: 150 },
		{ id: "k-fury-impact", brand: "Kingston", line: "FURY Impact SODIMM", name: "FURY Impact SODIMM", memGen: "DDR5", speed: 5200, mb: 16384, band: 1.42, price: 90 },
		{ id: "k-hyperx-predator", brand: "Kingston", line: "HyperX Predator", name: "HyperX Predator", memGen: "DDR4", speed: 3600, mb: 16384, band: 1.00, price: 100 },
		{ id: "k-hyperx-savage", brand: "Kingston", line: "HyperX Savage", name: "HyperX Savage", memGen: "DDR4", speed: 3000, mb: 16384, band: 0.76, price: 72 },
		{ id: "k-hyperx-fury", brand: "Kingston", line: "HyperX Fury", name: "HyperX Fury", memGen: "DDR4", speed: 2666, mb: 16384, band: 0.68, price: 62 },
		{ id: "k-hyperx-genesis", brand: "Kingston", line: "HyperX Genesis", name: "HyperX Genesis", memGen: "DDR3", speed: 1600, mb: 8192, band: 0.55, price: 22 },
		{ id: "k-hyperx-t1", brand: "Kingston", line: "HyperX T1", name: "HyperX T1", memGen: "DDR3", speed: 1600, mb: 8192, band: 0.55, price: 28 },
		{ id: "k-valueram", brand: "Kingston", line: "ValueRAM (KVR)", name: "ValueRAM (KVR)", memGen: "DDR4", speed: 2666, mb: 8192, band: 0.68, price: 30 },
		{ id: "cr-pro-oc", brand: "Crucial", line: "Pro Overclocking", name: "Pro Overclocking", memGen: "DDR5", speed: 6000, mb: 32768, band: 1.66, price: 170 },
		{ id: "cr-ballistix-max", brand: "Crucial", line: "Ballistix MAX RGB", name: "Ballistix MAX RGB", memGen: "DDR4", speed: 4000, mb: 16384, band: 1.10, price: 130 },
		{ id: "cr-ballistix-rgb", brand: "Crucial", line: "Ballistix RGB", name: "Ballistix RGB", memGen: "DDR4", speed: 3600, mb: 16384, band: 1.00, price: 95 },
		{ id: "cr-ballistix-elite", brand: "Crucial", line: "Ballistix Elite", name: "Ballistix Elite", memGen: "DDR4", speed: 3200, mb: 16384, band: 0.82, price: 88 },
		{ id: "cr-ballistix-tactical", brand: "Crucial", line: "Ballistix Tactical Tracer", name: "Ballistix Tactical Tracer", memGen: "DDR4", speed: 3000, mb: 16384, band: 0.76, price: 75 },
		{ id: "cr-ballistix-sport", brand: "Crucial", line: "Ballistix Sport LT", name: "Ballistix Sport LT", memGen: "DDR4", speed: 2666, mb: 8192, band: 0.68, price: 38 },
		{ id: "cr-standard", brand: "Crucial", line: "Standard Unbuffered", name: "Standard Unbuffered", memGen: "DDR4", speed: 2666, mb: 8192, band: 0.68, price: 32 },
		{ id: "cr-ct", brand: "Crucial", line: "CT Series", name: "CT Series", memGen: "DDR3", speed: 1600, mb: 8192, band: 0.55, price: 20 },
		{ id: "p-viper-extreme-5", brand: "Patriot", line: "Viper Extreme 5 RGB", name: "Viper Extreme 5 RGB", memGen: "DDR5", speed: 7200, mb: 32768, band: 1.98, price: 280 },
		{ id: "p-viper-venom", brand: "Patriot", line: "Viper Venom RGB", name: "Viper Venom RGB", memGen: "DDR5", speed: 5600, mb: 32768, band: 1.55, price: 155 },
		{ id: "p-viper-elite-5", brand: "Patriot", line: "Viper Elite 5", name: "Viper Elite 5", memGen: "DDR5", speed: 5200, mb: 16384, band: 1.42, price: 85 },
		{ id: "p-viper-steel", brand: "Patriot", line: "Viper Steel", name: "Viper Steel", memGen: "DDR4", speed: 3600, mb: 16384, band: 1.00, price: 92 },
		{ id: "p-viper-4", brand: "Patriot", line: "Viper 4", name: "Viper 4", memGen: "DDR4", speed: 3200, mb: 16384, band: 0.82, price: 70 },
		{ id: "p-viper-elite", brand: "Patriot", line: "Viper Elite II", name: "Viper Elite II", memGen: "DDR4", speed: 2666, mb: 8192, band: 0.68, price: 34 },
		{ id: "p-viper-3", brand: "Patriot", line: "Viper 3", name: "Viper 3", memGen: "DDR3", speed: 1600, mb: 8192, band: 0.55, price: 21 },
		{ id: "p-signature", brand: "Patriot", line: "Signature Line", name: "Signature Line", memGen: "DDR4", speed: 2400, mb: 8192, band: 0.62, price: 28 },
		{ id: "a-lancer", brand: "ADATA", line: "XPG Lancer RGB", name: "XPG Lancer RGB", memGen: "DDR5", speed: 6400, mb: 32768, band: 1.78, price: 200 },
		{ id: "a-caster", brand: "ADATA", line: "XPG Caster RGB", name: "XPG Caster RGB", memGen: "DDR5", speed: 6000, mb: 32768, band: 1.66, price: 175 },
		{ id: "a-hunter", brand: "ADATA", line: "XPG Hunter", name: "XPG Hunter", memGen: "DDR5", speed: 5200, mb: 16384, band: 1.42, price: 80 },
		{ id: "a-spectrix-d80", brand: "ADATA", line: "XPG Spectrix D80", name: "XPG Spectrix D80", memGen: "DDR4", speed: 3600, mb: 16384, band: 1.00, price: 90 },
		{ id: "a-gammix-d30", brand: "ADATA", line: "XPG Gammix D30", name: "XPG Gammix D30", memGen: "DDR4", speed: 3200, mb: 16384, band: 0.82, price: 66 },
		{ id: "a-z1", brand: "ADATA", line: "XPG Z1", name: "XPG Z1", memGen: "DDR4", speed: 3000, mb: 8192, band: 0.76, price: 34 },
		{ id: "a-premier", brand: "ADATA", line: "Premier", name: "Premier", memGen: "DDR4", speed: 2666, mb: 8192, band: 0.68, price: 30 },
		{ id: "pn-mako", brand: "PNY", line: "XLR8 Gaming MAKO RGB", name: "XLR8 Gaming MAKO RGB", memGen: "DDR5", speed: 6000, mb: 32768, band: 1.66, price: 180 },
		{ id: "pn-epic-x", brand: "PNY", line: "XLR8 Gaming Epic-X RGB", name: "XLR8 Gaming Epic-X RGB", memGen: "DDR4", speed: 3200, mb: 16384, band: 0.82, price: 74 },
		{ id: "pn-xlr8-perf", brand: "PNY", line: "XLR8 Gaming Performance", name: "XLR8 Gaming Performance", memGen: "DDR4", speed: 3200, mb: 8192, band: 0.82, price: 40 },
		{ id: "pn-performance", brand: "PNY", line: "Performance", name: "Performance", memGen: "DDR4", speed: 2666, mb: 8192, band: 0.68, price: 28 },
		{ id: "v-manta-xfinity", brand: "V-Color", line: "Manta xFinity RGB", name: "Manta xFinity RGB", memGen: "DDR5", speed: 7200, mb: 32768, band: 1.98, price: 300 },
		{ id: "v-manta-xsky", brand: "V-Color", line: "Manta xSky RGB", name: "Manta xSky RGB", memGen: "DDR5", speed: 6400, mb: 32768, band: 1.78, price: 210 },
		{ id: "v-manta-xprism", brand: "V-Color", line: "Manta xPrism RGB", name: "Manta xPrism RGB", memGen: "DDR5", speed: 6000, mb: 32768, band: 1.66, price: 185 },
		{ id: "v-prism-pro", brand: "V-Color", line: "Prism Pro RGB", name: "Prism Pro RGB", memGen: "DDR4", speed: 3600, mb: 16384, band: 1.00, price: 92 },
		{ id: "v-skywalker", brand: "V-Color", line: "Skywalker", name: "Skywalker", memGen: "DDR4", speed: 3200, mb: 16384, band: 0.82, price: 72 },
		{ id: "o-blade", brand: "OLOy", line: "Blade RGB", name: "Blade RGB", memGen: "DDR5", speed: 6000, mb: 32768, band: 1.66, price: 170 },
		{ id: "o-warhawk", brand: "OLOy", line: "Warhawk RGB", name: "Warhawk RGB", memGen: "DDR4", speed: 3600, mb: 16384, band: 1.00, price: 88 },
		{ id: "o-owl", brand: "OLOy", line: "Owl", name: "Owl", memGen: "DDR4", speed: 3200, mb: 16384, band: 0.82, price: 66 },
		{ id: "o-blank", brand: "OLOy", line: "OLOy Blank", name: "OLOy Blank", memGen: "DDR4", speed: 2666, mb: 8192, band: 0.68, price: 26 },
		{ id: "ge-polaris", brand: "GeIL", line: "Polaris RGB", name: "Polaris RGB", memGen: "DDR5", speed: 6000, mb: 32768, band: 1.66, price: 175 },
		{ id: "ge-orion", brand: "GeIL", line: "Orion RGB", name: "Orion RGB", memGen: "DDR4", speed: 3200, mb: 16384, band: 0.82, price: 72 },
		{ id: "ge-super-luce", brand: "GeIL", line: "Super Luce RGB", name: "Super Luce RGB", memGen: "DDR4", speed: 3000, mb: 16384, band: 0.76, price: 68 },
		{ id: "ge-evo-x", brand: "GeIL", line: "EVO X II RGB", name: "EVO X II RGB", memGen: "DDR4", speed: 3200, mb: 16384, band: 0.82, price: 76 },
		{ id: "ge-evo-spear", brand: "GeIL", line: "EVO Spear", name: "EVO Spear", memGen: "DDR4", speed: 2666, mb: 8192, band: 0.68, price: 30 },
		{ id: "ge-dragon-ram", brand: "GeIL", line: "Dragon RAM", name: "Dragon RAM", memGen: "DDR3", speed: 1600, mb: 8192, band: 0.55, price: 24 },
		{ id: "ge-black-dragon", brand: "GeIL", line: "Black Dragon", name: "Black Dragon", memGen: "DDR2", speed: 800, mb: 4096, band: 0.30, price: 16 },
		{ id: "ge-ultra", brand: "GeIL", line: "Ultra / Pristine", name: "Ultra / Pristine", memGen: "DDR3", speed: 1333, mb: 4096, band: 0.44, price: 14 },
		{ id: "m-redline", brand: "Mushkin", line: "Redline Lumina", name: "Redline Lumina", memGen: "DDR5", speed: 6000, mb: 32768, band: 1.66, price: 175 },
		{ id: "m-blackline", brand: "Mushkin", line: "Blackline Ridge", name: "Blackline Ridge", memGen: "DDR4", speed: 3200, mb: 16384, band: 0.82, price: 70 },
		{ id: "m-silverline", brand: "Mushkin", line: "Silverline", name: "Silverline", memGen: "DDR4", speed: 2666, mb: 8192, band: 0.68, price: 30 },
		{ id: "m-essentials", brand: "Mushkin", line: "Essentials", name: "Essentials", memGen: "DDR4", speed: 2400, mb: 8192, band: 0.62, price: 26 },
		{ id: "m-radioactive", brand: "Mushkin", line: "Enhanced / Radioactive", name: "Enhanced / Radioactive", memGen: "DDR3", speed: 1600, mb: 8192, band: 0.55, price: 22 },
		{ id: "m-extreme-xp", brand: "Mushkin", line: "Extreme / XP", name: "Extreme / XP", memGen: "DDR2", speed: 1066, mb: 4096, band: 0.36, price: 18 },
		{ id: "d-ocz-reaper", brand: "OCZ", line: "Reaper HPC", name: "Reaper HPC", memGen: "DDR3", speed: 1600, mb: 8192, band: 0.55, price: 24 },
		{ id: "d-ocz-flexxlc", brand: "OCZ", line: "FlexXLC", name: "FlexXLC", memGen: "DDR2", speed: 1066, mb: 4096, band: 0.36, price: 18 },
		{ id: "d-hyperx-blue", brand: "Kingston", line: "HyperX Blue (legacy)", name: "HyperX Blue (legacy)", memGen: "DDR2", speed: 800, mb: 4096, band: 0.30, price: 15 },
		{ id: "d-winbond-bh5", brand: "Winbond", line: "BH-5 / CH-5", name: "BH-5 / CH-5", memGen: "DDR", speed: 400, mb: 1024, band: 0.20, price: 12 },
		{ id: "d-oem-green", brand: "OEM", line: "Samsung / SK Hynix / Micron reference", name: "Samsung / SK Hynix / Micron reference", memGen: "DDR4", speed: 2666, mb: 8192, band: 0.68, price: 24 },
	];

	// The power supply. It is the part that decides whether any of the rest of it
	// runs: capacity against the build's draw, enough PCIe cables for the card, and
	// an 80+ rating that sets how much of the wall draw is wasted as heat. That last
	// one is why mining profit depends on the PSU - a Gold unit costs real money
	// less to run than a White one doing identical work.
	const PSUS = [
		{ id: "psu300", name: "300 W Generic (case bundled)", watts: 300, efficiency: 0.70, connectors: 0, price: 22, tier: "bundled" },
		{ id: "psu450", name: "450 W 80+ White", watts: 450, efficiency: 0.82, connectors: 1, price: 38, tier: "budget" },
		{ id: "psu550", name: "550 W 80+ Bronze", watts: 550, efficiency: 0.85, connectors: 2, price: 52, tier: "budget" },
		{ id: "psu650", name: "650 W 80+ Bronze", watts: 650, efficiency: 0.85, connectors: 2, price: 68, tier: "mainstream" },
		{ id: "psu750", name: "750 W 80+ Gold", watts: 750, efficiency: 0.90, connectors: 3, price: 95, tier: "mainstream" },
		{ id: "psu850", name: "850 W 80+ Gold", watts: 850, efficiency: 0.90, connectors: 3, price: 125, tier: "enthusiast" },
		{ id: "psu1000", name: "1000 W 80+ Platinum", watts: 1000, efficiency: 0.92, connectors: 4, price: 175, tier: "enthusiast" },
		{ id: "psu1200", name: "1200 W 80+ Titanium", watts: 1200, efficiency: 0.94, connectors: 4, price: 250, tier: "flagship" },
		{ id: "psu1600", name: "1600 W 80+ Titanium", watts: 1600, efficiency: 0.94, connectors: 6, price: 420, tier: "workstation" },
	];

	// The case. It decides four things a spec sheet usually hides: which board form
	// factor bolts into it, how long a graphics card fits, how many drive bays there
	// are, and how much heat it can shed. That last one is why a small case with a
	// big card throttles - and the number it is compared against is the same
	// wattage the power supply has to carry.
	const CASES = [
		{ id: "case_mini", name: "Compact mATX Tower", forms: ["mATX", "ITX"], maxGpuMm: 250, bays35: 1, bays25: 2,
			coolingW: 130, price: 42, tier: "budget" },
		{ id: "case_itx", name: "ITX Small Form Factor", forms: ["ITX"], maxGpuMm: 200, bays35: 0, bays25: 2,
			coolingW: 95, price: 55, tier: "budget" },
		{ id: "case_mid", name: "Mid Tower", forms: ["ATX", "mATX", "ITX"], maxGpuMm: 320, bays35: 2, bays25: 4,
			coolingW: 260, price: 68, tier: "mainstream" },
		{ id: "case_mesh", name: "Mesh-Front Airflow Tower", forms: ["ATX", "mATX", "ITX"], maxGpuMm: 340, bays35: 2, bays25: 4,
			coolingW: 380, price: 95, tier: "mainstream" },
		{ id: "case_silent", name: "Sound-Dampened Tower", forms: ["ATX", "mATX", "ITX"], maxGpuMm: 330, bays35: 3, bays25: 5,
			coolingW: 240, price: 110, tier: "enthusiast" },
		{ id: "case_full", name: "Full Tower", forms: ["E-ATX", "ATX", "mATX", "ITX"], maxGpuMm: 400, bays35: 4, bays25: 6,
			coolingW: 460, price: 150, tier: "enthusiast" },
		{ id: "case_bench", name: "Open Test Bench", forms: ["E-ATX", "ATX", "mATX", "ITX"], maxGpuMm: 420, bays35: 2, bays25: 4,
			coolingW: 620, price: 130, tier: "specialist" },
		{ id: "case_rack", name: "Workstation Rack Chassis", forms: ["E-ATX", "ATX"], maxGpuMm: 350, bays35: 8, bays25: 8,
			coolingW: 800, price: 260, tier: "workstation" },
	];

	const STORAGE = [
		{ id: "hdd",  name: "2 TB Hard Disk",   loadFactor: 6.0, price: 50,  bays35: 1 },
		{ id: "sata", name: "1 TB SATA SSD",    loadFactor: 1.6, price: 80,  bays25: 1 },
		{ id: "nvme", name: "1 TB NVMe SSD",    loadFactor: 1.0, price: 110 },
	];

	// ------------------------------------------------------------ workloads
	// engineBase: the renderer's own working set, in MB.
	// textureBase: texture budget at 1080p / Medium.
	// rtMultiplier: extra fraction of the sum when ray tracing is on.
	// modsMb: added by a modded install.
	// cpuNeed: how much CPU index the title wants for its target.
	// gpuCost: how hard the title is to RENDER, independent of the card. Without
	// it an esports shooter and a ray-traced showcase compute the same frame rate
	// on the same GPU, which is the mistake that made the first model useless.
	// rtDefault: whether this title is run with ray tracing, which is what the
	// ray-traced showcase is for.
	// The benchmark suite: every game on the list that shipped on PC. Four did not
	// (Breath of the Wild, Super Mario Odyssey, Splatoon 2, Xenoblade Chronicles 2),
	// so they cannot be PC workloads and are not here.
	//
	// `gpuCost` is a title's weight against one published anchor - Assassin's Creed
	// Origins, 1080p medium, RTX 3060 = 59 fps. `cpuDemand` is the same idea for the
	// processor, where 1.0 means a Ryzen 5 3600 reaches about 140 fps.
	//
	// None of these titles supports ray tracing - it reached PC in 2018 - so every
	// rt figure is zero and the ray-tracing toggle has no effect on this suite.
	//
	// `measured` marks the titles whose weight is derived from a real benchmark.
	// The rest are placed from engine, scale and era: the ORDERING is sound and the
	// spacing is an estimate, and the field says which is which rather than letting
	// a reader assume they are all measured.
	const GAMES = [
		{ id: "ddlc", name: "Doki Doki Literature Club!", engineBase: 120, textureBase: 60, rt: 0.00, modsMb: 0,
			cpuDemand: 0.55, targetFps: 60, gpuCost: 0.22, cap: 60, rtDefault: false },
		{ id: "sonicmania", name: "Sonic Mania", engineBase: 140, textureBase: 80, rt: 0.00, modsMb: 0,
			cpuDemand: 0.55, targetFps: 60, gpuCost: 0.22, cap: 60, rtDefault: false },
		{ id: "nightwoods", name: "Night in the Woods", engineBase: 180, textureBase: 120, rt: 0.00, modsMb: 0,
			cpuDemand: 0.55, targetFps: 60, gpuCost: 0.22, cap: 60, rtDefault: false },
		{ id: "hollow", name: "Hollow Knight", engineBase: 260, textureBase: 200, rt: 0.00, modsMb: 0,
			cpuDemand: 0.55, targetFps: 60, gpuCost: 0.22, cap: 60, rtDefault: false },
		{ id: "cuphead", name: "Cuphead", engineBase: 300, textureBase: 260, rt: 0.00, modsMb: 0,
			cpuDemand: 0.55, targetFps: 60, gpuCost: 0.22, cap: 60, rtDefault: false },
		{ id: "edith", name: "What Remains of Edith Finch", engineBase: 380, textureBase: 420, rt: 0.00, modsMb: 0,
			cpuDemand: 0.55, targetFps: 60, gpuCost: 0.22, cap: 60, rtDefault: false },
		{ id: "bendy", name: "Bendy and the Ink Machine", engineBase: 400, textureBase: 380, rt: 0.00, modsMb: 0,
			cpuDemand: 0.55, targetFps: 60, gpuCost: 0.22, cap: 60, rtDefault: false },
		{ id: "little", name: "Little Nightmares", engineBase: 480, textureBase: 520, rt: 0.00, modsMb: 0,
			cpuDemand: 0.55, targetFps: 60, gpuCost: 0.22, cap: 60, rtDefault: false },
		{ id: "tekken7", name: "Tekken 7", engineBase: 520, textureBase: 600, rt: 0.00, modsMb: 0,
			cpuDemand: 0.60, targetFps: 60, gpuCost: 0.25, cap: 60, rtDefault: false },
		{ id: "persona5", name: "Persona 5", engineBase: 540, textureBase: 700, rt: 0.00, modsMb: 0,
			cpuDemand: 0.55, targetFps: 60, gpuCost: 0.25, cap: 60, rtDefault: false },
		{ id: "re7", name: "Resident Evil 7", engineBase: 600, textureBase: 900, rt: 0.00, modsMb: 0,
			cpuDemand: 0.60, targetFps: 60, gpuCost: 0.30, rtDefault: false },
		{ id: "southpark", name: "South Park: The Fractured But Whole", engineBase: 560, textureBase: 700, rt: 0.00, modsMb: 0,
			cpuDemand: 0.55, targetFps: 60, gpuCost: 0.30, cap: 60, rtDefault: false },
		{ id: "injustice", name: "Injustice 2", engineBase: 620, textureBase: 900, rt: 0.00, modsMb: 0,
			cpuDemand: 0.60, targetFps: 60, gpuCost: 0.30, cap: 60, rtDefault: false },
		{ id: "fortnite", name: "Fortnite", engineBase: 640, textureBase: 800, rt: 0.00, modsMb: 0,
			cpuDemand: 1.15, targetFps: 144, gpuCost: 0.30, rtDefault: false },
		{ id: "yakuza0", name: "Yakuza 0", engineBase: 700, textureBase: 900, rt: 0.00, modsMb: 0,
			cpuDemand: 0.70, targetFps: 60, gpuCost: 0.35, cap: 60, rtDefault: false },
		{ id: "nier", name: "NieR: Automata", engineBase: 700, textureBase: 950, rt: 0.00, modsMb: 0,
			cpuDemand: 0.65, targetFps: 60, gpuCost: 0.35, cap: 60, rtDefault: false },
		{ id: "divinity", name: "Divinity: Original Sin II", engineBase: 680, textureBase: 850, rt: 0.00, modsMb: 0,
			cpuDemand: 0.75, targetFps: 60, gpuCost: 0.35, rtDefault: false },
		{ id: "halowars2", name: "Halo Wars 2", engineBase: 700, textureBase: 900, rt: 0.00, modsMb: 0,
			cpuDemand: 0.75, targetFps: 60, gpuCost: 0.35, cap: 60, rtDefault: false },
		{ id: "destiny2", name: "Destiny 2", engineBase: 720, textureBase: 1000, rt: 0.00, modsMb: 0,
			cpuDemand: 0.70, targetFps: 60, gpuCost: 0.40, rtDefault: false, measured: true },
		{ id: "nioh", name: "Nioh", engineBase: 760, textureBase: 1100, rt: 0.00, modsMb: 0,
			cpuDemand: 0.75, targetFps: 60, gpuCost: 0.40, rtDefault: false },
		{ id: "wolf2", name: "Wolfenstein II: The New Colossus", engineBase: 800, textureBase: 1300, rt: 0.00, modsMb: 0,
			cpuDemand: 0.70, targetFps: 60, gpuCost: 0.45, cap: 60, rtDefault: false },
		{ id: "prey", name: "Prey", engineBase: 820, textureBase: 1400, rt: 0.00, modsMb: 0,
			cpuDemand: 0.75, targetFps: 60, gpuCost: 0.50, rtDefault: false },
		{ id: "codwwii", name: "Call of Duty: WWII", engineBase: 850, textureBase: 1500, rt: 0.00, modsMb: 0,
			cpuDemand: 0.80, targetFps: 60, gpuCost: 0.50, rtDefault: false },
		{ id: "evilwithin2", name: "The Evil Within 2", engineBase: 860, textureBase: 1500, rt: 0.00, modsMb: 0,
			cpuDemand: 0.80, targetFps: 60, gpuCost: 0.55, cap: 60, rtDefault: false },
		{ id: "battlefront2", name: "Star Wars Battlefront II", engineBase: 900, textureBase: 1700, rt: 0.00, modsMb: 0,
			cpuDemand: 0.85, targetFps: 60, gpuCost: 0.55, cap: 200, rtDefault: false },
		{ id: "pubg", name: "PlayerUnknown's Battlegrounds", engineBase: 950, textureBase: 1800, rt: 0.00, modsMb: 0,
			cpuDemand: 1.30, targetFps: 60, gpuCost: 0.60, rtDefault: false },
		{ id: "totalwar2", name: "Total War: Warhammer II", engineBase: 950, textureBase: 1900, rt: 0.00, modsMb: 0,
			cpuDemand: 1.45, targetFps: 60, gpuCost: 0.65, rtDefault: false },
		{ id: "uncharted", name: "Uncharted: The Lost Legacy", engineBase: 1000, textureBase: 2200, rt: 0.00, modsMb: 0,
			cpuDemand: 0.85, targetFps: 60, gpuCost: 0.70, rtDefault: false },
		{ id: "horizon", name: "Horizon Zero Dawn", engineBase: 1050, textureBase: 2400, rt: 0.00, modsMb: 0,
			cpuDemand: 1.05, targetFps: 60, gpuCost: 0.95, rtDefault: false },
		{ id: "aco", name: "Assassin's Creed Origins", engineBase: 950, textureBase: 2200, rt: 0.00, modsMb: 0,
			cpuDemand: 1.00, targetFps: 60, gpuCost: 1.00, rtDefault: false, measured: true },
	];

	const RESOLUTIONS = [
		{ id: "1080p", name: "1920x1080", pixels: 2073600 },
		{ id: "1440p", name: "2560x1440", pixels: 3686400 },
		{ id: "4k",    name: "3840x2160", pixels: 8294400 },
	];

	// `gpuFactor` divides the frame rate, so a bigger number is slower. Medium is
	// the calibration anchor at 1.00, and the steps around it are the ratios real
	// benchmarks show: low is about 40% faster than medium, high about 20% slower,
	// ultra about 33% slower. The textures figure scales the memory demand and is
	// a different measurement, so it moves with the setting too.
	const QUALITY = [
		{ id: "low",    name: "Low",    textureFactor: 0.55, gpuFactor: 0.70, cpuFactor: 0.92 },
		{ id: "medium", name: "Medium", textureFactor: 1.00, gpuFactor: 1.00, cpuFactor: 1.00 },
		{ id: "high",   name: "High",   textureFactor: 1.70, gpuFactor: 1.25, cpuFactor: 1.10 },
		{ id: "ultra",  name: "Ultra",  textureFactor: 2.60, gpuFactor: 1.50, cpuFactor: 1.18 },
	];

	// ------------------------------------------------------- the fps calibration
	// One anchor, published and specific: Assassin's Creed Origins, 1080p, medium,
	// RTX 3060 (index 167.1) = 59 fps. That gives the constant below, and every
	// other number in the game falls out of the card index and the title's demand.
	//
	// Checked against the same game on other cards, this lands within about 15%:
	//   1650 measured 24 fps, model says 28   |   1660S measured 38, model says 45
	// which is the honest precision of a single-anchor fit. It is a real model with
	// a stated error, not a number dressed up as a measurement.
	const FPS_PER_G3D = 0.353;

	const RAY_TRACING = { off: 0.0, on: 1.0 };
	const STUTTER_MS_BUDGET = 8.0;     // a spike above this fails the workload

	// ------------------------------------------------------------------ HAGS
	// The architecture gate, by the same rule as hags_policy.py: it is about
	// whether the silicon CAN, not whether it is fast.
	function hagsSupported(gpu) {
		if (!gpu || gpu.shared) return { ok: false, why: "integrated graphics - HAGS unsupported" };
		if (gpu.vramMb <= 2048) {
			return { ok: false, why: gpu.vramMb + " MB VRAM - at or below the 2048 MB floor, "
				+ "HAGS would cost more than it saves" };
		}
		if (gpu.vendor === "NVIDIA") {
			if (gpu.arch === "turing" || gpu.arch === "ampere" || gpu.arch === "ada"
				|| gpu.arch === "blackwell") {
				return { ok: true, why: "NVIDIA Turing or newer" };
			}
			return { ok: false, why: "NVIDIA pre-Turing (" + gpu.arch + ") - the driver does not support HAGS" };
		}
		if (gpu.vendor === "AMD") {
			if (gpu.arch === "rdna" || gpu.arch === "rdna4") return { ok: true, why: "AMD RDNA" };
			return { ok: false, why: "AMD pre-RDNA (" + gpu.arch + ") - the driver does not support HAGS" };
		}
		if (gpu.vendor === "Intel") {
			if (gpu.arch === "arc" || gpu.arch === "battlemage") {
				return { ok: true, why: "Intel Arc (Xe HPG)" };
			}
			return { ok: false, why: "Intel integrated graphics - HAGS unsupported" };
		}
		return { ok: false, why: "unrecognised hardware" };
	}

	// The full decision, including the title: if the game needs more memory than
	// the card has, the answer is OFF even though the silicon supports it,
	// because the driver-side cost lands on the resource already running out.
	function hagsDecision(gpu, game, res, quality, rt) {
		const support = hagsSupported(gpu);
		if (!support.ok) return { on: false, why: support.why, gate: "capability" };
		const demand = vramDemand(game, res, quality, rt).total;
		if (demand > gpu.vramMb) {
			return { on: false, gate: "workload",
				why: game.name + " wants about " + Math.round(demand) + " MB and this card "
					+ "has " + gpu.vramMb + " MB - HAGS stays off while it is short" };
		}
		return { on: true, why: support.why, gate: "capability" };
	}

	// ------------------------------------------------------------ VRAM demand
	// The render target scales with pixels, the texture budget scales with the
	// quality setting, ray tracing multiplies the whole resident set, and a
	// modded install adds a flat amount. That is the entire model, and the page
	// shows this arithmetic to the player.
	function vramDemand(game, res, quality, rtOn) {
		const pix = res.pixels / RESOLUTIONS[0].pixels;
		const resScale = Math.pow(pix, 0.85);          // sub-linear, as buffers do
		const engine = game.engineBase * resScale;
		const textures = game.textureBase * resScale * quality.textureFactor;
		const rtFrac = rtOn ? game.rt : 0.0;
		const rtCost = (engine + textures) * rtFrac;
		const total = engine + textures + rtCost + game.modsMb;
		return {
			engine: engine, textures: textures, rt: rtCost, mods: game.modsMb,
			total: total,
		};
	}

	// ------------------------------------------------------------- platform
	// The board is the gatekeeper. It carries ONE socket and ONE memory
	// generation, and it is what decides whether a CPU and a kit physically go
	// together - not the CPU, and not the memory. A board that cannot take the
	// chip does not POST, and there is no partial credit for a near miss.
	function platformCompat(state) {
		const board = getPart(BOARDS, state.board);
		const cpu = getPart(CPUS, state.cpu);
		const ram = getPart(RAMS, state.ram);

		// You cannot score a machine that is not a machine.
		if (!state.board) {
			return { ok: false, missing: "board",
				why: "no motherboard - the CPU, the memory and the card all connect through it" };
		}
		if (!state.cpu) {
			return { ok: false, missing: "cpu", why: "no CPU fitted" };
		}
		if (!state.ram) {
			return { ok: false, missing: "ram", why: "no memory fitted - it will not POST" };
		}
		if (!state.gpu) {
			return { ok: false, missing: "gpu", why: "no graphics - the workloads cannot run" };
		}
		if (!state.storage) {
			return { ok: false, missing: "storage",
				why: "no storage - the games cannot be installed" };
		}
		if (!state.psu) {
			return { ok: false, missing: "psu",
				why: "no power supply - nothing in the machine gets electricity" };
		}
		if (!state.chassis) {
			return { ok: false, missing: "case",
				why: "no case - nowhere to mount any of it" };
		}
		// The PSU and the case are part of the platform, not separate concerns: a
		// build that cannot be powered or mounted is a build that does not POST.
		const power = psuCompat(state);
		if (!power.ok) return power;
		const chassis = caseCompat(state);
		if (!chassis.ok) return chassis;

		// Embedded chips are soldered to the board - they are not a choice.
		if (!cpu.socket || cpu.socket.indexOf("BGA-") === 0) {
			return { ok: false, soldered: true,
				why: cpu.name + " is a soldered BGA part - it cannot be fitted to a "
					+ "motherboard at all, it comes attached to one" };
		}
		if (cpu.socket !== board.socket) {
			return { ok: false, socket: true,
				why: board.name + " is socket " + board.socket + " and the " + cpu.name
					+ " is socket " + cpu.socket + " - the chip does not go in this board" };
		}
		// A chip that never had a DDR5 controller cannot sit in a DDR5 board, even
		// though the socket is right. "DDR4|DDR5" means the chip supported both and
		// the board is what chose.
		if (!cpuSupportsMem(cpu, board.memGen)) {
			return { ok: false, memory: true,
				why: cpu.name + " only has a " + cpu.memGen.replace("|", " / ")
					+ " memory controller and " + board.name + " is a " + board.memGen
					+ " board" };
		}
		if (ram.memGen !== board.memGen) {
			return { ok: false, memory: true,
				why: board.name + " runs " + board.memGen + " and this kit is " + ram.memGen
					+ " - the slots will not take it" };
		}
		return { ok: true, why: "" };
	}

	// A CPU can support more than one memory generation; the board is what picks.
	function cpuSupportsMem(cpu, gen) {
		if (!cpu.memGen) return false;
		return cpu.memGen.split("|").indexOf(gen) >= 0;
	}

	// ------------------------------------------------------------- the power
	// Load, and the wall draw it implies. `powerWatts` was already the sum of the
	// parts; the PSU is what has to carry it, and the efficiency rating is what
	// inflates it at the socket.
	function psuLoad(state) {
		const gpu = getPart(GPUS, state.gpu);
		const cpu = getPart(CPUS, state.cpu);
		return (gpu.watt || 0) + (cpu.watt || 0) + 40;   // + board, drives, fans
	}

	// A PSU that is merely equal to the load is not enough - it has to hold the
	// peak, not the average. 1.25 is the headroom a real build needs.
	const PSU_HEADROOM = 1.25;

	function psuCompat(state) {
		const psu = getPart(PSUS, state.psu);
		const gpu = getPart(GPUS, state.gpu);

		if (!state.psu) {
			return { ok: false, missing: "psu",
				why: "no power supply - nothing in the machine gets electricity" };
		}
		// cables first: an unplugged card is not a capacity question
		if (gpu.powerConnectors && psu.connectors < gpu.powerConnectors) {
			return { ok: false, power: true,
				why: gpu.name + " needs " + gpu.powerConnectors + " PCIe power cable"
					+ (gpu.powerConnectors > 1 ? "s" : "") + " and " + psu.name
					+ " has " + psu.connectors };
		}
		const need = Math.round(psuLoad(state) * PSU_HEADROOM);
		if (psu.watts < need) {
			return { ok: false, power: true,
				why: "this build draws about " + psuLoad(state) + " W and wants "
					+ need + " W to hold the peak, but " + psu.name + " is "
					+ psu.watts + " W" };
		}
		return { ok: true, why: "" };
	}

	function psuHeadroom(state) {
		const psu = getPart(PSUS, state.psu);
		if (!state.psu) return 0;
		const load = psuLoad(state);
		return load > 0 ? psu.watts / load : 9.9;
	}

	// -------------------------------------------------------------- the case
	// Four physical gates, and one thermal one. The thermal number is the same
	// wattage the power supply carries, so a hot build in a small case throttles
	// and the frame rate shows it rather than the spec sheet hiding it.
	function caseCompat(state) {
		const c = getPart(CASES, state.chassis);
		const board = getPart(BOARDS, state.board);
		const gpu = getPart(GPUS, state.gpu);
		const sto = getPart(STORAGE, state.storage);

		if (!state.chassis) {
			return { ok: false, missing: "case",
				why: "no case - nowhere to mount any of it" };
		}
		if (state.board && board.form && c.forms.indexOf(board.form) < 0) {
			return { ok: false, chassis: true,
				why: c.name + " takes " + c.forms.join(" / ") + " boards and "
					+ board.name + " is " + board.form };
		}
		if (state.gpu && gpu.lengthMm > c.maxGpuMm) {
			return { ok: false, chassis: true,
				why: gpu.name + " is " + gpu.lengthMm + " mm long and " + c.name
					+ " clears " + c.maxGpuMm + " mm" };
		}
		// a spinning disk needs somewhere to spin
		if (state.storage && sto.bays35 && c.bays35 < sto.bays35) {
			return { ok: false, chassis: true,
				why: sto.name + " needs a 3.5-inch bay and " + c.name + " has "
					+ c.bays35 };
		}
		if (state.storage && sto.bays25 && c.bays25 < sto.bays25) {
			return { ok: false, chassis: true,
				why: sto.name + " needs a 2.5-inch bay and " + c.name + " has "
					+ c.bays25 };
		}
		return { ok: true, why: "" };
	}

	// Heat the case has to shed, against what it can shed. Same watts as the PSU.
	function caseThermal(state) {
		const c = getPart(CASES, state.chassis);
		if (!state.chassis) return { factor: 0.55, over: 0, note: "no case - nothing is cooled" };
		const heat = psuLoad(state);
		const over = heat - c.coolingW;
		if (over <= 0) {
			return { factor: 1.0, over: 0, heat: heat, note: "" };
		}
		const factor = Math.max(0.58, 1 - (over / c.coolingW) * 0.55);
		return {
			factor: factor, over: over, heat: heat,
			note: "case sheds " + c.coolingW + " W but the build makes " + heat
				+ " W - throttling to " + Math.round(factor * 100) + "%",
		};
	}

	// PCIe: a modern card in an old board works, at a narrower link. Slow, not
	// broken, which is a different failure from not fitting at all.
	function pcieFactor(state) {
		const board = getPart(BOARDS, state.board);
		const gpu = getPart(GPUS, state.gpu);
		if (!gpu.pcieGen || gpu.shared) return { factor: 1.0, note: "" };
		const gap = gpu.pcieGen - board.pcieGen;
		if (gap <= 0) return { factor: 1.0, note: "" };
		const factor = Math.max(0.62, 1.0 - 0.09 * gap);
		return { factor: factor,
			note: "PCIe " + gpu.pcieGen + ".0 card in a PCIe " + board.pcieGen
				+ ".0 slot - running at x" + board.pcieGen + " link speed" };
	}

	function boardEra(id) {
		const b = getPart(BOARDS, id);
		return BOARD_ERAS.filter(e => e.id === b.era)[0] || null;
	}
	function boardEras() { return BOARD_ERAS; }

	// Which boards can take a given chip right now. This is what the market
	// needs: showing a 300-chip list with two of them usable is not a choice.
	function boardsForCpu(socket, cpuMemGen) {
		const gens = String(cpuMemGen || "").split("|");
		return BOARDS.filter(b => b.socket === socket && gens.indexOf(b.memGen) >= 0);
	}

	// ---------------------------------------------------- memory generation
	// A socket runs the memory generation it was built for and nothing else. It
	// is a physical rule, not a performance one - the notch is in a different
	// place - so a mismatched pair does not run slowly, it does not run.
	const MEMORY_GENERATIONS = ["DDR", "DDR2", "DDR3", "DDR4", "DDR5"];

	// Kept as a named check because the older tests and the UI both call it, but
	// the authority is now the board: it is the board that has the slots.
	function memCompat(state) {
		return platformCompat(state);
	}

	// Era metadata, for grouping the market rather than for any rule.
	function cpuEra(id) {
		const cpu = getPart(CPUS, id);
		return CPU_ERAS.filter(e => e.id === cpu.era)[0] || null;
	}
	function ramBrands() {
		const seen = [];
		for (const r of RAMS) if (seen.indexOf(r.brand) < 0) seen.push(r.brand);
		return seen;
	}

	// --------------------------------------------------------------- the sim
	// Every index below is relative, and the ordering is what carries meaning.
	function simulate(state, game, res, quality, rtOn) {
		const gpu = getPart(GPUS, state.gpu);
		const cpu = getPart(CPUS, state.cpu);
		const ram = getPart(RAMS, state.ram);
		const store = getPart(STORAGE, state.storage);

		const demand = vramDemand(game, res, quality, rtOn);

		// The graphics API gate. Every title in the suite needs DX11-class hardware,
		// and a fixed-function accelerator from 1999 has no programmable shaders at
		// all. That is not a speed penalty - the game does not start.
		const g2 = getPart(GPUS, state.gpu);
		if (state.gpu && g2.api && g2.api < 4) {
			return {
				demand: demand, gpuFps: 0, cpuFps: 0, fps: 0, cap: 0, uncappedFps: 0,
				spikeMs: 0, loadSeconds: 0, bound: "no shaders", overflow: 0,
				ramNote: "", passes: false,
				vramNote: g2.name + " has no programmable shaders - " + game.name
					+ " cannot run on it at all",
				post: { ok: false, why: "no shader support" },
				link: { factor: 1.0, note: "" }, thermal: { factor: 1.0, note: "" },
				hags: hagsDecision(g2, game, res, quality, rtOn),
			};
		}

		// A build whose memory does not fit its socket gets no further than this.
		// Every other field is still filled in so the page can render the state
		// instead of a blank card.
		const post = memCompat(state);
		if (!post.ok) {
			return {
				demand: demand, gpuFps: 0, cpuFps: 0, fps: 0, spikeMs: 0,
				loadSeconds: 0, bound: "no POST", overflow: 0,
				ramNote: "", vramNote: post.why, passes: false, post: post,
				link: { factor: 1.0, note: "" },
				thermal: { factor: 1.0, note: "" },
				hags: hagsDecision(gpu, game, res, quality, rtOn),
			};
		}
		const pix = res.pixels / RESOLUTIONS[0].pixels;

		// --- GPU bound: the card's index against the title's render cost,
		//     scaled by pixels and quality, then hit by ray tracing
		// Full ray tracing costs about two and a half times the frame time of raster
		// - a measured figure from the titles that have it, not a guess. No 2017 game
		// uses it, so this term is exercised only by the synthetic tests.
		const rtPenalty = 1.0 + (rtOn ? game.rt * 2.5 : 0.0);
		// A modern card in an old board still runs - the link is just narrower.
		// That is a different failure from not fitting, so it is a separate term.
		const link = pcieFactor(state);
		const thermal = caseThermal(state);
		const gpuFps = gpu.index * FPS_PER_G3D * link.factor * thermal.factor
			/ (Math.pow(pix, 0.75) * quality.gpuFactor * game.gpuCost * rtPenalty);

		// --- CPU bound: how much of the title's CPU cost the chip covers.
		//     260 is the frame rate a CPU exactly meeting cpuNeed reaches.
		// 140 fps is what a Ryzen 5 3600 (index 100) delivers in a title of demand
		// 1.0 before the card becomes the limit - the same 3600 = 100 scale the CPU
		// index uses, so this is one measurement carried through rather than a
		// second guess bolted on.
		const cpuFps = 140 * (cpu.index / 100) / game.cpuDemand * quality.cpuFactor;

		// --- memory starvation: capacity first, then bandwidth
		let ramPenalty = 1.0, ramNote = "";
		if (ram.mb < 16384) { ramPenalty *= 0.82; ramNote = "8 GB is tight for a modern title"; }
		ramPenalty *= 0.85 + 0.15 * ram.band;
		if (ram.aboveSpec) ramNote = "above-spec kit - if it fails training it drops to JEDEC";

		// --- VRAM: the whole point
		let vramFactor = 1.0, spikeMs = 0.0, vramNote = "";
		const overflow = Math.max(0, demand.total - gpu.vramMb);
		if (gpu.shared) {
			vramFactor = 0.35; spikeMs = 22.0;
			vramNote = "integrated graphics share system memory - expect heavy spiking";
		} else if (overflow > 0) {
			const ratio = overflow / gpu.vramMb;              // how far past the wall
			vramFactor = 1.0 / (1.0 + ratio * ratio * 2.2);   // falls off fast
			spikeMs = 1.2 + 26.0 * Math.min(1.0, ratio);      // frame-time spikes
			vramNote = Math.round(overflow) + " MB over budget - spilling to system memory";
			// beyond the RAM headroom it stops being slow and starts failing
			if (overflow > ram.mb * 0.55) {
				vramFactor *= 0.25; spikeMs = 60.0;
				vramNote = Math.round(overflow) + " MB over budget with no RAM headroom left - thrashing";
			}
		}

		// HAGS is worth a little when it is on and the card is not short
		if (state.hags && hagsDecision(gpu, game, res, quality, rtOn).on) vramFactor *= 1.03;
		if (state.hags && !hagsDecision(gpu, game, res, quality, rtOn).on
			&& hagsSupported(gpu).ok) vramFactor *= 0.97;     // on when it should be off

		let fps = Math.min(gpuFps, cpuFps) * ramPenalty * vramFactor;
		fps = Math.max(1.0, fps);

		// The engine stops before the hardware does. A fighting game tied to a 60 Hz
		// simulation does not run at 400 fps because the card is fast, and a visual
		// novel does not run at 700. `cap` is the frame rate the title reaches; 0
		// means the engine has no ceiling worth modelling.
		const capped = game.cap ? Math.min(fps, game.cap) : fps;

		// load time: size of the resident set over what the drive can stream
		const loadSeconds = (demand.total / 900) * store.loadFactor;

		// what is actually holding it back
		let bound = "GPU";
		const gpuEff = gpuFps * vramFactor, cpuEff = cpuFps * ramPenalty;
		if (overflow > 0) bound = "VRAM";
		else if (cpuEff < gpuEff * 0.95) bound = "CPU";
		if (gpu.shared) bound = "integrated";
		else if (overflow > 0 && ram.mb < 16384) bound = "VRAM + RAM";

		const passes = capped >= game.targetFps && spikeMs <= STUTTER_MS_BUDGET;
		return {
			demand, gpuFps, cpuFps, fps: capped, cap: game.cap || 0,
			uncappedFps: fps, spikeMs, loadSeconds, bound,
			overflow, ramNote, vramNote, passes, post: post, link: link,
			thermal: thermal,
			hags: hagsDecision(gpu, game, res, quality, rtOn),
		};
	}

	// An empty slot is a real state, not list[0]. Returning the first part of the
	// list for a null id is how a build with no CPU quietly becomes a build with a
	// Ryzen 3 in it.
	const NONE_PART = {
		id: null, name: "nothing fitted", price: 0, index: 0, cores: 0, threads: 0,
		vramMb: 0, shared: false, watt: 0, mb: 0, band: 0, speed: 0, memGen: null,
		socket: null, loadFactor: 1, arch: "none", pcieGen: 0, tier: "none",
	};

	function getPart(list, id) {
		if (id === null || id === undefined || id === "") return NONE_PART;
		for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
		return list[0];
	}

	// ------------------------------------------------------------ the build
	// A test rig: everything already fitted, so a test can assert one thing at a
	// time. The GAME does not start here - see newGame.
	function newState(startingMoney) {
		return {
			budget: startingMoney,     // the wallet. Income adds to it, parts spend it.
			loan: 0,
			board: "b-x570", cpu: "3200g", gpu: "igpu", ram: "8-2400",
			storage: "hdd", psu: "psu650", chassis: "case_full",
			hags: false,
			hours: 0,                  // in-game hours elapsed: the score
			task: null,                // what the MACHINE is doing
			job: null,                 // what YOU are doing, in parallel
			jobsDone: 0, contractsDone: 0, totalMined: 0,
		};
	}

	// --------------------------------------------------------- starting out
	// You own nothing. The only money you have is borrowed, and it is not yours.
	const LOAN_AMOUNT = 350;
	const LOAN_REPAY_SHARE = 0.25;     // of every payout, until the debt is clear

	function newGame() {
		return {
			budget: LOAN_AMOUNT, loan: LOAN_AMOUNT,
			board: null, cpu: null, gpu: null, ram: null, storage: null, psu: null,
			chassis: null,
			hags: false, hours: 0, task: null, job: null,
			jobsDone: 0, contractsDone: 0, totalMined: 0, loanPaid: 0,
		};
	}

	// What you are actually worth. A big wallet and a big debt is not wealth.
	function netWorth(state) {
		return state.budget - (state.loan || 0);
	}

	function payOffLoan(state) {
		const owed = state.loan || 0;
		if (owed <= 0) return { ok: false, why: "no debt outstanding" };
		if (state.budget < owed) {
			return { ok: false, why: "needs $" + Math.ceil(owed) + ", you have $"
				+ Math.floor(state.budget) };
		}
		state.budget -= owed;
		state.loan = 0;
		state.loanPaid = (state.loanPaid || 0) + owed;
		return { ok: true, paid: owed };
	}

	// Buying swaps a part and charges the difference. Selling the old part back
	// at 60% is what makes upgrading a decision rather than a reset.
	const RESALE = 0.6;

	function upgrade(state, slot, partId) {
		const lists = { board: BOARDS, cpu: CPUS, gpu: GPUS, ram: RAMS,
			storage: STORAGE, psu: PSUS, chassis: CASES };
		const list = lists[slot];
		if (!list) return { ok: false, why: "no such slot" };
		const next = getPart(list, partId);
		const cur = getPart(list, state[slot]);
		const credit = Math.round(cur.price * RESALE);
		const cost = next.price - credit;
		if (cost > state.budget) {
			return { ok: false, why: "needs $" + cost + ", you have $" + state.budget };
		}
		state.budget -= cost;
		state[slot] = next.id;
		// Fitting a part can invalidate the build - a DDR5 chip next to a DDR4
		// kit. Allow it (you can fit the other half next) but say so immediately
		// rather than letting the player discover it as a silent zero.
		const post = memCompat(state);
		return { ok: true, spent: cost, credit: credit, warn: post.ok ? null : post.why };
	}

	function totalSpent(state, startingBudget) {
		return startingBudget - state.budget;
	}

	function partLists() {
		return { board: BOARDS, cpu: CPUS, gpu: GPUS, ram: RAMS,
			storage: STORAGE, psu: PSUS, chassis: CASES };
	}

	function catalog() {
		return { GPUS, CPUS, RAMS, STORAGE, GAMES, RESOLUTIONS, QUALITY,
			CPU_ERAS, BOARD_ERAS, BOARDS, CASES, STUTTER_MS_BUDGET, RESALE };
	}

	// =====================================================================
	//  EARNING. The PC can do one compute job at a time; a job takes YOU, so it
	//  runs alongside whatever the machine is doing. That overlap is the whole
	//  economy: you mow lawns while the card mines.
	// =====================================================================

	const ELECTRICITY_PER_KWH = 0.24;      // a real, unflattering price
	const HOURS_PER_TICK = 1;

	// Mining needs a DAG resident in VRAM. This is the same wall as everywhere
	// else in the game: the coin does not fit in 2 GB, and an integrated chip
	// cannot mine at all.
	const MINING_DAG_MB = 3072;

	// Compute work. `needsVramMb` is checked at START; a card that cannot hold it
	// is refused rather than silently underpaid. `needsCpuIndex` is on the same
	// scale as the CPU table - Ryzen 5 3600 = 100 - so a gate of 114 means the
	// compile farm wants a chip a little quicker than a 3600.
	// The machine's work, from the workload taxonomy: CPU and kernel jobs, GPU and
	// accelerator jobs, memory and storage jobs, and networking jobs. Each is gated
	// on the axis it is actually limited by, so the catalogue teaches what the part
	// is for - a compile farm wants cores, a CFD run wants VRAM, an ETL load wants
	// system memory, a transactional batch wants NVMe, a lobby host wants PCIe.
	// The machine's work, from the workload taxonomy: CPU and kernel jobs, GPU and
	// accelerator jobs, memory and storage jobs, and networking jobs. Each is gated
	// on the axis it is actually limited by, so the catalogue teaches what the part
	// is for - a compile farm wants cores, a CFD run wants VRAM, an ETL load wants
	// system memory, a transactional batch wants NVMe, a lobby host wants PCIe.
	// The machine's work, from the workload taxonomy: CPU and kernel jobs, GPU and
	// accelerator jobs, memory and storage jobs, and networking jobs. Each is gated
	// on the axis it is actually limited by, so the catalogue teaches what the part
	// is for - a compile farm wants cores, a CFD run wants VRAM, an ETL load wants
	// system memory, a transactional batch wants NVMe, a lobby host wants PCIe.
	// The machine's work, from the workload taxonomy: CPU and kernel jobs, GPU and
	// accelerator jobs, memory and storage jobs, and networking jobs. Each is gated
	// on the axis it is actually limited by, so the catalogue teaches what the part
	// is for - a compile farm wants cores, a CFD run wants VRAM, an ETL load wants
	// system memory, a transactional batch wants NVMe, a lobby host wants PCIe.
	const CONTRACTS = [
		{ id: "telemetry", cat: "CPU & kernel", name: "System Telemetry Pre-staging", hours: 4, pay: 34,
			needsCpuIndex: 31, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "A background loop. Runs on anything, pays like anything." },
		{ id: "batchlog", cat: "CPU & kernel", name: "Batch Log Parsing", hours: 2, pay: 52,
			needsCpuIndex: 62, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Non-interactive, bulk, asynchronous. All it wants is cores." },
		{ id: "schedbench", cat: "CPU & kernel", name: "Scheduler Benchmark Loop", hours: 2, pay: 78,
			needsCpuIndex: 94, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Context switching, thread allocation, mutex contention. Pure CPU." },
		{ id: "compile", cat: "CPU & kernel", name: "Compile Farm: Dense Codebase", hours: 3, pay: 130,
			needsCpuIndex: 95, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Bound entirely by core frequency and execution units. Nothing else helps." },
		{ id: "crypto", cat: "CPU & kernel", name: "Cipher Suite Batch", hours: 3, pay: 110,
			needsCpuIndex: 104, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Encryption rounds. Math units, no graphics, no memory pressure." },
		{ id: "raster", cat: "GPU & accelerator", name: "Polygon Rasterisation Job", hours: 3, pay: 140,
			needsCpuIndex: 0, needsVramMb: 2048, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Real-time rasterisation. A 2 GB card is the entry ticket." },
		{ id: "render", cat: "GPU & accelerator", name: "3D Render Batch", hours: 4, pay: 180,
			needsCpuIndex: 0, needsVramMb: 2600, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "The scene has to be resident. Under 2.6 GB it will not load." },
		{ id: "cad", cat: "GPU & accelerator", name: "CAD / BIM Viewport Render", hours: 3, pay: 210,
			needsCpuIndex: 0, needsVramMb: 4096, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Engineering viewports keep the whole model resident, not just the frame." },
		{ id: "inference", cat: "GPU & accelerator", name: "AI Inference Serving", hours: 2, pay: 265,
			needsCpuIndex: 0, needsVramMb: 6144, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Latency-critical single-token generation. Weights must stay in VRAM." },
		{ id: "hpc", cat: "GPU & accelerator", name: "CFD Simulation Run", hours: 6, pay: 430,
			needsCpuIndex: 104, needsVramMb: 8192, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Fluid dynamics across wide vectors. VRAM and cores together." },
		{ id: "train", cat: "GPU & accelerator", name: "ML Model Training", hours: 8, pay: 900,
			needsCpuIndex: 0, needsVramMb: 10240, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Ten gigabytes is the entry ticket and there is no way around it." },
		{ id: "memdb", cat: "Memory & storage", name: "In-Memory Data Processing", hours: 3, pay: 155,
			needsCpuIndex: 0, needsVramMb: 0, needsRamMb: 32768, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Working set that will not fit in cache. It wants system memory, not VRAM." },
		{ id: "etl", cat: "Memory & storage", name: "ETL Warehouse Load", hours: 4, pay: 195,
			needsCpuIndex: 83, needsVramMb: 0, needsRamMb: 16384, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Extract, transform, load. Memory to hold it, cores to chew it." },
		{ id: "io8k", cat: "Memory & storage", name: "8K Uncompressed Video Edit", hours: 3, pay: 175,
			needsCpuIndex: 0, needsVramMb: 0, needsRamMb: 16384, needsMaxLoad: 1.6, needsPcieGen: 0,
			blurb: "Throttled by the drive, not the CPU. A hard disk cannot stream it." },
		{ id: "txn", cat: "Memory & storage", name: "Transactional Payment Batch", hours: 2, pay: 145,
			needsCpuIndex: 0, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 1.0, needsPcieGen: 0,
			blurb: "Atomic integrity on every write. IOPS-bound: NVMe or nothing." },
		{ id: "clone", cat: "Memory & storage", name: "Disk Partition Cloning", hours: 3, pay: 90,
			needsCpuIndex: 0, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 1.6, needsPcieGen: 0,
			blurb: "Raw sequential I/O. Any SSD will do, a spinning disk will not." },
		{ id: "lobby", cat: "Networking", name: "Game Lobby Hosting", hours: 4, pay: 165,
			needsCpuIndex: 83, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 4,
			blurb: "Bandwidth and routing latency. Needs a modern PCIe link to feed the NIC." },
		{ id: "ingest", cat: "Networking", name: "Live Stream Ingest", hours: 3, pay: 185,
			needsCpuIndex: 104, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 4,
			blurb: "Continuous frame encoding and multiplexing, live, with no second take." },
		{ id: "vpn", cat: "Networking", name: "VPN Gateway Coordination", hours: 3, pay: 120,
			needsCpuIndex: 94, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 3,
			blurb: "RPC between services. Cores for the crypto, a real link underneath." },
	];

	// Mining is open-ended: no end time, it just runs until you stop it.
	const MINING = { id: "mining", name: "Crypto Mining", hours: null, pay: 0,
		needsVramMb: MINING_DAG_MB, needsCpuIndex: 0,
		blurb: "Runs while you do something else. Net of electricity." };

	// Jobs take YOU, not the machine, so they run in parallel with compute.
	// Jobs gate on hardware, so there is a ladder: mowing needs nothing, and the
	// well-paid work needs a real card to have learned on. Without the gate the
	// best job is available at minute one and mowing is pointless.
	// Your jobs, from the industry: the computing trades, the editorial floor, and
	// the retail and supply operation. Jobs take YOU, not the machine, so they run
	// alongside compute - and they gate on hardware, because the trades you can be
	// trusted with follow from the machine you can prove you have.
	// Your jobs, from the industry: the computing trades, the editorial floor, and
	// the retail and supply operation. Jobs take YOU, not the machine, so they run
	// alongside compute - and they gate on hardware, because the trades you can be
	// trusted with follow from the machine you can prove you have.
	// Your jobs, from the industry: the computing trades, the editorial floor, and
	// the retail and supply operation. Jobs take YOU, not the machine, so they run
	// alongside compute - and they gate on hardware, because the trades you can be
	// trusted with follow from the machine you can prove you have.
	// Your jobs, from the industry: the computing trades, the editorial floor, and
	// the retail and supply operation. Jobs take YOU, not the machine, so they run
	// alongside compute - and they gate on hardware, because the trades you can be
	// trusted with follow from the machine you can prove you have.
	const JOBS = [
		{ id: "mow", cat: "No hardware needed", name: "Lawn Mowing", hours: 3, pay: 24,
			needsCpuIndex: 0, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Slow, honest, needs no hardware. This is where everyone starts." },
		{ id: "retail", cat: "No hardware needed", name: "Retail Sales Consultant", hours: 4, pay: 46,
			needsCpuIndex: 0, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Explaining the difference between two laptops to someone who wants neither." },
		{ id: "stock", cat: "No hardware needed", name: "Inventory / Stock Control Clerk", hours: 4, pay: 42,
			needsCpuIndex: 0, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Receiving pallets, updating the tracking database, coordinating returns." },
		{ id: "carwash", cat: "Side hustle", name: "Car Washing & Detailing", hours: 3, pay: 39,
			needsCpuIndex: 0, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Hand washing in the neighbourhood. Learn interiors and it pays a premium." },
		{ id: "petsit", cat: "Side hustle", name: "Pet Sitting & Dog Walking", hours: 4, pay: 52,
			needsCpuIndex: 0, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Minimal effort, and plenty of downtime to watch benchmark videos." },
		{ id: "cleanout", cat: "Side hustle", name: "Garage Cleanouts & Window Washing", hours: 5, pay: 60,
			needsCpuIndex: 0, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Cluttered garages, attics, exterior windows. Heavy work, real money." },
		{ id: "taskrabbit", cat: "Side hustle", name: "Odd Jobs (TaskRabbit)", hours: 4, pay: 64,
			needsCpuIndex: 0, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Flat-pack furniture, moving boxes, mounting TVs. Whatever is listed." },
		{ id: "delivery", cat: "Side hustle", name: "Food & Grocery Delivery", hours: 6, pay: 120,
			needsCpuIndex: 0, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Log on whenever, grind a weekend, cash out the same day." },
		{ id: "flex", cat: "Side hustle", name: "Package Delivery Block (Amazon Flex)", hours: 8, pay: 180,
			needsCpuIndex: 0, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "A set rate per block, so you know exactly how many shifts a part costs." },
		{ id: "seniortech", cat: "You need a machine", name: "Tech Support for Seniors", hours: 3, pay: 84,
			needsCpuIndex: 0, needsGpu: true, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Wi-Fi, viruses, printers. They pay well for patience, but you need a PC." },
		{ id: "flip", cat: "You need a machine", name: "Flipping Used PC Parts", hours: 4, pay: 140,
			needsCpuIndex: 0, needsGpu: true, needsVramMb: 2048, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Buy dirty, test, clean, resell. You need a machine that can test a card." },
		{ id: "videoedit", cat: "You need a machine", name: "Short-Form Video Editing", hours: 5, pay: 200,
			needsCpuIndex: 0, needsGpu: true, needsVramMb: 2048, needsRamMb: 16384, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "TikToks and Reels for local businesses. Editing wants VRAM and memory." },
		{ id: "repair", cat: "You need a machine", name: "PC Repair Callout", hours: 4, pay: 96,
			needsCpuIndex: 0, needsGpu: true, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Nobody hands a callout to someone with no graphics card of their own." },
		{ id: "setup", cat: "You need a machine", name: "PC Setup Specialist", hours: 4, pay: 106,
			needsCpuIndex: 0, needsGpu: true, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Fresh installs, profile transfers, protection suites. In-store work." },
		{ id: "helpdesk", cat: "You need a machine", name: "IT Support / Helpdesk", hours: 4, pay: 112,
			needsCpuIndex: 0, needsGpu: true, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Troubleshooting other people's configuration files all day." },
		{ id: "bench", cat: "You need a machine", name: "Bench Repair Technician", hours: 5, pay: 130,
			needsCpuIndex: 0, needsGpu: true, needsVramMb: 2048, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Microsoldering and component-level work. You need to be able to test a card." },
		{ id: "field", cat: "You need a machine", name: "Field Support Representative", hours: 5, pay: 142,
			needsCpuIndex: 0, needsGpu: true, needsVramMb: 2048, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "On-site networking, smart home systems, hardware nodes." },
		{ id: "qa", cat: "A real CPU", name: "QA Tester", hours: 4, pay: 168,
			needsCpuIndex: 87, needsGpu: true, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Running routines and documenting logic bugs on something that can run them." },
		{ id: "writer", cat: "A real CPU", name: "Staff Writer / Tech Journalist", hours: 4, pay: 172,
			needsCpuIndex: 87, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Device research and breaking reports. You need a machine that keeps up." },
		{ id: "webdev", cat: "A real CPU", name: "Web & Digital Designer Developer", hours: 5, pay: 230,
			needsCpuIndex: 100, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Front-end layout engines, back-end logic, databases behind them." },
		{ id: "sysadmin", cat: "A real CPU", name: "Systems Administrator", hours: 5, pay: 255,
			needsCpuIndex: 104, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Fleets of machines to update. Yours is the one that has to be reliable." },
		{ id: "appdev", cat: "A real CPU", name: "Application Developer", hours: 6, pay: 294,
			needsCpuIndex: 114, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Native desktop runtimes, written and optimised on your own machine." },
		{ id: "seo", cat: "A real CPU", name: "SEO / Audience Development", hours: 3, pay: 126,
			needsCpuIndex: 83, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Search metrics and headline formats. Light work, steady money." },
		{ id: "devops", cat: "A real CPU", name: "DevOps / Site Reliability Engineer", hours: 6, pay: 330,
			needsCpuIndex: 125, needsGpu: false, needsVramMb: 0, needsRamMb: 16384, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Deployment loops and uptime. Many things running at once, so it wants RAM." },
		{ id: "dba", cat: "A serious build", name: "Database Administrator & Architect", hours: 6, pay: 348,
			needsCpuIndex: 0, needsGpu: false, needsVramMb: 0, needsRamMb: 32768, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Table design and permissions on datasets that live in system memory." },
		{ id: "datasci", cat: "A serious build", name: "Data Scientist / Analyst", hours: 6, pay: 365,
			needsCpuIndex: 125, needsGpu: false, needsVramMb: 0, needsRamMb: 32768, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Turning logs into forecasts. Big working sets and real compute." },
		{ id: "cloud", cat: "A serious build", name: "Cloud Infrastructure Engineer", hours: 6, pay: 345,
			needsCpuIndex: 125, needsGpu: false, needsVramMb: 0, needsRamMb: 16384, needsMaxLoad: 0, needsPcieGen: 4,
			blurb: "Remote hosting at scale, and a modern link to reach it." },
		{ id: "neteng", cat: "A serious build", name: "Network Engineer / Architect", hours: 6, pay: 352,
			needsCpuIndex: 114, needsGpu: false, needsVramMb: 0, needsRamMb: 16384, needsMaxLoad: 0, needsPcieGen: 4,
			blurb: "Switch and router configuration. You need a link worth configuring." },
		{ id: "hwreview", cat: "A serious build", name: "Hardware Reviewer / Bench Lab", hours: 5, pay: 285,
			needsCpuIndex: 55, needsGpu: true, needsVramMb: 6144, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Isolated component testing, logged frame rates. You need cards to test." },
		{ id: "video", cat: "A serious build", name: "Digital Content Producer / Video Editor", hours: 5, pay: 305,
			needsCpuIndex: 0, needsGpu: true, needsVramMb: 4096, needsRamMb: 32768, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Filming and cutting hardware features. Video wants VRAM and memory." },
		{ id: "pentest", cat: "A serious build", name: "Penetration Tester", hours: 6, pay: 385,
			needsCpuIndex: 135, needsGpu: false, needsVramMb: 0, needsRamMb: 16384, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Simulated intrusions and access control review. Serious compute, serious pay." },
		{ id: "secanalyst", cat: "A serious build", name: "Cybersecurity Analyst", hours: 5, pay: 295,
			needsCpuIndex: 121, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Watching traffic patterns and mitigating threats as they land." },
		{ id: "buyer", cat: "A serious build", name: "Category Buyer / Merchandiser", hours: 5, pay: 335,
			needsCpuIndex: 104, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Bulk pricing negotiation with manufacturers. Office work, well paid." },
		{ id: "supply", cat: "A serious build", name: "Supply Chain / Logistics Planner", hours: 5, pay: 315,
			needsCpuIndex: 100, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Truck routes between distribution centres and storefronts." },
		{ id: "embedded", cat: "Engineering", name: "Embedded Systems Engineer", hours: 6, pay: 425,
			needsCpuIndex: 121, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Firmware for microcontrollers and IoT devices. Toolchains want cores." },
		{ id: "pcb", cat: "Engineering", name: "PCB Layout Designer", hours: 6, pay: 460,
			needsCpuIndex: 125, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Routing high-speed traces across multi-layer boards." },
		{ id: "thermal", cat: "Engineering", name: "Thermal Management Engineer", hours: 5, pay: 350,
			needsCpuIndex: 114, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Heat dispersion, acoustics, airflow. Simulation on a real machine." },
		{ id: "kerneldev", cat: "Engineering", name: "Operating System Kernel Developer", hours: 8, pay: 620,
			needsCpuIndex: 156, needsGpu: false, needsVramMb: 0, needsRamMb: 16384, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Execution rings, virtual memory, native file structures. The deep end." },
		{ id: "driverdev", cat: "Engineering", name: "Hardware Driver Engineer", hours: 8, pay: 585,
			needsCpuIndex: 150, needsGpu: false, needsVramMb: 0, needsRamMb: 0, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Translating OS commands into electrical protocol. Unforgiving work." },
		{ id: "silicon", cat: "Engineering", name: "Silicon Architecture Engineer", hours: 8, pay: 720,
			needsCpuIndex: 177, needsGpu: false, needsVramMb: 0, needsRamMb: 65536, needsMaxLoad: 0, needsPcieGen: 0,
			blurb: "Micro-architecture for the next generation of chips. The top of the ladder." },
	];

	function getJob(id) { return JOBS.filter(j => j.id === id)[0] || null; }

	// One place that decides whether the machine can take a piece of work, used by
	// computeOptions, jobAvailable and the market alike. A second copy of this rule
	// is how a card ends up saying "ready" while the scoreboard says otherwise.
	function meetsRequirements(state, job) {
		const gpu = getPart(GPUS, state.gpu);
		const cpu = getPart(CPUS, state.cpu);
		const ram = getPart(RAMS, state.ram);
		const sto = getPart(STORAGE, state.storage);
		const board = getPart(BOARDS, state.board);

		if (job.needsCpuIndex && (!state.cpu || cpu.index < job.needsCpuIndex)) {
			return { ok: false, why: "needs CPU index " + job.needsCpuIndex
				+ (state.cpu ? ", this chip is " + cpu.index : ", and there is no CPU fitted") };
		}
		if (job.needsGpu && (!state.gpu || gpu.shared)) {
			return { ok: false, why: "needs a discrete graphics card of your own" };
		}
		if (job.needsVramMb && (!state.gpu || gpu.vramMb < job.needsVramMb)) {
			return { ok: false, why: "needs " + job.needsVramMb + " MB of VRAM, the card has "
				+ (state.gpu ? gpu.vramMb + " MB" : "none") };
		}
		if (job.needsRamMb && (!state.ram || ram.mb < job.needsRamMb)) {
			return { ok: false, why: "needs " + (job.needsRamMb / 1024)
				+ " GB of system memory, this machine has "
				+ (state.ram ? (ram.mb / 1024) + " GB" : "none") };
		}
		if (job.needsMaxLoad && (!state.storage || sto.loadFactor > job.needsMaxLoad)) {
			return { ok: false, why: "needs storage no slower than x" + job.needsMaxLoad
				+ " load, this drive is x" + sto.loadFactor.toFixed(1) };
		}
		if (job.needsPcieGen && (!state.board || board.pcieGen < job.needsPcieGen)) {
			return { ok: false, why: "needs a PCIe " + job.needsPcieGen + ".0 platform, this board is PCIe "
				+ board.pcieGen + ".0" };
		}
		return { ok: true, why: "ready" };
	}

	// Grouped, and in the order they unlock, so the list reads as a ladder.
	function jobCategories(list) {
		const seen = [];
		for (const j of list) if (seen.indexOf(j.cat) < 0) seen.push(j.cat);
		return seen;
	}

	// One place that decides whether the machine can take a piece of work, used by
	// computeOptions, jobAvailable and the market alike. A second copy of this rule
	// is how a card ends up saying "ready" while the scoreboard says otherwise.
	function meetsRequirements(state, job) {
		const gpu = getPart(GPUS, state.gpu);
		const cpu = getPart(CPUS, state.cpu);
		const ram = getPart(RAMS, state.ram);
		const sto = getPart(STORAGE, state.storage);
		const board = getPart(BOARDS, state.board);

		if (job.needsCpuIndex && (!state.cpu || cpu.index < job.needsCpuIndex)) {
			return { ok: false, why: "needs CPU index " + job.needsCpuIndex
				+ (state.cpu ? ", this chip is " + cpu.index : ", and there is no CPU fitted") };
		}
		if (job.needsGpu && (!state.gpu || gpu.shared)) {
			return { ok: false, why: "needs a discrete graphics card of your own" };
		}
		if (job.needsVramMb && (!state.gpu || gpu.vramMb < job.needsVramMb)) {
			return { ok: false, why: "needs " + job.needsVramMb + " MB of VRAM, the card has "
				+ (state.gpu ? gpu.vramMb + " MB" : "none") };
		}
		if (job.needsRamMb && (!state.ram || ram.mb < job.needsRamMb)) {
			return { ok: false, why: "needs " + (job.needsRamMb / 1024)
				+ " GB of system memory, this machine has "
				+ (state.ram ? (ram.mb / 1024) + " GB" : "none") };
		}
		if (job.needsMaxLoad && (!state.storage || sto.loadFactor > job.needsMaxLoad)) {
			return { ok: false, why: "needs storage no slower than x" + job.needsMaxLoad
				+ " load, this drive is x" + sto.loadFactor.toFixed(1) };
		}
		if (job.needsPcieGen && (!state.board || board.pcieGen < job.needsPcieGen)) {
			return { ok: false, why: "needs a PCIe " + job.needsPcieGen + ".0 platform, this board is PCIe "
				+ board.pcieGen + ".0" };
		}
		return { ok: true, why: "ready" };
	}

	// Grouped, and in the order they unlock, so the list reads as a ladder.
	function jobCategories(list) {
		const seen = [];
		for (const j of list) if (seen.indexOf(j.cat) < 0) seen.push(j.cat);
		return seen;
	}

	// One place that decides whether the machine can take a piece of work, used by
	// computeOptions, jobAvailable and the market alike. A second copy of this rule
	// is how a card ends up saying "ready" while the scoreboard says otherwise.
	function meetsRequirements(state, job) {
		const gpu = getPart(GPUS, state.gpu);
		const cpu = getPart(CPUS, state.cpu);
		const ram = getPart(RAMS, state.ram);
		const sto = getPart(STORAGE, state.storage);
		const board = getPart(BOARDS, state.board);

		if (job.needsCpuIndex && (!state.cpu || cpu.index < job.needsCpuIndex)) {
			return { ok: false, why: "needs CPU index " + job.needsCpuIndex
				+ (state.cpu ? ", this chip is " + cpu.index : ", and there is no CPU fitted") };
		}
		if (job.needsGpu && (!state.gpu || gpu.shared)) {
			return { ok: false, why: "needs a discrete graphics card of your own" };
		}
		if (job.needsVramMb && (!state.gpu || gpu.vramMb < job.needsVramMb)) {
			return { ok: false, why: "needs " + job.needsVramMb + " MB of VRAM, the card has "
				+ (state.gpu ? gpu.vramMb + " MB" : "none") };
		}
		if (job.needsRamMb && (!state.ram || ram.mb < job.needsRamMb)) {
			return { ok: false, why: "needs " + (job.needsRamMb / 1024)
				+ " GB of system memory, this machine has "
				+ (state.ram ? (ram.mb / 1024) + " GB" : "none") };
		}
		if (job.needsMaxLoad && (!state.storage || sto.loadFactor > job.needsMaxLoad)) {
			return { ok: false, why: "needs storage no slower than x" + job.needsMaxLoad
				+ " load, this drive is x" + sto.loadFactor.toFixed(1) };
		}
		if (job.needsPcieGen && (!state.board || board.pcieGen < job.needsPcieGen)) {
			return { ok: false, why: "needs a PCIe " + job.needsPcieGen + ".0 platform, this board is PCIe "
				+ board.pcieGen + ".0" };
		}
		return { ok: true, why: "ready" };
	}

	// Grouped, and in the order they unlock, so the list reads as a ladder.
	function jobCategories(list) {
		const seen = [];
		for (const j of list) if (seen.indexOf(j.cat) < 0) seen.push(j.cat);
		return seen;
	}

	// One place that decides whether the machine can take a piece of work, used by
	// computeOptions, jobAvailable and the market alike. A second copy of this rule
	// is how a card ends up saying "ready" while the scoreboard says otherwise.
	function meetsRequirements(state, job) {
		const gpu = getPart(GPUS, state.gpu);
		const cpu = getPart(CPUS, state.cpu);
		const ram = getPart(RAMS, state.ram);
		const sto = getPart(STORAGE, state.storage);
		const board = getPart(BOARDS, state.board);

		if (job.needsCpuIndex && (!state.cpu || cpu.index < job.needsCpuIndex)) {
			return { ok: false, why: "needs CPU index " + job.needsCpuIndex
				+ (state.cpu ? ", this chip is " + cpu.index : ", and there is no CPU fitted") };
		}
		if (job.needsGpu && (!state.gpu || gpu.shared)) {
			return { ok: false, why: "needs a discrete graphics card of your own" };
		}
		if (job.needsVramMb && (!state.gpu || gpu.vramMb < job.needsVramMb)) {
			return { ok: false, why: "needs " + job.needsVramMb + " MB of VRAM, the card has "
				+ (state.gpu ? gpu.vramMb + " MB" : "none") };
		}
		if (job.needsRamMb && (!state.ram || ram.mb < job.needsRamMb)) {
			return { ok: false, why: "needs " + (job.needsRamMb / 1024)
				+ " GB of system memory, this machine has "
				+ (state.ram ? (ram.mb / 1024) + " GB" : "none") };
		}
		if (job.needsMaxLoad && (!state.storage || sto.loadFactor > job.needsMaxLoad)) {
			return { ok: false, why: "needs storage no slower than x" + job.needsMaxLoad
				+ " load, this drive is x" + sto.loadFactor.toFixed(1) };
		}
		if (job.needsPcieGen && (!state.board || board.pcieGen < job.needsPcieGen)) {
			return { ok: false, why: "needs a PCIe " + job.needsPcieGen + ".0 platform, this board is PCIe "
				+ board.pcieGen + ".0" };
		}
		return { ok: true, why: "ready" };
	}

	// Grouped, and in the order they unlock, so the list reads as a ladder.
	function jobCategories(list) {
		const seen = [];
		for (const j of list) if (seen.indexOf(j.cat) < 0) seen.push(j.cat);
		return seen;
	}
	function getContract(id) {
		if (id === "mining") return MINING;
		return CONTRACTS.filter(c => c.id === id)[0] || null;
	}

	function powerWatts(state) {
		const gpu = getPart(GPUS, state.gpu);
		const cpu = getPart(CPUS, state.cpu);
		return (gpu.watt || 0) + (cpu.watt || 0) + 40;   // + board, drives, fans
	}

	// Revenue before power. The index here is compute, not a hash rate, and the
	// absolute figure is a game value - but it is now proportional to a REAL score,
	// so the ordering across cards follows measured hardware rather than my taste.
	function miningRevenuePerHour(gpu) {
		if (!gpu || gpu.shared) return 0;
		if (gpu.vramMb < MINING_DAG_MB) return 0;
		// 0.0185 is 0.05 rescaled for the real index: a 3060 scored 62 under the old
		// invented scale and scores 167 under PassMark, so the rate falls by the same
		// factor and the card nets the same money it did before.
		return gpu.index * 0.0185;
	}

	function powerCostPerHour(state) {
		// At the socket, not at the components: a PSU rated 90% turns 100 W of
		// useful work into 111 W of metered draw. This is the number that makes a
		// Gold unit worth its price on a machine that runs all night.
		const psu = getPart(PSUS, state.psu);
		const eff = (state.psu && psu.efficiency) ? psu.efficiency : 0.75;
		return (powerWatts(state) / eff / 1000) * ELECTRICITY_PER_KWH;
	}

	// The number that decides whether mining is worth doing at all. Negative is
	// possible for a card that draws more than it earns.
	function miningNetPerHour(state) {
		const gpu = getPart(GPUS, state.gpu);
		return miningRevenuePerHour(gpu) - powerCostPerHour(state);
	}

	function computeOptions(state) {
		const out = [];
		for (const job of CONTRACTS) {
			const req = meetsRequirements(state, job);
			out.push({ job: job, ok: req.ok, why: req.why });
		}
		const gpu = getPart(GPUS, state.gpu);
		const mineOk = !!state.gpu && !gpu.shared && gpu.vramMb >= MINING_DAG_MB;
		out.push({
			job: MINING, ok: mineOk, mining: true,
			why: !state.gpu ? "no graphics card fitted"
				: gpu.shared ? "integrated graphics cannot mine"
				: (gpu.vramMb < MINING_DAG_MB
					? "the DAG needs " + MINING_DAG_MB + " MB resident, the card has " + gpu.vramMb + " MB"
					: "net $" + miningNetPerHour(state).toFixed(2) + "/h after "
						+ powerWatts(state) + " W at $" + ELECTRICITY_PER_KWH + "/kWh"),
		});
		return out;
	}

	function startCompute(state, id) {
		if (state.task) return { ok: false, why: "the machine is already running " + state.task.name };
		const job = getContract(id);
		if (!job) return { ok: false, why: "no such contract" };
		const opt = computeOptions(state).filter(o => o.job.id === id)[0];
		if (!opt || !opt.ok) return { ok: false, why: opt ? opt.why : "unavailable" };
		state.task = { id: job.id, name: job.name, done: 0, total: job.hours,
			pay: job.pay, mining: job.id === "mining" };
		return { ok: true };
	}

	function stopJob(state) {
		if (!state.job) return { ok: false, why: "you are not doing a job" };
		const was = state.job.name;
		state.job = null;
		return { ok: true, why: "stopped " + was };
	}

	// Income per hour right now: the job plus the machine's net.
	// Average per hour, for the readout: jobs pay in lump sums per shift, so this
	// is the rate you are working at, not a stream of money.
	function incomePerHour(state) {
		let v = 0;
		if (state.job) v += state.job.pay / state.job.total;
		if (state.task && state.task.mining) v += Math.max(0, miningNetPerHour(state));
		return v;
	}

	function stopCompute(state) {
		if (!state.task) return { ok: false, why: "nothing running" };
		const was = state.task.name;
		state.task = null;
		return { ok: true, why: "stopped " + was };
	}

	function jobAvailable(state, id) {
		const job = getJob(id);
		if (!job) return { ok: false, why: "no such job" };
		return meetsRequirements(state, job);
	}

	function startJob(state, id) {
		if (state.job) return { ok: false, why: "you are already out doing " + state.job.name };
		const avail = jobAvailable(state, id);
		if (!avail.ok) return { ok: false, why: avail.why };
		const job = getJob(id);
		// looping: it repeats until you stop it
		state.job = { id: job.id, name: job.name, done: 0, total: job.hours, pay: job.pay,
			looping: true };
		return { ok: true };
	}

	// Advance the clock. Everything that earns happens here, and events are
	// returned rather than logged so the caller decides how to show them.
	function tickHours(state, hours) {
		hours = hours || HOURS_PER_TICK;
		const events = [];
		let earned = 0;

		if (state.task) {
			const gpu = getPart(GPUS, state.gpu);
			if (state.task.mining) {
				const net = miningNetPerHour(state);
				// A mining card that no longer fits the DAG (parts changed under it)
				// stops being profitable, which is what MINING_DAG_MB is for.
				const stillOk = !gpu.shared && gpu.vramMb >= MINING_DAG_MB;
				earned += stillOk ? net * hours : 0;
				state.task.done += hours;
				state.totalMined = (state.totalMined || 0) + (stillOk ? net * hours : 0);
			} else {
				state.task.done += hours;
				if (state.task.done >= state.task.total) {
					earned += state.task.pay;
					events.push("finished " + state.task.name + "  +$" + state.task.pay);
					state.contractsDone = (state.contractsDone || 0) + 1;
					state.task = null;
				}
			}
		}

		// A job pays PER SHIFT on completion, and a single tick can span several
		// shifts - at 25x speed one tick is 25 hours, which is eight 3-hour
		// mowing shifts. An if-statement here paid for one of them.
		if (state.job) {
			state.job.done += hours;
			let guard = 0;
			while (state.job && state.job.done >= state.job.total && guard++ < 10000) {
				earned += state.job.pay;
				events.push("finished " + state.job.name + "  +$" + state.job.pay);
				state.jobsDone = (state.jobsDone || 0) + 1;
				if (state.job.looping) {
					state.job.done -= state.job.total;      // carry the remainder
				} else {
					state.job = null;
				}
			}
		}

		// The debt is serviced out of income, so the wallet only ever sees what is
		// actually yours. Paying it off early is a choice the player can make.
		let repaid = 0;
		if ((state.loan || 0) > 0 && earned > 0) {
			repaid = Math.min(state.loan, earned * LOAN_REPAY_SHARE);
			state.loan -= repaid;
			state.loanPaid = (state.loanPaid || 0) + repaid;
			if (state.loan <= 0.005) {
				state.loan = 0;
				events.push("LOAN CLEARED - the machine is yours");
			}
		}
		earned -= repaid;
		state.budget += earned;
		state.hours += hours;
		return { events: events, earned: earned, repaid: repaid };
	}

	// The starting build must be able to FAIL, or there is no game: an iGPU on
	// 8 GB of 2400 with a hard disk fails everything, which is the point.
	return {
		CONTRACTS, MINING, JOBS, ELECTRICITY_PER_KWH, MINING_DAG_MB,
		getJob, getContract, powerWatts, miningRevenuePerHour, powerCostPerHour,
		miningNetPerHour, computeOptions, startCompute, stopCompute, startJob,
		stopJob, jobAvailable, incomePerHour, tickHours, meetsRequirements,
		jobCategories, meetsRequirements,
		jobCategories, meetsRequirements,
		jobCategories, meetsRequirements,
		jobCategories,
		catalog, newState, upgrade, simulate, vramDemand, hagsSupported,
		hagsDecision, getPart, totalSpent, partLists, memCompat, cpuEra, ramBrands,
		platformCompat, pcieFactor, boardEra, boardEras, boardsForCpu, newGame,
		psuCompat, psuLoad, psuHeadroom, PSU_HEADROOM, PSUS,
		caseCompat, caseThermal, CASES,
		payOffLoan, netWorth, LOAN_AMOUNT, LOAN_REPAY_SHARE, NONE_PART,
		CPU_ERAS, MEMORY_GENERATIONS, BOARD_ERAS, BOARDS,
		GPUS, CPUS, RAMS, STORAGE, GAMES, RESOLUTIONS, QUALITY,
		STUTTER_MS_BUDGET, RESALE,
	};
});
