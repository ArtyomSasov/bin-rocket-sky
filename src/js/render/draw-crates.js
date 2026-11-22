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

