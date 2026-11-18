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
// the server's loop: a step every 1/30 s and a snapshot every second step (which also shows pilots to each other)
let clock = 1e6;
function run(m, seconds, each) {
  for (let i = 0; i < seconds * 30; i++) { clock += STEP * 1000; if (each) each(clock); m.step(STEP, clock); if (i % 2) m.packet(clock); }
  return clock;
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
    // fly: a second of full stick to the right carries the pilot a few hundred units (from open space near the top,
    // so a random spawn by a pillar or the fence can't stop it)
    Object.assign(m.game.__simBot(shooter), { x: 600, y: 300, vx: 0, vy: 0 });
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
  assert.deepEqual(cleanInput({ mx: NaN, aim: Infinity, dash: 2.5, tele: -1, w: 99, alt: 1 }), { mx: 0, my: 0, aim: 0, fire: false, alt: false, boost: false, brake: false, dash: 0, tele: 0, w: -1, s: 0, ld: -1 });
});

test('a player joining a full arena takes an AI bot’s place; a server of players only has no room left', { skip }, async () => {
  const { createMatch } = await sim();
  const m = createMatch({ code: 'm1d0o', bots: 24 });
  try {
    const id = m.addPilot('Late');
    assert.ok(id);
    const all = m.pilots;
    assert.equal(all.length, 24);
    assert.equal(all.filter(p => p.human).length, 1);
    for (let i = 0; i < 23; i++) assert.ok(m.addPilot('P' + i));
    assert.equal(m.pilots.every(p => p.human), true);
    assert.equal(m.addPilot('One too many'), null);
  } finally { m.dispose(); }
});

test('a snapshot carries the round clock and every pilot in the form a lobby host sends', { skip }, async () => {
  const { createMatch } = await sim();
  const m = createMatch({ code: 'm1d0c', bots: 3 });
  try {
    const id = m.addPilot('Me');
    run(m, 1);
    const p = m.packet(clock);
    assert.ok(Number.isSafeInteger(p.q) && Array.isArray(p.mc) && p.mc.length === 3);
    assert.equal(p.bots.length, 4);
    const mine = p.bots.find(([bid]) => bid === id);
    assert.ok(mine && Number.isFinite(mine[1].x) && Number.isFinite(mine[1].y));
    assert.ok(JSON.stringify(p).length < 6000, 'fits a packet budget');
  } finally { m.dispose(); }
});

// a pilot held still at (x, y), facing aim
const hold = (m, id, x, y, a) => Object.assign(m.game.__simBot(id), { x, y, vx: 0, vy: 0, a, inv: 0 });
// an open field: the moons orbit by the real clock, so a fixed spot is sometimes in a passing moon's way
function clearOffset(m) { m.game.__simTerrain.empty(); return 0; }

test('a player’s shot is judged where the target was on their screen (half their round trip ago)', { skip }, async () => {
  const { createMatch } = await sim();
  const lands = async rtt => {
    const m = createMatch({ code: 'm1d0o' });
    try {
      const shooter = m.addPilot('Shooter'), target = m.addPilot('Target');
      run(m, 0.1);
      if (rtt) m.rtt(shooter, rtt);
      // the target crosses the line of fire at 1000 px/s; the shooter fires behind it, where its screen showed it
      let t = 0, aim = 0;
      const o = clearOffset(m, 1400, 300, 2000, 1300), y = () => 400 + o + t * 1000;
      run(m, 0.5, () => { t += STEP; hold(m, shooter, 1500, 700 + o, aim); hold(m, target, 1900, y(), 0); m.game.__simBot(target).vy = 1000; });
      aim = Math.atan2(y() - 30 - 700 - o, 400);   // the middle of the hit zone (measured: -10..70 px back), well inside it
      const before = m.game.__simBot(target).lives;
      m.input(shooter, { aim, fire: true });
      run(m, 1 / 30 * 1.01, () => { t += STEP; hold(m, shooter, 1500, 700 + o, aim); hold(m, target, 1900, y(), 0); m.game.__simBot(target).vy = 1000; });
      m.input(shooter, { aim, fire: false });
      run(m, 0.2, () => { t += STEP; hold(m, shooter, 1500, 700 + o, aim); hold(m, target, 1900, y(), 0); });
      return m.game.__simBot(target).lives < before;
    } finally { m.dispose(); }
  };
  assert.equal(await lands(200), true, 'with a 200 ms round trip the shot lands');
  assert.equal(await lands(0), false, 'judged at the server’s present it misses');
});

test('a player carries an arsenal: picks a gun; the rocket alt loads one at the press, fires what is loaded on release, and goes by itself at three', { skip }, async () => {
  const { createMatch } = await sim();
  const m = createMatch({ code: 'm1d0o' });
  try {
    const { WEAPON_KEYS, K } = m.game.__simConst;
    const id = m.addPilot('Gunner');
    run(m, 0.1);
    m.game.__simTerrain.empty();
    const b = m.game.__simBot(id);
    b.arsenal.rocket = 10;
    const w = WEAPON_KEYS.indexOf('rocket'), keep = () => hold(m, id, 900, 300, 0);
    m.input(id, { w, aim: 0 });
    run(m, 0.2, keep);
    assert.equal(m.pilot(id).weapon, 'rocket', 'switched to the rocket launcher');
    const fired = () => { const ids = new Set(); for (const e of m.packet(clock).bots.find(([bid]) => bid === id)[1].f || []) if (e[5] === K.ROCKET) ids.add(e[0]); return ids; };
    // a tap: one rocket
    m.input(id, { w, aim: 0, alt: true }); run(m, 0.1, keep);
    assert.equal(b.rocketLoad, 1, 'the press loads the first rocket');
    m.input(id, { w, aim: 0, alt: false }); run(m, 0.1, keep);
    assert.equal(b.arsenal.rocket, 9, 'a tap fires one');
    run(m, 1, keep);
    // held a second: two loaded, fired on release
    m.input(id, { w, aim: 0, alt: true }); run(m, 1, keep);
    assert.equal(b.rocketLoad, 2, 'two after a second');
    m.input(id, { w, aim: 0, alt: false }); run(m, 0.1, keep);
    assert.equal(b.arsenal.rocket, 7, 'release fires the two loaded');
    run(m, 1, keep);
    // held on: at three the salvo goes by itself
    const before = fired();
    m.input(id, { w, aim: 0, alt: true }); run(m, 1.5, keep);
    const salvo = [...fired()].filter(x => !before.has(x));
    assert.equal(salvo.length, 3, 'a salvo of three, without letting go');
    assert.equal(b.arsenal.rocket, 4);
    m.input(id, { w, aim: 0, alt: false }); run(m, 0.1, keep);
    const mine = m.packet(clock).bots.find(([bid]) => bid === id)[1];
    assert.ok(mine.ar.some(([k, n]) => k === w && n === 4), 'the snapshot tells the player their ammo');
    // a gun the pilot does not carry cannot be picked
    m.input(id, { w: WEAPON_KEYS.indexOf('rail'), aim: 0 });
    run(m, 0.1, keep);
    assert.equal(m.pilot(id).weapon, 'rocket');
  } finally { m.dispose(); }
});

test('a broken-off piece has the same name everywhere the same craters were cut, and the snapshot says where it is', { skip }, async () => {
  const { createMatch } = await sim();
  const cutCap = m => {
    const T = m.game.__simTerrain, p = T.det().filter(b => b.planet && !b.fixed).sort((a, b) => b.rr - a.rr)[0];
    for (let k = -6; k <= 6; k++) T.carveAt(p, p.x + p.rr * 0.55, p.y + k * p.rr * 0.12, 26, true);
    T.carveAt(p, p.x + p.rr * 0.6, p.y, 60, true);
    return { T, p };
  };
  const a = createMatch({ code: 'm1d0crub1' }), b = createMatch({ code: 'm1d0crub1' });
  try {
    run(a, 0.1); run(b, 0.1);
    const A = cutCap(a), B = cutCap(b);
    run(a, 0.1); run(b, 0.1);   // (soon after the break: the two matches began at different moments, so their moons pull differently)
    const ka = A.T.rubble().map(r => r.key), kb = B.T.rubble().map(r => r.key);
    assert.ok(ka.length >= 1, 'a piece broke off');
    assert.equal(JSON.stringify(ka), JSON.stringify(kb), 'the same names on both');
    const ra = A.T.rubble()[0], rb = B.T.rubble()[0];
    // (the two test matches started at different moments, so their moons pull a little differently)
    assert.ok((ra.vx * rb.vx + ra.vy * rb.vy) / Math.hypot(ra.vx, ra.vy) / Math.hypot(rb.vx, rb.vy) > 0.95, 'flung the same way');
    assert.ok((ra.x - A.p.x) * ra.vx > 0, 'away from the planet it broke from');
    const wire = a.packet(clock).rb;
    assert.ok(wire && wire.list.some(e => e[0] === ra.key), JSON.stringify(wire));
  } finally { a.dispose(); b.dispose(); }
});

test('scatter pellets fly: a target 800 px away is hurt when the shot gets there, not when the trigger is pulled', { skip }, async () => {
  const { createMatch } = await sim();
  const m = createMatch({ code: 'm1d0o' });
  try {
    const { WEAPON_KEYS } = m.game.__simConst;
    const shooter = m.addPilot('Shooter'), target = m.addPilot('Target');
    run(m, 0.1);
    clearOffset(m);
    const b = m.game.__simBot(shooter), t = m.game.__simBot(target);
    b.arsenal.scatter = 10;
    const w = WEAPON_KEYS.indexOf('scatter'), keep = () => { hold(m, shooter, 1500, 600, 0); hold(m, target, 2300, 600, 0); };
    m.input(shooter, { w, aim: 0 });
    run(m, 0.3, keep);
    const before = t.lives;
    m.input(shooter, { w, aim: 0, fire: true });
    run(m, 1 / 30 * 1.01, keep);
    m.input(shooter, { w, aim: 0, fire: false });
    run(m, 0.2, keep);
    assert.equal(t.lives, before, 'not hurt while the pellets are still on their way');
    run(m, 0.6, keep);
    assert.ok(t.lives < before, 'hurt once they arrive');
  } finally { m.dispose(); }
});

test('a player’s state says which of their numbered controls it holds and for how long', { skip }, async () => {
  const { createMatch } = await sim();
  const m = createMatch({ code: 'm1d0o' });
  try {
    const id = m.addPilot('Pilot');
    run(m, 0.1);
    m.input(id, { mx: 1, s: 7 });
    run(m, 0.1);
    const mine = m.packet(clock).bots.find(([bid]) => bid === id)[1];
    assert.equal(mine.ak, 7);
    assert.ok(mine.ag >= 95 && mine.ag <= 140, `flown ${mine.ag} ms`);
  } finally { m.dispose(); }
});

test('a screen that shows the others interpolated (ld ms back) has its shots judged a round trip and ld ago', { skip }, async () => {
  const { createMatch } = await sim();
  // as in the test above: the target crosses the line of fire at 1000 px/s, the shooter fires where its screen showed it
  const lands = async (rtt, ld, back) => {
    const m = createMatch({ code: 'm1d0o' });
    try {
      const shooter = m.addPilot('Shooter'), target = m.addPilot('Target');
      run(m, 0.1);
      m.rtt(shooter, rtt);
      let t = 0, aim = 0;
      const o = clearOffset(m, 1400, 300, 2000, 1300);
      const y = () => 400 + o + t * 1000, keep = () => { t += STEP; hold(m, shooter, 1500, 700 + o, aim); hold(m, target, 1900, y(), 0); m.game.__simBot(target).vy = 1000; };
      run(m, 0.5, keep);
      aim = Math.atan2(y() - back - 700 - o, 400);
      const before = m.game.__simBot(target).lives;
      m.input(shooter, { aim, fire: true, ld });
      run(m, 1 / 30 * 1.01, keep);
      m.input(shooter, { aim, fire: false, ld });
      run(m, 0.2, keep);
      return m.game.__simBot(target).lives < before;
    } finally { m.dispose(); }
  };
  // 100 ms round trip + 80 ms of interpolation + half a step: ~196 ms back, less the step the target flies first
  assert.equal(await lands(100, 80, 130), true, 'judged where the interpolated screen showed it');   // (the zone measured: 90..170 px back)
  assert.equal(await lands(100, -1, 130), false, 'a screen that does not interpolate is judged only half a round trip back');
});

test('every gun fires for a player on the server, and the test range hands a player the whole arsenal', { skip }, async () => {
  const { createMatch } = await sim();
  const m = createMatch({ code: 'm1x0o' });   // the test range
  try {
    const { WEAPON_KEYS } = m.game.__simConst;
    const id = m.addPilot('Gunner');
    run(m, 0.1);
    const b = m.game.__simBot(id), guns = Object.keys(b.arsenal);
    for (const g of ['fire', 'gauntlet', 'minigun', 'scatter', 'shard', 'gren', 'rocket', 'laser', 'orb', 'rail', 'saw', 'mine', 'gamma', 'nuke', 'holy']) assert.ok(guns.includes(g), 'carries ' + g);
    assert.ok(!guns.includes('tele'), 'no teleporter: it is retired');
    for (const g of guns) {
      if (g === 'gauntlet') continue;   // a blow needs a bin within reach
      const w = WEAPON_KEYS.indexOf(g), shots = b.st.shots;
      m.input(id, { w, aim: 0 }); run(m, 0.3, () => hold(m, id, 900, 300, 0));
      m.input(id, { w, aim: 0, fire: true }); run(m, 1.3, () => hold(m, id, 900, 300, 0));   // (the charge cannon fires on release)
      m.input(id, { w, aim: 0, fire: false }); run(m, 0.2, () => hold(m, id, 900, 300, 0));
      assert.ok(b.st.shots > shots, g + ' fired');
      if (b.dead) run(m, 3.5);   // a nuke at close range takes its owner too
    }
  } finally { m.dispose(); }
});
