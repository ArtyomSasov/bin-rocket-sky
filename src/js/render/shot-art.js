  // ---------- how each kind of shot looks in flight (x, y: where it is on screen); drawShot picks one ----------
  // bolts, bullets, slugs and rockets
  const SHOT_ART = {
    [K.PULSE_BOLT](s, x, y, now) {   // a pulse bolt: a crackling ball of green plasma in a shell of arcs, a long streak behind
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
      g.restore();
    },
    [K.ORB](s, x, y, now) {   // plasma orb: a big crackling ball, a wide glow, spinning rings and arcs licking out
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
    },
    [K.NOVA](s, x, y, now) {   // the Plasma Nova: a swirling ball of green plasma, white at its heart, lightning crawling over it
      const c = Math.min(1, s.m || 1), r = 12 + 16 * c, a = Math.atan2(s.vy, s.vx);
      g.save(); g.translate(x, y); g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.5; g.rotate(a); g.drawImage(dotSprite("#4dff1e"), -r * 5, -r * 0.9, r * 5.5, r * 1.8); g.rotate(-a);   // the streak behind it
      g.globalAlpha = 0.4; g.drawImage(dotSprite("#7dff3a"), -r * 2.6, -r * 2.6, r * 5.2, r * 5.2);
      for (let k = 0; k < 3; k++) { g.save(); g.rotate(now / (90 + k * 40) * (k % 2 ? -1 : 1) + k * 2); g.globalAlpha = 0.85; g.drawImage(fireSprite(2 + ((now / 40 + k) | 0) % 3, k, DEMON_RAMP), -r * 1.25, -r * 1.25, r * 2.5, r * 2.5); g.restore(); }
      g.globalAlpha = 1; g.strokeStyle = "rgba(230,255,200,0.9)"; g.lineWidth = 1.5;
      for (let k = 0; k < (lowQ ? 2 : 4); k++) { let an = Math.random() * 6.283, rr = r * 0.6; g.beginPath(); g.moveTo(Math.cos(an) * rr, Math.sin(an) * rr); for (let n = 0; n < 3; n++) { an += 0.5 + Math.random() * 0.5; rr = r * (1 + Math.random() * 0.8); g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } g.stroke(); }
      g.fillStyle = "#ffffff"; g.beginPath(); g.arc(0, 0, r * 0.4, 0, 6.29); g.fill();
      g.restore();
    },
    [K.HOOK](s, x, y, now) {   // the hook: a chain of steel links from its gun to a barbed head
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
    },
    [K.SHARD](s, x, y, now) {   // shard: a heavy white-hot splinter, longer and hotter after every ricochet
      const hot = Math.min(4, s.bn || 0), L = 40 + hot * 14, k = 1.5 + hot * 0.15;
      g.save(); g.translate(x, y); g.rotate(Math.atan2(s.vy, s.vx));
      g.globalAlpha = 0.5 + hot * 0.1; g.drawImage(dotSprite(hot ? "#ffd27a" : "#ff9a3c"), -22 * k, -22 * k, 44 * k, 44 * k); g.globalAlpha = 1;
      const lg = g.createLinearGradient(-L, 0, 0, 0);
      lg.addColorStop(0, "rgba(255,120,30,0)"); lg.addColorStop(1, hot ? "rgba(255,240,190,0.98)" : "rgba(255,200,120,0.95)");
      g.strokeStyle = lg; g.lineWidth = 8 + hot; g.lineCap = "round";
      g.beginPath(); g.moveTo(-L, 0); g.lineTo(0, 0); g.stroke();
      g.fillStyle = "#fff4e0"; g.beginPath(); g.moveTo(8 * k, 0); g.lineTo(-4 * k, -4.5 * k); g.lineTo(-2 * k, 0); g.lineTo(-4 * k, 4.5 * k); g.fill();
      g.restore();
    },
    [K.PELLET](s, x, y, now) {   // scatter pellet: a short hot streak
      g.save(); g.translate(x, y); g.rotate(Math.atan2(s.vy, s.vx));
      const lg = g.createLinearGradient(-44, 0, 0, 0);
      lg.addColorStop(0, "rgba(255,150,40,0)"); lg.addColorStop(1, "rgba(255,235,160,0.95)");
      g.strokeStyle = lg; g.lineWidth = 6; g.lineCap = "round";
      g.beginPath(); g.moveTo(-44, 0); g.lineTo(0, 0); g.stroke();
      g.fillStyle = "rgba(255,200,90,0.35)"; g.beginPath(); g.arc(0, 0, 9, 0, 6.29); g.fill();
      g.fillStyle = "#fff6d8"; g.beginPath(); g.arc(0, 0, 3.6, 0, 6.29); g.fill();
      g.restore();
    },
    [K.RAIL](s, x, y, now) {   // rail slug: a long violet-white beam
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
    },
    [K.BULLET](s, x, y, now) {
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
      g.restore();
    },
    [K.ROCKET](s, x, y, now) {   // a rocket: a fin-tailed body on a flame
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
      g.globalCompositeOperation = "lighter";
      g.restore();
    }
  };
  SHOT_ART[K.BULLET_ALT] = SHOT_ART[K.BULLET];
