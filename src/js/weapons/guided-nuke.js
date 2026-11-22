  // (T opens the chat now: the teleporter is retired)
  // ---- the guided nuke (the nuke's alt fire): you steer it, the view rides along, firing again sets it off.
  // Its course goes out with my state (gw) so everyone sees the same flight
  let guided = null, guideArmed = false, guideOut = null, guideOutUntil = 0, camBackUntil = 0;
  function startGuide(s) {
    guided = s; guideArmed = false; s.life = SHOTS[K.NUKE].life;
    announce("GUIDED NUKE", COARSE ? "steer it · tap fire to blow it" : "steer it · fire again to blow it", "#ffe14d");
  }
  // steering input (ix, iy) goes to the missile while it flies; returns true while guiding
  function guideTick(dt, now, ix, iy, held) {
    if (!guided) return false;
    if (guided.life <= 0 || guided.boom || me.dead || !shots.includes(guided)) { endGuide(now, false); return false; }
    if (!held) guideArmed = true;
    else if (guideArmed) { endGuide(now, true); return false; }
    const v = Math.hypot(guided.vx, guided.vy) || 1;
    let a = Math.atan2(guided.vy, guided.vx);
    if (Math.hypot(ix, iy) > 0.15) a = lerpAng(a, Math.atan2(iy, ix), Math.min(1, 3.2 * dt));
    guided.vx = Math.cos(a) * v; guided.vy = Math.sin(a) * v;
    guideOut = [guided.id, Math.round(guided.x), Math.round(guided.y), Math.round(guided.vx), Math.round(guided.vy), 0];
    if (serverRun) { srv.gx = ix; srv.gy = iy; }   // (sent with my controls: the server turns its nuke the same way)
    return true;
  }
  function endGuide(now, boom) {
    const s = guided;
    guided = null; camBackUntil = now + 700;
    if (serverRun) { srv.gx = srv.gy = 0; if (boom) srv.gb = (srv.gb || 0) + 1; }
    guideOut = [s.id, Math.round(s.x), Math.round(s.y), 0, 0, boom || s.boom ? 1 : 0]; guideOutUntil = now + 600;
    if (boom) detonate(s, now);
  }
  // someone else's guided nuke: follow their reported course, and blow it where they did
  function guideRemote(owner, gw) {
    const s = shots.find(o => o.id === gw[0] && o.owner === owner && o.kind === K.NUKE);
    if (!s || s.boom) return;
    s.x = s.px = clamp(gw[1], 0, W); s.y = s.py = clamp(gw[2], 0, H);
    if (gw[5] === 1) { detonate(s, performance.now()); return; }
    s.vx = clamp(gw[3], -900, 900); s.vy = clamp(gw[4], -900, 900); s.life = Math.max(s.life, 1);
  }
  // the void bomb bursts: a black hole opens where it is (holesNow) for six seconds; the burst itself is an implosion,
  // light sucked in, a ring falling inward, and a blow to whoever is close
  function voidBurst(s, now, bm) {
    const x = clamp(s.x, 0, W), y = clamp(s.y, 0, H), d = Math.hypot(me.x - x, me.y - y);
    voids.push({ x, y, born: performance.now(), dur: 6000, s: { id: s.id || "x", owner: s.owner, mine: !!s.mine, kind: K.VOID, m: 1 } });   // (s: whose hole it is, for the kills it makes)
    impacts.push({ x, y, t: 0, r: 220, col: "#efe0ff", dur: 0.18 });
    impacts.push({ x, y, t: 0, r: 700, col: "176,107,255", dur: 1.6, soft: 0.6, flick: Math.random() * 6.28 });
    rings.push({ x, y, t: 0, r: 900, col: "200,160,255", warp: true, dur: 0.6, w: 26, shock: 30 });
    for (let k = 0; k < (lowQ ? 50 : 140); k++) {   // everything near rushes in at once
      const a = Math.random() * 6.283, r = 200 + Math.random() * 700, v = r * (2 + Math.random() * 1.5);
      puff(x + Math.cos(a) * r, y + Math.sin(a) * r, -Math.cos(a) * v + Math.sin(a) * v * 0.5, -Math.sin(a) * v - Math.cos(a) * v * 0.5, 0.35 + Math.random() * 0.3, 1.2 + Math.random() * 1.6, k % 3 ? "#c9a6ff" : "#ffffff", 1, 0.06);
    }
    explode(x, y, 30, 260, "plasma");
    if (post) { post.wave(x, y, 900, 0.7, -0.08); post.burst(x, y, 260, [0.35, 0.18, 0.55], 2.5, -1800); }
    packPlay("p_boom_gamma", 1, x, y);
    if (d < 2000) shake = Math.max(shake, 0.9 * (1 - d / 2000));
    if (canHurt(s, me, "me", true) && d < bm.R && !fixedCover(x, y, me.x, me.y)) hurtMe(s, now, bombDmg(bm, d), s.kind, 0, false);
    for (const b of bots) { const bd = Math.hypot(b.x - x, b.y - y); if (bd < bm.R && canHurt(s, b, b.id, true) && !fixedCover(x, y, b.x, b.y)) botHurt(b, bombDmg(bm, bd) * selfMul(s, b.id), s.id, now, false, s.kind); }
  }
