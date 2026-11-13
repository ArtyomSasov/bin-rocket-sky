  // ---------- draw ----------
  function sx(x) { return vw / 2 + wrapD(x - me.x, W); }
  function sy(y) { return vh / 2 + wrapD(y - me.y, H); }
  function onScreen(x, y, m) { return x > -m && x < vw + m && y > -m && y < vh + m; }

  // live background: everything drifts on its own (not only when you move), stars twinkle one by one,
  // shooting stars cross the sky, the moon orbits, the galaxy turns
  const TWINKLE = Array.from({ length: 70 }, (_, i) => ({ x: hash(i, 1, 66), y: hash(i, 2, 66), r: 0.8 + hash(i, 3, 66) * 1.8, ph: hash(i, 4, 66) * 6.28, sp: 0.6 + hash(i, 5, 66) * 2.2, col: ["#ffffff", "#cfe3ff", "#ffe9c4", "#ffd0f0"][i % 4] }));
  const comets = [];
  let nextComet = 0, lastSky = 0;
  // the sky's base colour and its dark edges, painted once per screen size
  let skyBase = null, skyEdge = null;
  function skyLayers() {
    if (skyBase && skyBase.width === Math.ceil(vw) && skyBase.height === Math.ceil(vh)) return;
    const mk = () => { const c = document.createElement("canvas"); c.width = Math.ceil(vw); c.height = Math.ceil(vh); return c; };
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
  function drawSky(now) {
    const t = now / 1000, sdt = Math.min(0.05, (now - lastSky) / 1000); lastSky = now;
    skyLayers();
    g.drawImage(skyBase, 0, 0, vw, vh);
    const tile = (img, size, par, dx, dy) => {
      const ox = -mod(me.x * par + dx, size), oy = -mod(me.y * par + dy, size);
      for (let x = ox; x < vw; x += size) for (let y = oy; y < vh; y += size) g.drawImage(img, x, y);
    };
    // landmarks: the Milky Way, far galaxies, nebulae and gas giants, each at its own spot, sliding by with parallax
    for (const L of sky) {
      if (lowQ && L.img === NEB_ART[2]) continue;
      const x = vw / 2 + (L.x - me.x) * L.par, y = vh / 2 + (L.y - me.y) * L.par, half = Math.hypot(L.img.width, L.img.height) * L.sc / 2;
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
    for (const st of TWINKLE) {
      const x = mod(st.x * 2400 - me.x * 0.35, vw + 200) - 100, y = mod(st.y * 1600 - me.y * 0.35, vh + 200) - 100;
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
    for (const d of DUST) {
      const bx = -mod(me.x * d.par, d.tile), by = -mod(me.y * d.par, d.tile);
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
    g.save(); g.translate(x, y); g.rotate(k.spin);
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
    g.restore(); g.globalAlpha = 1;
  }

  function drawShot(s, x, y, now) {
    if (s.m === 3) {   // Overdrive shots carry a violet halo
      const hg = g.createRadialGradient(x, y, 0, x, y, 26);
      hg.addColorStop(0, "rgba(195,139,255,0.55)"); hg.addColorStop(1, "rgba(195,139,255,0)");
      g.fillStyle = hg; g.beginPath(); g.arc(x, y, 26, 0, 6.29); g.fill();
    }
    if (s.kind === 7) {   // plasma orb: a swirling ball of light
      const r = 15 + Math.sin(now / 60 + s.x) * 2;
      const og = g.createRadialGradient(x, y, 0, x, y, r * 2.4);
      og.addColorStop(0, "rgba(255,255,255,1)"); og.addColorStop(0.3, "rgba(150,230,255,0.9)"); og.addColorStop(1, "rgba(60,160,255,0)");
      g.fillStyle = og; g.beginPath(); g.arc(x, y, r * 2.4, 0, 6.29); g.fill();
      g.strokeStyle = "rgba(200,245,255,0.8)"; g.lineWidth = 2;
      for (let k = 0; k < 2; k++) { g.beginPath(); g.ellipse(x, y, r * 1.3, r * 0.5, now / 150 + k * 1.6, 0, 6.29); g.stroke(); }
      return;
    }
    if (s.kind === 8) {   // lightning: a jagged arc from the gun to where the bolt has reached
      const x0 = x - (s.x - s.ox), y0 = y - (s.y - s.oy), L = Math.hypot(x - x0, y - y0) || 1, nx = (x - x0) / L, ny = (y - y0) / L;
      const pts = [[x0, y0]];
      for (let k = 1; k < 9; k++) { const t = k / 9, o = (Math.random() - 0.5) * 22; pts.push([x0 + (x - x0) * t - ny * o, y0 + (y - y0) * t + nx * o]); }
      pts.push([x, y]);
      g.lineJoin = "round"; g.lineCap = "round";
      for (const [w, c] of [[9, "rgba(120,200,255,0.35)"], [3.5, "rgba(190,240,255,0.9)"], [1.4, "#ffffff"]]) {
        g.strokeStyle = c; g.lineWidth = w; g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.stroke();
      }
      for (let f = 0; f < (lowQ ? 1 : 3); f++) {   // forks splitting off the main bolt
        let [fx, fy] = pts[2 + ((Math.random() * 6) | 0)], a = Math.atan2(ny, nx) + (Math.random() < 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.6);
        const fork = [[fx, fy]];
        for (let k = 0; k < 3; k++) { a += (Math.random() - 0.5) * 0.9; const st = 14 + Math.random() * 18; fx += Math.cos(a) * st; fy += Math.sin(a) * st; fork.push([fx, fy]); }
        for (const [w, c] of [[4, "rgba(120,200,255,0.3)"], [1.2, "rgba(220,248,255,0.9)"]]) {
          g.strokeStyle = c; g.lineWidth = w; g.beginPath(); fork.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.stroke();
        }
      }
      return;
    }
    if (s.kind === 9) {   // shard: a white-hot splinter
      g.save(); g.translate(x, y); g.rotate(Math.atan2(s.vy, s.vx));
      const lg = g.createLinearGradient(-26, 0, 0, 0);
      lg.addColorStop(0, "rgba(255,120,30,0)"); lg.addColorStop(1, "rgba(255,200,120,0.95)");
      g.strokeStyle = lg; g.lineWidth = 5; g.lineCap = "round";
      g.beginPath(); g.moveTo(-26, 0); g.lineTo(0, 0); g.stroke();
      g.fillStyle = "#fff4e0"; g.beginPath(); g.moveTo(5, 0); g.lineTo(-3, -3); g.lineTo(-3, 3); g.fill();
      g.restore();
      return;
    }
    if (s.kind === 10) {   // shotgun slug: one fat white-hot ball with a long streak
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
    if (s.kind === 4) {   // scatter pellet: a short hot streak
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
    if (s.kind === 5) {   // rail slug: a long violet-white beam
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
    if (s.kind === 6) {   // mine: spiked ball, blinks faster once armed, shows its trigger radius
      const armed = SHOT_LIFE[6] - s.life >= MINE_ARM, ending = s.life < 3;
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
    if (s.kind === 3) {
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
    if (s.kind === 2) {   // laser: a long bolt of light with a pulsing glow and a hot flare at the head
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
    if (s.kind === 1) {
      const a = Math.atan2(s.vy, s.vx), fl = 1 + Math.sin(now / 25 + s.x) * 0.25;
      g.save(); g.translate(x, y); g.rotate(a); g.scale(1.6, 1.6);
      const fg = g.createLinearGradient(-34 * fl, 0, -8, 0);
      fg.addColorStop(0, "rgba(255,60,20,0)"); fg.addColorStop(1, "rgba(255,210,90,0.95)");
      g.fillStyle = fg; g.beginPath(); g.moveTo(-8, -4); g.lineTo(-34 * fl, 0); g.lineTo(-8, 4); g.fill();
      g.globalCompositeOperation = "source-over";
      g.fillStyle = "#8a7fb0"; g.beginPath(); g.moveTo(-10, -8); g.lineTo(-2, -3); g.lineTo(-2, 3); g.lineTo(-10, 8); g.fill();
      const bg = g.createLinearGradient(0, -5, 0, 5);
      bg.addColorStop(0, "#f4f1ff"); bg.addColorStop(1, "#a59cc8");
      g.fillStyle = bg; rrect(-10, -4.5, 20, 9, 4); g.fill();
      g.fillStyle = "#ff5a6e"; g.beginPath(); g.moveTo(10, -4.5); g.quadraticCurveTo(18, 0, 10, 4.5); g.fill();
      if (Math.floor(now / 140 + s.x) % 2) {   // homing seeker light blinking on the nose
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

  // live engine fire. Local frame: nozzle at the origin, +y points out of the engine.
  function drawFlame(len, wid, now, seed, tier) {
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
        const sway = Math.sin(t * 13 + ph) * w * 0.35 + Math.sin(t * 23 + ph) * w * 0.12;
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
    const hr = wid * (0.85 + 0.1 * Math.sin(t * 37 + seed));
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
    } else {         // glowing shield emblem
      g.fillStyle = sp.col; g.save(); g.translate(-17, -17); g.scale(34 / 24, 34 / 24); g.fill(ICON_PATHS.shield); g.restore();
      g.fillStyle = "rgba(255,255,255,0.35)"; g.save(); g.translate(-9, -11); g.scale(18 / 24, 18 / 24); g.fill(ICON_PATHS.shield); g.restore();
    }
    g.restore();
  }
  // the rare nuke crate: bigger, hazard-striped, pulsing
  function drawAmpCrate(c, x, y, now) {   // a spinning violet crystal
    const k = Math.min(1, c.age * 40), pulse = 0.7 + 0.3 * Math.sin(now / 160);
    g.globalCompositeOperation = "lighter";
    const gl = g.createRadialGradient(x, y, 6, x, y, 70);
    gl.addColorStop(0, `rgba(195,139,255,${0.6 * pulse})`); gl.addColorStop(1, "rgba(195,139,255,0)");
    g.fillStyle = gl; g.beginPath(); g.arc(x, y, 70, 0, 6.29); g.fill();
    for (let i = 0; i < 6; i++) { const a = now / 500 + i * 1.047; g.fillStyle = "#e9d4ff"; g.beginPath(); g.arc(x + Math.cos(a) * 38, y + Math.sin(a) * 38, 2.5, 0, 6.29); g.fill(); }
    g.globalCompositeOperation = "source-over";
    g.save(); g.translate(x, y); g.scale(k * Math.cos(now / 400), k); 
    g.fillStyle = "#c38bff"; g.beginPath(); g.moveTo(0, -24); g.lineTo(15, 0); g.lineTo(0, 24); g.lineTo(-15, 0); g.closePath(); g.fill();
    g.fillStyle = "#f3e6ff"; g.beginPath(); g.moveTo(0, -24); g.lineTo(6, 0); g.lineTo(0, 24); g.lineTo(-4, 0); g.closePath(); g.fill();
    g.restore();
  }
  function drawNukeCrate(c, x, y, now) {
    const k = Math.min(1, c.age * 40), pulse = 0.6 + 0.4 * Math.sin(now / 180);
    const gl = g.createRadialGradient(x, y, 6, x, y, 90);
    gl.addColorStop(0, `rgba(255,225,77,${0.55 * pulse})`); gl.addColorStop(1, "rgba(255,225,77,0)");
    g.fillStyle = gl; g.beginPath(); g.arc(x, y, 90, 0, 6.29); g.fill();
    g.save(); g.translate(x, y); g.rotate(Math.sin(now / 900) * 0.15); g.scale(k * 1.35, k * 1.35);
    rrect(-20, -20, 40, 40, 9); g.save(); g.clip();
    for (let i = -6; i < 6; i++) { g.fillStyle = i % 2 ? "#1d1630" : "#ffe14d"; g.beginPath(); g.moveTo(i * 8, -20); g.lineTo(i * 8 + 8, -20); g.lineTo(i * 8 + 48, 20); g.lineTo(i * 8 + 40, 20); g.fill(); }
    g.restore();
    g.fillStyle = "#1d1630"; rrect(-14, -14, 28, 28, 6); g.fill();
    g.fillStyle = "#ffe14d"; g.save(); g.translate(-11, -11); g.scale(22 / 24, 22 / 24); g.fill(ICON_PATHS.nuke, "evenodd"); g.restore();
    g.restore();
    g.font = `700 ${12 * TS}px ` + DISPLAY_FONT; g.textAlign = "center"; g.fillStyle = "#ffe14d";
    g.fillText("NUKE", x, y + 44);
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
  function drawMounts(weapon, s, now) {
    if (!weapon || weapon === "fire") return;
    const u = s / 320, mounts = mountsOf(weapon);
    for (const [mx, my] of mounts) {
      g.save();
      g.translate((mx / 320 - 0.5) * s, (my / 320 - 0.5) * s);
      g.rotate(SPRITE_TILT); g.scale(u * 1.35, u * 1.35);
      if (weapon === "laser") {
        const bg = g.createLinearGradient(-6, 0, 6, 0); bg.addColorStop(0, "#5a6684"); bg.addColorStop(0.5, "#dfe7f5"); bg.addColorStop(1, "#5a6684");
        g.fillStyle = bg; rrect(-6, -58, 12, 66, 5); g.fill();
        g.fillStyle = "#2a3550"; g.fillRect(-8, -10, 16, 12);
        const pulse = 0.6 + 0.4 * Math.sin(now / 120);
        const tg = g.createRadialGradient(0, -60, 0, 0, -60, 16);
        tg.addColorStop(0, `rgba(230,255,255,${pulse})`); tg.addColorStop(0.4, `rgba(125,249,255,${0.8 * pulse})`); tg.addColorStop(1, "rgba(125,249,255,0)");
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

  // team modes: a ring in the team's colour under every bin
  function teamRing(x, y, tm, lv) {
    if (!isTeams() || (tm !== 0 && tm !== 1)) return;
    const R = 44 * sizeOf(lv || 1);
    g.globalCompositeOperation = "lighter";
    g.strokeStyle = `rgba(${TEAM_RGB[tm]},0.75)`; g.lineWidth = 3.5;
    g.beginPath(); g.ellipse(x, y + R * 0.2, R, R * 0.75, 0, 0, 6.29); g.stroke();
    g.globalCompositeOperation = "source-over";
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

    if (b.ampUntil > now || b.amp) {   // Overdrive: a violet aura around the bin
      g.globalCompositeOperation = "lighter";
      const ar = S * (0.85 + 0.08 * Math.sin(now / 90)), ag = g.createRadialGradient(x, y, S * 0.2, x, y, ar);
      ag.addColorStop(0, "rgba(195,139,255,0)"); ag.addColorStop(0.7, "rgba(195,139,255,0.35)"); ag.addColorStop(1, "rgba(195,139,255,0)");
      g.fillStyle = ag; g.beginPath(); g.arc(x, y, ar, 0, 6.29); g.fill();
      g.globalCompositeOperation = "source-over";
    }
    g.save();
    g.translate(x, y);
    g.rotate(b.a + Math.PI / 2 - SPRITE_TILT + Math.sin(now / 300 + x * 0.01) * 0.05);
    const s = S * (1 + Math.sin(now / 55 + y) * 0.015 * (0.5 + b.thrust));
    // fire first, from the engine opening, so the bin's rim sits on top of it
    g.save();
    g.translate(NOZZLE[0] * s, NOZZLE[1] * s);
    g.rotate(SPRITE_TILT);
    const fl = b.ck ? customVal(b.ck, "flame") : null;
    const sputter = Number.isFinite(b.lives) && damageOf(b) > 0.6 ? 0.55 + 0.45 * Math.abs(Math.sin(now / 37 + x)) : 1;
    const firePal = fl === "rainbow" ? rainbowFlame(now) : fl ? FLAMES[fl] : tier;
    const bf = isMe ? me.boostFx : b.boost || 0;
    const burst = isMe ? Math.max(0, 1 - (now - me.dashAt) / 350) : bf === 2 ? 1 : 0;
    const lenMul = 1 + (bf ? 0.85 : 0) + burst * 1.1, widMul = 1 + (bf ? 0.35 : 0) + burst * 0.3;
    const pal = bf ? { outer: firePal.outer, mid: firePal.mid, core: [255, 255, 255] } : firePal;
    if (bf) {   // afterburner glow around the nozzle
      const ag = g.createRadialGradient(0, s * 0.25, 0, 0, s * 0.25, s * (0.55 + burst * 0.4));
      ag.addColorStop(0, "rgba(255,230,170,0.75)"); ag.addColorStop(0.5, "rgba(255,150,60,0.3)"); ag.addColorStop(1, "rgba(255,100,40,0)");
      g.globalCompositeOperation = "lighter"; g.fillStyle = ag;
      g.beginPath(); g.arc(0, s * 0.25, s * (0.55 + burst * 0.4), 0, 6.29); g.fill();
      g.globalCompositeOperation = "source-over";
    }
    drawFlame(s * (0.36 + 0.46 * Math.min(1.4, b.thrust)) * sputter * lenMul, s * 0.3 * widMul, now, (b.hue || 0) * 0.1, pal);
    g.restore();
    drawWings(lv, s);
    drawMounts(isMe ? me.weapon : b.weapon, s, now);
    if (body) g.drawImage(b.ck ? tintedBody(b.ck) : body, -s / 2, -s / 2, s, s);
    else { g.fillStyle = "#4fd6c8"; g.fillRect(-s / 3, -s / 3, s / 1.5, s / 1.5); }
    const hat = b.ck ? customVal(b.ck, "hat") : null;
    drawArmor(lv, s, now, !hat);
    if (Number.isFinite(b.lives)) drawDamage(damageOf(b), s, now, x);
    if (hat) drawHat(hat, s, now);
    g.restore();
    orbit(true);
    g.globalAlpha = 1;

    if (!isMe && Number.isFinite(b.lives)) {
      const f = Math.max(0, Math.min(1, b.lives / maxLivesOf(lv))), bw = 54, by = y + S * 0.42 + 6;
      g.fillStyle = "rgba(0,0,0,0.45)"; rrect(x - bw / 2 - 1, by - 1, bw + 2, 7, 3); g.fill();
      g.fillStyle = f > 0.6 ? "#4fe39a" : f > 0.3 ? "#ffc23d" : "#ff4d5e"; rrect(x - bw / 2, by, bw * f, 5, 2.5); g.fill();
    }

    const label = b.name ? "Lv " + lv + " · " + b.name : "";
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

