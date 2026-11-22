  // a stain spreads out to its size over a second and a half; a drop that came in fast leaves a long splat with
  // a spatter of small drops ahead of it (vx, vy: how it was flying)
  // ---------- decals: what has settled on a station's deck, baked into tiles ----------
  // 512 px tiles of the world at half resolution, made only where something has settled; each is one drawImage a frame
  const DECAL_T = 512, DECAL_RES = 0.5, decalTiles = new Map();
  function bakeDecal(x, y, r, paint) {
    for (let ty = Math.floor((y - r) / DECAL_T); ty <= Math.floor((y + r) / DECAL_T); ty++) for (let tx = Math.floor((x - r) / DECAL_T); tx <= Math.floor((x + r) / DECAL_T); tx++) {
      const key = tx * 1000 + ty;
      let t = decalTiles.get(key);
      if (!t) { const c = document.createElement("canvas"); c.width = c.height = DECAL_T * DECAL_RES; t = { c, q: c.getContext("2d"), tx, ty }; decalTiles.set(key, t); }
      t.q.setTransform(DECAL_RES, 0, 0, DECAL_RES, (x - tx * DECAL_T) * DECAL_RES, (y - ty * DECAL_T) * DECAL_RES);
      paint(t.q);
    }
  }
  function drawDecals() {
    for (const t of decalTiles.values()) {
      const x = sx(t.tx * DECAL_T), y = sy(t.ty * DECAL_T);
      if (x > vw || y > vh || x + DECAL_T < 0 || y + DECAL_T < 0) continue;
      g.drawImage(t.c, x, y, DECAL_T, DECAL_T);
    }
  }
  function oilStain(x, y, r, vx = 0, vy = 0) {
    const sp = Math.hypot(vx, vy), stretch = 1 + Math.min(1.6, sp / 200);
    oilStains.push({ x, y, r, rot: sp > 1 ? Math.atan2(vy, vx) : Math.random() * 6.28, sx: stretch * (0.8 + Math.random() * 0.4), born: performance.now(),
      blobs: Array.from({ length: 4 + (Math.random() * 4 | 0) }, () => [(Math.random() - 0.3) * r * 1.6, (Math.random() - 0.5) * r * 0.9, r * (0.25 + Math.random() * 0.4)]),
      spat: Array.from({ length: Math.min(6, sp / 60 | 0) }, () => [r * (1.4 + Math.random() * 1.8), (Math.random() - 0.5) * r * 0.8, 0.6 + Math.random() * 1.6]),
      // thin spines thrown out ahead (a fast drop), and runs crawling slowly out of a big pool over a few seconds
      spines: Array.from({ length: Math.min(7, 1 + sp / 80 | 0) }, () => [(Math.random() - 0.5) * 1.3, r * (1.2 + Math.random() * 1.6), 0.5 + Math.random() * 0.9]),
      runs: r > 7 ? Array.from({ length: 1 + (Math.random() * 3 | 0) }, () => [Math.random() * 6.283, r * (1.5 + Math.random() * 3), 1 + Math.random() * 1.6, 2000 + Math.random() * 3000]) : [] });
    const o = oilStains[oilStains.length - 1]; o.settle = Math.max(1600, ...o.runs.map(rn => rn[3])) + 200;   // (when it is done spreading: baked)
    if (oilStains.length > 400) oilStains.shift();
  }
  function updateOil(dt) {
    const deck = stationMap();
    for (let i = oilDrops.length - 1; i >= 0; i--) {
      const d = oilDrops[i]; d.t += dt;
      const k = Math.exp(-(deck ? 4 : 0.6) * dt); d.vx *= k; d.vy *= k; d.x += d.vx * dt; d.y += d.vy * dt;
      // a drop flying into a wall or a planet splashes on it (painted on its face, as a scorch is)
      const hit = Math.abs(d.vx) + Math.abs(d.vy) > 30 && solidCell(d.x, d.y) ? solidAny(d.x, d.y) : null;
      if (hit && !hit.free) { oilOnBody(hit, d.x, d.y, d.r * 2.4, d.vx, d.vy); oilDrops.splice(i, 1); continue; }
      if (d.t >= d.life) { if (deck && !solidAny(d.x, d.y)) oilStain(d.x, d.y, d.r * (2 + Math.random() * 2), d.vx, d.vy); oilDrops.splice(i, 1); }
    }
  }
  // oil splashed on a body's face: a red-black splat drawn out the way it flew, with a run or two dripping down it
  function oilOnBody(b, x, y, r, vx, vy) {
    if (!b.q) return;
    const [lx, ly] = toLocal(b, x, y), q = b.q, a = Math.atan2(vy, vx) - (b.a || 0);
    q.save(); q.globalCompositeOperation = "source-atop"; q.translate(lx, ly); q.rotate(a);
    q.fillStyle = "rgba(60,4,8,0.85)"; q.beginPath(); q.ellipse(0, 0, r * 1.6, r * 0.8, 0, 0, 6.29); q.fill();
    q.fillStyle = "rgba(110,10,14,0.7)"; q.beginPath(); q.ellipse(-r * 0.2, -r * 0.15, r * 0.9, r * 0.4, 0, 0, 6.29); q.fill();
    for (let k = 0; k < 3; k++) { q.beginPath(); q.arc(r * (1.8 + Math.random() * 1.6), (Math.random() - 0.5) * r, r * (0.15 + Math.random() * 0.25), 0, 6.29); q.fill(); }
    q.strokeStyle = "rgba(70,5,9,0.8)"; q.lineCap = "round";   // spines
    for (let k = 0; k < 4; k++) { const a2 = (Math.random() - 0.5) * 1.2, L = r * (1.5 + Math.random() * 2); q.lineWidth = 0.6 + Math.random() * 0.8; q.beginPath(); q.moveTo(Math.cos(a2) * r, Math.sin(a2) * r); q.lineTo(Math.cos(a2) * L, Math.sin(a2) * L); q.stroke(); }
    q.restore();
    // and it runs down the wall (down the screen), a drip or two, while there is wall under it
    for (let k = 0, n = r > 3 ? 1 + (Math.random() < 0.5 ? 1 : 0) : 0; k < n; k++) wallDrips.push({ b, x: x + (Math.random() - 0.5) * r, y, w: 0.8 + Math.random() * r * 0.25, left: 30 + Math.random() * 90, v: 12 + Math.random() * 18 });
    if (wallDrips.length > 120) wallDrips.splice(0, wallDrips.length - 120);
  }
  const wallDrips = [];
  function updateDrips(dt) {
    for (let i = wallDrips.length - 1; i >= 0; i--) {
      const d = wallDrips[i], b = d.b, step = Math.min(d.left, d.v * dt);
      if (b.dead || step <= 0 || !solidAt(b, d.x, d.y + step)) { wallDrips.splice(i, 1); continue; }
      const [x0, y0] = toLocal(b, d.x, d.y), wob = (Math.random() - 0.5) * 0.6;
      d.x += wob; d.y += step; d.left -= step; d.v *= 0.995; d.w *= 0.997;
      const [x1, y1] = toLocal(b, d.x, d.y), q = b.q;
      q.save(); q.globalCompositeOperation = "source-atop"; q.strokeStyle = "rgba(64,4,8,0.85)"; q.lineCap = "round"; q.lineWidth = d.w;
      q.beginPath(); q.moveTo(x0, y0); q.lineTo(x1, y1); q.stroke();
      if (d.left <= step + 0.01) { q.fillStyle = "rgba(64,4,8,0.9)"; q.beginPath(); q.arc(x1, y1, d.w * 0.9, 0, 6.29); q.fill(); }   // a bead at its end
      q.restore();
    }
  }
