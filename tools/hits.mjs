// Measures shown-vs-confirmed hits on a local game server: two headless Chrome pages (muted, each in its own window
// so neither is throttled) in one room, one firing the laser pistol at the other as it flies about.
// DELAY=ms holds every message this long each way (a proxy in front of the server: DevTools latency does not apply
// to WebSocket frames), so DELAY=42 is a ~85 ms round trip. SECS: how long. Prints shown / confirmed / not shown,
// the state of each target hit shown but never confirmed, and the server's own " net " line.
// usage: DELAY=42 SECS=40 [GUN=rocket] node tools/hits.mjs [scratch dir]   (GUN=rocket: the test range, loading and firing rocket volleys; VOLLEY: rockets shown at once / sent back by the server / matched)
import { createServer } from 'node:http';
import net from 'node:net';
import { readFile, mkdtemp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
const root = new URL('..', import.meta.url).pathname.replace(/\/$/, ''), scratch = process.argv[2] || (await import('node:os')).tmpdir(), LAT = +(process.env.LAT || 0), SECS = +(process.env.SECS || 25), GUN = process.env.GUN || 'fire';
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
const game = spawn('node', ['index.mjs'], { cwd: root + '/server', env: { ...process.env, PORT: String(gport), ORIGINS: origin, BRS_NO_SIGNALS: '1', MAX_ROOMS: '2', BRS_HITLOG: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
    const f = code => ev('__e(' + JSON.stringify(code) + ')'); f.shot = async () => (await send('Page.captureScreenshot', { format: 'png' }, sessionId)).data; return f;
  };
  const A = await page(), B = await page();
  for (const [p, name] of [[A, 'Shooter'], [B, 'Target']]) {
    await p(`chooseWhere('srv'); document.getElementById('tabJoin').click(); document.getElementById('nameInput').value = '${name}';
      const li = document.getElementById('lobbyInput'); li.value = '${['rocket', 'nova', 'saw', 'void', 'gamma'].includes(GUN) ? 'M1X0OHITS' : 'M1D0OHITS'}'; li.dispatchEvent(new Event('input')); document.getElementById('startForm').requestSubmit(); 0`);
    await wait(2500);
  }
  console.log('joined', await A(`'playing ' + playing + ' live ' + roundLive + ' dead ' + me.dead + ' pos ' + Math.round(me.x) + ',' + Math.round(me.y) + ' info ' + document.getElementById('roundInfo').textContent + ' start ' + !document.getElementById('start').hidden + ' ' + serverRun + ' ' + srv.joined + ' ping ' + Math.round(myPing||0) + ' remotes ' + remotes.size`), '|', await B(`srv.joined + ' ping ' + Math.round(myPing||0)`));
  await A(`window.__acc = { hs: 0, hc: 0, hn: 0 }; const orig = srv.ws.send.bind(srv.ws); srv.ws.send = m => { try { const o = JSON.parse(m); if (o.t === 'net' && o.h) { __acc.hs += o.h[0]; __acc.hc += o.h[1]; __acc.hn += o.h[2]; } } catch {} return orig(m); };
    ptr.moved = true;
    window.__rd = { skip: 0, skipHb: 0, seen: 0, rds: new Set(), mine: stats.round }; const acr0 = applyCombatReports;
    applyCombatReports = (id, p, r) => { __rd.seen++; for (const k of Array.isArray(p.hb) ? p.hb : []) { if (typeof k !== 'string') continue; const m = k.startsWith(myTag + '.'); if (!m) { __rd.notMine = (__rd.notMine || 0) + 1; (__rd.nm = __rd.nm || new Set()).add(k.split('.')[0] + '/' + myTag); } else if (credited.has(id + ':' + k)) __rd.dup = (__rd.dup || 0) + 1; else __rd.fresh = (__rd.fresh || 0) + 1; } if (p.rd !== stats.round) { __rd.skip++; if (Array.isArray(p.hb) && p.hb.length) __rd.skipHb++; __rd.rds.add(p.rd + '/' + stats.round); } return acr0(id, p, r); };
    window.__log = []; const fx0 = serverHitFx, sh0 = serverHitShown;
    serverHitFx = (s, rid, r) => { const n = srv.hits.length; fx0(s, rid, r); if (srv.hits.length > n) { const v = Math.hypot(s.vx, s.vy) || 1, ux = s.vx / v, uy = s.vy / v, side = Math.sign((s.ox - me.x) * Math.sin(me.a) - (s.oy - me.y) * Math.cos(me.a)), perp = Math.round((r.x - s.ox) * uy - (r.y - s.oy) * ux); __log.push({ rid, t: Date.now(), at: performance.now(), kind: s.kind, side, perp, lives: r.lives, inv: !!r.inv, dead: !!r.dead, ok: false }); } };
    serverHitShown = rid => { const ok = sh0(rid); if (ok) { const e = __log.find(e => e.rid === rid && !e.ok); if (e) { e.ok = true; e.lag = Math.round(performance.now() - e.at); } } return ok; };
    window.__ctl = setInterval(() => { const r = [...remotes.values()].find(r => r.name === 'Target'); keys.delete('KeyW'); keys.delete('KeyS'); keys.delete('KeyA'); keys.delete('KeyD'); keys.delete('KeyF');
      if (!r || me.dead || r.dead) return; const dx = r.x - me.x, dy = r.y - me.y, d = Math.hypot(dx, dy);
      ptr.cx = sx(r.x) * zoom; ptr.cy = sy(r.y) * zoom;
      if (d > 520) { if (Math.abs(dx) > 80) keys.add(dx > 0 ? 'KeyD' : 'KeyA'); if (Math.abs(dy) > 80) keys.add(dy > 0 ? 'KeyS' : 'KeyW'); }
      else if (d < 300) { if (Math.abs(dx) > 80) keys.add(dx > 0 ? 'KeyA' : 'KeyD'); if (Math.abs(dy) > 80) keys.add(dy > 0 ? 'KeyW' : 'KeyS'); }
      if (${JSON.stringify(GUN)} === 'ram' || ${JSON.stringify(GUN)} === 'fly') { keys.delete('KeyW'); keys.delete('KeyS'); keys.delete('KeyA'); keys.delete('KeyD'); const tx = ${JSON.stringify(GUN)} === 'ram' ? r.x : r.x + 900 * Math.cos(performance.now() / 1500), ty = ${JSON.stringify(GUN)} === 'ram' ? r.y : r.y + 900 * Math.sin(performance.now() / 1500); if (Math.abs(tx - me.x) > 20) keys.add(tx > me.x ? 'KeyD' : 'KeyA'); if (Math.abs(ty - me.y) > 20) keys.add(ty > me.y ? 'KeyS' : 'KeyW'); return; }
      if (['saw', 'void', 'gamma'].includes(${JSON.stringify(GUN)})) { if (me.weapon !== ${JSON.stringify(GUN)}) selectWeapon(${JSON.stringify(GUN)});
        if (${JSON.stringify(GUN)} === 'saw') { keys.delete('KeyW'); keys.delete('KeyS'); keys.delete('KeyA'); keys.delete('KeyD'); if (d > 150) { if (Math.abs(dx) > 30) keys.add(dx > 0 ? 'KeyD' : 'KeyA'); if (Math.abs(dy) > 30) keys.add(dy > 0 ? 'KeyS' : 'KeyW'); } }
        if (${JSON.stringify(GUN)} !== 'void' || !holesNow().length) keys.add('KeyF'); return; }
      if (${JSON.stringify(GUN)} === 'nova') { if (me.weapon !== 'laser') selectWeapon('laser'); altFiring = performance.now() % 2400 < 1100; return; }
      if (${JSON.stringify(GUN)} === 'rocket') { if (me.weapon !== 'rocket') selectWeapon('rocket'); altFiring = performance.now() % 1800 < 1200; } else keys.add('KeyF'); }, 30);
    // rockets: how many my screen showed at once (predictShot) and how many of mine the server sent back
    window.__err = []; const rc0 = reconcile; reconcile = m => { rc0(m); __err.push(srv.lastErr); };
    window.__vol = { shown: 0, srv: 0, claimed: 0 }; const ps0 = predictShot, ar0 = addRemoteShot, cp0 = claimPrediction;
    predictShot = s => { if (s.kind === K.ROCKET || s.kind === K.NOVA) __vol.shown++; return ps0(s); };
    addRemoteShot = (owner, f, ...a) => { if (owner === srv.id && Array.isArray(f) && (f[5] === K.ROCKET || f[5] === K.NOVA) && !seenShots.has(f[0])) { __vol.srv++; if (f[5] === K.NOVA) (__vol.m = __vol.m || []).push(f[6]); } return ar0(owner, f, ...a); };
    claimPrediction = (kind, now, id) => { const r = cp0(kind, now, id); if ((kind === K.ROCKET || kind === K.NOVA) && r) __vol.claimed++; if (kind === K.NOVA) (__vol.cl = __vol.cl || []).push(r); return r; }; 0`);
  // the target flies about a little, as a player would
  await B(`window.__pull = []; setInterval(() => { const h = holesNow()[0]; if (!h || me.dead) return; const dx = h.x - me.x, dy = h.y - me.y, d = Math.hypot(dx, dy); __pull.push([Math.round(d), Math.round((me.vx * dx + me.vy * dy) / (d || 1))]); if (__pull.length > 400) __pull.shift(); }, 200); 0`);
  await B(`window.__ctl = setInterval(() => { const t = performance.now() / 1000; keys.delete('KeyW'); keys.delete('KeyS'); keys.add(Math.sin(t * 1.3) > 0 ? 'KeyW' : 'KeyS'); }, 100); 0`);
  for (let t = 0; t < SECS; t += 5) { await wait(5000); console.log(t + 5 + 's', await A(`document.getElementById('roundInfo').textContent + ' live ' + roundLive + ' dead ' + me.dead + ' matchReady ' + matchReady + ' ping ' + Math.round(myPing||0) + ' shown so far ' + (__acc.hs + srv.report.hs) + ' confirmed ' + (__acc.hc + srv.report.hc) + ' unshown ' + (__acc.hn + srv.report.hn) + ' myShots ' + stats.shots + ' weapon ' + me.weapon + ' d ' + Math.round(Math.hypot(([...remotes.values()][0]||me).x-me.x, ([...remotes.values()][0]||me).y-me.y)) + ' keys ' + [...keys].join()`)); }
  const r = await A(`({ hs: __acc.hs + srv.report.hs, hc: __acc.hc + srv.report.hc, hn: __acc.hn + srv.report.hn, ping: Math.round(myPing||0) })`);
  console.log('RESULT', JSON.stringify(r), 'confirmed', r.hs ? Math.round(100 * r.hc / r.hs) + '%' : '-');
  console.log('CORRECTIONS', JSON.stringify(await A(`(() => { const e = __err.filter(Number.isFinite), n = e.length, c = k => e.filter(x => x > k).length; return { n, over2: c(2), over10: c(10), over30: c(30), max: Math.round(Math.max(0, ...e.filter(x => x < 300))) }; })()`)));
  if (process.env.SHOTS) { const { writeFile } = await import('node:fs/promises'); for (let i = 0; i < 12; i++) { await wait(200); await writeFile(process.env.SHOTS + '/' + GUN + '-' + i + '.png', Buffer.from(await A.shot(), 'base64')); } }
  if (GUN === 'void') console.log('PULL', JSON.stringify(await B('__pull')));
  if (GUN === 'rocket' || GUN === 'nova') console.log('VOLLEY', JSON.stringify(await A('__vol')));
  console.log('errors', errs);
  console.log('RD', JSON.stringify(await A(`({ ...__rd, rds: [...__rd.rds], nm: [...(__rd.nm || [])], credSize: credited.size })`)));
  console.log('UNCONFIRMED', JSON.stringify(await A(`__log.filter(e => !e.ok).map(e => ({ kind: e.kind, side: e.side, perp: e.perp, lives: e.lives, inv: e.inv, dead: e.dead }))`)));
  { const shown = await A(`__log.map(e => ({ t: e.t, ok: e.ok, perp: e.perp }))`), srvl = glog.split('\n').filter(l => l.startsWith('HITLOG ')).map(l => JSON.parse(l.slice(7)));
    for (const e of shown.filter(e => !e.ok)) console.log('MISS shown', e.t, 'perp', e.perp, '-> server', JSON.stringify(srvl.filter(h => Math.abs(h.t - e.t) < 400).map(h => ({ dt: h.t - e.t, ...h, t: undefined }))));
    console.log('server pistol checks', srvl.length, 'hits', srvl.filter(h => h.r).length); }
  console.log('BY SIDE', JSON.stringify(await A(`[-1, 1].map(sd => { const l = __log.filter(e => e.side === sd); return { side: sd, shown: l.length, ok: l.filter(e => e.ok).length }; })`)));
  console.log('BY EDGE', JSON.stringify(await A(`[[0, 15], [15, 30], [30, 45], [45, 999]].map(([a, b]) => { const l = __log.filter(e => Math.abs(e.perp) >= a && Math.abs(e.perp) < b); return { perp: a + '-' + b, shown: l.length, ok: l.filter(e => e.ok).length }; })`)));
  console.log('confirm lag ms', JSON.stringify(await A(`__log.filter(e => e.ok).map(e => e.lag).sort((a,b)=>a-b)`)));
} finally { chrome.kill(); web.close(); game.kill(); proxy.close(); }
console.log(glog.split('\n').filter(l => / net /.test(l)).join('\n'));
process.exit(0);
