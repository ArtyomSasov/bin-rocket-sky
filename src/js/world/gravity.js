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
  const pullAt = (p, d) => PLANET_G * (p.rr / 250) * (p.rr / Math.max(d, p.rr)) ** 2 * (1 - d / (p.rr * 4)) * (p.mass / p.mass0);
  function gravityOn(o, dt) {
    for (const p of planets) {
      if (p.dead || p.free) continue;
      const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy);
      if (d > p.rr * 4 || d < 1) continue;
      const acc = pullAt(p, d);
      o.vx += dx / d * acc * dt; o.vy += dy / d * acc * dt;
    }
  }
  // in orbit: close round a planet, flying along it at about the speed that keeps a body circling there. Off the
  // throttle a bin then coasts on without slowing (thrustPilot), so it can circle and shoot
  function inOrbit(o) {
    const v = Math.hypot(o.vx, o.vy);
    if (v < 150) return false;
    for (const p of planets) {
      if (p.dead || p.free) continue;
      const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy);
      if (d < p.rr + 30 || d > p.rr * 2.6) continue;
      const tang = Math.abs(dx * o.vy - dy * o.vx) / (d * v), vc = Math.sqrt(pullAt(p, d) * d);
      if (tang > 0.85 && v > vc * 0.65 && v < vc * 1.5) return true;
    }
    return false;
  }
  // a round thing of radius rad against the solid cells: push it out and bounce it; free rubble gets shoved back
  function ringHits(b, o, rad) {
    for (let s = 0; s < 10; s++) { const a = s / 10 * 6.283; if (solidAt(b, o.x + Math.cos(a) * rad, o.y + Math.sin(a) * rad)) return true; }
    return solidAt(b, o.x, o.y);
  }
  // only something big hurts when you fly into it: planets, moons and whole wrecks; small rubble just gets knocked aside
  const hurtsOnHit = b => b.mass >= 150;
  // crash damage grows with how hard you hit, small even at full boost (in lives: Lv 1 has 3)
  // walls, planets and the fence are soft: a bin bounces off them (WALL_BOUNCE of its speed into them) and is hurt only
  // by a very hard head-on hit, a little
  const WALL_BOUNCE = 0.6;
  const crashDmg = (hs, boosting) => hs < 650 ? 0 : Math.min(0.15, (boosting ? 0.06 : 0.03) * (hs - 600) / 300);
