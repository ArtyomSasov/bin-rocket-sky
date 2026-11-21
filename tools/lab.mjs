// The lab: an empty test range for checking how every gun looks, sounds and hurts, in real Chrome, offline.
// The map is cleared (no planets, junk, events or pick-ups), target dummies stand still in a row, and each gun
// fires its primary and its alt at them. The report says, per gun and mode: shots fired, damage dealt, the sounds
// heard and whether the page threw; a screenshot is taken mid-fire and just after.
//   BROWSER_PATH=/path/to/chrome node tools/lab.mjs [gun,gun,...]        (OUT=dir for the screenshots; W/H: viewport; MOBILE=1: a touch phone)
// FX=1 node tools/lab.mjs [rocket,gren,mine,flak,bin,hits,spark,nuke,holy,sword,saber,engine,boost,fall,jolt,nova]: each effect photographed as it unfolds
// (engine/boost: flying under thrust / on boost, then turning; sword/saber: the blades swung at a dummy), then a stress test
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
// the time each frame spends updating and drawing (the frame rate itself is held to the display's by vsync)
__lab.work = []; { const u0 = update, d0 = draw; update = (...a) => { const t = performance.now(); u0(...a); __lab.w = performance.now() - t; };
  draw = (...a) => { const t = performance.now(); d0(...a); __lab.work.push(__lab.w + performance.now() - t); if (__lab.work.length > 600) __lab.work.shift(); }; }
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
const chrome = spawn(chromePath, ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--no-first-run', `--window-size=${W},${H}`, '--disable-background-timer-throttling',
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
  if (process.env.MOBILE) {   // MOBILE=1: a phone (touch, coarse pointer, W x H in CSS pixels)
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true }, sessionId);
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
    await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' }, sessionId);
  }
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
  await ev(`(() => { const E = __e; E('__lab.clear()'); E('me.x = 1200; me.y = 1200; me.inv = 1e15'); setInterval(() => { if (window.__keepWorld) { E('me.vx = me.vy = 0; me.inv = 1e15'); return; } E('__lab.clear()'); if (window.__free) { E('me.inv = 1e15'); return; } E('me.vx = me.vy = 0; me.a = 0; me.inv = 1e15'); E('__lab.park(' + (window.__dist || 520) + ')'); }, 16); })()`);
  const report = [];
  if (process.env.FX) {   // FX=1: each blast set off once in front of me, photographed as it unfolds; then a stress test
    const at = (x = 330, y = 0) => `me.x + ${x}, me.y + ${y}`;
    const FX = {
      rocket: `blastFx({ kind: K.ROCKET, x: me.x + 330, y: me.y })`,
      gren: `blastFx({ kind: K.GREN, x: me.x + 330, y: me.y })`,
      mine: `blastFx({ kind: K.MINE, x: me.x + 330, y: me.y })`,
      orb: `blastFx({ kind: K.ORB, x: me.x + 330, y: me.y })`,
      gamma: `{ me.inv = 1e15; for (let k = 0; k < 40; k++) addDebris(me.x + 330 + (Math.random() - 0.5) * 900, me.y + (Math.random() - 0.5) * 600, 0, 0, 3 + Math.random() * 5, "#9aa0b4"); splash({ kind: K.GAMMA, id: 'g1', owner: 'nobody', x: me.x + 330, y: me.y, vx: 0, vy: 0, m: 1, life: 0 }, performance.now()); }`,
      gammafly: `shots.push({ id: 'g' + Math.random(), kind: K.GAMMA, x: me.x + 200, y: me.y, px: me.x + 200, py: me.y, vx: 60, vy: 0, life: 4, m: 1, owner: 'nobody', bn: 0 })`,
      combo: `explode(me.x + 330, me.y, 120, 640, "plasma")`,
      flak: `flakBurst({ kind: K.FLAK, id: 'fx' + Math.random(), owner: 'nobody', x: me.x + 330, y: me.y, vx: 0, vy: 0, life: 1, m: 1 })`,
      bin: `deathFx({ ...bots[0], x: me.x + 330, y: me.y, vx: 0, vy: 0, dead: false }, 3, 0, 0)`,
      void: `{ const h = hurtMe; hurtMe = () => {}; try { me.inv = 1e15; for (const b of bots) Object.assign(b, { x: me.x + 700 + Math.random() * 300, y: me.y + (Math.random() - 0.5) * 500, dead: false }); detonate({ kind: K.VOID, x: me.x + 500, y: me.y, mine: false, id: 'v1' }, performance.now()); for (let k = 0; k < 6; k++) explode(me.x + 300 + k * 60, me.y + 200, 30, 300); } finally { hurtMe = h; } }`,
      pulse: `{ bots[0] && Object.assign(bots[0], { x: me.x + 420, y: me.y, dead: false, lives: 30 }); cam.x = me.x + 200; cam.y = me.y; me.arsenal.laser = 999; selectWeapon("laser"); me.a = 0; let n = 0; const iv = setInterval(() => { me.a = 0; fireCd = 0; shoot(performance.now(), false); if (++n > 5) clearInterval(iv); }, 70); }`,
      nova: `{ window.__dist = 520; me.arsenal.laser = 999; selectWeapon("laser"); me.a = 0; cam.x = me.x + 300; cam.y = me.y; fireCd = 0; railCharge = 0; altFiring = true; setTimeout(() => { altFiring = false; }, 1150); }`,
      // voidme: a void bursts 600 px to my right while I fly away from it at full thrust; __vd: my distance to it
      voidme: `{ window.__free = 1; me.x = W / 2; me.y = H / 2; me.vx = me.vy = 0; me.a = Math.PI; me.inv = 1e15; const h = hurtMe; hurtMe = () => {}; setTimeout(() => hurtMe = h, 4000);
        detonate({ kind: K.VOID, x: me.x + 600, y: me.y, mine: false, id: 'v9', owner: 'nobody' }, performance.now()); keys.add("KeyA"); window.__vd = [];
        const iv = setInterval(() => { const v = holesNow().find(h => h.v); if (v) __vd.push(Math.round(Math.hypot(v.x - me.x, v.y - me.y))); }, 250); setTimeout(() => { clearInterval(iv); keys.clear(); window.__free = 0; }, 3000); }`,
      voidst: `{ window.__wc = worldCode; worldCode = 'M1X0KLAB'; setTimeout(() => { worldCode = window.__wc; }, 3200); { window.__free = 1; me.x = W / 2; me.y = H / 2; me.vx = me.vy = 0; me.a = Math.PI; me.inv = 1e15; const h = hurtMe; hurtMe = () => {}; setTimeout(() => hurtMe = h, 4000);
        detonate({ kind: K.VOID, x: me.x + 600, y: me.y, mine: false, id: 'v9', owner: 'nobody' }, performance.now()); keys.add("KeyA"); window.__vd = [];
        const iv = setInterval(() => { const v = holesNow().find(h => h.v); if (v) __vd.push(Math.round(Math.hypot(v.x - me.x, v.y - me.y))); }, 250); setTimeout(() => { clearInterval(iv); keys.clear(); window.__free = 0; }, 3000); } }`,
      jolt: `{ window.__free = 1; me.x = W / 2; me.y = H / 2; me.vx = me.vy = 0; me.a = 0; setTimeout(() => { me.vx = -1100; me.vy = 300; }, 120); setTimeout(() => { me.vx = me.vy = 0; }, 900); }`,
      fall: `{ window.__keepWorld = 1; buildPlanets(worldCode); rebuildBodies(); const p = planets.filter(p => !p.free && !p.dead).sort((a, b) => b.rr - a.rr)[0]; me.x = p.x - 330; me.y = p.y - p.rr - 140; cam.x = me.x; cam.y = me.y; me.vx = me.vy = 0; me.inv = 1e15;
        makeHulk({ x: p.x - 120, y: p.y - p.rr - 330, vx: 160, vy: 40, a: 0.3, lv: 1, ck: me.ck }); const h = hulks[hulks.length - 1]; h.spin = 3; window.__fallP = p; }`,
      sword: `{ window.__dist = 125; me.x = W * 0.3; me.y = H * 0.3; cam.x = me.x; cam.y = me.y; bots[0] && Object.assign(bots[0], { lives: 3 }); me.arsenal.saw = 30; selectWeapon("saw"); fireCd = 0; charge = 0; keys.add("KeyF"); setTimeout(() => keys.delete("KeyF"), 520); }`,
      railkill: `deathFx({ ...bots[0], x: me.x + 250, y: me.y, vx: 0, vy: 0, dead: false }, 2, 1, 0.2)`,
      binthrown: `deathFx({ ...bots[0], x: me.x + 150, y: me.y, vx: 0, vy: 0, dead: false }, 3, 0, 0.3)`,
      hits: `for (let k = 0; k < 4; k++) impact(${at(250)} + (k - 1.5) * 90, SHOTS[[K.BULLET, K.PELLET, K.RAIL, K.ROCKET][k]].col, k < 2 ? 1 : 2)`,
      hitsfrozen: `for (let k = 0; k < 4; k++) impact(${at(250)} + (k - 1.5) * 90, SHOTS[[K.BULLET, K.PELLET, K.RAIL, K.ROCKET][k]].col, k < 2 ? 1 : 2); update(0.03, performance.now()); hitStopUntil = performance.now() + 600`,
      // the engine: flying up under thrust, then a turn; boost: the same on afterburner (the crop follows the bin)
      engine: `{ window.__free = 1; me.x = W / 2; me.y = H / 2 + 600; me.vx = me.vy = 0; me.a = -Math.PI / 2; keys.add("KeyW"); setTimeout(() => keys.add("KeyD"), 900); setTimeout(() => { keys.clear(); window.__free = 0; }, 2900); }`,
      boost: `{ window.__free = 1; me.x = W / 2; me.y = H / 2 + 600; me.vx = me.vy = 0; me.a = -Math.PI / 2; energy = 100; keys.add("KeyW"); keys.add("ShiftLeft"); boostDownAt = performance.now() - 1000; setTimeout(() => keys.add("KeyD"), 900); setTimeout(() => { keys.clear(); window.__free = 0; }, 2900); }`,
      saber: `{ window.__dist = 110; me.x = W * 0.3; me.y = H * 0.3; cam.x = me.x + 330; cam.y = me.y; bots[0] && Object.assign(bots[0], { x: me.x + 120, y: me.y + 10, dead: false, lives: 3 }); selectWeapon("gauntlet"); me.a = 0; keys.add("KeyF"); setTimeout(() => keys.delete("KeyF"), 1500); }`,
      spark: `sparkShower(${at(330)}, -1, 0, 1)`,
      nuke: `{ const h = hurtMe; hurtMe = () => {}; try { detonate({ kind: K.NUKE, x: me.x + 250, y: me.y, mine: false }, performance.now()); } finally { hurtMe = h; } }`,
      nukefar: `{ const h = hurtMe; hurtMe = () => {}; try { detonate({ kind: K.NUKE, x: me.x + 1000, y: me.y, mine: false }, performance.now()); } finally { hurtMe = h; } }`,   // at the edge of its reach: what a survivor sees
      holy: `{ const h = hurtMe; hurtMe = () => {}; try { detonate({ kind: K.HOLY, x: me.x + 250, y: me.y, mine: false }, performance.now()); } finally { hurtMe = h; } }`,
    };
    const pick = process.argv[2] ? process.argv[2].split(',') : Object.keys(FX);
    await ev('window.__dist = 4000');
    if (process.env.POST) await ev(`__e('settings.post = "${process.env.POST}"')`);   // (POST=on: the WebGL look even when headless is slow)
    for (const name of pick) {
      await ev(`__e('parts.length = impacts.length = rings.length = booms.length = waves.length = debris.length = frags.length = hulks.length = 0')`);
      await ev('window.__dist = 4000; window.__free = 0; window.__keepWorld = 0'); await wait(300);
      const t0 = Date.now(), times = name === 'nuke' || name === 'nukefar' || name === 'holy' ? [80, 400, 1000, 2000, 3500] : name === 'sword' ? [150, 420, 570, 620, 700, 1100] : name === 'fall' ? [100, 700, 1300, 1900, 2800, 4500] : name === 'jolt' ? [100, 150, 175, 200, 240, 320] : name === 'nova' ? [500, 1100, 1300, 1550, 1750, 2200] : name === 'saber' ? [60, 140, 260, 420, 560, 900] : [40, 150, 400, 900, 1800, 2800];
      await ev(`__e(${JSON.stringify(FX[name])})`);
      let peak = 0;
      const cxs = [], cys = [], big = name === 'nuke' || name === 'nukefar' || name === 'holy', follow = name === 'engine' || name === 'boost' || name === 'jolt', blade = name === 'sword' || name === 'saber', cx = await ev(`__e("sx(me.x + ${name === 'nukefar' ? 0 : big ? 250 : follow ? 0 : blade ? 70 : 330}) * innerWidth / vw")`), cy = await ev(`__e("sy(me.y) * innerWidth / vw")`), frames = [];
      for (const t of times) {
        await wait(Math.max(0, t - (Date.now() - t0)));
        peak = Math.max(peak, await ev('__e("parts.length")'));
        frames.push((await send('Page.captureScreenshot', { format: 'png' }, sessionId)).data);
        if (follow || blade) { cxs.push(await ev(`__e("sx(me.x + ${blade ? 70 : 0}) * innerWidth / vw")`)); cys.push(await ev(`__e("sy(me.y + ${follow ? 90 : 0}) * innerWidth / vw")`)); }
      }
      if (name === 'voidme' || name === 'voidst') console.log('VOIDME distance every 0.25 s:', JSON.stringify(await ev('window.__vd')));
      // one contact sheet per blast: the frames cropped round it, in time order, labelled
      const png = await ev(`(async () => {
        const fr = ${JSON.stringify(frames)}, cxs = ${JSON.stringify(cxs)}, cys = ${JSON.stringify(cys)}, ts = ${JSON.stringify(times)}, cw = ${big ? 1280 : blade ? 380 : follow ? 300 : 520}, ch = ${big ? 640 : blade ? 290 : follow ? 300 : 400}, sc = ${big ? 0.28 : blade ? 0.96 : follow ? 1.2 : 0.7}, w = cw * sc, h = ch * sc;
        const c = document.createElement('canvas'); c.width = w * 3; c.height = h * Math.ceil(fr.length / 3); const q = c.getContext('2d');
        q.fillStyle = '#000'; q.fillRect(0, 0, c.width, c.height); q.font = '14px sans-serif'; q.fillStyle = '#fff';
        for (let i = 0; i < fr.length; i++) {
          const im = new Image(); im.src = 'data:image/png;base64,' + fr[i]; await im.decode();
          const dpr = im.width / innerWidth, X = (i % 3) * w, Y = Math.floor(i / 3) * h;
          q.drawImage(im, ((cxs[i] ?? ${cx}) - cw / 2) * dpr, ((cys[i] ?? ${cy}) - ch / 2) * dpr, cw * dpr, ch * dpr, X, Y, w, h);
          q.strokeStyle = '#444'; q.strokeRect(X, Y, w, h); q.fillText(ts[i] + ' ms', X + 6, Y + 18);
        }
        return c.toDataURL('image/png').split(',')[1]; })()`);
      await writeFile(join(OUT, `fx-${name}.png`), Buffer.from(png, 'base64'));
      report.push({ fx: name, peakParts: peak, lowQ: await ev('__e("lowQ")') });
    }
    // stress: eight rocket blasts at once, then one every 100 ms for 2 s; the frame time is the game's own average
    await ev(`__e('parts.length = impacts.length = rings.length = booms.length = waves.length = debris.length = 0')`);
    await wait(1500);
    await ev('__lab.work.length = 0'); await wait(1000);
    const f0 = await ev('__lab.work.reduce((a, b) => a + b, 0) / __lab.work.length'); await ev('__lab.work.length = 0');
    await ev(`(() => { for (let k = 0; k < 8; k++) __e('blastFx({ kind: K.ROCKET, x: me.x + 400 * Math.cos(' + k + '), y: me.y + 250 * Math.sin(' + k + ') })');
      let n = 0; const id = setInterval(() => { __e('blastFx({ kind: K.ROCKET, x: me.x + (Math.random() - 0.5) * 900, y: me.y + (Math.random() - 0.5) * 500 })'); if (++n >= 20) clearInterval(id); }, 100); })()`);
    let worst = 0, peak = 0;
    for (let i = 0; i < 25; i++) { await wait(100); peak = Math.max(peak, await ev('__e("parts.length")')); }
    const mean = await ev('__lab.work.reduce((a, b) => a + b, 0) / __lab.work.length'); worst = await ev('Math.max(...__lab.work)');
    report.push({ fx: 'stress', peakParts: peak, workMsIdle: +f0.toFixed(2), workMsMean: +mean.toFixed(2), workMsWorst: +worst.toFixed(1), lowQ: await ev('__e("lowQ")') });
  }
  const guns = process.env.FX ? [] : process.argv[2] ? process.argv[2].split(',') : await ev('__e("SANDBOX_GUNS")');
  for (const g of guns) for (const [mode, key] of [['primary', 'KeyF'], ['alt', 'KeyC']]) {
    const dist = g === 'gauntlet' ? 95 : g === 'saw' ? 115 : g === 'mine' ? 320 : g === 'nuke' || g === 'holy' ? 900 : 520;   // (each gun at a range it is made for)
    await ev(`(() => { const E = __e; window.__dist = ${dist}; E('keys').clear(); E('__lab.heal()'); E('shots.length = 0'); E('me.weapon = ${JSON.stringify(g)}'); E('renderWeapon()'); E('fireCd = 0'); })()`);
    await wait(500);
    const hp0 = await ev('__e("__lab.hp()")'), d0 = await ev('__e("__lab.deaths()")'), s0 = await ev('__e("stats.shots")');
    await ev('__lab.sounds.length = 0');
    await ev(`__e('keys').add(${JSON.stringify(key)})`);
    await wait(700); await shot(`${g}-${mode}-1`);
    await wait(700);
    await ev(`__e('keys').delete(${JSON.stringify(key)})`);
    await wait(150); await shot(`${g}-${mode}-2`);
    await wait(g === 'holy' || g === 'nuke' ? 3800 : 2000); await shot(`${g}-${mode}-3`);   // (slow shots and the demonic orb's draw land in this time)
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
