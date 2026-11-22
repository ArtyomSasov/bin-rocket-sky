  // ---------- sparks (shared via deterministic clock) ----------
  function spark(i, now) {
    const off = hash(i, 7, 7) * PERIOD;
    const gen = Math.floor((now / 1000 + off) / PERIOD);
    const age = (now / 1000 + off) / PERIOD - gen;
    return outside({
      key: i + ":" + gen,
      x: 90 + hash(i, gen, 1) * (W - 180), y: 90 + hash(i, gen, 2) * (H - 180),
      gold: hash(i, gen, 3) < 0.12, age
    });
  }

