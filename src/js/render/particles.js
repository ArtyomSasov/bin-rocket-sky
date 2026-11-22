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
  // a finished particle goes back to a pool and the next puff takes it again: a big blast makes hundreds, and making
  // new objects for each would hand the garbage collector work that shows as a stutter mid-fight
  const partPool = [];
  function puff(x, y, vx, vy, life, size, col, k = 0, len = 0.035, curl = 0, drag = 0, glow = 0) {
    const p = partPool.pop() || {};
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.col = col; p.k = k; p.len = len;
    p.curl = curl; p.drag = drag; p.glow = glow; p.rot = Math.random() * 6.28; p.vr = (Math.random() - 0.5) * 14;
    parts.push(p);
  }
  const freePart = p => { if (partPool.length < 3000) partPool.push(p); };
  // fixed shades, so the sprite caches stay small: a fire cloud cools white, yellow, orange, red, then a dull ember red
  const FIRE_RAMP = ["#ffffff", "#fff3c4", "#ffd66b", "#ffab3d", "#ff7a26", "#e2491c", "#a32c19", "#5c1a16"];
  const SMOKE_COLS = ["rgb(64,57,64)", "rgb(88,79,84)", "rgb(114,103,106)"];
  // energy (the shock orb, its combo): white-hot to electric blue to deep violet, no fire at all
  const PLASMA_RAMP = ["#ffffff", "#e8fbff", "#bdf0ff", "#86dcff", "#57b8ff", "#4a82f0", "#4a4fc8", "#2a2470"];
  // hellfire (the demonic orb): white-hot to acid green to a deep poisoned dark
  const DEMON_RAMP = ["#ffffff", "#f2ffd0", "#c8ff7a", "#7dff5a", "#38e04a", "#1f9e3a", "#105a2a", "#062a16"];
  // the demonic orb's burst: white-hot to blood red to black
  const HELL_RAMP = ["#ffffff", "#ffd8c8", "#ff8a6a", "#ff3a2a", "#c8101e", "#7a0614", "#3a0208", "#120004"];
  const rampOf = col => col === "plasma" ? PLASMA_RAMP : col === "demon" ? DEMON_RAMP : col === "hell" ? HELL_RAMP : FIRE_RAMP;
  const SPARK_COLS = ["#fff8e0", "#ffe08a", "#ffb64a"];
  // turbulent value noise (fractal, four octaves), for the inner texture of fire and smoke: billows, not smooth blobs
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const h = (a, b) => hash(a, b, s);
    return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
  }
  const fbm = (x, y, s) => (vnoise(x, y, s) * 0.5 + vnoise(x * 2.1, y * 2.1, s + 1) * 0.25 + vnoise(x * 4.3, y * 4.3, s + 2) * 0.15 + vnoise(x * 8.7, y * 8.7, s + 3) * 0.1);
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const fireCache = [];
  // a billowing ball of flame in one of the fixed shades (four shapes each): ragged turbulent edges, brighter where
  // it is thick, so a fireball reads as rolling fire rather than round glows. Made once, when first needed
  function fireSprite(i, v = 0, ramp = FIRE_RAMP) {
    const key = i * 4 + (v & 3) + (ramp === PLASMA_RAMP ? 64 : ramp === DEMON_RAMP ? 128 : ramp === HELL_RAMP ? 192 : 0);
    if (fireCache[key]) return fireCache[key];
    const S = 96, c = document.createElement("canvas"); c.width = c.height = S;
    const q = c.getContext("2d"), img = q.createImageData(S, S), [r0, g0, b0] = hex(ramp[i]), [r1, g1, b1] = hex(ramp[Math.max(0, i - 2)]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x / S - 0.5, dy = y / S - 0.5, d = Math.hypot(dx, dy) * 2, n = fbm(x / S * 5 + v * 7.3, y / S * 5 + v * 3.1, 50 + v);
      const dens = Math.max(0, Math.min(1, (1 - d * 1.05) * 1.6 + (n - 0.5) * 1.5));
      if (dens <= 0) continue;
      const hot = Math.max(0, Math.min(1, dens * 1.3 - 0.35 + (n - 0.5) * 0.6)), o = (y * S + x) * 4;   // thick parts glow hotter
      img.data[o] = r0 + (r1 - r0) * hot; img.data[o + 1] = g0 + (g1 - g0) * hot; img.data[o + 2] = b0 + (b1 - b0) * hot;
      img.data[o + 3] = 255 * dens * dens * (3 - 2 * dens);
    }
    q.putImageData(img, 0, 0);
    return fireCache[key] = c;
  }
  // the grain inside smoke: a mask of thicker and thinner wisps, cut into every smoke sprite
  let smokeMask = null;
  function smokeGrain() {
    if (smokeMask) return smokeMask;
    const S = 96, c = document.createElement("canvas"); c.width = c.height = S;
    const q = c.getContext("2d"), img = q.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const o = (y * S + x) * 4, n = fbm(x / S * 4, y / S * 4, 77); img.data[o + 3] = 255 * Math.max(0, Math.min(1, 0.25 + n * 1.1)); }
    q.putImageData(img, 0, 0);
    return smokeMask = c;
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
  // a bin's silhouette lit from one side: white (or a colour) fading across it from the side at angle a, for a sheen
  // that stays put as the bin turns, or the glow its engines throw on its stern. Cached by tint, side (16 steps), colour
  const litCache = new Map();
  function litBody(ck, a, col) {
    const step = Math.round(((a % 6.2832) + 6.2832) % 6.2832 / 6.2832 * 16) % 16, key = ck.join(",") + "|" + (ck.team ?? "") + "|" + step + "|" + col;
    let c = litCache.get(key);
    if (c) return c;
    const src = whiteBody(ck); c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
    const x = c.getContext("2d"), w = c.width, h = c.height, aa = step / 16 * 6.2832, dx = Math.cos(aa) * w / 2, dy = Math.sin(aa) * h / 2;
    x.drawImage(src, 0, 0); x.globalCompositeOperation = "source-in";
    const gr = x.createLinearGradient(w / 2 + dx, h / 2 + dy, w / 2 - dx * 0.2, h / 2 - dy * 0.2);
    gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    if (litCache.size > 400) litCache.clear();
    litCache.set(key, c);
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
    q.globalAlpha = 1; q.globalCompositeOperation = "destination-in"; q.drawImage(smokeGrain(), 0, 0);   // wisps, not a smooth ball
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
