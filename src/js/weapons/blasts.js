  // the blast of a rocket or a plasma orb, wherever it ends: everyone sees it, and it hurts me and my bots nearby
  // (whoever took the direct hit, s.direct, already got its damage)
  function splash(s, now) {
    if (s.kind === K.GAMMA && !s.sucked) { if (!s.sucking) gammaSuck(s, now); return; }   // the demonic orb draws everything in first, then lets it all go
    blastFx(s);
    if (s.splashed) return;
    s.splashed = true;
    const [R0, hi, lo, push] = SPLASH[s.kind], m = s.m || 1;
    // blasts dig: grenades, mines and homing rockets that go off near rock bite craters out of it
    const dig = { [K.GREN]: 62, [K.MINE]: 58 }[s.kind], own = s.mine || botById.has(s.owner);
    if (dig && !s.surfFx) { const b = solidAny(s.x, s.y) || bodies.find(o => !o.dead && Math.hypot(o.x - s.x, o.y - s.y) - o.r < dig * 0.6); if (b) { s.surfFx = true; surfaceHit(b, s.x, s.y, s.kind); } }   // (the breach, seen by everyone; before the crater, so its pieces have a face to come from)
    if (dig) for (const b of [...bodies]) if (Math.hypot(b.x - s.x, b.y - s.y) - b.r < dig && (own || b.free)) carveAt(b, s.x, s.y, dig, own);
    const hit = (o, id, rad) => {
      const d = Math.hypot(o.x - s.x, o.y - s.y), R = R0 + rad;
      if (d > R || id === s.direct || !canHurt(s, o, id, true) || fixedCover(s.x, s.y, o.x, o.y)) return 0;
      const jump = ownShot(s, o, id) ? 2.6 : 1, f = push * jump * (0.45 + 0.9 * (1 - d / R));   // a rocket jump: your own blast flings you; the nearer, the harder
      o.vx += (o.x - s.x) / (d || 1) * f; o.vy += (o.y - s.y) / (d || 1) * f;
      pushed.add(o);
      return (lo + (hi - lo) * (1 - d / R)) * m;
    };
    const pushed = new Set();
    const dm = hit(me, "me", 26);
    if (dm) hurtMe(s, now, dm);
    for (const b of bots) { const db = hit(b, b.id, 26); if (db) botHurt(b, db * selfMul(s, b.id), s.id, now, false, s.kind); }
    // and its shock wave runs on past the blast: whoever and whatever it reaches (bins, wreckage, pieces, sparks,
    // shots) is thrown out from the middle, the harder the nearer (those the blast itself threw are not thrown twice)
    waves.push({ x: s.x, y: s.y, t: 0, r: 0, max: R0 * 2.4, dur: 0.32, power: push * 1.6 * Math.min(2, m), mine: s.mine || botById.has(s.owner), hit: pushed, small: true });
  }
  // the demonic orb's end: for half a second it drinks everything round it in (bins, wreckage, pieces, smoke), light
  // and embers pouring into it as it swells, then lets it all go at once (splash: the blast, its wave, the damage)
  const GAMMA_SUCK = { t: 0.5, R: 620, acc: 3400 };
  const maws = [];
  function gammaSuck(s, now) {
    s.sucking = true; s.boom = true;
    maws.push({ s, x: s.x, y: s.y, t: 0 });
    rings.push({ x: s.x, y: s.y, t: 0, r: GAMMA_SUCK.R, col: "120,0,20", warp: true, dur: GAMMA_SUCK.t, w: 18 });
    if (post) post.wave(s.x, s.y, GAMMA_SUCK.R, GAMMA_SUCK.t, -0.06);
    if (Math.hypot(s.x - me.x, s.y - me.y) < 1600) packPlay("p_charge", 0.8, s.x, s.y);
  }
  function mawTick(dt, now) {
    for (let i = maws.length - 1; i >= 0; i--) {
      const m = maws[i], { R, acc } = GAMMA_SUCK;
      m.t += dt;
      const pull = (o, k = 1) => { const dx = m.x - o.x, dy = m.y - o.y, d = Math.hypot(dx, dy); if (d < 1 || d > R) return; const a = acc * Math.sqrt(1 - d / R) * k * dt; o.vx += dx / d * a; o.vy += dy / d * a; if (o.rest) o.rest = null; };
      if (playing && !me.dead) pull(me);
      for (const b of bots) if (!b.dead) pull(b);
      for (const list of [hulks, frags, debris, chunks]) for (const o of list) pull(o, 1.3);
      for (const o of parts) pull(o, 2);
      for (let k = 0; k < (lowQ ? 2 : 6); k++) {   // embers, smoke and light pouring in
        const a = Math.random() * 6.283, r = R * (0.5 + Math.random() * 0.5), v = r * 2.6;
        puff(m.x + Math.cos(a) * r, m.y + Math.sin(a) * r, -Math.cos(a) * v, -Math.sin(a) * v, 0.38, k % 3 ? 1.4 + Math.random() : 6 + Math.random() * 6, k % 3 ? (k % 2 ? "#ff2a3c" : "#ff7a4a") : "#140508", k % 3 ? 5 : 2, 0, 0, 1);
      }
      if (m.t >= GAMMA_SUCK.t) { maws.splice(i, 1); m.s.sucked = true; m.s.x = m.x; m.s.y = m.y; splash(m.s, now); }
    }
  }
  // the look of a rocket or plasma blast, once per shot
  function blastFx(s) {
    if (s.fxDone) return;
    s.fxDone = true; s.boom = true;
    const x = s.x, y = s.y, near = Math.hypot(x - me.x, y - me.y) < 1400;
    if (s.kind === K.MINE) {   // a mine: a hard orange blast and a shock ring
      explode(x, y, 60, 340);
      if (near) { packPlay("p_boom_mine", 1, x, y); shake = Math.max(shake, 0.28 * (1 - Math.hypot(x - me.x, y - me.y) / 1400)); }
      return;
    }
    if (s.kind === K.GAMMA) {   // the demonic orb bursts: blood-red hellfire into black smoke, a heavy warping shock wave, red lightning
      explode(x, y, 90, 520, "hell");
      rings.push({ x, y, t: 0, r: 420, col: "90,0,14", warp: true, dur: 0.8, w: 22, shock: 34 });
      impacts.push({ x, y, t: 0, r: 380, col: "170,10,30", dur: 0.9, soft: 0.6, flick: Math.random() * 6.28 });
      for (let k = 0; k < (lowQ ? 4 : 9); k++) { const a = Math.random() * 6.283, d = 120 + Math.random() * 200; arcs.push({ x1: x, y1: y, x2: x + Math.cos(a) * d, y2: y + Math.sin(a) * d, t: 0, col: "255,50,60" }); }
      // and it leaves a pall of black smoke, crimson embers spitting out of it
      for (let k = 0; k < (lowQ ? 6 : 14); k++) { const a = Math.random() * 6.283, v = 30 + Math.random() * 130; puff(x + Math.cos(a) * 30, y + Math.sin(a) * 30, Math.cos(a) * v, Math.sin(a) * v, 0.8 + Math.random() * 0.8, 14 + Math.random() * 14, k % 3 ? "#0a0507" : "#240810", 2, 0, (Math.random() - 0.5) * 0.8, 0.95); }
      for (let k = 0; k < (lowQ ? 6 : 18); k++) { const a = Math.random() * 6.283, v = 200 + Math.random() * 600; puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.5 + Math.random() * 0.7, 1.4 + Math.random() * 1.6, k % 2 ? "#ff2a3c" : "#ff7a4a", 5, 0, 0, 0.93); }
      if (post) post.burst(x, y, 160, [0.4, 0.06, 0.08], 0.6, 900);   // (a thin blood-red haze: a dark one hid the screen)
      // The orb travels beyond the old 1400px gate; let the sound mixer handle distance.
      packPlay("p_boom_gamma", 1, x, y); packPlay("p_blast_heavy", 0.7, x, y);
      if (near) shake = Math.max(shake, 0.3 * (1 - Math.hypot(x - me.x, y - me.y) / 1400));
      return;
    }
    if (s.kind === K.NOVA) {   // the Plasma Nova bursts: a white-green flash, lightning lashing out all round, plasma
      // sparks and a glow that fades, the air thrown out (no ring drawn); all of it by its charge
      const c = Math.min(1, s.m || 1), R = 250 * (0.6 + 0.4 * c);
      explode(x, y, Math.round(40 + 50 * c), 300 + 260 * c, "plasma_green");
      impacts.push({ x, y, t: 0, r: R * 0.55, col: "#f4ffe8", dur: 0.12 });
      impacts.push({ x, y, t: 0, r: R * 1.3, col: "150,255,90", dur: 0.7, soft: 0.6, flick: Math.random() * 6.28 });
      for (let k = 0; k < (lowQ ? 5 : 12) * (0.5 + c); k++) { const a = Math.random() * 6.283, d = R * (0.5 + Math.random() * 0.7); arcs.push({ x1: x, y1: y, x2: x + Math.cos(a) * d, y2: y + Math.sin(a) * d, t: 0, col: k % 3 ? "170,255,100" : "240,255,220" }); }
      for (let k = 0; k < (lowQ ? 12 : 34); k++) { const a = Math.random() * 6.283, v = 300 + Math.random() * 700 * (0.5 + c); puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.3 + Math.random() * 0.5, 1.2 + Math.random() * 1.6, k % 3 ? "#b8ff6a" : "#ffffff", 1, 0.05, 0, 0.94); }
      if (post) post.burst(x, y, R * 0.8, [0.25, 0.6, 0.1], 1.6, 600);
      packPlay("p_ut_pulse_explode", 0.7 + 0.5 * c, x, y); packPlay("p_blast", 0.4 + 0.4 * c, x, y);
      if (near) shake = Math.max(shake, (0.12 + 0.2 * c) * (1 - Math.hypot(x - me.x, y - me.y) / 1400));
      return;
    }
    if (s.kind === K.BULLET_ALT) {   // an explosive round: a small hard burst of fire, burning embers, a patch of flame that flickers out
      explode(x, y, 26, 230);
      impacts.push({ x, y, t: 0, r: 110, col: "255,140,50", dur: 0.8, soft: 0.5, flick: Math.random() * 6.28 });
      for (let k = 0; k < (lowQ ? 4 : 10); k++) { const a = Math.random() * 6.283, v = 80 + Math.random() * 260; puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.6 + Math.random() * 0.8, 1 + Math.random() * 1.2, k % 2 ? "#ffb43c" : "#ff6a1f", 5, 0, (Math.random() - 0.5) * 3, 0.95); }
      if (near) { packPlay("p_blast", 0.45, x, y); shake = Math.max(shake, 0.08 * (1 - Math.hypot(x - me.x, y - me.y) / 1400)); }
      return;
    }
    if (s.kind === K.ORB) {   // plasma: a blue-white ball of energy, a warping shock ring, crackling sparks, a sizzle
      explode(x, y, 45, 300, "plasma");
      impacts.push({ x, y, t: 0, r: 170, col: "#bff4ff" });
      rings.push({ x, y, t: 0, r: 280, col: "120,220,255", warp: true, dur: 0.55, w: 16 });
      rings.push({ x, y, t: -0.06, r: 170, col: "255,255,255", dur: 0.35, w: 6 });
      for (let k = 0; k < (lowQ ? 18 : 48); k++) { const a = Math.random() * 6.283, v = 150 + Math.random() * 520; puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.35 + Math.random() * 0.5, 1.2 + Math.random() * 1.6, k % 3 ? "#9fe8ff" : "#ffffff", 1, 0.05); }
      for (let k = 0; k < 4; k++) { const a = Math.random() * 6.283; arcs.push({ x1: x, y1: y, x2: x + Math.cos(a) * 140, y2: y + Math.sin(a) * 140, t: 0 }); }
      if (near) packPlay("p_boom_orb", 1, x, y);
      if (near) { shake = Math.max(shake, 0.25 * (1 - Math.hypot(x - me.x, y - me.y) / 1400)); }
    } else {   // rocket: a fat fireball with a warping shock ring and smoke
      explode(x, y, 80, 420);
      if (near) { packPlay(s.kind === K.GREN ? "p_quake_grenade_boom" : "p_boom_rocket", 1, x, y); shake = Math.max(shake, 0.3 * (1 - Math.hypot(x - me.x, y - me.y) / 1400)); }
    }
  }
  let hitTickAt = 0;
  let hitStopUntil = 0;
  // Quake's medals: Impressive for two rail hits in a row; Humiliation for a ram kill; Headshot for a scoped rail kill from afar
  let railRun = 0, railLast = null;
  const railHits = new Set();   // my rail shots that hit (by id)
