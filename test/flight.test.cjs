// Flight: a player's pilot on the server is moved by nothing but their numbered commands, flown against the clock by
// the same function their screen flies them with, so the screen's prediction is the server's flight to the digit.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { skip, createMatch, loadGame } = require('./helpers/game.cjs');
const { clock, run, emptyField, wire } = require('./helpers/match.cjs');

const cmd = (s, mx, my, aim, boost, brake, dash) => [s, Math.round(mx * 1000), Math.round(my * 1000), Math.round(aim * 1000), (boost ? 1 : 0) | (brake ? 2 : 0), dash];
const asCommand = e => ({ s: e[0], mx: e[1] / 1000, my: e[2] / 1000, aim: e[3] / 1000, boost: !!(e[4] & 1), brake: !!(e[4] & 2), dash: e[5] });

test('what a player sends is clamped to what a stick, an angle and buttons can say', { skip }, async () => {
  const { cleanInput } = await import('../server/sim/sim.mjs');
  const i = cleanInput({ mx: 9, my: 9, aim: 7, fire: 'yes', boost: true, dash: -3 });
  assert.ok(Math.abs(i.mx - Math.SQRT1_2) < 1e-12 && Math.abs(i.my - Math.SQRT1_2) < 1e-12, 'a stick never goes past its rim');
  assert.ok(Math.abs(i.aim - (7 - 2 * Math.PI)) < 1e-12, 'an angle is wrapped');
  assert.deepEqual({ fire: i.fire, boost: i.boost, dash: i.dash }, { fire: false, boost: true, dash: 0 });
  assert.deepEqual(cleanInput({ mx: NaN, aim: Infinity, dash: 2.5, w: 99, alt: 1, c: [[1, 2], 'x', [0, 0, 0, 0, 0, 0]] }),
    { mx: 0, my: 0, aim: 0, fire: false, alt: false, boost: false, brake: false, dash: 0, w: -1, s: 0, em: null, gx: 0, gy: 0, gb: 0, c: [], ld: -1 });
});

test('the server\'s state after any command, flown on with the commands after it, is exactly its state after the last', { skip }, async () => {
  const m = await createMatch({ code: 'm1d0o' });
  emptyField(m);
  try {
    const id = m.addPilot('Pilot'), cmds = [];
    run(m, 0.1);
    Object.assign(m.game.__simBot(id), { x: 1300, y: 1300, vx: 0, vy: 0 });
    for (let s = 1; s <= 240; s++) { const a = s / 30; cmds.push(cmd(s, Math.cos(a), Math.sin(a * 0.7), Math.sin(a), s % 90 < 30, s % 70 > 60, s > 100 ? (s > 180 ? 2 : 1) : 0)); }
    const seen = {};
    for (let s = 1; s <= 240; s++) {
      m.input(id, { c: cmds.slice(Math.max(0, s - 4), s) });   // four at a time, as a page sends them
      clock.t += 1000 / 60; m.step(1 / 60, clock.t);
      const me = wire(m, id);
      if (s === 120) Object.assign(seen, { ak: me.ak, mv: me.mv });
      if (s === 240) Object.assign(seen, { endAk: me.ak, endMv: me.mv });
    }
    assert.equal(seen.endAk, 240, 'every command flown once');
    const M = m.game.__simMove, o = { inv: 0 };
    M.setMoveState(o, seen.mv);
    for (const e of cmds) if (e[0] > seen.ak) M.pilotMove(o, asCommand(e));
    const end = M.moveState(o);
    for (let i = 0; i < end.length; i++) assert.ok(Math.abs(end[i] - seen.endMv[i]) < 0.05, `state ${i}: replayed ${end[i]}, server ${seen.endMv[i]}`);
  } finally { m.dispose(); }
});

test('crashing about a station, nothing but its commands moves a player\'s pilot', { skip }, async () => {
  const m = await createMatch({ code: 'm1x0kchk' });   // Cargo Deck: walls and props to bump into
  try {
    const id = m.addPilot('P'), b = m.game.__simBot(id), M = m.game.__simMove, shadow = { inv: 0 };
    const step = () => { clock.t += 1000 / 60; m.step(1 / 60, clock.t); };
    for (let i = 0; i < 10; i++) step();
    let compared = 0;
    for (let s = 1; s <= 1500; s++) {
      const a = s / 40, c = cmd(s, Math.cos(a), Math.sin(a * 0.73), Math.sin(a * 1.3) * 3, s % 120 < 40, s % 97 > 90, Math.floor(s / 300));
      const before = M.moveState(b);
      m.input(id, { c: [c] }); step();
      if (b.cmdAck !== s || b.dead) continue;
      M.setMoveState(shadow, before); M.pilotMove(shadow, asCommand(c));
      assert.ok(Math.hypot(shadow.x - b.x, shadow.y - b.y) < 0.01 && Math.hypot(shadow.vx - b.vx, shadow.vy - b.vy) < 0.01, `command ${s}: the server moved it otherwise`);
      compared++;
    }
    assert.ok(compared > 1000, compared + ' commands compared');
  } finally { m.dispose(); }
});

test('commands are flown against the clock: sent faster than time they gain nothing; when they stop, the pilot flies on', { skip }, async () => {
  const m = await createMatch({ code: 'm1d0o' });
  emptyField(m);
  try {
    const id = m.addPilot('Pilot'), b = m.game.__simBot(id);
    run(m, 0.1);
    Object.assign(b, { x: 600, y: 1300, vx: 0, vy: 0 });
    let s = 0; const step = () => { clock.t += 1000 / 60; m.step(1 / 60, clock.t); };
    for (let k = 0; k < 60; k++) { const c = []; for (let j = 0; j < 4; j++) c.push(cmd(++s, 1, 0, 0, false, false, 0)); m.input(id, { c }); step(); }
    assert.ok(b.mt <= 1.12, `a second flew ${(b.mt * 60).toFixed(0)} commands' worth, not 240`);
    for (let k = 0; k < 40; k++) m.input(id, { c: [] });
    const x0 = b.x;
    for (let k = 0; k < 30; k++) step();
    assert.ok(b.x - x0 > 100, `flew on ${Math.round(b.x - x0)} px with no commands`);
  } finally { m.dispose(); }
});

test('a bin meeting a junk rock: momentum is shared and nothing is gained; the rocks drift by the shared clock alike in every game', { skip }, async () => {
  const g = await loadGame(), h = await loadGame();
  try {
    const r = g.get(`(() => {
      const k = { slot: 0, gen: 0, x: 1000, y: 1000, vx: 0, vy: 0, r: 30 }, p = { x: 1000 - 30 - 25, y: 1000, vx: 300, vy: 0 };
      collideRock(p, k);
      return { sum: p.vx + k.vx, e0: 300 * 300, e1: p.vx * p.vx + k.vx * k.vx, rockMoves: k.vx > 0 };
    })()`);
    assert.ok(Math.abs(r.sum - 300) < 1e-6, 'momentum is kept');
    assert.ok(r.e1 <= r.e0, 'no energy is made'); assert.ok(r.rockMoves);
    const rocks = x => x.get(`(() => { const out = []; for (const t of [5e5, 9e6]) for (let i = 0; i < ROCKS; i++) { const k = rock(i, t), a = rockAt(i, t); out.push(k.x, k.y, a[0], a[1]); } return out; })()`);
    const a = rocks(g), b = rocks(h);
    assert.ok(a.length > 0);
    assert.deepEqual(a, b, 'two games see every rock in the same place');
    for (let i = 0; i < a.length; i += 4) assert.ok(a[i] === a[i + 2] && a[i + 1] === a[i + 3], 'a quick look at a rock finds it where it is');
  } finally { g.dispose(); h.dispose(); }
});
