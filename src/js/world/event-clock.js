  // ---------- world event timing (shared clock; used from the first frame, by the bodies too) ----------
  const EV_CYCLE = 75, EV_START = 30, EV_LEN = 20;   // (an event a quarter of the time: they spice a match, not run it)
  const EV_TYPES = ["blackhole", "meteors", "aliens"];   // (the gold rain is gone with the stars)
  function eventAt(ms) {
    if (stationMap()) return { cyc: 0, ph: 0, et: 0, type: "blackhole", active: false, warn: false };
    const t = ms / 1000, cyc = Math.floor(t / EV_CYCLE), ph = t - cyc * EV_CYCLE;
    return {
      cyc, ph, et: ph - EV_START,
      type: EV_TYPES[Math.floor(hash(cyc, 77, 1) * EV_TYPES.length)],
      active: ph >= EV_START && ph < EV_START + EV_LEN,
      warn: ph >= EV_START - 5 && ph < EV_START
    };
  }
  const ramp = ev => Math.max(0, Math.min(1, ev.et / 2, (EV_LEN - ev.et) / 2));
  const blackHole = ev => ({ x: 500 + hash(ev.cyc, 78, 1) * (W - 1000), y: 500 + hash(ev.cyc, 78, 2) * (H - 1000), k: ramp(ev) });
  // every black hole open now: the event's, and those the void bombs opened (each for its dur: it swells open in
  // the first eighth of a second and closes in its last sixth). v: a void bomb's
  const voids = [];
  // a hole's reach and strength: a void bomb's reaches further and pulls harder than the event's, and eats wider
  const holeReach = bh => bh.v ? 3600 : 1500, holePower = bh => bh.v ? 4.5 : 1;   // (a void bomb's: a boost gets a bin out from 450 px, not from 300)
  // the pull (px/s^2) at d from a hole's middle: ~1/d^2 near it; a void bomb's also has a long reach (~1/d) that
  // drags everyone in the arena toward it: within ~1300 px not even a boost (2300) gets a bin out, within ~2500 px
  // its own thrust (1150) cannot, and from 3000 px it still pulls as hard as that thrust
  // a void bomb's hole also burns whoever it has hold of: within r of it, dps at its edge rising to 3x at its heart
  // (dealt in bites of at least bite), and the kills it makes are its thrower's
  const VOID_BURN = { r: 400, dps: HP(22), bite: HP(4) };
  const voidBurn = (bh, d, dt) => bh.v && d < VOID_BURN.r ? VOID_BURN.dps * bh.k * (1 + 2 * (1 - d / VOID_BURN.r)) * dt : 0;
  const holeAcc = (bh, d) => holePower(bh) * bh.k * 9e7 / (d * d + 1.5e4) + (bh.v ? bh.k * 3.4e6 / (d + 300) : 0);
  function holesNow() {
    const out = [], ev = eventAt(clockNow()), t = performance.now();
    if (ev.active && ev.type === "blackhole") out.push(blackHole(ev));
    for (let i = voids.length - 1; i >= 0; i--) {
      const v = voids[i], a = (t - v.born) / v.dur;
      if (a >= 1) { voids.splice(i, 1); continue; }
      out.push({ x: v.x, y: v.y, k: Math.min(1, a * 8) * Math.min(1, (1 - a) * 6), v: true, s: v.s });
    }
    return out;
  }
  // the black hole's pull on everything that moves by the shared clock (planets, moons, wrecks, junk, pick-ups):
  // a spiral toward the hole that deepens through the event and eases back over HOLE_BACK seconds after it, the
  // same in every browser. heavy (0..1): how much it resists. Returns how far in it was dragged (0..0.97)
  const HOLE_BACK = 8, HOLE_EAT = 70;   // HOLE_EAT: radius of the horizon that eats whatever reaches it
  function holePull(o, t, heavy) {
    const ev = eventAt(t);
    if (ev.type !== "blackhole" || ev.et <= 0 || ev.et >= EV_LEN + HOLE_BACK) return 0;
    const back = (ev.et - EV_LEN) / HOLE_BACK, g = ev.et <= EV_LEN ? (ev.et / EV_LEN) ** 1.5 : 1 - back * back * (3 - 2 * back);
    const bh = blackHole(ev), dx = o.x - bh.x, dy = o.y - bh.y, d = Math.hypot(dx, dy);
    const u = Math.min(0.97, g * (1 - heavy) / (1 + (d / 900) ** 2)), a = u * 2.2, c = Math.cos(a), s = Math.sin(a), k = 1 - u;
    o.x = bh.x + (dx * c - dy * s) * k; o.y = bh.y + (dx * s + dy * c) * k;
    return u;
  }
