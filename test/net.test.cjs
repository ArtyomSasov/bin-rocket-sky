// The network: snapshots as binary deltas rebuilt exactly over a lossy link, and a page that takes whatever peers
// send without breaking, rolling back or showing anything twice.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { skip, loadGame, createMatch } = require('./helpers/game.cjs');

const delta = () => import('../server/delta.mjs');
const json = v => JSON.parse(JSON.stringify(v));

test('the snapshot codec writes and reads back numbers, strings and nesting exactly, and refuses what is not one', { skip }, async () => {
  const { SNAP_DELTA: D } = await delta();
  const values = [0, 1, -1, 127, 128, -129, 2 ** 31, -(2 ** 40), Number.MAX_SAFE_INTEGER, 1.25, -0.07, 3.14, 1e-7, 123456.789, 1 / 3, -2.5e300,
    '', 'x', 'Bin-42', 'ünïcødé 🚀', null, true, false, [], {}, [1, [2, [3, { a: 'b' }]]], { q: 5, bots: [['pb1', { x: 10, y: -20, a: 1.57 }]] }];
  for (const v of values) {
    const f = D.unframe(D.frame(7, 0, v));
    assert.equal(f.q, 7); assert.equal(f.base, 0);
    assert.ok(Object.is(f.d, v) || JSON.stringify(f.d) === JSON.stringify(v), 'round trip of ' + JSON.stringify(v));
  }
  assert.throws(() => D.unframe(new Uint8Array([0xb5, 1, 3, 0, 10, 200])), Error, 'a count running past the end');
  assert.throws(() => D.unframe(new Uint8Array([1, 2, 3])), Error, 'not a snapshot is refused');
  const a = { q: 1, bots: [['pb1', { x: 1, y: 2, n: 'A' }]], g: ['k1'] }, b = { q: 2, bots: [['pb1', { x: 4, y: 2 }], ['pb2', { x: 0, y: 0 }]], g: ['k1', 'k2'] };
  const before = JSON.stringify(a);
  assert.deepEqual(D.patch(a, D.unframe(D.frame(2, 1, D.diff(a, b))).d), b, 'a delta turns one snapshot into the next');
  assert.equal(JSON.stringify(a), before, 'and leaves the first as it was');
});

test('a real match streamed with losses and late confirmations is rebuilt exactly, in far fewer bytes than JSON', { skip }, async () => {
  const { SNAP_DELTA: D, deltaStream, deltaFrame, ackSnapshot } = await delta();
  const m = await createMatch({ code: 'l1d0cdlt', bots: 16, level: 'hard' });
  try {
    const me = m.addPilot('Watcher'), st = deltaStream(), held = new Map();
    let clock = 1e6, jsonBytes = 0, deltaBytes = 0, got = 0, rnd = 1;
    const random = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 300; i++) {
      clock += 1000 / 30; m.step(1 / 30, clock);
      const plain = json({ t: 'snap', ...m.packet(clock) }), bytes = deltaFrame(st, plain, me);
      jsonBytes += zlib.deflateRawSync(JSON.stringify(plain)).length; deltaBytes += zlib.deflateRawSync(bytes).length;
      if (random() < 0.2) continue;   // lost on the way
      const f = D.unframe(bytes);
      if (f.base && !held.has(f.base)) continue;
      const full = f.base ? D.patch(held.get(f.base), f.d) : f.d;
      assert.deepEqual(full, st.sent.get(f.q), 'snapshot ' + f.q + ' rebuilt as sent');
      held.set(f.q, full); got++;
      for (const k of held.keys()) if (k < f.q - 64) held.delete(k);
      if (random() < 0.3) ackSnapshot(st, f.q);   // confirmed now and then, as controls go out
      const mine = full.bots.find(e => e[0] === me)[1], now = plain.bots.find(e => e[0] === me)[1];
      for (const k of Object.keys(now)) assert.deepEqual(mine[k], now[k], 'my own ' + k + ' is this moment\'s');
    }
    assert.ok(got > 200, got + ' snapshots rebuilt');
    assert.ok(deltaBytes < jsonBytes * 0.6, `delta ${deltaBytes} B vs JSON ${jsonBytes} B`);
  } finally { m.dispose(); }
});

test('whatever a peer sends, the page neither breaks nor makes a pilot of it without a place', { skip }, async () => {
  const g = await loadGame();
  try {
    let rnd = 7;
    const random = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    const junk = d => {
      const r = random();
      if (d > 3 || r < 0.3) return [NaN, Infinity, -1, 1e308, '', 'x'.repeat(50), null, true, 0, 3.5, '__proto__', 'constructor'][Math.floor(random() * 12)];
      if (r < 0.6) return Array.from({ length: Math.floor(random() * 6) }, () => junk(d + 1));
      const o = {};
      for (const k of ['q', 'x', 'y', 'vx', 'vy', 'a', 'd', 'ds', 'dk', 'n', 'ck', 'h', 'f', 'hb', 'ko', 'bots', 'mc', 'rd', 'ts', 'tm', 'fc', 'g', 'cv', 'terrain', 'dr', 'wd', 'st', 'bw', 'lv', 'wp']) if (random() < 0.3) o[k] = junk(d + 1);
      return o;
    };
    g.ev('globalThis.__junk = []');
    for (let i = 0; i < 400; i++) g.ctx.__junk.push(junk(0));
    const r = g.get(`(() => { let thrown = null; for (const p of __junk) try { receiveState("pz", p); applyRemote("pz", p); } catch (e) { thrown = String(e && e.stack || e); break; }
      return { thrown, placed: !remotes.has("pz") || Number.isFinite(remotes.get("pz").x) }; })()`);
    assert.equal(r.thrown, null);
    assert.ok(r.placed, 'a pilot appears only where it says it is');
  } finally { g.dispose(); }
});

test('an older state arriving late never rolls a pilot back, and a shot sent twice is shown once', { skip }, async () => {
  const g = await loadGame();
  try {
    const r = g.get(`(() => {
      const now = Date.now();
      applyRemote("pa", { q: 5, x: 1000, y: 1000, a: 0, ts: now, rd: stats.round, tg: "ta" });
      applyRemote("pa", { q: 4, x: 3000, y: 3000, a: 0, ts: now - 50, rd: stats.round });
      const r = remotes.get("pa"), at = [Math.round(r.tx), Math.round(r.ty)];
      const f = ["ta.1", 1000, 1000, 300, 0, K.ROCKET, 1, 0, 0, now];
      const n0 = shots.length; addRemoteShot("pa", f, now); addRemoteShot("pa", f, now); addRemoteShot("pa", [...f], now);
      return { at, added: shots.length - n0 }; })()`);
    assert.ok(Math.abs(r.at[0] - 1000) < 200 && Math.abs(r.at[1] - 1000) < 200, 'kept the newer state: ' + r.at);
    assert.equal(r.added, 1, 'one rocket, however often it is told');
  } finally { g.dispose(); }
});

test('a link cannot send players to another game server; only one on this machine is taken, for development', { skip }, async () => {
  const g = await loadGame();
  try {
    const pick = (search, configured) => g.get(`chooseServer(${JSON.stringify(search)}, ${JSON.stringify(configured)})`);
    const ours = pick('', undefined);
    assert.match(ours, /^wss:\/\//);
    assert.equal(pick('?server=wss://evil.example:443', undefined), ours, 'a link\'s server is ignored');
    assert.equal(pick('?server=ws://localhost:8080', undefined), 'ws://localhost:8080', 'a server on this machine is taken');
    assert.equal(pick('', 'wss://game.example.org'), 'wss://game.example.org', 'the page\'s own setting is taken');
    assert.equal(pick('', 'ws://plain.example.org'), '', 'never an unencrypted remote server');
  } finally { g.dispose(); }
});
