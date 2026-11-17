  // One bounded voice per shooter, refreshed by actual shots. Network stalls,
  // death, switching weapons and hidden tabs cannot leave a loop running forever.
  const firingSounds = new Map();
  function continuousFire(owner, weapon, x, y, now = performance.now()) {
    if (!audio || document.hidden) return false;
    const event = weapon === "minigun" ? "p_loop_minigun" : "p_loop_laser";
    if (!packHas(event)) return false;
    if (Math.hypot(x - me.x, y - me.y) > 1800) return true;
    const old = firingSounds.get(owner);
    if (old && old.weapon !== weapon) stopContinuous(owner);
    if (!firingSounds.has(owner)) {
      if (firingSounds.size >= 8) {
        const farthest = [...firingSounds].filter(([id]) => id !== "me").sort((a, b) => b[1].distance - a[1].distance)[0];
        if (!farthest || (owner !== "me" && farthest[1].distance < Math.hypot(x - me.x, y - me.y))) return true;
        stopContinuous(farthest[0]);
      }
      packPlay(weapon === "minigun" ? "p_start_minigun" : "p_fire_laser", owner === "me" ? 0.7 : 0.4, x, y);
      packLoop("fire:" + owner, event, 0);
      if (!packLoops["fire:" + owner]) return false;
      firingSounds.set(owner, { weapon, last: now, x, y, distance: Math.hypot(x - me.x, y - me.y) });
    }
    Object.assign(firingSounds.get(owner), { last: now, x, y });
    return true;
  }
  function stopContinuous(owner) {
    const state = firingSounds.get(owner);
    if (!state) return;
    packLoop("fire:" + owner, null); firingSounds.delete(owner);
    if (!document.hidden) packPlay(state.weapon === "minigun" ? "p_stop_minigun" : "p_stop_laser", owner === "me" ? 0.4 : 0.2, state.x, state.y);
  }
  function continuousAudioTick(now) {
    for (const [id, state] of firingSounds) {
      const pilot = id === "me" ? me : botById.get(id) || remotes.get(id);
      if (!playing || !roundLive || document.hidden || !pilot || pilot.dead || (id === "me" && pilot.weapon !== state.weapon) || now - state.last > (id === "me" ? 190 : 350)) { stopContinuous(id); continue; }
      const loop = packLoops["fire:" + id];
      if (!loop) { firingSounds.delete(id); continue; }
      state.x = pilot.x; state.y = pilot.y; state.distance = Math.hypot(pilot.x - me.x, pilot.y - me.y);
      loop.g.gain.setTargetAtTime((id === "me" ? 0.55 : 0.23) * Math.max(0, 1 - state.distance / 1800), audio.currentTime, 0.035);
      if (loop.pan) loop.pan.pan.value = Math.max(-0.85, Math.min(0.85, (pilot.x - me.x) / 1000));
    }
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) for (const id of firingSounds.keys()) stopContinuous(id); });
