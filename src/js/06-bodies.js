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

  // ---------- planet art: the disc on the body canvas; atmosphere and rings are drawn apart (they can't be shot) ----------
  function paintPlanet(b, R, kind, rnd) {
    const pal = PLANET_PAL[kind], q = b.q;
    q.save(); q.translate(b.hw, b.hh);
    q.beginPath(); q.arc(0, 0, R, 0, 6.29); q.clip();
    q.fillStyle = pal.base; q.fillRect(-R, -R, R * 2, R * 2);
    q.save(); q.rotate(b.tilt * 0.6);
    if (kind === "gas" || kind === "ice") {   // wavy cloud bands
      for (let k = 0; k < 14; k++) {
        const y = -R + (k + rnd(k)) * R * 2 / 14, th = R * (0.05 + rnd(k + 20) * 0.1);
        q.fillStyle = pal.bands[k % pal.bands.length]; q.globalAlpha = 0.45 + rnd(k + 30) * 0.4;
        q.beginPath();
        for (let x = -R; x <= R; x += R / 12) q.lineTo(x, y + Math.sin(x / R * 4 + rnd(k + 40) * 6) * R * 0.035);
        for (let x = R; x >= -R; x -= R / 12) q.lineTo(x, y + th + Math.sin(x / R * 3 + rnd(k + 45) * 6) * R * 0.035);
        q.fill();
      }
      q.globalAlpha = 1;
      if (kind === "gas") {
        q.fillStyle = "rgba(170,70,50,0.75)"; q.beginPath(); q.ellipse(R * (rnd(70) - 0.5), R * (rnd(71) * 0.6 - 0.1), R * 0.2, R * 0.1, 0, 0, 6.29); q.fill();
        q.fillStyle = "rgba(240,170,120,0.6)"; q.beginPath(); q.ellipse(R * (rnd(70) - 0.5), R * (rnd(71) * 0.6 - 0.1), R * 0.11, R * 0.05, 0, 0, 6.29); q.fill();
      } else {
        q.fillStyle = "rgba(255,255,255,0.85)";
        q.beginPath(); q.ellipse(0, -R * 0.95, R * 0.6, R * 0.25, 0, 0, 6.29); q.fill();
        q.beginPath(); q.ellipse(0, R * 0.97, R * 0.45, R * 0.18, 0, 0, 6.29); q.fill();
      }
    } else {   // rocky surface: blotches and craters (and rivers of lava)
      for (let k = 0; k < 26; k++) {
        q.fillStyle = pal.bands[k % pal.bands.length]; q.globalAlpha = 0.35;
        q.beginPath(); q.arc(R * (rnd(k) * 2 - 1), R * (rnd(k + 100) * 2 - 1), R * (0.1 + rnd(k + 200) * 0.3), 0, 6.29); q.fill();
      }
      q.globalAlpha = 1;
      for (let k = 0; k < 16; k++) {
        const x = R * (rnd(k + 300) * 1.8 - 0.9), y = R * (rnd(k + 400) * 1.8 - 0.9), cr = R * (0.04 + rnd(k + 500) * 0.11);
        q.fillStyle = "rgba(20,10,30,0.35)"; q.beginPath(); q.arc(x, y, cr, 0, 6.29); q.fill();
        q.strokeStyle = "rgba(255,255,255,0.18)"; q.lineWidth = cr * 0.25; q.beginPath(); q.arc(x - cr * 0.1, y - cr * 0.1, cr, 3.4, 5.6); q.stroke();
      }
      if (kind === "lava") {
        q.lineCap = "round"; q.lineJoin = "round";
        for (let k = 0; k < 9; k++) {
          let x = R * (rnd(k + 600) * 1.6 - 0.8), y = R * (rnd(k + 700) * 1.6 - 0.8), a = rnd(k + 800) * 6.28;
          q.beginPath(); q.moveTo(x, y);
          for (let j = 0; j < 7; j++) { a += (rnd(k * 10 + j + 900) - 0.5) * 1.6; x += Math.cos(a) * R * 0.13; y += Math.sin(a) * R * 0.13; q.lineTo(x, y); }
          q.strokeStyle = "rgba(255,90,30,0.55)"; q.lineWidth = R * 0.05; q.stroke();
          q.strokeStyle = "#ffc06a"; q.lineWidth = R * 0.015; q.stroke();
        }
      }
    }
    q.restore();
    const sg = q.createRadialGradient(-R * 0.45, -R * 0.45, R * 0.05, -R * 0.15, -R * 0.15, R * 1.4);
    sg.addColorStop(0, "rgba(255,255,255,0.22)"); sg.addColorStop(0.45, "rgba(0,0,0,0)"); sg.addColorStop(1, "rgba(8,4,24,0.85)");
    q.fillStyle = sg; q.fillRect(-R, -R, R * 2, R * 2);
    q.restore();
    // cells: the disc
    let m = 0;
    for (let j = 0; j < b.gh; j++) for (let i = 0; i < b.gw; i++) {
      if (((i + 0.5) * b.cs - b.hw) ** 2 + ((j + 0.5) * b.cs - b.hh) ** 2 < (R + b.cs * 0.2) ** 2) { b.cells[j * b.gw + i] = 1; m++; }
    }
    b.mass = b.mass0 = m;
    b.initialCells = b.cells.slice();
  }
  function paintRings(b, R, rnd) {
    const half = Math.ceil(R * 1.85), mk = front => {
      const c = document.createElement("canvas"); c.width = c.height = Math.ceil(half * 2 * BODY_RES);
      const q = c.getContext("2d"); q.scale(BODY_RES, BODY_RES); q.translate(half, half);
      q.rotate(b.tilt); q.scale(1, 0.3);
      q.beginPath(); q.rect(-half * 3, front ? 0 : -half * 6, half * 6, half * 6); q.clip();
      for (let k = 0; k < 7; k++) {
        q.strokeStyle = `rgba(${k % 2 ? "240,210,170" : "200,160,130"},${0.25 + rnd(k + 50) * 0.35})`;
        q.lineWidth = R * (0.03 + rnd(k + 60) * 0.05);
        q.beginPath(); q.arc(0, 0, R * (1.3 + k * 0.075), 0, 6.29); q.stroke();
      }
      return c;
    };
    b.ringB = mk(false); b.ringF = mk(true); b.ringHalf = half;
  }

  // ---------- wreck art: broken ship hulls, chunks of buildings, container stacks, station ring pieces ----------
  function bite(q, x, y, r, rnd, k0) {   // tear a ragged piece out
    q.save(); q.globalCompositeOperation = "destination-out"; q.beginPath();
    for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283, rr = r * (0.55 + rnd(k0 + k) * 0.6); q.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    q.closePath(); q.fill(); q.restore();
  }
  function scorch(q, x, y, r) {
    q.save(); q.globalCompositeOperation = "source-atop";
    const g2 = q.createRadialGradient(x, y, 0, x, y, r);
    g2.addColorStop(0, "rgba(20,12,16,0.75)"); g2.addColorStop(1, "rgba(20,12,16,0)");
    q.fillStyle = g2; q.beginPath(); q.arc(x, y, r, 0, 6.29); q.fill(); q.restore();
  }
  const rrectQ = (q, x, y, w, h, r) => { q.beginPath(); q.moveTo(x + r, y); q.arcTo(x + w, y, x + w, y + h, r); q.arcTo(x + w, y + h, x, y + h, r); q.arcTo(x, y + h, x, y, r); q.arcTo(x, y, x + w, y, r); q.closePath(); };
  function paintWreck(b, type, w, h, rnd) {
    const q = b.q, pal = WRECK_PAL[type];
    q.save(); q.translate((b.hw * 2 - w) / 2, (b.hh * 2 - h) / 2);
    if (type === "hull") {
      const g1 = q.createLinearGradient(0, 0, 0, h);
      g1.addColorStop(0, pal[2]); g1.addColorStop(0.5, pal[0]); g1.addColorStop(1, pal[1]);
      q.fillStyle = g1;
      q.beginPath(); q.moveTo(w * 0.02, h * 0.4); q.lineTo(w * 0.2, h * 0.1); q.lineTo(w * 0.88, h * 0.08); q.lineTo(w * 0.98, h * 0.28);
      q.lineTo(w * 0.98, h * 0.72); q.lineTo(w * 0.88, h * 0.92); q.lineTo(w * 0.2, h * 0.9); q.lineTo(w * 0.02, h * 0.6); q.closePath(); q.fill();
      q.strokeStyle = "rgba(20,24,40,0.45)"; q.lineWidth = 1.5;
      for (let k = 1; k < 8; k++) { const x = w * (0.2 + k * 0.088); q.beginPath(); q.moveTo(x, h * 0.1); q.lineTo(x, h * 0.9); q.stroke(); }
      q.beginPath(); q.moveTo(w * 0.2, h * 0.5); q.lineTo(w * 0.96, h * 0.5); q.stroke();
      q.fillStyle = rnd(1) < 0.5 ? "#ff8a3c" : "#4fd6c8"; q.fillRect(w * 0.22, h * 0.62, w * 0.66, h * 0.06);
      for (let k = 0; k < 14; k++) { q.fillStyle = rnd(k + 10) < 0.5 ? "#9ff3ff" : "#1a2236"; q.fillRect(w * (0.24 + k * 0.047), h * 0.27, w * 0.022, h * 0.08); }
      for (const yy of [0.22, 0.56]) { q.fillStyle = "#2a3044"; q.fillRect(w * 0.93, h * yy, w * 0.06, h * 0.2); }
      q.fillStyle = "rgba(20,24,40,0.6)"; q.beginPath(); q.moveTo(w * 0.02, h * 0.4); q.lineTo(w * 0.2, h * 0.1); q.lineTo(w * 0.2, h * 0.9); q.lineTo(w * 0.02, h * 0.6); q.fill();
      for (let k = 0; k < 5; k++) scorch(q, w * rnd(k + 30), h * rnd(k + 40), h * (0.2 + rnd(k + 50) * 0.3));
      bite(q, rnd(2) < 0.5 ? w * 0.06 : w * 0.95, h * (0.3 + rnd(3) * 0.4), h * 0.55, rnd, 60);
      bite(q, w * (0.3 + rnd(4) * 0.4), rnd(5) < 0.5 ? 0 : h, h * 0.35, rnd, 80);
    } else if (type === "tower") {
      q.fillStyle = pal[0];
      q.beginPath(); q.moveTo(0, h); q.lineTo(0, h * 0.12);
      for (let k = 0; k <= 8; k++) q.lineTo(w * k / 8, h * (0.04 + rnd(k) * 0.16));   // torn top edge
      q.lineTo(w, h); q.closePath(); q.fill();
      q.fillStyle = pal[1]; q.fillRect(0, h * 0.94, w, h * 0.06);
      const cols = 5, rows = 9;
      for (let r2 = 0; r2 < rows; r2++) for (let c2 = 0; c2 < cols; c2++) {
        const lit = rnd(r2 * 7 + c2 + 100);
        q.fillStyle = lit < 0.3 ? "#ffd27a" : lit < 0.45 ? "#9ff3ff" : "#2a2440";
        q.fillRect(w * (0.08 + c2 * 0.18), h * (0.24 + r2 * 0.08), w * 0.12, h * 0.05);
      }
      q.strokeStyle = "#5a5470"; q.lineWidth = 3;   // rebar sticking out of the break
      for (let k = 0; k < 6; k++) { const x = w * (0.1 + rnd(k + 200) * 0.8); q.beginPath(); q.moveTo(x, h * 0.18); q.lineTo(x + (rnd(k + 210) - 0.5) * 30, h * (0.02 + rnd(k + 220) * 0.08)); q.stroke(); }
      for (let k = 0; k < 4; k++) scorch(q, w * rnd(k + 30), h * rnd(k + 40), w * (0.2 + rnd(k + 50) * 0.3));
      bite(q, rnd(6) < 0.5 ? 0 : w, h * (0.4 + rnd(7) * 0.4), w * 0.35, rnd, 90);
    } else if (type === "crates") {
      for (let k = 0; k < 5; k++) {
        const cw = w * 0.42, ch = h * 0.24, x = w * (0.05 + rnd(k + 300) * 0.5), y = h * (0.05 + k * 0.18);
        q.save(); q.translate(x + cw / 2, y + ch / 2); q.rotate((rnd(k + 310) - 0.5) * 0.5);
        q.fillStyle = pal[k % pal.length]; q.fillRect(-cw / 2, -ch / 2, cw, ch);
        q.strokeStyle = "rgba(0,0,0,0.3)"; q.lineWidth = 2;
        for (let s = 1; s < 8; s++) { q.beginPath(); q.moveTo(-cw / 2 + cw * s / 8, -ch / 2); q.lineTo(-cw / 2 + cw * s / 8, ch / 2); q.stroke(); }
        q.strokeRect(-cw / 2, -ch / 2, cw, ch);
        q.restore();
      }
      for (let k = 0; k < 3; k++) scorch(q, w * rnd(k + 30), h * rnd(k + 40), w * 0.2);
    } else if (type === "skip") {   // a skip: a tapered steel container, ribbed sides, lifting lugs, rubbish heaped on top
      for (let k = 0; k < 9; k++) { q.fillStyle = ["#7a6a8a", "#4f8a5a", "#b05040", "#d8c8a0", "#5a6a9a"][k % 5]; q.beginPath(); q.arc(w * (0.12 + k * 0.095), h * (0.2 + rnd(k + 500) * 0.08), h * (0.1 + rnd(k + 510) * 0.08), 0, 6.29); q.fill(); }
      const g1 = q.createLinearGradient(0, 0, 0, h); g1.addColorStop(0, pal[2]); g1.addColorStop(1, pal[1]);
      q.fillStyle = g1; q.beginPath(); q.moveTo(0, h * 0.25); q.lineTo(w, h * 0.25); q.lineTo(w * 0.86, h * 0.95); q.lineTo(w * 0.14, h * 0.95); q.closePath(); q.fill();
      q.strokeStyle = "rgba(60,36,10,0.5)"; q.lineWidth = 3;
      for (let k = 1; k < 6; k++) { const x = w * (0.1 + k * 0.135); q.beginPath(); q.moveTo(x, h * 0.28); q.lineTo(x + (0.5 - k / 6) * w * 0.12, h * 0.92); q.stroke(); }
      q.fillStyle = "#4a3a20"; for (const x of [0.08, 0.92]) { q.beginPath(); q.arc(w * x, h * 0.45, h * 0.07, 0, 6.29); q.fill(); }
      q.fillStyle = "#222630"; q.fillRect(w * 0.12, h * 0.95, w * 0.76, h * 0.05);
      for (let k = 0; k < 3; k++) scorch(q, w * rnd(k + 30), h * (0.3 + rnd(k + 40) * 0.6), h * 0.3);
      bite(q, rnd(6) < 0.5 ? 0 : w, h * (0.5 + rnd(7) * 0.3), h * 0.35, rnd, 90);
    } else if (type === "truck") {   // a refuse truck: cab, compactor body with a green stripe, rear hopper, wheels
      const g1 = q.createLinearGradient(0, 0, 0, h); g1.addColorStop(0, "#ffffff"); g1.addColorStop(1, "#b8c2cc");
      q.fillStyle = g1; rrectQ(q, w * 0.24, h * 0.08, w * 0.62, h * 0.62, 10); q.fill();   // the body
      q.fillStyle = pal[1]; q.fillRect(w * 0.24, h * 0.44, w * 0.62, h * 0.1);   // the green stripe
      q.fillStyle = "#c8d0d8"; q.beginPath(); q.moveTo(w * 0.86, h * 0.12); q.lineTo(w * 0.99, h * 0.3); q.lineTo(w * 0.99, h * 0.7); q.lineTo(w * 0.86, h * 0.7); q.closePath(); q.fill();   // hopper
      q.fillStyle = "#e8eef4"; rrectQ(q, w * 0.02, h * 0.22, w * 0.22, h * 0.48, 12); q.fill();   // the cab
      q.fillStyle = "#9ff3ff"; rrectQ(q, w * 0.05, h * 0.27, w * 0.12, h * 0.17, 6); q.fill();   // its window
      q.fillStyle = "#ffb43c"; q.fillRect(w * 0.1, h * 0.17, w * 0.05, h * 0.05);   // beacon
      q.fillStyle = "#1e222c"; q.fillRect(w * 0.02, h * 0.7, w * 0.96, h * 0.08);
      for (const x of [0.13, 0.55, 0.75]) { q.fillStyle = "#1a1d26"; q.beginPath(); q.arc(w * x, h * 0.8, h * 0.15, 0, 6.29); q.fill(); q.fillStyle = "#8a93ad"; q.beginPath(); q.arc(w * x, h * 0.8, h * 0.06, 0, 6.29); q.fill(); }
      q.strokeStyle = "rgba(30,34,44,0.35)"; q.lineWidth = 2;
      for (let k = 1; k < 6; k++) { const x = w * (0.24 + k * 0.1); q.beginPath(); q.moveTo(x, h * 0.1); q.lineTo(x, h * 0.42); q.stroke(); }
      for (let k = 0; k < 4; k++) scorch(q, w * rnd(k + 30), h * rnd(k + 40), h * 0.3);
      bite(q, w * (0.3 + rnd(4) * 0.4), rnd(5) < 0.5 ? 0 : h, h * 0.35, rnd, 80);
    } else if (type === "wheelie") {   // a giant wheelie bin, its lid in one of the collection colours
      const lid = ["#3c78c0", "#3a7a4a", "#8a5a30", "#2a2a34", "#7a4a9a"][Math.floor(rnd(9) * 5)];
      const g1 = q.createLinearGradient(0, 0, w, 0); g1.addColorStop(0, "#2a2e3a"); g1.addColorStop(0.5, "#3e4454"); g1.addColorStop(1, "#262a34");
      q.fillStyle = g1; q.beginPath(); q.moveTo(w * 0.08, h * 0.16); q.lineTo(w * 0.92, h * 0.16); q.lineTo(w * 0.84, h * 0.9); q.lineTo(w * 0.16, h * 0.9); q.closePath(); q.fill();
      q.fillStyle = lid; rrectQ(q, w * 0.02, h * 0.06, w * 0.96, h * 0.12, 8); q.fill();
      q.fillStyle = "#1a1d26"; q.fillRect(w * 0.3, 0, w * 0.4, h * 0.07);   // the handle
      q.strokeStyle = "rgba(255,255,255,0.08)"; q.lineWidth = 3;
      for (let k = 1; k < 4; k++) { q.beginPath(); q.moveTo(w * (0.15 + k * 0.17), h * 0.22); q.lineTo(w * (0.18 + k * 0.16), h * 0.86); q.stroke(); }
      q.fillStyle = "#f2f2f2"; rrectQ(q, w * 0.34, h * 0.35, w * 0.32, h * 0.16, 6); q.fill();   // a label panel
      q.fillStyle = lid; q.font = `700 ${Math.round(h * 0.09)}px sans-serif`; q.textAlign = "center"; q.fillText("♻", w * 0.5, h * 0.47);
      for (const x of [0.22, 0.78]) { q.fillStyle = "#14161e"; q.beginPath(); q.arc(w * x, h * 0.92, h * 0.08, 0, 6.29); q.fill(); }
      for (let k = 0; k < 3; k++) scorch(q, w * rnd(k + 30), h * (0.2 + rnd(k + 40) * 0.6), w * 0.25);
      bite(q, rnd(6) < 0.5 ? 0 : w, h * (0.3 + rnd(7) * 0.5), w * 0.3, rnd, 90);
    } else if (type === "bales") {   // bales of crushed waste, mottled and strapped with wire
      for (let k = 0; k < 6; k++) {
        const bw = w * 0.46, bh = h * 0.3, x = w * (k % 2 ? 0.5 : 0.04) + (rnd(k + 600) - 0.5) * 10, y = h * (0.06 + Math.floor(k / 2) * 0.31);
        q.save(); q.translate(x + bw / 2, y + bh / 2); q.rotate((rnd(k + 610) - 0.5) * 0.25);
        q.fillStyle = pal[k % pal.length]; q.fillRect(-bw / 2, -bh / 2, bw, bh);
        for (let j = 0; j < 22; j++) { q.fillStyle = ["#d8c8a0", "#4f8a5a", "#b05040", "#5a6a9a", "#e8e0d0", "#3a3a44"][j % 6]; q.globalAlpha = 0.55; q.fillRect(-bw / 2 + rnd(k * 40 + j) * bw * 0.9, -bh / 2 + rnd(k * 40 + j + 20) * bh * 0.85, 6 + rnd(j + k) * 10, 4 + rnd(j * 3 + k) * 6); }
        q.globalAlpha = 1; q.strokeStyle = "#c8ccd4"; q.lineWidth = 2;
        for (const sx2 of [-0.25, 0.25]) { q.beginPath(); q.moveTo(bw * sx2, -bh / 2); q.lineTo(bw * sx2, bh / 2); q.stroke(); }
        q.restore();
      }
      for (let k = 0; k < 3; k++) scorch(q, w * rnd(k + 30), h * rnd(k + 40), w * 0.2);
    } else {   // a piece of a station ring
      q.save(); q.translate(w / 2, h * 1.35);
      const R1 = h * 1.3, R0 = h * 0.85, a0 = -Math.PI / 2 - 0.62, a1 = -Math.PI / 2 + 0.62;
      q.fillStyle = pal[0]; q.beginPath(); q.arc(0, 0, R1, a0, a1); q.arc(0, 0, R0, a1, a0, true); q.closePath(); q.fill();
      q.strokeStyle = pal[1]; q.lineWidth = 2;
      for (let k = 0; k <= 10; k++) { const a = a0 + (a1 - a0) * k / 10; q.beginPath(); q.moveTo(Math.cos(a) * R0, Math.sin(a) * R0); q.lineTo(Math.cos(a) * R1, Math.sin(a) * R1); q.stroke(); }
      for (let k = 0; k < 12; k++) { const a = a0 + (a1 - a0) * (k + 0.5) / 12; q.fillStyle = rnd(k + 400) < 0.6 ? "#9ff3ff" : "#1a2236"; q.beginPath(); q.arc(Math.cos(a) * (R0 + R1) / 2, Math.sin(a) * (R0 + R1) / 2, 4, 0, 6.29); q.fill(); }
      q.restore();
      for (let k = 0; k < 3; k++) scorch(q, w * rnd(k + 30), h * rnd(k + 40), h * 0.4);
      bite(q, rnd(8) < 0.5 ? w * 0.08 : w * 0.92, h * 0.5, h * 0.4, rnd, 120);
    }
    q.restore();
    shade(q, b.hw * 2, b.hh * 2);
    cellsFromArt(b);
  }

  const toLocal = (b, px, py) => { const dx = px - b.x, dy = py - b.y, c = Math.cos(b.a), s = Math.sin(b.a); return [dx * c + dy * s + b.hw, -dx * s + dy * c + b.hh]; };
  const toWorld = (b, lx, ly) => { const dx = lx - b.hw, dy = ly - b.hh, c = Math.cos(b.a), s = Math.sin(b.a); return [b.x + dx * c - dy * s, b.y + dx * s + dy * c]; };
  function solidAt(b, px, py) {
    const dx = px - b.x, dy = py - b.y;
    if (dx * dx + dy * dy > b.r * b.r) return false;
    const [lx, ly] = toLocal(b, px, py), i = Math.floor(lx / b.cs), j = Math.floor(ly / b.cs);
    return i >= 0 && j >= 0 && i < b.gw && j < b.gh && b.cells[j * b.gw + i] === 1;
  }
  const solidAny = (x, y) => { for (const b of bodies) if (solidAt(b, x, y)) return b; return null; };
  // rough test for placement and steering: inside a body's footprint (plus a margin)
  const inBody = (x, y, pad) => { for (const b of bodies) if (!b.free && (b.fixed || b.wall ? Math.abs(x - b.x) < b.hw + pad && Math.abs(y - b.y) < b.hh + pad : (x - b.x) ** 2 + (y - b.y) ** 2 < (b.rr + pad) ** 2)) return b; return null; };
  function rebuildBodies() { bodies = det.filter(b => !b.dead && !b.free).concat(rubble.filter(b => !b.dead)); }

  // everything that scales with the arena: pick-ups and junk keep about the same density (capped for the huge map)
  function setMapSize(key) {
    const [size] = MAP_SIZES[key], a = Math.min(6, (size / 2600) ** 2);
    W = H = size; mapKey = key;
    SLOTS = 0; ROCKS = Math.round(16 * a); GOLD_N = 0;   // no stars to collect (score comes from hits and kills): less clutter
    world.sparks.length = world.rocks.length = world.picks.length = world.supplies.length = 0;
  }
  // a wreck's size: [w, h] at Medium, from its type and its own random numbers
  const wreckDims = (type, rnd) => type === "hull" ? [320 + rnd(1) * 120, 110 + rnd(2) * 40] : type === "tower" ? [170 + rnd(1) * 60, 250 + rnd(2) * 80]
    : type === "crates" ? [230 + rnd(1) * 40, 170 + rnd(2) * 40] : type === "skip" ? [250 + rnd(1) * 50, 130 + rnd(2) * 20]
    : type === "truck" ? [380 + rnd(1) * 60, 150 + rnd(2) * 20] : type === "wheelie" ? [150 + rnd(1) * 30, 210 + rnd(2) * 40]
    : type === "bales" ? [230 + rnd(1) * 40, 180 + rnd(2) * 30] : [300 + rnd(1) * 60, 120 + rnd(2) * 30];
  // the arena's fixed spots in world units: guns, supplies, Overdrive and the two big bombs (see 01b-arenas.js)
  let arena = { guns: [], supplies: [], amp: null, nuke: null, holy: null, pads: [] };
  // the Large and Huge arenas: more pairs in the widest gaps, found the same way every time (no randomness)
  function widestGap(taken, pad, edge) {
    let best = null, bd = -1;
    for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) {
      const x = edge + i * (1 - 2 * edge) / 40, y = edge + j * (1 - 2 * edge) / 40;
      if (Math.abs(x - 0.5) < 0.02 && Math.abs(y - 0.5) < 0.02) continue;
      let d = Infinity;
      for (const t of taken) d = Math.min(d, Math.hypot(t.x - x, t.y - y) - t.r);
      if (d > bd) { bd = d; best = { x, y }; }
    }
    return bd > pad ? best : null;
  }
  function buildPlanets(code) {
    worldCode = code;
    const theme = mapThemeOf(code), T = MAPS[theme], A = ARENAS[theme], rs = ARENA_SCALE[mapKey] || 1, big = mapKey === "l" ? 1 : mapKey === "x" ? 2 : 0;
    // the same arena looks the same in every lobby: sky, planets and wrecks are seeded by the map and its size only
    let seed = 7;
    for (const ch of theme + mapKey) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0;
    buildSky(seed ^ 0x2b7);
    planets = []; moons = []; wrecks = []; rubble = [];
    if (T.station) { buildFoundry(); return; }
    const addPlanet = (x, y, R, kind, pseed, tilt) => {
      const rnd = k => hash(pseed, k, 404), p = newBody("p" + planets.length, kind, R * 2 + 4, R * 2 + 4, clamp(R / 28, 8, 12));
      Object.assign(p, { x, y, rr: R, planet: true, tilt });
      paintPlanet(p, R, kind, rnd);
      if (kind === "gas") paintRings(p, R, rnd);
      if (T.lumpy) {   // an asteroid: big bites out of the rim leave a lumpy rock (seeded, so the same on every screen)
        let n = 0; const seq = () => hash(pseed, 900 + n++, 404);
        for (let k = 0, nb = 6 + Math.floor(rnd(30) * 4); k < nb; k++) {   // bites spread round the rim
          const a = (k + rnd(40 + k) * 0.7) / nb * 6.283, d = R * (0.9 + rnd(50 + k) * 0.3), rad = R * (0.25 + rnd(60 + k) * 0.3);
          carveLocal(p, p.hw + Math.cos(a) * d, p.hh + Math.sin(a) * d, rad, false, seq);
        }
        p.mass0 = p.mass; p.dirty = false; p.bare = true;   // bare rock: no atmosphere
      }
      p.hx = p.x; p.hy = p.y;   // home: where it sits when no black hole is pulling it
      planets.push(p);
      return p;
    };
    // what is placed, in fractions with a reach, so the big arenas' extras keep clear of it (and of both CTF pads)
    const taken = [{ x: 0.1, y: 0.5, r: 0.09 }, { x: 0.9, y: 0.5, r: 0.09 }];
    if (T.star) {   // the sun: a huge glowing ball in the middle
      const R = Math.min(420, W * 0.09);
      addPlanet(W / 2, H / 2, R, "lava", seed + 7777, 0).star = true;
      taken.push({ x: 0.5, y: 0.5, r: R / W + 0.06 });
    }
    const planetList = mirrored(A.planets), wreckList = mirrored(A.wrecks);
    const layoutSpots = [...A.guns, ...A.supplies].map(([, x, y]) => ({ x, y })).concat([A.amp, A.nuke, A.holy, ...(A.pads || [])].filter(Boolean).map(([x, y]) => ({ x, y })));
    // the big arenas: a few more bodies like the ones already there, in the widest gaps
    for (let k = 0; k < big * 2; k++) {
      for (const [, x, y, R] of planetList) taken.push({ x, y, r: (R * rs + 300) / W });
      for (const [, x, y] of wreckList) taken.push({ x, y, r: 380 / W });
      for (const sp of mirrored(layoutSpots.map(o => ["", o.x, o.y]))) taken.push({ x: sp[1], y: sp[2], r: 0.03 });
      const at = widestGap(taken, 0.08, 0.15);
      if (!at) break;
      if (k % 2 && A.wrecks.length) { const w = A.wrecks[k % A.wrecks.length]; wreckList.push(...mirrored([[w[0], at.x, at.y]])); }
      else { const p = A.planets[k % A.planets.length]; planetList.push(...mirrored([[p[0], at.x, at.y, p[3], 0]])); }
      taken.length = T.star ? 3 : 2;
    }
    planetList.forEach(([kind, fx, fy, R0, nMoons], t) => {
      const R = R0 * rs, p = addPlanet(fx * W, fy * H, R, T.lumpy ? "rock" : kind, seed + t * 131, (hash(seed, t, 4) - 0.5) * 0.8);
      for (let j = 0; j < nMoons; j++) {
        const mr = (38 + hash(seed, t + j * 17, 6) * 30) * Math.sqrt(rs), mseed = seed + t * 977 + j * 53;
        const mo = newBody("m" + moons.length, "moon", mr * 2 + 4, mr * 2 + 4, 7);
        Object.assign(mo, { p, rr: mr, moon: true, tilt: 0, orbit: R + (190 + j * 170 + hash(seed, t + j * 17, 7) * 80) * rs, period: 45 + j * 25 + hash(seed, t, 8) * 40,
                            ph: hash(seed, t + j * 17, 10) * 6.283, dir: hash(seed, t, 11) < 0.5 ? -1 : 1 });
        paintPlanet(mo, mr, "moon", k => hash(mseed, k, 404));
        moons.push(mo);
      }
    });
    // wrecks drift a little on the spot and turn slowly (the ones laid at an angle stay lined up)
    const ws = clamp(rs, 0.8, 1.25);
    wreckList.forEach(([type, fx, fy, ang], t) => {
      const wseed = seed + t * 389, rnd = k => hash(wseed, k, 505), [w0, h0] = wreckDims(type, rnd), w = w0 * ws, h = h0 * ws;
      const b = newBody("w" + wrecks.length, type, w, h, 8), lined = typeof ang === "number";
      Object.assign(b, { rr: Math.hypot(w, h) / 2, bx: fx * W, by: fy * H, A: (lined ? 15 : 25 + hash(seed, t, 25) * 30) * rs, T: 30 + hash(seed, t, 26) * 30, ph: hash(seed, t, 27) * 6.283,
                         dirA: hash(seed, t, 28) * 6.283, a0: lined ? ang + (t % 2) * Math.PI : hash(seed, t, 29) * 6.283,
                         spin: lined ? 0 : (hash(seed, t, 30) - 0.5) * 0.05, wreck: true });
      paintWreck(b, type, w, h, rnd);
      wrecks.push(b);
    });
    // the spots: the layout's own, then (Large / Huge) more pairs in the widest gaps, cycling through the map's guns
    const guns = mirrored(A.guns), supplies = mirrored(A.supplies), padList = mirrored((A.pads || []).map(([x, y, d]) => ["", x, y, d]))
      .map((p, i) => i % 2 ? [p[0], p[1], p[2], p[3] + 180] : p);   // a mirrored pad points the other way
    const reach = list => list.map(([, x, y]) => ({ x, y, r: 0 }));
    const bodyReach = () => [...planets.map(p => ({ x: p.hx / W, y: p.hy / H, r: (p.rr + 120) / W })), ...wrecks.map(w => ({ x: w.bx / W, y: w.by / H, r: (w.rr + w.A + 120) / W })),
      ...moons.map(m => ({ x: m.p.hx / W, y: m.p.hy / H, r: 0 }))];
    const spotsNow = () => [...taken, ...bodyReach(), ...reach(guns), ...reach(supplies), ...padList.map(([, x, y]) => ({ x, y, r: 0.02 })),
      ...[A.amp, A.nuke, A.holy].filter(Boolean).map(([x, y]) => ({ x, y, r: 0 }))];
    for (let k = 0; k < big * 3; k++) {
      const at = widestGap(spotsNow(), 0.06, 0.05);
      if (!at) break;
      if (k % 3 === 2) supplies.push(...mirrored([[A.supplies[k % A.supplies.length][0], at.x, at.y]]));
      else guns.push(...mirrored([[A.guns[k % A.guns.length][0], at.x, at.y]]));
    }
    const spot = ([type, fx, fy], i, P) => ({ type, x: fx * W, y: fy * H, P, off: hash(seed, i, 61) * P });
    arena = {
      guns: guns.map((e, i) => spot(e, i, GUN_PERIOD[e[0]] || GUN_PERIOD_BASE)),
      supplies: supplies.map((e, i) => spot(e, i + 100, SUPPLIES[e[0]].period)),
      amp: A.amp ? spot(["amp", ...A.amp], 200, AMP_PERIOD) : null,
      nuke: A.nuke && (big || modeOf(code) === "n" || modeOf(code) === "x") ? spot(["nuke", ...A.nuke], 201, BOMB_CRATES.nuke.period) : null,
      holy: A.holy && (big || modeOf(code) === "x") ? spot(["holy", ...A.holy], 202, BOMB_CRATES.holy.period) : null,
      pads: BOOST_PADS ? padList.map(([, fx, fy, deg]) => ({ x: fx * W, y: fy * H, a: deg / 57.2958 })) : []   // (their places are still kept clear)
    };
    PICKS = arena.guns.length; SUPPLY_SLOTS = arena.supplies.length;
    det = [...planets, ...moons, ...wrecks];
    rebuildBodies();
    posesAt(clockNow(), 0);
    if (inBody(me.x, me.y, 80)) Object.assign(me, spawnPoint());
  }
  const TAU_MOD = a => a - Math.floor(a / (2 * Math.PI)) * 2 * Math.PI;
  // where every shared body is at this moment (planets sit still, moons orbit, wrecks bob and turn)
  function posesAt(t, dt) {
    const s = t / 1000;
    for (const b of det) {
      if (b.free || b.dead || b.fixed) continue;
      const ox = b.x, oy = b.y;
      // angles are wrapped to 0..2π: the shared clock is huge (s ~ 1.7e9), and canvas rotate() keeps angles in single
      // precision, so an unwrapped 3e7 rad drew a wreck up to a radian off from where hits were tested
      if (b.moon) { const a = TAU_MOD(b.ph + b.dir * 6.283 * s / b.period); b.x = b.p.hx + Math.cos(a) * b.orbit; b.y = b.p.hy + Math.sin(a) * b.orbit; b.a = a; }
      else if (b.wreck) { const o = Math.sin(s / b.T * 6.283 + b.ph) * b.A; b.x = b.bx + Math.cos(b.dirA) * o; b.y = b.by + Math.sin(b.dirA) * o; b.a = TAU_MOD(b.a0 + b.spin * s); }
      else { b.x = b.hx; b.y = b.hy; }
      holePull(b, t, b.moon || b.wreck ? 0.2 : 0.55);   // a black hole drags it in (planets resist more)
      if (dt > 0) { b.vx = (b.x - ox) / dt; b.vy = (b.y - oy) / dt; }
    }
  }

  // ---------- craters ----------
  const myCarves = [], seenCarves = new Set();
  let carveSeq = 0;
  function bodyCol(b) {
    if (b.fixed) return "#6f8996";
    if (b.wall || b.kind === "station") return station().wall[Math.random() < 0.5 ? 0 : 1];   // a station wall's chips (and a piece blown off it): its own colours
    const list = PLANET_PAL[b.kind] ? PLANET_PAL[b.kind].bands : WRECK_PAL[b.kind];
    return list[Math.floor(Math.random() * list.length)];
  }
  // art in an empty cell is only kept while it borders a solid one (it's the soft outline of the body);
  // once nothing solid is next to it, it would hang in space as a ghost sliver, so it's wiped
  const solidNear = (b, i, j) => {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj;
      if (ii >= 0 && jj >= 0 && ii < b.gw && jj < b.gh && b.cells[jj * b.gw + ii]) return true;
    }
    return false;
  };
  function sweepOrphans(b, i0, i1, j0, j1) {
    i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(b.gw - 1, i1); j1 = Math.min(b.gh - 1, j1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (!b.cells[j * b.gw + i] && !solidNear(b, i, j)) b.q.clearRect(i * b.cs - 0.5, j * b.cs - 0.5, b.cs + 1, b.cs + 1);
    }
  }
  // around a fresh crater, a cell that kept less than a quarter of its art stops being solid
  // (otherwise a shot would stop on a corner sliver while the visible edge is further in)
  function dropBareCells(b, i0, i1, j0, j1) {
    i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(b.gw - 1, i1); j1 = Math.min(b.gh - 1, j1);
    const cs = b.cs, R = BODY_RES, X = Math.floor(i0 * cs * R), Y = Math.floor(j0 * cs * R);
    const Wd = Math.min(b.cv.width - X, Math.ceil((i1 - i0 + 1) * cs * R)), Hd = Math.min(b.cv.height - Y, Math.ceil((j1 - j0 + 1) * cs * R));
    if (Wd <= 0 || Hd <= 0) return 0;
    const img = b.q.getImageData(X, Y, Wd, Hd).data;
    let n = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * b.gw + i;
      if (!b.cells[k]) continue;
      const x0 = Math.floor(i * cs * R) - X, y0 = Math.floor(j * cs * R) - Y, x1 = Math.min(Wd, Math.floor((i + 1) * cs * R) - X), y1 = Math.min(Hd, Math.floor((j + 1) * cs * R) - Y);
      let on = 0, all = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { all++; if (img[(y * Wd + x) * 4 + 3] > 60) on++; }
      if (all && on < all * 0.25) { b.cells[k] = 0; n++; b.q.clearRect(i * cs, j * cs, cs, cs); }
    }
    return n;
  }
  // (a station's inner wall gives only to heavy weapons: WALL_CARVE, 01-config.js)
  function carveLocal(b, lx, ly, rad, hot, rnd = Math.random) {
    if (b.fixed) return 0;   // rnd: a seeded one when every client must cut the same shape
    if (b.wall) { if (rad < WALL_CARVE) return 0; rad *= WALL_GIVE; }
    const cs = b.cs, R2 = rad * 1.2, i0 = Math.max(0, Math.floor((lx - R2) / cs)), i1 = Math.min(b.gw - 1, Math.floor((lx + R2) / cs));
    const j0 = Math.max(0, Math.floor((ly - R2) / cs)), j1 = Math.min(b.gh - 1, Math.floor((ly + R2) / cs));
    // one ragged outline for both the cells and the art, so what you see is exactly what can be hit
    const jag = []; for (let k = 0; k < 12; k++) jag.push(rad * (0.9 + rnd() * 0.25));
    const edge = a => { const f = (a / 6.2832 + 1) % 1 * 12, k = Math.floor(f), t = f - k; return jag[k] * (1 - t) + jag[(k + 1) % 12] * t; };
    let n = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * b.gw + i;
      if (!b.cells[k]) continue;
      const dx = (i + 0.5) * cs - lx, dy = (j + 0.5) * cs - ly;
      if (dx * dx + dy * dy < edge(Math.atan2(dy, dx)) ** 2) { b.cells[k] = 0; n++; }
    }
    if (!n) return 0;
    // the hole in the art is cut along the very same outline the cells were cleared by
    const q = b.q;
    q.save(); q.globalCompositeOperation = "destination-out"; q.beginPath();
    for (let k = 0; k < 48; k++) { const a = k / 48 * 6.2832, rr = edge(a); q.lineTo(lx + Math.cos(a) * rr, ly + Math.sin(a) * rr); }
    q.closePath(); q.fill();
    q.globalCompositeOperation = "source-atop";
    const rg = q.createRadialGradient(lx, ly, rad * 0.8, lx, ly, rad * 1.7);
    rg.addColorStop(0, "rgba(15,8,18,0.9)"); rg.addColorStop(0.3, hot ? "rgba(255,120,40,0.5)" : "rgba(40,24,30,0.6)"); rg.addColorStop(1, "rgba(15,8,18,0)");
    q.fillStyle = rg; q.beginPath(); q.arc(lx, ly, rad * 1.7, 0, 6.29); q.fill();
    // a broken rim: a dark lip right at the hole and a thin pale fracture line just behind it
    const rim = (d, w, col) => {
      q.beginPath();
      for (let k = 0; k < 48; k++) { const a = k / 48 * 6.2832, rr = edge(a) + d; q.lineTo(lx + Math.cos(a) * rr, ly + Math.sin(a) * rr); }
      q.closePath(); q.lineWidth = w; q.strokeStyle = col; q.stroke();
    };
    q.lineJoin = "round";
    rim(1, 4, "rgba(8,4,12,0.55)");
    rim(3.5, 1.2, "rgba(255,236,210,0.22)");
    q.restore();
    if (hot) { (b.heat ||= []).push({ lx, ly, r: rad, t: performance.now() }); if (b.heat.length > 10) b.heat.shift(); }
    n += dropBareCells(b, i0 - 1, i1 + 1, j0 - 1, j1 + 1);
    sweepOrphans(b, i0 - 1, i1 + 1, j0 - 1, j1 + 1);
    b.mass -= n; b.dirty = true;
    return n;
  }
  // chips, dust and sparks flying out of a fresh crater
  // (a budget per frame: a railgun tunnel digs many craters at once and shouldn't bury the screen in particles)
  let fxT = 0, fxN = 0;
  function rubbleFx(b, x, y, rad, n) {
    const t = performance.now();
    if (t - fxT > 16) { fxT = t; fxN = 0; }
    if (fxN > (lowQ ? 8 : 20)) return;
    const big = rad >= 14, metal = !!WRECK_PAL[b.kind] && b.kind !== "crate", k = Math.min(big ? 7 : 2, 1 + (n >> 1)), [nx, ny] = normalAt(b, x, y), out = Math.atan2(ny, nx), bvx = b.vx || 0, bvy = b.vy || 0;
    fxN += k + 4;
    for (let i = 0; i < k; i++) {
      const a = out + (Math.random() - 0.5) * 2.2, v = 80 + Math.random() * (big ? 280 : 160);
      addDebris(x, y, Math.cos(a) * v + bvx, Math.sin(a) * v + bvy, 2.5 + Math.random() * (big ? 8 : 3.5), bodyCol(b), 5 + Math.random() * 5);
    }
    for (let i = 0; i < (lowQ ? 2 : 5); i++) {
      const a = out + (Math.random() - 0.5) * 1.8, v = 30 + Math.random() * 120;
      puff(x, y, Math.cos(a) * v + bvx, Math.sin(a) * v + bvy, 0.9 + Math.random() * 1.1, 5 + Math.random() * Math.min(14, rad * 0.35), i % 2 ? bodyCol(b) : "rgb(90,80,100)", 2);
    }
    const m = Math.round((lowQ ? 3 : 8) * (big ? 1 : 0.5));
    for (let i = 0; i < m; i++) {
      const a = out + (Math.random() - 0.5) * 1.5, v = metal ? 320 + Math.random() * 520 : 120 + Math.random() * 260;
      if (metal) puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.25 + Math.random() * 0.35, 1 + Math.random(), i % 3 ? "#fff1b8" : "#ff9a3c", 1, 0.06);
      else puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.5 + Math.random() * 0.6, 1.2 + Math.random(), i % 2 ? "#ffb050" : "#ff7a30", 1);
    }
  }
  // own: my shots (and my bots') on shared bodies are reported so everyone digs the same hole
  // the ragged edge of a shared crater comes from its own numbers, so every client cuts exactly the same shape
  const carveRnd = (lx, ly, r, sq) => { let n = 0; return () => hash(lx * 31 + ly, sq * 7 + n++, r); };
  // what a hit leaves on a station wall's face (painted only where the wall still stands): a light weapon a sooty
  // scorch and a few scratches; a heavy one, round the hole it blew, soot and cracks running out from it
  function wallMark(b, x, y, rad, heavy) {
    const [lx, ly] = toLocal(b, x, y), q = b.q;
    q.save(); q.globalCompositeOperation = "source-atop";
    const R = heavy ? rad * 1.6 : rad * 1.3 + 4, gr = q.createRadialGradient(lx, ly, 0, lx, ly, R);
    gr.addColorStop(0, `rgba(12,9,8,${heavy ? 0.7 : 0.4})`); gr.addColorStop(1, "rgba(12,9,8,0)");
    q.fillStyle = gr; q.fillRect(lx - R, ly - R, R * 2, R * 2);
    q.strokeStyle = heavy ? "rgba(8,6,6,0.75)" : "rgba(20,16,16,0.45)"; q.lineCap = "round";
    for (let k = 0, n = heavy ? 5 + Math.floor(Math.random() * 4) : 2 + Math.floor(Math.random() * 2); k < n; k++) {
      let a = Math.random() * 6.283, px = lx + Math.cos(a) * (heavy ? rad : 2), py = ly + Math.sin(a) * (heavy ? rad : 2);
      q.lineWidth = heavy ? 1.6 + Math.random() * 1.4 : 0.8; q.beginPath(); q.moveTo(px, py);
      for (let j = 0, m = heavy ? 4 : 2; j < m; j++) {   // a crack wanders a little as it runs
        a += (Math.random() - 0.5) * 0.9; const step = (heavy ? rad * 0.45 : 5) * (0.6 + Math.random() * 0.8);
        px += Math.cos(a) * step; py += Math.sin(a) * step; q.lineTo(px, py);
      }
      q.stroke();
    }
    q.restore();
  }
  // a station wall blown open: a cloud of dust rolling out both ways, shards of the wall flung out (some through the
  // hole) that skid to rest on the deck, a spray of sparks, burning bits arcing away with smoke trails, flames licking
  // round the edge of the hole for a moment, dark smoke hanging after, and the fire's light on everything round it
  function wallBreach(b, x, y, rad) {
    const [nx, ny] = normalAt(b, x, y), out = Math.atan2(ny, nx), q = lowQ ? 0.4 : 1, R = rad, col = () => bodyCol(b);
    const dust = ["rgb(126,120,116)", "rgb(98,94,92)", "rgb(150,142,134)"];
    for (let i = 0, m = Math.round(14 * q); i < m; i++) {   // dust
      const side = Math.random() < 0.3 ? out + Math.PI : out, a = side + (Math.random() - 0.5) * 2.4, v = 50 + Math.random() * 220;
      puff(x + Math.cos(a) * R * 0.4, y + Math.sin(a) * R * 0.4, Math.cos(a) * v, Math.sin(a) * v, 1.6 + Math.random() * 1.6, 12 + Math.random() * 18, i % 3 ? dust[i % 3] : col(), 2, 0, (Math.random() - 0.5) * 1.2, 0.9);
    }
    for (let i = 0, m = Math.round(22 * q); i < m; i++) {   // shards
      const side = Math.random() < 0.3 ? out + Math.PI : out, a = side + (Math.random() - 0.5) * 2.2, v = 220 + Math.random() * 520;
      addDebris(x, y, Math.cos(a) * v, Math.sin(a) * v, 2.5 + Math.random() * 7.5, col(), 10 + Math.random() * 8);
    }
    sparkShower(x, y, Math.cos(out), Math.sin(out), 1.3); sparkShower(x, y, -Math.cos(out), -Math.sin(out), 0.7);
    for (let i = 0, m = Math.round(16 * q); i < m; i++) {   // white-hot streaks off the metal
      const a = out + (Math.random() - 0.5) * 2.6, v = 400 + Math.random() * 700;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.25 + Math.random() * 0.45, 1 + Math.random() * 1.2, i % 3 ? "#fff1b8" : "#ffb04a", 1, 0.07, 0, 0.93);
    }
    for (let i = 0, m = Math.round(4 * q) + 1; i < m; i++) {   // burning bits arcing away
      const a = out + (Math.random() - 0.5) * 2, v = 260 + Math.random() * 380;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.9 + Math.random() * 0.8, 2.4 + Math.random() * 1.6, "fire", 8, 0, (Math.random() - 0.5) * 1.8, 0.975);
    }
    for (let i = 0, m = Math.round(12 * q); i < m; i++) {   // flames round the edge of the hole
      const a = Math.random() * 6.283, v = 20 + Math.random() * 60;
      puff(x + Math.cos(a) * R, y + Math.sin(a) * R, Math.cos(out) * v + Math.cos(a) * 20, Math.sin(out) * v + Math.sin(a) * 20, 0.5 + Math.random() * 0.7, 8 + Math.random() * 9, "fire", 4, 0, (Math.random() - 0.5) * 2, 0.92, 0.25 + Math.random() * 0.3);
    }
    for (let i = 0, m = Math.round(5 * q); i < m; i++) {   // dark smoke hanging after
      const a = out + (Math.random() - 0.5) * 1.4, v = 15 + Math.random() * 40;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 3 + Math.random() * 2, 18 + Math.random() * 14, SMOKE_COLS[i % 2], 2, 0, (Math.random() - 0.5) * 0.6, 0.95);
    }
    impacts.push({ x, y, t: 0, r: 260, col: "255,170,90", dur: 1.3, soft: 0.45, flick: Math.random() * 6.28 });
    if (Math.hypot(x - me.x, y - me.y) < 1200) shake = Math.max(shake, 0.35 * (1 - Math.hypot(x - me.x, y - me.y) / 1200));
    sfx("chunk", 0.9, 0.7, x, y);
  }
  function carveAt(b, x, y, rad, own) {
    if (b.dead) return 0;
    if (b.wall && rad < WALL_CARVE) { wallMark(b, x, y, rad, false); return 0; }   // (a light weapon only marks it)
    const [lx0, ly0] = toLocal(b, x, y), lx = Math.round(lx0), ly = Math.round(ly0), r = Math.round(rad);
    const shared = own && !b.free, sq = shared ? ++carveSeq : 0;
    const n = carveLocal(b, lx, ly, r, true, shared ? carveRnd(lx, ly, r, sq) : Math.random);
    if (!n) return 0;
    rubbleFx(b, x, y, rad, n);
    if (b.wall) { wallMark(b, x, y, rad * WALL_GIVE, true); wallBreach(b, x, y, rad * WALL_GIVE); }
    b.blast = { x, y, rad, at: performance.now() };   // what a piece cut off by this crater is flung away from
    if (own) b.lastOwn = true;
    if (shared) {
      myCarves.push({ at: performance.now(), d: [stats.round, det.indexOf(b), lx, ly, r, sq] });
      if (myCarves.length > MAX_CARVES) myCarves.shift();   // a rail tunnel is dozens of carves: room for a few seconds of them
    }
    return n;
  }
  const MAX_CARVES = 320;
  // A rail cut is one continuous capsule, not a row of craters. Cell removal is geometric
  // (independent of canvas resolution), so desktop and mobile agree on the entire tunnel.
  function carveLineLocal(b, x1, y1, x2, y2, rad) {
    if (b.fixed) return 0;
    if (b.wall) { if (rad < WALL_CARVE) return 0; rad *= WALL_GIVE; }
    const cs = b.cs, dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
    const i0 = Math.max(0, Math.floor((Math.min(x1, x2) - rad) / cs)), i1 = Math.min(b.gw - 1, Math.floor((Math.max(x1, x2) + rad) / cs));
    const j0 = Math.max(0, Math.floor((Math.min(y1, y2) - rad) / cs)), j1 = Math.min(b.gh - 1, Math.floor((Math.max(y1, y2) + rad) / cs));
    let n = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * b.gw + i;
      if (!b.cells[k]) continue;
      const x = (i + 0.5) * cs, y = (j + 0.5) * cs, t = len2 ? clamp(((x - x1) * dx + (y - y1) * dy) / len2, 0, 1) : 0;
      if ((x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2 <= rad * rad) { b.cells[k] = 0; n++; }
    }
    if (!n) return 0;
    const q = b.q;
    q.save(); q.lineCap = "round"; q.beginPath(); q.moveTo(x1, y1); q.lineTo(x2, y2);
    q.globalCompositeOperation = "source-atop"; q.strokeStyle = "rgba(160,100,255,0.65)"; q.lineWidth = rad * 2 + 7; q.stroke();
    q.globalCompositeOperation = "destination-out"; q.lineWidth = rad * 2; q.stroke(); q.restore();
    sweepOrphans(b, i0 - 1, i1 + 1, j0 - 1, j1 + 1);
    b.mass -= n; b.dirty = true;
    return n;
  }
  function carveBeam(s, rad) {
    const dx = s.x - s.px, dy = s.y - s.py, L = Math.hypot(dx, dy);
    if (!L) return;
    const ux = dx / L, uy = dy / L, own = s.mine || botById.has(s.owner);
    for (const b of bodies) {
      if (b.dead || (!own && !b.free)) continue;
      const along = (b.x - s.px) * ux + (b.y - s.py) * uy, t = clamp(along, 0, L), R = b.r + rad;
      if ((s.px + ux * t - b.x) ** 2 + (s.py + uy * t - b.y) ** 2 > R * R) continue;
      // Clip to the body's bounds to keep local coordinates small on the wire.
      const lo = Math.max(0, along - R), hi = Math.min(L, along + R);
      const [x1, y1] = toLocal(b, s.px + ux * lo, s.py + uy * lo).map(Math.round);
      const [x2, y2] = toLocal(b, s.px + ux * hi, s.py + uy * hi).map(Math.round);
      const n = carveLineLocal(b, x1, y1, x2, y2, rad);
      if (!n) continue;
      rubbleFx(b, s.px + ux * t, s.py + uy * t, rad, n);
      if (own) b.lastOwn = true;
      if (own && !b.free) {
        myCarves.push({ at: performance.now(), d: [stats.round, det.indexOf(b), x1, y1, rad, ++carveSeq, x2, y2] });
        if (myCarves.length > MAX_CARVES) myCarves.shift();
      }
    }
  }
  function applyRemoteCarves(id, list) {
    for (const e of list.slice(0, MAX_CARVES)) {
      if (!Array.isArray(e) || (e.length !== 6 && e.length !== 8) || !e.every(Number.isInteger)) continue;
      const [rd, bi, lx, ly, r, sq] = e, key = id + ":" + sq;
      if (rd !== stats.round || seenCarves.has(key)) continue;
      seenCarves.add(key);
      const b = det[bi];
      if (!b || b.dead || b.free || r < 2 || r > 700 || Math.abs(lx) > 3000 || Math.abs(ly) > 3000) continue;
      if (e.length === 8 && (Math.abs(e[6]) > 3000 || Math.abs(e[7]) > 3000 || r > 72)) continue;
      const n = e.length === 8 ? carveLineLocal(b, lx, ly, e[6], e[7], r) : carveLocal(b, lx, ly, r, true, carveRnd(lx, ly, r, sq));
      if (n) { const [x, y] = toWorld(b, lx, ly); rubbleFx(b, x, y, r, n); }
    }
    if (seenCarves.size > 4000) seenCarves.clear();
  }

  // Repair missed craters and late joins with a rolling snapshot of removed cells. Removal is
  // monotonic within a round, so duplicates and snapshots from different peers cannot fill a hole.
  // Only shared terrain is synchronized here. Detached rubble flies by each machine's own physics (the same for
  // the same pieces); on the authoritative server, the server also says where it is (rubbleWire / applyRubble).
  let terrainCursor = 0;
  function nextTerrain() {
    if (!det.length) return null;
    const bi = terrainCursor++ % det.length, b = det[bi];
    if (b.fixed) return null;
    if (b.dead || b.free) return [stats.round, bi, 1, ""];
    let bytes = "";
    for (let i = 0; i < b.cells.length; i += 8) {
      let bits = 0;
      for (let k = 0; k < 8 && i + k < b.cells.length; k++) if (b.initialCells[i + k] && !b.cells[i + k]) bits |= 1 << k;
      bytes += String.fromCharCode(bits);
    }
    return [stats.round, bi, 0, btoa(bytes)];
  }
  function applyTerrain(s) {
    if (s.length !== 4 || s[0] !== stats.round || !Number.isSafeInteger(s[1]) || (s[2] !== 0 && s[2] !== 1) || typeof s[3] !== "string") return;
    const b = det[s[1]];
    if (!b || b.dead || b.free || b.fixed) return;
    if (s[2] === 1) {
      if (s[3] !== "") return;
      b.dead = true; rebuildBodies(); return;
    }
    const count = Math.ceil(b.cells.length / 8);
    if (s[3].length !== Math.ceil(count / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s[3])) return;
    let bytes;
    try { bytes = atob(s[3]); } catch { return; }   // malformed network encoding
    if (bytes.length !== count) return;
    let removed = 0;
    for (let i = 0; i < b.cells.length; i++) if (b.cells[i] && (bytes.charCodeAt(i >> 3) & (1 << (i & 7)))) {
      b.cells[i] = 0; removed++;
      b.q.clearRect((i % b.gw) * b.cs, Math.floor(i / b.gw) * b.cs, b.cs, b.cs);
    }
    if (removed) {
      b.mass -= removed; b.dirty = true;
      sweepOrphans(b, 0, b.gw - 1, 0, b.gh - 1);
    }
  }

  // ---------- breaking apart: cut-off pieces fly away as rubble; a planet whittled down to its last 15% blows apart ----------
  function splitBody(b, now) {
    b.dirty = false; b.lastSplit = now;
    const { gw, gh, cells } = b, lab = new Int32Array(gw * gh).fill(-1), comps = [], stack = [];
    for (let k0 = 0; k0 < cells.length; k0++) {
      if (!cells[k0] || lab[k0] >= 0) continue;
      const id = comps.length, list = [];
      lab[k0] = id; stack.push(k0);
      while (stack.length) {
        const k = stack.pop(), i = k % gw;
        list.push(k);
        if (i > 0 && cells[k - 1] && lab[k - 1] < 0) { lab[k - 1] = id; stack.push(k - 1); }
        if (i < gw - 1 && cells[k + 1] && lab[k + 1] < 0) { lab[k + 1] = id; stack.push(k + 1); }
        if (k >= gw && cells[k - gw] && lab[k - gw] < 0) { lab[k - gw] = id; stack.push(k - gw); }
        if (k + gw < cells.length && cells[k + gw] && lab[k + gw] < 0) { lab[k + gw] = id; stack.push(k + gw); }
      }
      comps.push(list);
    }
    if (!comps.length) { b.dead = true; rebuildBodies(); return; }
    if (comps.length > 1) {
      let main = 0;
      comps.forEach((c, i) => { if (c.length > comps[main].length) main = i; });
      comps.forEach((c, i) => { if (i !== main) breakAway(b, c); });
      rebuildBodies();
    }
    if (b.prop && !b.free && !b.dead && b.mass < b.mass0 * 0.5) { collapseProp(b); return; }
    if (b.planet && !b.free && b.mass < b.mass0 * 0.15) {
      destroyPlanet(b, now);
      if (b.lastOwn && playing) { me.score += 25; showScore(); gainXp(5, now); floaters.push({ x: b.x, y: b.y - 80, t: 0, txt: "PLANET +25", gold: true }); }
      setFree(b, 0, 0);
      for (const m of moons) if (m.p === b && !m.free) setFree(m, -Math.sin(m.a) * m.dir * 60, Math.cos(m.a) * m.dir * 60);
      rebuildBodies();
    }
  }
  // key: the same name for the same piece on every machine (its parent and its own cells), so the server can say
  // where each piece is (rubbleWire / applyRubble)
  function setFree(b, vx, vy, va = 0) { b.free = true; b.planet = false; b.vx = vx; b.vy = vy; b.va = va; b.hotUntil = 0; b.key ||= "d" + det.indexOf(b); b.freedAt = performance.now(); rubble.push(b); }
  function breakAway(b, list) {
    const { gw, cs } = b;
    let i0 = 1e9, i1 = -1, j0 = 1e9, j1 = -1;
    for (const k of list) { const i = k % gw, j = (k - i) / gw; i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
    const [x, y] = toWorld(b, (i0 + i1 + 1) / 2 * cs, (j0 + j1 + 1) / 2 * cs);
    if (list.length >= 6) {   // big enough to be its own body
      const f = newBody("r" + (++rubbleSeq), b.kind, (i1 - i0 + 1) * cs, (j1 - j0 + 1) * cs, cs), R = BODY_RES;
      f.q.drawImage(b.cv, i0 * cs * R, j0 * cs * R, (i1 - i0 + 1) * cs * R, (j1 - j0 + 1) * cs * R, 0, 0, (i1 - i0 + 1) * cs, (j1 - j0 + 1) * cs);
      const inPiece = new Set(list);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * gw + i;
        if (inPiece.has(k)) f.cells[(j - j0) * f.gw + (i - i0)] = 1;
      }
      sweepOrphans(f, 0, f.gw - 1, 0, f.gh - 1);   // drop the parent's art that isn't part of this piece
      f.mass = f.mass0 = list.length; f.x = x; f.y = y; f.a = b.a; f.rr = Math.max(f.hw, f.hh);
      f.key = (b.key || "d" + det.indexOf(b)) + "." + list[0].toString(36) + "." + list.length.toString(36);
      // Flung away from the crater that cut it loose (or from the parent's middle), harder by a bigger blast and
      // for a lighter piece; a push off its centre sets it spinning. Seeded by the piece's own cells, so every
      // screen and the server see the same piece fly the same way.
      const rnd = carveRnd(list[0], list.length, det.indexOf(b) + 1, 1), bl = b.blast && performance.now() - b.blast.at < 600 ? b.blast : null;
      const from = bl || b, ox = x - from.x, oy = y - from.y, od = Math.hypot(ox, oy) || 1;
      const v = (bl ? 40 + Math.min(320, bl.rad * 9 / Math.sqrt(Math.max(1, list.length / 12))) : 30) + rnd() * 60;
      const ux = ox / od, uy = oy / od, cx = x - b.x, cy = y - b.y;
      const spin = clamp((cx * uy - cy * ux) / Math.max(40, f.rr) * v / 300, -2.5, 2.5) + (rnd() - 0.5) * 0.6;
      setFree(f, (b.vx || 0) + ux * v, (b.vy || 0) + uy * v, spin);
      if (bl) {   // the torn faces glow where the blast tore them
        f.hotUntil = performance.now() + 1400;
        const [lx, ly] = toLocal(b, x, y);
        (b.heat ||= []).push({ lx, ly, r: Math.max(f.hw, f.hh) * 0.7, t: performance.now() }); if (b.heat.length > 10) b.heat.shift();
      }
      for (let k = 0; k < (lowQ ? 3 : 8); k++) { const a = Math.random() * 6.28, v = 20 + Math.random() * 70; puff(x + (Math.random() - 0.5) * f.hw, y + (Math.random() - 0.5) * f.hh, Math.cos(a) * v + f.vx, Math.sin(a) * v + f.vy, 1.2 + Math.random(), 7 + Math.random() * 8, k % 2 ? bodyCol(b) : "rgb(90,80,100)", 2); }
      for (let k = 0; k < Math.min(5, list.length >> 3); k++) { const a = Math.random() * 6.28, v = 40 + Math.random() * 110; addDebris(x, y, Math.cos(a) * v + f.vx, Math.sin(a) * v + f.vy, 3 + Math.random() * 5, bodyCol(b), 6 + Math.random() * 4); }
      sfx("chunk", Math.min(0.9, 0.3 + list.length / 120), 0.7 + Math.random() * 0.3, x, y);
      while (rubble.length > 50) { const old = rubble.shift(); old.dead = true; }
    } else {
      for (let k = 0; k < Math.min(6, list.length); k++) { const a = Math.random() * 6.28, v = 40 + Math.random() * 120; addDebris(x, y, Math.cos(a) * v, Math.sin(a) * v, 4 + Math.random() * 6, bodyCol(b)); }
    }
    for (const k of list) { b.cells[k] = 0; const i = k % gw, j = (k - i) / gw; b.q.clearRect(i * cs, j * cs, cs, cs); }
    sweepOrphans(b, i0 - 1, i1 + 1, j0 - 1, j1 + 1);
    b.mass -= list.length;
  }
  function destroyPlanet(p, now) {
    const q = lowQ ? 0.4 : 1, R = p.rr;
    for (let k = 0; k < 40 * q; k++) {
      const a = Math.random() * 6.283, rr = Math.random() * R, v = 120 + Math.random() * 520;
      addDebris(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, Math.cos(a) * v, Math.sin(a) * v, 12 + Math.random() * 30, bodyCol(p));
    }
    for (let k = 0; k < 7; k++) { const a = Math.random() * 6.283, rr = Math.random() * R; explode(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, Math.round(70 * q), 700); }
    explode(p.x, p.y, Math.round(200 * q), 1100);
    smoke(p.x, p.y, Math.round(50 * q), R * 1.6, 5);
    rings.push({ x: p.x, y: p.y, t: 0, r: R * 4, col: "255,230,190", warp: true, dur: 1.1, w: 30 });
    rings.push({ x: p.x, y: p.y, t: -0.15, r: R * 6, col: "255,160,90", dur: 1.6, w: 14 });
    shove(p.x, p.y, R * 4, 1200);
    const d = Math.hypot(me.x - p.x, me.y - p.y);
    if (d < 2600) { shake = Math.max(shake, 1.2 * (1 - d / 2600)); flash = Math.max(flash, 0.7 * (1 - d / 2600)); }
    if (!sfx("boom_big", 1, 0.8, p.x, p.y)) { boomSound(2.4, 500, 0.6); blip(35, 1.8, "sawtooth"); }
    sfx("boom_low", 1, 0.75, p.x, p.y);
    feedPush("A planet was blown apart!");
    if (d < 2600) announce("PLANET DESTROYED", "", "#ffb070");
  }
  // every frame: shared poses, rubble drifting, and pending break-ups
  function bodyTick(now, dt) {
    posesAt(clockNow(), dt);
    const drag = Math.exp(-0.02 * dt);
    for (const b of rubble) {
      if (b.dead) continue;
      gravityOn(b, dt);   // planets pull their own rubble back
      b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt; b.vx *= drag; b.vy *= drag; b.va *= Math.exp(-0.05 * dt);
      if (b.x < 0 || b.x > W) { b.vx = -b.vx * 0.6; b.x = clamp(b.x, 0, W); }
      if (b.y < 0 || b.y > H) { b.vy = -b.vy * 0.6; b.y = clamp(b.y, 0, H); }
      rubbleCollide(b, now);
      if (b.hotUntil > now && Math.random() < dt * 30) {   // a freshly torn piece trails smoke and embers for a moment
        const k = (b.hotUntil - now) / 1400;
        puff(b.x + (Math.random() - 0.5) * b.hw, b.y + (Math.random() - 0.5) * b.hh, b.vx * 0.3, b.vy * 0.3, 0.8 + Math.random() * 0.6, 4 + Math.random() * 6 * k, Math.random() < k * 0.6 ? "#ff8a3c" : "rgb(90,80,100)", 2);
      }
    }
    for (const b of bodies) if (b.dirty && now - b.lastSplit > 120) splitBody(b, now);
    if (bodies.some(b => b.dead || b.mass <= 0)) { for (const b of bodies) if (b.mass <= 0) b.dead = true; rubble = rubble.filter(b => !b.dead); rebuildBodies(); }
  }
  // A free piece of rubble against the fixed world (planets, moons, wrecks, station walls): pushed out along the
  // surface normal, bounced with little restitution, its slide turned partly into spin; a hard knock chips it and
  // throws dust, and a small piece hitting very hard crumbles to grit. Rubble-on-rubble is left out (cheap, and
  // the pieces are few). Only the rubble itself is changed: shared terrain is cut by shots alone.
  // a piece of rubble falls apart into grit
  function crumble(r) {
    for (let k = 0; k < Math.min(8, 2 + (r.mass >> 3)); k++) { const a = Math.random() * 6.28, v = 30 + Math.random() * 120; addDebris(r.x, r.y, Math.cos(a) * v + r.vx * 0.3, Math.sin(a) * v + r.vy * 0.3, 2.5 + Math.random() * 4, bodyCol(r), 4 + Math.random() * 4); }
    r.dead = true;
  }
  function rubbleCollide(r, now) {
    const rad = Math.max(r.cs * 1.5, Math.sqrt(r.mass) * r.cs * 0.5);
    for (const o of bodies) {
      if (o === r || o.free || o.dead) continue;
      const dx = r.x - o.x, dy = r.y - o.y;
      if (dx * dx + dy * dy > (o.r + rad) ** 2) continue;
      let nx = 0, ny = 0, hits = 0;
      for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; if (solidAt(o, r.x + Math.cos(a) * rad, r.y + Math.sin(a) * rad)) { nx -= Math.cos(a); ny -= Math.sin(a); hits++; } }
      if (!hits) continue;
      let nl = Math.hypot(nx, ny);
      if (nl < 0.01) { nx = dx; ny = dy; nl = Math.hypot(nx, ny) || 1; }
      nx /= nl; ny /= nl;
      for (let it = 0; it < 8 && solidAt(o, r.x - nx * rad * 0.7, r.y - ny * rad * 0.7); it++) { r.x += nx * Math.max(2, rad * 0.15); r.y += ny * Math.max(2, rad * 0.15); }
      const vn = (r.vx - (o.vx || 0)) * nx + (r.vy - (o.vy || 0)) * ny;
      if (vn >= 0) continue;
      const vt = (r.vx - (o.vx || 0)) * -ny + (r.vy - (o.vy || 0)) * nx;
      r.vx -= 1.35 * vn * nx; r.vy -= 1.35 * vn * ny;          // restitution 0.35
      r.vx -= vt * 0.25 * -ny; r.vy -= vt * 0.25 * nx;          // friction takes a quarter of the slide...
      r.va += vt * 0.25 / Math.max(20, rad);                   // ...and turns it into a roll
      const speed = -vn;
      if (speed > 90 && now - (r.knockAt || 0) > 150) {
        r.knockAt = now;
        const px = r.x - nx * rad, py = r.y - ny * rad;
        for (let k = 0; k < (lowQ ? 2 : 5); k++) { const a = Math.atan2(ny, nx) + (Math.random() - 0.5) * 2.4, v = 40 + Math.random() * speed * 0.6; puff(px, py, Math.cos(a) * v, Math.sin(a) * v, 0.7 + Math.random() * 0.8, 4 + Math.random() * 5, k % 2 ? bodyCol(o) : "rgb(90,80,100)", 2); }
        if (o.fixed || WRECK_PAL[o.kind]) impact(px, py, "#ffd36b", Math.min(1.2, speed / 300));
        sfx("chunk", Math.min(0.8, speed / 400), 0.6 + Math.random() * 0.3, px, py);
        if (r.mass < 40 && speed > 260) { crumble(r); return; }
        if (speed > 160) { const [lx, ly] = toLocal(r, px + nx * 4, py + ny * 4); carveLocal(r, lx, ly, Math.min(14, 4 + speed / 40), false); }   // a corner breaks off
      }
      return;
    }
  }
  // ---- rubble on the authoritative server: its word on where each piece is, so a shot stops on the same rock on
  // every screen. The server sends the pieces that moved (all of them now and then, which also tells which are
  // gone); a screen eases its own copy of each piece there. Pieces only one side has stay as they are.
  let rubbleWireN = 0;
  function rubbleWire() {
    const all = rubbleWireN++ % 15 === 0, out = [];
    for (const b of rubble) {
      if (b.dead || !b.key) continue;
      if (!all && b.wx !== undefined && Math.abs(b.x - b.wx) < 1.5 && Math.abs(b.y - b.wy) < 1.5 && Math.abs(b.a - b.wa) < 0.02) continue;
      b.wx = b.x; b.wy = b.y; b.wa = b.a;
      out.push([b.key, Math.round(b.x), Math.round(b.y), Math.round(b.a * 100), Math.round(b.vx), Math.round(b.vy), Math.round(b.va * 100)]);
      if (out.length >= 60) break;
    }
    return out.length || all ? { all, list: out } : null;
  }
  function applyRubble(w, lead) {
    if (!w || typeof w !== "object" || !Array.isArray(w.list)) return;
    const byKey = new Map(); for (const b of rubble) if (!b.dead && b.key) byKey.set(b.key, b);
    const seen = new Set(), now = performance.now();
    for (const e of w.list.slice(0, 60)) {
      if (!Array.isArray(e) || e.length !== 7 || typeof e[0] !== "string" || e[0].length > 80 || !e.slice(1).every(Number.isFinite)) continue;
      seen.add(e[0]);
      const b = byKey.get(e[0]);
      if (!b) continue;
      const vx = clamp(e[4], -4000, 4000), vy = clamp(e[5], -4000, 4000), x = clamp(e[1] + vx * lead, 0, W), y = clamp(e[2] + vy * lead, 0, H), a = e[3] / 100;
      const err = Math.hypot(x - b.x, y - b.y);
      if (err > 160) { b.x = x; b.y = y; b.a = a; }
      else { b.x += (x - b.x) * 0.35; b.y += (y - b.y) * 0.35; b.a += angD(a - b.a) * 0.35; }
      b.vx = vx; b.vy = vy; b.va = clamp(e[6] / 100, -10, 10);
    }
    // the full list: a piece the server no longer has crumbled there (a moment's grace for one that just broke off here)
    if (w.all === true) for (const [k, b] of byKey) if (!seen.has(k) && now - (b.freedAt || 0) > 1500) crumble(b);
  }
  function spawnPoint(tm) {
    if (stationMap()) {
      const cells = [];
      for (let y = 2; y < 19; y++) for (let x = 2; x < 19; x++) if (foundryOpen(x, y) && (tm !== 0 && tm !== 1 || (tm === 0 ? x < 7 : x > 13))) cells.push([x, y]);
      return foundryPoint(...cells[Math.floor(Math.random() * cells.length)]);
    }
    const half = bases && (tm === 0 || tm === 1), rx = () => half ? (tm ? W / 2 : 0) + rndIn(W / 2, 300) : rndIn(W, 300);
    let x = rx(), y = rndIn(H, 300);
    for (let k = 0; k < 30 && inBody(x, y, 160); k++) { x = rx(); y = rndIn(H, 300); }
    return { x, y };
  }
