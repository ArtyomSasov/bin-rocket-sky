  // ---------- draw ----------
  function sx(x) { return vw / 2 + wrapD(x - cam.x, W); }
  function sy(y) { return vh / 2 + wrapD(y - cam.y, H); }
  function onScreen(x, y, m) { return x > -m && x < vw + m && y > -m && y < vh + m; }

  // live background: everything drifts on its own (not only when you move), stars twinkle one by one,
  // shooting stars cross the sky, the moon orbits, the galaxy turns
  const TWINKLE = Array.from({ length: 70 }, (_, i) => ({ x: hash(i, 1, 66), y: hash(i, 2, 66), r: 0.8 + hash(i, 3, 66) * 1.8, ph: hash(i, 4, 66) * 6.28, sp: 0.6 + hash(i, 5, 66) * 2.2, col: ["#ffffff", "#cfe3ff", "#ffe9c4", "#ffd0f0"][i % 4] }));
  const comets = [];
  let nextComet = 0, lastSky = 0;
  // the sky's base colour and its dark edges, painted once per screen size
  let skyBase = null, skyEdge = null;
  function skyLayers() {
    const W2 = Math.ceil(innerWidth), H2 = Math.ceil(innerHeight);   // window pixels: zooming the view doesn't rebuild them
    if (skyBase && skyBase.width === W2 && skyBase.height === H2) return;
    const vw = W2, vh = H2;
    const mk = () => { const c = document.createElement("canvas"); c.width = W2; c.height = H2; return c; };
    skyBase = mk(); skyEdge = mk();
    let q = skyBase.getContext("2d");
    const gr = q.createLinearGradient(0, 0, vw * 0.3, vh);   // deep space: nearly black, a touch of blue and violet
    gr.addColorStop(0, "#010208"); gr.addColorStop(0.55, "#04061a"); gr.addColorStop(1, "#0a0619");
    q.fillStyle = gr; q.fillRect(0, 0, vw, vh);
    q = skyEdge.getContext("2d");
    const vg = q.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
    vg.addColorStop(0, "rgba(0,0,6,0)"); vg.addColorStop(1, "rgba(0,0,6,0.65)");
    q.fillStyle = vg; q.fillRect(0, 0, vw, vh);
  }
  // the sky is soft and far away: on a sharp (retina) screen it is painted at 1x into its own canvas and stretched,
  // a quarter of the pixels for the layers that cover the whole screen
  const skyCv = document.createElement("canvas"), skyQ = skyCv.getContext("2d", { alpha: false });
  function drawSky(now) {
    if (stationMap()) { drawFoundry(now); return; }
    if (dpr <= 1.05) { paintSky(now); return; }
    const w = Math.ceil(innerWidth), h = Math.ceil(innerHeight);
    if (skyCv.width !== w || skyCv.height !== h) { skyCv.width = w; skyCv.height = h; }
    skyQ.setTransform(zoom, 0, 0, zoom, 0, 0);
    const main = g; g = skyQ;
    try { paintSky(now); } finally { g = main; }
    g.drawImage(skyCv, 0, 0, vw, vh);
  }
  function paintSky(now) {
    const t = now / 1000, sdt = Math.min(0.05, (now - lastSky) / 1000); lastSky = now;
    skyLayers();
    g.drawImage(skyBase, 0, 0, vw, vh);
    const tile = (img, size, par, dx, dy) => {
      const ox = -mod(cam.x * par + dx, size), oy = -mod(cam.y * par + dy, size);
      for (let x = ox; x < vw; x += size) for (let y = oy; y < vh; y += size) g.drawImage(img, x, y);
    };
    // landmarks: the Milky Way, far galaxies, nebulae and gas giants, each at its own spot, sliding by with parallax
    for (const L of sky) {
      if (lowQ && L.img === NEB_ART[2]) continue;
      const x = vw / 2 + (L.x - cam.x) * L.par, y = vh / 2 + (L.y - cam.y) * L.par, half = Math.hypot(L.img.width, L.img.height) * L.sc / 2;
      if (!onScreen(x, y, half)) continue;
      g.globalCompositeOperation = L.glow ? "lighter" : "source-over"; g.globalAlpha = L.a;
      g.save(); g.translate(x, y); g.rotate(L.rot + (L.spin || 0) * t); g.scale(L.sc, L.sc);
      g.drawImage(L.img, -L.img.width / 2, -L.img.height / 2);
      g.restore();
    }
    g.globalCompositeOperation = "source-over";
    // bright stars as a layer, plus single stars that each twinkle on their own beat
    g.globalAlpha = 0.7 + 0.15 * Math.sin(t * 1.1);
    tile(brightStars, STAR_TILE, 0.45, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "lighter";
    if (!lowQ) for (const st of TWINKLE) {
      const x = mod(st.x * 2400 - cam.x * 0.35, vw + 200) - 100, y = mod(st.y * 1600 - cam.y * 0.35, vh + 200) - 100;
      const a = Math.max(0, Math.sin(t * st.sp + st.ph));
      if (a < 0.05) continue;
      g.globalAlpha = a;
      const d = st.r * 6;
      g.drawImage(dotSprite(st.col), x - d / 2, y - d / 2, d, d);
      if (st.r > 2.2) { g.fillStyle = st.col; g.fillRect(x - st.r * 5 * a, y - 0.5, st.r * 10 * a, 1); g.fillRect(x - 0.5, y - st.r * 5 * a, 1, st.r * 10 * a); }
    }
    // shooting stars
    if (now > nextComet) {
      nextComet = now + 1800 + Math.random() * 3500;
      const a = 0.35 + Math.random() * 0.5, v = 900 + Math.random() * 700;
      comets.push({ x: Math.random() * vw * 0.8, y: -40 + Math.random() * vh * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.2 });
    }
    for (let i = comets.length - 1; i >= 0; i--) {
      const c = comets[i];
      c.life -= sdt; c.x += c.vx * sdt; c.y += c.vy * sdt;
      if (c.life <= 0) { comets.splice(i, 1); continue; }
      const L = 0.16, al = Math.min(1, c.life * 2);
      const cg = g.createLinearGradient(c.x, c.y, c.x - c.vx * L, c.y - c.vy * L);
      cg.addColorStop(0, `rgba(255,255,255,${al})`); cg.addColorStop(0.3, `rgba(190,220,255,${0.5 * al})`); cg.addColorStop(1, "rgba(150,180,255,0)");
      g.globalAlpha = 1; g.strokeStyle = cg; g.lineWidth = 2.2; g.lineCap = "round";
      g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(c.x - c.vx * L, c.y - c.vy * L); g.stroke();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    // dust layers (pre-rendered tiles, gently twinkling as a whole)
    for (const d of lowQ ? DUST.slice(0, 1) : DUST) {
      const bx = -mod(cam.x * d.par, d.tile), by = -mod(cam.y * d.par, d.tile);
      g.globalAlpha = 0.75 + 0.25 * Math.sin(now / 700 + d.par * 9);
      for (let tx = bx; tx < vw; tx += d.tile) for (let ty = by; ty < vh; ty += d.tile) g.drawImage(d.c, tx, ty);
    }
    g.globalAlpha = 1;
    g.drawImage(skyEdge, 0, 0, vw, vh);
  }

  function drawSpark(x, y, r, gold, now, appear) {
    const k = Math.min(1, appear * 25);
    const rr = r * k * (1 + 0.12 * Math.sin(now / 160 + x));
    const glow = g.createRadialGradient(x, y, 0, x, y, rr * 3);
    glow.addColorStop(0, gold ? "rgba(255,210,100,0.55)" : "rgba(255,235,255,0.5)");
    glow.addColorStop(1, "rgba(255,220,255,0)");
    if (!lowQ) { g.fillStyle = glow; g.beginPath(); g.arc(x, y, rr * 3, 0, 6.29); g.fill(); }
    g.save(); g.translate(x, y); g.rotate(now / 900 + x);
    g.fillStyle = gold ? "#ffd36b" : "#ffffff";
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, l = i % 2 ? rr * 0.35 : rr;
      g.lineTo(Math.cos(a) * l, Math.sin(a) * l);
    }
    g.closePath(); g.fill(); g.restore();
  }

  // arena edge: darker void outside, pulsing neon fence on the line
  function drawWalls(now) {
    const x0 = sx(0), y0 = sy(0), x1 = sx(W), y1 = sy(H);
    g.fillStyle = "rgba(10,6,24,0.72)";
    if (x0 > 0) g.fillRect(0, 0, x0, vh);
    if (x1 < vw) g.fillRect(x1, 0, vw - x1, vh);
    if (y0 > 0) g.fillRect(Math.max(0, x0), 0, Math.min(vw, x1) - Math.max(0, x0), y0);
    if (y1 < vh) g.fillRect(Math.max(0, x0), y1, Math.min(vw, x1) - Math.max(0, x0), vh - y1);
    const pulse = 0.65 + 0.35 * Math.sin(now / 250);
    g.save();
    g.lineJoin = "round";
    g.strokeStyle = `rgba(255,111,216,${0.25 * pulse})`; g.lineWidth = 18; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.strokeStyle = `rgba(189,255,246,${0.9 * pulse})`; g.lineWidth = 3;
    g.setLineDash([26, 14]); g.lineDashOffset = -now / 30;
    g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.restore();
  }

  function drawRock(k, x, y) {
    const wear = Math.min(1, (rockWear.get(k.key) || 0) / rockHp(k));
    g.save(); g.translate(x, y); g.rotate(k.spin); g.scale(1 - wear * 0.35, 1 - wear * 0.35);
    g.globalAlpha = Math.min(1, k.age / 0.6);
    const gr = g.createLinearGradient(-k.r, -k.r, k.r, k.r);
    gr.addColorStop(0, "#8a76ad"); gr.addColorStop(1, "#3b2d5c");
    g.fillStyle = gr; g.strokeStyle = "rgba(230,210,255,0.35)"; g.lineWidth = 2;
    g.beginPath();
    for (let v = 0; v < 10; v++) {
      const a = v / 10 * 6.283, rr = k.r * (0.75 + hash(k.seed, v, 31) * 0.35);
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "rgba(30,20,55,0.45)";
    for (let c = 0; c < 3; c++) {
      g.beginPath();
      g.arc((hash(k.seed, c, 32) - .5) * k.r, (hash(k.seed, c, 33) - .5) * k.r, k.r * (0.12 + hash(k.seed, c, 34) * 0.12), 0, 6.29);
      g.fill();
    }
    if (wear > 0) {   // cracks spreading from the middle as it wears down
      g.strokeStyle = `rgba(20,12,40,${0.4 + wear * 0.4})`; g.lineWidth = 1.5;
      for (let c = 0; c < Math.ceil(wear * 5); c++) {
        const a = hash(k.seed, c, 35) * 6.283; g.beginPath(); g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * k.r * 0.5, Math.sin(a) * k.r * 0.5); g.lineTo(Math.cos(a + 0.3) * k.r * 0.85, Math.sin(a + 0.3) * k.r * 0.85); g.stroke();
      }
    }
    g.restore(); g.globalAlpha = 1;
  }

  // the demonic orb: a round clot of black smoke churning on itself, a dull blood-red heart beating deep inside,
  // its edge never still (smoke curling off it), no spikes, no cracks
  function drawDemonicOrb(x, y, radius, now) {
    g.save(); g.translate(x, y); g.scale(radius / 32, radius / 32);
    const beat = 0.8 + 0.2 * Math.pow(Math.abs(Math.sin(now / 300)), 6);   // its heart beats, slow and heavy
    // the heart's glow bleeding out through the smoke
    g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.28 * beat; g.drawImage(dotSprite("#9a0a1c"), -70, -70, 140, 140);
    g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
    // the body: a dark ball, darkest at its rim
    const body = g.createRadialGradient(0, 0, 4, 0, 0, 34);
    body.addColorStop(0, "rgba(60,6,12,1)"); body.addColorStop(0.45, "rgba(16,3,6,0.96)"); body.addColorStop(0.72, "rgba(6,2,4,0.75)"); body.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = body; g.beginPath(); g.arc(0, 0, 34, 0, 6.29); g.fill();
    // wisps torn off its edge: each drifts out, swells and thins away, and another rises in its place
    for (let i = 0; i < 8; i++) {
      const k = ((now / 1400 + i * 0.37) % 1), a = i * 0.785 + now / 2600 + Math.sin(i * 3.1) * 0.5, rr = 26 + k * 22, d = 9 + k * 14;
      const cx = Math.cos(a) * rr, cy = Math.sin(a) * rr, sm = g.createRadialGradient(cx, cy, 0, cx, cy, d);
      sm.addColorStop(0, "rgba(8,3,5," + (0.6 * (1 - k)).toFixed(3) + ")"); sm.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = sm; g.beginPath(); g.arc(cx, cy, d, 0, 6.29); g.fill();
    }
    // smoke churning on it: soft dark lobes turning both ways, swelling and shrinking, some poking past the rim
    for (let i = 0; i < 11; i++) {
      const a = now / (i % 2 ? 900 : -1150) + i * 0.571, rr = 10 + (i % 4) * 7 + Math.sin(now / 410 + i * 1.7) * 5;
      const cx = Math.cos(a) * rr, cy = Math.sin(a) * rr, d = 13 + (i % 3) * 5 + Math.sin(now / 260 + i) * 2.5;
      const sm = g.createRadialGradient(cx, cy, 0, cx, cy, d), red = i % 3 === 0;
      sm.addColorStop(0, red ? "rgba(48,6,12,0.75)" : "rgba(4,2,3,0.8)"); sm.addColorStop(0.65, red ? "rgba(26,3,8,0.35)" : "rgba(8,3,5,0.35)"); sm.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = sm; g.beginPath(); g.arc(cx, cy, d, 0, 6.29); g.fill();
    }
    // the heart, seen deep in the smoke
    const core = g.createRadialGradient(0, 0, 0, 0, 0, 13 * beat);
    core.addColorStop(0, "rgba(255,110,80," + (0.7 * beat).toFixed(3) + ")"); core.addColorStop(0.35, "rgba(200,14,34,0.55)"); core.addColorStop(1, "rgba(90,0,16,0)");
    g.globalCompositeOperation = "lighter"; g.fillStyle = core; g.beginPath(); g.arc(0, 0, 13 * beat, 0, 6.29); g.fill();
    g.restore();
  }
  function drawShot(s, x, y, now) {
    if (s.m >= QUAD) {   // Quad damage shots carry a violet-blue halo
      const hg = g.createRadialGradient(x, y, 0, x, y, 26);
      hg.addColorStop(0, "rgba(195,139,255,0.55)"); hg.addColorStop(1, "rgba(195,139,255,0)");
      g.fillStyle = hg; g.beginPath(); g.arc(x, y, 26, 0, 6.29); g.fill();
    }
    if (s.kind === K.PULSE_BOLT) {   // a pulse bolt: a crackling ball of green plasma in a shell of arcs, a long streak behind
      const a = Math.atan2(s.vy, s.vx);
      g.save(); g.translate(x, y); g.rotate(a); g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.45; g.drawImage(dotSprite("#4dff1e"), -110, -16, 120, 32);   // the long streak
      g.globalAlpha = 0.8; g.drawImage(dotSprite("#7dff3a"), -60, -10, 70, 20);
      g.globalAlpha = 0.9; g.drawImage(dotSprite("#9dff5a"), -30, -26, 60, 52);   // the glow
      g.save(); g.rotate(now / 60 + s.x * 0.01); g.globalAlpha = 0.95; g.drawImage(fireSprite(2 + ((now / 40) | 0) % 3, (s.x | 0) & 3, DEMON_RAMP), -20, -20, 40, 40); g.restore();
      // a shell of little arcs crackling round it
      g.strokeStyle = "rgba(220,255,180,0.9)"; g.lineWidth = 1.3;
      for (let k = 0; k < 3; k++) { let an = now / 30 + k * 2.1 + s.x, r = 9; g.beginPath(); g.moveTo(Math.cos(an) * r, Math.sin(an) * r); for (let n = 0; n < 3; n++) { an += 0.5 + Math.random() * 0.4; r = 12 + Math.random() * 7; g.lineTo(Math.cos(an) * r, Math.sin(an) * r); } g.stroke(); }
      g.globalAlpha = 1; g.fillStyle = "#ffffff"; g.beginPath(); g.arc(0, 0, 5.5, 0, 6.29); g.fill();
      g.restore(); return;
    }
    if (s.kind === K.ORB) {   // plasma orb: a big crackling ball, a wide glow, spinning rings and arcs licking out
      const r = 25 + Math.sin(now / 60 + s.x) * 2.5;
      g.globalAlpha = 0.5; g.drawImage(dotSprite("#3aa8ff"), x - r * 3.4, y - r * 3.4, r * 6.8, r * 6.8); g.globalAlpha = 1;
      const og = g.createRadialGradient(x, y, 0, x, y, r * 1.7);
      og.addColorStop(0, "rgba(255,255,255,1)"); og.addColorStop(0.35, "rgba(170,240,255,0.95)"); og.addColorStop(0.7, "rgba(70,170,255,0.6)"); og.addColorStop(1, "rgba(40,120,255,0)");
      g.fillStyle = og; g.beginPath(); g.arc(x, y, r * 1.7, 0, 6.29); g.fill();
      g.strokeStyle = "rgba(210,248,255,0.85)"; g.lineWidth = 2.5;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(x, y, r * 1.35, r * 0.45, now / (130 + k * 40) + k * 2.1, 0, 6.29); g.stroke(); }
      g.lineJoin = "round";
      for (let k = 0; k < (lowQ ? 2 : 4); k++) {   // arcs crackling out of the ball
        let a = Math.random() * 6.283, rr = r * 0.5, px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        g.strokeStyle = k % 2 ? "rgba(255,255,255,0.9)" : "rgba(140,225,255,0.85)"; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(px, py);
        for (let n = 0; n < 4; n++) { a += (Math.random() - 0.5) * 0.9; rr += r * (0.25 + Math.random() * 0.2); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
        g.stroke();
      }
      return;
    }
    if (s.kind === K.BOLT) {   // lightning: braided crackling strands from the gun to where the bolt has reached
      let noise = (Math.floor(now / 45) + (s.ox * 17 + s.oy * 31) | 0) >>> 0;
      const random = () => { noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0; return noise / 4294967296; };
      const x0 = x - (s.x - s.ox), y0 = y - (s.y - s.oy), L = Math.hypot(x - x0, y - y0) || 1, nx = (x - x0) / L, ny = (y - y0) / L;
      const seg = Math.max(6, Math.min(16, L / 40) | 0), strand = amp => {
        const p = [[x0, y0]];
        for (let k = 1; k < seg; k++) { const t = k / seg, o = (random() - 0.5) * amp * Math.sin(t * Math.PI); p.push([x0 + (x - x0) * t - ny * o, y0 + (y - y0) * t + nx * o]); }
        p.push([x, y]); return p;
      };
      const line = (p, w, c) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); p.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.stroke(); };
      g.lineJoin = "round"; g.lineCap = "round";
      const pts = strand(30);
      line(pts, 16, "rgba(90,160,255,0.22)");   // the wide glow
      line(strand(44), 2, "rgba(170,140,255,0.7)");   // a violet strand twisting around
      line(strand(36), 2, "rgba(150,230,255,0.8)");
      line(pts, 5, "rgba(190,240,255,0.95)"); line(pts, 2, "#ffffff");   // the hot core
      g.globalAlpha = 0.9; g.drawImage(dotSprite("#bfefff"), x - 28, y - 28, 56, 56); g.globalAlpha = 1;   // where it lands
      g.drawImage(dotSprite("#d8f6ff"), x0 - 18, y0 - 18, 36, 36);   // and at the gun
      for (let f = 0; f < (lowQ ? 1 : 3); f++) {   // forks splitting off the main bolt
        let [fx, fy] = pts[1 + ((random() * (pts.length - 2)) | 0)], a = Math.atan2(ny, nx) + (random() < 0.5 ? 1 : -1) * (0.4 + random() * 0.6);
        const fork = [[fx, fy]];
        for (let k = 0; k < 3; k++) { a += (random() - 0.5) * 0.9; const st = 14 + random() * 18; fx += Math.cos(a) * st; fy += Math.sin(a) * st; fork.push([fx, fy]); }
        for (const [w, c] of [[4, "rgba(120,200,255,0.3)"], [1.2, "rgba(220,248,255,0.9)"]]) {
          g.strokeStyle = c; g.lineWidth = w; g.beginPath(); fork.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.stroke();
        }
      }
      return;
    }
    if (s.kind === K.PISTOL || s.kind === K.LASER || s.kind === K.SHOCK || s.kind === K.DET) return;   // beams are drawn as beams; a detonator isn't seen
    if (s.kind === K.MELEE || s.kind === K.SWORD) return;   // a blow, a swing: the blade on the bin (and its trail) is what you see
    if (s.kind === K.NOVA) {   // the Plasma Nova: a swirling ball of green plasma, white at its heart, lightning crawling over it
      const c = Math.min(1, s.m || 1), r = 12 + 16 * c, a = Math.atan2(s.vy, s.vx);
      g.save(); g.translate(x, y); g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.5; g.rotate(a); g.drawImage(dotSprite("#4dff1e"), -r * 5, -r * 0.9, r * 5.5, r * 1.8); g.rotate(-a);   // the streak behind it
      g.globalAlpha = 0.4; g.drawImage(dotSprite("#7dff3a"), -r * 2.6, -r * 2.6, r * 5.2, r * 5.2);
      for (let k = 0; k < 3; k++) { g.save(); g.rotate(now / (90 + k * 40) * (k % 2 ? -1 : 1) + k * 2); g.globalAlpha = 0.85; g.drawImage(fireSprite(2 + ((now / 40 + k) | 0) % 3, k, DEMON_RAMP), -r * 1.25, -r * 1.25, r * 2.5, r * 2.5); g.restore(); }
      g.globalAlpha = 1; g.strokeStyle = "rgba(230,255,200,0.9)"; g.lineWidth = 1.5;
      for (let k = 0; k < (lowQ ? 2 : 4); k++) { let an = Math.random() * 6.283, rr = r * 0.6; g.beginPath(); g.moveTo(Math.cos(an) * rr, Math.sin(an) * rr); for (let n = 0; n < 3; n++) { an += 0.5 + Math.random() * 0.5; rr = r * (1 + Math.random() * 0.8); g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } g.stroke(); }
      g.fillStyle = "#ffffff"; g.beginPath(); g.arc(0, 0, r * 0.4, 0, 6.29); g.fill();
      g.restore(); return;
    }
    if (s.kind === K.HOOK) {   // the hook: a chain of steel links from its gun to a barbed head
      const sh = s.mine || (serverRun && s.owner === srv.id) ? me : botById.get(s.owner) || remotes.get(s.owner);
      if (!sh) return;
      const ox = sx(sh.x), oy = sy(sh.y), dx = x - ox, dy = y - oy, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, n = Math.floor(d / (9 * TS));
      g.save(); g.lineCap = "round";
      for (let k = 0; k < n; k++) {   // links, alternately face-on and edge-on
        const cx = ox + ux * (k + 0.5) * d / n, cy = oy + uy * (k + 0.5) * d / n;
        g.save(); g.translate(cx, cy); g.rotate(Math.atan2(uy, ux));
        g.strokeStyle = k % 2 ? "#7d8796" : "#c9d2de"; g.lineWidth = 2.2 * TS;
        if (k % 2) { g.beginPath(); g.moveTo(-5 * TS, 0); g.lineTo(5 * TS, 0); g.stroke(); }
        else { g.beginPath(); g.ellipse(0, 0, 5.5 * TS, 3 * TS, 0, 0, 6.283); g.stroke(); }
        g.restore();
      }
      g.translate(x, y); g.rotate(Math.atan2(uy, ux));   // the head: a steel point with two barbs
      g.fillStyle = "#e6edf5"; g.strokeStyle = "#5c6675"; g.lineWidth = 1.5 * TS;
      g.beginPath(); g.moveTo(10 * TS, 0); g.lineTo(-4 * TS, -7 * TS); g.lineTo(-1 * TS, 0); g.lineTo(-4 * TS, 7 * TS); g.closePath(); g.fill(); g.stroke();
      g.restore();
      return;
    }
    if (s.kind === K.NAIL || s.kind === K.SPIKE) {   // a nail: a silver shaft with a dark head (a spike is longer and glows)
      const sp = s.kind === K.SPIKE, L = sp ? 34 : 16;
      g.save(); g.translate(x, y); g.rotate(Math.atan2(s.vy, s.vx)); g.lineCap = "round";
      if (sp) { g.strokeStyle = "rgba(200,220,255,0.35)"; g.lineWidth = 9; g.beginPath(); g.moveTo(-L - 20, 0); g.lineTo(0, 0); g.stroke(); }
      g.strokeStyle = sp ? "#f2f6ff" : "#cfd6e2"; g.lineWidth = sp ? 4 : 2.2; g.beginPath(); g.moveTo(-L, 0); g.lineTo(2, 0); g.stroke();
      g.fillStyle = "#5a6276"; g.fillRect(-L - 2, sp ? -4 : -3, 3, sp ? 8 : 6);
      g.restore();
      return;
    }
    if (s.kind === K.GREN) {   // a grenade: a dark metal body with a ridged belt and a blinking fuse, tumbling
      const t = SHOTS[K.GREN].life - s.life, blink = Math.floor(t * (t > 1.8 ? 14 : 4)) % 2;
      g.save(); g.translate(x, y); g.rotate(t * 5 + s.x * 0.001); g.scale(1.25, 1.25);
      if (blink) { g.globalCompositeOperation = "lighter"; g.drawImage(dotSprite("#ff5a3c"), -16, -16, 32, 32); g.globalCompositeOperation = "source-over"; }
      // Quake-style: a dark gunmetal egg with a lighter ridged band round its waist, a capped nose and a fuse light
      const bg = g.createRadialGradient(-2, -3, 1, 0, 0, 12); bg.addColorStop(0, "#b8bec8"); bg.addColorStop(0.45, "#5c626c"); bg.addColorStop(1, "#24272d");
      g.fillStyle = bg; g.beginPath(); g.ellipse(0, 0, 11, 8, 0, 0, 6.29); g.fill();
      g.strokeStyle = "rgba(10,12,16,0.8)"; g.lineWidth = 1; g.beginPath(); g.ellipse(0, 0, 11, 8, 0, 0, 6.29); g.stroke();
      const band = g.createLinearGradient(0, -8, 0, 8); band.addColorStop(0, "#8f969f"); band.addColorStop(0.5, "#d6dbe2"); band.addColorStop(1, "#6a7079");
      g.fillStyle = band; g.fillRect(-2.2, -7.8, 4.4, 15.6);   // the band
      g.strokeStyle = "rgba(20,22,26,0.7)"; for (const by of [-4, 0, 4]) { g.beginPath(); g.moveTo(-2.2, by); g.lineTo(2.2, by); g.stroke(); }
      g.fillStyle = "#30343b"; g.beginPath(); g.ellipse(10, 0, 3, 4, 0, 0, 6.29); g.fill();   // the capped nose
      g.fillStyle = blink ? "#ffd2c0" : "#802010"; g.beginPath(); g.arc(11, 0, 1.8, 0, 6.29); g.fill();   // the fuse light, faster near the end
      g.restore();
      return;
    }
    if (s.kind === K.PULSE) {   // the laser's pulse: a wide crescent of light
      const a = Math.atan2(s.vy, s.vx), k = s.life / SHOTS[K.PULSE].life;
      g.save(); g.translate(x, y); g.rotate(a); g.lineCap = "round";
      for (const [w, c] of [[22, `rgba(60,200,255,${0.3 * k + 0.1})`], [8, `rgba(160,250,255,${0.8 * k + 0.2})`], [3, "#ffffff"]]) {
        g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.arc(-40, 0, 70, -0.75, 0.75); g.stroke();
      }
      g.restore();
      return;
    }
    if (s.kind === K.FLAK) {   // shell shadow and loft make its falling trajectory readable
      const height = flakHeight(s);
      g.fillStyle = "rgba(0,0,0,.4)"; g.beginPath(); g.ellipse(x, y + 8, 12 + height*.08, 5, 0, 0, Math.PI*2); g.fill();
      g.save(); g.translate(x, y - height); g.rotate(performance.now() / 80);
      g.globalAlpha = 0.6; g.drawImage(dotSprite("#ff9a3c"), -30, -30, 60, 60); g.globalAlpha = 1;
      g.fillStyle = "#ffd27a"; g.beginPath();
      for (let k = 0; k < 16; k++) { const r = k % 2 ? 6 : 13, a = k / 16 * 6.283; k ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(r, 0); }
      g.closePath(); g.fill(); g.fillStyle = "#fff4e0"; g.beginPath(); g.arc(0, 0, 4, 0, 6.29); g.fill();
      g.restore();
      return;
    }
    if (s.kind === K.SHARD) {   // shard: a heavy white-hot splinter, longer and hotter after every ricochet
      const hot = Math.min(4, s.bn || 0), L = 40 + hot * 14, k = 1.5 + hot * 0.15;
      g.save(); g.translate(x, y); g.rotate(Math.atan2(s.vy, s.vx));
      g.globalAlpha = 0.5 + hot * 0.1; g.drawImage(dotSprite(hot ? "#ffd27a" : "#ff9a3c"), -22 * k, -22 * k, 44 * k, 44 * k); g.globalAlpha = 1;
      const lg = g.createLinearGradient(-L, 0, 0, 0);
      lg.addColorStop(0, "rgba(255,120,30,0)"); lg.addColorStop(1, hot ? "rgba(255,240,190,0.98)" : "rgba(255,200,120,0.95)");
      g.strokeStyle = lg; g.lineWidth = 8 + hot; g.lineCap = "round";
      g.beginPath(); g.moveTo(-L, 0); g.lineTo(0, 0); g.stroke();
      g.fillStyle = "#fff4e0"; g.beginPath(); g.moveTo(8 * k, 0); g.lineTo(-4 * k, -4.5 * k); g.lineTo(-2 * k, 0); g.lineTo(-4 * k, 4.5 * k); g.fill();
      g.restore();
      return;
    }
    if (s.kind === K.SLUG) {   // shotgun slug: one fat white-hot ball with a long streak
      g.save(); g.translate(x, y); g.rotate(Math.atan2(s.vy, s.vx));
      const lg = g.createLinearGradient(-80, 0, 0, 0);
      lg.addColorStop(0, "rgba(255,150,40,0)"); lg.addColorStop(1, "rgba(255,240,190,0.95)");
      g.strokeStyle = lg; g.lineWidth = 11; g.lineCap = "round";
      g.beginPath(); g.moveTo(-80, 0); g.lineTo(0, 0); g.stroke();
      g.fillStyle = "rgba(255,210,110,0.4)"; g.beginPath(); g.arc(0, 0, 16, 0, 6.29); g.fill();
      g.fillStyle = "#fffaf0"; g.beginPath(); g.arc(0, 0, 6, 0, 6.29); g.fill();
      g.restore();
      return;
    }
    if (s.kind === K.PELLET) {   // scatter pellet: a short hot streak
      g.save(); g.translate(x, y); g.rotate(Math.atan2(s.vy, s.vx));
      const lg = g.createLinearGradient(-44, 0, 0, 0);
      lg.addColorStop(0, "rgba(255,150,40,0)"); lg.addColorStop(1, "rgba(255,235,160,0.95)");
      g.strokeStyle = lg; g.lineWidth = 6; g.lineCap = "round";
      g.beginPath(); g.moveTo(-44, 0); g.lineTo(0, 0); g.stroke();
      g.fillStyle = "rgba(255,200,90,0.35)"; g.beginPath(); g.arc(0, 0, 9, 0, 6.29); g.fill();
      g.fillStyle = "#fff6d8"; g.beginPath(); g.arc(0, 0, 3.6, 0, 6.29); g.fill();
      g.restore();
      return;
    }
    if (s.kind === K.RAIL) {   // rail slug: a long violet-white beam
      const L = 280;
      g.save(); g.translate(x, y); g.rotate(Math.atan2(s.vy, s.vx));
      const lg = g.createLinearGradient(-L, 0, 0, 0);
      lg.addColorStop(0, "rgba(190,120,255,0)"); lg.addColorStop(1, "rgba(220,170,255,0.7)");
      g.strokeStyle = lg; g.lineWidth = 16; g.lineCap = "round";
      g.beginPath(); g.moveTo(-L, 0); g.lineTo(0, 0); g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.95)"; g.lineWidth = 3.5;
      g.beginPath(); g.moveTo(-L * 0.75, 0); g.lineTo(6, 0); g.stroke();
      const hg = g.createRadialGradient(0, 0, 0, 0, 0, 22);
      hg.addColorStop(0, "rgba(255,255,255,0.95)"); hg.addColorStop(1, "rgba(200,140,255,0)");
      g.fillStyle = hg; g.beginPath(); g.arc(0, 0, 22, 0, 6.29); g.fill();
      g.restore();
      return;
    }
    if (s.kind === K.MINE) {   // mine: spiked ball, blinks faster once armed, shows its trigger radius
      const armed = SHOTS[K.MINE].life - s.life >= MINE_ARM, ending = s.life < 3;
      const on = Math.floor(now / (armed ? (ending ? 90 : 260) : 120)) % 2 === 0;
      g.save(); g.translate(x, y);
      if (armed) {
        g.strokeStyle = `rgba(255,107,60,${0.16 + 0.1 * Math.sin(now / 200)})`; g.lineWidth = 2;
        g.beginPath(); g.arc(0, 0, MINE_R + 20, 0, 6.29); g.stroke();
      }
      g.globalCompositeOperation = "source-over";
      g.rotate(now / 1500 + s.x);
      g.fillStyle = "#3b2d5c";
      for (let k = 0; k < 8; k++) { g.save(); g.rotate(k * Math.PI / 4); g.fillRect(-2.5, -18, 5, 9); g.restore(); }
      const bg = g.createRadialGradient(-4, -4, 2, 0, 0, 13);
      bg.addColorStop(0, "#8a7fb0"); bg.addColorStop(1, "#241a3e");
      g.fillStyle = bg; g.beginPath(); g.arc(0, 0, 12, 0, 6.29); g.fill();
      g.globalCompositeOperation = "lighter";
      g.fillStyle = on ? "#ff6b3c" : "#5a2418"; g.beginPath(); g.arc(0, 0, 4, 0, 6.29); g.fill();
      if (on) {
        const rg = g.createRadialGradient(0, 0, 0, 0, 0, 26);
        rg.addColorStop(0, "rgba(255,107,60,0.7)"); rg.addColorStop(1, "rgba(255,107,60,0)");
        g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 26, 0, 6.29); g.fill();
      }
      g.restore();
      return;
    }
    if (s.kind === K.SAW || s.kind === K.SAW_ALT) {   // a spinning toothed blade
      g.save(); g.translate(x, y); g.rotate(now / 25 + s.x * 0.01);
      g.fillStyle = s.returning ? "rgba(70,255,210,0.4)" : "rgba(214,221,232,0.25)"; g.beginPath(); g.arc(0, 0, 22, 0, 6.29); g.fill();
      g.fillStyle = s.kind === K.SAW_ALT ? "#ffae63" : "#d6dde8"; g.beginPath();
      for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283, r = k % 2 ? 11 : 16; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fill();
      g.fillStyle = s.returning ? "#6fffe0" : "#5a6684"; g.beginPath(); g.arc(0, 0, 4, 0, 6.29); g.fill();
      g.restore();
      return;
    }
    if (s.kind === K.GAMMA) {   // the demonic orb: a churning ball of hellfire in a shroud of green flame and smoke
      const speed = Math.hypot(s.vx, s.vy) || 1, ux = s.vx / speed, uy = s.vy / speed;
      g.save();
      const dk = g.createRadialGradient(x, y, 20, x, y, 190);   // it darkens the space round it, as if it drinks the light
      dk.addColorStop(0, "rgba(0,0,0,0.6)"); dk.addColorStop(0.55, "rgba(6,0,4,0.32)"); dk.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = dk; g.beginPath(); g.arc(x, y, 190, 0, 6.29); g.fill();
      // the shroud: dark smoke turning round it both ways and dragged back along its flight
      for (let i = 0; i < 9; i++) {
        const a = now / (i % 2 ? 760 : -980) + i * 0.698, rr = 30 + (i % 3) * 9 + Math.sin(now / 250 + i) * 5, back = (i % 4) * 11;
        const cx = x + Math.cos(a) * rr - ux * back, cy = y + Math.sin(a) * rr - uy * back, d = 26 + (i % 3) * 10;
        const sm = g.createRadialGradient(cx, cy, 0, cx, cy, d);
        sm.addColorStop(0, i % 4 ? "rgba(10,4,6,0.55)" : "rgba(40,6,12,0.5)"); sm.addColorStop(1, "rgba(0,0,0,0)");
        g.globalAlpha = 1; g.fillStyle = sm; g.beginPath(); g.arc(cx, cy, d, 0, 6.29); g.fill();
      }
      for (let i = 0; i < 6; i++) {   // black smoke coiling through the flame
        const a = now / (i % 2 ? -520 : 610) + i * 1.047, rr = 26 + (i % 3) * 8, cx = x + Math.cos(a) * rr - ux * 14, cy = y + Math.sin(a) * rr - uy * 14, d = 30 + (i % 2) * 12;
        const sm = g.createRadialGradient(cx, cy, 0, cx, cy, d);
        sm.addColorStop(0, "rgba(6,2,4,0.85)"); sm.addColorStop(0.6, "rgba(10,2,6,0.4)"); sm.addColorStop(1, "rgba(6,2,4,0)");
        g.globalAlpha = 1; g.fillStyle = sm; g.beginPath(); g.arc(cx, cy, d, 0, 6.29); g.fill();
      }
      g.restore();
      drawDemonicOrb(x, y, 30 + Math.sin(now / 160) * 2, now);
      return;
    }
    if (s.kind === K.BEACON) {   // the teleporter's beacon: a cyan diamond with a beating ring
      const p = (now / 600) % 1;
      g.strokeStyle = `rgba(143,240,255,${1 - p})`; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 12 + p * 40, 0, 6.29); g.stroke();
      g.fillStyle = "#8ff0ff"; g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x + 9, y); g.lineTo(x, y + 12); g.lineTo(x - 9, y); g.closePath(); g.fill();
      g.fillStyle = "#ffffff"; g.beginPath(); g.arc(x, y, 3, 0, 6.29); g.fill();
      return;
    }
    if (s.kind === K.TFRAG) {   // the arrival flash
      const k = 1 - Math.max(0, s.life) / SHOTS[K.TFRAG].life;
      g.strokeStyle = `rgba(200,250,255,${1 - k})`; g.lineWidth = 6; g.beginPath(); g.arc(x, y, 20 + k * 70, 0, 6.29); g.stroke();
      return;
    }
    if (s.kind === K.BULLET || s.kind === K.BULLET_ALT) {
      const heavy = s.kind === K.BULLET_ALT, L = heavy ? 70 : 56;   // a long hot tracer with a glow round it (an explosive round: fatter, burning red-orange)
      g.save(); g.translate(x, y); g.rotate(Math.atan2(s.vy, s.vx)); g.globalCompositeOperation = "lighter";
      const tail = g.createLinearGradient(-L, 0, 3, 0);
      tail.addColorStop(0, heavy ? "#ff200000" : "#ff6a1000");
      tail.addColorStop(0.6, heavy ? "#ff4a14aa" : "#ffa03a99");
      tail.addColorStop(1, heavy ? "#ffb060" : "#ffe08a");
      if (!lowQ) { g.strokeStyle = heavy ? "rgba(255,80,20,0.32)" : "rgba(255,150,50,0.28)"; g.lineWidth = heavy ? 16 : 11; g.lineCap = "round"; g.beginPath(); g.moveTo(-L * 0.7, 0); g.lineTo(2, 0); g.stroke(); }
      g.strokeStyle = tail; g.lineWidth = heavy ? 7 : 4.5; g.lineCap = "round";
      g.beginPath(); g.moveTo(-L, 0); g.lineTo(0, 0); g.stroke();
      g.fillStyle = heavy ? "#fff0c8" : "#fff8dc";
      g.beginPath(); g.ellipse(0, 0, heavy ? 9 : 6, heavy ? 4.5 : 2.6, 0, 0, 6.29); g.fill();
      g.restore(); return;
    }
    if (s.kind === K.GAUSS) {   // a blue slug of light, thicker the more it was charged
      const w = 3 + 9 * Math.min(1, s.m), L = 160 + 160 * Math.min(1, s.m);
      g.save(); g.translate(x, y); g.rotate(Math.atan2(s.vy, s.vx)); g.lineCap = "round";
      const lg = g.createLinearGradient(-L, 0, 0, 0);
      lg.addColorStop(0, "rgba(80,140,255,0)"); lg.addColorStop(1, "rgba(160,210,255,0.95)");
      g.strokeStyle = lg; g.lineWidth = w; g.beginPath(); g.moveTo(-L, 0); g.lineTo(0, 0); g.stroke();
      g.fillStyle = "#ffffff"; g.beginPath(); g.arc(0, 0, w * 0.6, 0, 6.29); g.fill();
      g.restore();
      return;
    }
    if (s.kind === K.HOLY) {   // a golden orb under a halo; it pulses faster and shines wider as the fuse runs out
      const left = Math.max(0, s.life), hot = 1 - left / SHOTS[K.HOLY].life, pulse = 0.6 + 0.4 * Math.sin(now / (120 - 90 * hot));
      g.save(); g.translate(x, y);
      g.globalCompositeOperation = "lighter";
      const gr = 60 + 140 * hot * pulse, gl = g.createRadialGradient(0, 0, 4, 0, 0, gr);
      gl.addColorStop(0, `rgba(255,248,200,${0.5 + 0.4 * hot})`); gl.addColorStop(1, "rgba(255,230,140,0)");
      g.fillStyle = gl; g.beginPath(); g.arc(0, 0, gr, 0, 6.29); g.fill();
      for (let k = 0; k < 8; k++) {   // slow turning rays
        const a = now / 900 + k * 0.785, len = 50 + 90 * hot;
        g.strokeStyle = `rgba(255,245,200,${0.25 + 0.35 * hot})`; g.lineWidth = 3;
        g.beginPath(); g.moveTo(Math.cos(a) * 16, Math.sin(a) * 16); g.lineTo(Math.cos(a) * len, Math.sin(a) * len); g.stroke();
      }
      g.globalCompositeOperation = "source-over";
      if (holyImg.complete && holyImg.naturalWidth) {   // the holy bomb itself: its skin, tumbling, swelling a little as the fuse runs out
        const sz = 62 * (1 + 0.12 * hot * pulse), ar = holyImg.naturalHeight / holyImg.naturalWidth;
        g.rotate(s.rot || 0); g.drawImage(holyImg, -sz / 2, -sz * ar / 2, sz, sz * ar);
      } else {
        const og = g.createRadialGradient(-4, -4, 2, 0, 0, 14);
        og.addColorStop(0, "#fffbe6"); og.addColorStop(0.5, "#ffd76a"); og.addColorStop(1, "#b07a1e");
        g.fillStyle = og; g.beginPath(); g.arc(0, 0, 14, 0, 6.29); g.fill();
      }
      g.restore();
      g.globalCompositeOperation = "lighter";
      return;
    }
    if (s.kind === K.VOID) {   // the void bomb: a dark orb, light bending round it, a violet ring turning
      const t = now / 1000;
      g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.5; g.drawImage(dotSprite("#9b5cff"), x - 60, y - 60, 120, 120);
      g.globalAlpha = 1; g.strokeStyle = "rgba(210,170,255,0.9)"; g.lineWidth = 3;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(x, y, 26, 9, t * 2 + i * 1.05, 0, 6.29); g.stroke(); }
      g.globalCompositeOperation = "source-over"; g.fillStyle = "#05010a"; g.beginPath(); g.arc(x, y, 15, 0, 6.29); g.fill();
      g.strokeStyle = "#e9dcff"; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 16, 0, 6.29); g.stroke(); g.restore();
      return;
    }
    if (s.kind === K.NUKE) {
      const a = Math.atan2(s.vy, s.vx), fl = 1 + Math.sin(now / 22 + s.x) * 0.25;
      g.save(); g.translate(x, y); g.rotate(a);
      g.globalCompositeOperation = "lighter";
      const fg = g.createLinearGradient(-70 * fl, 0, -16, 0);
      fg.addColorStop(0, "rgba(255,60,20,0)"); fg.addColorStop(1, "rgba(255,230,120,0.95)");
      g.fillStyle = fg; g.beginPath(); g.moveTo(-16, -9); g.lineTo(-70 * fl, 0); g.lineTo(-16, 9); g.fill();
      const gl = g.createRadialGradient(0, 0, 4, 0, 0, 46);
      gl.addColorStop(0, `rgba(255,225,77,${0.35 + 0.25 * Math.sin(now / 90)})`); gl.addColorStop(1, "rgba(255,225,77,0)");
      g.fillStyle = gl; g.beginPath(); g.arc(0, 0, 46, 0, 6.29); g.fill();
      g.globalCompositeOperation = "source-over";
      g.fillStyle = "#1d1630"; g.beginPath(); g.moveTo(-18, -14); g.lineTo(-8, -6); g.lineTo(-8, 6); g.lineTo(-18, 14); g.fill();
      g.fillStyle = "#ffe14d"; rrect(-18, -9, 34, 18, 8); g.fill();
      g.fillStyle = "#1d1630"; g.beginPath(); g.moveTo(16, -9); g.quadraticCurveTo(30, 0, 16, 9); g.fill();
      g.save(); g.translate(-7, -7); g.scale(14 / 24, 14 / 24); g.fill(ICON_PATHS.nuke, "evenodd"); g.restore();
      g.restore();
      g.globalCompositeOperation = "lighter";
      return;
    }
    if (s.kind === K.LASER) {   // laser: a long bolt of light with a pulsing glow and a hot flare at the head
      const a = Math.atan2(s.vy, s.vx), L = 130, pw = 1 + 0.25 * Math.sin(now / 30 + s.x);
      g.save(); g.translate(x, y); g.rotate(a);
      g.lineCap = "round";
      const og = g.createLinearGradient(-L, 0, 0, 0);
      og.addColorStop(0, "rgba(60,200,255,0)"); og.addColorStop(1, "rgba(60,200,255,0.35)");
      g.strokeStyle = og; g.lineWidth = 18 * pw; g.beginPath(); g.moveTo(-L, 0); g.lineTo(0, 0); g.stroke();
      const lg = g.createLinearGradient(-L, 0, 0, 0);
      lg.addColorStop(0, "rgba(125,249,255,0)"); lg.addColorStop(1, "rgba(160,250,255,0.85)");
      g.strokeStyle = lg; g.lineWidth = 7; g.beginPath(); g.moveTo(-L * 0.9, 0); g.lineTo(0, 0); g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.95)"; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(-L * 0.75, 0); g.lineTo(4, 0); g.stroke();
      const hg = g.createRadialGradient(2, 0, 0, 2, 0, 16 * pw);
      hg.addColorStop(0, "rgba(255,255,255,0.95)"); hg.addColorStop(1, "rgba(125,249,255,0)");
      g.fillStyle = hg; g.beginPath(); g.arc(2, 0, 16 * pw, 0, 6.29); g.fill();
      g.restore();
      return;
    }
    if (s.kind === K.ROCKET || s.kind === K.HROCKET) {   // a rocket the size of a rocket (it used to be drawn twice as big)
      const a = Math.atan2(s.vy, s.vx), fl = 1 + Math.sin(now / 25 + s.x) * 0.25;
      g.save(); g.translate(x, y); g.rotate(a); g.scale(1.15, 1.15);
      const fg = g.createLinearGradient(-34 * fl, 0, -8, 0);
      fg.addColorStop(0, "rgba(255,60,20,0)"); fg.addColorStop(1, "rgba(255,210,90,0.95)");
      g.fillStyle = fg; g.beginPath(); g.moveTo(-8, -4); g.lineTo(-34 * fl, 0); g.lineTo(-8, 4); g.fill();
      g.globalCompositeOperation = "source-over";
      g.fillStyle = "#8a7fb0"; g.beginPath(); g.moveTo(-10, -8); g.lineTo(-2, -3); g.lineTo(-2, 3); g.lineTo(-10, 8); g.fill();
      const bg = g.createLinearGradient(0, -5, 0, 5);
      bg.addColorStop(0, "#f4f1ff"); bg.addColorStop(1, "#a59cc8");
      g.fillStyle = bg; rrect(-10, -4.5, 20, 9, 4); g.fill();
      g.fillStyle = "#ff5a6e"; g.beginPath(); g.moveTo(10, -4.5); g.quadraticCurveTo(18, 0, 10, 4.5); g.fill();
      if (s.kind === K.HROCKET && Math.floor(now / 140 + s.x) % 2) {   // homing seeker light blinking on the nose
        g.globalCompositeOperation = "lighter";
        const sg = g.createRadialGradient(13, 0, 0, 13, 0, 9);
        sg.addColorStop(0, "rgba(255,255,255,0.95)"); sg.addColorStop(1, "rgba(255,60,80,0)");
        g.fillStyle = sg; g.beginPath(); g.arc(13, 0, 9, 0, 6.29); g.fill();
        g.globalCompositeOperation = "source-over";
      }
      g.globalCompositeOperation = "lighter";
      g.restore();
      return;
    }
    const fl = 1 + Math.sin(now / 28 + s.y) * 0.18;
    g.save(); g.translate(x, y); g.rotate(Math.atan2(s.vy, s.vx));
    const tail = g.createLinearGradient(-52 * fl, 0, 10, 0);
    tail.addColorStop(0, "rgba(255,50,20,0)"); tail.addColorStop(0.55, "rgba(255,110,30,0.75)"); tail.addColorStop(1, "rgba(255,225,110,0.95)");
    g.fillStyle = tail;
    g.beginPath(); g.moveTo(10, 0);
    g.quadraticCurveTo(-12, -12 * fl, -52 * fl, Math.sin(now / 40) * 3);
    g.quadraticCurveTo(-12, 12 * fl, 10, 0); g.fill();
    const halo = g.createRadialGradient(4, 0, 0, 4, 0, 36 * fl);   // the light it throws around itself
    halo.addColorStop(0, "rgba(255,170,60,0.45)"); halo.addColorStop(1, "rgba(255,90,30,0)");
    g.fillStyle = halo; g.beginPath(); g.arc(4, 0, 36 * fl, 0, 6.29); g.fill();
    for (let k = -1; k <= 1; k += 2) {   // two licking tongues of flame
      const w2 = Math.sin(now / 35 + k * 2 + s.x) * 5;
      g.fillStyle = "rgba(255,150,40,0.55)"; g.beginPath(); g.moveTo(6, k * 3);
      g.quadraticCurveTo(-14, k * (10 + w2), -34 * fl, k * (6 + w2)); g.quadraticCurveTo(-12, k * 2, 6, k * 3); g.fill();
    }
    const core = g.createRadialGradient(4, 0, 0, 4, 0, 17 * fl);
    core.addColorStop(0, "#fffbe6"); core.addColorStop(0.35, "#ffd23f"); core.addColorStop(0.7, "rgba(255,110,30,0.8)"); core.addColorStop(1, "rgba(255,60,20,0)");
    g.fillStyle = core; g.beginPath(); g.arc(4, 0, 17 * fl, 0, 6.29); g.fill();
    g.restore();
  }

  // ---------- live engine fire: a jet of flame, drawn as fire flows ----------
  // Local frame: nozzle at the origin, +y points out of the engine. The jet is a strip of turbulent flame texture (noise
  // stretched along the flow, tileable along it) scrolled outward every frame so the fire visibly pours out of the
  // nozzle, cut to a flame's shape (narrow at the throat, swelling, then tapering into ragged tongues) and coloured
  // from hot to cool along it; it bends as the bin turns. Two layers: the outer flame (the palette's mid to outer
  // colours, cooling to a dark red) and the inner core (white to its core colour), short and bright. On boost the
  // core goes blue-white and long, shock diamonds stand in it and the flame roars out twice as far
  const JW = 48, JH = 192;
  let jetTex = null, jetMasks = null, jetCanvas = null;
  function jetNoise() {   // turbulent streaks, tileable along y: value noise on a lattice that wraps in y
    const c = document.createElement("canvas"); c.width = JW; c.height = JH;
    const q = c.getContext("2d"), img = q.createImageData(JW, JH), h = (i, j, o) => { const v = Math.sin(i * 127.1 + j * 311.7 + o * 74.7) * 43758.5453; return v - Math.floor(v); };
    const vn = (x, y, py, o) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), w = j => ((j % py) + py) % py;
      const a = h(xi, w(yi), o), b = h(xi + 1, w(yi), o), c2 = h(xi, w(yi + 1), o), d = h(xi + 1, w(yi + 1), o); return a + (b - a) * ux + (c2 - a) * uy + (a - b - c2 + d) * ux * uy; };
    for (let y = 0; y < JH; y++) for (let x = 0; x < JW; x++) {
      const u = x / JW, v = y / JH;
      let n = 0, amp = 0.55, fx = 7, py = 5;
      for (let o = 0; o < 4; o++) { n += vn(u * fx, v * py, py, o) * amp; amp *= 0.5; fx *= 2.1; py *= 2; }
      const k = Math.max(0, Math.min(1, (n - 0.18) / 0.42)), o4 = (y * JW + x) * 4;
      img.data[o4] = img.data[o4 + 1] = img.data[o4 + 2] = 255; img.data[o4 + 3] = 255 * k * k * (3 - 2 * k);
    }
    q.putImageData(img, 0, 0); return c;
  }
  function jetMask(core) {   // the flame's shape as alpha: soft-edged, swelling from the throat, tapering out
    const c = document.createElement("canvas"); c.width = JW; c.height = JH;
    const q = c.getContext("2d"), img = q.createImageData(JW, JH);
    for (let y = 0; y < JH; y++) for (let x = 0; x < JW; x++) {
      const v = y / JH, u = Math.abs(x / (JW - 1) - 0.5) * 2;
      const hw = core ? 0.62 * Math.pow(1 - v, 1.1) * (0.75 + 0.25 * Math.min(1, v / 0.1)) : (0.6 + 0.4 * Math.sin(Math.min(1, v / 0.22) * Math.PI / 2)) * Math.pow(1 - v, 0.65);
      const e = Math.max(0, Math.min(1, (hw - u) / Math.max(0.05, hw * (core ? 0.6 : 0.75))));
      const along = Math.min(1, v / 0.03) * Math.pow(1 - v, core ? 0.5 : 0.35), o4 = (y * JW + x) * 4;
      img.data[o4] = img.data[o4 + 1] = img.data[o4 + 2] = 255; img.data[o4 + 3] = 255 * e * e * (3 - 2 * e) * along;
    }
    q.putImageData(img, 0, 0); return c;
  }
  // one layer, built in the scratch canvas: two sheets of flowing noise, cut to the mask, coloured along the flow
  function jetLayer(core, flow, seed, stops) {
    if (!jetTex) { jetTex = jetNoise(); jetMasks = [jetMask(false), jetMask(true)]; jetCanvas = document.createElement("canvas"); jetCanvas.width = JW; jetCanvas.height = JH; }
    const q = jetCanvas.getContext("2d");
    q.globalCompositeOperation = "copy"; q.globalAlpha = 1;
    const sheet = (off, flip) => { const o = ((off % 1) + 1) % 1 * JH; q.save(); if (flip) { q.translate(JW, 0); q.scale(-1, 1); } q.drawImage(jetTex, 0, -JH + o); q.globalCompositeOperation = "source-over"; q.drawImage(jetTex, 0, o); q.restore(); };
    sheet(flow + seed, false);
    q.globalCompositeOperation = "lighter"; q.globalAlpha = 0.7; { const o = (((flow * 1.37 + seed * 3.1) % 1) + 1) % 1 * JH; q.save(); q.translate(JW, 0); q.scale(-1, 1); q.drawImage(jetTex, 0, -JH + o); q.drawImage(jetTex, 0, o); q.restore(); }
    q.globalAlpha = 1; q.globalCompositeOperation = "destination-in"; q.drawImage(jetMasks[core ? 1 : 0], 0, 0);
    q.globalCompositeOperation = "source-in";
    const gr = q.createLinearGradient(0, 0, 0, JH); for (const [f, c] of stops) gr.addColorStop(f, c);
    q.fillStyle = gr; q.fillRect(0, 0, JW, JH);
    return jetCanvas;
  }
  // the layer drawn along the jet's bent path, in slices: L long, Wd wide at its widest, the tip bent sideways by bend
  function jetDraw(cv, L, Wd, bend) {
    const N = 6;
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N, x0 = bend * t0 * t0, x1 = bend * t1 * t1, y0 = L * t0, y1 = L * t1, ang = Math.atan2(x1 - x0, y1 - y0);
      g.save(); g.translate(x0, y0); g.rotate(-ang);
      g.drawImage(cv, 0, JH * t0, JW, JH / N + 0.5, -Wd / 2, 0, Wd, Math.hypot(x1 - x0, y1 - y0) + 0.8);
      g.restore();
    }
  }
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  function drawJet(len, wid, now, pal, boost, seed, bend, power) {
    const t = now / 1000, fl = 0.93 + 0.05 * Math.sin(t * 53 + seed) + 0.03 * Math.sin(t * 89 + seed * 2.3);
    const L = len * (boost ? 1.2 : 1.6) * fl, Wd = wid * (boost ? 2.1 : 2.3);
    if (L < 2) return;
    const core = boost ? [205, 228, 255] : pal.core, mid = pal.mid, outer = pal.outer, ember = [outer[0] * 0.55, outer[1] * 0.3, outer[2] * 0.3];
    const speed = boost ? 4.2 : 2.6;   // how many jet-lengths of fire pour out per second (the texture's flow)
    // bent hard (a sharp turn): its layers fold onto each other by the nozzle and, added up, burned to a white blot; so
    // the more it bends the dimmer each layer
    const fold = 1 - 0.5 * Math.min(1, Math.abs(bend) / (Wd * 1.2));
    g.globalCompositeOperation = "lighter";
    // the outer flame: from the palette's middle through its outer colour to a dull ember red, fading out
    g.globalAlpha = Math.min(1, 0.55 + 0.4 * power) * fold;
    jetDraw(jetLayer(false, -t * speed, seed * 0.13, [[0, rgba(mid, 0.9)], [0.25, rgba(mid, 0.85)], [0.5, rgba(outer, 0.75)], [0.8, rgba(ember, 0.55)], [1, rgba(ember, 0)]]), L, Wd, bend);
    // the inner core: short, white-hot to its core colour (blue-white on boost)
    g.globalAlpha = Math.min(1, 0.7 + 0.3 * power) * fold;
    jetDraw(jetLayer(true, -t * speed * 1.4, seed * 0.29 + 0.5, [[0, "rgba(255,255,255,1)"], [0.3, rgba(core, 0.95)], [0.7, rgba(mid, 0.6)], [1, rgba(mid, 0)]]), L * (boost ? 0.62 : 0.5), Wd * 0.55, bend * 0.5);
    g.globalAlpha = 1;
    if (boost && !lowQ) for (let i = 1; i <= 4; i++) {   // shock diamonds: bright knots standing in the core
      const f = 0.1 + i * 0.12, yj = L * f, xj = bend * f * f, r = Wd * (0.12 - i * 0.015);
      g.globalAlpha = (0.6 - i * 0.11) * fl * fold; g.fillStyle = "#eef6ff";
      g.beginPath(); g.ellipse(xj, yj, r, r * 2.4, 0, 0, 6.29); g.fill();
    }
    g.globalAlpha = 1;
    const hr = Wd * (boost ? 0.6 : 0.5), hg = g.createRadialGradient(0, 2, 0, 0, 2, hr);   // the throat's glow
    hg.addColorStop(0, rgba(core, (boost ? 0.5 : 0.4) * fold)); hg.addColorStop(1, rgba(mid, 0));
    g.fillStyle = hg; g.beginPath(); g.arc(0, 2, hr, 0, 6.29); g.fill();
    g.globalCompositeOperation = "source-over";
  }
  function drawFlame(len, wid, now, seed, tier, bend = 0, billow = 0) {
    const t = now / 1000;
    g.globalCompositeOperation = "lighter";
    const layers = [[tier.outer, 1, 1, 0.7], [tier.mid, 0.72, 0.8, 0.85], [tier.core, 0.4, 0.55, 0.95]];
    for (let k = 0; k < layers.length; k++) {
      const [c, wf, lf, al] = layers[k];
      for (let tongue = -1; tongue <= 1; tongue++) {
        if (k === 2 && tongue !== 0) continue;
        const ph = seed + tongue * 1.7 + k * 0.9;
        const L = len * lf * (tongue ? 0.6 : 1) * (0.84 + 0.1 * Math.sin(t * 29 + ph) + 0.07 * Math.sin(t * 47 + ph * 2.3));
        const w = wid * wf * (tongue ? 0.55 : 1);
        const ox = tongue * wid * 0.27;
        const sway = Math.sin(t * 13 + ph) * w * 0.35 + Math.sin(t * 23 + ph) * w * 0.12 + bend * (k === 2 ? 0.5 : 1);   // (it trails as the bin swings)
        const gr = g.createLinearGradient(0, 0, 0, L);
        gr.addColorStop(0, `rgba(${c},${al})`); gr.addColorStop(0.55, `rgba(${c},${al * 0.65})`); gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(ox - w / 2, 0);
        g.bezierCurveTo(ox - w * 0.65, L * 0.35, ox + sway - w * 0.22, L * 0.7, ox + sway * 1.6, L);
        g.bezierCurveTo(ox + sway + w * 0.22, L * 0.7, ox + w * 0.65, L * 0.35, ox + w / 2, 0);
        g.closePath(); g.fill();
      }
    }
    // billowing fire inside the jet (the blasts' own flame textures), more and brighter on boost, bent with it
    for (let k = 0, n = Math.round(billow); k < n; k++) {
      const f = (k + 0.5) / n, yy = len * f * 0.85, d = wid * (1.3 + f * 1.4) * (0.85 + 0.15 * Math.sin(t * 31 + k + seed));
      g.globalAlpha = 0.55 * (1 - f * 0.6); g.save(); g.translate(bend * f * f * 1.4, yy); g.rotate(t * 3 + k * 1.7 + seed);
      g.drawImage(fireSprite(Math.min(7, 1 + k + (f * 3 | 0)), ((t * 24) | 0) + k & 3), -d / 2, -d / 2, d, d); g.restore();
    }
    g.globalAlpha = 1;
    const hr = wid * (0.85 + 0.1 * Math.sin(t * 37 + seed)) * (billow > 2 ? 1.6 : 1);
    const hg = g.createRadialGradient(0, wid * 0.15, 0, 0, wid * 0.15, hr);
    hg.addColorStop(0, `rgba(${tier.core},0.65)`); hg.addColorStop(1, `rgba(${tier.mid},0)`);
    g.fillStyle = hg; g.beginPath(); g.arc(0, wid * 0.15, hr, 0, 6.29); g.fill();
    g.globalCompositeOperation = "source-over";
  }

  function drawCrate(c, x, y, now) {
    const w = WEAPONS[c.type], k = Math.min(1, c.age * 40);
    const gl = g.createRadialGradient(x, y, 4, x, y, 44);
    gl.addColorStop(0, w.col + "88"); gl.addColorStop(1, w.col + "00");
    g.fillStyle = gl; g.beginPath(); g.arc(x, y, 44, 0, 6.29); g.fill();
    g.save(); g.translate(x, y); g.rotate(Math.sin(now / 700 + c.x) * 0.25); g.scale(k, k);
    const bg = g.createLinearGradient(0, -17, 0, 17);
    bg.addColorStop(0, "#3d2f66"); bg.addColorStop(1, "#1e1638");
    g.fillStyle = bg; g.strokeStyle = w.col; g.lineWidth = 2.5;
    rrect(-17, -17, 34, 34, 8); g.fill(); g.stroke();
    g.fillStyle = w.col;
    g.save(); g.translate(-11, -11); g.scale(22 / 24, 22 / 24); g.fill(ICON_PATHS[c.type], "evenodd"); g.restore();
    g.restore();
  }
  function drawSupply(c, x, y, now) {
    const sp = SUPPLIES[c.type], k = Math.min(1, c.age * 40), big = sp.big ? 1.3 : 1;
    const gl = g.createRadialGradient(x, y, 4, x, y, 48 * big);
    gl.addColorStop(0, sp.col + "77"); gl.addColorStop(1, sp.col + "00");
    g.fillStyle = gl; g.beginPath(); g.arc(x, y, 48 * big, 0, 6.29); g.fill();
    g.save(); g.translate(x, y); g.scale(k * big, k * big);
    if (sp.heal) {   // white box with a red cross
      g.fillStyle = "#f6f0ff"; rrect(-16, -16, 32, 32, 7); g.fill();
      g.strokeStyle = sp.col; g.lineWidth = 2.5; g.stroke();
      g.fillStyle = sp.col; g.save(); g.translate(-10, -10); g.scale(20 / 24, 20 / 24); g.fill(ICON_PATHS.cross); g.restore();
    } else if (c.type === "shield") {
      g.fillStyle = "#203e43"; g.strokeStyle = sp.col; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-9,-20);g.lineTo(-20,-13);g.lineTo(-16,5);g.lineTo(-13,21);g.lineTo(13,21);g.lineTo(16,5);g.lineTo(20,-13);g.lineTo(9,-20);g.lineTo(6,-11);g.lineTo(-6,-11);g.closePath();g.fill();g.stroke();
      g.fillStyle = sp.col;g.fillRect(-10,-3,20,5);g.fillRect(-8,8,16,4);
    } else if (c.type === "pads") {
      g.fillStyle = "#25364e";g.strokeStyle = sp.col;g.lineWidth = 3;
      for (const px of [-17,3]) {rrect(px,-15,14,30,5);g.fill();g.stroke();}
    } else if (c.type === "mega") {
      g.fillStyle = "#594021";g.strokeStyle = sp.col;g.lineWidth = 3;
      rrect(-23,-9,46,18,5);g.fill();g.stroke();g.fillStyle=sp.col;rrect(-9,-14,18,28,4);g.fill();
      g.fillStyle="#fff8b8";g.fillRect(-3,-7,6,14);
    } else {
      g.fillStyle = sp.col; g.save(); g.translate(-17, -17); g.scale(34 / 24, 34 / 24); g.fill(ICON_PATHS.shield); g.restore();
      g.fillStyle = "rgba(255,255,255,0.35)"; g.save(); g.translate(-9, -11); g.scale(18 / 24, 18 / 24); g.fill(ICON_PATHS.shield); g.restore();
    }
    g.restore();
    if ((sp.armor && !COMPACT.matches) || Math.hypot(c.x - me.x, c.y - me.y) < 260) {   // on a phone: only the ones next to you
      g.font = `700 ${12 * TS}px ` + DISPLAY_FONT; g.textAlign = "center"; g.fillStyle = sp.col;
      g.fillText(sp.name, x, y + 38 * big);
    }
  }
  // the rare nuke crate: bigger, hazard-striped, pulsing
  // Quad damage, after the arena shooters' power-up: a glowing blue sphere turning in place, a spiked ring round it,
  // the 4 burning in it, a cold glow and motes circling
  function drawAmpCrate(c, x, y, now) {
    const k = Math.min(1, c.age * 40), pulse = 0.7 + 0.3 * Math.sin(now / 160), R = 26 * k, bob = Math.sin(now / 420) * 4;
    y += bob;
    g.globalCompositeOperation = "lighter";
    const gl = g.createRadialGradient(x, y, 6, x, y, 95);
    gl.addColorStop(0, `rgba(80,140,255,${0.75 * pulse})`); gl.addColorStop(0.5, `rgba(60,90,255,${0.25 * pulse})`); gl.addColorStop(1, "rgba(60,90,255,0)");
    g.fillStyle = gl; g.beginPath(); g.arc(x, y, 95, 0, 6.29); g.fill();
    for (let i = 0; i < 10; i++) { const a = now / 520 + i * 0.628, rr = 46 + Math.sin(now / 300 + i) * 4; g.fillStyle = i % 2 ? "#d6e6ff" : "#7fb0ff"; g.beginPath(); g.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.5, 2.2, 0, 6.29); g.fill(); }
    g.globalCompositeOperation = "source-over";
    // the spiked ring, turning the other way
    g.save(); g.translate(x, y); g.rotate(-now / 900);
    g.strokeStyle = "#9cc2ff"; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, R + 7, 0, 6.29); g.stroke();
    g.fillStyle = "#c9dcff";
    for (let i = 0; i < 4; i++) { g.rotate(1.5708); g.beginPath(); g.moveTo(-5, -(R + 5)); g.lineTo(0, -(R + 17)); g.lineTo(5, -(R + 5)); g.closePath(); g.fill(); }
    g.restore();
    // the sphere: lit from the top left, a band of light running round it as it turns
    const sg = g.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.1, x, y, R);
    sg.addColorStop(0, "#f2f7ff"); sg.addColorStop(0.3, "#6aa4ff"); sg.addColorStop(0.8, "#1d3fb8"); sg.addColorStop(1, "#0c1a5c");
    g.fillStyle = sg; g.beginPath(); g.arc(x, y, R, 0, 6.29); g.fill();
    g.save(); g.beginPath(); g.arc(x, y, R, 0, 6.29); g.clip();
    const band = ((now / 1400) % 1) * 2 - 1;
    g.globalCompositeOperation = "lighter"; g.fillStyle = "rgba(150,200,255,0.25)";
    g.beginPath(); g.ellipse(x + band * R, y, R * 0.18, R, 0, 0, 6.29); g.fill();
    g.globalCompositeOperation = "source-over"; g.restore();
    // the 4, burning
    g.font = `900 ${Math.round(30 * k)}px ` + DISPLAY_FONT; g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 4; g.strokeStyle = "rgba(8,16,60,0.85)"; g.strokeText("4", x, y + 1);
    g.shadowColor = "#bfe0ff"; g.shadowBlur = 12 * pulse; g.fillStyle = "#ffffff"; g.fillText("4", x, y + 1); g.shadowBlur = 0;
    g.textBaseline = "alphabetic";
    g.font = `700 ${12 * TS}px ` + DISPLAY_FONT; g.fillStyle = "#8fb8ff";
    g.fillText("QUAD DAMAGE", x, y + R + 34 - bob);
  }
  function drawNukeCrate(c, x, y, now) {   // also the holy bomb's crate: white and gold
    const k = Math.min(1, c.age * 40), pulse = 0.6 + 0.4 * Math.sin(now / 180), col = WEAPONS[c.type].col, rgb = c.type === "holy" ? "255,243,176" : "255,225,77";
    const gl = g.createRadialGradient(x, y, 6, x, y, 90);
    gl.addColorStop(0, `rgba(${rgb},${0.55 * pulse})`); gl.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gl; g.beginPath(); g.arc(x, y, 90, 0, 6.29); g.fill();
    if (c.type === "holy" && holyImg.complete && holyImg.naturalWidth) {   // the holy bomb's crate shows the bomb itself
      const sz = 70 * k, ar = holyImg.naturalHeight / holyImg.naturalWidth;
      g.save(); g.translate(x, y); g.rotate(Math.sin(now / 900) * 0.25); g.drawImage(holyImg, -sz / 2, -sz * ar / 2, sz, sz * ar); g.restore();
      g.font = `700 ${12 * TS}px ` + DISPLAY_FONT; g.textAlign = "center"; g.fillStyle = col;
      g.fillText(WEAPONS[c.type].name.toUpperCase(), x, y + 48);
      return;
    }
    g.save(); g.translate(x, y); g.rotate(Math.sin(now / 900) * 0.15); g.scale(k * 1.35, k * 1.35);
    rrect(-20, -20, 40, 40, 9); g.save(); g.clip();
    for (let i = -6; i < 6; i++) { g.fillStyle = i % 2 ? "#1d1630" : col; g.beginPath(); g.moveTo(i * 8, -20); g.lineTo(i * 8 + 8, -20); g.lineTo(i * 8 + 48, 20); g.lineTo(i * 8 + 40, 20); g.fill(); }
    g.restore();
    g.fillStyle = "#1d1630"; rrect(-14, -14, 28, 28, 6); g.fill();
    g.fillStyle = col; g.save(); g.translate(-11, -11); g.scale(22 / 24, 22 / 24); g.fill(ICON_PATHS[c.type], "evenodd"); g.restore();
    g.restore();
    g.font = `700 ${12 * TS}px ` + DISPLAY_FONT; g.textAlign = "center"; g.fillStyle = col;
    g.fillText(WEAPONS[c.type].name.toUpperCase(), x, y + 44);
  }

  // armour that grows with level, drawn in the art's own frame (P maps art pixels of the 320px sprite)
  function armorMat(lv) {
    if (lv >= 10) return { hi: "#fff1b8", lo: "#c98a1e", edge: "#7a4f08", glow: "255,215,120" };
    if (lv >= 7) return { hi: "#e3fbff", lo: "#3d8fc9", edge: "#1d3f73", glow: "120,220,255" };
    if (lv >= 5) return { hi: "#e2dcff", lo: "#5b54c9", edge: "#2c2670", glow: "170,150,255" };
    return { hi: "#eef2f8", lo: "#8a95ad", edge: "#4a5268", glow: null };
  }
  function metal(m, P, a, b) {
    const [x1, y1] = P(a[0], a[1]), [x2, y2] = P(b[0], b[1]);
    const gr = g.createLinearGradient(x1, y1, x2, y2);
    gr.addColorStop(0, m.hi); gr.addColorStop(1, m.lo);
    return gr;
  }
  function poly(P, pts) { g.beginPath(); pts.forEach(([px, py], i) => { const [x, y] = P(px, py); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); }
  function bolt(m, P, px, py, s) {
    const [x, y] = P(px, py), r = s * 0.02;
    const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(1, m.lo);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill();
  }
  function drawWings(lv, s) {
    if (lv < 4) return;
    const m = armorMat(lv), P = (px, py) => [(px / 320 - 0.5) * s, (py / 320 - 0.5) * s];
    g.lineWidth = s * 0.012; g.strokeStyle = m.edge;
    g.fillStyle = metal(m, P, [70, 110], [20, 150]);
    poly(P, [[74, 112], [lv >= 8 ? 4 : 20, 126], [lv >= 8 ? 26 : 38, 146], [74, 154]]); g.fill(); g.stroke();
    g.fillStyle = metal(m, P, [222, 132], [292, 178]);
    poly(P, [[220, 132], [lv >= 8 ? 312 : 294, 166], [lv >= 8 ? 286 : 272, 186], [220, 178]]); g.fill(); g.stroke();
  }
  function drawArmor(lv, s, now, crown) {
    if (lv < 2) return;
    const m = armorMat(lv), P = (px, py) => [(px / 320 - 0.5) * s, (py / 320 - 0.5) * s];
    g.lineJoin = "round";
    const glowEdge = () => { if (m.glow && !lowQ) { g.save(); g.strokeStyle = `rgba(${m.glow},0.35)`; g.lineWidth = s * 0.06; g.stroke(); g.restore(); } };
    if (lv >= 3) {
      // belly plate between the face and the engine rim
      g.fillStyle = metal(m, P, [140, 150], [140, 178]);
      g.strokeStyle = m.edge; g.lineWidth = s * 0.01;
      poly(P, [[64, 147], [224, 169], [222, 182], [64, 160]]); glowEdge(); g.fill(); g.stroke();
    }
    if (lv >= 6) {
      // trim along the lid's front edge
      g.strokeStyle = m.hi; g.lineWidth = s * 0.024; g.lineCap = "round";
      g.beginPath(); [[84, 77], [150, 87], [222, 97]].forEach(([px, py], i) => { const [x, y] = P(px, py); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    }
    if (lv >= 8) {
      // horns on the lid corners
      g.fillStyle = metal(m, P, [90, 60], [60, 30]); g.strokeStyle = m.edge; g.lineWidth = s * 0.01;
      poly(P, [[96, 48], [58, 26], [84, 70]]); glowEdge(); g.fill(); g.stroke();
      g.fillStyle = metal(m, P, [240, 60], [270, 30]);
      poly(P, [[236, 58], [276, 34], [250, 76]]); glowEdge(); g.fill(); g.stroke();
    }
    // bolts
    bolt(m, P, 76, 154, s); bolt(m, P, 212, 175, s);
    if (lv >= 3) bolt(m, P, 144, 165, s);
    if (lv >= 5) {
      // glowing antenna tips
      const pulse = 0.6 + 0.4 * Math.sin(now / 250);
      const glow = m.glow || "255,255,255";
      for (const [px, py] of [[128, 17], [232, 39]]) {
        const [x, y] = P(px, py), r = s * 0.09;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(${glow},${0.9 * pulse})`); gr.addColorStop(1, `rgba(${glow},0)`);
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill();
      }
    }
    if (lv >= 10 && crown) {
      // crown on the lid
      const [cx0, cy0] = P(176, 30);
      g.save(); g.translate(cx0, cy0); g.rotate(0.13);
      const u = s * 0.012;
      const cg = g.createLinearGradient(0, -14 * u, 0, 4 * u);
      cg.addColorStop(0, "#fff6c8"); cg.addColorStop(1, "#d39a22");
      g.fillStyle = cg; g.strokeStyle = "#7a4f08"; g.lineWidth = u * 0.8;
      g.beginPath(); g.moveTo(-14 * u, 3 * u); g.lineTo(-16 * u, -10 * u); g.lineTo(-8 * u, -4 * u); g.lineTo(0, -15 * u);
      g.lineTo(8 * u, -4 * u); g.lineTo(16 * u, -10 * u); g.lineTo(14 * u, 3 * u); g.closePath(); g.fill(); g.stroke();
      for (const [gx, gc] of [[-8, "#ff5a6e"], [0, "#4fd6c8"], [8, "#c38bff"]]) { g.fillStyle = gc; g.beginPath(); g.arc(gx * u, -1 * u, 2.2 * u, 0, 6.29); g.fill(); }
      g.restore();
    }
  }

  function rainbowFlame(now) {
    const h = (now / 8) % 360;
    const c = (dh, sat, l) => hsl2rgb((h + dh) % 360, sat, l).map(Math.round);
    return { outer: c(0, 1, 0.55), mid: c(40, 1, 0.65), core: c(80, 1, 0.9) };
  }
  // hats sit on the lid in the art's frame (same anchor as the crown)
  function drawHat(hat, s, now) {
    const [cx0, cy0] = [(176 / 320 - 0.5) * s, (30 / 320 - 0.5) * s], u = s * 0.012;
    g.save(); g.translate(cx0, cy0); g.rotate(0.13);
    g.lineJoin = "round";
    if (hat === "party") {
      g.save(); g.beginPath(); g.moveTo(-12 * u, 2 * u); g.lineTo(0, -30 * u); g.lineTo(12 * u, 2 * u); g.closePath(); g.clip();
      for (let k = -2; k < 6; k++) { g.fillStyle = k % 2 ? "#ff6fd8" : "#ffe66b"; g.fillRect(-14 * u, (-30 + k * 7) * u, 28 * u, 7 * u); }
      g.restore();
      g.fillStyle = "#7df9ff"; g.beginPath(); g.arc(0, -31 * u, 4 * u, 0, 6.29); g.fill();
    } else if (hat === "tophat") {
      g.fillStyle = "#1d1630"; g.beginPath(); g.ellipse(0, 1 * u, 20 * u, 5 * u, 0, 0, 6.29); g.fill();
      g.fillRect(-12 * u, -22 * u, 24 * u, 23 * u);
      g.fillStyle = "#ff5a6e"; g.fillRect(-12 * u, -6 * u, 24 * u, 5 * u);
      g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(-9 * u, -21 * u, 4 * u, 14 * u);
    } else if (hat === "halo") {
      const bob = Math.sin(now / 400) * 2 * u;
      g.strokeStyle = "rgba(255,230,140,0.45)"; g.lineWidth = 7 * u;
      g.beginPath(); g.ellipse(0, -20 * u + bob, 17 * u, 5 * u, 0, 0, 6.29); g.stroke();
      g.strokeStyle = "#ffe9a3"; g.lineWidth = 3 * u;
      g.beginPath(); g.ellipse(0, -20 * u + bob, 17 * u, 5 * u, 0, 0, 6.29); g.stroke();
    } else if (hat === "bow") {
      g.translate(10 * u, -4 * u);
      g.fillStyle = "#ff6fae"; g.strokeStyle = "#b8326f"; g.lineWidth = 1.2 * u;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-13 * u, -8 * u); g.lineTo(-13 * u, 8 * u); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(13 * u, -8 * u); g.lineTo(13 * u, 8 * u); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = "#ff9ccc"; g.beginPath(); g.arc(0, 0, 4 * u, 0, 6.29); g.fill(); g.stroke();
    } else if (hat === "hardhat") {   // a yellow site helmet
      g.fillStyle = "#ffc61a"; g.beginPath(); g.arc(0, 0, 15 * u, Math.PI, 0); g.closePath(); g.fill();
      g.fillStyle = "#e0a400"; g.beginPath(); g.ellipse(0, 0, 21 * u, 4 * u, 0, 0, 6.29); g.fill();
      g.fillStyle = "#ffe27a"; g.fillRect(-2.5 * u, -15 * u, 5 * u, 15 * u);
      g.fillStyle = "rgba(255,255,255,0.35)"; g.beginPath(); g.ellipse(-6 * u, -8 * u, 3 * u, 5 * u, -0.5, 0, 6.29); g.fill();
    } else if (hat === "cone") {   // a traffic cone, white bands and all
      g.fillStyle = "#d8501a"; g.fillRect(-14 * u, -2 * u, 28 * u, 5 * u);
      g.fillStyle = "#ff6a1a"; g.beginPath(); g.moveTo(-11 * u, -1 * u); g.lineTo(-2 * u, -32 * u); g.lineTo(2 * u, -32 * u); g.lineTo(11 * u, -1 * u); g.closePath(); g.fill();
      g.fillStyle = "#f4f4f4";
      for (const [y0, y1] of [[-10, -6], [-21, -17]]) { const w0 = 11 - (-y0) * 0.28, w1 = 11 - (-y1) * 0.28; g.beginPath(); g.moveTo(-w0 * u, y0 * u); g.lineTo(-w1 * u, y1 * u); g.lineTo(w1 * u, y1 * u); g.lineTo(w0 * u, y0 * u); g.closePath(); g.fill(); }
    } else if (hat === "hivis") {   // a hi-vis beanie with a reflective band
      g.fillStyle = "#c8ff2a"; g.beginPath(); g.arc(0, 0, 15 * u, Math.PI, 0); g.closePath(); g.fill();
      g.fillStyle = "#d8dde4"; g.fillRect(-15 * u, -5 * u, 30 * u, 4 * u);
      g.fillStyle = "#c8ff2a"; g.beginPath(); g.arc(0, -15 * u, 4 * u, 0, 6.29); g.fill();
    } else if (hat === "recycle") {   // three green recycling arrows chasing round above the lid
      g.translate(0, -18 * u); g.scale(1, 0.45); g.rotate(now / 700);
      g.fillStyle = "#3ad06a"; g.strokeStyle = "#1e7a40"; g.lineWidth = 1.2 * u;
      for (let k = 0; k < 3; k++) {
        g.rotate(Math.PI * 2 / 3);
        g.beginPath(); g.arc(0, 0, 17 * u, -0.3, 0.9); g.arc(0, 0, 11 * u, 0.9, -0.3, true); g.closePath(); g.fill(); g.stroke();
        const a = 0.9; g.beginPath(); g.moveTo(Math.cos(a) * 8 * u, Math.sin(a) * 8 * u); g.lineTo(Math.cos(a) * 20 * u, Math.sin(a) * 20 * u); g.lineTo(Math.cos(a + 0.45) * 14 * u, Math.sin(a + 0.45) * 14 * u); g.closePath(); g.fill(); g.stroke();
      }
    } else if (hat === "cap") {
      g.fillStyle = "#ff5a6e"; g.beginPath(); g.arc(0, 0, 14 * u, Math.PI, 0); g.closePath(); g.fill();
      g.fillStyle = "#c8324a"; g.beginPath(); g.ellipse(12 * u, 0, 13 * u, 3.5 * u, 0, 0, 6.29); g.fill();
      g.fillStyle = "#ffffff"; g.beginPath(); g.arc(0, -14 * u, 2.5 * u, 0, 6.29); g.fill();
    }
    g.restore();
  }

  // soot and cracks, more as lives run out (art-pixel coordinates of the 320px sprite, away from the face)
  const SOOT = [[80, 166], [206, 182], [136, 54], [228, 122]];
  const CRACKS = [
    [[68, 118], [84, 128], [78, 140], [92, 152]],
    [[216, 148], [204, 160], [211, 171], [198, 183]],
    [[148, 44], [160, 55], [151, 64], [166, 73]]
  ];
  function drawDamage(dmg, s, now, seed) {
    if (dmg <= 0) return;
    const P = (px, py) => [(px / 320 - 0.5) * s, (py / 320 - 0.5) * s];
    for (let i = 0; i < Math.ceil(dmg * SOOT.length); i++) {
      const [x, y] = P(SOOT[i][0], SOOT[i][1]), r = s * 0.1;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(25,18,32,${0.25 + dmg * 0.35})`); gr.addColorStop(1, "rgba(25,18,32,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill();
    }
    const nCracks = dmg >= 0.6 ? 3 : dmg >= 0.3 ? 2 : 1;
    g.lineJoin = "round"; g.lineCap = "round";
    for (let i = 0; i < nCracks; i++) {
      g.beginPath(); CRACKS[i].forEach(([px, py], j) => { const [x, y] = P(px, py); j ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.strokeStyle = "rgba(25,18,32,0.75)"; g.lineWidth = s * 0.018; g.stroke();
      if (dmg >= 0.6) {   // last life: the cracks glow like embers
        g.strokeStyle = `rgba(255,140,50,${0.5 + 0.4 * Math.sin(now / 90 + seed + i)})`; g.lineWidth = s * 0.007; g.stroke();
      }
    }
  }

  // the weapon you carry is mounted on the wings, so everyone can see what is coming at them.
  // Drawn in art pixels; -y points the way the bin flies.
  let mountHeat = 0, barrelA = 0;   // my minigun's heat; its barrels' turn   (the blades are drawn on their own: drawBlade)
  function drawMounts(weapon, s, now) {
    if (!weapon) return;
    const u = s / 320, mounts = mountsOf(weapon);
    for (const [mx, my] of mounts) {
      g.save();
      g.translate((mx / 320 - 0.5) * s, (my / 320 - 0.5) * s);
      g.rotate(SPRITE_TILT); g.scale(u * 1.35, u * 1.35);
      if (weapon === "fire") {
        g.fillStyle = "#252c35"; rrect(-8, -9, 16, 23, 3); g.fill();
        const slide = g.createLinearGradient(-9, 0, 9, 0); slide.addColorStop(0, "#626d79"); slide.addColorStop(.5, "#dce4e9"); slide.addColorStop(1, "#687481");
        g.fillStyle = slide; rrect(-9, -43, 18, 38, 3); g.fill();
        g.fillStyle = "#111820"; g.fillRect(-5, -45, 10, 6);
        g.fillStyle = "#e9b45d"; g.fillRect(-2, -38, 4, 8);
      } else if (weapon === "laser") {
        const bg = g.createLinearGradient(-6, 0, 6, 0); bg.addColorStop(0, "#5a6684"); bg.addColorStop(0.5, "#dfe7f5"); bg.addColorStop(1, "#5a6684");
        g.fillStyle = bg; rrect(-6, -58, 12, 66, 5); g.fill();
        g.fillStyle = "#2a3550"; g.fillRect(-8, -10, 16, 12);
        const pulse = 0.6 + 0.4 * Math.sin(now / 120);
        const tg = g.createRadialGradient(0, -60, 0, 0, -60, 16);
        tg.addColorStop(0, `rgba(230,255,185,${pulse})`); tg.addColorStop(0.4, `rgba(145,255,75,${0.8 * pulse})`); tg.addColorStop(1, "rgba(145,255,75,0)");
        g.fillStyle = tg; g.beginPath(); g.arc(0, -60, 16, 0, 6.29); g.fill();
      } else if (weapon === "rocket") {
        g.fillStyle = "#3b2d5c"; rrect(-15, -26, 30, 40, 6); g.fill();
        for (const rx of [-7, 7]) {
          g.fillStyle = "#f4f1ff"; g.fillRect(rx - 4, -40, 8, 18);
          g.fillStyle = "#ff5a6e"; g.beginPath(); g.moveTo(rx - 4, -40); g.quadraticCurveTo(rx, -54, rx + 4, -40); g.fill();
        }
        g.fillStyle = "#ff5a6e"; g.fillRect(-15, -6, 30, 5);
      } else if (weapon === "scatter") {   // short double barrel with a wide flared muzzle
        g.fillStyle = "#3b2d5c"; rrect(-16, -8, 32, 16, 5); g.fill();
        for (const bx of [-7, 7]) {
          g.fillStyle = "#8a7fb0"; rrect(bx - 5, -34, 10, 30, 3); g.fill();
          g.fillStyle = "#ffd27a"; g.beginPath(); g.moveTo(bx - 5, -34); g.lineTo(bx - 8, -42); g.lineTo(bx + 8, -42); g.lineTo(bx + 5, -34); g.fill();
        }
      } else if (weapon === "rail") {   // long rail wrapped in glowing coils
        g.fillStyle = "#3b2d5c"; rrect(-10, -6, 20, 16, 4); g.fill();
        g.fillStyle = "#cfc6e8"; rrect(-4, -82, 8, 80, 3); g.fill();
        const pulse = 0.55 + 0.45 * Math.sin(now / 140);
        for (let c = 0; c < 4; c++) { g.fillStyle = `rgba(217,168,255,${0.5 + 0.5 * pulse})`; rrect(-9, -70 + c * 16, 18, 6, 3); g.fill(); }
        const tg = g.createRadialGradient(0, -84, 0, 0, -84, 14);
        tg.addColorStop(0, `rgba(255,255,255,${pulse})`); tg.addColorStop(1, "rgba(217,168,255,0)");
        g.fillStyle = tg; g.beginPath(); g.arc(0, -84, 14, 0, 6.29); g.fill();
      } else if (weapon === "mine") {   // a drum of mines with a blinking light
        g.fillStyle = "#3b2d5c"; rrect(-17, -30, 34, 40, 8); g.fill();
        for (const my of [-18, -2]) { g.fillStyle = "#6d5a8e"; g.beginPath(); g.arc(0, my, 8, 0, 6.29); g.fill(); }
        g.fillStyle = Math.floor(now / 300) % 2 ? "#ff6b3c" : "#5a2418"; g.beginPath(); g.arc(0, -36, 4, 0, 6.29); g.fill();
      } else if (weapon === "orb") {   // a ring emitter cradling a glowing sphere
        g.fillStyle = "#3b2d5c"; rrect(-13, -12, 26, 20, 6); g.fill();
        g.strokeStyle = "#8a7fb0"; g.lineWidth = 5; g.beginPath(); g.arc(0, -32, 15, 0, 6.29); g.stroke();
        const og = g.createRadialGradient(0, -32, 0, 0, -32, 14);
        og.addColorStop(0, "#ffffff"); og.addColorStop(0.5, `rgba(111,216,255,${0.7 + 0.3 * Math.sin(now / 120)})`); og.addColorStop(1, "rgba(111,216,255,0)");
        g.fillStyle = og; g.beginPath(); g.arc(0, -32, 14, 0, 6.29); g.fill();
      } else if (weapon === "bolt") {   // two prongs with an arc crackling between them
        g.fillStyle = "#3b2d5c"; rrect(-14, -10, 28, 18, 5); g.fill();
        g.fillStyle = "#cfc6e8"; rrect(-11, -58, 6, 50, 3); g.fill(); rrect(5, -58, 6, 50, 3); g.fill();
        g.strokeStyle = "#bfefff"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-8, -56);
        for (let k = 1; k < 5; k++) g.lineTo(-8 + k * 4, -56 + (Math.random() - 0.5) * 10);
        g.stroke();
      } else if (weapon === "shard") {   // a stubby cannon with glowing heat vents
        g.fillStyle = "#3b2d5c"; rrect(-15, -48, 30, 54, 7); g.fill();
        for (let k = 0; k < 3; k++) { g.fillStyle = `rgba(255,154,60,${0.6 + 0.4 * Math.sin(now / 150 + k)})`; g.fillRect(-11, -38 + k * 11, 22, 4); }
        g.fillStyle = "#1d1630"; g.beginPath(); g.arc(0, -48, 9, 0, 6.29); g.fill();
      } else if (weapon === "triple") {
        for (const bx of [-11, 0, 11]) {
          g.fillStyle = "#6d5a8e"; rrect(bx - 3.5, -40, 7, 44, 3); g.fill();
          g.fillStyle = "#ffb43c"; g.fillRect(bx - 3.5, -42, 7, 5);
        }
        g.fillStyle = "#3b2d5c"; rrect(-17, -6, 34, 12, 4); g.fill();
      } else if (weapon === "nuke") {
        g.fillStyle = "#1d1630"; g.beginPath(); g.moveTo(-18, 12); g.lineTo(-10, -4); g.lineTo(10, -4); g.lineTo(18, 12); g.fill();
        g.save(); rrect(-11, -78, 22, 82, 9); g.clip();
        for (let i = -12; i < 4; i++) { g.fillStyle = i % 2 ? "#1d1630" : "#ffe14d"; g.beginPath(); g.moveTo(-12, i * 10); g.lineTo(12, i * 10 - 10); g.lineTo(12, i * 10); g.lineTo(-12, i * 10 + 10); g.fill(); }
        g.restore();
        g.fillStyle = "#1d1630"; g.beginPath(); g.moveTo(-11, -74); g.quadraticCurveTo(0, -98, 11, -74); g.fill();
        g.fillStyle = "#ffe14d"; g.save(); g.translate(-8, -46); g.scale(16 / 24, 16 / 24); g.fill(ICON_PATHS.nuke, "evenodd"); g.restore();
      } else if (weapon === "gamma") {   // a demonic orb mounted on the launcher
        g.fillStyle = "#3b2d5c"; rrect(-12, -20, 24, 26, 6); g.fill();
        drawDemonicOrb(0, -39, 18, now);
      } else if (weapon === "tele") {   // a little dish with a cyan tip
        g.fillStyle = "#3b2d5c"; rrect(-5, -24, 10, 28, 3); g.fill();
        g.fillStyle = "#5a6684"; g.beginPath(); g.ellipse(0, -28, 16, 6, 0, 0, 6.29); g.fill();
        g.fillStyle = "#8ff0ff"; g.beginPath(); g.arc(0, -38, 5 + Math.sin(now / 150), 0, 6.29); g.fill();
      } else if (weapon === "minigun") {   // a cluster of barrels that spins faster as it spins up
        g.fillStyle = "#3b2d5c"; rrect(-13, -14, 26, 20, 5); g.fill();
        const turn = barrelA;   // (spun up, the barrels blur into one)
        for (let k = 0; k < 6; k++) { const ph = turn + k * 1.047, off = Math.sin(ph) * 7, front = Math.cos(ph) > 0; if (!front) continue; g.fillStyle = k % 2 ? "#8a7fb0" : "#cfc6e8"; rrect(off - 2.5, -64, 5, 52, 2); g.fill(); }
        g.fillStyle = "#2a2140"; for (const yy of [-56, -38]) g.fillRect(-9, yy, 18, 3);   // the barrel clamps
        g.fillStyle = "#ffe08a"; g.fillRect(-9, -66, 18, 4);
        if (mountHeat > 0.05) {   // the barrels glow red-hot as it spins (and white-hot when it overheats)
          g.globalCompositeOperation = "lighter";
          const hg = g.createLinearGradient(0, -66, 0, -30); hg.addColorStop(0, `rgba(255,${me.overheat ? 230 : 90},40,${0.85 * mountHeat})`); hg.addColorStop(1, "rgba(255,60,20,0)");
          g.fillStyle = hg; rrect(-10, -66, 20, 36, 4); g.fill(); g.globalCompositeOperation = "source-over";
        }
      } else if (weapon === "gauss") {   // a long barrel in blue coils
        g.fillStyle = "#3b2d5c"; rrect(-10, -6, 20, 16, 4); g.fill();
        g.fillStyle = "#cfc6e8"; rrect(-4, -78, 8, 76, 3); g.fill();
        for (let k = 0; k < 4; k++) { g.fillStyle = `rgba(127,184,255,${0.5 + 0.5 * Math.sin(now / 120 + k)})`; rrect(-8, -66 + k * 15, 16, 7, 3); g.fill(); }
      } else if (weapon === "nail") {   // the nailgun: a squat block with a nail magazine on top and a short muzzle
        g.fillStyle = "#3b2d5c"; rrect(-13, -20, 26, 28, 5); g.fill();
        g.fillStyle = "#8a93ad"; rrect(-9, -30, 18, 10, 3); g.fill();
        for (let i = -2; i <= 2; i++) { g.fillStyle = "#e8eef8"; g.fillRect(i * 3.4 - 0.8, -28, 1.6, 7); }
        g.fillStyle = "#cfd6e2"; rrect(-4, -46, 8, 18, 2); g.fill();
      } else if (weapon === "gren") {   // the grenade launcher: a fat drum and a stubby wide tube
        g.fillStyle = "#3b2d5c"; rrect(-12, -10, 24, 18, 5); g.fill();
        g.fillStyle = "#4a7a3a"; g.beginPath(); g.arc(0, -16, 12, 0, 6.29); g.fill();
        g.fillStyle = "#26301e"; for (let i = 0; i < 6; i++) { const a = i * 1.047; g.beginPath(); g.arc(Math.cos(a) * 7, -16 + Math.sin(a) * 7, 2.4, 0, 6.29); g.fill(); }
        g.fillStyle = "#6b6f80"; rrect(-7, -44, 14, 18, 3); g.fill();
        g.fillStyle = "#8fd06a"; g.fillRect(-7, -44, 14, 3);
      } else if (weapon === "holy") {   // the golden orb held up on a short post, halo above
        g.fillStyle = "#3b2d5c"; rrect(-5, -26, 10, 30, 3); g.fill();
        const og = g.createRadialGradient(-5, -44, 2, 0, -40, 17);
        og.addColorStop(0, "#fffbe6"); og.addColorStop(0.5, "#ffd76a"); og.addColorStop(1, "#b07a1e");
        g.fillStyle = og; g.beginPath(); g.arc(0, -40, 17, 0, 6.29); g.fill();
        g.strokeStyle = "#fff3b0"; g.lineWidth = 4; g.beginPath(); g.ellipse(0, -68, 15, 5, 0, 0, 6.29); g.stroke();
      }
      g.restore();
    }
  }

  function starPath(x, y, r, rot) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot + i * Math.PI / 5, l = i % 2 ? r * 0.45 : r;
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    }
    g.closePath();
  }

  // the crosshair: a ring ahead of the bin on the line its shots take, in the gun's colour; red and tighter when
  // someone you can hurt is on that line
  function drawAim(now) {
    if (charge > 0 && playing && !me.dead && !WEAPONS[me.weapon]?.sword) {   // (the sword shows its wind-up on the blade itself)   // the charge cannon filling up: a ring round the bin, white-hot when full
      const x = sx(me.x), y = sy(me.y), R = 70 * sizeOf(me.lv), full = charge >= 1;
      g.save(); g.lineCap = "round";
      g.strokeStyle = "rgba(127,184,255,0.25)"; g.lineWidth = 6; g.beginPath(); g.arc(x, y, R, 0, 6.29); g.stroke();
      g.strokeStyle = full && Math.floor(now / 90) % 2 ? "#ffffff" : "#7fb8ff"; g.lineWidth = 6;
      g.beginPath(); g.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + charge * 6.283); g.stroke();
      g.restore();
    }
    if (railCharge > 0 && playing && !me.dead && me.weapon === "laser") {   // a Plasma Nova charging: a ball of plasma swelling at the gun, crackling
      const mz = muzzleOf({ ...me, gunSide: 0 }, "laser"), c = railCharge, x0 = sx(mz.x), y0 = sy(mz.y), r = 6 + 16 * c, full = c >= 1;
      g.save(); g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.2 + 0.25 * c; g.drawImage(dotSprite("#7dff3a"), x0 - r * 3, y0 - r * 3, r * 6, r * 6);
      g.globalAlpha = 1; g.drawImage(fireSprite(2 + ((now / 45) | 0) % 3, 1, DEMON_RAMP), x0 - r * 1.3, y0 - r * 1.3, r * 2.6, r * 2.6);
      g.strokeStyle = full && Math.floor(now / 80) % 2 ? "#ffffff" : "rgba(210,255,170,0.9)"; g.lineWidth = 1.4;
      for (let k = 0; k < 2 + Math.round(3 * c); k++) { let an = Math.random() * 6.283, rr = r * 0.5; g.beginPath(); g.moveTo(x0 + Math.cos(an) * rr, y0 + Math.sin(an) * rr); for (let n = 0; n < 3; n++) { an += 0.4 + Math.random() * 0.5; rr = r * (0.9 + Math.random() * 0.9); g.lineTo(x0 + Math.cos(an) * rr, y0 + Math.sin(an) * rr); } g.stroke(); }
      g.fillStyle = "#ffffff"; g.beginPath(); g.arc(x0, y0, r * 0.35, 0, 6.29); g.fill();
      g.restore();
    } else if (railCharge > 0 && playing && !me.dead) {   // the railgun charging: a blue ring filling round the bin, and a sight line that firms up
      const x0 = sx(me.x), y0 = sy(me.y), R = 70 * sizeOf(me.lv), full = railCharge >= 1, ca = Math.cos(me.a), sa = Math.sin(me.a);
      g.save(); g.lineCap = "round";
      g.strokeStyle = "rgba(127,184,255,0.25)"; g.lineWidth = 6; g.beginPath(); g.arc(x0, y0, R, 0, 6.29); g.stroke();
      g.strokeStyle = full && Math.floor(now / 90) % 2 ? "#ffffff" : "#7fb8ff"; g.lineWidth = 6;
      g.beginPath(); g.arc(x0, y0, R, -Math.PI / 2, -Math.PI / 2 + railCharge * 6.283); g.stroke();
      g.strokeStyle = `rgba(127,184,255,${0.15 + 0.4 * railCharge})`; g.lineWidth = 2 * (24 + 48 * railCharge); g.globalAlpha = 0.22; g.setLineDash([16, 10]); g.lineDashOffset = -now / 15;
      g.beginPath(); g.moveTo(x0 + ca * R, y0 + sa * R); g.lineTo(x0 + ca * 1100, y0 + sa * 1100); g.stroke();
      g.restore();
    }
    if (rocketLoad > 0 && playing && !me.dead) {   // rockets loading: three segments round the bin, the next one filling, and a rocket for each loaded one
      const x = sx(me.x), y = sy(me.y), R = 70 * sizeOf(me.lv), avail = Math.min(ROCKET_MAX, me.arsenal.rocket || 0);
      const part = Math.min(1, (rocketLoadTime % ROCKET_LOAD) / ROCKET_LOAD), seg = 6.283 / ROCKET_MAX, gap = 0.18;
      g.save(); g.lineCap = "round";
      for (let i = 0; i < ROCKET_MAX; i++) {
        const a0 = -Math.PI / 2 + i * seg + gap / 2, a1 = a0 + seg - gap;
        g.strokeStyle = i < avail ? "rgba(255,90,110,0.22)" : "rgba(120,120,140,0.15)"; g.lineWidth = 7; g.beginPath(); g.arc(x, y, R, a0, a1); g.stroke();
        const f = i < rocketLoad ? 1 : i === rocketLoad && i < avail ? part : 0;
        if (f > 0) { g.strokeStyle = f >= 1 ? "#ff5a6e" : "rgba(255,170,120,0.9)"; g.lineWidth = 7; g.beginPath(); g.arc(x, y, R, a0, a0 + (a1 - a0) * f); g.stroke(); }
      }
      for (let i = 0; i < rocketLoad; i++) {   // the loaded rockets, side by side over the bin
        const rx = x + (i - (rocketLoad - 1) / 2) * 16, ry = y - R - 18;
        g.fillStyle = "#ff5a6e"; g.fillRect(rx - 3, ry - 8, 6, 14);
        g.fillStyle = "#ffe0a0"; g.beginPath(); g.moveTo(rx - 3, ry - 8); g.lineTo(rx, ry - 13); g.lineTo(rx + 3, ry - 8); g.fill();
      }
      g.restore();
    }
    if ((settings.aim === "off" && !aimLocked()) || !playing || me.dead || guided) return;
    const w = WEAPONS[me.weapon], col = w.col || "#ffb43c", a = me.a + (w.back ? Math.PI : 0), ca = Math.cos(a), sa = Math.sin(a);
    const D = (w.back ? 120 : 250) * sizeOf(me.lv), x0 = sx(me.x), y0 = sy(me.y);
    let lock = false;
    for (const [id, r] of remotes) {   // anyone near the line of fire, within reach
      if (r.dead || mates(r, me)) continue;
      const dx = r.x - me.x, dy = r.y - me.y, along = dx * ca + dy * sa, off = Math.abs(-dx * sa + dy * ca);
      if (along > 0 && along < 1300 && off < 30 + 26 * sizeOf(r.lv || 1)) { lock = true; break; }
    }
    const big = settings.aim === "big", own = { white: "#ffffff", green: "#5dff8a", red: "#ff5a5a" }[settings.aimCol];
    let x = x0 + ca * D, y = y0 + sa * D;
    if (mouseAim() && !w.back) [x, y] = cursorAt();   // mouse aim: the crosshair is the cursor
    const c = lock ? (settings.aimCol === "red" ? "#ffffff" : "#ff5a5a") : own || col, R = (lock ? 10 : 13) * (big ? 1.7 : 1);
    g.save();
    g.globalAlpha = 0.28; g.strokeStyle = c; g.lineWidth = 1.5; g.setLineDash([6, 8]);
    const Lx = Math.hypot(x - x0, y - y0) || 1, ex = x - (x - x0) / Lx * R, ey = y - (y - y0) / Lx * R;
    if (Lx > 40 * sizeOf(me.lv) + R) { g.beginPath(); g.moveTo(x0 + ca * 40 * sizeOf(me.lv), y0 + sa * 40 * sizeOf(me.lv)); g.lineTo(ex, ey); g.stroke(); }
    g.setLineDash([]); g.globalAlpha = 0.9; g.lineWidth = big ? 3 : 2;
    g.translate(x, y); g.rotate(now / 900);
    g.beginPath(); g.arc(0, 0, R, 0, 6.29); g.stroke();
    for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(R + 3, 0); g.lineTo(R + (big ? 14 : 9), 0); g.stroke(); }
    g.fillStyle = c; g.beginPath(); g.arc(0, 0, 2, 0, 6.29); g.fill();
    g.restore();
  }
  function drawBot(b, x, y, now, isMe) {
    const lv = b.lv || 1, sz = sizeOf(lv), tier = tierOf(lv), S = BOT * sz;
    if (b.blink && Math.floor(now / 90) % 2) g.globalAlpha = 0.35;
    // aura from Lv 4
    const shield = isMe ? me.shield : b.shield || 0;
    if (shield > 0) {
      const hit = isMe ? Math.max(0, 1 - (now - shieldHitAt) / 300) : 0;
      const br = S * 0.82, bub = g.createRadialGradient(x, y, br * 0.55, x, y, br);
      bub.addColorStop(0, "rgba(111,194,255,0)"); bub.addColorStop(0.85, `rgba(111,194,255,${0.12 + 0.04 * shield + 0.4 * hit})`); bub.addColorStop(1, "rgba(111,194,255,0)");
      g.fillStyle = bub; g.beginPath(); g.arc(x, y, br, 0, 6.29); g.fill();
      g.strokeStyle = `rgba(190,230,255,${0.25 + 0.05 * shield + 0.6 * hit})`; g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, br * (0.93 + 0.02 * Math.sin(now / 200)), 0, 6.29); g.stroke();
    }
    if (tier.aura && !lowQ) {
      const ar = S * (0.78 + 0.06 * Math.sin(now / 300));
      const au = g.createRadialGradient(x, y, S * 0.15, x, y, ar);
      au.addColorStop(0, `rgba(${tier.aura},0.38)`); au.addColorStop(1, `rgba(${tier.aura},0)`);
      g.fillStyle = au; g.beginPath(); g.arc(x, y, ar, 0, 6.29); g.fill();
    }
    // orbiting stars, one per two levels (behind the bin on the far side)
    const orbs = Math.floor(lv / 2);
    const orbit = front => {
      for (let o = 0; o < orbs; o++) {
        const a = now / 650 + o * 6.283 / orbs, inFront = Math.sin(a) > 0;
        if (inFront !== front) continue;
        g.fillStyle = tier.aura ? `rgb(${tier.aura})` : "#ffffff";
        starPath(x + Math.cos(a) * S * 0.7, y + Math.sin(a) * S * 0.3, 3 + lv * 0.45, now / 400 + o);
        g.fill();
      }
    };
    orbit(false);

    if (b.ampUntil > now || b.amp) {   // Quad damage: a blue aura around the bin
      g.globalCompositeOperation = "lighter";
      const ar = S * (0.85 + 0.08 * Math.sin(now / 90)), ag = g.createRadialGradient(x, y, S * 0.2, x, y, ar);
      ag.addColorStop(0, "rgba(91,155,255,0)"); ag.addColorStop(0.7, "rgba(91,155,255,0.42)"); ag.addColorStop(1, "rgba(91,155,255,0)");
      g.fillStyle = ag; g.beginPath(); g.arc(x, y, ar, 0, 6.29); g.fill();
      g.globalCompositeOperation = "source-over";
    }
    const pose = binPose(b, now), s = pose.s;
    const fl = b.ck ? customVal(b.ck, "flame") : null;
    const firePal = fl === "rainbow" ? rainbowFlame(now) : fl ? FLAMES[fl] : tier;
    const bf = isMe ? me.boostFx : b.boost || 0;
    const burst = isMe ? Math.max(0, 1 - (now - me.dashAt) / 350) : bf === 2 ? 1 : 0;
    const sputter = Number.isFinite(b.lives) && damageOf(b) > 0.6 ? 0.65 + 0.35 * Math.abs(Math.sin(now / 47 + b.x)) : 1;
    if (isMe) me.flamePal = firePal; else b.flamePal = firePal;   // (the plume's particles take its colours: emitPlume)
    for (const j of exhaustJets(b, now)) {
      g.save(); g.translate(x + j.x - b.x, y + j.y - b.y); g.rotate(j.a - Math.PI / 2);
      const power = j.power * sputter, len = s * (j.main ? 0.65 : 0.4) * power * (1 + (bf ? 1.7 : 0) + burst * 0.8);
      const wid = s * (j.main ? 0.24 : 0.12) * Math.sqrt(power) * (bf ? 1.5 : 1);
      const lat = (b.vx || 0) * Math.sin(j.a) - (b.vy || 0) * Math.cos(j.a), bend = clamp(lat * 0.09, -wid * 3, wid * 3);
      drawJet(len, wid, now, firePal, !!bf, (b.hue || 0) * 0.1 + (j.main ? 0 : 3) + (b.x || 0) * 0.001, bend, power);   // (the fire beyond it: its particles, drawPlume)
      if (j.main) {   // the main engine's bell: dark metal, its rim glowing hot with the burn (white-hot on boost)
        g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
        const bw = Math.max(9, wid * 0.85), bl = bw * 0.7, mg = g.createLinearGradient(-bw, 0, bw, 0);
        mg.addColorStop(0, "#1b2230"); mg.addColorStop(0.45, "#5c6b80"); mg.addColorStop(0.6, "#8a9ab0"); mg.addColorStop(1, "#1b2230");
        g.fillStyle = mg; g.beginPath(); g.moveTo(-bw * 0.55, -bl); g.lineTo(bw * 0.55, -bl); g.lineTo(bw, 2); g.lineTo(-bw, 2); g.closePath(); g.fill();
        const heat = Math.min(1, power * (bf ? 1.2 : 0.7));
        g.globalCompositeOperation = "lighter"; g.strokeStyle = bf ? `rgba(255,240,210,${0.9 * heat})` : `rgba(255,${120 + 80 * heat},60,${0.8 * heat})`; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(-bw, 2); g.lineTo(bw, 2); g.stroke(); g.globalCompositeOperation = "source-over";
      }
      if (!j.main) { // metal lip at the fixed manoeuvring nozzle
        g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
        g.fillStyle = "#253241"; g.beginPath(); g.moveTo(-wid * 0.6, -4); g.lineTo(wid * 0.6, -4); g.lineTo(wid * 0.45, 3); g.lineTo(-wid * 0.45, 3); g.closePath(); g.fill();
        g.strokeStyle = "#9cb3c2"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-wid * 0.45, 3); g.lineTo(wid * 0.45, 3); g.stroke();
      }
      g.restore();
    }
    // a jolt (a crash, a ram, a hard blow, a dash): the hull squashes along it and springs back, wobbling
    const pvx = b.jvx ?? b.vx ?? 0, pvy = b.jvy ?? b.vy ?? 0, jdv = Math.hypot((b.vx || 0) - pvx, (b.vy || 0) - pvy);
    b.jvx = b.vx || 0; b.jvy = b.vy || 0;
    if (jdv > 380 && !b.dead && jdv < 4000) { const k = Math.min(1, (jdv - 300) / 1200); if (k > (b.joltK || 0) * Math.exp(-(now - (b.joltAt || 0)) / 140)) { b.joltAt = now; b.joltK = k; b.joltA = Math.atan2((b.vy || 0) - pvy, (b.vx || 0) - pvx) - pose.a; } }
    const jt = (now - (b.joltAt || -1e9)) / 1000, jk = jt < 0.6 ? (b.joltK || 0) * Math.exp(-jt / 0.14) * Math.cos(jt * 38) * 0.22 : 0;
    g.save(); g.translate(x, y); g.rotate(pose.a);
    if (jk) { g.rotate(b.joltA); g.scale(1 - jk, 1 + jk * 0.8); g.rotate(-b.joltA); }   // (squashed along the blow, bulging across it)
    g.scale(pose.scaleX, 1);
    drawWings(lv, s);
    mountHeat = isMe ? Math.max(spin, Math.min(1, me.heat || 0)) : 0;
    // a minigun's barrels turn with its spin (mine: the trigger's spin-up; another's: how hard it has been firing)
    { const sv = isMe ? spin : (b.spinVis = Math.max(0, (b.spinVis || 0) - Math.min(0.1, (now - (b.spinT || now)) / 1000) * 1.2)), dtv = Math.min(0.1, (now - (b.barrelT || now)) / 1000);
      b.spinT = b.barrelT = now; b.barrelA = (b.barrelA || 0) + (0.4 + sv * sv * 30) * dtv; barrelA = b.barrelA; if (!isMe) mountHeat = Math.max(mountHeat, sv * 0.8); }
    drawMounts(isMe ? me.weapon : b.weapon, s, now);
    if (body) {
      g.drawImage(b.ck ? tintedBody(teamCk(b)) : body, -s / 2, -s / 2, s, s);
      if (!lowQ) {   // light on the hull: a sheen from the top left that stays put as it turns, and its engines' glow on its stern
        const ckL = teamCk(b) || [0, 0, 0, 0, 0], loc = a => a - pose.a;
        g.globalCompositeOperation = "lighter";
        g.globalAlpha = 0.22; g.drawImage(litBody(ckL, loc(-2.36), "rgba(255,255,255,1)"), -s / 2, -s / 2, s, s);
        const th = Math.max(bf ? 1 : 0, Math.min(1.4, b.thrust || 0));
        if (th > 0.05) { const jm = exhaustJets(b, now).find(j => j.main); if (jm) { g.globalAlpha = Math.min(0.45, 0.18 * th + (bf ? 0.18 : 0)); g.drawImage(litBody(ckL, loc(jm.a), bf ? "rgba(255,220,160,1)" : "rgba(255,140,60,1)"), -s / 2, -s / 2, s, s); } }
        g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
      }
      const hf = b.hitAt ? Math.min(1, 1 - (now - b.hitAt) / 120) : 0;   // just hit: a white flash
      if (hf > 0) { g.globalAlpha = hf * 0.85; g.drawImage(whiteBody(teamCk(b) || [0, 0, 0, 0, 0]), -s / 2, -s / 2, s, s); g.globalAlpha = 1; }
    } else { g.fillStyle = "#4fd6c8"; g.fillRect(-s / 3, -s / 3, s / 1.5, s / 1.5); }
    const hat = b.ck ? customVal(b.ck, "hat") : null;
    drawArmor(lv, s, now, !hat);
    if (Number.isFinite(b.lives)) drawDamage(damageOf(b), s, now, x);
    if (hat) drawHat(hat, s, now);
    g.restore();
    { const wpn = isMe ? me.weapon : b.weapon;   // a blade in hand: held outside the hull, over it
      if (wpn === "saw" || wpn === "gauntlet") drawBlade(isMe ? me : b, x, y, wpn === "saw", wpn !== "saw" ? 0 : isMe ? charge : b.charge || b.wind || 0, now); }
    orbit(true);
    g.globalAlpha = 1;

    if (!isMe && Number.isFinite(b.lives)) {
      const f = Math.max(0, Math.min(1, b.lives / maxLivesOf(lv))), bw = 54, by = y + S * 0.42 + 6;
      g.fillStyle = "rgba(0,0,0,0.45)"; rrect(x - bw / 2 - 1, by - 1, bw + 2, 7, 3); g.fill();
      g.fillStyle = f > 0.6 ? "#4fe39a" : f > 0.3 ? "#ffc23d" : "#ff4d5e"; rrect(x - bw / 2, by, bw * f, 5, 2.5); g.fill();
    }

    const label = b.name || "";
    if (label) {
      g.font = `700 ${13 * TS}px ` + DISPLAY_FONT;
      g.textAlign = "center";
      const top = y - S * (lv >= 8 || hat ? 0.62 : 0.46) - 22 * TS;
      g.fillStyle = "rgba(20,12,40,0.55)";
      const w = g.measureText(label).width + 12 * TS;
      rrect(x - w / 2, top, w, 19 * TS, 9 * TS); g.fill();
      g.fillStyle = isTeams() && onTeam(b) ? TEAM_HEX[b.tm] : `hsl(${b.hue} 90% ${isMe ? 85 : 78}%)`;
      g.fillText(label, x, top + 14 * TS);
    }
  }

