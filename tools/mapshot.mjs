// Map photos: a map opened offline in real (headless, muted) Chrome, shown whole from above and then close up at
// a few spots, to check how it looks. Optionally something is shot at a prop to see it break (BREAK=1).
//   node tools/mapshot.mjs <lobby code, e.g. M1X0F> [x,y x,y ...]     (fractions of the map; OUT=dir, W/H viewport)
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = process.env.BROWSER_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = resolve(process.env.OUT || join(tmpdir(), 'brs-maps'));
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
const code = process.argv[2] || 'M1X0F';
const spots = (process.argv.slice(3).length ? process.argv.slice(3) : ['0.5,0.5', '0.15,0.5', '0.3,0.25']).map(s => s.split(',').map(Number));
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
const profile = await mkdtemp(join(tmpdir(), 'brs-maps-'));
const chrome = spawn(chromePath, ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--no-first-run', `--window-size=${W},${H}`, '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
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
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/?offline` }, sessionId);
  const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const shot = async name => { const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId); await writeFile(join(OUT, name + '.png'), Buffer.from(data, 'base64')); };
  for (let i = 0; i < 100 && !(await ev('!!window.__e')); i++) await wait(100);
  await ev(`(() => { const E = __e; E('botChoice.n = 0');
    document.getElementById('lobbyInput').value = ${JSON.stringify(code)}; document.getElementById('lobbyInput').dispatchEvent(new Event('input'));
    E('setTab(true)'); document.getElementById('startForm').requestSubmit(); })()`);
  for (let i = 0; i < 80 && !(await ev('__e("playing && roundLive")')); i++) await wait(100);
  const tag = code.replace(/\W/g, '');
  // the whole map from above: the view pulled right back
  await ev(`(() => { const E = __e; E('me.inv = 1e15; me.x = W / 2; me.y = H / 2; me.vx = me.vy = 0; cam.x = W / 2; cam.y = H / 2');
    window.__hold = setInterval(() => E('me.vx = me.vy = 0; viewZoom = Math.min(innerWidth, innerHeight) / H / baseZoom * 0.98; applyView()'), 16); })()`);
  await wait(1500); await shot(`${tag}-overview`);
  await ev(`(() => { clearInterval(window.__hold); __e('viewZoom = 1; applyView()'); })()`);
  for (const [fx, fy] of spots) {
    await ev(`(() => { const E = __e; clearInterval(window.__hold); window.__hold = setInterval(() => E('me.x = W * ${fx}; me.y = H * ${fy}; me.vx = me.vy = 0; me.inv = 1e15'), 16); E('cam.x = W * ${fx}; cam.y = H * ${fy}'); })()`);
    await wait(1200); await shot(`${tag}-${fx}-${fy}`);
  }
  if (process.env.BREAK) {   // a rocket into the nearest prop, then a few more, photographed as it breaks
    const n = await ev(`__e("det.filter(b => b.prop).length")`);
    console.log('props on the map:', n);
    if (n) {
      await ev(`(() => { const E = __e, kind = ${JSON.stringify(process.env.BREAK)}; window.__prop = E("det.filter(b => b.prop && !b.dead)").filter(b => kind === "1" || b.kind === kind).sort((a, b) => Math.hypot(a.x - E("me.x"), a.y - E("me.y")) - Math.hypot(b.x - E("me.x"), b.y - E("me.y")))[0];
        clearInterval(window.__hold); window.__hold = setInterval(() => E('me.x = __prop.x - 420; me.y = __prop.y; me.vx = me.vy = 0; me.inv = 1e15'), 16); E('cam.x = __prop.x; cam.y = __prop.y'); })()`);
      await wait(1000); await shot(`${tag}-prop-0`);
      for (let k = 1; k <= 4; k++) {
        // a rocket (BREAK=1), or a burst of eight bullets
        const rocket = process.env.BREAK === '1';
        for (let j = 0; j < (rocket ? 1 : 8); j++) await ev(`__e('shots.push({ id: "t${Math.random()}", kind: ${rocket ? 'K.ROCKET' : 'K.BULLET'}, x: __prop.x - ${70 + j * 10}, y: __prop.y + ${(k - 2.5) * 10 + (Math.random() - 0.5) * 16}, px: __prop.x - ${75 + j * 10}, py: __prop.y, vx: 1400, vy: 0, life: 1, mine: true, owner: "me", m: 1, bn: 0 })')`);
        await wait(250); await shot(`${tag}-prop-${k}a`);
        await wait(700); await shot(`${tag}-prop-${k}b`);
      }
      console.log('prop left:', await ev(`__e("__prop.dead ? 'gone' : Math.round(__prop.mass / __prop.mass0 * 100) + '%'")`), 'rubble:', await ev(`__e("rubble.length")`));
    }
  }
  console.log('screenshots in', OUT);
  console.log('page errors:', errors.length ? [...new Set(errors)].slice(0, 5) : 'none');
  if (errors.length) exit = 1;
} finally { chrome.kill(); server.close(); await rm(profile, { recursive: true, force: true }).catch(() => {}); }
process.exit(exit);
