  // Loading reserves no ammo: only the released volley spends it. Cancelling
  // on death, switching, round end or a hidden tab cannot emit a delayed volley.
  let rocketLoad = 0, rocketLoadTime = 0;
  function cancelRocketLoad() { rocketLoad = 0; rocketLoadTime = 0; }
  let rocketWasHeld = false;
  function rocketLoadTick(dt, now, held, ready) {
    if (me.weapon !== "rocket" || !ready || document.hidden) { cancelRocketLoad(); rocketWasHeld = held; return; }
    const available = Math.min(ROCKET_MAX, me.arsenal.rocket || 0);
    if (held) {
      if (!available) { if (!rocketWasHeld) rejectFire("NO ROCKETS", now); cancelRocketLoad(); rocketWasHeld = true; return; }
      if (rocketWasHeld || rocketLoad) rocketLoadTime += Math.max(0, dt);   // (the press itself loads the first one)
      rocketWasHeld = true;
      const count = rocketsLoaded(rocketLoadTime, available);
      if (count > rocketLoad) {
        // At most one load click per frame after a stall; the HUD still catches up.
        rocketLoad = count; packPlay("p_ut_rocket_load", .7); renderAmmo("rocket");
      }
      if (rocketLoad >= available) { const n = rocketLoad; cancelRocketLoad(); shoot(now, true, 1, n); }   // full: the salvo goes by itself
    } else {
      rocketWasHeld = false;
      const count = Math.min(rocketLoad, available);
      cancelRocketLoad();
      if (count) shoot(now, true, 1, count);
    }
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) cancelRocketLoad(); });

  // The top-down Flak shell has a visible loft and falls after a short flight.
  // Walls still intercept its path; it never shoots through Foundry cover.
  const flakHeight = s => 46 * Math.sin(Math.PI * Math.max(0, Math.min(1, 1 - s.life / SHOTS[K.FLAK].life)));
