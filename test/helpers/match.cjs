// Test helpers for matches the server runs (server/sim): a clock of the test's own, a pilot held in place, an empty
// field. Steps are 1/30 s here (the server runs 1/60; the outcomes these tests look at do not depend on it).
const STEP = 1 / 30;
const clock = { t: 1e6 };
// steps a match for some seconds, calling each(t) before every step; a snapshot every other step (it is also how
// the pilots see each other)
function run(m, seconds, each) {
  for (let i = 0; i < seconds * 30; i++) { clock.t += STEP * 1000; if (each) each(clock.t); m.step(STEP, clock.t); if (i % 2) m.packet(clock.t); }
  return clock.t;
}
// a pilot held still at (x, y), facing a, without spawn protection
const hold = (m, id, x, y, a = 0) => Object.assign(m.game.__simBot(id), { x, y, vx: 0, vy: 0, a, inv: 0 });
// no moons, junk or events (they move by the real clock, so a fixed spot is sometimes in the way)
const emptyField = m => m.game.__simTerrain.empty();
const gunIndex = (m, gun) => m.game.__simConst.WEAPON_KEYS.indexOf(gun);
// the pilot's entry in a snapshot taken now
const wire = (m, id) => m.packet(clock.t).bots.find(([pid]) => pid === id)?.[1];

module.exports = { STEP, clock, run, hold, emptyField, gunIndex, wire };
