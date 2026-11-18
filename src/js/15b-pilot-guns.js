  // ---------- a player's guns on the authoritative server ----------
  // A pilot flown by a player (addPilot) carries an arsenal like the local pilot's: crates and trophies add guns,
  // the input picks one, and both triggers and the teleporter work by the rules shoot() keeps for the local pilot
  // (11-weapons.js). What only a screen can do fires in its plain form: a guided nuke flies straight.
  //   input: { w: the gun's index in WEAPON_KEYS, fire, alt: the triggers held, tele: a counter, +1 per press }
  const PILOT_FALLBACK = ["fire", "nuke", "holy", "tele", "gauntlet"];   // never switched to when a gun runs dry
  function pilotArm(b) {
    const o = MODES[MODE].only;
    b.arsenal = o ? { [o]: Infinity } : { fire: Infinity, gauntlet: Infinity }; b.weapon = o || "fire";
    Object.assign(b, { teleN: 0, rocketLoad: 0, loadFor: 0, spin: 0, charge: 0, cutCharge: 0, heat: 0, overheat: false });
    if (MODES[MODE].sandbox) for (const k of SANDBOX_GUNS) b.arsenal[k] = Infinity;   // the test range: everything, for ever (as baseArsenal)
  }
  const pilotShots = (b, kind) => shots.filter(s => s.owner === b.id && s.life > 0 && !s.boom && s.kind === kind);
  // a crate or a trophy: a new gun joins the arsenal, a carried one gets more ammo; the gun in hand stays
  function pilotGive(b, type, ammo) {
    if (type === "tele") return;   // the teleporter is retired
    if (MODES[MODE].only || !WEAPONS[type] || WEAPONS[type].disabled) return;
    b.arsenal[type] = Math.min(WEAPONS[type].ammo * 2, (b.arsenal[type] || 0) + ammo);
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
  const LD_MAX = 100;
  function pilotLag(s, p, now) {
    if (!p.input || !(p.rtt > 0)) return;
    const ld = Math.min(p.input.ld, LD_MAX), lag = clamp(ld >= 0 ? p.rtt + ld + 1000 / 60 : p.rtt / 2, 0, REWIND_MS);
    s.hitTime = now - lag;
    if (straightShot(s.kind)) s.catchup = lag / 1000;
  }
  function pilotTriggers(b, dt, now) {
    const i = b.input, only = MODES[MODE].only;
    // the gun picked: one this pilot carries (the teleporter is a tool, on its own button)
    const pick = WEAPON_KEYS[i.w];
    if (!only && pick && pick !== b.weapon && pick !== "tele" && pick in b.arsenal) {
      b.weapon = pick; b.fireCd = Math.max(b.fireCd, 0.15); b.rocketLoad = b.loadFor = b.charge = b.cutCharge = 0;
    }
    for (const k of ["gamma", "mine"]) if (b.arsenal[k] === 0 && !pilotShots(b, controlledKind(k)).length) {
      delete b.arsenal[k]; if (b.weapon === k) b.weapon = "fire";
    }
    if (i.tele > (b.teleDone || 0)) { b.teleDone = i.tele; pilotTele(b, now); }
    const k = only || b.weapon, w = WEAPONS[k], alt = w.alt, live = roundLive && !b.dead, ready = live && b.fireCd <= 0;
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
    // the rail's cutter: alt held widens it, letting go fires it
    if (alt && alt.charge) {
      if (i.alt && ready && (b.arsenal[k] || 0) >= alt.cost) b.cutCharge = Math.min(1, b.cutCharge + dt / alt.charge);
      else { if (b.cutCharge > 0 && !i.alt && ready) pilotShoot(b, now, k, true); b.cutCharge = 0; }
    }
    // the charge cannon: held charges it, letting go fires it
    if (w.charge) {
      if (i.fire && live) { b.charge = Math.min(1, b.charge + dt / w.charge); return; }
      if (b.charge > 0 && ready) pilotShoot(b, now, k, false, Math.max(0.25, b.charge));
      b.charge = 0;
    }
    if (!ready) return;
    if (i.alt && alt && !alt.load && !alt.charge) pilotShoot(b, now, k, true);
    else if ((i.fire && !w.charge) || (k === "gauntlet" && now < (b.lungeUntil || 0))) pilotShoot(b, now, k, false);   // a lunge lands blows too
  }
  function pilotShoot(b, now, k, alt, mul = 1, rockets = 0) {
    const w = WEAPONS[k], ammo = b.arsenal[k] || 0, refuse = () => { b.fireCd = 0.2; };
    let pat = alt ? w.alt : w;
    if (!pat) return refuse();
    if (rockets) pat = { ...pat, cost: rockets, spread: Array.from({ length: rockets }, (_, j) => (j - (rockets - 1) / 2) * .14) };
    if (alt ? ammo < pat.cost : !(ammo > 0)) return refuse();
    if (!alt && k === "gamma" && pilotShots(b, K.GAMMA).length) return refuse();   // one orb at a time
    const ax = Math.cos(b.a), ay = Math.sin(b.a), r = binR(b.lv || 1);
    if (alt && pat.recall) {
      if (!shots.some(s => s.owner === b.id && s.kind === K.SAW && !s.returning && s.life > 0)) return refuse();
      recallSaws(volley(b, now, pat, { x: b.x, y: b.y })); b.fireCd = pat.cd; return;
    }
    if (w.melee && !alt) {   // the gauntlet: a blow only lands on a bin within reach ahead
      const nx = b.x + ax * (r + 14), ny = b.y + ay * (r + 14);
      if (!bots.some(o => o !== b && !o.dead && !mates(o, b) && Math.hypot(o.x - nx, o.y - ny) < r + 60 + binR(o.lv || 1) - 20)) { b.fireCd = 0.05; return; }
      b.fireCd = w.cd; volley(b, now, w, { x: nx, y: ny }); return;
    }
    if (alt && pat.lunge) {
      if (now < (b.lungeReady || 0)) return;
      b.lungeReady = now + 1200; b.lungeUntil = now + 450;
      b.vx += ax * 950; b.vy += ay * 950; b.inv = Math.max(b.inv, now + 200); b.dashAt = now;
      return;
    }
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
    if (alt && pat.cutter) pat = { ...pat, cut: Math.round(24 + 48 * b.cutCharge) };
    const cdMul = MODES[MODE].cdMul || 1;
    b.fireCd = alt ? pat.cd : w.spin ? (w.spin[0] + (w.spin[1] - w.spin[0]) * b.spin) * cdMul : w.charge ? 0.3 : w.cd * cdMul;
    volley(b, now, pat, null, (k === "bolt" && !alt) || (k === "laser" && alt) ? boltLock(b, null) : undefined, mul);
    const kick = (pat.kick || 0) * (w.charge ? mul : 1);
    b.vx -= ax * kick; b.vy -= ay * kick;
    shotSound(pat.shot[0], b.x, b.y, b.id);
    pilotSpend(b, k, alt ? pat.cost : 1);
  }
  // the teleporter: the first press throws the beacon, the next jumps onto it (telefragging whoever sits there)
  function pilotTele(b, now) {
    if (b.dead || !roundLive || now < (b.teleCd || 0)) return;
    const beacon = pilotShots(b, K.BEACON)[0];
    if (beacon) {
      beacon.life = 0; b.teleCd = now + 350;
      b.x = beacon.x; b.y = beacon.y; b.hitHistory = [];
      volley(b, now, TELEFRAG, { x: beacon.x, y: beacon.y });
      b.vx = beacon.vx * 0.5; b.vy = beacon.vy * 0.5;
      b.teleN = Math.max(0, b.teleN - 1);
      return;
    }
    if (!(b.teleN > 0)) return;
    b.teleCd = now + 350;
    volley(b, now, WEAPONS.tele, null);
  }
