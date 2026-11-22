// Combat rules: where a shot is judged (a player's screen shows the others in the past), who can be hurt, and how
// health and armour take it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { skip, createMatch, loadGame } = require('./helpers/game.cjs');
const { STEP, run, hold, emptyField } = require('./helpers/match.cjs');

// The target crosses the shooter's line of fire at 1000 px/s and the shooter fires `back` px behind it, where a
// screen `rtt` ms (and `ld` ms of interpolation) behind showed it. Does the shot land?
async function crossingShot({ rtt, ld, back }) {
  const m = await createMatch({ code: 'm1d0o' });
  try {
    const shooter = m.addPilot('Shooter'), target = m.addPilot('Target');
    run(m, 0.1); emptyField(m);
    if (rtt) m.rtt(shooter, rtt);
    let t = 0, aim = 0;
    const y = () => 400 + t * 1000, keep = () => { t += STEP; hold(m, shooter, 1500, 700, aim); hold(m, target, 1900, y()); m.game.__simBot(target).vy = 1000; };
    run(m, 0.5, keep);
    aim = Math.atan2(y() - back - 700, 400);
    const before = m.game.__simBot(target).lives, extra = ld === undefined ? {} : { ld };
    m.input(shooter, { aim, fire: true, ...extra }); run(m, STEP * 1.01, keep);
    m.input(shooter, { aim, fire: false, ...extra }); run(m, 0.2, keep);
    return m.game.__simBot(target).lives < before;
  } finally { m.dispose(); }
}

test('a player\'s shot is judged where the target was on their screen: half a round trip back', { skip }, async () => {
  assert.equal(await crossingShot({ rtt: 200, back: 30 }), true, 'with a 200 ms round trip the shot lands');
  assert.equal(await crossingShot({ rtt: 0, back: 30 }), false, 'judged at the server\'s present it misses');
});

test('a screen that shows the others interpolated (ld ms back) is judged that much further back, and no further', { skip }, async () => {
  assert.equal(await crossingShot({ rtt: 100, ld: 80, back: 130 }), true, 'judged where the interpolated screen showed it');
  assert.equal(await crossingShot({ rtt: 100, ld: -1, back: 130 }), false, 'a screen that does not interpolate is judged half a round trip back');
});

test('a protected pilot (just respawned, or dashing) is not hurt by a shot that passes through it', { skip }, async () => {
  const m = await createMatch({ code: 'm1d0o' });
  try {
    const shooter = m.addPilot('Shooter'), target = m.addPilot('Target');
    run(m, 0.1); emptyField(m);
    const T = m.game.__simBot(target);
    const keep = (inv) => () => { hold(m, shooter, 1500, 600); hold(m, target, 1800, 600); T.inv = inv(); };
    const protectedLives = T.lives;
    m.input(shooter, { aim: 0, fire: true });
    run(m, 1, keep(() => 1e15));
    assert.equal(T.lives, protectedLives, 'protected: unhurt');
    run(m, 1, keep(() => 0));
    assert.ok(T.lives < protectedLives || T.st.deaths > 0, 'unprotected: hurt');
  } finally { m.dispose(); }
});

test('health and armour: a med kit stops at 100%, a keg reaches 199%; armour soaks 75% and the layers cap at 150%', { skip }, async () => {
  const g = await loadGame();
  try {
    const r = g.get(`(() => {
      const p = { lives: LIVES * 0.9 }, out = {};
      out.med = applySupply(p, 'med'); out.full = p.lives; out.medAgain = applySupply(p, 'med');
      out.keg = applySupply(p, 'bigmed'); out.kegged = p.lives; out.kegAgain = applySupply(p, 'bigmed');
      const q = { lives: LIVES };
      applySupply(q, 'shield'); out.armour = q.bodyArmor; out.armourAgain = applySupply(q, 'shield');
      out.soaked = absorbArmor(q, 1.2); out.armourLeft = q.bodyArmor;
      applySupply(q, 'shield'); applySupply(q, 'pads'); out.layers = q.shield; out.padsAgain = applySupply(q, 'pads');
      clearArmor(q); out.cleared = (q.shield || 0) + (q.bodyArmor || 0) + (q.beltArmor || 0) + (q.padsArmor || 0);
      return out; })()`);
    assert.equal(r.med, true); assert.equal(r.full, 3); assert.equal(r.medAgain, false, 'nothing taken that does nothing');
    assert.equal(r.keg, true); assert.ok(Math.abs(r.kegged - 5.97) < 1e-9, 'a keg tops up to 199%'); assert.equal(r.kegAgain, false);
    assert.equal(r.armour, 3); assert.equal(r.armourAgain, false, 'armour does not stack');
    assert.ok(Math.abs(r.soaked - 0.9) < 1e-9 && Math.abs(r.armourLeft - 2.1) < 1e-9, 'armour takes 75% of a hit');
    assert.equal(r.layers, 4.5, 'armour and pads together: 150%'); assert.equal(r.padsAgain, false);
    assert.equal(r.cleared, 0, 'a respawn clears every layer');
  } finally { g.dispose(); }
});

