  function damageFx(b, dt) {
    // a fresh hit (hitAt moved on): a splash of oil
    if (b.hitAt && b.hitAt !== b.oilHit) { b.oilHit = b.hitAt; oilSplash(b.x, b.y, 10, 260, (b.vx || 0) * 0.3, (b.vy || 0) * 0.3); }
    const dmg = damageOf(b);
    if (dmg <= 0) return;
    if (dmg > 0.3 && Math.random() < (dmg - 0.2) * 9 * dt) oilSplash(b.x - Math.cos(b.a) * 20, b.y - Math.sin(b.a) * 20, 1, 40, (b.vx || 0) * 0.2, (b.vy || 0) * 0.2);   // a leak
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
      return [wx / d * v + (b.vx || 0) * 0.7, wy / d * v + (b.vy || 0) * 0.7, (Math.random() - 0.5) * 1.3];   // (carrying on the way it flew)
    });
  }
  function shove(x, y, r, power) {
    for (const b of rubble) {   // loose rock too: a lighter piece flies further, a push off its centre spins it
      if (b.dead) continue;
      const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy);
      if (d < 1 || d > r + b.rr) continue;
      const f = power * Math.max(0, 1 - Math.max(0, d - b.rr * 0.5) / r) * Math.min(1.2, 6 / Math.sqrt(Math.max(1, b.mass)));
      b.vx += dx / d * f; b.vy += dy / d * f; b.va += (hash(Math.round(b.x), Math.round(b.y), 3) - 0.5) * f / 150;
      b.hotUntil = Math.max(b.hotUntil || 0, performance.now() + 500);
    }
    // wrecks, pieces and debris: pushed when the shock front gets to them (it runs out at SHOCK_SPEED), and by their
    // weight: a hulk is heavy, a big piece of a bin less, a scrap of debris light
    const now = performance.now();
    for (const list of [hulks, frags, debris, chunks]) for (const o of list) {
      const dx = o.x - x, dy = o.y - y, d = Math.hypot(dx, dy);
      if (d < 1 || d > r) continue;
      const kg = list === hulks ? 3 : list === frags ? Math.max(0.6, (o.s || 40) / 60) : list === chunks ? Math.max(0.3, o.r / 12) : 0.5;
      const f = power * (1 - d / r) / Math.sqrt(kg);
      shockQueue.push({ at: now + d / SHOCK_SPEED * 1000, o, vx: dx / d * f, vy: dy / d * f, sp: (Math.random() - 0.5) * f / 200 });
    }
    if (shockQueue.length > 400) shockQueue.splice(0, shockQueue.length - 400);
  }
  const SHOCK_SPEED = 1800;   // px/s: how fast a blast's shock front runs out (its ring and the pushes keep the same pace)
  const shockQueue = [];
  function shockTick(now) {
    for (let i = shockQueue.length - 1; i >= 0; i--) {
      const e = shockQueue[i];
      if (now < e.at) continue;
      shockQueue.splice(i, 1);
      const o = e.o; o.vx += e.vx; o.vy += e.vy;
      if ("spin" in o) o.spin += e.sp; else o.vr = (o.vr || 0) + e.sp * 2;
    }
  }
  // a bin's breakup goes on after the blast (as a ship's in a strategy game's scripted death): a piece or two still
  // holding fuel pops a moment later, wherever it has flown, with a spray of sparks
  function breakupPops(n) {
    const pieces = frags.slice(-n);
    for (let k = 0, m = Math.min(pieces.length, lowQ ? 1 : 2 + (Math.random() < 0.4 ? 1 : 0)); k < m; k++) {
      const o = pieces[Math.floor(Math.random() * pieces.length)];
      afterBlasts.push({ at: performance.now() + 180 + k * 160 + Math.random() * 200, o, speed: 160 + Math.random() * 60, pop: true });
    }
  }
  function binExplosion(b, n) {
    shove(b.x, b.y, 320, 420);
    const [bodyCol, lidCol] = binColors(b.ck), sz = sizeOf(b.lv || 1), q = lowQ ? 0.35 : 1;
    // the fuel goes up: the layered blast, a second puff of fire a beat later off to one side, the view warping
    explode(b.x, b.y, 110, 400 * Math.sqrt(sz));
    const a2 = Math.random() * 6.28;
    for (let k = 0; k < 8 * q; k++) {
      const a = Math.random() * 6.28, v = 30 + Math.random() * 90;
      puff(b.x + Math.cos(a2) * 26 * sz, b.y + Math.sin(a2) * 26 * sz, Math.cos(a) * v, Math.sin(a) * v, 0.7 + Math.random() * 0.5, (14 + Math.random() * 10) * sz, FIRE_RAMP[0], 4, 0, 0, 0.9, 0.15 + Math.random() * 0.2);
    }
    if (Math.hypot(b.x - me.x, b.y - me.y) < 1400) sfx("boom_bin", 1, 1, b.x, b.y);
    shatter(b, n); breakupPops(n);
    oilSplash(b.x, b.y, 34, 480, (b.vx || 0) * 0.3, (b.vy || 0) * 0.3);   // its oil, everywhere
    for (let k = 0; k < (lowQ ? 3 : 6); k++) {
      const a = Math.random() * 6.28, v = 60 + Math.random() * 200;
      addDebris(b.x, b.y, Math.cos(a) * v + (b.vx || 0) * 0.3, Math.sin(a) * v + (b.vy || 0) * 0.3, (4 + Math.random() * 7) * sz, k % 3 ? bodyCol : lidCol);
    }
  }
