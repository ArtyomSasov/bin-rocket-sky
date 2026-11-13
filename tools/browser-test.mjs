// Real Chrome, local assets and an in-process two-broker relay. No public broker receives test traffic.
// BROWSER_PATH=/path/to/chrome npm run test:browser (Node 22+)
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = process.env.BROWSER_PATH;
assert.ok(chromePath, 'Set BROWSER_PATH to a Chrome/Chromium executable');
execFileSync(process.execPath, ['tools/build.mjs'], { cwd: root });
const hook = `window.__t = {me, stats, deathFx, hurt, ctfTick, roundTick, shoot, carveAt, nextTerrain, applyTerrain,
 get bodies(){return bodies}, get det(){return det}, get bots(){return bots}, get shots(){return shots}, get mode(){return MODE},
 get bases(){return bases}, get flagCarrier(){return flagCarrier}, get remotes(){return remotes}, get seenShots(){return seenShots},
 get playing(){return playing}, get roundLive(){return roundLive}, get hitBy(){return hitBy}, get koBy(){return koBy},
 get myShotLog(){return myShotLog}, get myCarves(){return myCarves}, get credited(){return credited}, get botCredited(){return botCredited}};\n`;
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = await readFile(file);
    if (file.endsWith('/index.html')) data = Buffer.from(data.toString().replace('})();\n</script>', hook + '})();\n</script>'));
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' })[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'bin-rocket-browser-'));
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
 '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
 '--autoplay-policy=no-user-gesture-required', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
const errors = [], pages = [], traffic = [];
try {
  const wsUrl = await new Promise((resolve, reject) => {
    let output = ''; const timeout = setTimeout(() => reject(new Error('Chrome did not start: ' + output.slice(-1000))), 15000);
    chrome.on('error', reject);
    chrome.stderr.on('data', d => { output += d; const m = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) { clearTimeout(timeout); resolve(m[1]); } });
  });
  socket = new WebSocket(wsUrl); await new Promise(r => socket.addEventListener('open', r, { once: true }));
  let seq = 0; const pending = new Map();
  function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++seq; const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 15000);
      pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  const mock = `window.__mqtt = [];
  window.mqtt = {connect(url, options) {
    const handlers = {}, c = {url, connected: !(window.__onlyBackup && url.includes('hivemq')), topics: [],
      on(n,f) {(handlers[n] ||= []).push(f); return c},
      emit(n,...a) {for(const f of handlers[n] || []) f(...a)},
      subscribe(t) {c.topics = typeof t === 'string' ? [t] : t},
      publish(topic,payload) {if(c.connected) __transportEmit(JSON.stringify({url,topic,payload}))},
      end() {c.connected=false; c.topics=[]}, reconnect() {c.connected=true; c.emit('connect')}
    }; __mqtt.push(c); setTimeout(()=>c.emit(c.connected ? 'connect' : 'offline'),0); return c;
  }};
  window.__receive = ({url,topic,payload}) => {for(const c of __mqtt) if(c.connected && c.url===url && c.topics.some(t=>new RegExp('^'+t.replaceAll('+','[^/]+')+'$').test(topic))) c.emit('message',topic,{length:new TextEncoder().encode(payload).length,toString:()=>payload})};`;
  socket.addEventListener('message', async e => {
    const m = JSON.parse(e.data);
    if (m.id) { const p = pending.get(m.id); if (!p) return; pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); return; }
    try {
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === 'Fetch.requestPaused') {
        const p = m.params;
        if (p.request.url.startsWith('https://unpkg.com/mqtt@')) await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, body: Buffer.from(mock).toString('base64'), responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }] }, m.sessionId);
        else await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }, m.sessionId);
      }
      if (m.method === 'Runtime.bindingCalled' && m.params.name === '__transportEmit') {
        const packet = JSON.parse(m.params.payload); traffic.push({ topic: packet.topic, bytes: Buffer.byteLength(packet.payload) });
        for (const page of pages) await send('Runtime.evaluate', { expression: `window.__receive && window.__receive(${JSON.stringify(packet)})` }, page);
      }
    } catch(e) { errors.push(e.message); }
  });
  async function evaluate(page, expression) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, page);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function until(page, expression, timeout = 15000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await evaluate(page, expression)) return; await wait(100); }
    throw new Error('Timed out: ' + expression + '\n' + JSON.stringify(await evaluate(page, '({visibility:document.visibilityState,remotes:window.__t ? [...__t.remotes.values()].map(r=>({name:r.name,q:r.q})):[], clients:window.__mqtt?.map(c=>({url:c.url,connected:c.connected,topics:c.topics}))})')) + '\n' + errors.join('\n'));
  }
  const clockBase = Math.floor(Date.now() / 315000) * 315000 + 60000;
  async function page(backup = false, mobile = false) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    pages.push(sessionId);
    await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
    await send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId);
    await send('Runtime.addBinding', { name: '__transportEmit' }, sessionId);
    await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] }, sessionId);
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__onlyBackup=${backup}; const start=performance.now(); Date.now=()=>${clockBase}+performance.now()-start; window.__code='M1C0SBASE';` }, sessionId);
    if (mobile) {
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
      await send('Emulation.setTouchEmulationEnabled', { enabled: true }, sessionId);
    }
    await send('Page.navigate', { url }, sessionId);
    await until(sessionId, '!!window.__t && !!window.mqtt');
    return sessionId;
  }
  async function join(page, name) {
    await evaluate(page, `document.getElementById('nameInput').value=${JSON.stringify(name)};
      document.getElementById('lobbyInput').value=__code;
      document.getElementById('lobbyInput').dispatchEvent(new Event('input'));
      document.getElementById('startForm').requestSubmit();`);
    await until(page, '__t.playing && __mqtt.length === 3');
    await evaluate(page, '__t.me.inv=1e15');
  }
  const a = await page(); await join(a, 'Primary');
  const hole = await evaluate(a, `(()=>{const i=__t.det.findIndex(b=>b.planet&&!b.free&&!b.dead); const b=__t.det[i];
    const before=Array.from(b.cells); __t.carveAt(b,b.x,b.y,60,true);
    return {i,removed:Array.from(b.cells).flatMap((v,k)=>before[k]&&!v?[k]:[])};})()`);
  assert.ok(hole.removed.length > 0, 'A real canvas crater was cut');
  await wait(4500); // outside the old four-second carve history
  const b = await page(true); await join(b, 'Backup');
  await until(a, `[...__t.remotes.values()].some(r=>r.name==='Backup')`);
  await until(b, `[...__t.remotes.values()].some(r=>r.name==='Primary')`);
  await until(b, `${JSON.stringify(hole.removed)}.every(k=>__t.det[${hole.i}].cells[k]===0)`, 20000);
  const shot = await evaluate(a, `(()=>{__t.me.weapon='fire';__t.shoot(performance.now());return __t.myShotLog.at(-1).d[0]})()`);
  await until(b, `__t.seenShots.has(${JSON.stringify(shot)})`);
  console.log('PASS two-broker visibility and late-join canvas terrain');
  await evaluate(b, '__mqtt[2].connected=false');
  const more = await evaluate(a, `(()=>{const b=__t.det[${hole.i}],before=Array.from(b.cells); __t.carveAt(b,b.x+90,b.y,50,true);return Array.from(b.cells).flatMap((v,k)=>before[k]&&!v?[k]:[]);})()`);
  assert.ok(more.length > 0); await wait(4500);
  await evaluate(b, '__mqtt[2].connected=true');
  await until(b, `${JSON.stringify(more)}.every(k=>__t.det[${hole.i}].cells[k]===0)`, 20000);
  console.log('PASS terrain repair after connection loss');
  // Verify the actual round-reset function clears all outgoing event journals.
  const reset = await evaluate(a, `(()=>{const t=__t;t.hitBy.push('old');t.koBy.push('old');t.myShotLog.push({at:performance.now(),d:['old']});t.stats.round--;t.roundTick(performance.now());return [t.hitBy.length,t.koBy.length,t.myShotLog.length,t.shots.length]})()`);
  assert.deepEqual(reset, [0,0,0,0]); console.log('PASS real round reset');
  // Use the project's existing smoke sequence on a fresh host with all six bots.
  const smoke = await page();
  await evaluate(smoke, `new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/tools/smoke.js';s.onload=resolve;s.onerror=reject;document.body.append(s)})`);
  await until(smoke, '!!window.__smoke', 90000);
  const result = await evaluate(smoke, '__smoke');
  assert.deepEqual(result.errors, []);
  for (const [weapon, kinds] of Object.entries(result.fired)) assert.ok(kinds.length, 'Weapon fired: ' + weapon);
  assert.equal(Object.keys(result.fired).length, 11); assert.ok(result.ctfCaps > 0);
  assert.deepEqual(result.altCost, {rocket:3,scatter:2,triple:1,mine:1});
  console.log('PASS six-bot weapon/death/CTF smoke', JSON.stringify(result));
  // Max-sized crater history plus six busy bots must still fit the receiver's byte limit.
  await evaluate(smoke, `(()=>{const t=__t, now=performance.now();
    for(let i=0;i<320;i++) t.myCarves.push({at:now,d:[t.stats.round,0,3000,3000,700,100000+i]});
    for(const b of t.bots) {b.hitBy=Array.from({length:12},(_,i)=>'stress.'+i);b.koBy=b.hitBy.slice();
      b.shotLog=Array.from({length:9},(_,i)=>({at:now,d:[b.tag+'.s'+i,10000,10000,-4500,4500,0]}));}
  })()`);
  await wait(400);
  const phone = await page(true, true); await join(phone, 'Mobile');
  await until(phone, '__t.remotes.size > 0');
  const mobile = await evaluate(phone, '({w:innerWidth, mode:__t.mode, playing:__t.playing})');
  assert.equal(mobile.playing, true); console.log('PASS mobile viewport', JSON.stringify(mobile));
  assert.deepEqual(errors, []);
  const max = Math.max(...traffic.map(p=>p.bytes));
  assert.ok(max <= 16384, 'All state packets fit receiver limit: ' + max);
  console.log('PASS browser errors=0; maximum packet bytes=' + max);
} finally {
  if (socket) socket.close();
  const exited = new Promise(r => chrome.once('exit', r)); chrome.kill(); await exited;
  server.closeAllConnections(); await new Promise(r => server.close(r));
  await rm(profile, { recursive: true, force: true });
}
