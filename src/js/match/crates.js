  // ---------- weapon crates, supplies, Overdrive and the big bombs: fixed spots on the arena ----------
  // Each spot always holds the same thing (see world/arenas.js) and keeps it until someone takes it: nothing expires.
  // A taken one comes back at the start of its spot's next cycle on the shared clock, so every screen agrees
  // without any messages; the empty pad shows how long that is. age is how far into the cycle it came back
  // (1 when it has been lying there all along); wait is the seconds until the spot's next cycle.
  function spotItem(s, key, now) {
    const t = now / 1000 + s.off, gen = Math.floor(t / s.P), ph = t / s.P - gen;
    return outside({ key: key + ":" + gen, type: s.type, x: s.x, y: s.y, P: s.P, wait: (1 - ph) * s.P, age: grabbed.has(key + ":" + (gen - 1)) ? ph : 1 });
  }
  const pickup = (i, now) => spotItem(arena.guns[i], "w" + i, now);
  const supply = (i, now) => spotItem(arena.supplies[i], "h" + i, now);
  const ampPickup = now => arena.amp ? spotItem(arena.amp, "A", now) : null;
  const bombPickup = (now, type) => arena[type] ? spotItem(arena[type], BOMB_CRATES[type].key, now) : null;
