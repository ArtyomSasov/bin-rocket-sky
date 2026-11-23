  // one simulation step. The order matters: controls, then the world moves, then shots resolve against where
  // everything is now, then the rest reacts, and last what happened goes out over the network
  function update(dt, now) {
    ampHud(now);
    metricTick(dt);
    const kd = Math.exp(-14 * dt); camKick.x *= kd; camKick.y *= kd;
    hurtFlash = Math.max(0, hurtFlash - dt * 2.2);
    const { im, boost } = steerAndShoot(dt, now);
    bodyTick(now, dt);
    flyMe(dt, now, im, boost);
    if (serverRun) { serverTrack(dt, now); sendControls(); }
    recordHitPose(me, now);
    updateShots(dt, now);
    if (playing) reconcileWeapons(now);
    updateJunk(dt, now);
    updateEvents(dt, now);
    updateBots(dt, now);
    if (stationMap()) propContacts();
    continuousAudioTick(now);
    ctfTick(now);
    hillTick(dt, now);
    standingTick(now);
    juggernautTick(dt, now);
    updateRemotes(dt, now);
    updatePickups(dt, now);
    updateFx(dt, now);
    audioTick(now);
    netSend(dt, now);
  }

  const boardEl = document.getElementById("board");
