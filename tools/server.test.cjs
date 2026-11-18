// The authoritative server end to end: real WebSocket connections to server/index.mjs on a free port.
// Needs the server's dependencies: cd server && npm ci
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ready = fs.existsSync(path.join(__dirname, '../server/node_modules/ws'));
const skip = ready ? false : 'server dependencies are not installed (cd server && npm ci)';
let srv, port, WebSocket, D;
before(async () => {
  if (!ready) return;
  Object.assign(process.env, { PORT: '0', MAX_ROOMS: '4', BRS_NO_SIGNALS: '1', ORIGINS: 'https://artyomsasov.github.io', RTC_PORT: '18446', AFK_MS: '1500', ROOMS_PER_IP: '2', WAIT_MAX: '4' });
  srv = await import('../server/index.mjs'); port = await srv.listening;
  WebSocket = require('../server/node_modules/ws');
  D = (await import('../server/delta.mjs')).SNAP_DELTA;
});
after(async () => { if (srv) await srv.stop(); });

// a client that keeps every message it receives and can wait for one that matches
function client(headers) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers }), got = [], waiters = [];
  // a binary snapshot is a delta: rebuilt from the one it builds on, and confirmed back (as the game's page does)
  const held = new Map(); ws.binaryFrames = 0;
  ws.on('message', (d, binary) => {
    let m;
    if (binary) {
      const f = D.unframe(new Uint8Array(d));
      if (f.base && !held.has(f.base)) return;
      m = f.base ? D.patch(held.get(f.base), f.d) : f.d; held.set(f.q, m); ws.binaryFrames++;
      ws.send(JSON.stringify({ t: 'sa', q: f.q }));
    } else m = JSON.parse(d);
    got.push(m); for (const w of [...waiters]) if (w.f(m)) { waiters.splice(waiters.indexOf(w), 1); w.r(m); }
  });
  ws.next = (f, ms = 5000) => new Promise((r, j) => { const old = got.find(f); if (old) return r(old); const w = { f, r }; waiters.push(w); setTimeout(() => j(new Error('timeout')), ms); });
  ws.sendJ = m => ws.send(JSON.stringify(m));
  ws.opened = new Promise((r, j) => { ws.on('open', r); ws.on('error', j); ws.on('unexpected-response', (_, res) => j(new Error('HTTP ' + res.statusCode))); });
  ws.got = got;
  return ws;
}

test('a player joins a room, gets snapshots, and flies by the input it sends', { skip }, async () => {
  const ws = client(); await ws.opened;
  ws.sendJ({ t: 'join', code: 'm1d0otest', name: 'Tester', bots: 2 });
  const hi = await ws.next(m => m.t === 'welcome');
  assert.equal(hi.code, 'm1d0otest'); assert.equal(hi.sendHz, 30);
  const me = s => s.bots.find(([id]) => id === hi.id)?.[1];
  const first = await ws.next(m => m.t === 'snap' && me(m)?.x !== undefined);
  assert.equal(first.bots.length, 3, 'the player and two bots');
  // hold the stick right for a second: the server moves the pilot
  const timer = setInterval(() => ws.sendJ({ t: 'in', mx: 1, my: 0, aim: 0 }), 33);
  await new Promise(r => setTimeout(r, 1200)); clearInterval(timer);
  // (it may meet a moon or the fence on the way, so its top speed to the right is what shows the stick worked)
  const fastest = Math.max(...ws.got.filter(m => m.t === 'snap' && me(m)?.vx !== undefined).map(m => me(m).vx));
  assert.ok(fastest > 300, `flew right at up to ${fastest} px/s`);
  ws.sendJ({ t: 'ping', c: 42 });
  const pong = await ws.next(m => m.t === 'pong');
  assert.equal(pong.c, 42); assert.ok(Math.abs(pong.s - Date.now()) < 1000);
  ws.close();
});

test('a page that asks for binary deltas gets them, rebuilds every snapshot and flies by its input', { skip }, async () => {
  const ws = client(); await ws.opened;
  ws.sendJ({ t: 'join', code: 'm1d0otest', name: 'Binary', bots: 2, bin: 1 });
  const hi = await ws.next(m => m.t === 'welcome');
  const me = s => s.bots.find(([id]) => id === hi.id)?.[1];
  const first = await ws.next(m => m.t === 'snap' && me(m)?.x !== undefined);
  assert.equal(first.bots.length, 3, 'the player and two bots');
  const timer = setInterval(() => ws.sendJ({ t: 'in', mx: 1, my: 0, aim: 0 }), 33);
  await new Promise(r => setTimeout(r, 1200)); clearInterval(timer);
  const snaps = ws.got.filter(m => m.t === 'snap');
  assert.ok(ws.binaryFrames >= 25 && snaps.length === ws.binaryFrames, `${ws.binaryFrames} binary snapshots, ${snaps.length} rebuilt`);
  assert.ok(snaps.every((m, i) => !i || m.q > snaps[i - 1].q), 'in order');
  const fastest = Math.max(...snaps.filter(m => me(m)?.vx !== undefined).map(m => me(m).vx));
  assert.ok(fastest > 300, `flew right at up to ${fastest} px/s`);
  const named = snaps.findIndex(m => me(m)?.n === 'Binary');
  assert.ok(named >= 0 && snaps.slice(named).every(m => me(m)?.n === 'Binary'), 'once sent, the name is carried on in every snapshot');
  ws.close();
});

test('a page that can gets a WebRTC data channel: snapshots come by it, and its controls go by it', { skip }, async () => {
  const nd = require('../server/node_modules/node-datachannel');
  const ws = client(); await ws.opened;
  ws.sendJ({ t: 'join', code: 'm1d0otest', name: 'Channel', bin: 1, rtc: 1 });
  const hi = await ws.next(m => m.t === 'welcome');
  const offer = await ws.next(m => m.t === 'rtc');
  const pc = new nd.PeerConnection('test', { iceServers: [] });
  let dcSnaps = 0, dc = null;
  globalThis.__rtcKeep = { pc };   // (the native connection closes if it is collected mid-test)
  // what comes by the channel is rebuilt with the rest (deltas build on snapshots from either way), as on the page
  pc.onDataChannel(ch => { dc = globalThis.__rtcKeep.dc = ch; ch.onMessage(msg => {
    dcSnaps++; ws.emit('message', Buffer.from(msg), true);
    ch.sendMessage(JSON.stringify({ t: 'in', mx: 1, my: 0, aim: 0, s: dcSnaps }));   // controls by the channel
  }); });
  pc.onGatheringStateChange(st => { if (st === 'complete') ws.sendJ({ t: 'rtc', sdp: pc.localDescription().sdp }); });
  pc.setRemoteDescription(offer.sdp, 'offer');
  await new Promise(r => setTimeout(r, 2000));
  try {
    const snaps = ws.got.filter(m => m.t === 'snap');
    assert.ok(dcSnaps > 20, `${dcSnaps} snapshots by the data channel (${snaps.length} in all)`);
    // (it may meet the fence on the way: its top speed to the right shows the controls came through)
    const fastest = Math.max(...snaps.map(m => m.bots.find(([id]) => id === hi.id)?.[1]?.vx).filter(Number.isFinite));
    assert.ok(fastest > 300, 'flew right by the controls sent on the channel, at up to ' + fastest + ' px/s');
  } finally { try { dc?.close(); } catch {} pc.close(); ws.close(); delete globalThis.__rtcKeep; }
});

test('a second player in the same room sees the first one; leaving takes the pilot away', { skip }, async () => {
  const a = client(), b = client(); await a.opened; await b.opened;
  a.sendJ({ t: 'join', code: 'm1d0opair', name: 'A' }); const ha = await a.next(m => m.t === 'welcome');
  b.sendJ({ t: 'join', code: 'm1d0opair', name: 'B' }); const hb = await b.next(m => m.t === 'welcome');
  await b.next(m => m.t === 'snap' && m.bots.some(([id]) => id === ha.id));
  a.close();
  await b.next(m => m.t === 'snap' && !m.bots.some(([id]) => id === ha.id) && m.bots.some(([id]) => id === hb.id));
  b.close();
});

test('the server refuses another site’s page, a bad code and too many rooms from one address', { skip }, async () => {
  await assert.rejects(client({ Origin: 'https://evil.example' }).opened, /HTTP 401/);
  const bad = client(); await bad.opened; bad.sendJ({ t: 'join', code: '../x' });
  assert.equal((await bad.next(m => m.t === 'error')).reason, 'bad code');
  // the first two tests opened two rooms from this address (they stay open a minute): a third is refused
  const extra = client(); await extra.opened; extra.sendJ({ t: 'join', code: 'm1d0othird' });
  assert.equal((await extra.next(m => m.t === 'error')).reason, 'you already have a room');
});

test('/health shows counts, never room codes, and no cross-site access', { skip }, async () => {
  const res = await fetch(`http://127.0.0.1:${port}/health`), body = await res.text();
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.ok(!/m1d0o/.test(body), body);
  const h = JSON.parse(body); assert.ok(Number.isInteger(h.rooms) && Number.isInteger(h.players));
});

test('a player who sends no controls is let go; one who keeps playing stays', { skip }, async () => {
  const idle = client(), busy = client(); await idle.opened; await busy.opened;
  idle.sendJ({ t: 'join', code: 'm1d0opair', name: 'Idle' }); busy.sendJ({ t: 'join', code: 'm1d0opair', name: 'Busy' });
  await idle.next(m => m.t === 'welcome'); await busy.next(m => m.t === 'welcome');
  const keep = setInterval(() => busy.sendJ({ t: 'in', mx: 0, my: 0, aim: 0 }), 200);
  const closed = new Promise(r => idle.on('close', code => r(code)));
  assert.equal(await closed, 4000);
  assert.equal(busy.readyState, 1);
  clearInterval(keep); busy.close();
});

test('a socket error ends that connection only; the server keeps serving', { skip }, async () => {
  const net = require('node:net');
  // a raw client that completes the handshake, then sends a frame the protocol forbids (an unmasked one)
  await new Promise(resolve => {
    const s = net.connect(port, '127.0.0.1', () => s.write('GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n'));
    s.once('data', () => { s.write(Buffer.from([0x81, 0x02, 0x68, 0x69])); });
    s.on('close', resolve); s.on('error', resolve);
  });
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(res.status, 200);
});

test('the room list shows public rooms with players in them, never a room opened by code alone', { skip }, async () => {
  // the first test's room was opened without pub: it is not listed even with a player in it
  const ws = client(); await ws.opened;
  ws.sendJ({ t: 'join', code: 'm1d0otest', name: 'Hidden' }); await ws.next(m => m.t === 'welcome');
  await new Promise(r => setTimeout(r, 1100));   // past the list's one-second cache
  const res = await fetch(`http://127.0.0.1:${port}/rooms`, { headers: { Origin: 'https://artyomsasov.github.io' } });
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://artyomsasov.github.io');
  const listed = await res.json();
  assert.ok(!listed.some(r => r.c === 'm1d0otest'), 'a private room stays off the list');
  // a new game (pub) is listed, with its players and bots
  const pub = client({ 'X-Forwarded-For': '10.9.9.9' }); await pub.opened;
  pub.sendJ({ t: 'join', code: 'm1d0opub', name: 'Host', bots: 3, pub: true }); await pub.next(m => m.t === 'welcome');
  await new Promise(r => setTimeout(r, 1100));
  const row = (await (await fetch(`http://127.0.0.1:${port}/rooms`)).json()).find(r => r.c === 'm1d0opub');
  assert.ok(row && row.n === 1 && row.b === 3, JSON.stringify(row));
  pub.close();
  const other = await fetch(`http://127.0.0.1:${port}/rooms`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(other.headers.get('access-control-allow-origin'), null, 'another site’s page can’t read it');
  ws.close();
});

test('connections that never join only fill a small waiting room: a third from one address is refused, a joined one frees its place', { skip }, async () => {
  const h = { 'X-Forwarded-For': '10.7.7.7' };
  const a = client(h), b = client(h); await a.opened; await b.opened;
  await assert.rejects(client(h).opened, /HTTP 401/, 'two waiting at once from one address');
  a.sendJ({ t: 'join', code: 'm1d0owait', name: 'Waiter' }); await a.next(m => m.t === 'welcome');
  const c = client(h); await c.opened;   // a's place in the waiting room is free again
  a.close(); b.close(); c.close();
});

test('a full waiting room still lets a newcomer in: the oldest waiting connection of the busiest network makes room', { skip }, async () => {
  const from = a => client({ 'X-Forwarded-For': a });
  const a1 = from('10.1.1.1'); await a1.opened; const a2 = from('10.1.1.2'); await a2.opened;
  const a3 = from('10.1.1.3'); await a3.opened; const b1 = from('10.2.2.1'); await b1.opened;   // four waiting: full
  const gone = new Promise(r => a1.on('close', r));
  const n = from('10.3.3.3'); await n.opened;
  await gone;   // the 10.1.1.x network held three places; its oldest went
  assert.equal(b1.readyState, WebSocket.OPEN);
  for (const w of [a2, a3, b1, n]) w.close();
});

test('a waiting room full of single connections lets the next one in, pushing out the oldest; a burst never overfills it', { skip }, async () => {
  const from = a => client({ 'X-Forwarded-For': a });
  const ws = [];
  for (const a of ['10.11.0.1', '10.12.0.1', '10.13.0.1', '10.14.0.1']) { const w = from(a); await w.opened; ws.push(w); }
  const gone = new Promise(r => ws[0].on('close', r));
  const n = from('10.15.0.1'); await n.opened; await gone;
  for (const w of ws.slice(1)) assert.equal(w.readyState, WebSocket.OPEN);
  for (const w of [...ws, n]) w.close();
  await new Promise(r => setTimeout(r, 100));
  // a burst from one network with two places each time: the room never holds more than WAIT_MAX
  const burst = []; for (let i = 0; i < 12; i++) burst.push(from('10.16.' + (i % 6) + '.1'), from('10.16.' + (i % 6) + '.2'));
  await Promise.allSettled(burst.map(w => w.opened));
  await new Promise(r => setTimeout(r, 100));
  assert.ok(burst.filter(w => w.readyState === WebSocket.OPEN).length <= 4, 'at most WAIT_MAX left open');
  for (const w of burst) w.terminate();
});

test('a player’s network report is taken as numbers only; nonsense in it changes nothing', { skip }, async () => {
  const ws = client({ 'X-Forwarded-For': '10.20.0.1' }); await ws.opened;
  ws.sendJ({ t: 'join', code: 'm1d0otest', name: 'Netter' });   // (a room the first test opened: the test server's rooms are few) await ws.next(m => m.t === 'welcome');
  ws.sendJ({ t: 'net', p: 42, j: 5, s: 1, g: 140, f: 60 });
  ws.sendJ({ t: 'net', p: 'x', j: -5, s: 1e9, g: Infinity, f: {} });
  ws.sendJ({ t: 'ping', c: 7 });
  assert.equal((await ws.next(m => m.t === 'pong' && m.c === 7)).c, 7, 'still served');
  ws.close();
});
