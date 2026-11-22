  // ---------- space junk (shared clock, with persistent collision trajectories) ----------
  const rockMotion = new Map();   // slot -> latest impact; at most ROCKS entries
  let rockMotionCursor = 0;
  const rockGeneration = (i, now) => Math.floor((now / 1000 + hash(i, 9, 9) * ROCK_PERIOD) / ROCK_PERIOD);
  // The derivative of bounceIn: keep velocity pointing inward after crossing an arena edge.
  function rockAxis(x, v, dt, hi) {
    const raw = x + v * dt, phase = mod(raw - 40, 2 * (hi - 40));
    return [bounceIn(raw, 40, hi), phase < hi - 40 ? v : -v];
  }
  // What a rock's hashes give it is kept per rock: its offset in the period for ever, and its course (where it set
  // off, how fast, how big, how it spins, its key) for the round of the period it is on, so neither the world's tick
  // nor a player's command (rockAt) works them out again each time
  const rockMemo = [];
  function rockCourse(i, now) {
    let mm = rockMemo[i];
    if (!mm || mm.W !== W || mm.H !== H) mm = rockMemo[i] = { off: hash(i, 9, 9) * ROCK_PERIOD, gen: NaN, W, H };
    const tt = now / 1000 + mm.off, gen = Math.floor(tt / ROCK_PERIOD);
    if (mm.gen !== gen) {
      const ang = hash(i, gen, 21) * 6.283, sp = 50 + hash(i, gen, 22) * 90;
      Object.assign(mm, { gen, x0: hash(i, gen, 23) * W, y0: hash(i, gen, 24) * H, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        r: 22 + hash(i, gen, 25) * 18, h26: hash(i, gen, 26), key: "m" + i + ":" + gen });
    }
    mm.age = tt - gen * ROCK_PERIOD;
    return mm;
  }
  // only where rock i is at that moment (no object, no key): a quick look before the whole rock is made
  const rockXY = [0, 0];
  function rockAt(i, now) {
    const mm = rockCourse(i, now), motion = rockMotion.get(i);
    if (motion && motion.gen === mm.gen) { const dt = Math.max(0, (now - motion.at) / 1000); rockXY[0] = bounceIn(motion.x + motion.vx * dt, 40, W - 40); rockXY[1] = bounceIn(motion.y + motion.vy * dt, 40, H - 40); return rockXY; }
    rockXY[0] = bounceIn(mm.x0 + mm.vx * mm.age, 40, W - 40); rockXY[1] = bounceIn(mm.y0 + mm.vy * mm.age, 40, H - 40);
    return rockXY;
  }
  function rock(i, now) {
    const mm = rockCourse(i, now), gen = mm.gen, age = mm.age;
    const motion = rockMotion.get(i);
    if (motion && motion.gen !== gen) rockMotion.delete(i);
    const moved = motion && motion.gen === gen;
    const dt = moved ? Math.max(0, (now - motion.at) / 1000) : age;
    const [x, vx] = rockAxis(moved ? motion.x : mm.x0, moved ? motion.vx : mm.vx, dt, W - 40);
    const [y, vy] = rockAxis(moved ? motion.y : mm.y0, moved ? motion.vy : mm.vy, dt, H - 40);
    return { key: mm.key, slot: i, gen, x, y, vx, vy, r: mm.r, seed: i * 977 + gen, spin: age * (mm.h26 - 0.5) * 2, age };
  }
  // Exchange normal momentum with restitution 0.6. Tangential velocity is unchanged.
  function collideRock(pilot, k) {
    const dx = pilot.x - k.x, dy = pilot.y - k.y, d = Math.hypot(dx, dy), R = k.r + 26;
    if (d >= R || d <= 0.01) return 0;
    const nx = dx / d, ny = dy / d;
    pilot.x += nx * (R - d); pilot.y += ny * (R - d);
    const vn = (pilot.vx - k.vx) * nx + (pilot.vy - k.vy) * ny;
    if (vn >= 0) return 0;
    const rockMass = (k.r / 30) ** 2, impulse = -1.6 * vn / (1 / BIN_MASS + 1 / rockMass);
    pilot.vx += impulse * nx / BIN_MASS; pilot.vy += impulse * ny / BIN_MASS;
    if (replaying) return -vn;   // (a replay of my commands bounces my bin only: the rock was bumped the first time)
    k.vx -= impulse * nx / rockMass; k.vy -= impulse * ny / rockMass;
    rockMotion.set(k.slot, { slot: k.slot, gen: k.gen, at: clockNow(), x: k.x, y: k.y, vx: k.vx, vy: k.vy, by: myTag });
    rockMotionCursor = [...rockMotion.keys()].indexOf(k.slot);   // send this impact on the next state
    return -vn;
  }
  function pruneRockMotion(now) {
    for (const [i, m] of rockMotion) if (i >= ROCKS || m.gen !== rockGeneration(i, now)) rockMotion.delete(i);
  }
  function nextRockMotion() {
    pruneRockMotion(clockNow());
    const list = [...rockMotion.values()], out = [];
    for (let n = 0; n < Math.min(4, list.length); n++) {
      const m = list[rockMotionCursor++ % list.length];
      out.push([m.slot, m.gen, m.at, m.x, m.y, m.vx, m.vy, m.by]);
    }
    return out;
  }
  function applyRockMotion(list) {
    const now = clockNow();
    for (const e of list.slice(0, 4)) {
      if (!Array.isArray(e) || e.length !== 8 || !e.slice(0, 7).every(Number.isFinite)) continue;
      const [slot, gen, at, x, y, vx, vy, by] = e;
      if (!Number.isInteger(slot) || slot < 0 || slot >= ROCKS || gen !== rockGeneration(slot, now) ||
          at > now + 1000 || at < now - ROCK_PERIOD * 1000 || x < 40 || x > W - 40 || y < 40 || y > H - 40 ||
          Math.abs(vx) > 4500 || Math.abs(vy) > 4500 || typeof by !== "string" || !/^[a-z0-9]{1,8}$/.test(by)) continue;
      const old = rockMotion.get(slot);
      if (old && old.gen === gen && (old.at > at || (old.at === at && old.by >= by))) continue;
      rockMotion.set(slot, { slot, gen, at, x, y, vx, vy, by });
    }
  }

