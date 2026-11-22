  function recordHitPose(o, now) {
    let h = o.hitHistory || (o.hitHistory = []), prev = h[h.length - 1];
    // (a death or a jump starts it again; a dash's invulnerability does not: each pose keeps its own, so a shot judged in
    // the past meets the target as it was then, before it dashed out of it)
    if (prev && (prev.dead !== !!o.dead || Math.hypot(o.x - prev.x, o.y - prev.y) > 180)) h.length = 0;
    if (h.length && now - h[h.length - 1].at < 8) return;
    h.push({ at: now, x: o.x, y: o.y, lv: o.lv, inv: o.inv, dead: !!o.dead });
    while (h.length > 48 || (h.length > 1 && now - h[0].at > 600)) h.shift();
  }
  function hitPose(s, o) {
    if (!s.hitTime || !HITSCAN[s.kind] || s.mine || (botById.has(s.owner) && !botById.get(s.owner).input)) return o;   // a bot's aim is now; a player's, their screen's
    const h = o.hitHistory;
    if (!h || !h.length || s.hitTime < h[0].at) return o;
    for (let i = h.length - 1; i >= 0; i--) if (h[i].at <= s.hitTime) {
      const a = h[i], b = h[i + 1] || a, t = b.at === a.at ? 0 : clamp((s.hitTime - a.at) / (b.at - a.at), 0, 1);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, lv: a.lv, dead: a.dead, inv: a.inv };
    }
    return o;
  }
  // A flying round sweeps against the target's recorded motion during its step. A hitscan round (now also bullets,
  // and the laser pistol) is one instant: its whole line meets the target where it was when it was fired.
  const sweeps = s => !HITSCAN[s.kind] && straightShot(s.kind) && Number.isFinite(s.stepFrom) && s.stepTo > s.stepFrom;
  function targetHit(s, o) {
    if (sweeps(s)) return projectileContact(s, o) <= 1;
    const p = hitPose(s, o);
    if (p.dead || (HITSCAN[s.kind] && s.hitTime && p.inv > s.hitTime)) return false;
    if (p === o && shielded(o)) return false;
    return segHit(s, p.x, p.y, binR(p.lv) + shotRadius(s));
  }
  const shotRadius = s => SHOTS[s.kind].r;
  // Earliest contact between a shot and a moving circle. Work in relative coordinates
  // so a target crossing the path between frames is not treated as a stationary point.
  function circleContact(x, y, dx, dy, r) {
    const c = x * x + y * y - r * r;
    if (c <= 0) return 0;
    const a = dx * dx + dy * dy, b = x * dx + y * dy, disc = b * b - a * c;
    if (a < 1e-12 || disc < 0) return Infinity;
    const t = (-b - Math.sqrt(disc)) / a;
    return t >= 0 && t <= 1 ? t : Infinity;
  }
  function projectileContact(s, o) {
    const start = s.stepFrom, end = s.stepTo, duration = end - start, h = o.hitHistory;
    const dx = s.x - s.px, dy = s.y - s.py, radius = shotRadius(s);
    // nowhere near: no bin flies faster than ~1.6 px/ms, so its recorded path can't reach the shot's either
    const far = Math.hypot(dx, dy) + binR(o.lv) + radius + 60 + 1.6 * Math.max(0, duration);
    if ((o.x - s.px) ** 2 + (o.y - s.py) ** 2 > far * far) return Infinity;
    if (!h?.length || duration <= 0) return shielded(o) ? Infinity : circleContact(s.px - o.x, s.py - o.y, dx, dy, binR(o.lv) + radius);
    let best = Infinity;
    // Do not extrapolate across a teleport/respawn or back before available history.
    for (let i = 0; i < h.length; i++) {
      const a = h[i], b = h[i + 1] || { ...o, at: end };
      const lo = Math.max(start, a.at), hi = Math.min(end, b.at);
      if (hi <= lo || a.dead || b.dead || a.inv !== b.inv) continue;
      const from = Math.max(lo, Number.isFinite(a.inv) ? a.inv : lo);
      if (from >= hi) continue;
      const span = b.at - a.at, t0 = (from - a.at) / span, t1 = (hi - a.at) / span;
      const ax = a.x + (b.x - a.x) * t0, ay = a.y + (b.y - a.y) * t0;
      const bx = a.x + (b.x - a.x) * t1, by = a.y + (b.y - a.y) * t1;
      const f0 = (from - start) / duration, f1 = (hi - start) / duration;
      const hit = circleContact(s.px + dx * f0 - ax, s.py + dy * f0 - ay,
        dx * (f1 - f0) - (bx - ax), dy * (f1 - f0) - (by - ay), binR(a.lv) + radius);
      if (Number.isFinite(hit)) best = Math.min(best, f0 + hit * (f1 - f0));
    }
    return best;
  }
  // First circle along a ray, independent of Map insertion order. Used by both visible
  // beams and collision segments, with the same radius and (for incoming hitscan) rewind.
  function firstBinAlong(s, range) {
    const v = Math.hypot(s.vx, s.vy) || 1, ux = s.vx / v, uy = s.vy / v;
    let first = range, found = false;
    const test = (o, id) => {
      if (!canHurt(s, o, id) || shielded(o)) return;
      if (sweeps(s)) {
        const hit = projectileContact(s, o);
        if (hit * range < first) { first = hit * range; found = true; }
        return;
      }
      const p = hitPose(s, o), dx = p.x - s.px, dy = p.y - s.py, along = dx * ux + dy * uy;
      const rr = binR(p.lv) + shotRadius(s), side2 = dx * dx + dy * dy - along * along;
      if (side2 > rr * rr || along + rr < 0) return;
      const entry = Math.max(0, along - Math.sqrt(Math.max(0, rr * rr - side2)));
      if (entry < first) { first = entry; found = true; }
    };
    if (playing) test(me, "me");
    for (const b of bots) test(b, b.id);
    for (const [id, r] of remotes) if (!botById.has(id)) test(r, id);
    return found ? Math.min(range, first + 0.5) : range;
  }
  // a quick look before the full test: could this shot's path this step pass near o at all? (pad: the bin, the shot
  // and how far a bin flies in the furthest a shot is judged back, REWIND_MS, with room to spare)
  const NEAR_PAD = 700;
  const nearPath = (s, o) => o.x > Math.min(s.px, s.x) - NEAR_PAD && o.x < Math.max(s.px, s.x) + NEAR_PAD && o.y > Math.min(s.py, s.y) - NEAR_PAD && o.y < Math.max(s.py, s.y) + NEAR_PAD;
  const pierces = s => !!SHOTS[s.kind].pierce;   // rail-like shots
  // Piercing shots hit each target once.
  function railOnce(s, key) { if (!s.hits) s.hits = new Set(); if (s.hits.has(key)) return false; s.hits.add(key); return true; }
  // its beam is drawn at once along the whole path, so the shot reads as instant
  const beams = [];
  const arcs = [];   // crackling arcs between two points (zaps, blasts, fire), drawn for a moment
  const BEAM_T = 1.1;   // a rail trail lingers: the hot core goes fast, the spiral slowly unwinds
  function beamReach(s) {
    const v = Math.hypot(s.vx, s.vy) || 1, dx = s.vx / v, dy = s.vy / v;
    let reach = Math.max(0, Math.min(v * SHOTS[s.kind].life,
      dx > 0 ? (W - s.x) / dx : dx < 0 ? -s.x / dx : Infinity,
      dy > 0 ? (H - s.y) / dy : dy < 0 ? -s.y / dy : Infinity));
    // The station shell blocks even penetrating weapons; old maps keep their terrain cutting.
    // An inner wall stops it too, where it is still standing, unless the beam is heavy enough to break it (it cuts
    // its way through: carveBeam)
    const heavy = SHOTS[s.kind].carve >= WALL_CARVE || s.kind === K.RAIL;   // (a rail slug cuts clean through)
    for (const b of bodies) if (b.fixed || (b.wall && !b.dead && !b.free && !heavy)) {
      let near = 0, far = reach;
      for (const [p, d, lo, hi] of [[s.x, dx, b.x - b.hw, b.x + b.hw], [s.y, dy, b.y - b.hh, b.y + b.hh]]) {
        if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { far = -1; break; } }
        else { const a = (lo - p) / d, z = (hi - p) / d; near = Math.max(near, Math.min(a, z)); far = Math.min(far, Math.max(a, z)); }
      }
      if (far < near) continue;
      if (b.fixed) { reach = Math.min(reach, near); continue; }
      for (let t = Math.max(0, near); t <= Math.min(far, reach); t += b.cs * 0.5) if (solidAt(b, s.x + dx * t, s.y + dy * t)) { reach = Math.min(reach, t); break; }
    }
    return reach;
  }
