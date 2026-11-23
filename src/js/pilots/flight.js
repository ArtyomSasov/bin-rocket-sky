  // the flight model every pilot flies by, me and the bots alike (sx, sy: the stick, eased; k: a bot's speed factor).
  // Inertia: thrust pushes the bin and it keeps its speed, coasting down only slowly. Pushing against your motion
  // fires the retro thrusters (they bite harder), braking is an air brake; past top speed the excess (a hit, a blast) bleeds off
  function thrustPilot(o, sx_, sy_, boost, braking, dt, k = 1) {
    const im = Math.hypot(sx_, sy_), top = (boost ? 1020 : 580) * k, acc = (boost ? 2300 : 1150) * k, sp0 = Math.hypot(o.vx, o.vy);
    if (im > 0.05) {
      const ux = sx_ / im, uy = sy_ / im, along = sp0 > 1 ? (o.vx * ux + o.vy * uy) / sp0 : 1;
      const va = o.vx * ux + o.vy * uy;   // speed already going this way: thrust fades out as it nears top speed
      const kk = Math.max(0, Math.min(acc * Math.min(1, im) * (along < 0 ? 1 - 0.8 * along : 1) * dt, (top * Math.min(1, im) - va) * Math.min(1, 6 * dt)));
      o.vx += ux * kk; o.vy += uy * kk;
      const lat = -o.vx * uy + o.vy * ux, ld = lat * (1 - Math.exp(-1.2 * dt));   // sideways slip fades, slowly: a turn carries a drift, as a ship's does
      o.vx += uy * ld; o.vy -= ux * ld;
    } else if (!inOrbit(o)) { const d = Math.exp(-0.28 * dt); o.vx *= d; o.vy *= d; }   // (off the throttle it glides on; in orbit, it keeps circling)
    if (braking) { const s = Math.hypot(o.vx, o.vy), ns = Math.max(0, s - 1000 * dt); if (s > 1) { o.vx *= ns / s; o.vy *= ns / s; } }
    const s1 = Math.hypot(o.vx, o.vy);
    if (s1 > top) { const ns = top + (s1 - top) * Math.exp(-2.5 * dt); o.vx *= ns / s1; o.vy *= ns / s1; }
  }
  // the gravity slingshot: skimming past a planet fast and along its rim gives extra speed (up to boost speed),
  // with a streak of light off the hull: diving round planets is the quickest way about
  function slingshot(o, dt) {
    const v = Math.hypot(o.vx, o.vy);
    if (v < 420) return;
    for (const p of planets) {
      if (p.dead || p.star) continue;
      const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy), gap = d - p.rr;
      if (gap < 30 || gap > p.rr * 0.9 + 120) continue;
      const tang = Math.abs((dx * o.vy - dy * o.vx) / (d * v));   // 1 when flying along the rim
      if (tang < 0.65) continue;
      const k = tang * (1 - gap / (p.rr * 0.9 + 120)), nv = Math.min(1000, v + 750 * k * dt);
      if (nv > v) { o.vx *= nv / v; o.vy *= nv / v; }
      if (!replaying && Math.random() < dt * 30 * k) puff(o.x, o.y, -o.vx * 0.2 + (Math.random() - 0.5) * 40, -o.vy * 0.2 + (Math.random() - 0.5) * 40, 0.5, 2 + Math.random() * 2, "#bff3ff", 1, 0.05);
      return;
    }
  }
  // One step of a player's flight: the same function flies my bin here and a player's pilot on the server, so the
  // server's word on where I am agrees with what this screen predicted. Thrust (or a drift: with the brake and a
  // direction the engine cuts and the bin slides on), gravity, the slingshot, the move, then bumping off
  // bodies and the fence. It says what was hit and the damage that does; the caller shows it and applies it.
  // boosted: on boost or just dashed (a crash then hurts more)
  function flyPilot(o, sx_, sy_, boost, brake, dt, now, boosted) {
    const drift = brake && Math.hypot(sx_, sy_) > 0.3 && Math.hypot(o.vx, o.vy) > 150;
    if (drift) thrustPilot(o, 0, 0, false, false, dt);
    else thrustPilot(o, sx_, sy_, boost, brake, dt);
    gravityOn(o, dt); slingshot(o, dt);
    o.x += o.vx * dt; o.y += o.vy * dt;
    // walls, planets and moons: a soft bounce (WALL_BOUNCE), the slide along it kept (scraping sparks off it), and only
    // a very hard head-on hit hurts, a little
    const wr = WALL_R, pc = bounceOff(o, wr, WALL_BOUNCE, BIN_MASS, false);
    let crash = null, fence = null;
    if (pc) {
      const big = hurtsOnHit(pc.b), hs = -pc.vn, slide = Math.abs(o.vx * -pc.ny + o.vy * pc.nx);
      crash = { pc, big, hs, slide, x: o.x - pc.nx * wr, y: o.y - pc.ny * wr, dmg: big && hs > 60 ? crashDmg(hs, boosted) : 0 };
    }
    const hitX = o.x < wr ? wr : o.x > W - wr ? W - wr : null, hitY = o.y < wr ? wr : o.y > H - wr ? H - wr : null;
    if (hitX !== null || hitY !== null) {   // the fence: bounced back in, and hurt if it was fast
      const hitSpeed = Math.hypot(o.vx, o.vy);
      if (hitX !== null) { o.x = hitX; o.vx = -o.vx * WALL_BOUNCE + Math.sign(W / 2 - o.x) * 60; }
      if (hitY !== null) { o.y = hitY; o.vy = -o.vy * WALL_BOUNCE + Math.sign(H / 2 - o.y) * 60; }
      fence = { hitSpeed, x: hitX !== null ? (hitX < W / 2 ? 0 : W) : o.x, y: hitY !== null ? (hitY < H / 2 ? 0 : H) : o.y, dmg: crashDmg(hitSpeed, false) };
    }
    return { drift, crash, fence };
  }
