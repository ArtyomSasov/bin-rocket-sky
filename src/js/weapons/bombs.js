  function nukeTouches(s) {
    // (my own nuke never sets itself off on me: on the game server the one shown here is the server's, not "mine")
    if (!s.mine && !mySrvShot(s) && playing && !me.dead && segHit(s, me.x, me.y, 46)) return true;
    for (const [id, r] of remotes) if (!r.dead && id !== s.owner && segHit(s, r.x, r.y, 46)) return true;
    // and the pilots flown here: my bots, or on the server every pilot (players included), which are not "remotes" there
    for (const b of bots) if (!b.dead && b.id !== s.owner && !(s.mine && b === me) && segHit(s, b.x, b.y, 46)) return true;
    for (const k of world.rocks) if (!grabbed.has(k.key) && k.age >= 0.6 && segHit(s, k.x, k.y, k.r + 10)) return true;
    return false;
  }
  const booms = [];   // big-bomb fireballs on screen
  let flash = 0;
  // the holy bomb in flight: it slows down, bounces off the fence and bodies, glows brighter as the fuse runs out
  // and sings its choir once, a couple of seconds before it goes off
  function bounceFlight(s, dt, damp) {   // slows down, bounces off the fence and bodies (the holy bomb)
    const k = Math.exp(-damp * dt); s.vx *= k; s.vy *= k;
    if (s.x < 0 || s.x > W) { s.vx = -s.vx * 0.6; s.x = clamp(s.x, 0, W); }
    if (s.y < 0 || s.y > H) { s.vy = -s.vy * 0.6; s.y = clamp(s.y, 0, H); }
    if (solidAny(s.x, s.y)) { s.x = s.px; s.y = s.py; s.vx *= -0.5; s.vy *= -0.5; if (Math.hypot(s.vx, s.vy) > 60) packPlay("p_bounce_gren", 0.7, s.x, s.y); }
  }
  function holyFlight(s, dt) {
    bounceFlight(s, dt, 1.4);
    s.rot = (s.rot || 0) + dt * (0.6 + Math.hypot(s.vx, s.vy) / 90);   // it tumbles as it flies, slowly as it settles
    if (!s.sang && s.life < BOMBS[K.HOLY].sing) {   // its sound, heard map-wide (quieter far away), ending with the blast
      s.sang = true;
      packPlay("p_holy", 1 - Math.min(0.7, Math.hypot(s.x - me.x, s.y - me.y) / 6000));
    }
    if (Math.random() < dt * (s.sang ? 60 : 25)) {
      const a = Math.random() * 6.28, v = 40 + Math.random() * 120;
      puff(s.x, s.y, Math.cos(a) * v, Math.sin(a) * v, 0.8, 2 + Math.random() * 2, Math.random() < 0.5 ? "#fff3b0" : "#ffffff");
    }
  }
  // the blast wave: a ring racing out from a big bomb (eased like its drawn ring), flinging whatever it sweeps over
  // outward as it passes: pilots, bots, rubble, wreckage, sparks, shots; the bomber's browser also shares the push on
  // the junk rocks. You feel it (shake, thump) when it reaches you, not at the flash
  const waves = [];
  function waveTick(dt) {
    mawTick(dt, performance.now());
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i], r0 = w.r;
      w.t += dt;
      const k = Math.min(1, w.t / w.dur);
      w.r = w.max * (1 - (1 - k) * (1 - k));
      const swept = (o, id = o) => {   // each thing is pushed once, even if it flies out ahead of the front and gets caught again
        if (w.hit.has(id)) return -1;
        const d = Math.hypot(o.x - w.x, o.y - w.y);
        if (d < r0 || d >= w.r || fixedCover(w.x, w.y, o.x, o.y)) return -1;
        w.hit.add(id); return d;
      };
      const push = (o, d, mass) => { const f = w.power * Math.pow(1 - d / w.max, 0.6) / mass; o.vx += (o.x - w.x) / (d || 1) * f; o.vy += (o.y - w.y) / (d || 1) * f; };
      let d;
      if (playing && !me.dead && (d = swept(me)) >= 0) {
        push(me, d, 1);
        const near = 1 - d / w.max;
        shake = Math.max(shake, (w.small ? 0.1 + 0.3 * near : 0.3 + 1.3 * near));
        camKick.x += (me.x - w.x) / (d || 1) * (w.small ? 14 : 40) * near; camKick.y += (me.y - w.y) / (d || 1) * (w.small ? 14 : 40) * near;
        if (!w.small) sfx("boom_low", 0.3 + 0.7 * near, w.holy ? 0.9 : 1.2);
      }
      for (const b of bots) if (!b.dead && (d = swept(b)) >= 0) push(b, d, 1);
      for (const b of rubble) if ((d = swept(b)) >= 0) push(b, d, Math.max(1, Math.sqrt(b.mass / 200)));
      for (const list of [hulks, frags, debris, chunks]) for (const o of list) if ((d = swept(o)) >= 0) { push(o, d, 1); if (o.rest) o.rest = null; }
      for (const o of parts) if ((d = swept(o)) >= 0) push(o, d, 2.5);
      for (const o of shots) if (!BOMBS[o.kind] && (d = swept(o)) >= 0) push(o, d, 3);
      if (w.mine) for (const r of world.rocks) if (!grabbed.has(r.key) && (d = swept(r, r.key)) >= 0) {
        push(r, d, Math.max(1, (r.r / 30) ** 2));
        r.vx = clamp(r.vx, -4000, 4000); r.vy = clamp(r.vy, -4000, 4000);
        rockMotion.set(r.slot, { slot: r.slot, gen: r.gen, at: clockNow(), x: r.x, y: r.y, vx: r.vx, vy: r.vy, by: myTag });
      }
      // a wall of dust riding the front
      for (let j = 0, n = (lowQ ? 5 : 14) * (1 - k); j < n; j++) {
        const a = Math.random() * 6.283, px = w.x + Math.cos(a) * w.r, py = w.y + Math.sin(a) * w.r, v = w.max / w.dur * 0.5 * (1 - k);
        if (px > -100 && px < W + 100 && py > -100 && py < H + 100) puff(px, py, Math.cos(a) * v, Math.sin(a) * v, 0.6, 5 + Math.random() * 6, w.holy ? "#fff3c8" : "#ffc68a", 1);
      }
      if (k >= 1) waves.splice(i, 1);
    }
  }
  function detonate(s, now) {
    if (s.boom) return;
    s.boom = true; s.life = 0;
    const bm = BOMBS[s.kind], R = bm.R, holy = !!bm.holy;
    if (bm.void) { voidBurst(s, now, bm); return; }
    const x = clamp(s.x, 0, W), y = clamp(s.y, 0, H), d = Math.hypot(me.x - x, me.y - y);
    const q = lowQ ? 0.35 : 1, far = R * 2.4;
    const [wr, wdur, wpow] = bm.wave;
    waves.push({ x, y, t: 0, r: 0, max: wr, dur: wdur, power: wpow, mine: s.mine, holy, hit: new Set() });   // hit: what it has pushed (objects, or keys for the junk rocks, rebuilt every frame)
    for (const b of [...bodies]) {   // a big bomb scoops a huge crater out of anything nearby (the holy one erases it)
      if (!s.mine && !b.free) continue;
      const bd = Math.hypot(b.x - x, b.y - y);
      if (bm.wipe && bd - b.r < bm.kill) carveAt(b, b.x, b.y, bm.carve, s.mine);
      else if (bd - b.r < R * 0.5) carveAt(b, x, y, bm.carve, s.mine);
    }
    booms.push({ x, y, t: 0, seed: Math.random() * 100, R, holy });
    // three shock waves: a fast bright one, a heavy one, and a faint far one, all bending the view
    rings.push({ x, y, t: 0, r: wr, col: "255,250,230", warp: true, dur: wdur, w: 46 });   // the blast wave itself
    rings.push({ x, y, t: -0.12, r: R * 0.95, col: holy ? "255,236,160" : "255,190,110", warp: true, dur: 1.2, w: 34 });
    rings.push({ x, y, t: -0.3, r: R * 1.8, col: "255,220,180", dur: 1.6, w: 14 });
    explode(x, y, Math.round(140 * q), 1300);
    packPlay(holy ? "p_boom_holy" : "p_boom_nuke", 1, x, y);
    for (let k = 0; k < (holy ? 200 : 120) * q; k++) {   // long glowing streaks thrown out with the blast
      const a = Math.random() * 6.28, v = 700 + Math.random() * (holy ? 1600 : 1100);
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 1.2 + Math.random() * 1.2, 2 + Math.random() * 2, Math.random() < 0.5 ? (holy ? "#ffe9a0" : "#ffb43c") : "#fff2c0", 1, 0.06);
    }
    smoke(x, y, Math.round(60 * q), 560, 6);
    rings.push({ x, y, t: -0.5, r: far, col: holy ? "255,240,190" : "255,140,80", dur: 2.2, w: 22 });   // the slow heat wave rolling far out
    if (d < far) { shake = Math.max(shake, (holy ? 1.8 : 1.4) * (1 - d / far)); flash = Math.max(flash, 0.5 * (d < R * 1.6 ? 1 : 1 - (d - R * 1.6) / (far - R * 1.6))); }   // (a flash, not a white-out: the blast is the show)
    if (post) { post.burst(x, y, R * 0.55, holy ? [0.85, 0.6, 0.22] : [0.3, 0.27, 0.27], holy ? 1.6 : 7, R * 4.5); post.wave(x, y, wr, wdur * 1.4, holy ? 0.05 : 0.07); }   // a towering cloud rolling out, and the wave bending the air
    if (holy) for (let k = 0; k < (lowQ ? 60 : 160); k++) {   // a rain of golden light drifting down out of it
      const a = Math.random() * 6.283, v = 80 + Math.random() * 700;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 1.5 + Math.random() * 2.5, 1.5 + Math.random() * 2.5, k % 3 ? "#ffe9a0" : "#ffffff", 0, 0, (Math.random() - 0.5) * 0.6, 0.97);
    }
    if (canHurt(s, me, "me", true) && d < bombReach(bm) && !fixedCover(x, y, me.x, me.y)) {   // your own bomb too: get clear of it
      hurtMe(s, now, bombDmg(bm, d), s.kind, 0, d < bm.kill);
    }
    for (const b of bots) {
      const bd = Math.hypot(b.x - x, b.y - y);
      if (bd > bombReach(bm) || !canHurt(s, b, b.id, true) || fixedCover(x, y, b.x, b.y)) continue;
      botHurt(b, bd < bm.kill ? 99 : bombDmg(bm, bd) * selfMul(s, b.id), s.id, now, bd < bm.kill, s.kind);
    }
    if (!s.mine) return;
    // the shooter wipes out everything in the blast and shares the result
    const take = (key, pts) => { grabbed.add(key); pushCapped(myGrabs, key, 40); me.score += pts; };
    for (const k of world.rocks) if (!grabbed.has(k.key) && Math.hypot(k.x - x, k.y - y) < R) take(k.key, 2);
    const ev = eventAt(clockNow());
    if (ev.active && ev.type === "meteors") for (let i = 0; i < 40; i++) {
      const m = meteor(ev, i);
      if (m && !grabbed.has(m.key) && Math.hypot(m.x - x, m.y - y) < R) take(m.key, 2);
    }
    if (ev.active && ev.type === "aliens") for (let u = 0; u < UFO_N; u++) {
      const key = "e" + ev.cyc + "u" + u, p = ufoPos(ev, u, ev.et);
      if (!grabbed.has(key) && Math.hypot(p.x - x, p.y - y) < R) { take(key, 15); }
    }
    showScore();
  }
