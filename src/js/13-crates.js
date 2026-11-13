  // ---------- weapon crates & rockets ----------
  function pickup(i, now) {
    const off = hash(i, 61, 1) * PICK_PERIOD;
    const gen = Math.floor((now / 1000 + off) / PICK_PERIOD);
    return outside({
      key: "w" + i + ":" + gen,
      x: 150 + hash(i, gen, 63) * (W - 300), y: 150 + hash(i, gen, 64) * (H - 300),
      type: PICK_TYPES[Math.floor(hash(i, gen, 62) * PICK_TYPES.length)],
      age: (now / 1000 + off) / PICK_PERIOD - gen
    });
  }
  function supply(i, now) {
    const off = hash(i, 51, 1) * SUPPLY_PERIOD, tt = now / 1000 + off;
    const gen = Math.floor(tt / SUPPLY_PERIOD), r = hash(i, gen, 52);
    return outside({
      key: "h" + i + ":" + gen, age: tt / SUPPLY_PERIOD - gen,
      type: r < 0.45 ? "med" : r < 0.55 ? "bigmed" : r < 0.9 ? "shield" : "mega",
      x: 150 + hash(i, gen, 53) * (W - 300), y: 150 + hash(i, gen, 54) * (H - 300)
    });
  }
  function ampPickup(now) {
    const t = now / 1000, gen = Math.floor(t / AMP_PERIOD), age = t / AMP_PERIOD - gen;
    if (hash(gen, 81, 1) > 0.7 || age > 0.5) return null;
    return outside({ key: "A" + gen, type: "amp", age, x: 400 + hash(gen, 82, 1) * (W - 800), y: 400 + hash(gen, 82, 2) * (H - 800) });
  }
  function nukePickup(now) {
    const t = now / 1000, gen = Math.floor(t / NUKE_PERIOD), age = t / NUKE_PERIOD - gen;
    if (hash(gen, 71, 1) > 0.65 || age > 0.6) return null;   // turns up in about 2 of 3 cycles, for ~40 s
    return outside({ key: "N" + gen, type: hash(gen, 73, 1) < HOLY_CHANCE ? "holy" : "nuke", age, x: 300 + hash(gen, 72, 1) * (W - 600), y: 300 + hash(gen, 72, 2) * (H - 600) });
  }
