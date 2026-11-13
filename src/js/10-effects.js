  // ---------- particles ----------
  const dotCache = new Map();
  function dotSprite(col) {
    let c = dotCache.get(col);
    if (c) return c;
    c = document.createElement("canvas"); c.width = c.height = 32;
    const x = c.getContext("2d"), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, col); gr.addColorStop(0.45, col); gr.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
    dotCache.set(col, c);
    return c;
  }
  function puff(x, y, vx, vy, life, size, col, k = 0, len = 0.035) {
    parts.push({ x, y, vx, vy, life, max: life, size, col, k, len, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 14 });
  }
  // a shower of long glowing sparks thrown along (nx, ny), with embers and a flash: for hard collisions
  function sparkShower(x, y, nx, ny, power) {
    const n = Math.round((lowQ ? 12 : 34) * power);
    for (let k = 0; k < n; k++) {
      const a = Math.atan2(ny, nx) + (Math.random() - 0.5) * 1.6, v = 380 + Math.random() * 760 * power;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.45 + Math.random() * 0.6, 1.1 + Math.random() * 1.3, k % 4 ? (k % 2 ? "#fff6c8" : "#ffd36b") : "#ff9a2e", 1, 0.07);
    }
    for (let k = 0; k < n / 2; k++) {
      const a = Math.random() * 6.28, v = 60 + Math.random() * 220;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.8 + Math.random() * 0.8, 1 + Math.random(), "#ffb43c");
    }
    impacts.push({ x, y, t: 0, r: 60 + power * 40, col: "#fff2c0" });
  }
  const impacts = [];   // short bright flashes where something hits
  const debris = [];    // wreckage of destroyed bins, drifting through space for a while
  function addDebris(x, y, vx, vy, size, col, life = Infinity) {   // default: stays until the round ends
    const shape = Array.from({ length: 6 }, () => 0.55 + Math.random() * 0.5);
    debris.push({ x, y, vx, vy, size, col, shape, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 3, life, max: life, born: performance.now() });
    if (debris.length > 220) debris.shift();
  }
  const rings = [];     // expanding shock rings
  // metal-on-metal: a flash plus a spray of bright streaks
  function impact(x, y, col, power) {
    impacts.push({ x, y, t: 0, r: 22 + power * 26, col });
    const n = (lowQ ? 5 : 10) + power * (lowQ ? 3 : 8);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.28, v = 260 + Math.random() * 420 * power;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.2 + Math.random() * 0.3, 1.1 + Math.random() * 1.2, k % 3 ? "#fff6c8" : col, 1);
    }
  }
  function smoke(x, y, n, spread, life) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.28, v = Math.random() * spread;
      puff(x + Math.cos(a) * 8, y + Math.sin(a) * 8, Math.cos(a) * v, Math.sin(a) * v, life * (0.7 + Math.random() * 0.6), 5 + Math.random() * 6, "rgb(92,84,112)", 2);
    }
  }
  // dead but intact: a dark, cracked, engine-off bin tumbling slowly, smoking and sparking for ~12 s
  const hulks = [];
  function makeHulk(b, zap) {
    const life = Infinity;   // stays until the round ends
    hulks.push({ x: b.x, y: b.y, vx: (b.vx || 0) * 0.5 + (Math.random() - 0.5) * 60, vy: (b.vy || 0) * 0.5 + (Math.random() - 0.5) * 60,
                 a: b.a, spin: (Math.random() - 0.5) * (zap ? 0.6 : 1.6), lv: b.lv || 1, ck: b.ck, life, max: life, born: performance.now(), zap: !!zap });
    if (hulks.length > 30) hulks.shift();
    if (zap) return;
    impacts.push({ x: b.x, y: b.y, t: 0, r: 70, col: "#ff9a2e" });
    rings.push({ x: b.x, y: b.y, t: 0, r: 140, col: "255,200,160", warp: true });
    explode(b.x, b.y, lowQ ? 14 : 30, 220);
    smoke(b.x, b.y, lowQ ? 6 : 14, 60, 2);
  }
  const whiteCache = new Map();
  function whiteBody(ck) {   // the bin's silhouette in white, for the hit flash
    const src = tintedBody(ck), key = ck.join(",") + "|" + (ck.team ?? "");
    let c = whiteCache.get(key);
    if (c) return c;
    c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
    const x = c.getContext("2d");
    x.drawImage(src, 0, 0); x.globalCompositeOperation = "source-atop"; x.fillStyle = "#ffffff"; x.fillRect(0, 0, c.width, c.height);
    whiteCache.set(key, c);
    return c;
  }
  const darkCache = new Map();
  function darkBody(ck, amount = 0.58) {
    const src = tintedBody(ck), key = ck.join(",") + "|" + (ck.team ?? "") + "|" + amount;
    let c = darkCache.get(key);
    if (c) return c;
    c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
    const x = c.getContext("2d");
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = "source-atop"; x.fillStyle = `rgba(14,8,24,${amount})`; x.fillRect(0, 0, c.width, c.height);
    darkCache.set(key, c);
    return c;
  }
  const binColors = ck => {
    const bh = ck ? customVal(ck, "body") : null, lh = ck ? customVal(ck, "lid") : null;
    return [bh === null ? "#4fd6c8" : `hsl(${bh} 65% 55%)`, lh === null ? "#9d8fc8" : `hsl(${lh} 45% 60%)`];
  };
  // boost: a dense jet of fire out of the nozzle
  function afterburner(b, fx, dt) {
    if (!fx) return;
    const bx = Math.cos(b.a), by = Math.sin(b.a), sz = sizeOf(b.lv || 1), tail = 46 * sz, q = lowQ ? 0.4 : 1;
    const n = (fx === 2 ? 140 : 110) * q * dt;
    for (let k = 0; k < n || (k === 0 && Math.random() < n); k++) {   // a long roaring plume
      const sp = 320 + Math.random() * 420, j = (Math.random() - 0.5) * 0.45;
      const vx = -Math.cos(b.a + j) * sp, vy = -Math.sin(b.a + j) * sp;
      puff(b.x - bx * tail, b.y - by * tail, vx + (b.vx || 0) * 0.4, vy + (b.vy || 0) * 0.4, 0.3 + Math.random() * 0.35, 3.5 + Math.random() * 5 * sz, FIRE_COLS[(Math.random() * 3) | 0]);
    }
    for (let k = 0; k < 40 * q * dt || (k === 0 && Math.random() < 40 * q * dt); k++) {   // a blue-white shock core and sparks streaking back
      const v = 500 + Math.random() * 400, j = (Math.random() - 0.5) * 0.25;
      puff(b.x - bx * tail, b.y - by * tail, -Math.cos(b.a + j) * v + (b.vx || 0) * 0.5, -Math.sin(b.a + j) * v + (b.vy || 0) * 0.5, 0.18 + Math.random() * 0.15, 1.6 + Math.random() * 1.4, k % 2 ? "#bfefff" : "#ffffff", 1);
    }
    if (Math.random() < 14 * q * dt) {   // shock diamonds pulsing in the exhaust
      const d = tail + 30 + Math.random() * 60;
      impacts.push({ x: b.x - bx * d, y: b.y - by * d, t: 0.05, r: 26 * sz, col: "#9fe8ff" });
    }
  }
  // dash: a flash and a hot ring at the nozzle, sparks thrown back
  function dashBurst(b) {
    const bx = Math.cos(b.a), by = Math.sin(b.a), sz = sizeOf(b.lv || 1), tx = b.x - bx * 44 * sz, ty = b.y - by * 44 * sz;
    impacts.push({ x: tx, y: ty, t: 0, r: 90 * sz, col: "#ffd23f" });
    rings.push({ x: tx, y: ty, t: 0, r: 110 * sz, col: "255,220,160", dur: 0.35, w: 8 });
    for (let k = 0; k < (lowQ ? 12 : 30); k++) {
      const a = b.a + Math.PI + (Math.random() - 0.5) * 0.9, v = 400 + Math.random() * 500;
      puff(tx, ty, Math.cos(a) * v, Math.sin(a) * v, 0.25 + Math.random() * 0.25, 1.2 + Math.random(), k % 2 ? "#fff6c8" : "#ffb43c", 1);
    }
  }
  // a hurt bin smokes; on its last life it also throws sparks
  const damageOf = b => 1 - b.lives / maxLivesOf(b.lv || 1);
  function damageFx(b, dt) {
    const dmg = damageOf(b);
    if (dmg <= 0) return;
    const sz = sizeOf(b.lv || 1), bx = Math.cos(b.a), by = Math.sin(b.a);
    if (Math.random() < dmg * (lowQ ? 10 : 26) * dt) {
      const ox = (Math.random() - 0.5) * 40 * sz, oy = (Math.random() - 0.5) * 40 * sz;
      puff(b.x + ox, b.y + oy, -bx * 70 + (Math.random() - 0.5) * 50, -by * 70 + (Math.random() - 0.5) * 50, 1.3 + Math.random() * 0.9, 3.5 + Math.random() * 3.5, dmg > 0.6 ? "rgb(52,46,64)" : "rgb(105,97,124)", 2);
    }
    if (dmg > 0.6 && Math.random() < 5 * dt) impact(b.x + (Math.random() - 0.5) * 50 * sz, b.y + (Math.random() - 0.5) * 50 * sz, "#ff9a2e", 0.4);
  }
  // a bin blowing apart: fireball, shock ring, tumbling pieces of its own colours, sparks and smoke
  // real pieces of the ship: the sprite (with wings and armour) is cut along jagged lines from a point
  // near its middle; every piece keeps its part of the picture and drifts off on its own
  const frags = [];
  // where a ray from c along (dx, dy) leaves the 320x320 sprite square
  function spriteExit(c, dx, dy) {
    let t = Infinity;
    if (dx > 1e-6) t = Math.min(t, (320 - c[0]) / dx); if (dx < -1e-6) t = Math.min(t, -c[0] / dx);
    if (dy > 1e-6) t = Math.min(t, (320 - c[1]) / dy); if (dy < -1e-6) t = Math.min(t, -c[1] / dy);
    return [c[0] + dx * t, c[1] + dy * t];
  }
  // a broken-off piece of bin as a drifting fragment; vel(wx, wy) gives its speed and spin from where it sits
  function addFrag(b, piece, s, rot, imgs, vel) {
    const ox = (piece.cx / 320 - 0.5) * s, oy = (piece.cy / 320 - 0.5) * s;
    const wx = ox * Math.cos(rot) - oy * Math.sin(rot), wy = ox * Math.sin(rot) + oy * Math.cos(rot), [vx, vy, spin] = vel(wx, wy);
    frags.push({ cx: piece.cx, cy: piece.cy, img: imgs[0], glow: imgs[1], x: b.x + wx, y: b.y + wy, vx, vy,
                 a: rot, spin, s, life: Infinity, max: Infinity, born: performance.now() });
    while (frags.length > 60) frags.shift();   // each piece holds two small pre-rendered canvases
  }
  function cutSprite(n) {
    const c = [150 + (Math.random() - 0.5) * 40, 140 + (Math.random() - 0.5) * 40];
    const base = Math.random() * 6.283;
    const angs = Array.from({ length: n }, (_, i) => base + i * 6.283 / n + (Math.random() - 0.5) * 0.5);
    const toEdge = a => spriteExit(c, Math.cos(a), Math.sin(a));
    const cuts = angs.map(a => {
      const e = toEdge(a), pts = [c];
      for (const f of [0.3, 0.55, 0.8]) {
        const j = (Math.random() - 0.5) * 34;
        pts.push([c[0] + (e[0] - c[0]) * f - Math.sin(a) * j, c[1] + (e[1] - c[1]) * f + Math.cos(a) * j]);
      }
      pts.push(e);
      return pts;
    });
    const norm = a => ((a % 6.2832) + 6.2832) % 6.2832;
    const corners = [[320, 320], [0, 320], [0, 0], [320, 0]];
    return angs.map((a0, i) => {
      const j = (i + 1) % n, span = n === 1 ? 6.2832 : norm(angs[j] - a0);
      const inside = corners.filter(q => norm(Math.atan2(q[1] - c[1], q[0] - c[0]) - a0) < span)
        .sort((q1, q2) => norm(Math.atan2(q1[1] - c[1], q1[0] - c[0]) - a0) - norm(Math.atan2(q2[1] - c[1], q2[0] - c[0]) - a0));
      const poly = [...cuts[i], ...inside, ...cuts[j].slice().reverse()];
      const cx = poly.reduce((t, q) => t + q[0], 0) / poly.length, cy = poly.reduce((t, q) => t + q[1], 0) / poly.length;
      return { poly, edges: [cuts[i], cuts[j]], cx, cy };
    });
  }
  // draw a piece once into its own canvas (art + wings + armour, clipped), plus a second canvas with the
  // hot fracture lines kept only where the piece has paint, so nothing glows in empty space
  function renderPiece(piece, s, lv, ck, hot = "255,140,50", core = "255,240,200", lw = 1) {
    const res = 1.5, cw = Math.ceil(s * res), mk = () => { const c = document.createElement("canvas"); c.width = c.height = cw; return c; };
    const base = mk(), glow = mk(), bctx = base.getContext("2d"), gctx = glow.getContext("2d");
    const P = (px, py) => [(px / 320 - 0.5) * s, (py / 320 - 0.5) * s];
    const main = g, mainTS = TS;
    try {
      g = bctx; TS = 1;
      bctx.setTransform(res, 0, 0, res, cw / 2, cw / 2);
      bctx.beginPath(); piece.poly.forEach(([px, py], i) => { const [X, Y] = P(px, py); i ? bctx.lineTo(X, Y) : bctx.moveTo(X, Y); }); bctx.closePath(); bctx.clip();
      drawWings(lv, s);
      if (body) bctx.drawImage(darkBody(ck, 0.12), -s / 2, -s / 2, s, s);
      drawArmor(lv, s, 0, true);
      drawDamage(0.4, s, 0, 0);
    } finally { g = main; TS = mainTS; }
    gctx.setTransform(res, 0, 0, res, cw / 2, cw / 2);
    gctx.lineJoin = "round"; gctx.lineCap = "round";
    for (const e of piece.edges) {
      gctx.beginPath(); e.forEach(([px, py], i) => { const [X, Y] = P(px, py); i ? gctx.lineTo(X, Y) : gctx.moveTo(X, Y); });
      gctx.strokeStyle = `rgba(${hot},0.9)`; gctx.lineWidth = s * 0.035 * lw; gctx.stroke();
      gctx.strokeStyle = `rgba(${core},0.85)`; gctx.lineWidth = s * 0.012 * lw; gctx.stroke();
    }
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.globalCompositeOperation = "destination-in"; gctx.drawImage(base, 0, 0);
    return [base, glow];
  }
  function shatter(b, n) {
    const s = BOT * sizeOf(b.lv || 1), rot = b.a + Math.PI / 2 - SPRITE_TILT;
    for (const piece of cutSprite(n)) addFrag(b, piece, s, rot, renderPiece(piece, s, b.lv || 1, b.ck || [0, 0, 0, 0, 0]), (wx, wy) => {
      const d = Math.hypot(wx, wy) || 1, v = 70 + Math.random() * 150;   // flung out from the middle
      return [wx / d * v + (b.vx || 0) * 0.4, wy / d * v + (b.vy || 0) * 0.4, (Math.random() - 0.5) * 1.3];
    });
  }
  function shove(x, y, r, power) {
    for (const list of [hulks, frags, debris]) for (const o of list) {
      const dx = o.x - x, dy = o.y - y, d = Math.hypot(dx, dy);
      if (d < 1 || d > r) continue;
      const f = power * (1 - d / r);
      o.vx += dx / d * f; o.vy += dy / d * f;
      if ("spin" in o) o.spin += (Math.random() - 0.5) * f / 200; else o.vr += (Math.random() - 0.5) * f / 100;
    }
  }
  function binExplosion(b, n) {
    shove(b.x, b.y, 320, 420);
    const [bodyCol, lidCol] = binColors(b.ck), sz = sizeOf(b.lv || 1), q = lowQ ? 0.35 : 1;
    // a fireball in three quick beats
    impacts.push({ x: b.x, y: b.y, t: 0, r: 150 * sz, col: "#fff2c0" });
    impacts.push({ x: b.x + 10, y: b.y - 8, t: -0.07, r: 120 * sz, col: "#ffb43c" });
    impacts.push({ x: b.x - 8, y: b.y + 10, t: -0.14, r: 95 * sz, col: "#ff6a2a" });
    rings.push({ x: b.x, y: b.y, t: 0, r: 230 * sz, col: "255,220,170", warp: true });
    explode(b.x, b.y, Math.round(90 * q), 360);
    if (Math.hypot(b.x - me.x, b.y - me.y) < 1400) sfx("boom_bin", 1, 1, b.x, b.y) || boomSound(0.9, 1400, 0.35);
    // dense rolling fire at the core
    for (let k = 0; k < 46 * q; k++) {
      const a = Math.random() * 6.28, v = 30 + Math.random() * 150;
      puff(b.x, b.y, Math.cos(a) * v, Math.sin(a) * v, 0.55 + Math.random() * 0.6, (6 + Math.random() * 8) * sz, FIRE_COLS[(Math.random() * 3) | 0]);
    }
    // embers that keep glowing as they fly
    for (let k = 0; k < 60 * q; k++) {
      const a = Math.random() * 6.28, v = 120 + Math.random() * 380;
      puff(b.x, b.y, Math.cos(a) * v, Math.sin(a) * v, 1.2 + Math.random() * 1.3, 0.9 + Math.random() * 0.9, Math.random() < 0.5 ? "#ffb43c" : "#ffe08a");
    }
    smoke(b.x, b.y, Math.round(30 * q), 120, 3);
    shatter(b, n);
    for (let k = 0; k < (lowQ ? 3 : 6); k++) {
      const a = Math.random() * 6.28, v = 60 + Math.random() * 200;
      addDebris(b.x, b.y, Math.cos(a) * v + (b.vx || 0) * 0.3, Math.sin(a) * v + (b.vy || 0) * 0.3, (4 + Math.random() * 7) * sz, k % 3 ? bodyCol : lidCol);
    }
  }
  // ---------- how a bin dies depends on what got it ----------
  // 0 blown apart (fire, rockets, mines, shards, crashes...), 1 sliced by a rail slug, 2 fried by laser or lightning, 3 melted by plasma
  const deathStyleOf = kind => kind === K.RAIL ? 1 : kind === K.LASER || kind === K.BOLT ? 2 : kind === K.ORB ? 3 : 0;
  function deathFx(b, ds, dk, da) {
    b = { ...b, ck: teamCk(b) };   // the wreck keeps the colours the bin flew in
    if (dk === 1) railCut(b, da);
    else if (dk === 2) electrocute(b);
    else if (dk === 3) meltDown(b);
    else if (ds === 1) makeHulk(b); else binExplosion(b, ds >= 2 && ds <= 4 ? ds : 3);
  }
  // the sprite square (0..320) cut in two along a straight line at angle a (sprite frame), off the middle by off;
  // the cut has a fine saw-tooth edge
  function sliceSprite(a, off) {
    const dx = Math.cos(a), dy = Math.sin(a), c = [160 - dy * off, 150 + dx * off];
    const p0 = spriteExit(c, -dx, -dy), p1 = spriteExit(c, dx, dy), cut = [];
    for (let k = 0; k <= 18; k++) {
      const t = k / 18, j = k === 0 || k === 18 ? 0 : (k % 2 ? 2.5 : -2.5);
      cut.push([p0[0] + (p1[0] - p0[0]) * t - dy * j, p0[1] + (p1[1] - p0[1]) * t + dx * j]);
    }
    const side = q => (q[0] - c[0]) * dy - (q[1] - c[1]) * dx;
    const out = [];
    for (const sg of [1, -1]) {
      const cs = [[0, 0], [320, 0], [320, 320], [0, 320]].filter(q => side(q) * sg > 0);
      if (!cs.length) continue;
      const all = [...cs, p0, p1], mx = all.reduce((t, q) => t + q[0], 0) / all.length, my = all.reduce((t, q) => t + q[1], 0) / all.length;
      const poly = [...cut, ...cs].sort((q1, q2) => Math.atan2(q1[1] - my, q1[0] - mx) - Math.atan2(q2[1] - my, q2[0] - mx));
      out.push({ poly, edges: [cut], cx: mx, cy: my });
    }
    return out;
  }
  // railgun: the slug saws the bin clean in two along its path; the halves drift apart with glowing violet cuts
  function railCut(b, da) {
    const sz = sizeOf(b.lv || 1), s = BOT * sz, rot = b.a + Math.PI / 2 - SPRITE_TILT, nx = -Math.sin(da), ny = Math.cos(da);
    for (const piece of sliceSprite(da - rot, (Math.random() - 0.5) * 36))
      addFrag(b, piece, s, rot, renderPiece(piece, s, b.lv || 1, b.ck || [0, 0, 0, 0, 0], "200,120,255", "255,245,255", 1.8), (wx, wy) => {
        const sg = Math.sign(wx * nx + wy * ny) || 1, v = 90 + Math.random() * 50;   // the halves part across the cut, carried along the slug's path
        return [nx * sg * v + Math.cos(da) * 110 + (b.vx || 0) * 0.3, ny * sg * v + Math.sin(da) * 110 + (b.vy || 0) * 0.3, sg * (0.25 + Math.random() * 0.4)];
      });
    const L = s * 0.75;
    for (let k = 0; k < (lowQ ? 14 : 40); k++) {   // sparks spraying off both sides of the cut
      const t = (Math.random() - 0.5) * L, px = b.x + Math.cos(da) * t, py = b.y + Math.sin(da) * t;
      const a = da + (Math.random() < 0.5 ? 1.57 : -1.57) + (Math.random() - 0.5) * 0.7, v = 160 + Math.random() * 380;
      puff(px, py, Math.cos(a) * v, Math.sin(a) * v, 0.35 + Math.random() * 0.5, 1 + Math.random(), k % 3 ? "#e9c8ff" : "#ffffff", 1, 0.05);
    }
    impacts.push({ x: b.x, y: b.y, t: 0, r: 100 * sz, col: "#e9c8ff" });
    rings.push({ x: b.x, y: b.y, t: 0, r: 170 * sz, col: "217,168,255", dur: 0.4, w: 6 });
    smoke(b.x, b.y, lowQ ? 4 : 10, 50, 2);
    sfx("chunk", 1, 0.7, b.x, b.y);
  }
  // laser or lightning: the charge fries it where it is; the charred shell twitches with arcs, then smokes
  function electrocute(b) {
    const sz = sizeOf(b.lv || 1);
    makeHulk(b, true);
    impacts.push({ x: b.x, y: b.y, t: 0, r: 140 * sz, col: "#bfefff" });
    impacts.push({ x: b.x, y: b.y, t: -0.12, r: 100 * sz, col: "#6fc2ff" });
    rings.push({ x: b.x, y: b.y, t: 0, r: 180 * sz, col: "150,220,255", dur: 0.35, w: 5 });
    for (let k = 0; k < (lowQ ? 16 : 44); k++) {
      const a = Math.random() * 6.28, v = 200 + Math.random() * 500;
      puff(b.x, b.y, Math.cos(a) * v, Math.sin(a) * v, 0.3 + Math.random() * 0.4, 1 + Math.random(), k % 2 ? "#bfefff" : "#ffffff", 1, 0.05);
    }
    smoke(b.x, b.y, lowQ ? 5 : 12, 40, 2.5);
    sfx("laser", 0.8, 0.5, b.x, b.y); sfx("hit", 0.6, 0.6, b.x, b.y);
  }
  // plasma: the bin glows white-hot, slumps and drips like wax, then cools into molten blobs
  const melts = [];
  function meltDown(b) {
    const sz = sizeOf(b.lv || 1), s = BOT * sz;
    const [img] = renderPiece({ poly: [[0, 0], [320, 0], [320, 320], [0, 320]], edges: [], cx: 160, cy: 160 }, s, b.lv || 1, b.ck || [0, 0, 0, 0, 0]);
    const hot = document.createElement("canvas"); hot.width = img.width; hot.height = img.height;
    const hq = hot.getContext("2d"), gr = hq.createLinearGradient(0, 0, 0, hot.height);
    hq.drawImage(img, 0, 0); hq.globalCompositeOperation = "source-in";
    gr.addColorStop(0, "#ffe7a0"); gr.addColorStop(0.5, "#ff9a30"); gr.addColorStop(1, "#e8400e");
    hq.fillStyle = gr; hq.fillRect(0, 0, hot.width, hot.height);
    const drip = Array.from({ length: 10 }, () => 0.5 + Math.random() * 0.9);
    melts.push({ x: b.x, y: b.y, vx: (b.vx || 0) * 0.3, vy: (b.vy || 0) * 0.3, a: b.a + Math.PI / 2 - SPRITE_TILT, img, hot, s, sz, drip, t: 0 });
    if (melts.length > 8) melts.shift();
    impacts.push({ x: b.x, y: b.y, t: 0, r: 130 * sz, col: "#9fe8ff" });
    rings.push({ x: b.x, y: b.y, t: 0, r: 170 * sz, col: "160,235,255", dur: 0.45, w: 8 });
    sfx("shield_hit", 0.9, 0.55, b.x, b.y); sfx("boom_small", 0.6, 0.7, b.x, b.y);
  }
  const MELT_T = 2.6;
  function updateMelts(dt) {
    for (let i = melts.length - 1; i >= 0; i--) {
      const m = melts[i];
      m.t += dt; m.x += m.vx * dt; m.y += m.vy * dt; m.vx *= 0.99; m.vy *= 0.99;
      const k = Math.min(1, m.t / MELT_T), down = m.a + Math.PI / 2;
      if (Math.random() < (lowQ ? 6 : 16) * dt) {   // molten drops falling off the sagging bottom
        const o = (Math.random() - 0.5) * m.s * 0.8, bx = m.x + Math.cos(m.a) * o + Math.cos(down) * m.s * (0.3 + k * 0.2), by = m.y + Math.sin(m.a) * o + Math.sin(down) * m.s * (0.3 + k * 0.2);
        puff(bx, by, Math.cos(down) * (40 + Math.random() * 60), Math.sin(down) * (40 + Math.random() * 60), 0.6 + Math.random() * 0.6, 1.5 + Math.random() * 2, Math.random() < 0.5 ? "#ffb040" : "#ffe08a");
      }
      if (Math.random() < 5 * dt) smoke(m.x + (Math.random() - 0.5) * m.s * 0.5, m.y + (Math.random() - 0.5) * m.s * 0.5, 1, 15, 1.6);
      if (m.t >= MELT_T) {   // set: a few glowing blobs of slag drift away
        for (let n = 0; n < (lowQ ? 4 : 7); n++) { const a = Math.random() * 6.28, v = 20 + Math.random() * 70; addDebris(m.x + Math.cos(down) * m.s * 0.3, m.y + Math.sin(down) * m.s * 0.3, Math.cos(a) * v + m.vx, Math.sin(a) * v + m.vy, (4 + Math.random() * 6) * m.sz, n % 2 ? "#7a4a3a" : "#5a3a40"); }
        smoke(m.x, m.y, lowQ ? 4 : 10, 40, 2.5);
        melts.splice(i, 1);
      }
    }
  }
  function drawMelts(now) {
    for (const m of melts) {
      const x = sx(m.x), y = sy(m.y), s = m.s;
      if (!onScreen(x, y, s)) continue;
      const k = Math.min(1, m.t / MELT_T), e = k * k * (3 - 2 * k), n = m.drip.length, sw = m.img.width / n, w = s / n;
      const fade = 1 - Math.max(0, (m.t - MELT_T + 0.5) / 0.5);
      const heat = 0.75 * Math.min(1, m.t / 0.35) * (1 - Math.max(0, (m.t - 1.6) / 1)) * (0.8 + 0.2 * Math.sin(now / 45));
      g.save(); g.translate(x, y); g.rotate(m.a);
      for (const [src, alpha, mode] of [[m.img, fade, "source-over"], [m.hot, Math.max(0, heat) * fade, "lighter"]]) {
        if (alpha <= 0) continue;
        g.globalCompositeOperation = mode; g.globalAlpha = alpha;
        for (let i = 0; i < n; i++) {   // each strip sags and drips by its own amount
          const d = m.drip[i], top = -s / 2 + s * 0.55 * e * d, bot = s / 2 + s * 0.25 * e * d * d;
          g.drawImage(src, i * sw, 0, sw + 0.5, m.img.height, -s / 2 + i * w - w * 0.15 * e, top, w * (1 + 0.3 * e), bot - top);
        }
      }
      g.restore();
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    }
  }
  const TRAIL = ["#ffe3f6", "#ffffff", "#ffd2a0", "#f3c6ff"];
  function trailFrom(b, rate, dt) {
    const n = rate * dt * (lowQ ? 25 : 60);
    const bx = Math.cos(b.a), by = Math.sin(b.a), sz = sizeOf(b.lv || 1), tail = 40 * sz;
    const tr = b.ck ? customVal(b.ck, "trail") : null, trailCols = tr ? TRAILS[tr] : TRAIL;
    for (let k = 0; k < n || (k === 0 && Math.random() < n); k++) {
      const tx = b.x - bx * tail + (Math.random() - .5) * 14 * sz, ty = b.y - by * tail + (Math.random() - .5) * 14 * sz;
      puff(tx, ty, -bx * 40 + (Math.random() - .5) * 30, -by * 40 + (Math.random() - .5) * 30,
        0.6 + Math.random() * 0.9, 1 + Math.random() * 2.2, trailCols[(Math.random() * trailCols.length) | 0]);
    }
  }

  const FIRE_COLS = ["#fff3b0", "#ffd23f", "#ff9a2e", "#ff5a1f"];
  function explode(x, y, n, speed) {
    // bigger and brighter: a wider fireball of larger embers, a white-hot core, then streaks, a shock ring and smoke
    n = Math.round(n * 1.3); speed *= 1.35;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.28, v = speed * (0.3 + Math.random());
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.6 + Math.random() * 1.0, 2.5 + Math.random() * 5, FIRE_COLS[(Math.random() * 4) | 0]);
    }
    for (let k = 0; k < n / (lowQ ? 8 : 4); k++) {   // the core: big slow white-yellow blobs
      const a = Math.random() * 6.28, v = speed * Math.random() * 0.35;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.35 + Math.random() * 0.3, 5 + Math.random() * 6, Math.random() < 0.5 ? "#ffffff" : "#fff1a8");
    }
    for (let k = 0; k < n / (lowQ ? 5 : 2.5); k++) {
      const a = Math.random() * 6.28, v = speed * (0.9 + Math.random() * 1.4);
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.3 + Math.random() * 0.4, 1.6 + Math.random() * 1.4, Math.random() < 0.5 ? "#fff6c8" : "#ffd23f", 1);
    }
    impacts.push({ x, y, t: 0, r: 30 + speed * 0.22, col: "#ffb040" });
    impacts.push({ x, y, t: 0, r: 14 + speed * 0.1, col: "#ffffff" });
    if (n >= 26) rings.push({ x, y, t: 0, r: 40 + speed * 0.45, col: "255,190,110", dur: 0.45, w: 6 + n * 0.05 });
    if (n >= 20) smoke(x, y, Math.round(n / (lowQ ? 10 : 5)), speed * 0.3, 1.8);
  }
  // distance test along the segment a shot travelled this frame, so fast shots can't skip a target
  function segHit(s, x, y, r) {
    const dx = s.x - s.px, dy = s.y - s.py, L = dx * dx + dy * dy;
    const t = L ? clamp(((x - s.px) * dx + (y - s.py) * dy) / L, 0, 1) : 0;
    return Math.hypot(s.px + dx * t - x, s.py + dy * t - y) < r;
  }
  function rrect(x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  const scoreEl = document.getElementById("score");
  let shownScore = 0;
  function showScore() { if (me.score !== shownScore) { shownScore = me.score; scoreEl.textContent = me.score; } }
  function pushCapped(arr, v, n) { arr.push(v); if (arr.length > n) arr.shift(); }

