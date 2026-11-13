  // ---------- destructible bodies: planets, moons and drifting wrecks are grids of small cells that shots chip away ----------
  // They move on the shared clock, so every player has the same ones. Each player reports the craters its own shots
  // (and its bots' shots) make and everyone applies them, so holes match. Pieces that break off become free rubble
  // that each player simulates on its own. A new round rebuilds everything.
  const PLANET_G = 320;   // px/s² at the surface of a whole 250-radius planet
  const PLANET_KINDS = ["gas", "ice", "lava", "rock"];
  const PLANET_PAL = {
    gas:  { base: "#c98a5a", bands: ["#e8b27a", "#9c5f3c", "#f3d3a0", "#b7714a"], glow: "255,190,130" },
    ice:  { base: "#8fc9e8", bands: ["#d8f3ff", "#6aa6cf", "#bfe6f7"], glow: "160,225,255" },
    lava: { base: "#3a1c22", bands: ["#572630", "#2a1218"], glow: "255,110,50" },
    rock: { base: "#8a7f96", bands: ["#a59bb0", "#6f6580"], glow: "200,185,230" },
    moon: { base: "#8a7f96", bands: ["#a59bb0", "#6f6580"], glow: "200,185,230" }
  };
  const WRECK_TYPES = ["hull", "tower", "crates", "ring"];
  const WRECK_PAL = { hull: ["#7d8aa3", "#5a6478", "#9aa6bf"], tower: ["#8f8aa0", "#6d6880", "#4a4660"], crates: ["#c0503c", "#3c78c0", "#d8a83c", "#4a9a6a"], ring: ["#8a93ad", "#5e6680", "#c8d0e8"] };
  const WRECK_N = { s: 6, m: 10, l: 16, x: 24 };
  const CARVE_R = [16, 46, 9, 0, 9, 14, 45, 30, 6, 10];   // crater radius by shot kind
  const BODY_RES = matchMedia("(pointer: coarse)").matches ? 0.6 : 1;   // art baked at lower resolution on phones
  let planets = [], moons = [], wrecks = [], det = [], rubble = [], bodies = [], worldCode = "lobby", mapKey = "m", rubbleSeq = 0;

  function newBody(id, kind, w, h, cs) {
    const gw = Math.max(1, Math.ceil(w / cs)), gh = Math.max(1, Math.ceil(h / cs)), c = document.createElement("canvas");
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
  const inBody = (x, y, pad) => { for (const b of bodies) if (!b.free && (x - b.x) ** 2 + (y - b.y) ** 2 < (b.rr + pad) ** 2) return b; return null; };
  function rebuildBodies() { bodies = det.filter(b => !b.dead && !b.free).concat(rubble.filter(b => !b.dead)); }

  // everything that scales with the arena: pick-ups and junk keep about the same density (capped for the huge map)
  function setMapSize(key) {
    const [size, , n] = MAP_SIZES[key], a = Math.min(6, (size / 2600) ** 2);
    W = H = size; PLANET_N = n; mapKey = key;
    SLOTS = Math.round(44 * a); ROCKS = Math.round(16 * a); PICKS = Math.round(8 * a); SUPPLY_SLOTS = Math.round(6 * a); GOLD_N = Math.round(70 * a);
    world.sparks.length = world.rocks.length = world.picks.length = world.supplies.length = 0;
  }
  function buildPlanets(code) {
    worldCode = code;
    buildSky(String(code).split("").reduce((s, ch) => (Math.imul(s, 31) + ch.charCodeAt(0)) | 0, 11));
    let seed = 7;
    for (const ch of String(code)) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0;
    planets = []; moons = []; wrecks = []; rubble = [];
    for (let t = 0; planets.length < PLANET_N && t < 1500; t++) {
      const R = 150 + hash(seed, t, 1) * 150, m = R + 380;
      const x = m + hash(seed, t, 2) * (W - 2 * m), y = m + hash(seed, t, 3) * (H - 2 * m);
      if (planets.some(p => Math.hypot(p.x - x, p.y - y) < p.rr + R + 560)) continue;
      const pseed = seed + t * 131, rnd = k => hash(pseed, k, 404), kind = PLANET_KINDS[(Math.floor(hash(seed, 0, 9) * 4) + planets.length) % 4];
      const p = newBody("p" + planets.length, kind, R * 2 + 4, R * 2 + 4, clamp(R / 28, 8, 12));
      Object.assign(p, { x, y, rr: R, planet: true, tilt: (hash(seed, t, 4) - 0.5) * 0.8 });
      paintPlanet(p, R, kind, rnd);
      if (kind === "gas") paintRings(p, R, rnd);
      planets.push(p);
      if (hash(seed, t, 5) < 0.65) {
        const mr = 38 + hash(seed, t, 6) * 30, mseed = seed + t * 977;
        const mo = newBody("m" + moons.length, "moon", mr * 2 + 4, mr * 2 + 4, 7);
        Object.assign(mo, { p, rr: mr, moon: true, tilt: 0, orbit: R + 190 + hash(seed, t, 7) * 110, period: 45 + hash(seed, t, 8) * 40,
                            ph: hash(seed, t, 10) * 6.283, dir: hash(seed, t, 11) < 0.5 ? -1 : 1 });
        paintPlanet(mo, mr, "moon", k => hash(mseed, k, 404));
        moons.push(mo);
      }
    }
    // drifting wrecks: kept away from planets (and their moons' orbits) and from each other
    for (let t = 0; wrecks.length < WRECK_N[mapKey] && t < 2000; t++) {
      const type = WRECK_TYPES[Math.floor(hash(seed, t, 21) * WRECK_TYPES.length)], wseed = seed + t * 389, rnd = k => hash(wseed, k, 505);
      const [w, h] = type === "hull" ? [320 + rnd(1) * 120, 110 + rnd(2) * 40] : type === "tower" ? [170 + rnd(1) * 60, 250 + rnd(2) * 80]
                   : type === "crates" ? [230 + rnd(1) * 40, 170 + rnd(2) * 40] : [300 + rnd(1) * 60, 120 + rnd(2) * 30];
      const rr = Math.hypot(w, h) / 2, A = 40 + hash(seed, t, 25) * 80, m = rr + A + 200;
      const x = m + hash(seed, t, 22) * (W - 2 * m), y = m + hash(seed, t, 23) * (H - 2 * m);
      if (planets.some(p => Math.hypot(p.x - x, p.y - y) < p.rr + 520 + rr + A)) continue;
      if (wrecks.some(o => Math.hypot(o.bx - x, o.by - y) < o.rr + rr + 260)) continue;
      const b = newBody("w" + wrecks.length, type, w, h, 8);
      Object.assign(b, { rr, bx: x, by: y, A, T: 30 + hash(seed, t, 26) * 30, ph: hash(seed, t, 27) * 6.283, dirA: hash(seed, t, 28) * 6.283,
                         a0: hash(seed, t, 29) * 6.283, spin: (hash(seed, t, 30) - 0.5) * 0.09, wreck: true });
      paintWreck(b, type, w, h, rnd);
      wrecks.push(b);
    }
    det = [...planets, ...moons, ...wrecks];
    rebuildBodies();
    posesAt(clockNow(), 0);
    if (inBody(me.x, me.y, 80)) Object.assign(me, spawnPoint());
  }
  // where every shared body is at this moment (planets sit still, moons orbit, wrecks bob and turn)
  function posesAt(t, dt) {
    const s = t / 1000;
    for (const b of det) {
      if (b.free || b.dead) continue;
      const ox = b.x, oy = b.y;
      if (b.moon) { const a = b.ph + b.dir * 6.283 * s / b.period; b.x = b.p.x + Math.cos(a) * b.orbit; b.y = b.p.y + Math.sin(a) * b.orbit; b.a = a; }
      else if (b.wreck) { const o = Math.sin(s / b.T * 6.283 + b.ph) * b.A; b.x = b.bx + Math.cos(b.dirA) * o; b.y = b.by + Math.sin(b.dirA) * o; b.a = b.a0 + b.spin * s; }
      if (dt > 0) { b.vx = (b.x - ox) / dt; b.vy = (b.y - oy) / dt; }
    }
  }

  // ---------- craters ----------
  const myCarves = [], seenCarves = new Set();
  let carveSeq = 0;
  function bodyCol(b) {
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
  function carveLocal(b, lx, ly, rad, hot) {
    const cs = b.cs, R2 = rad * 1.2, i0 = Math.max(0, Math.floor((lx - R2) / cs)), i1 = Math.min(b.gw - 1, Math.floor((lx + R2) / cs));
    const j0 = Math.max(0, Math.floor((ly - R2) / cs)), j1 = Math.min(b.gh - 1, Math.floor((ly + R2) / cs));
    // one ragged outline for both the cells and the art, so what you see is exactly what can be hit
    const jag = []; for (let k = 0; k < 12; k++) jag.push(rad * (0.9 + Math.random() * 0.25));
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
    const big = rad >= 14, metal = !!WRECK_PAL[b.kind], k = Math.min(big ? 7 : 2, 1 + (n >> 1)), [nx, ny] = normalAt(b, x, y), out = Math.atan2(ny, nx), bvx = b.vx || 0, bvy = b.vy || 0;
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
  function carveAt(b, x, y, rad, own) {
    if (b.dead) return 0;
    const [lx, ly] = toLocal(b, x, y), n = carveLocal(b, lx, ly, rad, true);
    if (!n) return 0;
    rubbleFx(b, x, y, rad, n);
    if (own) b.lastOwn = true;
    if (own && !b.free) {
      myCarves.push({ at: performance.now(), d: [stats.round, det.indexOf(b), Math.round(lx), Math.round(ly), Math.round(rad), ++carveSeq] });
      if (myCarves.length > 60) myCarves.shift();
    }
    return n;
  }
  function applyRemoteCarves(id, list) {
    for (const e of list.slice(0, 60)) {
      if (!Array.isArray(e) || e.length !== 6 || !e.every(Number.isInteger)) continue;
      const [rd, bi, lx, ly, r, sq] = e, key = id + ":" + sq;
      if (rd !== stats.round || seenCarves.has(key)) continue;
      seenCarves.add(key);
      const b = det[bi];
      if (!b || b.dead || b.free || r < 2 || r > 700 || Math.abs(lx) > 3000 || Math.abs(ly) > 3000) continue;
      const n = carveLocal(b, lx, ly, r, true);
      if (n) { const [x, y] = toWorld(b, lx, ly); rubbleFx(b, x, y, r, n); }
    }
    if (seenCarves.size > 4000) seenCarves.clear();
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
    if (b.planet && !b.free && b.mass < b.mass0 * 0.15) {
      destroyPlanet(b, now);
      if (b.lastOwn && playing) { me.score += 25; showScore(); gainXp(5, now); floaters.push({ x: b.x, y: b.y - 80, t: 0, txt: "PLANET +25", gold: true }); }
      setFree(b, 0, 0);
      for (const m of moons) if (m.p === b && !m.free) setFree(m, -Math.sin(m.a) * m.dir * 60, Math.cos(m.a) * m.dir * 60);
      rebuildBodies();
    }
  }
  function setFree(b, vx, vy) { b.free = true; b.planet = false; b.vx = vx; b.vy = vy; b.va = (Math.random() - 0.5) * 0.3; rubble.push(b); }
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
      const ox = x - b.x, oy = y - b.y, od = Math.hypot(ox, oy) || 1, v = 30 + Math.random() * 70;
      setFree(f, (b.vx || 0) + ox / od * v, (b.vy || 0) + oy / od * v);
      f.va = (Math.random() - 0.5) * 0.9;
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
      b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt; b.vx *= drag; b.vy *= drag;
      if (b.x < 0 || b.x > W) { b.vx = -b.vx * 0.6; b.x = clamp(b.x, 0, W); }
      if (b.y < 0 || b.y > H) { b.vy = -b.vy * 0.6; b.y = clamp(b.y, 0, H); }
    }
    for (const b of bodies) if (b.dirty && now - b.lastSplit > 120) splitBody(b, now);
    if (bodies.some(b => b.dead || b.mass <= 0)) { for (const b of bodies) if (b.mass <= 0) b.dead = true; rubble = rubble.filter(b => !b.dead); rebuildBodies(); }
  }
  function spawnPoint(tm) {
    const half = bases && (tm === 0 || tm === 1), rx = () => half ? (tm ? W / 2 : 0) + rndIn(W / 2, 300) : rndIn(W, 300);
    let x = rx(), y = rndIn(H, 300);
    for (let k = 0; k < 30 && inBody(x, y, 160); k++) { x = rx(); y = rndIn(H, 300); }
    return { x, y };
  }
