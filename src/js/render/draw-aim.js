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
    if (charge > 0 && playing && !me.dead && !WEAPONS[me.weapon]?.sword) {   // (the sword shows its wind-up on the blade itself)   // a charge filling up: a ring round the bin, white-hot when full
      const x = sx(me.x), y = sy(me.y), R = 70 * sizeOf(me.lv), full = charge >= 1;
      g.save(); g.lineCap = "round";
      g.strokeStyle = "rgba(127,184,255,0.25)"; g.lineWidth = 6; g.beginPath(); g.arc(x, y, R, 0, 6.29); g.stroke();
      g.strokeStyle = full && Math.floor(now / 90) % 2 ? "#ffffff" : "#7fb8ff"; g.lineWidth = 6;
      g.beginPath(); g.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + charge * 6.283); g.stroke();
      g.restore();
    }
    if (altCharge > 0 && playing && !me.dead && me.weapon === "laser") {   // a Plasma Nova charging: a ball of plasma swelling at the gun, crackling
      const mz = muzzleOf({ ...me, gunSide: 0 }, "laser"), c = altCharge, x0 = sx(mz.x), y0 = sy(mz.y), r = 6 + 16 * c, full = c >= 1;
      g.save(); g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.2 + 0.25 * c; g.drawImage(dotSprite("#7dff3a"), x0 - r * 3, y0 - r * 3, r * 6, r * 6);
      g.globalAlpha = 1; g.drawImage(fireSprite(2 + ((now / 45) | 0) % 3, 1, DEMON_RAMP), x0 - r * 1.3, y0 - r * 1.3, r * 2.6, r * 2.6);
      g.strokeStyle = full && Math.floor(now / 80) % 2 ? "#ffffff" : "rgba(210,255,170,0.9)"; g.lineWidth = 1.4;
      for (let k = 0; k < 2 + Math.round(3 * c); k++) { let an = Math.random() * 6.283, rr = r * 0.5; g.beginPath(); g.moveTo(x0 + Math.cos(an) * rr, y0 + Math.sin(an) * rr); for (let n = 0; n < 3; n++) { an += 0.4 + Math.random() * 0.5; rr = r * (0.9 + Math.random() * 0.9); g.lineTo(x0 + Math.cos(an) * rr, y0 + Math.sin(an) * rr); } g.stroke(); }
      g.fillStyle = "#ffffff"; g.beginPath(); g.arc(x0, y0, r * 0.35, 0, 6.29); g.fill();
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
