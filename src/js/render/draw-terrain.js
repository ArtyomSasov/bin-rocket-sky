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
