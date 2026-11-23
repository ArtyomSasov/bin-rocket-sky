  function surfaceHit(b, x, y, kind) {
    if (!b || b.dead) return;
    const t = performance.now(); if (t - surfT > 16) { surfT = t; surfN = 0; }
    if (++surfN > (lowQ ? 3 : 8)) return;
    const S = SHOTS[kind] || {}, carve = S.carve || 0, mat = materialOf(b), [nx, ny] = normalAt(b, x, y), out = Math.atan2(ny, nx), q = lowQ ? 0.5 : 1;
    if (carve >= WALL_CARVE) {   // (rockets, grenades, mines, the orbs)
      const big = Math.max(carve, 40) * (b.wall ? WALL_GIVE : 1);
      chunksOff(b, x, y, Math.round((lowQ ? 3 : 7) + Math.random() * 3), big * 0.32, 380, b.wall ? 0.3 : 0.1);   // big pieces
      wallBreach(b, x, y, big);
      if (b.wall) wallMark(b, x, y, Math.max(carve, 40) * WALL_GIVE, true); else scorchMark(b, x, y, Math.max(carve, 40) * 1.4);
      return;
    }
    if (ENERGY_HIT.has(kind)) {
      scorchMark(b, x, y, 8 + carve * 0.8);
      const hot = S.col;
      for (let i = 0, m = Math.round(5 * q); i < m; i++) {   // embers and molten drops
        const a = out + (Math.random() - 0.5) * 2.4, v = 60 + Math.random() * 220;
        puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.35 + Math.random() * 0.5, 1.4 + Math.random() * 1.4, i % 2 ? "#ffb04a" : hot, i % 2 ? 5 : 3, 0, 0, 0.94);
      }
      puff(x, y, Math.cos(out) * 30, Math.sin(out) * 30, 1.2 + Math.random() * 0.8, 6 + Math.random() * 6, SMOKE_COLS[1], 2, 0, (Math.random() - 0.5) * 0.8, 0.95);   // a wisp of smoke
      impacts.push({ x, y, t: 0, r: 90, col: rgbStr(S.col), dur: 0.35, soft: 0.35 });
      return;
    }
    if (!lowQ && Math.random() < 0.7) chunksOff(b, x, y, 1 + (Math.random() < 0.35 ? 1 : 0), 3 + carve * 0.25, 260);   // a small piece or two
    pitMark(b, x, y, 2 + Math.min(4, carve * 0.25));
    const dust = mat === "metal" ? "rgb(140,136,132)" : bodyCol(b);
    for (let i = 0, m = Math.round(3 * q); i < m; i++) {   // dust
      const a = out + (Math.random() - 0.5) * 1.6, v = 30 + Math.random() * 110;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.6 + Math.random() * 0.8, 4 + Math.random() * 5, i ? dust : "rgb(110,104,100)", 2, 0, 0, 0.92);
    }
    for (let i = 0, m = mat === "metal" ? 0 : Math.round(2 * q); i < m; i++) {   // chips of rock or wood
      const a = out + (Math.random() - 0.5) * 2, v = 120 + Math.random() * 260;
      addDebris(x, y, Math.cos(a) * v, Math.sin(a) * v, 1.5 + Math.random() * 2.5, bodyCol(b), 3 + Math.random() * 3);
    }
    if (mat === "metal") for (let i = 0, m = Math.round(6 * q); i < m; i++) {   // sparks off metal
      const a = out + (Math.random() - 0.5) * 1.8, v = 300 + Math.random() * 500;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.15 + Math.random() * 0.25, 0.8 + Math.random() * 0.8, i % 3 ? "#fff1b8" : "#ffb04a", 1, 0.05, 0, 0.92);
    }
  }
  const rgbStr = c => { const v = parseInt(String(c).slice(1, 7), 16) || 0xffffff; return `${v >> 16 & 255},${v >> 8 & 255},${v & 255}`; };
  let carvingWall = false;
  function carveAt(b, x, y, rad, own) {
    if (b.dead) return 0;
    // (bullets wear a station wall away a bite at a time; rockets and the like blow holes in it)
    // a heavy hit on a station wall takes the crater out of every row of it that the crater reaches (it is one wall)
    if (b.wall && !carvingWall) {
      carvingWall = true;
      const R = rad * WALL_GIVE + b.cs;
      try { for (const o of [...bodies]) if (o !== b && o.wall && !o.dead && !o.free && Math.abs(x - o.x) < o.hw + R && Math.abs(y - o.y) < o.hh + R) carveAt(o, x, y, rad, own); }
      finally { carvingWall = false; }
    }
    const [lx0, ly0] = toLocal(b, x, y), lx = Math.round(lx0), ly = Math.round(ly0), r = Math.round(rad);
    const shared = own && !b.free, sq = shared ? ++carveSeq : 0;
    craterChunks(b, x, y, rad);
    const n = carveLocal(b, lx, ly, r, true, shared ? carveRnd(lx, ly, r, sq) : Math.random);
    if (!n) return 0;
    rubbleFx(b, x, y, rad, n);
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
  let drilling = false;   // a rail slug's line: it bores a narrow tunnel even through a station's inner wall
  function carveLineLocal(b, x1, y1, x2, y2, rad) {
    if (b.fixed) return 0;
    if (b.wall && !drilling) rad *= rad < WALL_CARVE ? 0.6 : WALL_GIVE;
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
    q.globalCompositeOperation = "source-atop"; q.strokeStyle = "rgba(24,16,14,0.55)"; q.lineWidth = rad * 2 + 5; q.stroke();   // (its lips scorched dark: the glow is the melt, which cools away)
    q.globalCompositeOperation = "destination-out"; q.lineWidth = rad * 2; q.stroke(); q.restore();
    sweepOrphans(b, i0 - 1, i1 + 1, j0 - 1, j1 + 1);
    b.mass -= n; b.dirty = true;
    return n;
  }
  // where a rail slug went through rock or metal, as everyone sees it: the runs of its line inside bodies glow molten
  // (white, then orange, red, and dark as they cool), drip molten drops, spit sparks and smoke
  const meltLines = [];
  function railMelt(x1, y1, x2, y2, rad) {
    const L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / (L || 1), uy = (y2 - y1) / (L || 1);
    let inside = null;
    for (let d = 0; d <= L + 8; d += 8) {
      const x = x1 + ux * Math.min(d, L), y = y1 + uy * Math.min(d, L), solid = d <= L && solidAny(x, y);
      if (solid && !inside) inside = [x, y];
      else if (!solid && inside) {
        meltLines.push({ x1: inside[0], y1: inside[1], x2: x, y2: y, w: rad, t: 0, dur: 2.6 });
        const segL = Math.hypot(x - inside[0], y - inside[1]);
        for (let k = 0, m = Math.min(24, segL / 14) * (lowQ ? 0.4 : 1); k < m; k++) {
          const f = Math.random(), px = inside[0] + (x - inside[0]) * f, py = inside[1] + (y - inside[1]) * f, side = Math.random() < 0.5 ? 1 : -1, v = 60 + Math.random() * 220;
          puff(px, py, -uy * side * v, ux * side * v, 0.5 + Math.random() * 0.9, 1.4 + Math.random() * 1.6, k % 3 ? "#ffb04a" : "#fff1b8", k % 4 ? 3 : 1, 0.05, 0, 0.94);   // molten drops and sparks out of the cut
          if (k % 4 === 0) puff(px, py, -uy * side * 30, ux * side * 30, 1.4 + Math.random(), 6 + Math.random() * 6, SMOKE_COLS[1], 2, 0, 0, 0.95);
        }
        inside = null;
      }
    }
    if (meltLines.length > 60) meltLines.splice(0, meltLines.length - 60);
  }
  function updateMelt(dt) { for (let i = meltLines.length - 1; i >= 0; i--) if ((meltLines[i].t += dt) > meltLines[i].dur) meltLines.splice(i, 1); }
  function drawMelt() {
    if (!meltLines.length) return;
    g.save(); g.lineCap = "round";
    for (const m of meltLines) {
      const k = m.t / m.dur, x1 = sx(m.x1), y1 = sy(m.y1), x2 = sx(m.x2), y2 = sy(m.y2);
      if (!onScreen((x1 + x2) / 2, (y1 + y2) / 2, Math.hypot(x2 - x1, y2 - y1) / 2 + 40)) continue;
      // the cooling colour: white-hot, yellow, orange, cherry red, a dull glow
      const col = k < 0.1 ? "255,250,230" : k < 0.3 ? "255,210,110" : k < 0.6 ? "255,130,50" : "200,50,30", a = (1 - k) * (1 - k);
      g.globalCompositeOperation = "lighter";
      g.strokeStyle = `rgba(${col},${0.35 * a})`; g.lineWidth = m.w * 3.2; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();   // the glow round it
      g.strokeStyle = `rgba(${col},${0.9 * a})`; g.lineWidth = Math.max(1.5, m.w * 1.1 * (1 - k * 0.5)); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();   // the molten lips
    }
    g.restore();
  }
  function carveBeam(s, rad) {
    drilling = s.kind === K.RAIL;
    try { carveBeamOn(s, rad); } finally { drilling = false; }
  }
  function carveBeamOn(s, rad) {
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
      if (e.length === 6) { const [x, y] = toWorld(b, lx, ly); craterChunks(b, x, y, r); }
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
    // (kept until the body loses a cell: every cut lowers its mass, so an unchanged mass is an unchanged body)
    if (!b.terEnc || b.terEnc.mass !== b.mass) {
      let bytes = "";
      for (let i = 0; i < b.cells.length; i += 8) {
        let bits = 0;
        for (let k = 0; k < 8 && i + k < b.cells.length; k++) if (b.initialCells[i + k] && !b.cells[i + k]) bits |= 1 << k;
        bytes += String.fromCharCode(bits);
      }
      b.terEnc = { mass: b.mass, enc: btoa(bytes) };
    }
    return [stats.round, bi, 0, b.terEnc.enc];
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
    // a wall grows back (regrowWalls): on the game server its word on which cells stand brings mine back too
    if (serverRun && b.wall) {
      const back = [];
      for (let i = 0; i < b.cells.length; i++) if (!b.cells[i] && b.initialCells[i] && !(bytes.charCodeAt(i >> 3) & (1 << (i & 7)))) back.push(i);
      restoreCells(b, back);
    }
  }

