  // Authored UT loops: one per shooter, including separate minigun modes.
  // Shot refreshes bound network stalls; release, death and switching stop them.
  const firingSounds = new Map();
  function continuousFire(owner, weapon, x, y, now = performance.now(), alt = false) {
    if (!audio || document.hidden) return false;
    const event = weapon === "minigun" ? (alt ? "p_ut_mini_alt" : "p_ut_mini_fire") : (alt ? "p_loop_laser" : "p_ut_pulse_fire");
    if (!packHas(event)) return false;
    const distance = Math.hypot(x - me.x, y - me.y);
    if (distance > 1800) return true;
    const old = firingSounds.get(owner);
    if (old && old.weapon !== weapon) stopContinuous(owner);
    if (!firingSounds.has(owner)) {
      if (firingSounds.size >= 8) {
        const farthest = [...firingSounds].filter(([id]) => id !== "me").sort((a, b) => b[1].distance - a[1].distance)[0];
        if (!farthest || (owner !== "me" && farthest[1].distance < distance)) return true;
        stopContinuous(farthest[0]);
      }
      firingSounds.set(owner, { weapon });
    }
    packLoop("fire:" + owner, event, 0);
    const loop = packLoops["fire:" + owner];
    if (!loop) { firingSounds.delete(owner); return false; }
    Object.assign(firingSounds.get(owner), { last: now, x, y, distance, alt });
    loop.g.gain.setTargetAtTime((owner === "me" ? .4 : .18) * Math.max(0, 1 - distance / 1800), audio.currentTime, .015);
    if (loop.pan) loop.pan.pan.value = Math.max(-.85, Math.min(.85, (x - me.x) / 1000));
    return true;
  }
  function stopContinuous(owner) {
    const state = firingSounds.get(owner);
    if (!state) return;
    packLoop("fire:" + owner, null); firingSounds.delete(owner);
    if (!document.hidden) packPlay(state.weapon === "minigun" ? "p_ut_mini_stop" : "p_stop_laser", owner === "me" ? .4 : .2, state.x, state.y);
  }
  function continuousAudioTick(now) {
    for (const [id, state] of firingSounds) {
      const pilot = id === "me" ? me : botById.get(id) || remotes.get(id);
      if (!playing || !roundLive || document.hidden || !pilot || pilot.dead || (id === "me" && pilot.weapon !== state.weapon) || now - state.last > (id === "me" ? 190 : 350)) { stopContinuous(id); continue; }
      const loop = packLoops["fire:" + id];
      if (!loop) { firingSounds.delete(id); continue; }
      state.x = pilot.x; state.y = pilot.y; state.distance = Math.hypot(pilot.x - me.x, pilot.y - me.y);
      loop.g.gain.setTargetAtTime((id === "me" ? .4 : .18) * Math.max(0, 1 - state.distance / 1800), audio.currentTime, .035);
      if (loop.pan) loop.pan.pan.value = Math.max(-.85, Math.min(.85, (pilot.x - me.x) / 1000));
    }
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) for (const id of firingSounds.keys()) stopContinuous(id); });
