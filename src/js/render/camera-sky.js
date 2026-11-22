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
    const th = skyTheme();
    if (skyBase && skyBase.width === W2 && skyBase.height === H2 && skyBase.th === th) return;
    const vw = W2, vh = H2;
    const mk = () => { const c = document.createElement("canvas"); c.width = W2; c.height = H2; return c; };
    skyBase = mk(); skyEdge = mk(); skyBase.th = th;
    let q = skyBase.getContext("2d");
    const gr = q.createLinearGradient(0, 0, vw * 0.3, vh);   // deep space: nearly black, a touch of blue and violet
    gr.addColorStop(0, th.base[0]); gr.addColorStop(0.55, th.base[1]); gr.addColorStop(1, th.base[2]);   // (the map's own sky)
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

