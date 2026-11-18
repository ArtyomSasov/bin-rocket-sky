// Screen photos of the start card (each step of a new game, and Join), then of the game itself after take-off,
// in real (headless, muted) Chrome. MOBILE=1 emulates a phone (390x844, touch).
//   node tools/screens.mjs            (OUT=dir; FRESH=1 opens as a first visit, without remembered picks)
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = process.env.BROWSER_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = resolve(process.env.OUT || join(tmpdir(), 'brs-screens'));
const MOBILE = !!process.env.MOBILE, W = MOBILE ? 390 : 1280, H = MOBILE ? 844 : 800;
await mkdir(OUT, { recursive: true });
execFileSync(process.execPath, ['tools/build.mjs'], { cwd: root });
// (eval is deliberate: this dev tool injects it only into a local copy of the game served to a headless browser)
const hook = `window.__e = s => eval(s);\n`;
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = await readFile(file);
    if (file.endsWith('/index.html')) data = Buffer.from(data.toString().replace('})();\n</script>', hook + '})();\n</script>'));
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' })[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const profile = await mkdtemp(join(tmpdir(), 'brs-screens-'));
const chrome = spawn(chromePath, ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--no-first-run', `--window-size=${W},${H}`,
  '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wait = ms => new Promise(r => setTimeout(r, ms));
let exit = 0;
try {
  const wsUrl = await new Promise((ok, no) => { let o = ''; const t = setTimeout(() => no(new Error('Chrome did not start')), 15000); chrome.stderr.on('data', d => { o += d; const m = o.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); ok(m[1]); } }); });
  const sock = new WebSocket(wsUrl); await new Promise(r => sock.addEventListener('open', r, { once: true }));
  let seq = 0; const pend = new Map(), errors = [];
  const send = (method, params = {}, sessionId) => new Promise((ok, no) => { const id = ++seq; pend.set(id, { ok, no }); sock.send(JSON.stringify({ id, method, params, sessionId })); });
  sock.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.no(new Error(m.error.message)) : p.ok(m.result); } else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  if (MOBILE) {
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 3, mobile: true }, sessionId);
    await send('Emulation.setTouchEmulationEnabled', { enabled: true }, sessionId);
    await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' }, sessionId);
  }
  const url = `http://127.0.0.1:${server.address().port}/?offline`;
  await send('Page.navigate', { url }, sessionId);
  const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const shot = async (name, full) => {
    const p = { format: 'png' };
    if (full) { const { cssContentSize: c } = await send('Page.getLayoutMetrics', {}, sessionId); p.clip = { x: 0, y: 0, width: W, height: Math.min(4000, Math.ceil(c.height)), scale: MOBILE ? 0.5 : 1 }; p.captureBeyondViewport = true; }
    const { data } = await send('Page.captureScreenshot', p, sessionId); await writeFile(join(OUT, (MOBILE ? 'phone-' : 'desk-') + name + '.png'), Buffer.from(data, 'base64'));
  };
  for (let i = 0; i < 100 && !(await ev('!!window.__e')); i++) await wait(100);
  if (process.env.FRESH !== '0') { await ev('localStorage.clear()'); await send('Page.reload', {}, sessionId); await wait(500); for (let i = 0; i < 100 && !(await ev('!!window.__e')); i++) await wait(100); }
  await wait(600);
  const steps = await ev('document.querySelectorAll("#stepper button").length');
  for (let k = 0; k < steps; k++) {
    await ev(`document.querySelectorAll("#stepper button")[${k}].click()`);
    if (k === 2) await ev('document.querySelectorAll("#botsOn button")[1].click()');
    await wait(250); await shot('start-' + (k + 1), true);
  }
  await ev('document.getElementById("tabJoin").click()'); await wait(250); await shot('start-join', true);
  await ev('document.getElementById("tabNew").click()');
  // take off, then look at the game
  await ev('document.getElementById("startForm").requestSubmit()');
  for (let i = 0; i < 80 && !(await ev('__e("playing && roundLive")')); i++) await wait(100);
  await ev('__e("me.inv = 1e15")');
  await wait(2500); await shot('game');
  await ev('__e("feedPush(\'Bin-12 fragged Bin-40\'); feedPush(\'Bin-77 fragged Bin-12\'); feedPush(\'You fragged Bin-77\'); feedPush(\'Bin-40 fragged Bin-31\')")').catch(() => {});
  await wait(400); await shot('game-feed');
  console.log('screenshots in', OUT);
  console.log('page errors:', errors.length ? [...new Set(errors)].slice(0, 5) : 'none');
  if (errors.length) exit = 1;
} finally { chrome.kill(); server.close(); await rm(profile, { recursive: true, force: true }).catch(() => {}); }
process.exit(exit);
