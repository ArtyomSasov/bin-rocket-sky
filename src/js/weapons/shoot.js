  // fire the gun in hand (alt: its alternate fire, which needs its full ammo cost)
  // mul: the charge cannon's charge (0.25..1)
  function shoot(now, alt, mul = 1, loadedRockets = 0) {
    const k = me.weapon, w = WEAPONS[k];
    let pat = alt ? w.alt : w;
    if (alt && !pat) { rejectFire("PRIMARY FIRE ONLY", now); return; }
    if (!alt && k === "gamma" && controlledShots("gamma").length) { rejectFire("ALT · DETONATE ACTIVE ORB", now); return; }
    if (alt && pat.load) {
      if (!loadedRockets) return;
      const count = Math.min(3, loadedRockets, me.arsenal.rocket || 0);
      if (!count) return;
      pat = { ...pat, cost: count, spread: Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * .14) };
    }
    if (!alt && !(me.arsenal[k] > 0)) { rejectFire("NO AMMO · use alternate command", now); return; }
    if (alt && (me.arsenal[k] || 0) < pat.cost) { rejectFire("NEED " + pat.cost + " AMMO", now); return; }
    if (alt && pat.cutter) pat = { ...pat, cut: Math.round(24 + 48 * railCharge) };
    if (alt && pat.nova) mul *= 0.55 + 0.45 * railCharge;
    if (alt && pat.mul) mul *= pat.mul;   // (a mode whose shots are weaker: the pistol's rapid fire)   // (the nova: as big and as strong as it was charged)
    if (alt && pat.recall) {
      if (!shots.some(s => myShot(s) && s.kind === K.SAW && !s.returning && s.life > 0)) { rejectFire(controlledShots("saw").length ? "BLADES ALREADY RETURNING" : "NO ACTIVE BLADES", now); return; }
      const signal = volley(me, now, pat, { x: me.x, y: me.y }); recallSaws(signal); fireCd = pat.cd; sfx(...pat.sfx); return;
    }
    if (w.melee && !alt) {   // the gauntlet: a blow only lands on a bin within reach ahead (the blade spins anyway)
      const reach = binR(me.lv) + 60, nx = me.x + Math.cos(me.a) * (binR(me.lv) + 14), ny = me.y + Math.sin(me.a) * (binR(me.lv) + 14);
      let target = null;
      for (const [rid, r] of remotes) if (!r.dead && !mates(r, me) && Math.hypot(r.x - nx, r.y - ny) < reach + binR(r.lv || 1) - 20) { target = r; break; }
      if (!target) { fireCd = 0.05; return; }
      fireCd = w.cd;
      volley(me, now, w, { x: nx, y: ny });   // (the swing, its hit and their sounds: saberSwing, shotBurst)
      shotFeel("gauntlet", { x: nx, y: ny }, 0, ...w.feel);
      return;
    }
    if (alt && pat.lunge) {   // lunge: a burst forward with the blade out
      if (now < lungeReady) { rejectFire("LUNGE RECHARGING", now); return; }
      lungeReady = now + 1200; me.lungeUntil = now + 450;
      me.vx += Math.cos(me.a) * 950; me.vy += Math.sin(me.a) * 950; me.inv = Math.max(me.inv, now + 200);
      dashBurst(me); me.swingAt = 0; saberSwing(me, now);
      return;
    }
    if (alt && pat.minedet) {   // set off every mine of mine, on every screen
      if (!shots.some(s => myShot(s) && s.kind === K.MINE && s.life > 0)) { rejectFire("NO ACTIVE MINES", now); return; }
      if (!controlledShots("mine").some(s => SHOTS[K.MINE].life - s.life >= MINE_ARM)) { rejectFire("MINES ARMING", now); return; }
      volley(me, now, MINE_DETONATOR, { x: me.x, y: me.y }); fireCd = pat.cd; sfx(...pat.sfx);
      return;
    }
    if (alt && pat.detonate) {   // the gamma orb's alt: a detonator at my orb, which sets it off on every screen
      const o = shots.filter(s => myShot(s) && s.kind === K.GAMMA && s.life > 0).pop();
      if (!o) { rejectFire("NO ACTIVE DEMONIC ORB", now); return; }
      volley(me, now, DETONATOR, { x: o.x, y: o.y }); fireCd = pat.cd; sfx(...pat.sfx);
      return;
    }
    if (alt && pat.heat) {   // the minigun's burst heats the barrels; overheated, it must cool before it fires again
      if (me.overheat) return;
      me.heat = (me.heat || 0) + pat.heat;
      if (me.heat >= 1) { me.overheat = true; floaters.push({ x: me.x, y: me.y - 60, t: 0, txt: "OVERHEAT", gold: false }); sfx("shield_hit", 0.7, 0.6); }
    }
    const cdMul = MODES[MODE].cdMul || 1;
    if (alt && w.quickAlt) { me.altCd = pat.cd; fireCd = Math.max(fireCd, 0.15); } else
    fireCd = alt ? pat.cd : w.spin ? (w.spin[0] + (w.spin[1] - w.spin[0]) * spin) * cdMul : w.charge ? 0.3 : w.cd * cdMul;
    const gun = muzzleAt(k);   // (the server fires a player's pilot from the same gun tips)
    if (alt && pat.shot[0] === K.LASER) { me.linkHeld = now - (me.linkAt || 0) < 400 ? (me.linkHeld || 0) + (now - me.linkAt) / 1000 : 0; me.linkAt = now; mul *= linkHeatOf(me.linkHeld); }   // (the link beam heats up held on)
    const muzzle = volley(me, now, pat, gun, (k === "bolt" && !alt || alt && pat.shot[0] === K.LASER) ? boltLock(me, gun) : undefined, mul);
    const [name, vol, pitch] = pat.sfx;
    const packed = alt && k === "orb" ? audioCue("shockBeam") : k === "minigun" && alt ? (stopContinuous("me"), packPlay("p_user_autocannon", 0.7))
      : k === "minigun" ? continuousFire("me", "minigun", me.x, me.y, now, false)
      : k === "laser" && !alt ? continuousFire("me", "laser", me.x, me.y, now, false)
      : k === "saw" && !alt ? true   // (the Blood Blade's swing sounds as it swings: swingStart)
      : packPlay(alt ? ALT_SOUND[k] || "" : k === "holy" ? "p_fire_gren" : "p_fire_" + k, 0.9);
    if (!packed) sfx(name, vol, w.charge ? pitch * (1.3 - 0.4 * mul) : pitch);   // a fuller charge sounds deeper
    if (pat.fx) MUZZLE_FX[pat.fx](muzzle);
    shotFeel(k, muzzle, pat.kick * (w.charge ? mul : 1), ...pat.feel);
    if (pat.guided && !serverRun) startGuide(muzzle);
    else if (pat.guided) {   // on the server: the copy shown here (predictShot) is steered, and the server steers its own alike
      const g = shots.filter(o => o.owner === srv.id && o.kind === K.NUKE && !o.boom).pop();
      if (g) startGuide(g);
    }
    if (!serverRun) spend(k, alt ? pat.cost : 1);   // on the server, ammo is its count
  }
  // ---- the minigun spins up while the trigger is held; the charge cannon charges while held and fires on release
  let spin = 0, charge = 0, railCharge = 0, gauntHum = false;   // railCharge: the railgun's alt, held
  let miniHeat = 0;   // how hot the minigun's barrels are: they smoke for a while after it stops
  const MINI_SMOKE = ["rgb(150,152,165)", "rgb(170,170,182)", "rgb(130,132,148)"];
  function triggerTick(dt, now, ready, held) {
    const w = WEAPONS[me.weapon];
    if (miniHeat > 0) {   // hot barrels smoke once the firing stops, thinning as they cool
      const firing = held && me.weapon === "minigun" && playing && !me.dead;
      if (!firing && me.weapon === "minigun" && !me.dead && Math.random() < miniHeat * dt * (lowQ ? 20 : 55)) {
        const R = 46 * sizeOf(me.lv), nx = me.x + Math.cos(me.a) * R, ny = me.y + Math.sin(me.a) * R;
        puff(nx, ny, me.vx * 0.8 + (Math.random() - 0.5) * 30, me.vy * 0.8 - 25 - Math.random() * 30, 1.1 + Math.random() * 0.9, 7 + Math.random() * 7, MINI_SMOKE[Math.random() * 3 | 0], 2);
      }
      miniHeat = Math.max(0, miniHeat - dt * (firing ? 0 : 0.3));
    }
    if (w.spin && held && spin === 0 && playing && !me.dead) packPlay("p_spin_minigun", 0.7);   // the barrels wind up
    spin = w.spin && held && playing && !me.dead ? Math.min(1, spin + dt / w.spin[2]) : Math.max(0, spin - dt * 1.5);
    // a sound pack's loops: the hum of the gun in your hands, and the laser's beam while the trigger is held
    const alive = playing && !me.dead;
    const altAutomatic = me.weapon === "minigun" && (altFiring || keys.has("KeyC"));
    packLoop("hum", alive ? { rail: "p_hum_rail", gamma: "p_hum_gamma" }[me.weapon] || null : null, 0.22);
    const beam = alive && (held || altAutomatic) && roundLive && me.weapon === "laser" && me.arsenal.laser > 0;
    if (!beam && me.weapon === "laser" && firingSounds.has("me")) stopContinuous("me");
    if (((!held && !altAutomatic) || !alive || !roundLive) && firingSounds.has("me")) stopContinuous("me");
    me.gauntOn = alive && me.weapon === "gauntlet" && (held || now < (me.lungeUntil || 0));
    if (me.gauntOn) {   // the Saber, held: it swings back and forth (a blow lands on whoever is in reach: shoot), and
      // burns into whatever rock or wall it touches, spitting sparks
      if (now - (me.swingAt || 0) >= WEAPONS.gauntlet.cd * 1000) saberSwing(me, now);
      const nx = me.x + Math.cos(me.a) * (binR(me.lv) + 30), ny = me.y + Math.sin(me.a) * (binR(me.lv) + 30), b = solidAny(nx, ny);
      if (b) {
        if (Math.random() < 0.8) sparkShower(nx, ny, -Math.cos(me.a) + (Math.random() - 0.5), -Math.sin(me.a) + (Math.random() - 0.5), 0.9);
        if (now - (me.grindAt || 0) > 140) { me.grindAt = now; carveAt(b, nx, ny, 12, true); bladeClash(0, true); }
      }
    }
    if (me.weapon === "gauntlet" || gauntHum) { gauntHum = me.gauntOn; if (me.weapon !== "saw") bladeHumSet(me.gauntOn ? 0.3 : 0); }   // its hum while it is out
    if (!w.charge) { charge = 0; return held && ready; }
    if (held && playing && !me.dead) {
      const was = charge;
      charge = Math.min(1, charge + dt / w.charge);
      if (w.sword) bladeHumSet(charge);   // (the blade hums as it winds up)
      else if (Math.floor(was * 6) !== Math.floor(charge * 6)) sfx("p_charge", 0.3, 0.8 + charge * 0.5);   // a rising whine
      if (charge === 1 && was < 1 && !w.sword) impacts.push({ x: me.x, y: me.y, t: 0, r: 60, col: w.col });
      return false;
    }
    if (charge > 0 && ready) shoot(now, false, Math.max(0.25, charge));
    if (charge > 0 && w.sword) bladeHumSet(0);
    charge = 0;
    return false;
  }
