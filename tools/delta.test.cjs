// Binary snapshot deltas (src/js/12d-delta.js, server/delta.mjs): exact round trips, and a real match streamed to a
// player that loses messages and confirms late still rebuilds every snapshot it receives exactly as sent.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');

const load = () => import('../server/delta.mjs');
const json = v => JSON.parse(JSON.stringify(v));

test('the codec writes and reads back numbers, strings and nesting exactly', async () => {
  const { SNAP_DELTA: D } = await load();
  const values = [0, 1, -1, 127, 128, -129, 2 ** 31, -(2 ** 40), Number.MAX_SAFE_INTEGER, 1.25, -0.07, 3.14, 1e-7, 123456.789, 1 / 3, -2.5e300,
    '', 'x', 'Bin-42', 'ünïcødé 🚀', null, true, false, [], {}, [1, [2, [3, { a: 'b' }]]], { q: 5, bots: [['pb1', { x: 10, y: -20, a: 1.57 }]] }];
  for (const v of values) {
    const f = D.unframe(D.frame(7, 0, v));
    assert.equal(f.q, 7); assert.equal(f.base, 0);
    assert.ok(Object.is(f.d, v) || JSON.stringify(f.d) === JSON.stringify(v), 'round trip of ' + JSON.stringify(v));
  }
  assert.throws(() => D.unframe(new Uint8Array([0xb5, 1, 3, 0, 10, 200])));   // a count running past the end
  assert.throws(() => D.unframe(new Uint8Array([1, 2, 3])));                  // not a snapshot
});

test('a delta turns one snapshot into the next, and leaves the first as it was', async () => {
  const { SNAP_DELTA: D } = await load();
  const a = { q: 1, ts: 1000, bots: [['pb1', { x: 1, y: 2, n: 'A', f: [[1, 2]] }], ['pb2', { x: 5, y: 6 }]], g: ['k1'], mc: [1, 2, 3] };
  const b = { q: 2, ts: 1033, bots: [['pb1', { x: 4, y: 2, n: 'A' }], ['pb2', { x: 5, y: 6, d: 1 }]], g: ['k1', 'k2'], rb: { all: false, list: [] } };
  const before = JSON.stringify(a);
  const f = D.unframe(D.frame(2, 1, D.diff(a, b)));
  assert.deepEqual(D.patch(a, f.d), b);
  assert.equal(JSON.stringify(a), before);
  assert.equal(D.diff(b, b), D.SAME);
  // a player joining makes the list longer: the whole list is sent
  const c = { ...b, bots: [...b.bots, ['pb3', { x: 0, y: 0 }]] };
  assert.deepEqual(D.patch(b, D.unframe(D.frame(3, 2, D.diff(b, c))).d), c);
});

test('a real match streamed with losses and late confirmations is rebuilt exactly, in far fewer bytes', async () => {
  const { SNAP_DELTA: D, deltaStream, deltaFrame, ackSnapshot } = await load();
  const { createMatch } = await import('../server/sim/sim.mjs');
  const m = createMatch({ code: 'l1d0cdlt', bots: 16, level: 'hard' });
  try {
    const me = m.addPilot('Watcher');
    const st = deltaStream(), held = new Map();
    let clock = 1e6, q = 0, jsonBytes = 0, deltaBytes = 0, got = 0, rnd = 1;
    const random = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 300; i++) {
      clock += 1000 / 30; m.step(1 / 30, clock);
      const plain = json({ t: 'snap', ...m.packet(clock) });
      const bytes = deltaFrame(st, plain, me);
      jsonBytes += zlib.deflateRawSync(JSON.stringify(plain)).length; deltaBytes += zlib.deflateRawSync(bytes).length;
      if (random() < 0.2) continue;   // lost on the way
      const f = D.unframe(bytes);
      if (f.base && !held.has(f.base)) continue;
      const full = f.base ? D.patch(held.get(f.base), f.d) : f.d;
      assert.deepEqual(full, st.sent.get(f.q), 'snapshot ' + f.q + ' rebuilt as sent');
      held.set(f.q, full); q = f.q; got++;
      for (const k of held.keys()) if (k < q - 64) held.delete(k);
      if (random() < 0.3) ackSnapshot(st, q);   // the confirmation goes out with the next controls, now and then
      // what the player sees of itself and of the pilots near it is this very moment's
      const mine = full.bots.find(e => e[0] === me)[1], now = plain.bots.find(e => e[0] === me)[1];
      for (const k of Object.keys(now)) assert.deepEqual(mine[k], now[k], 'my own ' + k);   // (names and looks carried on besides)
    }
    assert.ok(got > 200, got + ' snapshots rebuilt');
    console.log(`300 snapshots, 16 bots: JSON+deflate ${(jsonBytes / 300) | 0} B each, binary delta+deflate ${(deltaBytes / 300) | 0} B each`);
    assert.ok(deltaBytes < jsonBytes * 0.6, `delta ${deltaBytes} vs json ${jsonBytes}`);
  } finally { m.dispose(); }
});
