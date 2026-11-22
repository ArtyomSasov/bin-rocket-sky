  // b: the pilot itself (what this keeps on it between frames: its jolt, its barrels' turn, its fire's colours, lives on);
  // look: how it is shown this frame (blink: protected, so it flickers; name: its label, if not its own name)
  function drawBot(b, x, y, now, isMe, look = {}) {
    const S = BOT;
    if (look.blink && Math.floor(now / 90) % 2) g.globalAlpha = 0.35;
    const shield = isMe ? me.shield : b.shield || 0;
    if (shield > 0) {
      const hit = isMe ? Math.max(0, 1 - (now - shieldHitAt) / 300) : 0;
      const br = S * 0.82, bub = g.createRadialGradient(x, y, br * 0.55, x, y, br);
      bub.addColorStop(0, "rgba(111,194,255,0)"); bub.addColorStop(0.85, `rgba(111,194,255,${0.12 + 0.04 * shield + 0.4 * hit})`); bub.addColorStop(1, "rgba(111,194,255,0)");
      g.fillStyle = bub; g.beginPath(); g.arc(x, y, br, 0, 6.29); g.fill();
      g.strokeStyle = `rgba(190,230,255,${0.25 + 0.05 * shield + 0.6 * hit})`; g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, br * (0.93 + 0.02 * Math.sin(now / 200)), 0, 6.29); g.stroke();
    }

    if (amped(b, now)) {   // Quad damage: a blue aura around the bin
      g.globalCompositeOperation = "lighter";
      const ar = S * (0.85 + 0.08 * Math.sin(now / 90)), ag = g.createRadialGradient(x, y, S * 0.2, x, y, ar);
      ag.addColorStop(0, "rgba(91,155,255,0)"); ag.addColorStop(0.7, "rgba(91,155,255,0.42)"); ag.addColorStop(1, "rgba(91,155,255,0)");
      g.fillStyle = ag; g.beginPath(); g.arc(x, y, ar, 0, 6.29); g.fill();
      g.globalCompositeOperation = "source-over";
    }
    const pose = binPose(b, now), s = pose.s;
    const fl = b.ck ? customVal(b.ck, "flame") : null;
    const firePal = fl === "rainbow" ? rainbowFlame(now) : fl ? FLAMES[fl] : FLAME;
    const bf = isMe ? me.boostFx : b.boost || 0;
    const burst = isMe ? Math.max(0, 1 - (now - me.dashAt) / 350) : bf === 2 ? 1 : 0;
    const sputter = Number.isFinite(b.lives) && damageOf(b) > 0.6 ? 0.65 + 0.35 * Math.abs(Math.sin(now / 47 + b.x)) : 1;
    if (isMe) me.flamePal = firePal; else b.flamePal = firePal;   // (the plume's particles take its colours: emitPlume)
    for (const j of exhaustJets(b, now)) {
      g.save(); g.translate(x + j.x - b.x, y + j.y - b.y); g.rotate(j.a - Math.PI / 2);
      const power = j.power * sputter, len = s * (j.main ? 0.65 : 0.4) * power * (1 + (bf ? 1.7 : 0) + burst * 0.8);
      const wid = s * (j.main ? 0.24 : 0.12) * Math.sqrt(power) * (bf ? 1.5 : 1);
      const lat = (b.vx || 0) * Math.sin(j.a) - (b.vy || 0) * Math.cos(j.a), bend = clamp(lat * 0.09, -wid * 3, wid * 3);
      drawJet(len, wid, now, firePal, !!bf, (b.hue || 0) * 0.1 + (j.main ? 0 : 3) + (b.x || 0) * 0.001, bend, power);   // (the fire beyond it: its particles, drawPlume)
      if (j.main) {   // the main engine's bell: dark metal, its rim glowing hot with the burn (white-hot on boost)
        g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
        const bw = Math.max(9, wid * 0.85), bl = bw * 0.7, mg = g.createLinearGradient(-bw, 0, bw, 0);
        mg.addColorStop(0, "#1b2230"); mg.addColorStop(0.45, "#5c6b80"); mg.addColorStop(0.6, "#8a9ab0"); mg.addColorStop(1, "#1b2230");
        g.fillStyle = mg; g.beginPath(); g.moveTo(-bw * 0.55, -bl); g.lineTo(bw * 0.55, -bl); g.lineTo(bw, 2); g.lineTo(-bw, 2); g.closePath(); g.fill();
        const heat = Math.min(1, power * (bf ? 1.2 : 0.7));
        g.globalCompositeOperation = "lighter"; g.strokeStyle = bf ? `rgba(255,240,210,${0.9 * heat})` : `rgba(255,${120 + 80 * heat},60,${0.8 * heat})`; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(-bw, 2); g.lineTo(bw, 2); g.stroke(); g.globalCompositeOperation = "source-over";
      }
      if (!j.main) { // metal lip at the fixed manoeuvring nozzle
        g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
        g.fillStyle = "#253241"; g.beginPath(); g.moveTo(-wid * 0.6, -4); g.lineTo(wid * 0.6, -4); g.lineTo(wid * 0.45, 3); g.lineTo(-wid * 0.45, 3); g.closePath(); g.fill();
        g.strokeStyle = "#9cb3c2"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-wid * 0.45, 3); g.lineTo(wid * 0.45, 3); g.stroke();
      }
      g.restore();
    }
    // a jolt (a crash, a ram, a hard blow, a dash): the hull squashes along it and springs back, wobbling
    const pvx = b.jvx ?? b.vx ?? 0, pvy = b.jvy ?? b.vy ?? 0, jdv = Math.hypot((b.vx || 0) - pvx, (b.vy || 0) - pvy);
    b.jvx = b.vx || 0; b.jvy = b.vy || 0;
    if (jdv > 380 && !b.dead && jdv < 4000) { const k = Math.min(1, (jdv - 300) / 1200); if (k > (b.joltK || 0) * Math.exp(-(now - (b.joltAt || 0)) / 140)) { b.joltAt = now; b.joltK = k; b.joltA = Math.atan2((b.vy || 0) - pvy, (b.vx || 0) - pvx) - pose.a; } }
    const jt = (now - (b.joltAt || -1e9)) / 1000, jk = jt < 0.6 ? (b.joltK || 0) * Math.exp(-jt / 0.14) * Math.cos(jt * 38) * 0.22 : 0;
    g.save(); g.translate(x, y); g.rotate(pose.a);
    if (jk) { g.rotate(b.joltA); g.scale(1 - jk, 1 + jk * 0.8); g.rotate(-b.joltA); }   // (squashed along the blow, bulging across it)
    g.scale(pose.scaleX, 1);
    mountHeat = isMe ? spin : 0;
    // a minigun's barrels turn with its spin (mine: the trigger's spin-up; another's: how hard it has been firing)
    { const sv = isMe ? spin : (b.spinVis = Math.max(0, (b.spinVis || 0) - Math.min(0.1, (now - (b.spinT || now)) / 1000) * 1.2)), dtv = Math.min(0.1, (now - (b.barrelT || now)) / 1000);
      b.spinT = b.barrelT = now; b.barrelA = (b.barrelA || 0) + (0.4 + sv * sv * 30) * dtv; barrelA = b.barrelA; if (!isMe) mountHeat = Math.max(mountHeat, sv * 0.8); }
    drawMounts(isMe ? me.weapon : b.weapon, s, now);
    if (body) {
      g.drawImage(b.ck ? tintedBody(teamCk(b)) : body, -s / 2, -s / 2, s, s);
      if (!lowQ) {   // light on the hull: a sheen from the top left that stays put as it turns, and its engines' glow on its stern
        const ckL = teamCk(b) || [0, 0, 0, 0, 0], loc = a => a - pose.a;
        g.globalCompositeOperation = "lighter";
        g.globalAlpha = 0.22; g.drawImage(litBody(ckL, loc(-2.36), "rgba(255,255,255,1)"), -s / 2, -s / 2, s, s);
        const th = Math.max(bf ? 1 : 0, Math.min(1.4, b.thrust || 0));
        if (th > 0.05) { const jm = exhaustJets(b, now).find(j => j.main); if (jm) { g.globalAlpha = Math.min(0.45, 0.18 * th + (bf ? 0.18 : 0)); g.drawImage(litBody(ckL, loc(jm.a), bf ? "rgba(255,220,160,1)" : "rgba(255,140,60,1)"), -s / 2, -s / 2, s, s); } }
        g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
      }
      const hf = b.hitAt ? Math.min(1, 1 - (now - b.hitAt) / 120) : 0;   // just hit: a white flash
      if (hf > 0) { g.globalAlpha = hf * 0.85; g.drawImage(whiteBody(teamCk(b) || [0, 0, 0, 0, 0]), -s / 2, -s / 2, s, s); g.globalAlpha = 1; }
    } else { g.fillStyle = "#4fd6c8"; g.fillRect(-s / 3, -s / 3, s / 1.5, s / 1.5); }
    const hat = b.ck ? customVal(b.ck, "hat") : null;
    if (Number.isFinite(b.lives)) drawDamage(damageOf(b), s, now, x);
    if (hat) drawHat(hat, s, now);
    g.restore();
    { const wpn = isMe ? me.weapon : b.weapon;   // a blade in hand: held outside the hull, over it
      if (wpn === "saw") drawBlade(isMe ? me : b, x, y, isMe ? charge : b.charge || b.wind || 0, now); }
    g.globalAlpha = 1;

    if (!isMe && Number.isFinite(b.lives)) {
      const f = Math.max(0, Math.min(1, b.lives / LIVES)), bw = 54, by = y + S * 0.42 + 6;
      g.fillStyle = "rgba(0,0,0,0.45)"; rrect(x - bw / 2 - 1, by - 1, bw + 2, 7, 3); g.fill();
      g.fillStyle = f > 0.6 ? "#4fe39a" : f > 0.3 ? "#ffc23d" : "#ff4d5e"; rrect(x - bw / 2, by, bw * f, 5, 2.5); g.fill();
    }

    const label = look.name ?? b.name ?? "";
    if (label) {
      g.font = `700 ${13 * TS}px ` + DISPLAY_FONT;
      g.textAlign = "center";
      const top = y - S * (hat ? 0.62 : 0.46) - 22 * TS;
      g.fillStyle = "rgba(20,12,40,0.55)";
      const w = g.measureText(label).width + 12 * TS;
      rrect(x - w / 2, top, w, 19 * TS, 9 * TS); g.fill();
      g.fillStyle = isTeams() && onTeam(b) ? TEAM_HEX[b.tm] : `hsl(${b.hue} 90% ${isMe ? 85 : 78}%)`;
      g.fillText(label, x, top + 14 * TS);
    }
  }

