  // ---------- update ----------
  let sendAcc = 0, boardAcc = 0, sendSeq = 0, slowAcc = 1, lastSlow = "", lastNetTick = performance.now();
  const ampChip = document.getElementById("ampChip");
  let ampShown = -1;
  function ampHud(now) {
    const left = me.ampUntil > now ? Math.ceil((me.ampUntil - now) / 1000) : 0;
    if (left === ampShown) return;
    ampShown = left; ampChip.hidden = !left; ampChip.textContent = "QUAD DAMAGE x4 · " + left + "s";
  }
  // the trigger, for dt seconds: cooldown, charge, rocket loading, and the shots it lets go
  function fireTick(dt, now, held, altHeld) {
    fireCd -= dt; me.altCd = (me.altCd || 0) - dt;
    const ready = playing && roundLive && !me.dead && fireCd <= 0 && !guided && (!serverRun || srv.joined);   // on the server my shots are only shown (12c-server.js)
    const altW = WEAPONS[me.weapon].alt;
    rocketLoadTick(dt, now, altHeld, ready);
    if (altW && altW.charge) {   // a charged alt (the Plasma Nova): hold to charge, let go to fire
      if (altHeld && ready && me.arsenal[me.weapon] >= altW.cost) {
        const was = altCharge; altCharge = Math.min(1, altCharge + dt / altW.charge);
        if (Math.floor(was * 6) !== Math.floor(altCharge * 6)) sfx("p_charge", 0.3, 0.8 + altCharge * 0.5);
        if (was < 1 && altCharge === 1) { if (altW.nova) { shoot(now, true); altCharge = 0; } else audioCue("chargeFull"); }   // (a full nova goes by itself: held, they keep coming)
      } else {
        if (altHeld && ready && (me.arsenal[me.weapon] || 0) < altW.cost) rejectFire("NEED " + altW.cost + " AMMO", now);
        if (altCharge > 0) { if (!altHeld && ready && me.arsenal[me.weapon] >= altW.cost) shoot(now, true); else audioCue("chargeCancel"); altCharge = 0; }
      }
    } else altCharge = 0;
    me.heat = Math.max(0, (me.heat || 0) - 0.45 * dt); if (me.overheat && me.heat < 0.3) { me.overheat = false; renderAmmo(me.weapon); audioCue("ready"); }
    const altReady = WEAPONS[me.weapon].quickAlt ? playing && roundLive && !me.dead && !guided && (!serverRun || srv.joined) && me.altCd <= 0 : ready;
    if (altReady && altHeld && altW && !altW.charge && !altW.load) { triggerTick(dt, now, false, held); shoot(now, true); }
    else if (triggerTick(dt, now, ready && fireCd <= 0 && !(altHeld && (altW?.charge || altW?.load)) && altCharge === 0, held)) shoot(now);
    if (me.weapon === "saw" && playing && roundLive && !me.dead && !serverRun) bladeTouch(me, now, charge, remotes);   // (on the server, the server judges it)
    if (me.weapon === "saw" && playing && roundLive && !me.dead) bladeGrind(me, now, charge);   // (what it cuts is shared, as every crater of mine is)
  }
  // controls: respawn when due, fire, read the stick / keys / mouse, boost energy
  function steerAndShoot(dt, now) {
    // input → acceleration
    let ix = 0, iy = 0;
    padPoll(now);
    const shiftHeld = keys.has("ShiftLeft") || keys.has("ShiftRight");
    let boost = (shiftHeld || boostBtnDown) && boostDownAt >= 0 && now - boostDownAt > BOOST_HOLD * 1000 && !keys.has("KeyX");
    if (me.dead && now >= me.respawnAt && !serverRun) respawn(now);   // the server respawns my pilot where it chooses
    shake = Math.max(0, shake - dt);
    const aimM = mouseAim();
    const held = firing || pad.fire || FIRE_KEYS.some(k => keys.has(k)) || (aimM && ptr.down);   // with mouse aim the left button fires
    const altHeld = altFiring || pad.alt || keys.has("KeyC");
    // on the game server the trigger is pulled once per flight command (flyCmds), as the server pulls it: the same
    // moments, the same shots in the same order (their spread is numbered by them), the same aim; offline every frame
    srv.trig = { held, altHeld };
    if (!(serverRun && srv.joined && playing && !me.dead)) fireTick(dt, now, held, altHeld);
    if (playing && !me.dead) {
      if (keys.has("KeyA") || keys.has("ArrowLeft")) ix -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) ix += 1;
      if (keys.has("KeyW") || keys.has("ArrowUp")) iy -= 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) iy += 1;
      const jm = Math.hypot(joy.x, joy.y);
      if (jm > 0.12) { const m = Math.min(1, (jm - 0.12) / 0.8); ix += joy.x / jm * m; iy += joy.y / jm * m; }
      if (pad.on) { ix += pad.x; iy += pad.y; }   // a gamepad's left stick
      if ((ptr.down && !aimM) || (aimM && guided)) {   // the pointer steers (with mouse aim: only a guided nuke)
        const [cx, cy] = cursorAt(), from = guided || me, dx = cx - sx(from.x), dy = cy - sy(from.y), d = Math.hypot(dx, dy);   // steer from where the bin (or the guided nuke) is on screen
        if (d > 8) { const m = Math.min(1, d / 140); ix += dx / d * m; iy += dy / d * m; }
        if (d > Math.min(vw, vh) * 0.4 && !aimM) boost = true;
      }
    }
    const raw = Math.hypot(ix, iy);
    if (raw > 1) { ix /= raw; iy /= raw; }
    if (guideTick(dt, now, ix, iy, held)) { ix = iy = 0; boost = false; }   // the stick flies the nuke; the bin coasts
    // input eases in/out over ~0.1 s, then velocity eases toward the wanted velocity: turns become arcs
    const ease = 1 - Math.exp(-13 * dt);
    steer.x += (ix - steer.x) * ease; steer.y += (iy - steer.y) * ease;
    const im = Math.hypot(steer.x, steer.y);
    const boostReq = !!boost && playing && !me.dead;   // what the player asks (a command flight checks the energy itself)
    boost = boost && playing && !me.dead && energy > 0 && im > 0.1;
    me.boostFx = now - me.dashAt < 350 ? 2 : boost ? 1 : 0;
    if (boost) { energy = Math.max(0, energy - 20 * dt); energyRegenAt = now + 700; }   // a full bar is ~5 s of boost
    else if (now > energyRegenAt) energy = Math.min(100, energy + 22 * dt);   // perk: faster energy from Lv 2
    me.ctl = { mx: ix, my: iy, fire: held, alt: altHeld, boost, boostReq };   // the raw controls, for the authoritative server
    return { im, boost };
  }
