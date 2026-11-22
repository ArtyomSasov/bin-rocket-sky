  // ---------- body physics: pick-up placement, gravity, bouncing off bodies, shot hits ----------
  // pick-ups that would land inside a planet sit on its rim instead (same result on every client)
  function outside(o) {
    for (const p of planets) {
      const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy);
      if (d < p.rr + 50) { const k = (p.rr + 50) / (d || 1); o.x = p.x + (d ? dx : 1) * k; o.y = p.y + dy * k; }
    }
    return o;
  }
  // planets pull, less as they are chipped away
  function gravityOn(o, dt) {
    for (const p of planets) {
      if (p.dead || p.free) continue;
      const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy), R = p.rr;
      if (d > R * 4 || d < 1) continue;
      const acc = PLANET_G * (R / 250) * (R / Math.max(d, R)) ** 2 * (1 - d / (R * 4)) * (p.mass / p.mass0);
      o.vx += dx / d * acc * dt; o.vy += dy / d * acc * dt;
    }
  }
  // a round thing of radius rad against the solid cells: push it out and bounce it; free rubble gets shoved back
  function ringHits(b, o, rad) {
    for (let s = 0; s < 10; s++) { const a = s / 10 * 6.283; if (solidAt(b, o.x + Math.cos(a) * rad, o.y + Math.sin(a) * rad)) return true; }
    return solidAt(b, o.x, o.y);
  }
  // only something big hurts when you fly into it: planets, moons and whole wrecks; small rubble just gets knocked aside
  const hurtsOnHit = b => b.mass >= 150;
  // crash damage grows with how hard you hit, small even at full boost (in lives: Lv 1 has 3)
  const crashDmg = (hs, boosting) => hs < 380 ? 0 : Math.min(0.25, (boosting ? 0.1 : 0.05) * (hs - 300) / 300);   // (a hard head-on hit only, and a little)
