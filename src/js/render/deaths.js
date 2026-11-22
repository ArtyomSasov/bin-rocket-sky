  // ---------- how a bin dies depends on what got it ----------
  // how a bin dies follows what killed it: 0 blown up (a blast: in pieces; anything else may leave a hulk), 1 cut
  // clean by a rail, 2 fried by electricity, 3 melted by plasma, 4 nailed (it flies on along the nail and is pinned to
  // the rock it meets), 5 burnt (it burns, chars and crumbles to ash), 6 sawn into four by a blade
  const DEATH_KINDS = 6;
  const deathStyleOf = kind => kind === K.RAIL || kind === K.GAUSS || kind === K.SWORD ? 1
    : kind === K.LASER || kind === K.BOLT || kind === K.GAMMA || kind === K.SHOCK || kind === K.PULSE ? 2 : kind === K.ORB ? 3
    : kind === K.NAIL || kind === K.SPIKE ? 4 : kind === K.FIRE ? 5 : kind === K.SAW || kind === K.MELEE ? 6 : 0;
  // pieces for a blast (2-4), a hulk sometimes for the rest
  const BLASTS = new Set([K.ROCKET, K.HROCKET, K.GREN, K.MINE, K.NUKE, K.HOLY, K.FLAK, K.SHARD, K.PELLET, K.SLUG, K.TFRAG]);
  const deathPiecesOf = kind => BLASTS.has(kind) ? 3 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 4);
  // A bin killed by a blast, a slug, lightning or a blade is first thrown by the blow: it flies off the way the killing
  // shot went, tumbling, burning and trailing smoke, sparks and oil, and goes up where it slams into something (or
  // after half a second to a second), its pieces carrying on the way it flew (deathStyle, updateFx's hulks)
  const THROWN = new Set([0, 2, 6]);   // (a rail slug cuts it in two where it is: railCut)
  function deathFx(b, ds, dk, da) {
    b = { ...b, ck: teamCk(b) };   // the wreck keeps the colours the bin flew in
    if (THROWN.has(dk) && Number.isFinite(da)) {
      makeHulk(b, false, true);
      const h = hulks[hulks.length - 1], sp = 650 + Math.random() * 350;
      h.vx = Math.cos(da) * sp + (b.vx || 0) * 0.5; h.vy = Math.sin(da) * sp + (b.vy || 0) * 0.5; h.spin = (Math.random() - 0.5) * 10;
      h.dying = { ds, dk, da, fuse: 0.45 + Math.random() * 0.6 };
      impact(b.x, b.y, "#fff1d0", 1.6); sparkShower(b.x, b.y, Math.cos(da), Math.sin(da), 1.4); oilSplash(b.x, b.y, 14, 340, h.vx * 0.5, h.vy * 0.5);
      sfx("crash", 0.8, 0.8, b.x, b.y);
      return;
    }
    deathStyle(b, ds, dk, da);
  }
  // the thrown wreck goes up: in its own death's way, where it is now and moving as it moves
  function wreckBlows(h) {
    const d = h.dying;
    deathStyle({ x: h.x, y: h.y, vx: h.vx, vy: h.vy, a: h.a, lv: h.lv, ck: h.ck }, d.ds, d.dk, d.da);
  }
  function deathStyle(b, ds, dk, da) {
    if (dk === 1) railCut(b, da);
    else if (dk === 2) electrocute(b);
    else if (dk === 3) meltDown(b);
    else if (dk === 4) nailDeath(b, da);
    else if (dk === 5) burnDeath(b);
    else if (dk === 6) sawDeath(b, da);
    else if (ds === 1) makeHulk(b); else binExplosion(b, ds >= 2 && ds <= 4 ? ds : 3);
  }
  // nailed: the hulk flies on along the nail, nails sticking out of it, and is pinned to the first rock it meets
  function nailDeath(b, da) {
    makeHulk(b, false, true);
    const h = hulks[hulks.length - 1];
    h.nailA = da; h.vx = Math.cos(da) * 620 + (b.vx || 0) * 0.3; h.vy = Math.sin(da) * 620 + (b.vy || 0) * 0.3; h.spin = 0;
    h.nails = Array.from({ length: 3 }, (_, k) => ({ off: (k - 1) * 0.22 + (Math.random() - 0.5) * 0.1, len: 0.5 + Math.random() * 0.2 }));
    sparkShower(b.x, b.y, Math.cos(da), Math.sin(da), 1.2);
    packPlay("p_hit_nail", 0.9, b.x, b.y);
  }
  // burnt: the hulk burns for a few seconds, chars black, then crumbles to ash
  function burnDeath(b) {
    makeHulk(b, false, true);
    const h = hulks[hulks.length - 1];
    h.burn = performance.now(); h.spin *= 0.4; h.life = h.max = 4.2;
    impacts.push({ x: b.x, y: b.y, t: 0, r: 110, col: "#ff9a2e" });
    explode(b.x, b.y, lowQ ? 10 : 24, 160);
  }
  // sawn into four: two cuts across each other, red-hot edges, a storm of sparks
  function sawDeath(b, da) {
    const sz = sizeOf(b.lv || 1), s = BOT * sz, rot = b.a + Math.PI / 2 - SPRITE_TILT, a = da - rot;
    for (const piece of quarterSprite(a))
      addFrag(b, piece, s, rot, renderPiece(piece, s, b.lv || 1, b.ck || [0, 0, 0, 0, 0], "255,170,80", "255,240,200", 2), (wx, wy) => {
        const d = Math.hypot(wx, wy) || 1, v = 120 + Math.random() * 90;
        return [wx / d * v + (b.vx || 0) * 0.3, wy / d * v + (b.vy || 0) * 0.3, (Math.random() - 0.5) * 3];
      });
    for (let k = 0; k < (lowQ ? 20 : 60); k++) { const a2 = Math.random() * 6.283, v = 200 + Math.random() * 500; puff(b.x, b.y, Math.cos(a2) * v, Math.sin(a2) * v, 0.3 + Math.random() * 0.5, 1 + Math.random() * 1.4, k % 3 ? "#ffd27a" : "#ffffff", 1, 0.05); }
    impacts.push({ x: b.x, y: b.y, t: 0, r: 90 * sz, col: "#ffcf5a" });
    bladeClash(clamp((b.x - me.x) / 900, -1, 1));
  }
  // the sprite square cut by two lines through its middle at right angles (angle a, sprite frame): four pieces
  function quarterSprite(a) {
    const c = [160, 150], u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]];
    const clip = (poly, n, sg) => {   // keep the side of the line through c with normal n where sg * dot >= 0
      const out = [], side = q => sg * ((q[0] - c[0]) * n[0] + (q[1] - c[1]) * n[1]);
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length], sp = side(p), sq = side(q);
        if (sp >= 0) out.push(p);
        if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
      }
      return out;
    };
    const square = [[0, 0], [320, 0], [320, 320], [0, 320]], pieces = [];
    for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
      const poly = clip(clip(square, u, s1), v, s2);
      if (poly.length < 3) continue;
      const cx = poly.reduce((t, q) => t + q[0], 0) / poly.length, cy = poly.reduce((t, q) => t + q[1], 0) / poly.length;
      pieces.push({ poly, edges: [[[c[0] - u[0] * 240, c[1] - u[1] * 240], [c[0] + u[0] * 240, c[1] + u[1] * 240]], [[c[0] - v[0] * 240, c[1] - v[1] * 240], [c[0] + v[0] * 240, c[1] + v[1] * 240]]], cx, cy });
    }
    return pieces;
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
      addFrag(b, piece, s, rot, renderPiece(piece, s, b.lv || 1, b.ck || [0, 0, 0, 0, 0], "255,120,30", "255,236,190", 2.4), (wx, wy) => {
        const sg = Math.sign(wx * nx + wy * ny) || 1, v = 160 + Math.random() * 90;   // the halves part across the cut, thrown on along the slug's path
        return [nx * sg * v + Math.cos(da) * 380 + (b.vx || 0) * 0.3, ny * sg * v + Math.sin(da) * 380 + (b.vy || 0) * 0.3, sg * (0.8 + Math.random() * 1.2)];
      });
    const L = s * 0.75;
    for (let k = 0; k < (lowQ ? 14 : 40); k++) {   // sparks spraying off both sides of the cut
      const t = (Math.random() - 0.5) * L, px = b.x + Math.cos(da) * t, py = b.y + Math.sin(da) * t;
      const a = da + (Math.random() < 0.5 ? 1.57 : -1.57) + (Math.random() - 0.5) * 0.7, v = 160 + Math.random() * 380;
      puff(px, py, Math.cos(a) * v, Math.sin(a) * v, 0.35 + Math.random() * 0.5, 1 + Math.random(), k % 3 ? "#ffb04a" : "#fff1b8", k % 4 ? 3 : 1, 0.05);   // molten drops and sparks
    }
    meltLines.push({ x1: b.x - Math.cos(da) * L / 2, y1: b.y - Math.sin(da) * L / 2, x2: b.x + Math.cos(da) * L / 2, y2: b.y + Math.sin(da) * L / 2, w: 10 * sz, t: 0, dur: 1.6 });   // the cut glows where it went
    oilSplash(b.x, b.y, 16, 300, Math.cos(da) * 300, Math.sin(da) * 300);
    impacts.push({ x: b.x, y: b.y, t: 0, r: 100 * sz, col: "#fff1d0" });
    impacts.push({ x: b.x, y: b.y, t: 0, r: 200 * sz, col: "255,150,70", dur: 0.9, soft: 0.5, flick: Math.random() * 6.28 });
    rings.push({ x: b.x, y: b.y, t: 0, r: 170 * sz, col: "255,200,150", dur: 0.4, w: 6 });
    smoke(b.x, b.y, lowQ ? 4 : 10, 50, 2);
    sfx("chunk", 1, 0.7, b.x, b.y);
  }
  // laser or lightning: the charge fries it where it is; the charred shell twitches with arcs, then smokes
  function electrocute(b) {
    const sz = sizeOf(b.lv || 1);
    makeHulk(b, true);
    const h = hulks[hulks.length - 1];
    h.burn = performance.now() + 900; h.life = h.max = 5.1;
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
