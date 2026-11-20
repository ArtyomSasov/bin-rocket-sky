// Measures shown-vs-confirmed hits on a local game server: two headless Chrome pages (muted, each in its own window
// so neither is throttled) in one room, one firing the laser pistol at the other as it flies about.
// DELAY=ms holds every message this long each way (a proxy in front of the server: DevTools latency does not apply
// to WebSocket frames), so DELAY=42 is a ~85 ms round trip. SECS: how long. Prints shown / confirmed / not shown,
// the state of each target hit shown but never confirmed, and the server's own " net " line.
// usage: DELAY=42 SECS=40 node tools/hits.mjs [scratch dir]
import { createServer } from 'node:http';
import net from 'node:net';
import { readFile, mkdtemp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
const root = new URL('..', import.meta.url).pathname.replace(/\/$/, ''), scratch = process.argv[2] || (await import('node:os')).tmpdir(), LAT = +(process.env.LAT || 0), SECS = +(process.env.SECS || 25), GUN = process.env.GUN || 'minigun';
const hook = 'window.__e = s => eval(s);\n';
const web = createServer(async (req, res) => { try { const n = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = resolve(root, '.' + (n === '/' ? '/index.html' : n));
  let d = await readFile(f); if (f.endsWith('/index.html')) d = Buffer.from(d.toString().replace('})();\n</script>', hook + '})();\n</script>'));
  res.setHeader('Content-Type', f.endsWith('.html') ? 'text/html' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream'); res.end(d); } catch { res.writeHead(404).end(); } });
await new Promise(r => web.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${web.address().port}`, gport = 18000 + Math.floor(Math.random() * 1000);
const pport = gport + 1000;
const proxy = net.createServer(c => { const u = net.connect(gport, '127.0.0.1'); const D = +(process.env.DELAY || 0);
  c.on('data', d => setTimeout(() => u.write(d), D)); u.on('data', d => setTimeout(() => c.write(d), D)); c.on('close', () => u.destroy()); u.on('close', () => c.destroy()); c.on('error', () => {}); u.on('error', () => {}); });
await new Promise(r => proxy.listen(pport, '127.0.0.1', r));
const game = spawn('node', ['index.mjs'], { cwd: root + '/server', env: { ...process.env, PORT: String(gport), ORIGINS: origin, BRS_NO_SIGNALS: '1', MAX_ROOMS: '2' }, stdio: ['ignore', 'pipe', 'pipe'] });
let glog = ''; game.stdout.on('data', d => glog += d); game.stderr.on('data', d => glog += d);
const wait = ms => new Promise(r => setTimeout(r, ms));
const profile = await mkdtemp(join(scratch, 'chrome-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
try {
  await wait(800);
  const wsUrl = await new Promise(ok => { let o = ''; chrome.stderr.on('data', d => { o += d; const m = o.match(/DevTools listening on (ws:\/\/\S+)/); if (m) ok(m[1]); }); });
  const sock = new WebSocket(wsUrl); await new Promise(r => sock.addEventListener('open', r, { once: true }));
  let seq = 0; const pend = new Map(), errs = [];
  const send = (method, params = {}, sessionId) => new Promise((ok, no) => { const id = ++seq; pend.set(id, { ok, no }); sock.send(JSON.stringify({ id, method, params, sessionId })); });
  sock.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.no(new Error(m.error.message)) : p.ok(m.result); } else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description?.slice(0, 200)); });
  const page = async () => {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true }); const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Runtime.enable', {}, sessionId); await send('Network.enable', {}, sessionId);
    if (LAT) await send('Network.emulateNetworkConditions', { offline: false, latency: LAT, downloadThroughput: -1, uploadThroughput: -1 }, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Page.navigate', { url: `${origin}/index.html?server=${encodeURIComponent('ws://127.0.0.1:' + pport)}` }, sessionId);
    const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    for (let i = 0; i < 100 && !(await ev('!!window.__e')); i++) await wait(100);
    return code => ev('__e(' + JSON.stringify(code) + ')');
  };
  const A = await page(), B = await page();
  for (const [p, name] of [[A, 'Shooter'], [B, 'Target']]) {
    await p(`chooseWhere('srv'); document.getElementById('tabJoin').click(); document.getElementById('nameInput').value = '${name}';
      const li = document.getElementById('lobbyInput'); li.value = 'M1D0OHITS'; li.dispatchEvent(new Event('input')); document.getElementById('startForm').requestSubmit(); 0`);
    await wait(2500);
  }
  console.log('joined', await A(`'playing ' + playing + ' live ' + roundLive + ' dead ' + me.dead + ' pos ' + Math.round(me.x) + ',' + Math.round(me.y) + ' info ' + document.getElementById('roundInfo').textContent + ' start ' + !document.getElementById('start').hidden + ' ' + serverRun + ' ' + srv.joined + ' ping ' + Math.round(myPing||0) + ' remotes ' + remotes.size`), '|', await B(`srv.joined + ' ping ' + Math.round(myPing||0)`));
  await A(`window.__acc = { hs: 0, hc: 0, hn: 0 }; const orig = srv.ws.send.bind(srv.ws); srv.ws.send = m => { try { const o = JSON.parse(m); if (o.t === 'net' && o.h) { __acc.hs += o.h[0]; __acc.hc += o.h[1]; __acc.hn += o.h[2]; } } catch {} return orig(m); };
    ptr.moved = true;
    window.__rd = { skip: 0, skipHb: 0, seen: 0, rds: new Set(), mine: stats.round }; const acr0 = applyCombatReports;
    applyCombatReports = (id, p, r) => { __rd.seen++; for (const k of Array.isArray(p.hb) ? p.hb : []) { if (typeof k !== 'string') continue; const m = k.startsWith(myTag + '.'); if (!m) { __rd.notMine = (__rd.notMine || 0) + 1; (__rd.nm = __rd.nm || new Set()).add(k.split('.')[0] + '/' + myTag); } else if (credited.has(id + ':' + k)) __rd.dup = (__rd.dup || 0) + 1; else __rd.fresh = (__rd.fresh || 0) + 1; } if (p.rd !== stats.round) { __rd.skip++; if (Array.isArray(p.hb) && p.hb.length) __rd.skipHb++; __rd.rds.add(p.rd + '/' + stats.round); } return acr0(id, p, r); };
    window.__log = []; const fx0 = serverHitFx, sh0 = serverHitShown;
    serverHitFx = (s, rid, r) => { const n = srv.hits.length; fx0(s, rid, r); if (srv.hits.length > n) __log.push({ rid, at: performance.now(), kind: s.kind, lives: r.lives, inv: !!r.inv, dead: !!r.dead, ok: false }); };
    serverHitShown = rid => { const ok = sh0(rid); if (ok) { const e = __log.find(e => e.rid === rid && !e.ok); if (e) { e.ok = true; e.lag = Math.round(performance.now() - e.at); } } return ok; };
    window.__ctl = setInterval(() => { const r = [...remotes.values()].find(r => r.name === 'Target'); keys.delete('KeyW'); keys.delete('KeyS'); keys.delete('KeyA'); keys.delete('KeyD'); keys.delete('KeyF');
      if (!r || me.dead || r.dead) return; const dx = r.x - me.x, dy = r.y - me.y, d = Math.hypot(dx, dy);
      ptr.cx = sx(r.x) * zoom; ptr.cy = sy(r.y) * zoom;
      if (d > 520) { if (Math.abs(dx) > 80) keys.add(dx > 0 ? 'KeyD' : 'KeyA'); if (Math.abs(dy) > 80) keys.add(dy > 0 ? 'KeyS' : 'KeyW'); }
      else if (d < 300) { if (Math.abs(dx) > 80) keys.add(dx > 0 ? 'KeyA' : 'KeyD'); if (Math.abs(dy) > 80) keys.add(dy > 0 ? 'KeyW' : 'KeyS'); }
      keys.add('KeyF'); }, 30); 0`);
  // the target flies about a little, as a player would
  await B(`window.__ctl = setInterval(() => { const t = performance.now() / 1000; keys.delete('KeyW'); keys.delete('KeyS'); keys.add(Math.sin(t * 1.3) > 0 ? 'KeyW' : 'KeyS'); }, 100); 0`);
  for (let t = 0; t < SECS; t += 5) { await wait(5000); console.log(t + 5 + 's', await A(`document.getElementById('roundInfo').textContent + ' live ' + roundLive + ' dead ' + me.dead + ' matchReady ' + matchReady + ' ping ' + Math.round(myPing||0) + ' shown so far ' + (__acc.hs + srv.report.hs) + ' confirmed ' + (__acc.hc + srv.report.hc) + ' unshown ' + (__acc.hn + srv.report.hn) + ' myShots ' + stats.shots + ' weapon ' + me.weapon + ' d ' + Math.round(Math.hypot(([...remotes.values()][0]||me).x-me.x, ([...remotes.values()][0]||me).y-me.y)) + ' keys ' + [...keys].join()`)); }
  const r = await A(`({ hs: __acc.hs + srv.report.hs, hc: __acc.hc + srv.report.hc, hn: __acc.hn + srv.report.hn, ping: Math.round(myPing||0) })`);
  console.log('RESULT', JSON.stringify(r), 'confirmed', r.hs ? Math.round(100 * r.hc / r.hs) + '%' : '-');
  console.log('errors', errs);
  console.log('RD', JSON.stringify(await A(`({ ...__rd, rds: [...__rd.rds], nm: [...(__rd.nm || [])], credSize: credited.size })`)));
  console.log('UNCONFIRMED', JSON.stringify(await A(`__log.filter(e => !e.ok).map(e => ({ kind: e.kind, lives: e.lives, inv: e.inv, dead: e.dead }))`)));
  console.log('confirm lag ms', JSON.stringify(await A(`__log.filter(e => e.ok).map(e => e.lag).sort((a,b)=>a-b)`)));
} finally { chrome.kill(); web.close(); game.kill(); proxy.close(); }
console.log(glog.split('\n').filter(l => / net /.test(l)).join('\n'));
process.exit(0);
