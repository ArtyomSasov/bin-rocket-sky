// A match: rounds on a clock everyone shares, a score limit that ends a round early, bots that fight, a room that
// makes way for players, and a snapshot that carries all of it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { skip, createMatch, loadGame } = require('./helpers/game.cjs');
const { clock, run } = require('./helpers/match.cjs');

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
