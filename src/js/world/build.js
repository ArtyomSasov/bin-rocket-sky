  function solidAt(b, px, py) {
    const dx = px - b.x, dy = py - b.y;
    if (dx * dx + dy * dy > b.r * b.r) return false;
    const c = Math.cos(b.a), s = Math.sin(b.a), i = Math.floor((dx * c + dy * s + b.hw) / b.cs), j = Math.floor((-dx * s + dy * c + b.hh) / b.cs);   // (toLocal, without its array)
    return i >= 0 && j >= 0 && i < b.gw && j < b.gh && b.cells[j * b.gw + i] === 1;
  }
  const solidAny = (x, y) => { for (const b of bodies) if (solidAt(b, x, y)) return b; return null; };
  // rough test for placement and steering: inside a body's footprint (plus a margin)
  const inBody = (x, y, pad) => { for (const b of bodies) if (!b.free && (b.fixed || b.wall ? Math.abs(x - b.x) < b.hw + pad && Math.abs(y - b.y) < b.hh + pad : (x - b.x) ** 2 + (y - b.y) ** 2 < (b.rr + pad) ** 2)) return b; return null; };
  function rebuildBodies() { bodies = det.filter(b => !b.dead && !b.free).concat(rubble.filter(b => !b.dead)); }

  // everything that scales with the arena: pick-ups and junk keep about the same density (capped for the huge map)
  function setMapSize(key) {
    const [size] = MAP_SIZES[key], a = Math.min(6, (size / 2600) ** 2);
    W = H = size; mapKey = key;
    SLOTS = 0; ROCKS = Math.round(16 * a); GOLD_N = 0;   // no stars to collect (score comes from hits and kills): less clutter
    world.sparks.length = world.rocks.length = world.picks.length = world.supplies.length = 0;
  }
  // a wreck's size: [w, h] at Medium, from its type and its own random numbers
  const wreckDims = (type, rnd) => type === "hull" ? [320 + rnd(1) * 120, 110 + rnd(2) * 40] : type === "tower" ? [170 + rnd(1) * 60, 250 + rnd(2) * 80]
    : type === "crates" ? [230 + rnd(1) * 40, 170 + rnd(2) * 40] : type === "skip" ? [250 + rnd(1) * 50, 130 + rnd(2) * 20]
    : type === "truck" ? [380 + rnd(1) * 60, 150 + rnd(2) * 20] : type === "wheelie" ? [150 + rnd(1) * 30, 210 + rnd(2) * 40]
    : type === "bales" ? [230 + rnd(1) * 40, 180 + rnd(2) * 30] : [300 + rnd(1) * 60, 120 + rnd(2) * 30];
  // the arena's fixed spots in world units: guns, supplies, Overdrive and the two big bombs (see world/arenas.js)
  let arena = { guns: [], supplies: [], amp: null, nuke: null, holy: null, void: null, pads: [] };
  // the Large and Huge arenas: more pairs in the widest gaps, found the same way every time (no randomness)
  function widestGap(taken, pad, edge) {
    let best = null, bd = -1;
    for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) {
      const x = edge + i * (1 - 2 * edge) / 40, y = edge + j * (1 - 2 * edge) / 40;
      if (Math.abs(x - 0.5) < 0.02 && Math.abs(y - 0.5) < 0.02) continue;
      let d = Infinity;
      for (const t of taken) d = Math.min(d, Math.hypot(t.x - x, t.y - y) - t.r);
      if (d > bd) { bd = d; best = { x, y }; }
    }
    return bd > pad ? best : null;
  }
  function buildPlanets(code) {
    worldCode = code;
    const theme = mapThemeOf(code), T = MAPS[theme], A = ARENAS[theme], rs = ARENA_SCALE[mapKey] || 1, big = mapKey === "l" ? 1 : mapKey === "x" ? 2 : 0;
    // the same arena looks the same in every lobby: sky, planets and wrecks are seeded by the map and its size only
    let seed = 7;
    for (const ch of theme + mapKey) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0;
    buildSky(seed ^ 0x2b7);
    planets = []; moons = []; wrecks = []; rubble = [];
    if (T.station) { buildFoundry(); return; }
    const addPlanet = (x, y, R, kind, pseed, tilt) => {
      const rnd = k => hash(pseed, k, 404), p = newBody("p" + planets.length, kind, R * 2 + 4, R * 2 + 4, clamp(R / 28, 8, 12));
      Object.assign(p, { x, y, rr: R, planet: true, tilt });
      paintPlanet(p, R, kind, rnd);
      if (kind === "gas") paintRings(p, R, rnd);
      if (T.lumpy) {   // an asteroid: big bites out of the rim leave a lumpy rock (seeded, so the same on every screen)
        let n = 0; const seq = () => hash(pseed, 900 + n++, 404);
        for (let k = 0, nb = 6 + Math.floor(rnd(30) * 4); k < nb; k++) {   // bites spread round the rim
          const a = (k + rnd(40 + k) * 0.7) / nb * 6.283, d = R * (0.9 + rnd(50 + k) * 0.3), rad = R * (0.25 + rnd(60 + k) * 0.3);
          carveLocal(p, p.hw + Math.cos(a) * d, p.hh + Math.sin(a) * d, rad, false, seq);
        }
        p.mass0 = p.mass; p.dirty = false; p.bare = true;   // bare rock: no atmosphere
      }
      p.hx = p.x; p.hy = p.y;   // home: where it sits when no black hole is pulling it
      planets.push(p);
      return p;
    };
    // what is placed, in fractions with a reach, so the big arenas' extras keep clear of it (and of both CTF pads)
    const taken = [{ x: 0.1, y: 0.5, r: 0.09 }, { x: 0.9, y: 0.5, r: 0.09 }];
    if (T.star) {   // the sun: a huge glowing ball in the middle
      const R = Math.min(420, W * 0.09);
      addPlanet(W / 2, H / 2, R, "lava", seed + 7777, 0).star = true;
      taken.push({ x: 0.5, y: 0.5, r: R / W + 0.06 });
    }
    const planetList = mirrored(A.planets), wreckList = mirrored(A.wrecks);
    const layoutSpots = [...A.guns, ...A.supplies].map(([, x, y]) => ({ x, y })).concat([A.amp, A.nuke, A.holy, A.void, ...(A.clear || [])].filter(Boolean).map(([x, y]) => ({ x, y })));
    // the big arenas: a few more bodies like the ones already there, in the widest gaps
    for (let k = 0; k < big * 2; k++) {
      for (const [, x, y, R] of planetList) taken.push({ x, y, r: (R * rs + 300) / W });
      for (const [, x, y] of wreckList) taken.push({ x, y, r: 380 / W });
      for (const sp of mirrored(layoutSpots.map(o => ["", o.x, o.y]))) taken.push({ x: sp[1], y: sp[2], r: 0.03 });
      const at = widestGap(taken, 0.08, 0.15);
      if (!at) break;
      if (k % 2 && A.wrecks.length) { const w = A.wrecks[k % A.wrecks.length]; wreckList.push(...mirrored([[w[0], at.x, at.y]])); }
      else { const p = A.planets[k % A.planets.length]; planetList.push(...mirrored([[p[0], at.x, at.y, p[3], 0]])); }
      taken.length = T.star ? 3 : 2;
    }
    planetList.forEach(([kind, fx, fy, R0, nMoons], t) => {
      const R = R0 * rs, p = addPlanet(fx * W, fy * H, R, T.lumpy ? "rock" : kind, seed + t * 131, (hash(seed, t, 4) - 0.5) * 0.8);
      for (let j = 0; j < nMoons; j++) {
        const mr = (38 + hash(seed, t + j * 17, 6) * 30) * Math.sqrt(rs), mseed = seed + t * 977 + j * 53;
        const mo = newBody("m" + moons.length, "moon", mr * 2 + 4, mr * 2 + 4, 7);
        Object.assign(mo, { p, rr: mr, moon: true, tilt: 0, orbit: R + (190 + j * 170 + hash(seed, t + j * 17, 7) * 80) * rs, period: 45 + j * 25 + hash(seed, t, 8) * 40,
                            ph: hash(seed, t + j * 17, 10) * 6.283, dir: hash(seed, t, 11) < 0.5 ? -1 : 1 });
        paintPlanet(mo, mr, "moon", k => hash(mseed, k, 404));
        moons.push(mo);
      }
    });
    // wrecks drift a little on the spot and turn slowly (the ones laid at an angle stay lined up)
    const ws = clamp(rs, 0.8, 1.25);
    wreckList.forEach(([type, fx, fy, ang], t) => {
      const wseed = seed + t * 389, rnd = k => hash(wseed, k, 505), [w0, h0] = wreckDims(type, rnd), w = w0 * ws, h = h0 * ws;
      const b = newBody("w" + wrecks.length, type, w, h, 8), lined = typeof ang === "number";
      Object.assign(b, { rr: Math.hypot(w, h) / 2, bx: fx * W, by: fy * H, A: (lined ? 15 : 25 + hash(seed, t, 25) * 30) * rs, T: 30 + hash(seed, t, 26) * 30, ph: hash(seed, t, 27) * 6.283,
                         dirA: hash(seed, t, 28) * 6.283, a0: lined ? ang + (t % 2) * Math.PI : hash(seed, t, 29) * 6.283,
                         spin: lined ? 0 : (hash(seed, t, 30) - 0.5) * 0.05, wreck: true });
      paintWreck(b, type, w, h, rnd);
      wrecks.push(b);
    });
    // the spots: the layout's own, then (Large / Huge) more pairs in the widest gaps, cycling through the map's guns
    const guns = mirrored(A.guns), supplies = mirrored(A.supplies), clearList = mirrored((A.clear || []).map(([x, y]) => ["", x, y]));
    const reach = list => list.map(([, x, y]) => ({ x, y, r: 0 }));
    const bodyReach = () => [...planets.map(p => ({ x: p.hx / W, y: p.hy / H, r: (p.rr + 120) / W })), ...wrecks.map(w => ({ x: w.bx / W, y: w.by / H, r: (w.rr + w.A + 120) / W })),
      ...moons.map(m => ({ x: m.p.hx / W, y: m.p.hy / H, r: 0 }))];
    const spotsNow = () => [...taken, ...bodyReach(), ...reach(guns), ...reach(supplies), ...clearList.map(([, x, y]) => ({ x, y, r: 0.02 })),
      ...[A.amp, A.nuke, A.holy, A.void].filter(Boolean).map(([x, y]) => ({ x, y, r: 0 }))];
    for (let k = 0; k < big * 3; k++) {
      const at = widestGap(spotsNow(), 0.06, 0.05);
      if (!at) break;
      if (k % 3 === 2) supplies.push(...mirrored([[A.supplies[k % A.supplies.length][0], at.x, at.y]]));
      else guns.push(...mirrored([[A.guns[k % A.guns.length][0], at.x, at.y]]));
    }
    const spot = ([type, fx, fy], i, P) => ({ type, x: fx * W, y: fy * H, P, off: hash(seed, i, 61) * P });
    arena = {
      guns: guns.map((e, i) => spot(e, i, GUN_PERIOD[e[0]] || GUN_PERIOD_BASE)),
      supplies: supplies.map((e, i) => spot(e, i + 100, SUPPLIES[e[0]].period)),
      amp: A.amp ? spot(["amp", ...A.amp], 200, AMP_PERIOD) : null,
      nuke: A.nuke && (big || modeOf(code) === "n" || modeOf(code) === "x") ? spot(["nuke", ...A.nuke], 201, BOMB_CRATES.nuke.period) : null,
      holy: A.holy && (big || modeOf(code) === "x") ? spot(["holy", ...A.holy], 202, BOMB_CRATES.holy.period) : null,
      // the void bomb's crate: its own spot, where nukes lie out (mirroring the nuke's put it on the Quad's or the holy bomb's)
      void: A.void && (big || modeOf(code) === "n" || modeOf(code) === "x") ? spot(["void", ...A.void], 203, BOMB_CRATES.void.period) : null
    };
    PICKS = arena.guns.length; SUPPLY_SLOTS = arena.supplies.length;
    det = [...planets, ...moons, ...wrecks];
    rebuildBodies();
    posesAt(clockNow(), 0);
    if (inBody(me.x, me.y, 80)) Object.assign(me, spawnPoint());
  }
  const TAU_MOD = a => a - Math.floor(a / (2 * Math.PI)) * 2 * Math.PI;
  // where a shared body is at time t (ms on the shared clock): planets sit still, moons orbit, wrecks bob and turn, and a
  // black hole drags it in (planets resist more). Angles are wrapped to 0..2π: the shared clock is huge (s ~ 1.7e9),
  // and canvas rotate() keeps angles in single precision, so an unwrapped 3e7 rad drew a wreck up to a radian off
  // from where hits were tested
  function poseBody(b, t) {
    const s = t / 1000;
    if (b.moon) { const a = TAU_MOD(b.ph + b.dir * 6.283 * s / b.period); b.x = b.p.hx + Math.cos(a) * b.orbit; b.y = b.p.hy + Math.sin(a) * b.orbit; b.a = a; }
    else if (b.wreck) { const o = Math.sin(s / b.T * 6.283 + b.ph) * b.A; b.x = b.bx + Math.cos(b.dirA) * o; b.y = b.by + Math.sin(b.dirA) * o; b.a = TAU_MOD(b.a0 + b.spin * s); }
    else { b.x = b.hx; b.y = b.hy; }
    holePull(b, t, b.moon || b.wreck ? 0.2 : 0.55);
  }
  // every shared body where it is at t (dt: since the last time, for its velocity)
  function posesAt(t, dt) {
    for (const b of det) {
      if (b.free || b.dead || b.fixed) continue;
      const ox = b.x, oy = b.y;
      poseBody(b, t);
      if (dt > 0) { b.vx = (b.x - ox) / dt; b.vy = (b.y - oy) / dt; }
    }
  }

