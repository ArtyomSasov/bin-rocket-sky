  // Loading reserves no ammo: only the released volley spends it. Cancelling
  // on death, switching, round end or a hidden tab cannot emit a delayed volley.
  let rocketLoad = 0, rocketLoadTime = 0;
  function cancelRocketLoad() { rocketLoad = 0; rocketLoadTime = 0; }
  function rocketLoadTick(dt, now, held, ready) {
    if (me.weapon !== "rocket" || !ready || document.hidden) { cancelRocketLoad(); return; }
    const available = Math.min(3, me.arsenal.rocket || 0);
    if (held) {
      if (!available) { rejectFire("NO ROCKETS", now); cancelRocketLoad(); return; }
      rocketLoadTime += Math.max(0, dt);
      const count = Math.min(available, Math.floor((rocketLoadTime + 1e-8) / 0.45));
      if (count > rocketLoad) {
        // At most one load click per frame after a stall; the HUD still catches up.
        rocketLoad = count; packPlay("p_ut_rocket_load", .7); renderAmmo("rocket");
      }
    } else {
      const count = Math.min(rocketLoad, available);
      cancelRocketLoad();
      if (count) shoot(now, true, 1, count);
    }
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) cancelRocketLoad(); });

  // The top-down Flak shell has a visible loft and falls after a short flight.
  // Walls still intercept its path; it never shoots through Foundry cover.
  const flakHeight = s => 46 * Math.sin(Math.PI * Math.max(0, Math.min(1, 1 - s.life / SHOTS[K.FLAK].life)));
