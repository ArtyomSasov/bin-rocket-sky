  // ---------- a blade's hit: the "wow" ----------
  // The world stops for a beat; a cut of light flashes across the target along the stroke and slowly closes; a star
  // glint flares on it; a shock ring warps the space round it; molten droplets and sparks spray along the stroke and
  // fall away glowing; the cut leaves a glowing scar on the hull it struck that cools and fades
  const cuts = [], scars = [];
  function bladeHitFx(x, y, a, heavy, victim) {
    const col = "255,40,60", hex = "#ff3048", sc = heavy ? 1.35 : 0.8, q = lowQ ? 0.45 : 1;   // (one blade now: its touch is red too, and smaller)
    cuts.push({ x, y, a, t: 0, len: 190 * sc, col, heavy });
    if (cuts.length > 16) cuts.shift();
    if (victim) { scars.push({ o: victim, lx: x - victim.x, ly: y - victim.y, oa: victim.a || 0, a: a - (victim.a || 0), t: 0, len: 46 * sc, col }); if (scars.length > 24) scars.shift(); }
    impacts.push({ x, y, t: 0, r: 34 * sc, col: "#ffffff", dur: 0.08 });
    impacts.push({ x, y, t: 0, r: 170 * sc, col, dur: 0.35, soft: 0.55, fluided: true });   // (light only: no smoke cloud)
    for (const d of [-1, 1]) {   // molten droplets flung along the stroke, both ways, most the way it was going
      for (let k = 0, n = Math.round((d > 0 ? 22 : 9) * q * sc); k < n; k++) {
        const b2 = a + (d > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.7, v = 300 + Math.random() * 700;
        puff(x, y, Math.cos(b2) * v, Math.sin(b2) * v, 0.25 + Math.random() * 0.35, 1.2 + Math.random() * 1.2, k % 3 ? "#ffffff" : hex, 1, 0.04, (Math.random() - 0.5) * 3, 0.92);
      }
    }
    for (let k = 0, n = Math.round(14 * q * sc); k < n; k++) {   // glowing motes that hang and drift a moment
      const b2 = Math.random() * 6.283, v = 40 + Math.random() * 220;
      puff(x, y, Math.cos(b2) * v, Math.sin(b2) * v, 0.6 + Math.random() * 0.7, 1.4 + Math.random() * 1.6, k % 2 ? hex : "#ffffff", 5, 0, (Math.random() - 0.5) * 4, 0.95);
    }
    for (let k = 0; k < (lowQ ? 2 : 4); k++) { const b2 = Math.random() * 6.283, v = 30 + Math.random() * 60; puff(x, y, Math.cos(b2) * v, Math.sin(b2) * v, 0.9 + Math.random() * 0.6, 8 + Math.random() * 8, SMOKE_COLS[1], 2, 0, 0, 0.94, 0.6); }   // a wisp of burnt smoke
  }
  function updateCuts(dt) {
    for (let i = cuts.length - 1; i >= 0; i--) if ((cuts[i].t += dt) > 0.42) cuts.splice(i, 1);
    for (let i = scars.length - 1; i >= 0; i--) { const s = scars[i]; if ((s.t += dt) > 1.6 || s.o.dead) { scars.splice(i, 1); continue; }
      if (Math.random() < dt * 14 * (1 - s.t / 1.6)) { const ca = Math.cos((s.o.a || 0) - s.oa), sa = Math.sin((s.o.a || 0) - s.oa); puff(s.o.x + s.lx * ca - s.ly * sa, s.o.y + s.lx * sa + s.ly * ca, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 0.4 + Math.random() * 0.4, 0.9 + Math.random() * 0.8, "#ffd08a", 5, 0, (Math.random() - 0.5) * 3, 0.95); } }
  }
  function drawCuts() {
    if (!cuts.length && !scars.length) return;
    g.save(); g.globalCompositeOperation = "lighter"; g.lineCap = "round";
    for (const c of cuts) {   // the cut of light: shoots out along the stroke in 50 ms, then thins and closes from its ends
      const x = sx(c.x), y = sy(c.y);
      if (!onScreen(x, y, c.len)) continue;
      const open = Math.min(1, c.t / 0.05), close = Math.max(0, (c.t - 0.05) / 0.37), half = c.len / 2 * open * (1 - 0.55 * close * close), fade = 1 - close;
      const ux = Math.cos(c.a), uy = Math.sin(c.a), x0 = x - ux * half, y0 = y - uy * half, x1 = x + ux * half, y1 = y + uy * half;
      for (const [w, cc, al] of [[22, c.col, 0.16], [9, c.col, 0.5], [3, "255,255,255", 1]]) {
        const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, `rgba(${cc},0)`); gr.addColorStop(0.5, `rgba(${cc},${al * fade})`); gr.addColorStop(1, `rgba(${cc},0)`);
        g.strokeStyle = gr; g.lineWidth = w * (c.heavy ? 1.3 : 1) * (1 - 0.6 * close); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
      if (c.t < 0.2) {   // the glint: a four-pointed star, its long arms along and across the cut
        const k = 1 - c.t / 0.2, R = (c.heavy ? 110 : 80) * (0.6 + 0.4 * open) * k;
        g.save(); g.translate(x, y); g.rotate(c.a + 0.785);
        for (const [rx, ry] of [[R, R * 0.06], [R * 0.06, R * 0.7]]) { const gr = g.createRadialGradient(0, 0, 0, 0, 0, Math.max(rx, ry)); gr.addColorStop(0, `rgba(255,255,255,${0.95 * k})`); gr.addColorStop(0.3, `rgba(${c.col},${0.6 * k})`); gr.addColorStop(1, `rgba(${c.col},0)`); g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, 6.29); g.fill(); }
        g.restore();
        g.globalAlpha = k; g.drawImage(dotSprite("#ffffff"), x - 22, y - 22, 44, 44); g.globalAlpha = 1;
      }
    }
    for (const s of scars) {   // the scar on the hull: white-hot at first, cooling through orange to a dull red, then gone
      const o = s.o, da = (o.a || 0) - s.oa, ca = Math.cos(da), sa = Math.sin(da), x = sx(o.x + s.lx * ca - s.ly * sa), y = sy(o.y + s.lx * sa + s.ly * ca);
      if (!onScreen(x, y, 80)) continue;
      const k = s.t / 1.6, a = s.a + (o.a || 0), ux = Math.cos(a) * s.len / 2, uy = Math.sin(a) * s.len / 2;
      const hot = k < 0.15 ? "255,250,235" : k < 0.45 ? "255,170,70" : "220,60,30";
      for (const [w, al] of [[9, 0.25], [3.2, 0.95]]) { g.strokeStyle = `rgba(${hot},${al * (1 - k)})`; g.lineWidth = w; g.beginPath(); g.moveTo(x - ux, y - uy); g.lineTo(x + ux, y + uy); g.stroke(); }
    }
    g.restore();
  }
  const oilDrops = [], oilStains = [];
  // a spray as blood sprays: mostly a fine spray of small drops, fast ones flung furthest, a few heavier drops, and
  // a mist hanging a moment where it burst
  function oilSplash(x, y, n, speed, ax = 0, ay = 0) {
    const q = lowQ ? 0.5 : 1;
    for (let i = 0, m = Math.round(n * 2.6 * q); i < m; i++) {
      const fine = Math.random() < 0.82, a = Math.random() * 6.283, v = speed * (fine ? 0.4 + Math.random() * 1.1 : 0.25 + Math.random() * 0.6);
      oilDrops.push({ x, y, vx: Math.cos(a) * v + ax, vy: Math.sin(a) * v + ay, r: fine ? 0.5 + Math.random() * 1.1 : 1.6 + Math.random() * 2.2, life: 0.25 + Math.random() * 0.5, t: 0 });
    }
    for (let i = 0, m = Math.round(Math.min(6, n * 0.4) * q); i < m; i++) {   // the mist
      const a = Math.random() * 6.283, v = 20 + Math.random() * 60;
      puff(x, y, Math.cos(a) * v + ax * 0.3, Math.sin(a) * v + ay * 0.3, 0.5 + Math.random() * 0.5, 3 + Math.random() * 4, "rgb(110,12,20)", 2, 0, 0, 0.9);
    }
    if (oilDrops.length > 900) oilDrops.splice(0, oilDrops.length - 900);
  }
