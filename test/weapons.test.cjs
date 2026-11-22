// Weapons, as the authoritative server fires them for players: every gun fires, shots travel and hurt, each gun's
// special mode does what it is for, and the numbers a screen predicts are the server's.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { skip, createMatch, loadGame } = require('./helpers/game.cjs');
const { clock, run, hold, emptyField, gunIndex, wire } = require('./helpers/match.cjs');

// two pilots in an empty Duel arena, the round open
async function duel(...names) {
  const m = await createMatch({ code: 'm1d0o' });
  emptyField(m);
  const ids = names.map(n => m.addPilot(n));
  run(m, 0.1);
  return { m, ids, bots: ids.map(id => m.game.__simBot(id)) };
}

test('the test range hands a player every gun there is, and every one of them fires', { skip }, async () => {
  const m = await createMatch({ code: 'm1x0o' });
  try {
    const id = m.addPilot('Gunner');
    run(m, 0.1);
    const b = m.game.__simBot(id), guns = Object.keys(b.arsenal);
    for (const g of ['fire', 'saw', 'minigun', 'scatter', 'rocket', 'gren', 'laser', 'orb', 'rail', 'shard', 'mine', 'gamma', 'nuke', 'holy', 'void']) assert.ok(guns.includes(g), 'carries ' + g);
    for (const g of guns) {
      const w = gunIndex(m, g), shots = b.st.shots, keep = () => hold(m, id, 900, 300, 0);
      m.input(id, { w, aim: 0 }); run(m, 0.3, keep);
      m.input(id, { w, aim: 0, fire: true }); run(m, 1.3, keep);   // (the blade strikes on release)
      m.input(id, { w, aim: 0, fire: false }); run(m, 0.2, keep);
      assert.ok(b.st.shots > shots, g + ' fired');
      if (b.dead) run(m, 3.5);   // a bomb at close range takes its owner too
    }
  } finally { m.dispose(); }
});

test('a player flies by their stick and their shots kill by the same rules as anyone’s', { skip }, async () => {
  const { m, ids: [shooter, target] } = await duel('Shooter', 'Target');
  try {
    hold(m, shooter, 600, 300);
    const x0 = m.pilot(shooter).x;
    run(m, 1, () => { m.input(shooter, { mx: 1, my: 0, aim: 0 }); hold(m, target, 3000, 3500); });
    assert.ok(m.pilot(shooter).x - x0 > 250, 'flew right ' + (m.pilot(shooter).x - x0));
    m.input(shooter, { mx: 0, my: 0, aim: 0, fire: true });
    run(m, 6, () => { hold(m, shooter, 1500, 600, 0); hold(m, target, 1900, 600); });
    assert.ok(m.pilot(target).deaths >= 1 && m.pilot(shooter).kills >= 1, JSON.stringify([m.pilot(shooter), m.pilot(target)]));
  } finally { m.dispose(); }
});

test('a shot travels: scatter pellets hurt a target 800 px away when they get there, not when the trigger is pulled', { skip }, async () => {
  const { m, ids: [shooter, target], bots: [B, T] } = await duel('Shooter', 'Target');
  try {
    B.arsenal.scatter = 10;
    const w = gunIndex(m, 'scatter'), keep = () => { hold(m, shooter, 1500, 600); hold(m, target, 2300, 600); };
    m.input(shooter, { w, aim: 0 }); run(m, 0.3, keep);
    const before = T.lives;
    m.input(shooter, { w, aim: 0, fire: true }); run(m, 1 / 30 * 1.01, keep);
    m.input(shooter, { w, aim: 0, fire: false }); run(m, 0.2, keep);
    assert.equal(T.lives, before, 'not hurt while the pellets are on their way');
    run(m, 0.6, keep);
    assert.ok(T.lives < before, 'hurt once they arrive');
  } finally { m.dispose(); }
});

test('the rocket launcher\'s alt loads a rocket a press, fires what is loaded on release, and lets three go by itself', { skip }, async () => {
  const { m, ids: [id], bots: [b] } = await duel('Gunner');
  try {
    const { K } = m.game.__simConst, w = gunIndex(m, 'rocket'), keep = () => hold(m, id, 900, 300);
    b.arsenal.rocket = 10;
    m.input(id, { w, aim: 0 }); run(m, 0.2, keep);
    assert.equal(m.pilot(id).weapon, 'rocket');
    const fired = () => new Set((wire(m, id).f || []).filter(e => e[5] === K.ROCKET).map(e => e[0]));
    m.input(id, { w, aim: 0, alt: true }); run(m, 0.1, keep);
    m.input(id, { w, aim: 0, alt: false }); run(m, 0.1, keep);
    assert.equal(b.arsenal.rocket, 9, 'a tap fires one');
    run(m, 1, keep);
    m.input(id, { w, aim: 0, alt: true }); run(m, 1, keep);
    m.input(id, { w, aim: 0, alt: false }); run(m, 0.1, keep);
    assert.equal(b.arsenal.rocket, 7, 'held a second: two go on release');
    run(m, 1, keep);
    const before = fired();
    m.input(id, { w, aim: 0, alt: true }); run(m, 1.5, keep);
    assert.equal([...fired()].filter(x => !before.has(x)).length, 3, 'held on: a salvo of three by itself');
    assert.ok(wire(m, id).ar.some(([k, n]) => k === w && n === 4), 'the snapshot tells the player their ammo');
    m.input(id, { w: gunIndex(m, 'rail'), aim: 0 }); run(m, 0.1, keep);
    assert.equal(m.pilot(id).weapon, 'rocket', 'a gun the pilot does not carry cannot be picked');
  } finally { m.dispose(); }
});

test('the Blood Blade is found, not carried; held, its wind-up stays drawn (others see it) and it strikes on release; its edge bites what it touches', { skip }, async () => {
  const { m, ids: [a, v], bots: [A, V] } = await duel('Blade', 'Victim');
  try {
    const w = gunIndex(m, 'saw');
    assert.ok(!('saw' in A.arsenal), 'no blade to start with');
    A.arsenal.saw = Infinity; A.weapon = 'saw';
    run(m, 0.2, () => m.input(a, { aim: 0, fire: true, w }));
    const half = wire(m, a).bw;
    assert.ok(half > 0.2 && half < 0.8, 'winding: ' + half);
    run(m, 0.4, () => m.input(a, { aim: 0, fire: true, w }));
    assert.equal(wire(m, a).bw, 1, 'held full until let go');
    run(m, 0.1, () => m.input(a, { aim: 0, fire: false, w }));
    assert.equal(wire(m, a).bw, undefined, 'struck');
    const put = () => {   // the victim held on the resting blade, halfway along it
      Object.assign(A, { x: 2000, y: 2000, vx: 0, vy: 0, a: 0, inv: 0 });
      const hx = A.x + Math.cos(1.4) * 38, hy = A.y + Math.sin(1.4) * 38;
      Object.assign(V, { x: hx + Math.cos(0.26) * 45, y: hy + Math.sin(0.26) * 45, vx: 0, vy: 0, inv: 0 });
    };
    run(m, 1, put);
    const hp = V.lives;
    run(m, 1, () => { put(); m.input(a, { w, aim: 0 }); });
    assert.ok(V.lives < hp, `a touch hurts: ${hp} -> ${V.lives}`);
    assert.ok(hp - V.lives <= 0.18 * 3 + 1e-6, 'a touch at most every 0.45 s');
  } finally { m.dispose(); }
});

test('the scatter gun\'s hook bites into a bin and hauls its pilot there, for no ammo', { skip }, async () => {
  const { m, ids: [a], bots: [A, V] } = await duel('Hooker', 'Prey');
  try {
    const w = gunIndex(m, 'scatter'), keepPrey = () => Object.assign(V, { x: 2600, y: 2000, vx: 0, vy: 0 });
    A.arsenal.scatter = 10; A.weapon = 'scatter';
    m.input(a, { w, aim: 0 }); run(m, 0.1, keepPrey);
    Object.assign(A, { x: 2000, y: 2000, vx: 0, vy: 0, a: 0 });
    let closest = Infinity;
    run(m, 1.2, () => { keepPrey(); m.input(a, { w, aim: 0, alt: true }); closest = Math.min(closest, Math.hypot(A.x - V.x, A.y - V.y)); });
    assert.ok(closest < 200, 'hauled to its prey: ' + Math.round(closest));
    assert.equal(A.arsenal.scatter, 10);
  } finally { m.dispose(); }
});

test('the Pulse Gun\'s Plasma Nova charges while held, goes when full, and bursts on a pilot by its charge', { skip }, async () => {
  const { m, ids: [a], bots: [A, V] } = await duel('Gunner', 'Mark');
  try {
    const w = gunIndex(m, 'laser'), K = m.game.__simConst.K;
    A.arsenal.laser = 40; A.weapon = 'laser';
    const keep = () => { Object.assign(V, { x: 2600, y: 2000, vx: 0, vy: 0, inv: 0 }); Object.assign(A, { x: 2000, y: 2000, vx: 0, vy: 0, a: 0 }); };
    keep(); m.input(a, { w, aim: 0 }); run(m, 0.1, keep);
    const lives0 = V.lives;
    run(m, 0.7, () => { keep(); m.input(a, { w, aim: 0, alt: true }); });
    let nova = null;
    run(m, 1.2, () => { keep(); m.input(a, { w, aim: 0 }); nova = nova || m.game.__simShots().find(s => s.kind === K.NOVA); });
    assert.ok(nova && nova.m > 0.9, 'a full nova flew');
    assert.ok(V.dead || V.lives < lives0 - 2, 'it hits hard: ' + lives0 + ' -> ' + V.lives);
    assert.equal(A.arsenal.laser, 35, 'a nova costs 5');
  } finally { m.dispose(); }
});

test('a void bomb\'s black hole drags pilots in and burns them, and its kills are its thrower\'s', { skip }, async () => {
  const { m, ids: [a, v], bots: [A, V] } = await duel('Thrower', 'Victim');
  try {
    const w = gunIndex(m, 'void');
    A.arsenal.void = 1; A.weapon = 'void';
    Object.assign(A, { x: 1500, y: 2000, vx: 0, vy: 0, a: 0 }); Object.assign(V, { x: 3300, y: 2000, vx: 0, vy: 0 });
    m.input(a, { w, aim: 0, fire: true }); run(m, 0.1); m.input(a, { w, aim: 0 });
    run(m, 1.6);   // it flies on and bursts
    const v0 = V.x;
    run(m, 1, () => m.input(v, { w: 0, aim: 0 }));
    assert.ok(V.dead || V.x < v0 - 150, 'dragged toward the hole: ' + Math.round(v0) + ' -> ' + Math.round(V.x));
    const lives0 = V.lives; V.inv = 0;
    run(m, 3, () => m.input(v, { w: 0, aim: 0 }));
    assert.ok(V.lives < lives0 || V.st.deaths > 0, 'the hole hurts');
    if (V.st.deaths > 0) assert.ok(A.st.kills > 0 || (V.koBy || []).some(k => String(k).startsWith(A.tag + '.')), 'the kill is the thrower\'s');
  } finally { m.dispose(); }
});

test('a guided nuke turns by its pilot\'s stick and blows when they say', { skip }, async () => {
  const m = await createMatch({ code: 'm1n0o' });   // Nukes mode
  emptyField(m);
  try {
    const id = m.addPilot('Pilot'), b = m.game.__simBot(id), K = m.game.__simConst.K, w = gunIndex(m, 'nuke');
    run(m, 0.2);
    b.arsenal = { ...b.arsenal, nuke: 9 }; b.weapon = 'nuke';
    Object.assign(b, { x: 1500, y: 2000, vx: 0, vy: 0, a: 0 });
    run(m, 0.1, () => m.input(id, { aim: 0, alt: true, w }));
    m.input(id, { aim: 0, alt: false, w });
    const nuke = m.game.__simShots().find(s => s.owner === id && s.kind === K.NUKE);
    assert.ok(nuke && Math.abs(Math.atan2(nuke.vy, nuke.vx)) < 0.05, 'it sets off straight ahead');
    run(m, 1, () => m.input(id, { aim: 0, gx: 0, gy: 1, w }));
    assert.ok(Math.atan2(nuke.vy, nuke.vx) > 1, 'turned toward the stick');
    run(m, 0.1, () => m.input(id, { aim: 0, gx: 0, gy: 1, gb: 1, w }));
    assert.ok(nuke.boom, 'blown when asked');
  } finally { m.dispose(); }
});

test('Quad Damage: taken from its spot, it makes a pilot\'s shots four times as strong', { skip }, async () => {
  const { m, ids: [id], bots: [b] } = await duel('Quad');
  try {
    let q = null;
    for (let i = 0; i < 300 && !q; i++) { run(m, 1); q = m.game.__simQuad(); }   // (it comes onto its spot on the shared clock)
    assert.ok(q, 'Quad Damage on the map');
    run(m, 0.2, () => Object.assign(b, { x: q.x, y: q.y, vx: 0, vy: 0 }));
    assert.ok(b.ampUntil > clock.t, 'taken');
    m.input(id, { aim: 0, fire: true });
    run(m, 0.5, () => hold(m, id, 1500, 600));
    const mine = m.game.__simShots().filter(s => s.owner === b.id);
    assert.ok(mine.length && mine.every(s => s.m === 4), JSON.stringify(mine.map(s => s.m)));
  } finally { m.dispose(); }
});

test('a gun\'s spread is a function of the pilot\'s tag and the shot\'s number, so a screen predicts it exactly', { skip }, async () => {
  const { m, ids: [id], bots: [b] } = await duel('Gunner');
  try {
    b.arsenal = { ...b.arsenal, minigun: 999 }; b.weapon = 'minigun';
    const seen = new Map();
    run(m, 1.5, () => {
      hold(m, id, 1200, 1200); m.input(id, { aim: 0, fire: true, w: gunIndex(m, 'minigun') });
      for (const s of m.game.__simShots()) if (s.owner === id && !seen.has(s.id)) seen.set(s.id, s);
    });
    const bullets = [...seen.values()].filter(s => s.kind === m.game.__simConst.K.BULLET);
    assert.ok(bullets.length >= 5);
    const g = await loadGame();   // (the rule a screen predicts it by, from the game itself)
    try {
      for (const s of bullets) {
        const n = parseInt(s.id.slice(s.id.lastIndexOf('.') + 1), 36), want = g.get(`shotJitter(${JSON.stringify(b.tag)}, ${n}, WEAPONS.minigun.jitter)`);
        assert.ok(Math.abs(Math.atan2(s.vy, s.vx) - want) < 1e-9, `shot ${s.id}`);
      }
    } finally { g.dispose(); }
  } finally { m.dispose(); }
});

test('every gun has a key of its own, the same whatever a pilot carries', { skip }, async () => {
  const g = await loadGame();
  try {
    const r = g.get(`(() => { const all = WEAPON_SLOTS.filter(Boolean), keys = all.map(weaponKey);
      const before = weaponKey("rail"); me.arsenal = { rail: 2, fire: Infinity }; const after = weaponKey("rail");
      return { keys, before, after, pistol: weaponKey("fire"), blade: weaponKey("saw") }; })()`);
    assert.equal(new Set(r.keys).size, r.keys.length, 'no two guns share a key: ' + r.keys);
    assert.ok(r.keys.every(k => /^(Alt\+)?[0-9]$/.test(k)), 'each a number key, or Alt and one');
    assert.equal(r.before, r.after, 'a key does not move with what is carried');
    assert.deepEqual([r.pistol, r.blade], ['1', '2']);
  } finally { g.dispose(); }
});

test('the second modes: the Blood Blade lunges forward and strikes at once, a bomb\'s short throw falls short, the railgun\'s scope fires nothing', { skip }, async () => {
  const { m, ids: [id], bots: [B] } = await duel('Gunner', 'Target');
  try {
    const K = m.game.__simConst.K, mine = kind => m.game.__simShots().filter(s => s.owner === id && s.kind === kind);
    const still = () => hold(m, id, 1500, 1500, 0);
    // the lunge
    B.arsenal.saw = Infinity;
    m.input(id, { w: gunIndex(m, 'saw'), aim: 0 }); run(m, 0.3, still);
    const shots = B.st.shots;
    m.input(id, { w: gunIndex(m, 'saw'), aim: 0, alt: true }); run(m, 1 / 30 * 1.01);
    assert.ok(B.vx > 500, 'thrown forward: ' + Math.round(B.vx));
    assert.ok(B.st.shots > shots && mine(K.SWORD).length, 'and swung at once');
    m.input(id, { w: gunIndex(m, 'saw'), aim: 0, alt: false }); run(m, 1.5, still);   // (the lunge's own cooldown)
    // the short throw: the same bomb, slower
    for (const [gun, kind] of [['holy', K.HOLY], ['void', K.VOID]]) {
      B.arsenal[gun] = 2;
      m.input(id, { w: gunIndex(m, gun), aim: 0 }); run(m, 0.3, still);
      m.input(id, { w: gunIndex(m, gun), aim: 0, fire: true }); run(m, 0.1, still);
      const long = Math.hypot(mine(kind)[0].vx, mine(kind)[0].vy);
      m.game.__simShots().length = 0;
      m.input(id, { w: gunIndex(m, gun), aim: 0, fire: false }); run(m, 1.4, still);
      m.input(id, { w: gunIndex(m, gun), aim: 0, alt: true }); run(m, 0.1, still);
      const short = Math.hypot(mine(kind)[0].vx, mine(kind)[0].vy);
      assert.ok(short < long * 0.6, `${gun}: ${Math.round(short)} against ${Math.round(long)}`);
      m.game.__simShots().length = 0;
      m.input(id, { w: gunIndex(m, gun), aim: 0, alt: false }); run(m, 1.4, still);
    }
    // the scope: held, nothing goes; the main trigger still fires
    B.arsenal.rail = 5;
    m.input(id, { w: gunIndex(m, 'rail'), aim: 0 }); run(m, 2, still);
    const before = B.st.shots;
    m.input(id, { w: gunIndex(m, 'rail'), aim: 0, alt: true }); run(m, 0.5, still);
    assert.equal(B.st.shots, before, 'the scope fires nothing');
    m.input(id, { w: gunIndex(m, 'rail'), aim: 0, alt: true, fire: true }); run(m, 0.2, still);
    assert.ok(B.st.shots > before, 'the railgun fires while scoped');
  } finally { m.dispose(); }
});
