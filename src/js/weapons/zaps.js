  // ---- the Plasma Nova lashes every enemy near its path with lightning as it flies (each victim judges its own, as
  // any hit: me here, the bots where they run, a player on their own screen)
  function novaZap(s, dt, now) {
    s.zap = (s.zap || 0) - dt;
    if (s.zap > 0) return;
    s.zap = NOVA_ZAP.every;
    const R = NOVA_ZAP.r * (0.6 + 0.4 * Math.min(1, s.m)), near = o => Math.hypot(o.x - s.x, o.y - s.y) < R && !fixedCover(s.x, s.y, o.x, o.y);
    const zap = o => { arcs.push({ x1: s.x, y1: s.y, x2: o.x, y2: o.y, t: 0, col: "190,255,120" }); arcs.push({ x1: s.x, y1: s.y, x2: o.x + (Math.random() - 0.5) * 40, y2: o.y + (Math.random() - 0.5) * 40, t: 0, col: "240,255,220" }); impact(o.x, o.y, "#c8ff7a", 0.5); };
    let any = false;
    if (playing && !me.dead && canHurt(s, me, "me") && near(me)) { zap(me); any = true; hurtMe(s, now, NOVA_ZAP.dmg * s.m, K.NOVA); }
    for (const b of bots) if (!b.dead && canHurt(s, b, b.id) && near(b)) { zap(b); any = true; botHurt(b, NOVA_ZAP.dmg * s.m, s.id, now, false, K.NOVA); }
    for (const [rid, r] of remotes) if (!botById.has(rid) && !r.dead && canHurt(s, r, rid) && near(r)) { zap(r); any = true; }   // they judge their own
    if (any && Math.hypot(s.x - me.x, s.y - me.y) < 1500) packPlay("p_hit_laser", 0.5, s.x, s.y);
  }
  // ---- the gamma orb zaps every enemy near it as it flies (each victim judges its own zaps, like any hit)
  function gammaZap(s, dt, now) {
    s.zap = (s.zap || 0) - dt;
    if (s.zap > 0) return;
    s.zap = GAMMA_ZAP.every;
    const near = o => Math.hypot(o.x - s.x, o.y - s.y) < GAMMA_ZAP.r && !fixedCover(s.x, s.y, o.x, o.y), zap = o => arcs.push({ x1: s.x, y1: s.y, x2: o.x, y2: o.y, t: 0, col: "125,255,138" });
    let any = false;
    if (playing && !me.dead && canHurt(s, me, "me") && near(me)) { zap(me); any = true; hurtMe(s, now, GAMMA_ZAP.dmg * s.m, K.GAMMA); }
    for (const b of bots) if (!b.dead && canHurt(s, b, b.id) && near(b)) { zap(b); any = true; botHurt(b, GAMMA_ZAP.dmg * s.m, s.id, now, false, K.GAMMA); }
    for (const [rid, r] of remotes) if (!botById.has(rid) && !r.dead && canHurt(s, r, rid) && near(r)) { zap(r); any = true; }   // they judge their own
    if (any) audioCue("demonicZap", s.x, s.y);
  }
