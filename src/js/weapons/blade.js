  // ---------- the Blood Blade: a heavy red energy blade, wound up and swung ----------
  // Both are held in the right hand, outside the hull: at rest along the right flank pointing ahead; wound up, drawn
  // back over the right shoulder; a swing sweeps round the front from right to left (the Saber's next one back again),
  // the hilt circling just outside the bin and the blade pointing outward, so it never passes through the bin.
  // A Blood Blade swing: SWING_ARC radians swept in SWING_MS, centred on the aim; the blade reaches BLADE_REACH
  const SWING_MS = 350, SWING_ARC = 2.5, BLADE_REACH = 125;
  const swingSideOf = () => -1;   // (right-handed: from the right round to the left, on every screen and the server alike)
  const swingEase = k => 1 - Math.pow(1 - k, 2.2);
  // where the blade is now: from the bin's edge out to its tip, swept round as the swing goes (owner: the bin swinging)
  function swordSweep(s, owner) {
    const k = Math.min(1, 1 - s.life / SHOTS[K.SWORD].life), a = s.sa - SWING_ARC / 2 * s.side + SWING_ARC * s.side * swingEase(k), r0 = binR(owner.lv || 1) * 0.6;
    s.px = owner.x + Math.cos(a) * r0; s.py = owner.y + Math.sin(a) * r0; s.x = owner.x + Math.cos(a) * BLADE_REACH; s.y = owner.y + Math.sin(a) * BLADE_REACH;
  }
  // the Blood Blade bites whatever it touches, swung or not: at rest or wound up, a bin its beam lies across takes a
  // touch (K.MELEE, a small blow) every 0.45 s. Judged where its owner is judged (my screen; a server pilot on the
  // server), so the hit goes the way every hit goes. targets: [id, bin] pairs to try
  const TOUCH_MS = 450, BLADE_TOUCH = { shot: [K.MELEE, 0], feel: [6, 0.1, 0], sfx: ["hit", 0.7, 0.7] };
  function bladeTouch(b, now, wind, targets) {
    if (b.swingAt && now - b.swingAt < (b.swingMs || SWING_MS)) return;   // mid-swing the swing itself cuts
    const P = bladePose(b, wind, now), rh = binR(b.lv || 1) + 4, L = (BLADE_REACH - rh * 0.6) * (1 + wind * 0.08);
    const ha = b.a + P.ph, hx = b.x + Math.cos(ha) * rh, hy = b.y + Math.sin(ha) * rh, da = b.a + P.ps, ux = Math.cos(da), uy = Math.sin(da);
    const seen = b.touched || (b.touched = new Map());
    for (const [id, o] of targets) {
      if (!o || o === b || o.dead || mates(o, b) || now - (seen.get(id) || 0) < TOUCH_MS) continue;
      const t = clamp((o.x - hx) * ux + (o.y - hy) * uy, 0, L), cx = hx + ux * t, cy = hy + uy * t;
      if (Math.hypot(o.x - cx, o.y - cy) > binR(o.lv || 1) * 0.9) continue;
      seen.set(id, now);
      volley(b, now, BLADE_TOUCH, { x: cx, y: cy });
    }
  }
  // and it cuts whatever solid it lies across (rock, a station's wall, a crate), swung or not: wherever along it the
  // beam is inside something, a bite every 0.14 s (a wider one mid-swing), with sparks and the hiss of the burn
  function bladeGrind(b, now, wind) {
    if (now - (b.grindAt || 0) < 140) return;
    const P = bladePose(b, wind, now), rh = binR(b.lv || 1) + 4, L = (BLADE_REACH - rh * 0.6) * (1 + wind * 0.08);
    const ha = b.a + P.ph, hx = b.x + Math.cos(ha) * rh, hy = b.y + Math.sin(ha) * rh, da = b.a + P.ps, ux = Math.cos(da), uy = Math.sin(da);
    let n = 0;
    for (let i = 2; i <= 8 && n < 3; i++) {
      const f = i / 8, x = hx + ux * L * f, y = hy + uy * L * f, o = solidAny(x, y);
      if (!o) continue;
      n++; carveAt(o, x, y, P.tr !== undefined ? 20 : 12, true);
      if (Math.random() < 0.8) sparkShower(x, y, -ux + (Math.random() - 0.5), -uy + (Math.random() - 0.5), 0.8);
    }
    if (n) { b.grindAt = now; bladeClash(clamp((b.x - me.x) / 900, -1, 1), true); }
  }
  function swingStart(o, a, side) {
    o.swingSide = side; o.swingAt = performance.now(); o.swingMs = SWING_MS;
    const dist = Math.hypot(o.x - me.x, o.y - me.y);
    if (dist < 1600) bladeSwing(1 - dist / 1600, clamp((o.x - me.x) / 900, -1, 1));
  }
  // the blade's pose round its bin: hilt at angle ph from the aim (+: to the right), blade pointing at ps from the aim;
  // tr: where the swing was a moment ago (for its smear), lit: how bright
  function bladePose(b, wind, now) {
    const REST = [1.4, 0.26], ms = b.swingMs || SWING_MS, k = b.swingAt ? (now - b.swingAt) / ms : 9, side = b.swingSide || -1;
    const arc = SWING_ARC, lead = 0.5, hold = 0.25, rec = 0.6;
    const at = e => { const f0 = arc / 2 + lead, ph = -side * (f0 + (-arc / 2 - f0) * e); return [ph, ph - side * (1.1 - 0.95 * e)]; };
    if (k >= 0 && k <= 1) { const e = swingEase(k), [ph, ps] = at(e), [p0] = at(swingEase(Math.max(0, k - 0.32))); return { ph, ps, tr: p0, lit: 1.35 - 0.35 * k, k }; }
    if (k > 1 && k < 1 + hold + rec) {   // after it: held a moment where it ended, then brought back to rest
      const [ph, ps] = at(1), f = clamp((k - 1 - hold) / rec, 0, 1), sm = f * f * (3 - 2 * f);
      return { ph: ph + (REST[0] - ph) * sm, ps: ps + (REST[1] - ps) * sm, lit: 1 };
    }
    const w = swingEase(wind);   // at rest, or wound up over the right shoulder
    return { ph: REST[0] + 0.85 * w, ps: REST[1] + 2.75 * w, lit: 1 + 0.9 * w };
  }
  // the blade on its bin (x, y: the bin on screen), drawn over it: a hilt of dark metal and a beam of light in its
  // colour with a white-hot core, quivering; mid-swing a smear of light follows it round
  function drawBlade(b, x, y, wind, now) {
    const P = bladePose(b, wind, now), sz = sizeOf(b.lv || 1), A = b.a, rh = binR(b.lv || 1) + 4;
    const col = "255,40,60", L = (BLADE_REACH - rh * 0.6) * (1 + wind * 0.08);
    const flick = 0.9 + 0.06 * Math.sin(now / 17 + (b.hue || 0)) + 0.04 * Math.sin(now / 7.3), lit = P.lit * flick;
    const ha = A + P.ph, hx = x + Math.cos(ha) * rh, hy = y + Math.sin(ha) * rh, da = A + P.ps, ux = Math.cos(da), uy = Math.sin(da), tx = hx + ux * L, ty = hy + uy * L;
    g.save(); g.lineCap = "round";
    if (P.tr !== undefined && !lowQ) {   // the smear: a fan of light from where the blade was to where it is, brightest at the blade
      g.globalCompositeOperation = "lighter";
      const n = 10, side = b.swingSide || -1;
      for (let i = 0; i < n; i++) {
        const f0 = i / n, f1 = (i + 1) / n, p0 = P.tr + (P.ph - P.tr) * f0, p1 = P.tr + (P.ph - P.tr) * f1, al = Math.pow(f1, 2) * 0.32 * lit;
        const q = ph => { const h = A + ph, d = A + ph - side * 0.12; return [x + Math.cos(h) * rh, y + Math.sin(h) * rh, x + Math.cos(h) * rh + Math.cos(d) * L, y + Math.sin(h) * rh + Math.sin(d) * L]; };
        const [ax0, ay0, bx0, by0] = q(p0), [ax1, ay1, bx1, by1] = q(p1);
        const gr = g.createLinearGradient(ax1, ay1, bx1, by1); gr.addColorStop(0, `rgba(${col},0)`); gr.addColorStop(0.35, `rgba(${col},${al * 0.6})`); gr.addColorStop(1, `rgba(255,255,255,${al})`);
        g.fillStyle = gr; g.beginPath(); g.moveTo(ax0, ay0); g.lineTo(bx0, by0); g.lineTo(bx1, by1); g.lineTo(ax1, ay1); g.closePath(); g.fill();
      }
    }
    // the hilt: back from the emitter toward the bin
    g.globalCompositeOperation = "source-over";
    const hl = 17 * sz, bx = hx - ux * hl, by = hy - uy * hl;
    g.strokeStyle = "#1c2028"; g.lineWidth = 7.5 * sz; g.beginPath(); g.moveTo(bx, by); g.lineTo(hx, hy); g.stroke();
    g.strokeStyle = "#a9b4c4"; g.lineWidth = 5 * sz; g.beginPath(); g.moveTo(bx + ux * hl * 0.1, by + uy * hl * 0.1); g.lineTo(hx - ux * hl * 0.45, hy - uy * hl * 0.45); g.stroke();
    g.strokeStyle = "#3a4250"; g.lineWidth = 6.5 * sz; g.beginPath(); g.moveTo(hx - ux * hl * 0.3, hy - uy * hl * 0.3); g.lineTo(hx, hy); g.stroke();
    g.strokeStyle = "#ff4050"; g.lineWidth = 2; g.beginPath(); g.moveTo(hx - ux * hl * 0.6 - uy * 3 * sz, hy - uy * hl * 0.6 + ux * 3 * sz); g.lineTo(hx - ux * hl * 0.6 + uy * 3 * sz, hy - uy * hl * 0.6 - ux * 3 * sz); g.stroke();   // its switch
    // the beam: a wide soft glow, a coloured body, a white core, a hot emitter and a rounded tip
    g.globalCompositeOperation = "lighter";
    for (const [w, c, al] of [[26, col, 0.13], [14, col, 0.38], [8, col, 0.8], [3.6, "255,255,255", 0.95]]) {
      g.strokeStyle = `rgba(${c},${Math.min(1, al * lit)})`; g.lineWidth = w * sz * (1 + wind * 0.25); g.beginPath(); g.moveTo(hx, hy); g.lineTo(tx, ty); g.stroke();
    }
    g.globalAlpha = Math.min(1, 0.7 * lit); g.drawImage(dotSprite(`rgb(${col})`), hx - 16 * sz, hy - 16 * sz, 32 * sz, 32 * sz); g.globalAlpha = 1;
    if (wind > 0.98 && !lowQ) {   // wound up full: arcs crackle along it
      g.strokeStyle = "rgba(255,220,225,0.85)"; g.lineWidth = 1.4;
      for (let k = 0; k < 2; k++) { g.beginPath(); for (let i = 0; i <= 6; i++) { const f = i / 6, o = (Math.random() - 0.5) * 14 * sz; g.lineTo(hx + ux * L * f - uy * o, hy + uy * L * f + ux * o); } g.stroke(); }
    }
    g.restore();
  }
