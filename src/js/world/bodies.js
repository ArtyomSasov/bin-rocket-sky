  // ---------- destructible bodies: planets, moons and drifting wrecks are grids of small cells that shots chip away ----------
  // They move on the shared clock, so every player has the same ones. Each player reports the craters its own shots
  // (and its bots' shots) make and everyone applies them, so holes match. Pieces that break off become free rubble
  // that each player simulates on its own. A new round rebuilds everything.
  const PLANET_G = 320;   // px/s² at the surface of a whole 250-radius planet
  const PLANET_PAL = {
    gas:  { base: "#c98a5a", bands: ["#e8b27a", "#9c5f3c", "#f3d3a0", "#b7714a"], glow: "255,190,130" },
    ice:  { base: "#8fc9e8", bands: ["#d8f3ff", "#6aa6cf", "#bfe6f7"], glow: "160,225,255" },
    lava: { base: "#3a1c22", bands: ["#572630", "#2a1218"], glow: "255,110,50" },
    rock: { base: "#8a7f96", bands: ["#a59bb0", "#6f6580"], glow: "200,185,230" },
    moon: { base: "#8a7f96", bands: ["#a59bb0", "#6f6580"], glow: "200,185,230" }
  };
  const WRECK_PAL = { hull: ["#7d8aa3", "#5a6478", "#9aa6bf"], tower: ["#8f8aa0", "#6d6880", "#4a4660"], crates: ["#c0503c", "#3c78c0", "#d8a83c", "#4a9a6a"], ring: ["#8a93ad", "#5e6680", "#c8d0e8"],
    // the waste depot: skips, refuse trucks, giant wheelie bins and bales of crushed waste
    skip: ["#e8a530", "#b97a1c", "#f2c45a"], truck: ["#e8eef4", "#3c8a5a", "#2a3044"], wheelie: ["#3a7a4a", "#2a5a38", "#4fa060"], bales: ["#8a7a5a", "#5a7a9a", "#9a5a5a", "#6a8a5a"],
    // a station's props: crates, drums and glass partitions
    crate: ["#a8743f", "#6e4a28", "#d39a5c"], drum: ["#c23b2c", "#7a1f18", "#3a3a3a"], panel: ["#9fd6e0", "#4d5a63", "#c8f0f8"] };
  const BODY_RES = matchMedia("(pointer: coarse)").matches ? 0.6 : 1;   // art baked at lower resolution on phones
  let planets = [], moons = [], wrecks = [], det = [], rubble = [], bodies = [], worldCode = "lobby", mapKey = "m", rubbleSeq = 0;

  // what is solid is read back from the painted art, so the server (see server/sim) paints bodies on real canvases
  // of its own while the rest of its page stays inert
  const bodyCanvas = () => window.BRS_BODY_CANVAS ? window.BRS_BODY_CANVAS() : document.createElement("canvas");
  function newBody(id, kind, w, h, cs) {
    const gw = Math.max(1, Math.ceil(w / cs)), gh = Math.max(1, Math.ceil(h / cs)), c = bodyCanvas();
    c.width = Math.max(1, Math.ceil(gw * cs * BODY_RES)); c.height = Math.max(1, Math.ceil(gh * cs * BODY_RES));
    const q = c.getContext("2d", { willReadFrequently: true });   // read back after every crater
    q.scale(BODY_RES, BODY_RES);
    return { id, kind, cs, gw, gh, hw: gw * cs / 2, hh: gh * cs / 2, r: Math.hypot(gw * cs, gh * cs) / 2, rr: Math.max(gw, gh) * cs / 2,
             cells: new Uint8Array(gw * gh), cv: c, q, x: 0, y: 0, a: 0, vx: 0, vy: 0, va: 0, mass: 0, mass0: 0, free: false, dead: false, dirty: false, lastSplit: 0 };
  }
  // a cell is solid where the painted art is mostly opaque
  function cellsFromArt(b) {
    const W2 = b.cv.width, H2 = b.cv.height, img = b.q.getImageData(0, 0, W2, H2).data;
    let m = 0;
    for (let j = 0; j < b.gh; j++) for (let i = 0; i < b.gw; i++) {   // solid when at least a quarter of the cell is painted
      const x0 = Math.floor(i * b.cs * BODY_RES), y0 = Math.floor(j * b.cs * BODY_RES), x1 = Math.min(W2, Math.floor((i + 1) * b.cs * BODY_RES)), y1 = Math.min(H2, Math.floor((j + 1) * b.cs * BODY_RES));
      let on = 0, all = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { all++; if (img[(y * W2 + x) * 4 + 3] > 60) on++; }
      if (all && on >= all * 0.25) { b.cells[j * b.gw + i] = 1; m++; }
    }
    b.mass = b.mass0 = m;
    b.initialCells = b.cells.slice();
  }
  // light from the top-left over whatever is painted
  function shade(q, w, h) {
    q.save(); q.globalCompositeOperation = "source-atop";
    const sg = q.createLinearGradient(0, 0, w, h);
    sg.addColorStop(0, "rgba(255,255,255,0.18)"); sg.addColorStop(0.5, "rgba(0,0,0,0)"); sg.addColorStop(1, "rgba(8,4,24,0.6)");
    q.fillStyle = sg; q.fillRect(0, 0, w, h);
    q.restore();
  }

