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
  const rampOf = col => col === "plasma" ? PLASMA_RAMP : col === "demon" ? DEMON_RAMP : FIRE_RAMP;
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
    const key = i * 4 + (v & 3) + (ramp === PLASMA_RAMP ? 64 : ramp === DEMON_RAMP ? 128 : 0);
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
  // ---------- the engine's exhaust: a plume of flame, built afresh ----------
  // As a rocket's: hundreds of small hot gas particles leave each nozzle every second, fast along the jet on top of the
  // bin's own speed, and then live in the world on their own: as the bin turns the plume curls behind it, at speed it
  // stretches out, at rest it stands short and full. Each cools as it goes, from the palette's white-hot core (the bin's
  // tier or the flame it wears) through its middle and outer colours to a dull red, swelling as it cools, and some leave
  // a wisp of smoke. On boost it pours out twice as thick, faster and hotter, and the core turns blue-white
  const plume = [];   // { x, y, vx, vy, t, life, s0, s1, c: [core, mid, outer], boost }
  const plumeCols = new Map();   // a palette's colours as sprite keys (quantized, so a rainbow flame keeps the cache small)
  function plumeColsOf(pal, boost) {
    const q = c => (c[0] >> 4 << 4) + "," + (c[1] >> 4 << 4) + "," + (c[2] >> 4 << 4), key = q(pal.core) + "|" + q(pal.mid) + "|" + q(pal.outer) + (boost ? "b" : "");
    let c = plumeCols.get(key);
    if (!c) { c = [boost ? "rgb(215,235,255)" : `rgb(${q(pal.core)})`, `rgb(${q(pal.core)})`, `rgb(${q(pal.mid)})`, `rgb(${q(pal.outer)})`, "rgb(120,30,14)"];
      c.own = pal !== TIERS[0] && !(pal.outer[0] > 200 && pal.outer[1] < 120 && pal.outer[2] < 80);   // (an orange fire uses real flame; other colours their glow)
      plumeCols.set(key, c); }
    return c;
  }
  function emitPlume(b, dt, boost) {
    if (dt <= 0) return;
    const jets = exhaustJets(b, performance.now()), pal = b.flamePal || tierOf(b.lv || 1), cols = plumeColsOf(pal, boost), q = lowQ ? 0.45 : 1;
    for (const j of jets) {
      if (j.power < 0.05) continue;
      const rate = (j.main ? (boost ? 220 : 100) : 40) * Math.min(1.4, j.power) * q;
      const n = emissionCount(b, j.main ? "plumeMain" : "plumeSide", rate, dt);
      const wid = j.size * (j.main ? 0.22 : 0.1) * Math.sqrt(j.power) * (boost ? 1.25 : 1), speed = (boost ? 1150 : 640) * Math.sqrt(Math.min(1.4, j.power));
      for (let k = 0; k < n; k++) {
        const age = Math.random() * dt, a = j.a + (Math.random() - 0.5) * (boost ? 0.1 : 0.2), sp = speed * (0.8 + Math.random() * 0.4);
        const vx = (b.vx || 0) * 0.85 + Math.cos(a) * sp, vy = (b.vy || 0) * 0.85 + Math.sin(a) * sp;
        plume.push({ x: j.x - (b.vx || 0) * age + vx * age * 0.15, y: j.y - (b.vy || 0) * age + vy * age * 0.15, vx, vy, t: age,
          life: (boost ? 0.3 : 0.2) * (0.7 + Math.random() * 0.6) * (j.main ? 1 : 0.6), s0: wid * 0.35, s1: wid * (boost ? 1.5 : 1.25), c: cols, boost, wob: Math.random() * 6.28 });
      }
    }
    if (plume.length > 2600) plume.splice(0, plume.length - 2600);
  }
  function updatePlume(dt) {
    const drag = Math.exp(-2.6 * dt);
    for (let i = plume.length - 1; i >= 0; i--) {
      const p = plume[i]; p.t += dt;
      if (p.t >= p.life) {
        if (Math.random() < (lowQ ? 0.03 : 0.08)) puff(p.x, p.y, p.vx * 0.15, p.vy * 0.15, 0.7 + Math.random() * 0.6, p.s1 * 0.5, SMOKE_COLS[2], 2, 0, 0, 0.94);   // a wisp of smoke
        plume[i] = plume[plume.length - 1]; plume.pop(); continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= drag; p.vy *= drag;
    }
  }
  // Drawn as fire is: each particle a puff of turbulent flame (the blasts' noise-textured flame), stretched along its
  // flight and turned with it. Young ones are added (light: a blinding jet), older ones laid over (body: an orange and
  // red flame with ragged edges that turns to smoke). A flame the bin wears in its own colours keeps its glow sprites
  function drawPlume() {
    if (!plume.length) return;
    g.save();
    for (const pass of [0, 1]) {   // 0: the cooler body laid over; 1: the hot jet added on top
      g.globalCompositeOperation = pass ? "lighter" : "source-over";
      for (const p of plume) {
        const f = p.t / p.life;
        if ((f < 0.35) !== !!pass) continue;
        const x = sx(p.x), y = sy(p.y), r = (p.s0 + (p.s1 - p.s0) * Math.sqrt(f)) * 1.35;
        if (x < -r * 2 || y < -r * 2 || x > vw + r * 2 || y > vh + r * 2) continue;
        const sp = Math.hypot(p.vx, p.vy), st = Math.min(2.6, 1 + sp / 900), a = Math.atan2(p.vy, p.vx);
        const flick = 0.82 + 0.18 * Math.sin(p.wob + p.t * 45);
        g.save(); g.translate(x, y); g.rotate(a);
        if (p.c.own) {   // (a coloured flame: its glow)
          g.globalAlpha = Math.pow(1 - f, 1.5) * 0.35 * flick; const ci = f < 0.1 ? 0 : f < 0.25 ? 1 : f < 0.5 ? 2 : f < 0.78 ? 3 : 4;
          g.drawImage(dotSprite(p.c[ci]), -r * st, -r, r * 2 * st, r * 2);
        } else {
          // the shade: white-hot at the nozzle (blue-white on boost), then yellow, orange, red, dark
          const shade = Math.min(7, Math.floor(f * 8.5) + (p.boost ? (f < 0.05 ? 0 : 1) : 1)), ramp = p.boost && f < 0.12 ? PLASMA_RAMP : FIRE_RAMP;
          g.globalAlpha = (pass ? (p.boost ? 0.26 : 0.4) * (1 - f / 0.35) : 0.7 * Math.pow(1 - (f - 0.35) / 0.65, 1.2)) * flick;
          g.drawImage(fireSprite(shade, (p.wob * 3) | 0, ramp), -r * st, -r, r * 2 * st, r * 2);
        }
        g.restore();
      }
    }
    g.restore();
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
  // ---------- oil: a bin's blood ----------
  // A hit splashes it out in dark glossy drops; a bin badly hurt leaks it. A drop that lands on a station's deck leaves
  // a stain there (a leaking bin a trail), kept for the round; in space the drops fly on and thin out
  // ---------- brass: a minigun's spent cases ----------
  // thrown out to the right of the gun as it fires, tumbling, clinking off walls; on a deck they skid and lie there for
  // the round (the oldest go once there are too many), in space they drift away
  const casings = [];
  function ejectCasing(x, y, a, vx = 0, vy = 0) {
    const side = a + Math.PI / 2 + (Math.random() - 0.5) * 0.6, v = 160 + Math.random() * 160;
    casings.push({ x: x - Math.cos(a) * 30, y: y - Math.sin(a) * 30, vx: Math.cos(side) * v + vx * 0.6, vy: Math.sin(side) * v + vy * 0.6, a: Math.random() * 6.28, spin: (Math.random() - 0.5) * 40, t: 0, life: stationMap() ? Infinity : 6 });
    if (casings.length > 260) casings.shift();
  }
  function updateCasings(dt) {
    const deck = stationMap(), drag = Math.exp(-(deck ? 3 : 0.1) * dt);
    for (let i = casings.length - 1; i >= 0; i--) {
      const c = casings[i]; c.t += dt;
      if (c.t > c.life) { casings.splice(i, 1); continue; }
      const ox = c.x, oy = c.y;
      c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= drag; c.vy *= drag; c.spin *= Math.exp(-(deck ? 3 : 0.2) * dt); c.a += c.spin * dt;
      if (solidCell(c.x, c.y) && bounceSmall(c, ox, oy, 0.4) && Math.hypot(c.vx, c.vy) > 60 && Math.random() < 0.3) sfx("hit", 0.08, 3.2, c.x, c.y);   // a clink
      if (deck && Math.abs(c.vx) + Math.abs(c.vy) < 4 && c.t > 1.5) {   // lying still on the deck: baked into it
        bakeDecal(c.x, c.y, 6, q => { q.rotate(c.a); q.fillStyle = "#c9962e"; q.fillRect(-3.5, -1.4, 7, 2.8); q.fillStyle = "#ffe08a"; q.fillRect(-3.5, -1.4, 7, 1); q.fillStyle = "#7a5718"; q.fillRect(2.6, -1.6, 1.2, 3.2); });
        casings.splice(i, 1);
      }
    }
  }
  function drawCasings() {
    for (const c of casings) {
      const x = sx(c.x), y = sy(c.y);
      if (!onScreen(x, y, 10)) continue;
      g.save(); g.translate(x, y); g.rotate(c.a); g.globalAlpha = c.life === Infinity ? 1 : Math.min(1, (c.life - c.t) * 2);
      g.fillStyle = "#c9962e"; g.fillRect(-3.5, -1.4, 7, 2.8); g.fillStyle = "#ffe08a"; g.fillRect(-3.5, -1.4, 7, 1); g.fillStyle = "#7a5718"; g.fillRect(2.6, -1.6, 1.2, 3.2);
      g.restore();
    }
    g.globalAlpha = 1;
  }
  // ---------- the Blood Blade's swings: a red crescent sweeping round the bin that swung ----------
  // A swing: SWING_ARC radians swept in SWORD_LIFE seconds, from one side of the aim to the other, the side set by the
  // shot's own number (so every screen and the server swing it alike). The blade reaches BLADE_REACH from the bin
  const SWING_MS = 350, SWING_ARC = 2.5, BLADE_REACH = 165;
  const swingSideOf = s => { let h = 0; for (let i = 0; i < s.id.length; i++) h = h * 31 + s.id.charCodeAt(i) | 0; return h & 1 ? 1 : -1; };
  const swingEase = k => 1 - Math.pow(1 - k, 2.2);
  // where the blade is now: from the bin's edge out to its tip, swept round as the swing goes (owner: the bin swinging)
  function swordSweep(s, owner) {
    const k = Math.min(1, 1 - s.life / SHOTS[K.SWORD].life), a = s.sa - SWING_ARC / 2 * s.side + SWING_ARC * s.side * swingEase(k), r0 = binR(owner.lv || 1) * 0.6;
    s.px = owner.x + Math.cos(a) * r0; s.py = owner.y + Math.sin(a) * r0; s.x = owner.x + Math.cos(a) * BLADE_REACH; s.y = owner.y + Math.sin(a) * BLADE_REACH;
  }
  const slashes = [];
  function swingStart(o, a, side) {
    o.swingSide = side; o.swingAt = performance.now();
    slashes.push({ o, a, side: o.swingSide, t: 0 });
    if (slashes.length > 24) slashes.shift();
    const dist = Math.hypot(o.x - me.x, o.y - me.y);
    if (dist < 1600) bladeSwing(1 - dist / 1600, clamp((o.x - me.x) / 900, -1, 1));
  }
  function updateSlashes(dt) { for (let i = slashes.length - 1; i >= 0; i--) if ((slashes[i].t += dt) > SWING_MS / 1000 + 0.15) slashes.splice(i, 1); }
  function drawSlashes() {
    if (!slashes.length) return;
    g.save(); g.globalCompositeOperation = "lighter";
    for (const sl of slashes) {
      const o = sl.o, x = sx(o.x), y = sy(o.y), R = 150 * sizeOf(o.lv || 1), k = Math.min(1, sl.t / (SWING_MS / 1000)), fade = sl.t < SWING_MS / 1000 ? 1 : 1 - (sl.t - SWING_MS / 1000) / 0.12;
      if (fade <= 0 || !onScreen(x, y, R + 40)) continue;
      const a0 = sl.a - SWING_ARC / 2 * sl.side, a1 = a0 + SWING_ARC * sl.side * swingEase(k);
      // the crescent: a wide band swept from the bin out to the blade's reach, fading toward its tail, with a white-hot
      // leading edge along the blade's tip
      const n = 16, span = a1 - a0;
      g.lineCap = "butt";
      for (let i = 0; i < n; i++) {
        const f0 = i / n, f1 = (i + 1) / n, al = Math.pow(f1, 1.6) * fade;
        g.strokeStyle = `rgba(255,30,50,${0.42 * al})`; g.lineWidth = R * 0.5; g.beginPath(); g.arc(x, y, R * 0.55, a0 + span * f0, a0 + span * f1 + 0.01 * sl.side, sl.side < 0); g.stroke();
        g.strokeStyle = `rgba(255,120,130,${0.6 * al})`; g.lineWidth = R * 0.14; g.beginPath(); g.arc(x, y, R * 0.76, a0 + span * f0, a0 + span * f1 + 0.01 * sl.side, sl.side < 0); g.stroke();
        g.strokeStyle = `rgba(255,240,240,${0.9 * al})`; g.lineWidth = 3; g.beginPath(); g.arc(x, y, R * 0.82, a0 + span * f0, a0 + span * f1 + 0.01 * sl.side, sl.side < 0); g.stroke();
      }
      const ex = x + Math.cos(a1) * R * 0.8, ey = y + Math.sin(a1) * R * 0.8;   // the blade's tip, flaring
      g.globalAlpha = 0.8 * fade; g.drawImage(dotSprite("#ff2a3c"), ex - 40, ey - 40, 80, 80); g.globalAlpha = 1;
    }
    g.restore();
  }
  const oilDrops = [], oilStains = [];
  // a spray as blood sprays: mostly a fine spray of small drops, fast ones flung furthest, a few heavier drops, and
  // a mist hanging a moment where it burst
  function oilSplash(x, y, n, speed, ax = 0, ay = 0) {
    const q = lowQ ? 0.5 : 1;
    for (let i = 0, m = Math.round(n * 2.6 * q); i < m; i++) {
      const fine = Math.random() < 0.82, a = Math.random() * 6.283, v = speed * (fine ? 0.4 + Math.random() * 1.1 : 0.25 + Math.random() * 0.6);
      oilDrops.push({ x, y, vx: Math.cos(a) * v + ax, vy: Math.sin(a) * v + ay, r: fine ? 0.5 + Math.random() * 1.1 : 1.6 + Math.random() * 2.2, life: 0.25 + Math.random() * 0.5, t: 0 });
    }
    for (let i = 0, m = Math.round(Math.min(6, n * 0.4) * q); i < m; i++) {   // the mist
      const a = Math.random() * 6.283, v = 20 + Math.random() * 60;
      puff(x, y, Math.cos(a) * v + ax * 0.3, Math.sin(a) * v + ay * 0.3, 0.5 + Math.random() * 0.5, 3 + Math.random() * 4, "rgb(110,12,20)", 2, 0, 0, 0.9);
    }
    if (oilDrops.length > 900) oilDrops.splice(0, oilDrops.length - 900);
  }
  // ---------- the engine's jet pushes what is behind a bin: smoke, sparks, drops, debris, chunks, cases, wrecks ----------
  // a cone along each main jet, as long as the flame (much longer on boost); the push fades with distance and falls
  // on light things hardest (a hulk barely moves)
  function jetBlast(dt) {
    const bins = [];
    if (playing && !me.dead) bins.push(me);
    for (const r of remotes.values()) if (!r.dead) bins.push(r);
    for (const b of bots) if (!b.dead && !remotes.has(b.id)) bins.push(b);
    for (const b of bins) {
      const boost = b === me ? me.boostFx > 0 : (b.boost || 0) > 0 || b.boosting, th = Math.max(boost ? 1 : 0, b.thrust || 0);
      if (th < 0.2 || Math.abs(b.x - cam.x) > vw || Math.abs(b.y - cam.y) > vh) continue;
      const j = exhaustJets(b, performance.now()).find(o => o.main) || null;
      if (!j) continue;
      const ux = Math.cos(j.a), uy = Math.sin(j.a), L = (boost ? 340 : 170) * sizeOf(b.lv || 1), F = (boost ? 2600 : 900) * Math.min(1.2, th) * dt;
      const push = (o, w) => {
        const dx = o.x - j.x, dy = o.y - j.y, along = dx * ux + dy * uy;
        if (along < 0 || along > L) return;
        const side = Math.abs(-dx * uy + dy * ux);
        if (side > 18 + along * 0.35) return;   // (a cone, widening behind)
        const f = F * (1 - along / L) * w; o.vx += ux * f; o.vy += uy * f;
      };
      for (const p of parts) if (p.k === 2 || p.k === 4 || p.k === 1 || p.k === 5) push(p, p.k === 2 ? 0.8 : 0.5);
      for (const d of oilDrops) push(d, 0.6);
      for (const c of casings) push(c, 1);
      for (const d of debris) push(d, 0.8);
      for (const c of chunks) push(c, Math.min(1, 6 / Math.max(3, c.r)));
      for (const f of frags) push(f, 0.3);
      for (const h of hulks) push(h, 0.08);
    }
  }
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
    if (Math.hypot(b.x - me.x, b.y - me.y) < 1400) sfx("boom_bin", 1, 1, b.x, b.y) || boomSound(0.9, 1400, 0.35);
    shatter(b, n); breakupPops(n);
    oilSplash(b.x, b.y, 34, 480, (b.vx || 0) * 0.3, (b.vy || 0) * 0.3);   // its oil, everywhere
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
    // and a thin smoke behind a working engine, thicker on boost
    const boostOn = b === me ? me.boostFx > 0 : (b.boost || 0) > 0;
    for (let k = 0, m = emissionCount(b, "trailSmoke", (boostOn ? 26 : 7) * (lowQ ? 0.4 : 1) * Math.max(0.1, b.thrust || 0), dt); k < m; k++) {
      const j = jets[0], a = j.a + (Math.random() - 0.5) * 0.5, v = 60 + Math.random() * 80;
      puff(j.x, j.y, Math.cos(a) * v + (b.vx || 0) * 0.3, Math.sin(a) * v + (b.vy || 0) * 0.3, 0.9 + Math.random() * 0.9, 3 + Math.random() * (boostOn ? 6 : 3), boostOn ? SMOKE_COLS[1] : SMOKE_COLS[2], 2, 0, (Math.random() - 0.5) * 0.8, 0.95);
    }
  }

  const FIRE_COLS = ["#fff3b0", "#ffd23f", "#ff9a2e", "#ff5a1f"];
  const afterBlasts = [];   // the smaller blasts that follow a big one, each at its moment (updateFx)
  const scorches = [];      // burns left on a station's deck (drawn with its floor), kept for the round
  // A layered blast, scaled by speed (a rocket is 420) with n setting how rich it is (a rocket is 80):
  //  1. a short white flash, and warm light thrown on everything round it;
  //  2. a fireball of several billowing clouds that cool white, yellow, orange, red as they swell and fade;
  //  3. dark smoke, lit from inside by the fire at first, swelling and turning slowly for 1.5-3 s;
  //  4. sparks and embers slowed by drag, flying on curving paths;
  //  5. a thin bright shock ring;
  //  6. a few hot chips of wreckage.
  //  7. burning chunks flung out, each trailing fire and smoke.
  // pal "plasma": the same blast in energy (the shock orb and its combo): blue-white clouds, cold light, no smoke or chips
  const BLAST_PAL = {
    fire: { cloud: "fire", light: "255,176,96", sparks: SPARK_COLS, ember: "fire", ring: "255,246,230", dust: "rgb(150,138,142)", smoke: true },
    demon: { cloud: "demon", light: "110,255,120", sparks: ["#f2ffd0", "#9dff6a", "#3bff6a"], ember: "demon", ring: "170,255,160", dust: "rgb(60,120,70)", smoke: false },
    plasma: { cloud: "plasma", light: "120,200,255", sparks: ["#ffffff", "#c8f4ff", "#7fdcff"], ember: "plasma", ring: "200,240,255", dust: "rgb(110,160,220)", smoke: false }
  };
  function explode(x, y, n, speed, pal = "fire") {
    const P = BLAST_PAL[pal] || BLAST_PAL.fire;
    const s = speed / 420, ss = Math.sqrt(s), nn = n / 80, q = lowQ ? 0.4 : COARSE ? 0.65 : 1;   // a phone: fewer pieces
    impacts.push({ x, y, t: 0, r: 34 + 50 * s, col: pal === "plasma" ? "#e8fbff" : "#fffbe8", dur: 0.1 });
    impacts.push({ x, y, t: 0, r: 320 * s, col: P.light, dur: 0.4, soft: 0.75 });
    if (n >= 26 && post) { const d = Math.hypot(x - me.x, y - me.y); if (d < 1400) post.kick(Math.min(1, n / 110) * (1 - d / 1400)); }   // the colours split a moment
    if (n >= 26 && pal === "fire") impacts.push({ x, y, t: -0.1, r: 230 * s, col: P.light, dur: 1.4, soft: 0.32, flick: Math.random() * 6.28 });   // the fuel burning on
    for (let k = 0, m = Math.min(40, Math.round((8 + 10 * nn) * q)); k < m; k++) {   // the fireball (or the ball of energy)
      const a = Math.random() * 6.28, rr = Math.random() * 30 * s, v = (60 + Math.random() * 260) * s;
      puff(x + Math.cos(a) * rr, y + Math.sin(a) * rr, Math.cos(a) * v, Math.sin(a) * v, (0.5 + Math.random() * 0.6) * ss,
        (18 + Math.random() * 20) * s, P.cloud, 4, 0, 0, 0.9, (k < 3 ? 0 : 0.12 + Math.random() * 0.25) + (P.smoke ? 0 : 0.25));   // only the first few start white-hot (energy: blue from the start)
    }
    if (P.smoke) for (let k = 0, m = Math.round((6 + 9 * nn) * q); k < m; k++) {   // smoke, lit by the fire inside it at first
      const a = Math.random() * 6.28, rr = Math.random() * 40 * s, v = (30 + Math.random() * 130) * s;
      puff(x + Math.cos(a) * rr, y + Math.sin(a) * rr, Math.cos(a) * v, Math.sin(a) * v, (1.5 + Math.random() * 1.5) * Math.min(1.6, ss),
        (9 + Math.random() * 8) * s, SMOKE_COLS[k % 3], 2, 0, 0, 0.95, 0.6 + Math.random() * 0.4);
    }
    for (let k = 0, m = Math.round((10 + 20 * nn) * q); k < m; k++) {   // sparks
      const a = Math.random() * 6.28, v = (400 + Math.random() * 800) * ss;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.35 + Math.random() * 0.5, 1.4 + Math.random() * 1.2, P.sparks[k % 3], 1, 0.05, (Math.random() - 0.5) * 3, 0.955);
    }
    for (let k = 0, m = Math.round((8 + 16 * nn) * q); k < m; k++) {   // embers
      const a = Math.random() * 6.28, v = (120 + Math.random() * 380) * ss;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.8 + Math.random() * 1.2, 1 + Math.random() * 1.1, P.ember, 5, 0, (Math.random() - 0.5) * 2.5, 0.965);
    }
    // the shock wave: a lens racing out that bends what is behind it, with a bright front (drawBlastFx), and a ring
    // of dust and smoke thrown out with it
    if (n >= 26) rings.push({ x, y, t: 0, r: 260 * s, col: P.ring, dur: 0.38 + 0.12 * ss, w: 3, shock: 26 * ss });   // (a small burst has no wave of its own)
    for (let k = 0, m = Math.round((14 + 10 * nn) * q); k < m; k++) {
      const a = k / m * 6.283 + Math.random() * 0.3, v = (520 + Math.random() * 160) * s;
      puff(x + Math.cos(a) * 12 * s, y + Math.sin(a) * 12 * s, Math.cos(a) * v, Math.sin(a) * v, 0.8 + Math.random() * 0.5, (7 + Math.random() * 5) * s, P.dust, 2, 0, 0, 0.88, P.smoke ? 0.5 : 0);
    }
    for (let k = 0, m = Math.round((5 + 4 * nn) * q); k < m; k++) {   // tongues of flame licking out in the first instant
      const a = Math.random() * 6.28, v = (500 + Math.random() * 500) * ss;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.22 + Math.random() * 0.18, (10 + Math.random() * 8) * s, P.cloud, 6, 0, (Math.random() - 0.5) * 2, 0.9, Math.random() * 0.2);
    }
    if (!P.smoke) return;
    if (n >= 26) {   // the fuel still going up: a few smaller blasts round it a moment later
      for (let k = 0, m = Math.round((2 + Math.random() * 2) * (lowQ ? 0.5 : 1)); k < m; k++) {
        const a = Math.random() * 6.28, d = (40 + Math.random() * 70) * s;
        afterBlasts.push({ at: performance.now() + 100 + Math.random() * 250, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, speed: (140 + Math.random() * 80) * s });
      }
      if (stationMap()) { scorches.push({ x, y, r: (70 + 40 * nn) * s, born: performance.now(), seed: Math.random() * 6.28 }); if (scorches.length > 40) scorches.shift(); }   // a burn on the deck
    }
    for (let k = 0, m = n >= 26 ? Math.round((3 + 3 * nn) * q) : 0; k < m; k++) {   // burning chunks, trailing fire and smoke
      const a = Math.random() * 6.28, v = (280 + Math.random() * 420) * ss;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.9 + Math.random() * 0.9, 2.2 + Math.random() * 1.5, "fire", 8, 0, (Math.random() - 0.5) * 1.6, 0.975);
    }
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

