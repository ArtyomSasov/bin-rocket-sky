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

test('every map builds solid terrain on the server; the Foundry station keeps its 40 hull walls and breakable walls inside', { skip }, async () => {
  const { createMatch } = await sim();
  for (const map of ['f', 'k', 'h', 'v', 'c', 'a', 'y', 'r', 's', 'w', 'o']) {
    const m = createMatch({ code: 'm1d0' + map });
    try {
      const { bodies, solidCells } = m.info;
      assert.ok(bodies > 0 && solidCells > bodies * 20, `${map}: ${bodies} bodies, ${solidCells} solid cells`);
      if (map === 'f') { assert.equal(m.info.walls, 40); assert.ok(m.info.innerWalls >= 10, `${m.info.innerWalls} inner walls`); }
      if (['f', 'k', 'h', 'v'].includes(map)) assert.ok(m.info.props >= 20, `${map}: ${m.info.props} props`);
    } finally { m.dispose(); }
  }
});

test('station props stand on the floor, clear of the walls and of every pick-up spot', { skip }, async () => {
  const { createMatch } = await sim();
  for (const map of ['f', 'k', 'h', 'v']) {
    const m = createMatch({ code: 'm1d0' + map });
    try {
      const { spots, props, unit, open } = m.game.__simArena();
      for (const [x, y, r] of props) {
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) assert.ok(open(Math.floor((x + dx * r * 0.7) / unit), Math.floor((y + dy * r * 0.7) / unit)), `${map}: prop at ${x / unit},${y / unit} is in a wall`);
        for (const [sx, sy] of spots) assert.ok(Math.hypot(sx - x, sy - y) > r + unit * 0.2, `${map}: prop at ${(x / unit).toFixed(2)},${(y / unit).toFixed(2)} covers the pick-up at ${(sx / unit).toFixed(2)},${(sy / unit).toFixed(2)}`);
      }
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
    assert.equal(info.walls, 40);   // (the hull: nothing breaks it)
    assert.ok(info.solidCells > walls * 0.8, 'the station stands (its inner walls and crates take some damage)');
  } finally { m.dispose(); }
});

test('a player flies by their stick and aim, and their shots kill by the same rules as anyone’s', { skip }, async () => {
  const { createMatch } = await sim();
  const m = createMatch({ code: 'm1d0o' });   // Duel: nearly empty
  m.game.__simTerrain.empty();   // and no junk drifting by on the real clock (a player's pilot bumps off it)
  try {
    const shooter = m.addPilot('Shooter'), target = m.addPilot('Target');
    const p = id => m.pilot(id);
    run(m, 0.1);   // the first step opens the round, which puts everyone on a spawn point
    // fly: a second of full stick to the right carries the pilot a few hundred units (from open space near the top,
    // so a random spawn by a pillar or the fence can't stop it)
    Object.assign(m.game.__simBot(shooter), { x: 600, y: 300, vx: 0, vy: 0 });
    const x0 = p(shooter).x;
    run(m, 1, () => { m.input(shooter, { mx: 1, my: 0, aim: 0 }); Object.assign(m.game.__simBot(target), { x: 3000, y: 3500, vx: 0, vy: 0 }); });   // (the other pilot well away: touching pushes)
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

test('a player takes Quad damage on the server: four times the damage until it runs out or they die, and their state says so', { skip }, async () => {
  const { createMatch } = await sim();
  const m = createMatch({ code: 'm1d0o' });
  m.game.__simTerrain.empty();
  try {
    const id = m.addPilot('Quad');
    run(m, 0.1);
    let q = null;
    for (let i = 0; i < 300 && !q; i++) { run(m, 1); q = m.game.__simQuad(); }   // (it comes onto its spot on the shared clock)
    assert.ok(q, 'no Quad damage on the map');
    const b = m.game.__simBot(id);
    run(m, 0.2, () => Object.assign(b, { x: q.x, y: q.y, vx: 0, vy: 0 }));
    assert.ok(b.ampUntil > clock, 'not taken');
    m.input(id, { mx: 0, my: 0, aim: 0, fire: true });
    run(m, 0.5, () => Object.assign(b, { x: 1500, y: 600, vx: 0, vy: 0, a: 0 }));
    const mine = m.game.__simShots().filter(s => s.owner === b.id);
    assert.ok(mine.length && mine.every(s => s.m === 4), JSON.stringify(mine.map(s => s.m)));
    assert.ok(m.game.__simBot(id).ampUntil > clock);
  } finally { m.dispose(); }
});

test('bots take Quad damage and the big bombs\u2019 crates, and a player on the server takes a bomb crate too', { skip }, async () => {
  const { createMatch } = await sim();
  const m = createMatch({ code: 'm1x0c', bots: 1 });   // (the big bombs' crates lie out in this mode)
  m.game.__simTerrain.empty();
  try {
    const id = m.addPilot('Player');
    run(m, 0.1);
    const bot = m.game.__simBots().find(b => !b.input), me = m.game.__simBot(id);
    let q = null, bombs = [];
    for (let i = 0; i < 200 && (!q || bombs.length < 2); i++) { run(m, 1); q = m.game.__simQuad(); bombs = m.game.__simWorld().bombs; }
    assert.ok(q && bombs.length >= 2, 'Quad and two bomb crates on the map');
    const [nuke, holy] = [bombs.find(c => c.type === 'nuke'), bombs.find(c => c.type === 'holy')];
    run(m, 0.2, () => { Object.assign(bot, { x: q.x, y: q.y, vx: 0, vy: 0 }); Object.assign(me, { x: 300, y: 300, vx: 0, vy: 0 }); });
    assert.ok(bot.ampUntil > clock, 'the bot took Quad damage');
    run(m, 0.2, () => { Object.assign(bot, { x: nuke.x, y: nuke.y, vx: 0, vy: 0 }); Object.assign(me, { x: holy.x, y: holy.y, vx: 0, vy: 0 }); });
    assert.equal(bot.weapon, 'nuke', 'the bot took the nuke');
    assert.ok(me.arsenal.holy >= 1, 'the player took the holy bomb');
  } finally { m.dispose(); }
});

test('player input is clamped to what a stick, an angle and buttons can send', { skip }, async () => {
  const { cleanInput } = await sim();
  const i = cleanInput({ mx: 9, my: 9, aim: 7, fire: 'yes', boost: true, dash: -3 });
  assert.ok(Math.abs(i.mx - Math.SQRT1_2) < 1e-12 && Math.abs(i.my - Math.SQRT1_2) < 1e-12, 'a stick never goes past its rim');
  assert.ok(Math.abs(i.aim - (7 - 2 * Math.PI)) < 1e-12, 'an angle is wrapped');
  assert.deepEqual({ fire: i.fire, boost: i.boost, dash: i.dash }, { fire: false, boost: true, dash: 0 });
  assert.deepEqual(cleanInput({ mx: NaN, aim: Infinity, dash: 2.5, tele: -1, w: 99, alt: 1 }), { mx: 0, my: 0, aim: 0, fire: false, alt: false, boost: false, brake: false, dash: 0, tele: 0, w: -1, s: 0, gx: 0, gy: 0, gb: 0, ld: -1 });
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
    // (a piece that has not moved since the last snapshot is left out of it; every 15th snapshot carries them all)
    let wire = null;
    for (let i = 0; i < 16 && !(wire && wire.list.some(e => e[0] === ra.key)); i++) wire = a.packet(clock + i).rb;
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

test('a gun\u2019s random spread follows from the pilot\u2019s tag and the shot\u2019s number, so a screen can predict it exactly', { skip }, async () => {
  const { createMatch } = await sim();
  const m = createMatch({ code: 'm1d0o' });
  m.game.__simTerrain.empty();
  try {
    const id = m.addPilot('Gunner');
    run(m, 0.1);
    const b = m.game.__simBot(id);
    b.arsenal = { ...b.arsenal, minigun: 999 }; b.weapon = 'minigun';
    const seen = new Map();
    run(m, 1.5, () => {
      Object.assign(b, { x: 1200, y: 1200, vx: 0, vy: 0, a: 0 }); m.input(id, { mx: 0, my: 0, aim: 0, fire: true, w: m.game.__simConst.WEAPON_KEYS.indexOf('minigun') });
      for (const s of m.game.__simShots()) if (s.owner === id && !seen.has(s.id)) seen.set(s.id, s);
    });
    // the same numbers the page uses (hash in 02-helpers.js, shotJitter in 11-weapons.js)
    const hash = (a, b, c) => { let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041)) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
    const tagSeed = t => { let h = 7; for (let i = 0; i < t.length; i++) h = Math.imul(h, 31) + t.charCodeAt(i) | 0; return h; };
    const mine = [...seen.values()].filter(s => s.kind === m.game.__simConst.K.BULLET);
    assert.ok(mine.length >= 5, mine.length + ' bullets');
    for (const s of mine) {
      const n = parseInt(s.id.slice(s.id.lastIndexOf('.') + 1), 36), want = (hash(tagSeed(b.tag), n, 991) - 0.5) * 2 * 0.03375;
      assert.ok(Math.abs(Math.atan2(s.vy, s.vx) - want) < 1e-9, `shot ${s.id}: ${Math.atan2(s.vy, s.vx)} vs ${want}`);
    }
  } finally { m.dispose(); }
});

test('flight commands: the server\u2019s state after one command, flown on with the next ones, is exactly its state after the last', { skip }, async () => {
  const { createMatch } = await sim();
  const m = createMatch({ code: 'm1d0o' });
  m.game.__simTerrain.empty();
  try {
    const id = m.addPilot('Pilot'), cmds = [];
    run(m, 0.1);
    Object.assign(m.game.__simBot(id), { x: 1300, y: 1300, vx: 0, vy: 0 });
    // a minute of varied flying in one-frame commands: turns, boost, the brake, two dashes
    for (let s = 1; s <= 240; s++) {
      const a = s / 30;
      cmds.push([s, Math.round(Math.cos(a) * 1000), Math.round(Math.sin(a * 0.7) * 1000), Math.round(Math.sin(a) * 1000), (s % 90 < 30 ? 1 : 0) | (s % 70 > 60 ? 2 : 0), s > 100 ? (s > 180 ? 2 : 1) : 0]);
    }
    const mid = {};
    for (let s = 1; s <= 240; s++) {
      m.input(id, { c: cmds.slice(Math.max(0, s - 4), s) });   // four at a time, as a page sends them
      m.step(1 / 60, 1e6 + s * 1000 / 60);
      const me = m.packet(1e6 + s * 1000 / 60).bots.find(e => e[0] === id)[1];
      if (s === 120) Object.assign(mid, { ak: me.ak, mv: me.mv });
      if (s === 240) Object.assign(mid, { endAk: me.ak, endMv: me.mv });
    }
    assert.equal(mid.endAk, 240, 'every command flown once');
    const M = m.game.__simMove, o = { lv: 1, inv: 0 };
    M.setMoveState(o, mid.mv);
    for (const e of cmds) if (e[0] > mid.ak) M.pilotMove(o, { s: e[0], mx: e[1] / 1000, my: e[2] / 1000, aim: e[3] / 1000, boost: !!(e[4] & 1), brake: !!(e[4] & 2), dash: e[5] });
    const end = M.moveState(o);
    for (let i = 0; i < end.length; i++) assert.ok(Math.abs(end[i] - mid.endMv[i]) < 0.05, `state ${i}: replayed ${end[i]}, server ${mid.endMv[i]}`);
  } finally { m.dispose(); }
});

test('flight commands are flown against the clock: sent four times too fast they gain nothing; when they stop, the pilot flies on', { skip }, async () => {
  const { createMatch } = await sim();
  const m = createMatch({ code: 'm1d0o' });
  m.game.__simTerrain.empty();
  try {
    const id = m.addPilot('Pilot'), b = m.game.__simBot(id);
    run(m, 0.1);
    Object.assign(b, { x: 600, y: 1300, vx: 0, vy: 0 });
    let s = 0, t = 1e6;
    const step = () => { t += 1000 / 60; m.step(1 / 60, t); };
    for (let k = 0; k < 60; k++) { const c = []; for (let j = 0; j < 4; j++) { s++; c.push([s, 1000, 0, 0, 0, 0]); } m.input(id, { c }); step(); }   // 240 commands in one second
    assert.ok(b.mt <= 1.12, `a second of steps flew ${(b.mt * 60).toFixed(0)} commands' worth, not 240`);   // (mt: its command clock)
    // now nothing comes: after a moment the last command is flown again, so it keeps flying (and gravity, holes, all still apply)
    for (let k = 0; k < 40; k++) m.input(id, { c: [] });
    const x0 = b.x;
    for (let k = 0; k < 30; k++) step();
    assert.ok(b.x - x0 > 100, `flew on ${b.x - x0} px with no commands`);
  } finally { m.dispose(); }
});

test('nothing but its commands moves a player\u2019s pilot: crashing about the station, the server\u2019s flight is a replay\u2019s to the digit', { skip }, async () => {
  const { createMatch } = await sim();
  const m = createMatch({ code: 'm1x0kchk' });   // Cargo Deck: walls and props to bump into, and crash damage
  try {
    const id = m.addPilot('P'), b = m.game.__simBot(id), M = m.game.__simMove, shadow = { lv: 1, inv: 0 };
    let t = 1e6; const step = () => { t += 1000 / 60; m.step(1 / 60, t); };
    for (let i = 0; i < 10; i++) step();
    let flown = 0;
    for (let s = 1; s <= 1500; s++) {
      const a = s / 40, c = [s, Math.round(Math.cos(a) * 1000), Math.round(Math.sin(a * 0.73) * 1000), Math.round(Math.sin(a * 1.3) * 3000), (s % 120 < 40 ? 1 : 0) | (s % 97 > 90 ? 2 : 0), Math.floor(s / 300)];
      const before = M.moveState(b);
      m.input(id, { c: [c] }); step();
      if (b.cmdAck !== s || b.dead) continue;
      M.setMoveState(shadow, before);
      M.pilotMove(shadow, { s, mx: c[1] / 1000, my: c[2] / 1000, aim: c[3] / 1000, boost: !!(c[4] & 1), brake: !!(c[4] & 2), dash: c[5] });
      assert.ok(Math.hypot(shadow.x - b.x, shadow.y - b.y) < 0.01 && Math.hypot(shadow.vx - b.vx, shadow.vy - b.vy) < 0.01, `command ${s}: the server moved it otherwise (${b.vx.toFixed(1)},${b.vy.toFixed(1)} vs ${shadow.vx.toFixed(1)},${shadow.vy.toFixed(1)})`);
      flown++;
    }
    assert.ok(flown > 1000, flown + ' commands compared');
  } finally { m.dispose(); }
});

test('a player\u2019s guided nuke turns on the server by their stick, and blows when they say', { skip }, async () => {
  const { createMatch } = await sim();
  const m = createMatch({ code: 'm1n0o' });   // Nukes: unlimited nukes
  m.game.__simTerrain.empty();
  try {
    const id = m.addPilot('Pilot'), b = m.game.__simBot(id), K = m.game.__simConst.K, W = m.game.__simConst.WEAPON_KEYS;
    run(m, 0.2);
    b.arsenal = { ...b.arsenal, nuke: 9 }; b.weapon = 'nuke';
    Object.assign(b, { x: 1500, y: 2000, vx: 0, vy: 0, a: 0 });
    run(m, 0.1, () => m.input(id, { mx: 0, my: 0, aim: 0, alt: true, w: W.indexOf('nuke') }));   // the alt: guided
    m.input(id, { mx: 0, my: 0, aim: 0, alt: false, w: W.indexOf('nuke') });
    const nuke = m.game.__simShots().find(s => s.owner === id && s.kind === K.NUKE);
    assert.ok(nuke, 'a nuke flies');
    assert.ok(Math.abs(Math.atan2(nuke.vy, nuke.vx)) < 0.05, 'it sets off straight ahead');
    run(m, 1, () => m.input(id, { mx: 0, my: 0, aim: 0, gx: 0, gy: 1, w: W.indexOf('nuke') }));   // stick down: it turns down
    assert.ok(Math.atan2(nuke.vy, nuke.vx) > 1, 'turned toward the stick: ' + Math.atan2(nuke.vy, nuke.vx).toFixed(2));
    run(m, 0.1, () => m.input(id, { mx: 0, my: 0, aim: 0, gx: 0, gy: 1, gb: 1, w: W.indexOf('nuke') }));
    assert.ok(nuke.boom, 'blown when asked');
  } finally { m.dispose(); }
});

