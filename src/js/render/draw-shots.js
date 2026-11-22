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

    if (s.kind === K.PISTOL || s.kind === K.SHOCK || s.kind === K.DET) return;   // beams are drawn as beams; a detonator isn't seen
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

    if (s.kind === K.ROCKET) {   // a rocket the size of a rocket (it used to be drawn twice as big)
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

