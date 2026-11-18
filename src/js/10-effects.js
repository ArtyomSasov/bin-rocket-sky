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
  // k: 0 glow dot, 1 spark streak, 2 smoke, 3 hot blob (white to red), 4 fire cloud, 5 ember. curl turns its path into an
  // arc (radians a second), drag is its own slowing per 1/60 s (0: the kind's default), glow lights smoke from inside
  // (and starts a fire cloud cooler)
  function puff(x, y, vx, vy, life, size, col, k = 0, len = 0.035, curl = 0, drag = 0, glow = 0) {
    parts.push({ x, y, vx, vy, life, max: life, size, col, k, len, curl, drag, glow, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 14 });
  }
  // fixed shades, so the sprite caches stay small: a fire cloud cools white, yellow, orange, red, then a dull ember red
  const FIRE_RAMP = ["#ffffff", "#fff3c4", "#ffd66b", "#ffab3d", "#ff7a26", "#e2491c", "#a32c19", "#5c1a16"];
  const SMOKE_COLS = ["rgb(64,57,64)", "rgb(88,79,84)", "rgb(114,103,106)"];
  const SPARK_COLS = ["#fff8e0", "#ffe08a", "#ffb64a"];
  const fireCache = [];
  function fireSprite(i) {   // a soft, lumpy ball of flame in one of the fixed shades
    if (fireCache[i]) return fireCache[i];
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const q = c.getContext("2d"), col = FIRE_RAMP[i];
    q.globalAlpha = 0.55;
    for (let j = 0; j < 6; j++) {
      const a = j * 2.4 + i, x = 32 + Math.cos(a) * 8, y = 32 + Math.sin(a) * 7, r = 15 + (j % 3) * 4;
      const gr = q.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, col); gr.addColorStop(0.35, col); gr.addColorStop(1, "rgba(0,0,0,0)");
      q.fillStyle = gr; q.fillRect(0, 0, 64, 64);
    }
    return fireCache[i] = c;
  }
  const lightCache = new Map();
  function lightSprite(rgb) {   // a wide soft pool of light ("r,g,b"), for a blast lighting what is round it
    let c = lightCache.get(rgb);
    if (c) return c;
    c = document.createElement("canvas"); c.width = c.height = 128;
    const q = c.getContext("2d"), gr = q.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.2, `rgba(${rgb},0.55)`); gr.addColorStop(0.55, `rgba(${rgb},0.15)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    q.fillStyle = gr; q.fillRect(0, 0, 128, 128);
    lightCache.set(rgb, c);
    return c;
  }
  // a shower of long glowing sparks thrown along (nx, ny), with embers and a flash: for hard collisions
  function sparkShower(x, y, nx, ny, power) {
    const n = Math.round((lowQ ? 12 : 34) * power);
    for (let k = 0; k < n; k++) {
      const a = Math.atan2(ny, nx) + (Math.random() - 0.5) * 1.6, v = 380 + Math.random() * 760 * power;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.45 + Math.random() * 0.6, 1.1 + Math.random() * 1.3, k % 4 ? (k % 2 ? "#fff6c8" : "#ffd36b") : "#ff9a2e", 1, 0.05, (Math.random() - 0.5) * 2.4, 0.95);
    }
    for (let k = 0; k < n / 2; k++) {   // embers that wander off on curving paths, cooling as they go
      const a = Math.random() * 6.28, v = 60 + Math.random() * 220;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.8 + Math.random() * 0.8, 0.8 + Math.random() * 0.7, "#ffb43c", 5, 0, (Math.random() - 0.5) * 3, 0.965);
    }
    impacts.push({ x, y, t: 0, r: 40 + power * 30, col: "#fff2c0", dur: 0.12 });
    impacts.push({ x, y, t: 0, r: 120 + power * 80, col: "255,190,110", dur: 0.25, soft: 0.35 });
  }
  const impacts = [];   // short bright flashes where something hits
  const debris = [];    // wreckage of destroyed bins, drifting through space for a while
  // something falls into the black hole: a streak of its colour spiralling into the horizon and a purple flicker
  function swallowFx(x, y, bh, col) {
    if (!onScreen(sx(x), sy(y), 200)) return;
    const dx = bh.x - x, dy = bh.y - y, d = Math.hypot(dx, dy) || 1;
    for (let k = 0; k < (lowQ ? 4 : 10); k++) {
      const v = 200 + Math.random() * 400, sw = (Math.random() - 0.3) * 0.9;
      puff(x, y, (dx / d - dy / d * sw) * v, (dy / d + dx / d * sw) * v, 0.4 + Math.random() * 0.4, 1.6 + Math.random() * 2.4, k % 3 ? col : "#c38bff", 1, 0.05);
    }
    impacts.push({ x, y, t: 0, r: 40, col: "#c38bff" });
  }
  function addDebris(x, y, vx, vy, size, col, life = Infinity) {   // default: stays until the round ends
    const shape = Array.from({ length: 6 }, () => 0.55 + Math.random() * 0.5);
    debris.push({ x, y, vx, vy, size, col, shape, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 3, life, max: life, born: performance.now() });
    if (debris.length > 220) debris.shift();
  }
  const rings = [];     // expanding shock rings
  // metal-on-metal: a flash plus a spray of bright streaks
  // a hit: a small white-hot flash and short bright streaks that die fast, a few embers
  function impact(x, y, col, power) {
    impacts.push({ x, y, t: 0, r: 14 + power * 16, col, dur: 0.1 });
    const n = (lowQ ? 4 : 8) + power * (lowQ ? 2 : 6);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.28, v = 420 + Math.random() * 560 * Math.sqrt(power);
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.08 + Math.random() * 0.2, 0.8 + Math.random() * 0.9, k % 3 ? (k % 2 ? "#ffffff" : "#fff3c8") : col, 1, 0.022, 0, 0.9);
    }
    for (let k = 0; k < (lowQ ? 1 : 2 + power); k++) {
      const a = Math.random() * 6.28, v = 80 + Math.random() * 200;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.3 + Math.random() * 0.4, 0.7 + Math.random() * 0.5, "#ffc860", 5, 0, (Math.random() - 0.5) * 4, 0.95);
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
  function makeHulk(b, zap, quiet) {
    const life = Infinity;   // stays until the round ends
    hulks.push({ x: b.x, y: b.y, vx: (b.vx || 0) * 0.5 + (Math.random() - 0.5) * 60, vy: (b.vy || 0) * 0.5 + (Math.random() - 0.5) * 60,
                 a: b.a, spin: (Math.random() - 0.5) * (zap ? 0.6 : 1.6), lv: b.lv || 1, ck: b.ck, life, max: life, born: performance.now(), zap: !!zap });
    if (hulks.length > 30) hulks.shift();
    if (zap || quiet) return;
    rings.push({ x: b.x, y: b.y, t: 0, r: 140, col: "255,200,160", warp: true, w: 4, dur: 0.4 });
    explode(b.x, b.y, 30, 240);
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
    return [bh === null ? "#4fd6c8" : toneCss(bh, 65, 55), lh === null ? "#9d8fc8" : toneCss(lh, 45, 60)];
  };
  // One geometry for hull, flame and emitted particles: fixed thruster mounts follow banking.
  function binPose(b, now) {
    const thrust = clamp(b.thrust || 0, 0, 1.4);
    return { a: b.a + Math.PI / 2 - SPRITE_TILT + Math.sin(now / 300 + b.x * 0.01) * 0.018 + (b.bank || 0) * 0.35,
      scaleX: 1 - Math.abs(b.bank || 0) * 0.3,
      s: BOT * sizeOf(b.lv || 1) * (1 + Math.sin(now / 85 + (b.hue || 0)) * 0.005 * thrust) };
  }
  function exhaustJets(b, now) {
    const p = binPose(b, now), thrust = clamp(Math.max(b.boostFx === 2 || b.boost === 2 ? 1 : 0, b.thrust || 0), 0, 1.4), delta = angD(thrustAngle(b) - b.a);
    const ca = Math.cos(p.a), sa = Math.sin(p.a), jets = [];
    const add = (lx, ly, a, power, main) => {
      const dx = Math.cos(a) * p.scaleX, dy = Math.sin(a);
      jets.push({ x: b.x + ca * lx * p.scaleX - sa * ly, y: b.y + sa * lx * p.scaleX + ca * ly,
        a: p.a + Math.atan2(dy, dx), power, main, size: p.s });
    };
    const gimbal = clamp(delta * 0.18, -0.22, 0.22);
    add(NOZZLE[0] * p.s, NOZZLE[1] * p.s, SPRITE_TILT + Math.PI / 2 + gimbal,
      Math.max(0.035, thrust * Math.max(0, Math.cos(delta))), true);
    // Front and two flank jets stay bolted to the hull, instead of sliding around its rim.
    for (const [dir, power] of [[Math.PI, -Math.cos(delta)], [Math.PI / 2, Math.sin(delta)], [-Math.PI / 2, -Math.sin(delta)]]) {
      if (power * thrust <= 0.025) continue;
      const a = dir + Math.PI / 2 + SPRITE_TILT;
      add(Math.cos(a) * p.s * 0.34, Math.sin(a) * p.s * 0.34, a, power * thrust, false);
    }
    return jets;
  }
  function emissionCount(b, slot, rate, dt) {
    const budget = (b[slot] || 0) + rate * Math.min(0.1, Math.max(0, dt));
    const n = Math.floor(budget); b[slot] = budget - n; return n;
  }
  // Cached billowing smoke, shaded lobes rather than perfectly round glow dots.
  const smokeCache = new Map();
  function smokeSprite(col) {
    if (smokeCache.has(col)) return smokeCache.get(col);
    const c = document.createElement("canvas"); c.width = c.height = 96;
    const q = c.getContext("2d");
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4, x = 48 + Math.cos(a) * 16, y = 48 + Math.sin(a) * 13, r = 22 + i % 3 * 3;
      const gr = q.createRadialGradient(x - 5, y - 6, 0, x, y, r);
      gr.addColorStop(0, col); gr.addColorStop(0.4, col); gr.addColorStop(1, "rgba(25,22,32,0)");
      q.fillStyle = gr; q.globalAlpha = 0.42; q.fillRect(0, 0, 96, 96);
    }
    smokeCache.set(col, c); return c;
  }
  // boost: a dense jet of fire out of the nozzle
  // which way a pilot is pushing (ta), or where it faces when that isn't known: exhaust always comes out the
  // other side, so flying backwards or sideways fires the jets on the front or the flank
  function thrustAngle(b) { return Number.isFinite(b.tdir) ? b.tdir : b.a; }   // tdir: the push (b.ta is a remote's facing target)
  function afterburner(b, fx, dt) {
    if (!fx || dt <= 0) return;
    const jets = exhaustJets(b, performance.now()), q = lowQ ? 0.35 : 1;
    for (let k = 0, n = emissionCount(b, "boostParticles", (fx === 2 ? 145 : 100) * q, dt); k < n; k++) {
      const j = jets[k % jets.length]; if (j.power < 0.05) continue;
      const a = j.a + (Math.random() - 0.5) * 0.22, speed = (300 + Math.random() * 430) * j.power;
      const age = Math.random() * dt; // spread along the moving nozzle's path, even at low FPS
      puff(j.x - (b.vx || 0) * age, j.y - (b.vy || 0) * age,
        Math.cos(a) * speed + (b.vx || 0) * 0.7, Math.sin(a) * speed + (b.vy || 0) * 0.7,
        0.16 + Math.random() * 0.22, (2 + Math.random() * 3) * sizeOf(b.lv || 1), "#ffd23f", k % 5 === 0 ? 1 : 3);
    }
  }
  // dash: a flash and a hot ring at the nozzle, sparks thrown back
  function dashBurst(b) {
    const jet = exhaustJets({ ...b, thrust: Math.max(1, b.thrust || 0) }, performance.now()).sort((a, b) => b.power - a.power)[0];
    const A = jet.a - Math.PI, sz = sizeOf(b.lv || 1), tx = jet.x, ty = jet.y;
    impacts.push({ x: tx, y: ty, t: 0, r: 90 * sz, col: "#ffd23f" });
    rings.push({ x: tx, y: ty, t: 0, r: 110 * sz, col: "255,220,160", dur: 0.35, w: 8 });
    for (let k = 0; k < (lowQ ? 12 : 30); k++) {
      const a = A + Math.PI + (Math.random() - 0.5) * 0.9, v = 400 + Math.random() * 500;
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
    for (const b of rubble) {   // loose rock too: a lighter piece flies further, a push off its centre spins it
      if (b.dead) continue;
      const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy);
      if (d < 1 || d > r + b.rr) continue;
      const f = power * Math.max(0, 1 - Math.max(0, d - b.rr * 0.5) / r) * Math.min(1.2, 6 / Math.sqrt(Math.max(1, b.mass)));
      b.vx += dx / d * f; b.vy += dy / d * f; b.va += (hash(Math.round(b.x), Math.round(b.y), 3) - 0.5) * f / 150;
      b.hotUntil = Math.max(b.hotUntil || 0, performance.now() + 500);
    }
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
    // the fuel goes up: the layered blast, a second puff of fire a beat later off to one side, the view warping
    explode(b.x, b.y, 110, 400 * Math.sqrt(sz));
    rings.push({ x: b.x, y: b.y, t: 0, r: 230 * sz, col: "255,220,170", warp: true, w: 5, dur: 0.5 });
    const a2 = Math.random() * 6.28;
    for (let k = 0; k < 8 * q; k++) {
      const a = Math.random() * 6.28, v = 30 + Math.random() * 90;
      puff(b.x + Math.cos(a2) * 26 * sz, b.y + Math.sin(a2) * 26 * sz, Math.cos(a) * v, Math.sin(a) * v, 0.7 + Math.random() * 0.5, (14 + Math.random() * 10) * sz, FIRE_RAMP[0], 4, 0, 0, 0.9, 0.15 + Math.random() * 0.2);
    }
    if (Math.hypot(b.x - me.x, b.y - me.y) < 1400) sfx("boom_bin", 1, 1, b.x, b.y) || boomSound(0.9, 1400, 0.35);
    shatter(b, n);
    for (let k = 0; k < (lowQ ? 3 : 6); k++) {
      const a = Math.random() * 6.28, v = 60 + Math.random() * 200;
      addDebris(b.x, b.y, Math.cos(a) * v + (b.vx || 0) * 0.3, Math.sin(a) * v + (b.vy || 0) * 0.3, (4 + Math.random() * 7) * sz, k % 3 ? bodyCol : lidCol);
    }
  }
  // ---------- how a bin dies depends on what got it ----------
  // how a bin dies follows what killed it: 0 blown up (a blast: in pieces; anything else may leave a hulk), 1 cut
  // clean by a rail, 2 fried by electricity, 3 melted by plasma, 4 nailed (it flies on along the nail and is pinned to
  // the rock it meets), 5 burnt (it burns, chars and crumbles to ash), 6 sawn into four by a blade
  const DEATH_KINDS = 6;
  const deathStyleOf = kind => kind === K.RAIL || kind === K.GAUSS ? 1
    : kind === K.LASER || kind === K.BOLT || kind === K.GAMMA || kind === K.SHOCK || kind === K.PULSE ? 2 : kind === K.ORB ? 3
    : kind === K.NAIL || kind === K.SPIKE ? 4 : kind === K.FIRE ? 5 : kind === K.SAW || kind === K.MELEE ? 6 : 0;
  // pieces for a blast (2-4), a hulk sometimes for the rest
  const BLASTS = new Set([K.ROCKET, K.HROCKET, K.GREN, K.MINE, K.NUKE, K.HOLY, K.FLAK, K.SHARD, K.PELLET, K.SLUG, K.TFRAG]);
  const deathPiecesOf = kind => BLASTS.has(kind) ? 3 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 4);
  function deathFx(b, ds, dk, da) {
    b = { ...b, ck: teamCk(b) };   // the wreck keeps the colours the bin flew in
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
    packPlay("p_hit_nail", 0.9, b.x, b.y) || sfx("hit", 0.7, 1.6, b.x, b.y);
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
    packPlay("p_melee_hit", 1, b.x, b.y) || sfx("hit", 0.8, 0.8, b.x, b.y);
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
  function trailFrom(b, rate, dt) {
    const n = emissionCount(b, "trailParticles", rate * (lowQ ? 18 : 42) * Math.max(0.08, b.thrust || 0), dt);
    const jets = exhaustJets(b, performance.now());
    const tr = b.ck ? customVal(b.ck, "trail") : null, trailCols = tr ? TRAILS[tr] : TRAIL;
    for (let k = 0; k < n; k++) {
      const j = jets[k % jets.length], age = Math.random() * dt;
      puff(j.x - (b.vx || 0) * age, j.y - (b.vy || 0) * age,
        Math.cos(j.a) * 100 + (b.vx || 0) * 0.65, Math.sin(j.a) * 100 + (b.vy || 0) * 0.65,
        0.25 + Math.random() * 0.45, 1 + Math.random() * 1.5, trailCols[k % trailCols.length]);
    }
  }

  const FIRE_COLS = ["#fff3b0", "#ffd23f", "#ff9a2e", "#ff5a1f"];
  // A layered blast, scaled by speed (a rocket is 420) with n setting how rich it is (a rocket is 80):
  //  1. a short white flash, and warm light thrown on everything round it;
  //  2. a fireball of several billowing clouds that cool white, yellow, orange, red as they swell and fade;
  //  3. dark smoke, lit from inside by the fire at first, swelling and turning slowly for 1.5-3 s;
  //  4. sparks and embers slowed by drag, flying on curving paths;
  //  5. a thin bright shock ring;
  //  6. a few hot chips of wreckage.
  function explode(x, y, n, speed) {
    const s = speed / 420, ss = Math.sqrt(s), nn = n / 80, q = lowQ ? 0.4 : COARSE ? 0.65 : 1;   // a phone: fewer pieces
    impacts.push({ x, y, t: 0, r: 34 + 50 * s, col: "#fffbe8", dur: 0.1 });
    impacts.push({ x, y, t: 0, r: 320 * s, col: "255,176,96", dur: 0.4, soft: 0.75 });
    for (let k = 0, m = Math.min(40, Math.round((8 + 10 * nn) * q)); k < m; k++) {   // the fireball
      const a = Math.random() * 6.28, rr = Math.random() * 30 * s, v = (60 + Math.random() * 260) * s;
      puff(x + Math.cos(a) * rr, y + Math.sin(a) * rr, Math.cos(a) * v, Math.sin(a) * v, (0.5 + Math.random() * 0.6) * ss,
        (18 + Math.random() * 20) * s, FIRE_RAMP[0], 4, 0, 0, 0.9, k < 3 ? 0 : Math.random() * 0.25);
    }
    for (let k = 0, m = Math.round((6 + 9 * nn) * q); k < m; k++) {   // smoke, lit by the fire inside it at first
      const a = Math.random() * 6.28, rr = Math.random() * 40 * s, v = (30 + Math.random() * 130) * s;
      puff(x + Math.cos(a) * rr, y + Math.sin(a) * rr, Math.cos(a) * v, Math.sin(a) * v, (1.5 + Math.random() * 1.5) * Math.min(1.6, ss),
        (9 + Math.random() * 8) * s, SMOKE_COLS[k % 3], 2, 0, 0, 0.95, 0.6 + Math.random() * 0.4);
    }
    for (let k = 0, m = Math.round((10 + 20 * nn) * q); k < m; k++) {   // sparks
      const a = Math.random() * 6.28, v = (400 + Math.random() * 800) * ss;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.35 + Math.random() * 0.5, 1.4 + Math.random() * 1.2, SPARK_COLS[k % 3], 1, 0.05, (Math.random() - 0.5) * 3, 0.955);
    }
    for (let k = 0, m = Math.round((8 + 16 * nn) * q); k < m; k++) {   // embers
      const a = Math.random() * 6.28, v = (120 + Math.random() * 380) * ss;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.8 + Math.random() * 1.2, 1 + Math.random() * 1.1, FIRE_RAMP[2], 5, 0, (Math.random() - 0.5) * 2.5, 0.965);
    }
    rings.push({ x, y, t: 0, r: 150 * s, col: "255,244,225", dur: 0.2 + 0.1 * ss, w: 3 });
    if (n >= 26) for (let k = 0, m = Math.round((2 + 3 * nn) * q); k < m; k++) {
      const a = Math.random() * 6.28, v = (100 + Math.random() * 260) * ss;
      addDebris(x, y, Math.cos(a) * v, Math.sin(a) * v, 1.5 + Math.random() * 2.5, k % 2 ? "#3a3036" : "#5a4a44", 2.5 + Math.random() * 2);
    }
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

