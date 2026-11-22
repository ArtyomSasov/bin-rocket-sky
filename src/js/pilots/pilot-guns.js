  // ---------- a player's guns on the authoritative server ----------
  // A pilot flown by a player (addPilot) carries an arsenal like the local pilot's: crates and trophies add guns,
  // the input picks one, and both triggers work by the rules shoot() keeps for the local pilot
  // (11-weapons.js). What only a screen can do fires in its plain form: a guided nuke flies straight.
  //   input: { w: the gun's index in WEAPON_KEYS, fire, alt: the triggers held }
  const PILOT_FALLBACK = ["fire", "nuke", "holy", "saw"];   // never switched to when a gun runs dry
  function pilotArm(b) {
    const o = MODES[MODE].only;
    b.arsenal = o ? { [o]: Infinity } : { fire: Infinity }; b.weapon = o || "fire";
    Object.assign(b, { rocketLoad: 0, loadFor: 0, spin: 0, charge: 0, altCharge: 0, heat: 0, overheat: false });
    if (MODES[MODE].sandbox) for (const k of SANDBOX_GUNS) b.arsenal[k] = Infinity;   // the test range: everything, for ever (as baseArsenal)
  }
  const pilotShots = (b, kind) => shots.filter(s => s.owner === b.id && s.life > 0 && !s.boom && s.kind === kind);
  // a crate or a trophy: a new gun joins the arsenal, a carried one gets more ammo; the gun in hand stays
  function pilotGive(b, type, ammo) {
    if (MODES[MODE].only || !WEAPONS[type] || WEAPONS[type].disabled) return;
    b.arsenal[type] = Number.isFinite(WEAPONS[type].ammo) ? Math.min(WEAPONS[type].ammo * 2, (b.arsenal[type] || 0) + ammo) : Infinity;
  }
  function pilotSpend(b, k, n) {
    if (!Number.isFinite(b.arsenal[k])) return;
    b.arsenal[k] = Math.max(0, b.arsenal[k] - n);
    if (b.arsenal[k] > 0 || pilotShots(b, controlledKind(k)).length) return;   // mines and the orb stay to be set off
    delete b.arsenal[k];
    if (b.weapon === k) b.weapon = WEAPON_KEYS.find(w => !PILOT_FALLBACK.includes(w) && b.arsenal[w]) || "fire";
  }
  // what the snapshot tells the player about their arsenal: [gun index, ammo] (-1: endless)
  const pilotArsenalWire = b => Object.entries(b.arsenal).map(([k, n]) => [WEAPON_KEYS.indexOf(k), Number.isFinite(n) ? Math.ceil(n) : -1]);
  // A player's shot is judged against where its targets were on the player's screen (a straight round also
  // catches up that far along its line, as a peer's does in 12-network.js). Their screen shows the others between
  // two snapshots, ld ms behind the newest, which itself left here half a round trip before it arrived; the controls
  // then take the other half to come back, and wait half a step on average for a step to fly them. So the targets
  // they saw are a round trip, ld and half a step old: Source's "server time - latency - view interpolation".
  // (A screen that does not say ld extrapolates the others half a round trip ahead: half a round trip ago.)
  // ld is the screen's word, so it is believed only as far as an honest one goes: two snapshot gaps and some
  // jitter (LD_MAX); the round trip is the server's own measure (the shortest of the recent ones), and the whole
  // rewind is capped (REWIND_MS)
  const LD_MAX = 150;   // (a screen shows the others at most 150 ms back: srv.interp)
  // A shot from a flight command also waited in the command queue before it was flown (cmdWait): the server's own
  // measure, from when the command came in, so its targets are judged that much further back too. Nothing in it is
  // the screen's word but ld, capped as before
  function pilotLag(s, p, now) {
    if (!p.input || !(p.rtt > 0)) return;
    const ld = Math.min(p.input.ld, LD_MAX), wait = p.cmdWait >= 0 ? Math.min(p.cmdWait, 200) : 0;
    let lag = ld >= 0 ? p.rtt + ld + 1000 / 60 + wait : p.rtt / 2;
    // the screen says which moment of the others it showed (viewAt, as Source's command carries its view's tick): that
    // moment exactly, with no guess at the way there and back; believed only from 60 ms under the estimate above to
    // 25 ms over it (a screen lying about it gains at most 25 ms of rewind)
    if (p.viewAt > 0 && ld >= 0 && now >= p.viewAt) lag = clamp(now - p.viewAt, lag - 60, lag + 25);
    lag = clamp(lag, 0, REWIND_MS);
    s.hitTime = now - lag;
    if (straightShot(s.kind)) s.catchup = lag / 1000;
  }
  // a player's guided nuke, flown here as their screen flies its copy (guideTick): the same turn toward their stick
  // (gx, gy) each step, and blown when their count of blow-ups (gb) goes up. While it flies, their trigger is only that
  function pilotGuide(b, dt, now) {
    const gd = b.guide, i = b.input;
    if (!gd) return false;
    const s = gd.shot;
    if (!s || s.boom || s.life <= 0 || b.dead || !shots.includes(s)) { b.guide = null; return false; }
    if ((i.gb || 0) > gd.gb) { b.guide = null; detonate(s, now); return true; }
    const v = Math.hypot(s.vx, s.vy) || 1;
    let a = Math.atan2(s.vy, s.vx);
    if (Math.hypot(i.gx || 0, i.gy || 0) > 0.15) a = lerpAng(a, Math.atan2(i.gy, i.gx), Math.min(1, 3.2 * dt));
    s.vx = Math.cos(a) * v; s.vy = Math.sin(a) * v;
    return true;
  }
  function pilotTriggers(b, dt, now) {
    const i = b.input, only = MODES[MODE].only;
    if (pilotGuide(b, dt, now)) return;
    // the gun picked: one this pilot carries
    const pick = WEAPON_KEYS[i.w];
    if (!only && pick && pick !== b.weapon && pick in b.arsenal) {
      b.weapon = pick; b.fireCd = Math.max(b.fireCd, 0.15); b.rocketLoad = b.loadFor = b.charge = b.altCharge = 0;
    }
    for (const k of ["gamma", "mine"]) if (b.arsenal[k] === 0 && !pilotShots(b, controlledKind(k)).length) {
      delete b.arsenal[k]; if (b.weapon === k) b.weapon = "fire";
    }
    const k = only || b.weapon, w = WEAPONS[k], alt = w.alt, live = roundLive && !b.dead, ready = live && b.fireCd <= 0;
    if (k === "saw" && live) bladeTouch(b, now, b.charge || 0, bots.map(o => [o.id, o]));
    b.heat = Math.max(0, b.heat - 0.45 * dt); if (b.overheat && b.heat < 0.3) b.overheat = false;
    b.spin = w.spin && i.fire && live ? Math.min(1, b.spin + dt / w.spin[2]) : Math.max(0, b.spin - dt * 1.5);
    // rockets, as rocketLoadTick has them: the press loads one, holding loads another every ROCKET_LOAD seconds; when
    // full (three, or what is carried) the salvo goes by itself, and letting go fires what is loaded
    if (alt && alt.load) {
      const carried = Math.min(ROCKET_MAX, b.arsenal[k] || 0);
      if (i.alt && ready && carried) {
        if (b.rocketLoad) b.loadFor += dt;
        b.rocketLoad = rocketsLoaded(b.loadFor, carried);
        if (b.rocketLoad >= carried) { const n = b.rocketLoad; b.rocketLoad = b.loadFor = 0; pilotShoot(b, now, k, true, 1, n); }
      } else { const n = b.rocketLoad; b.rocketLoad = b.loadFor = 0; if (n && ready) pilotShoot(b, now, k, true, 1, n); }
    }
    // a charged alt (the Plasma Nova): held, it charges; full, it goes by itself; let go, it goes as charged
    if (alt && alt.charge) {
      if (i.alt && ready && (b.arsenal[k] || 0) >= alt.cost) { b.altCharge = Math.min(1, b.altCharge + dt / alt.charge); if (alt.nova && b.altCharge >= 1) { pilotShoot(b, now, k, true); b.altCharge = 0; } }   // (a full nova goes by itself, as on the screen)
      else { if (b.altCharge > 0 && !i.alt && ready) pilotShoot(b, now, k, true); b.altCharge = 0; }
    }
    // the Blood Blade: held, it winds up; let go, it strikes
    if (w.charge) {
      if (i.fire && live) { b.charge = Math.min(1, b.charge + dt / w.charge); return; }
      if (b.charge > 0 && ready) pilotShoot(b, now, k, false, Math.max(0.25, b.charge));
      b.charge = 0;
    }
    // (a quick alt has its own cooldown: the shock beam right after an orb)
    if (w.quickAlt && i.alt && alt && live && (b.altCd || 0) <= 0) { pilotShoot(b, now, k, true); return; }
    if (!ready) return;
    if (i.alt && alt && !alt.load && !alt.charge && !w.quickAlt) pilotShoot(b, now, k, true);   // (a quick alt waits for its own cooldown, as the screen's does)
    else if (i.fire && !w.charge) pilotShoot(b, now, k, false);
  }
  function pilotShoot(b, now, k, alt, mul = 1, rockets = 0) {
    const w = WEAPONS[k], ammo = b.arsenal[k] || 0, refuse = () => { b.fireCd = 0.2; };
    let pat = alt ? w.alt : w;
    if (!pat) return refuse();
    if (rockets) pat = { ...pat, cost: rockets, spread: Array.from({ length: rockets }, (_, j) => (j - (rockets - 1) / 2) * .14) };
    if (alt ? ammo < pat.cost : !(ammo > 0)) return refuse();
    if (!alt && k === "gamma" && pilotShots(b, K.GAMMA).length) return refuse();   // one orb at a time
    const ax = Math.cos(b.a), ay = Math.sin(b.a), r = binR(b.lv || 1);
    if (alt && pat.minedet) {
      if (!pilotShots(b, K.MINE).some(s => SHOTS[K.MINE].life - s.life >= MINE_ARM)) return refuse();
      volley(b, now, MINE_DETONATOR, { x: b.x, y: b.y }); b.fireCd = pat.cd; return;
    }
    if (alt && pat.detonate) {
      const o = pilotShots(b, K.GAMMA).pop();
      if (!o) return refuse();
      volley(b, now, DETONATOR, { x: o.x, y: o.y }); b.fireCd = pat.cd; return;
    }
    if (alt && pat.heat) {
      if (b.overheat) return;
      b.heat += pat.heat; if (b.heat >= 1) b.overheat = true;
    }
    if (alt && pat.nova) mul *= 0.55 + 0.45 * b.altCharge;
    if (alt && pat.mul) mul *= pat.mul;   // (as the screen)   // (as the screen charges it)
    const cdMul = MODES[MODE].cdMul || 1;
    if (alt && w.quickAlt) { b.altCd = pat.cd; b.fireCd = Math.max(b.fireCd, 0.15); } else
    b.fireCd = alt ? pat.cd : w.spin ? (w.spin[0] + (w.spin[1] - w.spin[0]) * b.spin) * cdMul : w.charge ? 0.3 : w.cd * cdMul;
    const gun = muzzleOf(b, k);   // from the gun's tip, as the player's screen fires it
    const shot = volley(b, now, pat, gun, undefined, mul);
    if (pat.guided && shot) { shot.life = SHOTS[K.NUKE].life; b.guide = { shot, gb: b.input.gb || 0 }; }   // steered by the player from now on
    const kick = (pat.kick || 0) * (w.charge ? mul : 1);
    b.vx -= ax * kick; b.vy -= ay * kick;
    shotSound(pat.shot[0], b.x, b.y, b.id);
    pilotSpend(b, k, alt ? pat.cost : 1);
  }
