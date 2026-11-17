// The authoritative server's simulation: the game's own code, run in Node with no page (server/sim).
// Needs the server's dependencies: cd server && npm ci
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ready = fs.existsSync(path.join(__dirname, '../server/node_modules/@napi-rs/canvas'));
const skip = ready ? false : 'server dependencies are not installed (cd server && npm ci)';
const sim = () => import('../server/sim/sim.mjs');
const STEP = 1 / 30;
function run(m, seconds, each) {
  let now = 1e6;
  for (let i = 0; i < seconds * 30; i++) { now += STEP * 1000; if (each) each(now); m.step(STEP, now); }
  return now;
}

test('every map builds solid terrain on the server; the Foundry station keeps its 52 walls', { skip }, async () => {
  const { createMatch } = await sim();
  for (const map of ['f', 'c', 'a', 'y', 'r', 's', 'w', 'o']) {
    const m = createMatch({ code: 'm1d0' + map });
    try {
      const { bodies, solidCells } = m.info;
      assert.ok(bodies > 0 && solidCells > bodies * 20, `${map}: ${bodies} bodies, ${solidCells} solid cells`);
      if (map === 'f') assert.equal(bodies, 52);
    } finally { m.dispose(); }
  }
});

test('a 24-bot match runs on the server: fights end in kills and the station is not dissolved', { skip }, async () => {
  const { createMatch } = await sim();
  const m = createMatch({ code: 'm1t0f', bots: 24, level: 'hard' });
  try {
    const walls = m.info.solidCells;
    run(m, 60);
    const info = m.info;
    assert.ok(info.kills > 0 && info.deaths >= info.kills, JSON.stringify(info));
    assert.equal(info.bodies, 52);
    assert.ok(info.solidCells > walls * 0.9, 'walls stay solid');
  } finally { m.dispose(); }
});

test('a player flies by their stick and aim, and their shots kill by the same rules as anyone’s', { skip }, async () => {
  const { createMatch } = await sim();
  const m = createMatch({ code: 'm1d0o' });   // Duel: nearly empty
  try {
    const shooter = m.addPilot('Shooter'), target = m.addPilot('Target');
    const p = id => m.pilot(id);
    run(m, 0.1);   // the first step opens the round, which puts everyone on a spawn point
    // fly: a second of full stick to the right carries the pilot a few hundred units
    const x0 = p(shooter).x;
    run(m, 1, () => m.input(shooter, { mx: 1, my: 0, aim: 0 }));
    assert.ok(p(shooter).x - x0 > 250, `moved ${p(shooter).x - x0}`);
    // shoot: line the two up in open space and hold fire
    m.input(shooter, { mx: 0, my: 0, aim: 0, fire: true });
    run(m, 6, () => {
      for (const [id, x] of [[shooter, 1500], [target, 1900]]) {
        const b = m.game.__simBot(id);   // held in place: only the shots decide this
        b.x = x; b.y = 600; b.vx = b.vy = 0; if (id === shooter) b.a = 0;
      }
    });
    assert.ok(p(target).deaths >= 1, JSON.stringify(p(target)));
    assert.ok(p(shooter).kills >= 1, JSON.stringify(p(shooter)));
    m.removePilot(target);
    assert.equal(m.pilot(target), null);
  } finally { m.dispose(); }
});

test('player input is clamped to what a stick, an angle and buttons can send', { skip }, async () => {
  const { cleanInput } = await sim();
  const i = cleanInput({ mx: 9, my: 9, aim: 7, fire: 'yes', boost: true, dash: -3 });
  assert.ok(Math.abs(i.mx - Math.SQRT1_2) < 1e-12 && Math.abs(i.my - Math.SQRT1_2) < 1e-12, 'a stick never goes past its rim');
  assert.ok(Math.abs(i.aim - (7 - 2 * Math.PI)) < 1e-12, 'an angle is wrapped');
  assert.deepEqual({ fire: i.fire, boost: i.boost, dash: i.dash }, { fire: false, boost: true, dash: 0 });
  assert.deepEqual(cleanInput({ mx: NaN, aim: Infinity, dash: 2.5 }), { mx: 0, my: 0, aim: 0, fire: false, boost: false, dash: 0 });
});
