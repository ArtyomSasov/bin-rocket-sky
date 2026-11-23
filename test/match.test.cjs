// A match: rounds on a clock everyone shares, a score limit that ends a round early, bots that fight, a room that
// makes way for players, and a snapshot that carries all of it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { skip, createMatch, loadGame } = require('./helpers/game.cjs');
const { clock, run, hold, emptyField } = require('./helpers/match.cjs');

const T0 = Math.floor(Date.now() / 1000) * 1000;   // (a clock sent from more than a day away is refused)

test('a round runs its full time from whenever the match starts, then shows 15 s of results, then the next begins', { skip }, async () => {
  const g = await loadGame();
  try {
    const r = g.get(`(() => { ROUND_PLAY = 300; ROUND_LEN = 315; startMatch(${T0}); const at = s => roundAt(${T0} + s * 1000);
      return { start: at(0).left, live: at(299.001).live, last: Math.ceil(at(299.001).left), over: at(300).live, next: at(300).next, idx: at(315).idx, left: at(315).left }; })()`);
    assert.deepEqual(r, { start: 300, live: true, last: 1, over: false, next: 15, idx: 1, left: 300 });
  } finally { g.dispose(); }
});

test('a score limit ends the round early for everyone; a late joiner takes the running clock; nonsense clocks are ignored', { skip }, async () => {
  const host = await loadGame(), guest = await loadGame(), late = await loadGame();
  try {
    host.ev(`ROUND_PLAY = 300; ROUND_LEN = 315; startMatch(${T0}); receiveMatchClock([0, ${T0}, ${T0 + 90000}]);`);
    const state = host.get('[matchRound, matchStart, matchEnd]');
    guest.ev(`ROUND_PLAY = 300; ROUND_LEN = 315; receiveMatchClock(${JSON.stringify(state)});`);
    assert.equal(guest.get(`roundAt(${T0 + 90000}).next`), 15, 'the guest\'s round ends with the host\'s');
    host.ev(`receiveMatchClock([0, ${T0}, ${T0 + 99000}])`);
    assert.equal(host.get(`roundAt(${T0 + 95000}).live`), false, 'an ended round is never extended');
    assert.equal(host.get(`roundAt(${T0 + 105000}).idx`), 1, 'and the next one follows its results');
    late.ev(`ROUND_PLAY = 300; ROUND_LEN = 315; for (const c of [null, [], [0, ${T0}, -1], [-1, ${T0}, 0], [0, Infinity, 0]]) receiveMatchClock(c);`);
    assert.equal(late.get(`roundAt(${T0}).idx`), -1, 'nonsense ignored');
    late.ev(`receiveMatchClock([3, ${T0 - 60000}, 0])`);
    assert.deepEqual(late.get(`[roundAt(${T0}).idx, roundAt(${T0}).left]`), [3, 240], 'the running round, with its time left');
  } finally { host.dispose(); guest.dispose(); late.dispose(); }
});

test('24 bots fight a match on a station: kills are made and the station stands', { skip }, async () => {
  const m = await createMatch({ code: 'm1t0f', bots: 24, level: 'hard' });
  try {
    const solid = m.info.solidCells, walls = m.info.walls;
    run(m, 60);
    const info = m.info;
    assert.ok(info.kills > 0 && info.deaths >= info.kills, JSON.stringify(info));
    assert.equal(info.walls, walls, 'the hull stands');
    assert.ok(info.solidCells > solid * 0.8, 'the station is not dissolved');
  } finally { m.dispose(); }
});

test('a player joining a full arena takes a bot\'s place; a room of players only has no place left', { skip }, async () => {
  const m = await createMatch({ code: 'm1d0o', bots: 24 });
  try {
    assert.ok(m.addPilot('Late'));
    assert.equal(m.pilots.length, 24); assert.equal(m.pilots.filter(p => p.human).length, 1);
    for (let i = 0; i < 23; i++) assert.ok(m.addPilot('P' + i));
    assert.equal(m.pilots.every(p => p.human), true);
    assert.equal(m.addPilot('One too many'), null);
  } finally { m.dispose(); }
});

test('a snapshot carries the round clock and every pilot, within a packet\'s budget', { skip }, async () => {
  const m = await createMatch({ code: 'm1d0c', bots: 3 });
  try {
    const id = m.addPilot('Me');
    run(m, 1);
    const p = m.packet(clock.t);
    assert.ok(Number.isSafeInteger(p.q) && Array.isArray(p.mc) && p.mc.length === 3);
    assert.equal(p.bots.length, 4);
    const mine = p.bots.find(([bid]) => bid === id);
    assert.ok(mine && Number.isFinite(mine[1].x) && Number.isFinite(mine[1].y));
    assert.ok(JSON.stringify(p).length < 6000);
  } finally { m.dispose(); }
});

test('a piece broken off a planet has the same name in every game where the same craters were cut, and the snapshot says where it is', { skip }, async () => {
  const cutCap = m => {
    const T = m.game.__simTerrain, p = T.det().filter(b => b.planet && !b.fixed).sort((a, b) => b.rr - a.rr)[0];
    for (let k = -6; k <= 6; k++) T.carveAt(p, p.x + p.rr * 0.55, p.y + k * p.rr * 0.12, 26, true);
    T.carveAt(p, p.x + p.rr * 0.6, p.y, 60, true);
    return { T, p };
  };
  const a = await createMatch({ code: 'm1d0crub1' }), b = await createMatch({ code: 'm1d0crub1' });
  try {
    run(a, 0.1); run(b, 0.1);
    const A = cutCap(a), B = cutCap(b);
    run(a, 0.1); run(b, 0.1);
    const ka = [...A.T.rubble().map(r => r.key)];
    assert.ok(ka.length >= 1, 'a piece broke off');
    assert.deepEqual(ka, [...B.T.rubble().map(r => r.key)], 'the same names in both');
    const ra = A.T.rubble()[0];
    assert.ok((ra.x - A.p.x) * ra.vx > 0, 'flung away from the planet');
    let wire = null;
    for (let i = 0; i < 16 && !(wire && wire.list.some(e => e[0] === ra.key)); i++) wire = a.packet(clock.t + i).rb;
    assert.ok(wire && wire.list.some(e => e[0] === ra.key));
  } finally { a.dispose(); b.dispose(); }
});

test('a pilot that dies is back after the respawn time, at a spot away from its enemies', { skip }, async () => {
  const m = await createMatch({ code: 'm1d0c', bots: 6, level: 'easy' });
  try {
    run(m, 1);
    const G = m.game, [victim, ...rest] = G.__simBots();
    for (const b of rest) Object.assign(b, { x: 300, y: 300, vx: 0, vy: 0, fireCd: 1e9 });   // every enemy in one corner
    run(m, 0.1);
    G.__simHurt(victim.id, 99);
    assert.equal(victim.dead, true);
    run(m, G.__simConst.RESPAWN_MS / 1000 - 0.3);
    assert.equal(victim.dead, true, 'still waiting');
    run(m, 0.6);
    assert.equal(victim.dead, false, 'back in');
    const near = Math.min(...rest.map(b => Math.hypot(b.x - victim.x, b.y - victim.y)));
    assert.ok(near > 1200, `born ${Math.round(near)} px from the nearest enemy`);
  } finally { m.dispose(); }
});

test('King of the Hill: a pilot alone on the hill scores a hold every 5 s; with an enemy on it too, nobody does', { skip }, async () => {
  const m = await createMatch({ code: 'm1h0o' });
  try {
    emptyField(m);
    const a = m.addPilot('A'), b = m.addPilot('B'); run(m, 0.1);
    const A = m.game.__simBot(a), B = m.game.__simBot(b), q = m.game.__simQuad() || { x: 0, y: 0 };
    run(m, 11, () => { hold(m, a, q.x, q.y); hold(m, b, q.x + 1500, q.y); });
    assert.equal(A.caps, 2, 'two holds in 11 s alone'); assert.equal(B.caps || 0, 0);
    run(m, 6, () => { hold(m, a, q.x, q.y); hold(m, b, q.x + 60, q.y); });
    assert.equal(A.caps, 2, 'a fight on the hill scores nothing'); assert.equal(B.caps || 0, 0);
  } finally { m.dispose(); }
});

test('Last Bin Standing: the fallen wait while two still fly; the last one left wins the heat and the fallen come back', { skip }, async () => {
  const m = await createMatch({ code: 'm1l0o' });
  try {
    emptyField(m);
    const ids = ['A', 'B', 'C'].map(n => m.addPilot(n)); run(m, 0.5);
    const [A, B, C] = ids.map(id => m.game.__simBot(id)), apart = () => ids.forEach((id, i) => hold(m, id, 600 + i * 900, 600));
    m.game.__simHurt(ids[1], 99); run(m, 4, apart);
    assert.equal(B.dead, true, 'still out: two fly on');
    m.game.__simHurt(ids[2], 99); run(m, 0.2, apart);
    assert.equal(A.caps, 1, 'A, the last one left, wins the heat');
    run(m, 3, apart);
    assert.equal(B.dead || C.dead, false, 'the fallen are back for the next heat');
  } finally { m.dispose(); }
});

test('Juggernaut: the Quad makes its taker the Juggernaut until it dies, worth a point every 5 s; no other Quad comes meanwhile', { skip }, async () => {
  const m = await createMatch({ code: 'm1j0o' });
  try {
    emptyField(m);
    const a = m.addPilot('A'), b = m.addPilot('B'); run(m, 0.2);
    const A = m.game.__simBot(a), q = m.game.__simQuad();
    assert.ok(q, 'the Quad is on its spot');
    run(m, 0.3, () => { hold(m, a, q.x, q.y); hold(m, b, q.x + 1500, q.y); });
    run(m, 30, () => { hold(m, a, q.x + 600, q.y); hold(m, b, q.x + 1500, q.y); });
    assert.ok(A.ampUntil > performance.now() + 1e8, 'the Quad lasts until death');
    assert.equal(A.caps, 6, 'a point every 5 s');
    assert.equal(m.game.__simQuad(), null, 'no other Quad while the Juggernaut lives');
    m.game.__simHurt(a, 99); run(m, 0.2);
    assert.ok(!(A.ampUntil > performance.now()), 'gone with its death');
  } finally { m.dispose(); }
});

test('an emote a player makes goes out with their pilot\'s state, for everyone to see, then is gone', { skip }, async () => {
  const m = await createMatch({ code: 'm1d0o' });
  try {
    const a = m.addPilot('A'); m.addPilot('B'); run(m, 0.2);
    m.input(a, { em: [1, 0] }); run(m, 0.1);
    const entry = () => m.packet(clock.t).bots.find(e => e[0] === a)[1];
    assert.deepEqual([...entry().em], [1, 0], 'GG, for all to see');   // (a copy: the game's arrays are of its own realm)
    run(m, 2);
    assert.equal(entry().em, undefined, 'and gone after a moment');
  } finally { m.dispose(); }
});

test('the profile adds up every round played, and its earned looks open at their counts (a locked one is never worn)', { skip }, async () => {
  const g = await loadGame();
  try {
    const r = g.get(`(() => {
      for (const k of ["rounds", "wins", "kills", "deaths", "best"]) profile[k] = 0;
      const before = { crown: !!lockedBy("hat", "crown"), gold: !!lockedBy("flame", "gold") };
      Object.assign(stats, { kills: 30, deaths: 4, best: 9 }); recordRound(true);
      const worn = freeLook(CUSTOM_KEYS.map(k => CUSTOM[k].items.length - 1));   // the last of each list: crown, trophy, gold
      return { before, profile: { ...profile }, gold: !!lockedBy("flame", "gold"), crown: !!lockedBy("hat", "crown"), hat: worn[CUSTOM_KEYS.indexOf("hat")], flame: worn[CUSTOM_KEYS.indexOf("flame")] };
    })()`);
    assert.deepEqual(r.before, { crown: true, gold: true });
    assert.deepEqual(r.profile, { rounds: 1, wins: 1, kills: 30, deaths: 4, best: 9 });
    assert.equal(r.gold, false, 'gold fire: 25 kills'); assert.equal(r.crown, true, 'the crown wants 100');
    assert.equal(r.hat, 0, 'a locked crown is not worn'); assert.ok(r.flame > 0, 'the earned gold fire is');
  } finally { g.dispose(); }
});

test('a player on the server flies the look they chose (everyone sees their bin, not a random one)', { skip }, async () => {
  const m = await createMatch({ code: 'm1d0o' });
  try {
    const a = m.addPilot('A', { ck: [1, 2, 3, 0, 4, 5, 1], hue: 77 }); run(m, 0.1);
    assert.deepEqual([...m.game.__simBot(a).ck], [1, 2, 3, 0, 4, 5, 1]);
    assert.equal(m.game.__simBot(a).hue, 77);
  } finally { m.dispose(); }
});

test('a drum on a station goes up when it breaks, and hurts whoever is near it', { skip }, async () => {
  const m = await createMatch({ code: 'm1d0k' });
  try {
    const a = m.addPilot('A'); run(m, 0.2);
    const A = m.game.__simBot(a), drum = m.game.__simTerrain.rubble().find(b => b.prop && b.kind === 'drum' && !b.dead);
    assert.ok(drum, 'Cargo Deck has drums');
    const near = () => hold(m, a, drum.x + 110, drum.y), before = A.lives;
    run(m, 0.2, near);
    for (let i = 0; i < 12 && !drum.dead; i++) { m.game.__simTerrain.carveAt(drum, drum.x + (i % 3 - 1) * 12, drum.y + (Math.floor(i / 3) % 3 - 1) * 12, 24, true); run(m, 0.2, near); }
    assert.ok(drum.dead, 'broken');
    assert.ok(A.lives < before, `hurt by the blast: ${before} -> ${A.lives}`);
  } finally { m.dispose(); }
});

test('a station\'s crates are loose: a pilot flying into one shoves it, and it scrapes to a stop', { skip }, async () => {
  const m = await createMatch({ code: 'm1d0k' });
  try {
    const a = m.addPilot('A'); run(m, 0.2);
    const A = m.game.__simBot(a), crate = m.game.__simTerrain.rubble().find(b => b.prop && b.kind === 'crate' && !b.dead);
    const x0 = crate.x, y0 = crate.y;
    Object.assign(A, { x: crate.x - 160, y: crate.y, vx: 700, vy: 0, inv: 0 });
    run(m, 0.6);
    const moved = Math.hypot(crate.x - x0, crate.y - y0);
    assert.ok(moved > 15, 'shoved ' + Math.round(moved) + ' px');
    run(m, 4);
    assert.ok(Math.hypot(crate.vx, crate.vy) < 5, 'and at rest again');
  } finally { m.dispose(); }
});
