  function drawEvents(now) {
    if (stationMap()) return;
    const ev = eventAt(clockNow());
    if (!ev.active) return;
    const t = now / 1000;

    if (ev.type === "meteors") {
      for (let i = 0; i < 40; i++) {
        const m = meteor(ev, i);
        if (!m || grabbed.has(m.key)) continue;
        const x = sx(m.x), y = sy(m.y);
        if (!onScreen(x, y, 200)) continue;
        g.save(); g.translate(x, y); g.rotate(Math.atan2(m.vy, m.vx));
        g.globalCompositeOperation = "lighter";
        const tl = m.r * 9;
        const tg = g.createLinearGradient(-tl, 0, 0, 0);
        tg.addColorStop(0, "rgba(255,60,20,0)"); tg.addColorStop(0.7, "rgba(255,130,40,0.6)"); tg.addColorStop(1, "rgba(255,230,150,0.9)");
        g.fillStyle = tg; g.beginPath(); g.moveTo(0, -m.r * 0.9);
        g.quadraticCurveTo(-tl * 0.5, -m.r * 0.5 + Math.sin(t * 20 + i) * 3, -tl, 0);
        g.quadraticCurveTo(-tl * 0.5, m.r * 0.5, 0, m.r * 0.9); g.fill();
        g.globalCompositeOperation = "source-over";
        const rg = g.createRadialGradient(-m.r * 0.3, -m.r * 0.3, 1, 0, 0, m.r);
        rg.addColorStop(0, "#ffd9a0"); rg.addColorStop(0.5, "#c0582a"); rg.addColorStop(1, "#5a2418");
        g.fillStyle = rg; g.beginPath(); g.arc(0, 0, m.r, 0, 6.29); g.fill();
        g.restore();
      }
    }

    if (ev.type === "aliens") {
      for (let u = 0; u < UFO_N; u++) {
        const key = "e" + ev.cyc + "u" + u;
        if (grabbed.has(key)) continue;
        g.globalCompositeOperation = "lighter";
        for (const o of ufoOrbs(ev, u)) {
          const x = sx(o.x), y = sy(o.y);
          if (!onScreen(x, y, 20)) continue;
          const og = g.createRadialGradient(x, y, 0, x, y, 14);
          og.addColorStop(0, "rgba(220,255,230,1)"); og.addColorStop(0.4, "rgba(90,255,150,0.8)"); og.addColorStop(1, "rgba(40,255,120,0)");
          g.fillStyle = og; g.beginPath(); g.arc(x, y, 14, 0, 6.29); g.fill();
        }
        g.globalCompositeOperation = "source-over";
        const p = ufoPos(ev, u, ev.et), x = sx(p.x), y = sy(p.y + Math.sin(t * 3 + u) * 6);
        if (!onScreen(x, y, 60)) { drawEdgeArrow(x, y, "#7dffb0"); continue; }
        const sc = Math.min(1, ev.et / 1.2);
        g.save(); g.translate(x, y); g.scale(sc, sc);
        const beam = g.createLinearGradient(0, 0, 0, 90);
        beam.addColorStop(0, "rgba(125,255,176,0.35)"); beam.addColorStop(1, "rgba(125,255,176,0)");
        g.fillStyle = beam; g.beginPath(); g.moveTo(-14, 6); g.lineTo(14, 6); g.lineTo(34, 90); g.lineTo(-34, 90); g.fill();
        const dome = g.createRadialGradient(-6, -18, 2, 0, -10, 22);
        dome.addColorStop(0, "#e9fffb"); dome.addColorStop(1, "rgba(79,214,200,0.55)");
        g.fillStyle = dome; g.beginPath(); g.ellipse(0, -8, 20, 18, 0, Math.PI, 0); g.fill();
        const hull = g.createLinearGradient(0, -12, 0, 14);
        hull.addColorStop(0, "#d9d2ee"); hull.addColorStop(1, "#5f557f");
        g.fillStyle = hull; g.beginPath(); g.ellipse(0, 0, 46, 13, 0, 0, 6.29); g.fill();
        for (let l = 0; l < 7; l++) {
          const on = Math.floor(t * 6 + l) % 3 === 0;
          g.fillStyle = on ? "#7dffb0" : "#3a3355";
          g.beginPath(); g.arc(-33 + l * 11, 2, 3, 0, 6.29); g.fill();
        }
        const hp = UFO_HP - (ufoHits.get(key) || 0);
        g.fillStyle = "rgba(20,12,40,0.6)"; g.fillRect(-24, -38, 48, 5);
        g.fillStyle = "#7dffb0"; g.fillRect(-24, -38, 48 * hp / UFO_HP, 5);
        g.restore();
      }
    }

    if (ev.type === "goldrain") {
      for (let i = 0; i < GOLD_N; i++) {
        const gd = goldDrop(ev, i);
        if (!gd || grabbed.has(gd.key)) continue;
        const x = sx(gd.x), y = sy(gd.y);
        if (!onScreen(x, y, 40)) continue;
        const fade = Math.min(1, (7 - gd.age) / 1);
        g.globalAlpha = fade;
        drawSpark(x, y, 15, true, now, gd.age / 4);
        g.globalAlpha = 1;
      }
    }
  }

  // black hole: gravitational lens over everything behind it, then the accretion disk and the horizon
  const lensCv = document.createElement("canvas"), lctx = lensCv.getContext("2d");
  // shock-wave refraction: copy the band around a blast ring and paint it back slightly magnified,
  // so everything behind the expanding wave wobbles like hot air
  const warpCv = document.createElement("canvas"), wctx = warpCv.getContext("2d");
  // a shock wave as a lens: behind it what was there is pulled in, at its front pushed out (bands scaled about the
  // centre), so the whole view visibly ripples as it passes
  function shockLens(x, y, r, w, strength) {
    const R = r + w, sc = dpr * zoom, size = Math.ceil(2 * R * sc);
    if (size < 8 || size > 2600 || r < w * 0.5) return;
    if (warpCv.width < size) { warpCv.width = warpCv.height = size; } else wctx.clearRect(0, 0, size, size);
    const px = Math.round((x - R) * sc), py = Math.round((y - R) * sc);
    const ax = Math.max(0, px), ay = Math.max(0, py), bx = Math.min(cv.width, px + size), by = Math.min(cv.height, py + size);
    if (bx <= ax || by <= ay) return;
    wctx.drawImage(cv, ax, ay, bx - ax, by - ay, ax - px, ay - py, bx - ax, by - ay);
    for (const [r0, r1, m] of [[r - w, r - w * 0.35, 1 - 0.035 * strength], [r - w * 0.35, r + w * 0.25, 1 + 0.06 * strength], [r + w * 0.25, r + w, 1 + 0.02 * strength]]) {
      g.save(); g.beginPath(); g.arc(x, y, Math.max(0, r1), 0, 6.29); g.arc(x, y, Math.max(0, r0), 0, 6.29, true); g.clip("evenodd");
      g.translate(x, y); g.scale(m, m); g.drawImage(warpCv, 0, 0, size, size, -R, -R, 2 * R, 2 * R); g.restore();
    }
  }
  function refractRing(x, y, r, w, strength) {
    const R = r + w, sc = dpr * zoom, size = Math.ceil(2 * R * sc);
    if (size < 8 || size > 2600) return;
    if (warpCv.width < size) { warpCv.width = warpCv.height = size; } else wctx.clearRect(0, 0, size, size);
    const px = Math.round((x - R) * sc), py = Math.round((y - R) * sc);
    const ax = Math.max(0, px), ay = Math.max(0, py), bx = Math.min(cv.width, px + size), by = Math.min(cv.height, py + size);
    if (bx <= ax || by <= ay) return;
    wctx.drawImage(cv, ax, ay, bx - ax, by - ay, ax - px, ay - py, bx - ax, by - ay);
    g.save();
    g.beginPath(); g.arc(x, y, R, 0, 6.29); g.arc(x, y, Math.max(0, r - w), 0, 6.29, true); g.clip("evenodd");
    const m = 1 + 0.07 * strength;
    g.translate(x, y); g.scale(m, m);
    g.drawImage(warpCv, 0, 0, size, size, -R, -R, 2 * R, 2 * R);
    g.restore();
  }
