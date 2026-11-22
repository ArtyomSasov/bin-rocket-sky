  // fire the gun in hand (alt: its alternate fire, which needs its full ammo cost)
  // mul: what the shots are multiplied by (Quad damage, a charge)
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
    if (alt && pat.nova) mul *= 0.55 + 0.45 * altCharge;
    if (alt && pat.mul) mul *= pat.mul;   // (a mode whose shots are weaker: the pistol's rapid fire)   // (the nova: as big and as strong as it was charged)
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
    const cdMul = MODES[MODE].cdMul || 1;
    if (alt && w.quickAlt) { me.altCd = pat.cd; fireCd = Math.max(fireCd, 0.15); } else
    fireCd = alt ? pat.cd : w.spin ? (w.spin[0] + (w.spin[1] - w.spin[0]) * spin) * cdMul : w.charge ? 0.3 : w.cd * cdMul;
    const gun = muzzleAt(k);   // (the server fires a player's pilot from the same gun tips)
    const muzzle = volley(me, now, pat, gun, undefined, mul);
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
  // ---- the minigun spins up while the trigger is held; the Blood Blade winds up while held and strikes on release
  let spin = 0, charge = 0, altCharge = 0;   // altCharge: a charged alt (the Plasma Nova), held
  let miniHeat = 0;   // how hot the minigun's barrels are: they smoke for a while after it stops
  const MINI_SMOKE = ["rgb(150,152,165)", "rgb(170,170,182)", "rgb(130,132,148)"];
  function triggerTick(dt, now, ready, held) {
    const w = WEAPONS[me.weapon];
    if (miniHeat > 0) {   // hot barrels smoke once the firing stops, thinning as they cool
      const firing = held && me.weapon === "minigun" && playing && !me.dead;
      if (!firing && me.weapon === "minigun" && !me.dead && Math.random() < miniHeat * dt * (lowQ ? 20 : 55)) {
        const R = 46, nx = me.x + Math.cos(me.a) * R, ny = me.y + Math.sin(me.a) * R;
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
