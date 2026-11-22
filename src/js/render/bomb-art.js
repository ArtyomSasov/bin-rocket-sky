  // grenades, shells, mines and the big bombs
  const BOMB_ART = {
    [K.GREN](s, x, y, now) {   // a grenade: a dark metal body with a ridged belt and a blinking fuse, tumbling
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
    },
    [K.FLAK](s, x, y, now) {   // shell shadow and loft make its falling trajectory readable
      const height = flakHeight(s);
      g.fillStyle = "rgba(0,0,0,.4)"; g.beginPath(); g.ellipse(x, y + 8, 12 + height*.08, 5, 0, 0, Math.PI*2); g.fill();
      g.save(); g.translate(x, y - height); g.rotate(performance.now() / 80);
      g.globalAlpha = 0.6; g.drawImage(dotSprite("#ff9a3c"), -30, -30, 60, 60); g.globalAlpha = 1;
      g.fillStyle = "#ffd27a"; g.beginPath();
      for (let k = 0; k < 16; k++) { const r = k % 2 ? 6 : 13, a = k / 16 * 6.283; k ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(r, 0); }
      g.closePath(); g.fill(); g.fillStyle = "#fff4e0"; g.beginPath(); g.arc(0, 0, 4, 0, 6.29); g.fill();
      g.restore();
    },
    [K.MINE](s, x, y, now) {   // mine: spiked ball, blinks faster once armed, shows its trigger radius
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
    },
    [K.GAMMA](s, x, y, now) {   // the demonic orb: a churning ball of hellfire in a shroud of green flame and smoke
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
    },
    [K.HOLY](s, x, y, now) {   // a golden orb under a halo; it pulses faster and shines wider as the fuse runs out
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
    },
    [K.VOID](s, x, y, now) {   // the void bomb: a dark orb, light bending round it, a violet ring turning
      const t = now / 1000;
      g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.5; g.drawImage(dotSprite("#9b5cff"), x - 60, y - 60, 120, 120);
      g.globalAlpha = 1; g.strokeStyle = "rgba(210,170,255,0.9)"; g.lineWidth = 3;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(x, y, 26, 9, t * 2 + i * 1.05, 0, 6.29); g.stroke(); }
      g.globalCompositeOperation = "source-over"; g.fillStyle = "#05010a"; g.beginPath(); g.arc(x, y, 15, 0, 6.29); g.fill();
      g.strokeStyle = "#e9dcff"; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 16, 0, 6.29); g.stroke(); g.restore();
    },
    [K.NUKE](s, x, y, now) {
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
    }
  };
