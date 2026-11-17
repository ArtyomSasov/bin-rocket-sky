// The authoritative server end to end: real WebSocket connections to server/index.mjs on a free port.
// Needs the server's dependencies: cd server && npm ci
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ready = fs.existsSync(path.join(__dirname, '../server/node_modules/ws'));
const skip = ready ? false : 'server dependencies are not installed (cd server && npm ci)';
let srv, port, WebSocket;
before(async () => {
  if (!ready) return;
  Object.assign(process.env, { PORT: '0', MAX_ROOMS: '2', BRS_NO_SIGNALS: '1', ORIGINS: 'https://artyomsasov.github.io' });
  srv = await import('../server/index.mjs'); port = await srv.listening;
  WebSocket = require('../server/node_modules/ws');
});
after(async () => { if (srv) await srv.stop(); });

// a client that keeps every message it receives and can wait for one that matches
function client(headers) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers }), got = [], waiters = [];
  ws.on('message', d => { const m = JSON.parse(d); got.push(m); for (const w of [...waiters]) if (w.f(m)) { waiters.splice(waiters.indexOf(w), 1); w.r(m); } });
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
  assert.equal(hi.code, 'm1d0otest'); assert.equal(hi.sendHz, 15);
  const me = s => s.bots.find(([id]) => id === hi.id)?.[1];
  const first = await ws.next(m => m.t === 'snap' && me(m)?.x !== undefined);
  assert.equal(first.bots.length, 3, 'the player and two bots');
  // hold the stick right for a second: the server moves the pilot
  const timer = setInterval(() => ws.sendJ({ t: 'in', mx: 1, my: 0, aim: 0 }), 33);
  await new Promise(r => setTimeout(r, 1200)); clearInterval(timer);
  const later = ws.got.filter(m => m.t === 'snap' && me(m)?.x !== undefined).at(-1);
  assert.ok(me(later).x - me(first).x > 200, `moved ${me(later).x - me(first).x}`);
  ws.sendJ({ t: 'ping', c: 42 });
  const pong = await ws.next(m => m.t === 'pong');
  assert.equal(pong.c, 42); assert.ok(Math.abs(pong.s - Date.now()) < 1000);
  ws.close();
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

test('the server refuses another site’s page, a bad code and a third room', { skip }, async () => {
  await assert.rejects(client({ Origin: 'https://evil.example' }).opened, /HTTP 401/);
  const bad = client(); await bad.opened; bad.sendJ({ t: 'join', code: '../x' });
  assert.equal((await bad.next(m => m.t === 'error')).reason, 'bad code');
  // two rooms are already open (earlier tests keep theirs for a minute); a third does not fit
  const extra = client(); await extra.opened; extra.sendJ({ t: 'join', code: 'm1d0othird' });
  assert.equal((await extra.next(m => m.t === 'error')).reason, 'server full');
});
