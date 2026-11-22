const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { legacy } = require('./lib/source.cjs');
const read = legacy;
function match() {
  let now = 1800000000000;
  const c = { clockNow: () => now, ROUND_PLAY: 300, ROUND_BREAK: 15, ROUND_LEN: 315 };
  const src = read('01-config.js');
  vm.createContext(c);
  vm.runInContext(src.slice(src.indexOf('  let matchStart'), src.indexOf('  // armour')) + '\nglobalThis.state=()=>[matchRound,matchStart,matchEnd];', c);
  return { c, time: n => { now = n; }, start: now };
}
test('a new match has a full duration at any wall-clock phase and 15 seconds of results', () => {
  const { c, start } = match();
  c.startMatch(start);
  assert.equal(c.roundAt(start).left, 300);
  assert.equal(c.roundAt(start + 299001).live, true);
  assert.equal(Math.ceil(c.roundAt(start + 299001).left), 1);
  assert.equal(c.roundAt(start + 300000).live, false);
  assert.equal(c.roundAt(start + 300000).next, 15);
  const next = c.roundAt(start + 315000);
  assert.equal(next.idx, 1); assert.equal(next.left, 300);
});
test('score limit shortens the round, synchronizes to guests and never extends an ended round', () => {
  const host = match(), guest = match(), { c, start } = host;
  c.startMatch(start);
  c.receiveMatchClock([0, start, start + 90000]);
  guest.c.receiveMatchClock(Array.from(c.state()));
  assert.equal(guest.c.roundAt(start + 90000).next, 15);
  c.receiveMatchClock([0, start, 0]);
  assert.equal(c.roundAt(start + 91000).live, false);
  assert.equal(c.roundAt(start + 105000).idx, 1);
  assert.equal(guest.c.roundAt(start + 105000).left, 300);
  c.receiveMatchClock([0, start, start + 90000]);
  assert.equal(c.roundAt(start + 105000).idx, 1);
});
test('late joins and reconnects adopt the running clock; malformed clocks are ignored', () => {
  const { c, start } = match();
  for (const clock of [null, [], [0, start, -1], [-1, start, 0], [0, Infinity, 0], [0, start, start + 999000]]) c.receiveMatchClock(clock);
  assert.equal(c.roundAt(start).idx, -1);
  c.receiveMatchClock([3, start - 60000, 0]);
  assert.equal(c.roundAt(start).left, 240);
  assert.equal(c.roundAt(start).idx, 3);
  c.receiveMatchClock([2, start - 10000, 0]);
  assert.equal(c.roundAt(start).left, 240);
  assert.equal(c.roundAt(start + 1000000).idx, 6);
});

test('station corridors (Foundry, Cargo Deck) are connected, symmetric and routes stay in open cells', () => {
  for (const theme of ['f', 'k', 'h', 'v']) {
    const c = { W: 4200, H: 4200, worldCode: 'm0' + theme, mapThemeOf: code => code.slice(-1), clamp: (x, a, b) => Math.max(a, Math.min(b, x)), performance }; c.solidAny = (x, y) => c.foundryOpen(Math.floor(x / 200), Math.floor(y / 200)) ? null : {};   // (the walls as planned: none broken)
    vm.createContext(c); vm.runInContext(read('01c-foundry.js') + '\nglobalThis.foundryOpen=foundryOpen; globalThis.foundryPoint=foundryPoint; globalThis.foundryRoute=foundryRoute;', c);
    const open = [];
    for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
      assert.equal(c.foundryOpen(x, y), c.foundryOpen(20 - x, 20 - y), theme + ' symmetric at ' + x + ',' + y);
      if (c.foundryOpen(x, y)) open.push([x, y]);
    }
    assert.ok(open.length > 150, theme + ': ' + open.length + ' open cells');
    for (const cell of open) {
      const route = c.foundryRoute(c.foundryPoint(...cell), c.foundryPoint(10, 10));
      assert.ok(route, theme + ': connected cell ' + cell);
      assert.ok(c.foundryOpen(Math.floor(route.x / 200), Math.floor(route.y / 200)));
    }
  }
});

test('all local bots appear once with current scores, even between network snapshots', () => {
  const c = { me: { name: 'You', score: 10 }, stats: { round: 1, kills: 2 }, myPing: 0,
    bots: [{ id: 'pb1', name: 'Bot', st: { kills: 4, deaths: 2 }, caps: 3 }], botById: new Map([['pb1', {}]]),
    remotes: new Map([['pb1', { name: 'Bot', st: [1, 1, 0, 0, 0, 0] }], ['p2', { name: 'Old round', st: [0, 100, 0, 0, 0, 0], score: 900 }]]) };
  const src = read('17-update.js'); vm.createContext(c);
  vm.runInContext(src.slice(src.indexOf('  function playerRows'), src.indexOf('  const esc =')), c);
  const rows = c.playerRows();
  assert.equal(rows.length, 3); assert.equal(rows[1].kills, 4); assert.equal(rows[1].caps, 3);
  assert.equal(rows[2].kills, 0); assert.equal(rows[2].score, 0);
});
