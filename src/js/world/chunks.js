  // Any shot meeting a body, as everyone sees it (the crater itself is the shooter's or the server's): by what it is
  // made of and what hit it. A slug or pellet: a pit, a puff of dust, chips, and off metal sparks. Energy (laser,
  // plasma, fire): a scorch burnt into it, embers and molten drops, a wisp of smoke. Something heavy (rockets,
  // grenades, the orbs, gauss): the breach, as a station wall's, in the body's own colours
  // ---------- chunks: real pieces broken off a body's face ----------
  // Cut from the body's own picture at the hit (a jagged polygon of it, turned as the body is turned), each flies
  // off tumbling, bounces off what stands (bounceOff, by its weight), and on a station's deck skids to rest and stays
  // for the round; in space it drifts away and fades after a while
  const chunks = [];
  function chunkOff(b, x, y, r, vx, vy) {
    if (!b.cv || r < 2) return;
    const S = Math.ceil(r * 2 + 2), c = document.createElement("canvas"); c.width = c.height = S;
    const q = c.getContext("2d"), [lx, ly] = toLocal(b, x, y);
    q.beginPath();   // its outline: a jagged polygon
    for (let k = 0, n = 6 + (Math.random() * 3 | 0); k < n; k++) { const a = k / n * 6.283 + Math.random() * 0.5, rr = r * (0.55 + Math.random() * 0.45); q.lineTo(S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr); }
    q.closePath(); q.clip();
    q.drawImage(b.cv, S / 2 - lx, S / 2 - ly);   // (the body's picture in its own frame: the chunk keeps its look)
    q.globalCompositeOperation = "source-atop"; q.fillStyle = "rgba(0,0,0,0.18)"; q.fillRect(0, S / 2, S, S / 2);   // shade underneath
    chunks.push({ img: c, x, y, vx, vy, a: b.a || 0, spin: (Math.random() - 0.5) * 9, r, life: stationMap() ? Infinity : 14 + Math.random() * 8, t: 0, hot: performance.now() });
    if (chunks.length > 160) chunks.shift();
  }
  function updateChunks(dt) {
    const deck = stationMap(), drag = Math.exp(-(deck ? 2.2 : 0.05) * dt), spinDrag = Math.exp(-(deck ? 2.5 : 0.1) * dt);
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c = chunks[i]; c.t += dt;
      if (c.t > c.life) { chunks.splice(i, 1); continue; }
      c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= drag; c.vy *= drag; c.spin *= spinDrag; c.a += c.spin * dt;
      if (Math.abs(c.vx) + Math.abs(c.vy) > 8) { bounceOff(c, c.r * 0.7, 0.45, 0.02 * (c.r / 8) ** 2); c.still = 0; }
      else if (deck && (c.still = (c.still || 0) + dt) > 1.2) {   // come to rest on the deck: baked into it (one less to draw)
        bakeDecal(c.x, c.y, c.r * 1.5, q => { q.rotate(c.a); q.drawImage(c.img, -c.img.width / 2, -c.img.height / 2); });
        chunks.splice(i, 1); continue;
      }
      if (c.x < 0 || c.x > W) { c.vx = -c.vx * 0.5; c.x = clamp(c.x, 0, W); }
      if (c.y < 0 || c.y > H) { c.vy = -c.vy * 0.5; c.y = clamp(c.y, 0, H); }
    }
    piecesCollide();
  }
  // ---------- the loose pieces meeting each other and the bins ----------
  // Chunks, the pieces of broken bins and the hulks are discs of their weight: every pair that touches is pushed apart
  // (the lighter further) and struck by momentum with a dull bounce (e 0.3); a glancing touch drags along the surface
  // (friction), which spins them up. The bins (mine and everyone shown) plough through them: a bin is far heavier, so
  // a piece takes its speed and is thrown off it. Found through a grid of 96 px cells, so it stays cheap with hundreds
  const pieceGrid = new Map();
  function piecesCollide() {
    const all = [];
    for (const c of chunks) all.push([c, c.r * 0.8, 0.02 * (c.r / 8) ** 2, "spin"]);
    for (const f of frags) all.push([f, f.s * 0.25, 0.25 * (f.s / BOT) ** 2, "spin"]);
    for (const h of hulks) all.push([h, 30, 0.35 * BIN_MASS, "hulk"]);
    if (all.length < 2 && !chunks.length) return;
    pieceGrid.clear();
    const C = 96, key = (i, j) => i * 4096 + j;
    all.forEach((e, n) => { const k = key(Math.floor(e[0].x / C), Math.floor(e[0].y / C)); let l = pieceGrid.get(k); if (!l) pieceGrid.set(k, l = []); l.push(n); });
    const meet = (A, B) => {
      const [a, ra, ma] = A, [b, rb, mb] = B, dx = a.x - b.x, dy = a.y - b.y, R = ra + rb;
      if (dx * dx + dy * dy >= R * R) return;
      const d = Math.hypot(dx, dy) || 0.01, nx = dx / d, ny = dy / d, over = R - d, w = mb === Infinity ? 1 : mb / (ma + mb);
      a.x += nx * over * w; a.y += ny * over * w;
      if (mb !== Infinity) { b.x -= nx * over * (1 - w); b.y -= ny * over * (1 - w); }
      const rvx = a.vx - (b.vx || 0), rvy = a.vy - (b.vy || 0), vn = rvx * nx + rvy * ny;
      if (vn >= 0) return;
      const j = collide(a, ma, b, mb, nx, ny, 0.3);
      if (j / ma > 30) a.rest = null; if (mb !== Infinity && j / mb > 30) b.rest = null;   // knocked loose off the ground it lay on
      // friction along the contact: some of the slide goes, and turns into spin
      const vt = rvx * -ny + rvy * nx, f = Math.min(Math.abs(vt), j / ma * 0.4) * Math.sign(vt);
      a.vx -= f * -ny * 0.5; a.vy -= f * nx * 0.5; a.spin = (a.spin || 0) + f / Math.max(4, ra) * 0.8;
      if (mb !== Infinity && b.spin !== undefined) b.spin -= f / Math.max(4, rb) * 0.8 * ma / mb;
      if (j / ma > 260 && Math.random() < 0.3) puff((a.x + b.x) / 2, (a.y + b.y) / 2, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, 0.2, 1, "#ffd9a0", 1, 0.04);   // a scrape
    };
    for (const [k, l] of pieceGrid) {
      const i = Math.floor(k / 4096), jj = k - i * 4096;
      for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1], [1, -1]]) {
        const m = pieceGrid.get(key(i + di, jj + dj)); if (!m) continue;
        for (const p of l) for (const q of m) if (di || dj ? true : q > p) meet(all[p], all[q]);
      }
    }
    // the bins plough through
    const bins = [];
    if (playing && !me.dead) bins.push(me);
    for (const r of remotes.values()) if (!r.dead) bins.push(r);
    for (const b of bots) if (!b.dead && !remotes.has(b.id)) bins.push(b);
    for (const b of bins) {
      const BR = 30, i0 = Math.floor((b.x - BR - 60) / C), i1 = Math.floor((b.x + BR + 60) / C), j0 = Math.floor((b.y - BR - 60) / C), j1 = Math.floor((b.y + BR + 60) / C);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = pieceGrid.get(key(i, j)); if (l) for (const n of l) if (!(b === me && all[n][3] === "hulk")) meet(all[n], [b, BR, Infinity]); }   // (my bin and a hulk meet in updateFx, both moving)
    }
  }
  function drawChunks(now) {
    for (const c of chunks) {
      const x = sx(c.x), y = sy(c.y);
      if (!onScreen(x, y, c.r * 2)) continue;
      g.globalAlpha = c.life === Infinity ? 1 : Math.min(1, (c.life - c.t) / 2);
      g.save(); g.translate(x, y); g.rotate(c.a); g.drawImage(c.img, -c.img.width / 2, -c.img.height / 2); g.restore();
      const hot = 1 - (now - c.hot) / 1500;   // fresh off a blast it glows a moment
      if (hot > 0 && c.r > 6) { g.globalCompositeOperation = "lighter"; g.globalAlpha = hot * 0.5; g.fillStyle = "#ff8a3c"; g.beginPath(); g.arc(x, y, c.r * 0.6, 0, 6.29); g.fill(); g.globalCompositeOperation = "source-over"; }
    }
    g.globalAlpha = 1;
  }
  // a big crater (a bomb's, a blast's) doesn't just vanish: what it blew out comes away as pieces of the body
  // itself, cut from where it stood and flung out from the middle of the blast (taken before the crater is cut)
  function craterChunks(b, x, y, rad) {
    if (!b.cv || rad < 50 || (lowQ && rad < 90)) return;
    const n = Math.min(lowQ ? 6 : 14, Math.round(rad / 12));
    for (let i = 0, tries = 0; i < n && tries < n * 4; tries++) {
      const a = Math.random() * 6.283, d = rad * Math.sqrt(Math.random()) * 0.9, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (!solidAt(b, px, py)) continue;
      i++;
      const v = 160 + Math.random() * 520 * Math.min(1, rad / 150), r = Math.min(34, rad * (0.07 + Math.random() * 0.09));
      chunkOff(b, px, py, r, Math.cos(a) * v + (b.vx || 0), Math.sin(a) * v + (b.vy || 0));
    }
  }
  // pieces off a hit: n of them, about r across, thrown out along the face's normal (and some through, from a breach)
  function chunksOff(b, x, y, n, r, speed, through = 0) {
    const [nx, ny] = normalAt(b, x, y), out = Math.atan2(ny, nx);
    for (let i = 0; i < n; i++) {
      const side = Math.random() < through ? out + Math.PI : out, a = side + (Math.random() - 0.5) * 1.8, v = speed * (0.5 + Math.random() * 0.8), rr = r * (0.5 + Math.random() * 0.7);
      chunkOff(b, x + (Math.random() - 0.5) * r, y + (Math.random() - 0.5) * r, rr, Math.cos(a) * v, Math.sin(a) * v);
    }
  }
  let surfT = 0, surfN = 0;
