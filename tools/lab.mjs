// The lab: an empty test range for checking how every gun looks, sounds and hurts, in real Chrome, offline.
// The map is cleared (no planets, junk, events or pick-ups), target dummies stand still in a row, and each gun
// fires its primary and its alt at them. The report says, per gun and mode: shots fired, damage dealt, the sounds
// heard and whether the page threw; a screenshot is taken mid-fire and just after.
//   BROWSER_PATH=/path/to/chrome node tools/lab.mjs [gun,gun,...]        (OUT=dir for the screenshots; W/H: viewport)
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = process.env.BROWSER_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = resolve(process.env.OUT || join(tmpdir(), 'brs-lab'));
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
await mkdir(OUT, { recursive: true });
execFileSync(process.execPath, ['tools/build.mjs'], { cwd: root });

// the page gets a handle on the game's scope (window.__e) and the lab's helpers. (eval is deliberate and safe here:
// this dev tool injects it only into a local copy of the game served to a headless browser, as browser-test.mjs does)
const hook = `window.__e = s => eval(s);
window.__lab = {
  sounds: [],
  // an empty arena: nothing in the way, nothing happening, nothing to pick up
  clear() { bodies.length = 0; det.length = 0; planets.length = 0; ROCKS = 0; world.rocks.length = 0; SUPPLY_SLOTS = 0; PICKS = 0; world.picks.length = 0; world.supplies.length = 0; world.bombs.length = 0; world.amp = null; drops.clear(); gunDrops.clear(); },
  // dummies: the bots, parked in a row ahead of me, never firing back, healed between guns
  park(dist) { bots.forEach((b, i) => Object.assign(b, { x: me.x + dist, y: me.y + (i - (bots.length - 1) / 2) * 170, vx: 0, vy: 0, a: Math.PI, fireCd: 1e9, dead: false, inv: 0 })); },
  heal() { for (const b of bots) { b.lives = maxLivesOf(b.lv); clearArmor(b); b.dead = false; } },
  hp() { return bots.reduce((s, b) => s + (b.dead ? 0 : b.lives) + (b.shield || 0), 0); },
  deaths() { return bots.reduce((s, b) => s + b.st.deaths, 0); }
};
// every sound the game asks for is noted (name only), so a gun's report says what it played
// no world events in the lab (no black hole pulling the dummies about)
eventAt = () => ({ cyc: 0, ph: 0, et: 0, type: "meteors", active: false, warn: false });
for (const f of ['sfx', 'packPlay', 'audioCue']) { const o = eval(f); eval(f + ' = (...a) => { __lab.sounds.push(String(a[0])); return o(...a); }'); }
`;
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = await readFile(file);
    if (file.endsWith('/index.html')) data = Buffer.from(data.toString().replace('})();\n</script>', hook + '})();\n</script>'));
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.json': 'application/json' })[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const profile = await mkdtemp(join(tmpdir(), 'brs-lab-'));
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', '--no-first-run', `--window-size=${W},${H}`, '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wait = ms => new Promise(r => setTimeout(r, ms));
let code = 0;
try {
  const wsUrl = await new Promise((ok, no) => { let o = ''; const t = setTimeout(() => no(new Error('Chrome did not start')), 15000); chrome.stderr.on('data', d => { o += d; const m = o.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); ok(m[1]); } }); });
  const sock = new WebSocket(wsUrl); await new Promise(r => sock.addEventListener('open', r, { once: true }));
  let seq = 0; const pend = new Map(), errors = [];
  const send = (method, params = {}, sessionId) => new Promise((ok, no) => { const id = ++seq; pend.set(id, { ok, no }); sock.send(JSON.stringify({ id, method, params, sessionId })); });
  sock.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.no(new Error(m.error.message)) : p.ok(m.result); } else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/?offline` }, sessionId);
  const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const shot = async name => { const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId); await writeFile(join(OUT, name + '.png'), Buffer.from(data, 'base64')); };
  for (let i = 0; i < 100 && !(await ev('!!window.__lab')); i++) await wait(100);
  // the test range (every gun, endless ammo) with three easy bots for dummies
  await ev(`(() => { const E = __e; E('botChoice.n = 3; botChoice.level = "easy"');
    document.getElementById('lobbyInput').value = 'M1X0CLAB'; document.getElementById('lobbyInput').dispatchEvent(new Event('input'));
    E('setTab(true)'); document.getElementById('startForm').requestSubmit(); })()`);
  for (let i = 0; i < 80 && !(await ev('__e("playing && roundLive")')); i++) await wait(100);
  await ev('__e("bots.length || addBots(3, \\"easy\\")")');   // the test range brings no bots: three dummies
  // keep the field empty and the dummies parked, every frame
  await ev(`(() => { const E = __e; E('__lab.clear()'); E('me.x = 1200; me.y = 1200; me.inv = 1e15'); setInterval(() => { E('__lab.clear()'); E('me.vx = me.vy = 0; me.a = 0; me.inv = 1e15'); E('__lab.park(' + (window.__dist || 520) + ')'); }, 16); })()`);
  const guns = process.argv[2] ? process.argv[2].split(',') : await ev('__e("SANDBOX_GUNS")');
  const report = [];
  for (const g of guns) for (const [mode, key] of [['primary', 'KeyF'], ['alt', 'KeyC']]) {
    const dist = g === 'gauntlet' ? 95 : g === 'nuke' || g === 'holy' ? 900 : 520;
    await ev(`(() => { const E = __e; window.__dist = ${dist}; E('keys').clear(); E('__lab.heal()'); E('shots.length = 0'); E('me.weapon = ${JSON.stringify(g)}'); E('renderWeapon()'); E('fireCd = 0'); })()`);
    await wait(500);
    const hp0 = await ev('__e("__lab.hp()")'), d0 = await ev('__e("__lab.deaths()")'), s0 = await ev('__e("stats.shots")');
    await ev('__lab.sounds.length = 0');
    await ev(`__e('keys').add(${JSON.stringify(key)})`);
    await wait(700); await shot(`${g}-${mode}-1`);
    await wait(700);
    await ev(`__e('keys').delete(${JSON.stringify(key)})`);
    await wait(150); await shot(`${g}-${mode}-2`);
    await wait(g === 'holy' || g === 'nuke' ? 3800 : 900); await shot(`${g}-${mode}-3`);
    const hp1 = await ev('__e("__lab.hp()")'), d1 = await ev('__e("__lab.deaths()")'), s1 = await ev('__e("stats.shots")');
    const sounds = [...new Set(await ev('__lab.sounds'))];
    report.push({ gun: g, mode, shots: s1 - s0, damage: +(hp0 - hp1 + (d1 - d0) * 3).toFixed(2), kills: d1 - d0, sounds: sounds.slice(0, 8).join(' ') });
  }
  console.table(report);
  console.log('screenshots in', OUT);
  console.log('page errors:', errors.length ? [...new Set(errors)].slice(0, 5) : 'none');
  if (errors.length) code = 1;
} finally { chrome.kill(); server.close(); await rm(profile, { recursive: true, force: true }).catch(() => {}); }
process.exit(code);
