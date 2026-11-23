  // floating score text
  function drawFloaters(now) {
    // floating score text
    g.textAlign = "center";
    for (const f of floaters) {
      g.globalAlpha = 1 - f.t;
      g.font = `700 ${(f.gold ? 26 : f.big ? 30 : f.hit ? 20 : 18) * TS}px ` + DISPLAY_FONT;
      g.fillStyle = f.gold ? "#ffd36b" : f.col || (f.hit ? "#ff6b6b" : "#ffffff");
      g.fillText(f.txt, sx(f.x), sy(f.y) - f.t * 50);
    }
    g.globalAlpha = 1;
  }
  // whole-screen flashes: a blast's white-out, the red edge when hurt
  // speed lines: past ~650 px/s thin streaks race past the edges of the screen, against your motion
  const speedLines = [];
  let speedLineAt = 0;
  function drawSpeedLines(now) {
    const dt = Math.min(0.05, (now - speedLineAt) / 1000); speedLineAt = now;
    const sp = playing && !me.dead ? Math.hypot(me.vx, me.vy) : 0, k = clamp((sp - 650) / 500, 0, 1);
    if (k > 0) for (let n = 0; n < (lowQ ? 2 : 5) * k; n++) {
      const a = Math.random() * 6.283, r = Math.max(vw, vh) * (0.35 + Math.random() * 0.3);
      speedLines.push({ x: vw / 2 + Math.cos(a) * r, y: vh / 2 + Math.sin(a) * r, t: 0 });
    }
    if (speedLines.length > 80) speedLines.splice(0, speedLines.length - 80);
    if (!speedLines.length) return;
    const ux = sp ? -me.vx / sp : 0, uy = sp ? -me.vy / sp : 0, len = 60 + sp * 0.12;
    g.lineCap = "round"; g.lineWidth = 1.6;
    for (let i = speedLines.length - 1; i >= 0; i--) {
      const l = speedLines[i]; l.t += dt; l.x += ux * sp * 2.2 * dt; l.y += uy * sp * 2.2 * dt;
      if (l.t > 0.35) { speedLines.splice(i, 1); continue; }
      g.strokeStyle = `rgba(220,240,255,${0.35 * Math.max(k, 0.3) * (1 - l.t / 0.35)})`;
      g.beginPath(); g.moveTo(l.x, l.y); g.lineTo(l.x - ux * len, l.y - uy * len); g.stroke();
    }
  }
  function drawScreenFx(now) {
    drawSpeedLines(now);
    if (flash > 0) { g.fillStyle = `rgba(255,252,235,${flash})`; g.fillRect(0, 0, vw, vh); }
    if (hurtFlash > 0) {   // taking damage: the edges of the screen flush red
      const vg = g.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
      vg.addColorStop(0, "rgba(255,30,40,0)"); vg.addColorStop(1, `rgba(255,30,40,${0.55 * hurtFlash})`);
      g.fillStyle = vg; g.fillRect(0, 0, vw, vh);
    }
  }
  // one frame, back to front. Everything inside the save/restore moves with the camera shake
  function draw(now) {
    // every frame starts from a clean canvas state: if some effect throws mid-frame, that frame is lost,
    // not the look of every frame after it (a left-over "lighter" mode once washed the whole screen white)
    applyView(); g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.setLineDash([]);
    g.save();
    try { drawWorld(now); g.restore(); }
    catch (e) { if (g.reset) g.reset(); else g.restore(); applyView(); throw e; }   // a frame that failed half-way leaves nothing behind
    drawScreenFx(now);
  }
  // flying oil: dark drops drawn out along their flight, a glint on each
  function drawOil() {
    for (const d of oilDrops) {
      const x = sx(d.x), y = sy(d.y);
      if (!onScreen(x, y, 20)) continue;
      const sp = Math.hypot(d.vx, d.vy), L = Math.min(5, 1 + sp / 120), a = Math.atan2(d.vy, d.vx), f = 1 - d.t / d.life;
      g.save(); g.translate(x, y); g.rotate(a); g.globalAlpha = 0.9 * Math.min(1, f * 3);
      g.fillStyle = "#5a060c"; g.beginPath(); g.ellipse(0, 0, d.r * L, d.r, 0, 0, 6.29); g.fill();
      g.fillStyle = "rgba(255,170,170,0.45)"; g.beginPath(); g.arc(d.r * L * 0.3, -d.r * 0.35, d.r * 0.35, 0, 6.29); g.fill();
      g.restore();
    }
    g.globalAlpha = 1;
  }
  function drawWorld(now) {
    // camera shake as "trauma" (Squirrel Eiserloh's camera talk): what is felt goes with its square, so small knocks
    // stay small and big ones hit hard, and it moves along smooth noise (a few sines out of step), not a new random
    // jolt every frame; a slight roll with it
    if (shake > 0) {
      const t = Math.min(1, shake), k = t * t, s = now / 1000, n = (a, b, c) => (Math.sin(s * a) + Math.sin(s * b + 1.7) * 0.6 + Math.sin(s * c + 4.1) * 0.3) / 1.9;
      g.translate(n(41, 67, 97) * k * 34, n(53, 79, 113) * k * 34);
      if (k > 0.02) { const c = g.getTransform().inverse().transformPoint({ x: g.canvas.width / 2, y: g.canvas.height / 2 }); g.translate(c.x, c.y); g.rotate(n(23, 37, 59) * k * 0.035); g.translate(-c.x, -c.y); }   // (round the middle of the screen)
    }
    g.translate(-camKick.x, -camKick.y);
    drawSky(now);
    drawWalls(now);
    drawJunk(now);
    drawBodies(now);   // after the junk: drifting rocks pass behind planets
    drawEvents(now);
    drawPickups(now);
    drawWreckage(now);
    drawPlume();
    drawChunks(now);
    drawMelt();
    drawCasings();
    drawOil();
    drawGlow(now);
    drawBlackHole(now);   // lenses the world behind it; bots and text are drawn on top, undistorted
    drawPilots(now);
    drawCuts();
    drawAim(now);
    drawFlags(now);
    drawHill(now);
    drawBlastFx(now);
    drawFloaters(now);
  }

  // edge arrow toward an off-screen flyer
  function drawPointer(r, x, y) {
    const cx = vw / 2, cy = vh / 2, dx = x - cx, dy = y - cy;
    const m = 28, t = Math.min((cx - m) / Math.abs(dx || 1e-6), (cy - m) / Math.abs(dy || 1e-6));
    const px = cx + dx * t, py = cy + dy * t, a = Math.atan2(dy, dx);
    g.save(); g.translate(px, py); g.rotate(a);
    g.fillStyle = `hsl(${r.hue} 90% 75%)`; g.globalAlpha = 0.85;
    g.beginPath(); g.moveTo(10, 0); g.lineTo(-7, -7); g.lineTo(-7, 7); g.closePath(); g.fill();
    g.restore(); g.globalAlpha = 1;
  }

