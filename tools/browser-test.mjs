// Real Chrome, local assets and an in-process two-broker relay. No public broker receives test traffic.
// BROWSER_PATH=/path/to/chrome npm run test:browser (Node 22+)
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = process.env.BROWSER_PATH;
assert.ok(chromePath, 'Set BROWSER_PATH to a Chrome/Chromium executable');
execFileSync(process.execPath, ['tools/build.mjs'], { cwd: root });
execFileSync(process.execPath, ['tools/build-audio-preview.mjs'], { cwd: root });
const gameplayChecks = await readFile(join(root, "tools/gameplay-checks.js"), "utf8");
const audioChecks = await readFile(join(root, "tools/audio-render-checks.js"), "utf8");
const weaponChecks = await readFile(join(root, "tools/weapon-audit-checks.js"), "utf8");
const hook = gameplayChecks + audioChecks + weaponChecks + `window.__t = {get activeBlasts(){return blastVoices}, renderArsenalPreview, runWeaponAuditChecks, checkContinuousAudio, metricsReport, checkAudioRender, keys, update, runGameplayChecks, renderDemonicPreview, WEAPONS, renderVfxPreview, renderWeapon, renderTele, renderShield, ampHud, settings, packHas, packBuf, engineHum, packLoops, K, SHOTS, hitPose, targetHit, recordHitPose, updateShots, volley, net, netSend, gotPing,
 checkDemonicAudio(){const original=audio.createBufferSource;let heard=0;audio.createBufferSource=function(){const src=original.call(audio),start=src.start.bind(src);src.start=(...args)=>{if(src.buffer===packBuf.p_user_demonic_explosion[0])heard++;return start(...args);};return src;};
 try {bodies=[];det=[];shots.length=0;me.x=100;me.y=100;me.inv=1e15;
 const far=volley(me,performance.now(),WEAPONS.gamma,{x:1700,y:100});far.life=0;updateShots(0.016,performance.now());
 const manual=volley(me,performance.now(),WEAPONS.gamma,{x:200,y:100});detonateOrb({mine:true,x:manual.x,y:manual.y});updateShots(0.016,performance.now());return heard;
 }finally{audio.createBufferSource=original;}},
 isolate(){bodies=[];det=[];shots.length=0;},
 me, stats, PACK_PATHS, PACK_VOICES, SFX_NAMES, sfxBuf, queueVoice, get voiceActive(){return voiceActive?.name}, get voiceQueue(){return voiceQueue.map(v=>v.name)}, setScoreLimit(v){SCORE_LIMIT=v}, setEnd(v){matchEnd=v}, getFrame(){return frameAvg}, startMatch, roundAt, receiveMatchClock, playerRows, renderBoard, foundryOpen, foundryPoint, foundryRoute, stationMap, beamReach, solidAny, spawnPoint, get arena(){return arena}, get match(){return [matchRound,matchStart,matchEnd]}, updateJunk, rock, rockMotion, clockNow, get world(){return world}, deathFx, hurt, ctfTick, roundTick, shoot, carveAt, nextTerrain, applyTerrain,
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
    if (file.endsWith('/index.html')) data = Buffer.from(data.toString().replace('update(now < hitStopUntil ? 0 : dt, now); draw(now);', 'if (!window.__pauseGame) update(now < hitStopUntil ? 0 : dt, now); draw(now);').replace('})();\n</script>', hook + '})();\n</script>'));
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' })[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'bin-rocket-browser-'));
const chrome = spawn(chromePath, ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
 '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
 '--autoplay-policy=no-user-gesture-required', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
const errors = [], pages = [], traffic = [];
let relayDelay = 0, dropFire = false, dropStates = false;
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
        if ((dropFire && packet.topic.includes('/f/')) || (dropStates && packet.topic.includes('/s/'))) return;
        for (const page of pages) {
          const deliver = () => send('Runtime.evaluate', { expression: `window.__receive && window.__receive(${JSON.stringify(packet)})` }, page).catch(e=>errors.push(e.message));
          if (relayDelay) setTimeout(deliver, relayDelay); else await deliver();
        }
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
    const { browserContextId } = await send('Target.createBrowserContext');
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true, browserContextId });
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
  async function join(page, name, host = true) {
    await evaluate(page, `document.getElementById('nameInput').value=${JSON.stringify(name)};
      document.getElementById('lobbyInput').value=__code;
      document.getElementById('lobbyInput').dispatchEvent(new Event('input'));
      ${host ? "localStorage.setItem('binrocket.hosted',JSON.stringify([__code.toLowerCase()]));" : ''}
      document.getElementById('startForm').requestSubmit();`);
    await until(page, '__t.playing && __mqtt.length === 3 && __t.roundLive');
    await evaluate(page, '__t.me.inv=1e15');
  }
  let smoke;
  if (!process.env.BRS_COMBAT_ONLY) {
  const a = await page(); await join(a, 'Primary');
  const hole = await evaluate(a, `(()=>{const i=__t.det.findIndex(b=>b.planet&&!b.free&&!b.dead); const b=__t.det[i];
    const before=Array.from(b.cells); __t.carveAt(b,b.x,b.y,60,true);
    return {i,removed:Array.from(b.cells).flatMap((v,k)=>before[k]&&!v?[k]:[])};})()`);
  assert.ok(hole.removed.length > 0, 'A real canvas crater was cut');
  await wait(4500); // outside the old four-second carve history
  const b = await page(true); await join(b, 'Backup', false);
  await until(a, `[...__t.remotes.values()].some(r=>r.name==='Backup')`);
  await until(b, `[...__t.remotes.values()].some(r=>r.name==='Primary')`);
  await until(b, `${JSON.stringify(hole.removed)}.every(k=>__t.det[${hole.i}].cells[k]===0)`, 20000);
  const shot = await evaluate(a, `(()=>{__t.me.weapon='fire';__t.shoot(performance.now());return __t.myShotLog.at(-1).d[0]})()`);
  await until(b, `__t.seenShots.has(${JSON.stringify(shot)})`);
  const knocked = await evaluate(a, `(()=>{const t=__t,k=t.world.rocks.find(k=>k.age>1&&k.age<15&&k.x>200&&k.y>200),old=k.vx;
    t.me.x=k.x-k.r-25;t.me.y=k.y;t.me.vx=k.vx+400;t.me.vy=k.vy;t.me.lv=1;t.me.dead=false;
    t.updateJunk(0.016,performance.now());const result={slot:k.slot,gen:k.gen,vx:k.vx,old};
    t.me.x=100;t.me.y=100;t.me.vx=t.me.vy=0;return result;})()`);
  assert.ok(knocked.vx>knocked.old);
  await until(b, `__t.rockMotion.get(${knocked.slot})?.gen===${knocked.gen}`,5000);
  const remoteSpeed=await evaluate(b, `__t.rockMotion.get(${knocked.slot}).vx`);
  assert.ok(Math.abs(remoteSpeed-knocked.vx)<0.001);
  console.log('PASS asteroid impulse persists and reaches the other browser');
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
  smoke = await page();
  await evaluate(smoke, "window.__code='M1C0SSMOK'");
  await evaluate(smoke, `new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/tools/smoke.js';s.onload=resolve;s.onerror=reject;document.body.append(s)})`);
  await until(smoke, '!!window.__smoke', 90000);
  const result = await evaluate(smoke, '__smoke');
  assert.deepEqual(result.errors, []);
  for (const [weapon, kinds] of Object.entries(result.fired)) assert.ok(kinds.length, 'Weapon fired: ' + weapon + ' ' + JSON.stringify(result.missed));
  assert.equal(Object.keys(result.fired).length, 11); assert.ok(result.ctfCaps > 0);
  assert.deepEqual(result.altCost, {rocket:3,scatter:2,triple:1,mine:0});   // mines: the alt is Detonate (free, and nothing to set off yet)
  console.log('PASS six-bot weapon/death/CTF smoke', JSON.stringify(result));
  }
  const combat = await page(); await evaluate(combat, "window.__code='M1D0SCOMB'"); await join(combat, 'Combat');
  await evaluate(combat, 'window.__pauseGame=true');
  const combatResult = await evaluate(combat, '__t.runGameplayChecks()');
  console.log('PASS real gameplay checks', combatResult);
  const minigun = await evaluate(combat, `(()=>{const t=__t;t.me.weapon='minigun';t.me.arsenal.minigun=100;t.renderWeapon();
    const before=t.shots.length;t.shoot(performance.now(),true);
    const altShots=t.shots.length-before,altAmmo=t.me.arsenal.minigun;t.shoot(performance.now(),false);
    return {altDefined:!!t.WEAPONS.minigun.alt,altShots,altAmmo,primaryShots:t.shots.length-before,ammo:t.me.arsenal.minigun};})()`);
  assert.deepEqual(minigun,{altDefined:true,altShots:1,altAmmo:98,primaryShots:2,ammo:97});
  if(process.env.BRS_DEMONIC_PREVIEW) {const png=await evaluate(combat,'__t.renderDemonicPreview()');await writeFile(process.env.BRS_DEMONIC_PREVIEW,Buffer.from(png.split(',')[1],'base64'));}
  await until(combat, '["p_pickup","p_kill","p_charge","p_sting","p_death","p_engine","a_firstblood","v_flawless","p_loop_minigun","p_start_minigun","p_stop_minigun","p_stop_laser","p_fire_laser","p_loop_laser","p_ship_engine","p_warp","p_ut_mini_fire","p_ut_mini_alt","p_ut_mini_stop","p_ut_fire","p_ut_flak_fire","p_ut_rocket_load","p_ut_pulse_fire","p_ut_pulse_bolt","p_ut_pulse_down","p_ut_pulse_explode","p_burst_minigun","p_user_engine","p_user_fire","p_user_demonic","p_user_demonic_explosion","p_user_cannon","p_user_autocannon","p_user_explosion","p_user_massive"].every(__t.packHas) && !!__t.sfxBuf.hit && !!__t.sfxBuf.boom_low',10000);
  console.log('PASS weapon audit scenarios', await evaluate(combat,'__t.runWeaponAuditChecks()'));
  console.log('PASS continuous audio', await evaluate(combat,'__t.checkContinuousAudio()'));
  await until(combat,'__t.activeBlasts===0',10000);
  assert.equal(await evaluate(combat,'__t.checkDemonicAudio()'),2,'the supplied explosion starts on distant expiry and manual detonation');
  const decoded = await evaluate(combat, 'Object.fromEntries(["p_pickup","p_kill","p_charge","p_sting","p_death","p_engine"].map(k=>[k,+__t.packBuf[k][0].duration.toFixed(2)]))');
  await evaluate(combat, '__t.settings.engine="on";__t.engineHum(500,1,1,performance.now())');
  assert.equal(await evaluate(combat, '__t.packLoops.engine?.ev'), 'p_ship_engine');
  assert.equal(await evaluate(combat, '__t.packLoops.engine.src.buffer===__t.packBuf.p_ship_engine[0]'),true);
  await evaluate(combat, '__t.engineHum(500,1,0,performance.now())');await until(combat,'__t.packLoops.engine.g.gain.value>0.4 && __t.packLoops.engine.g.gain.value<0.45',3000);
  const engineLevel=await evaluate(combat,'({gain:__t.packLoops.engine.g.gain.value,pitch:__t.packLoops.engine.src.playbackRate.value})');
  assert.ok(engineLevel.gain>0.4 && engineLevel.gain<0.45,'engine thrust is audible');
  assert.ok(engineLevel.pitch>0.96 && engineLevel.pitch<1.12,'recorded timbre is preserved');
  await evaluate(combat, '__t.engineHum(800,1.4,2,performance.now())');await until(combat,'__t.packLoops.engine.g.gain.value>0.56',3000);
  assert.ok(await evaluate(combat,'__t.packLoops.engine.g.gain.value>0.56'),'boost is louder');
  await evaluate(combat, '__t.engineHum(0,0,0,performance.now())');
  assert.equal(await evaluate(combat, '!!__t.packLoops.engine'), false);
  console.log('PASS decoded supplemental audio, supplied voices and engine start/stop',decoded);
  const rendered = await evaluate(combat,'__t.checkAudioRender()');
  console.log('Audio render measurements',JSON.stringify(rendered));
  assert.ok(rendered.engine.rms > 0.04, 'engine has a measurable output level, not just a loaded buffer');
  assert.ok(Math.abs(rendered.engine.rms-rendered.duckedEngine.rms)<0.0001,'announcer ducking does not silence thrust');
  assert.ok(rendered.fidelityError < 0.00001, 'mixer preserves quiet transients, timbre and stereo sample for sample');
  for(const shot of rendered.shots) assert.equal(shot.channels, 2, 'preserve source stereo: '+shot.name);
  assert.ok(rendered.battle.peak < 1, 'dense weapon mix stays below full scale');
  await evaluate(combat, '__t.isolate();__t.me.dead=false;__t.me.vx=__t.me.vy=__t.me.thrust=0;__t.keys.add("KeyW");for(let i=0;i<30;i++)__t.update(1/60,performance.now()+i*16.67)');
  assert.equal(await evaluate(combat,'__t.packLoops.engine?.ev'),'p_ship_engine','movement input starts the new engine through the real game update');
  await evaluate(combat,'__t.keys.clear();__t.hurt(performance.now(),99,true);__t.me.respawnAt=1e15;__t.update(1/60,performance.now());');
  assert.equal(await evaluate(combat,'!!__t.packLoops.engine'),false,'death stops the engine through the real game update');
  await evaluate(combat,'__t.me.dead=false');

  await evaluate(combat, '__t.me.weapon="gamma";__t.me.teleN=99;__t.me.shield=3;__t.me.ampUntil=performance.now()+20000;__t.renderWeapon();__t.renderTele();__t.renderShield();__t.ampHud(performance.now())');
  for (const width of [320,390,700,1024,1440,1920]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600},combat);
    await wait(100);
    const hud = await evaluate(combat,`(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect(),a=rect('.score'),b=rect('.match-clock'),c=rect('.hud-tools');
      const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
      return {overlap:overlaps(a,b)||overlaps(a,c)||overlaps(b,c),overflow:document.documentElement.scrollWidth>innerWidth,below:a.top>=b.bottom};})()`);
    assert.equal(hud.overlap,false,'HUD overlap at '+width);assert.equal(hud.overflow,false,'HUD overflow at '+width);assert.equal(hud.below,true);
    if(process.env.BRS_HUD_PREVIEW && width===1440){const shot=await send('Page.captureScreenshot',{format:'png'},combat);await writeFile(process.env.BRS_HUD_PREVIEW,Buffer.from(shot.data,'base64'));}
  }
  console.log('PASS clock, full weapon/teleport/power-up HUD and settings do not overlap at 320–1920px');
  if(process.env.BRS_ARSENAL_PREVIEW) {
    const png=await evaluate(combat,'__t.renderArsenalPreview()');
    await writeFile(process.env.BRS_ARSENAL_PREVIEW,Buffer.from(png.split(',')[1],'base64'));
  }
  if(process.env.BRS_VFX_PREVIEW) {
    const png=await evaluate(combat,'__t.renderVfxPreview()');
    await writeFile(process.env.BRS_VFX_PREVIEW,Buffer.from(png.split(',')[1],'base64'));
  }


  // Two actual clients, 140 ms each way to relay delivery. Movement history is controlled so
  // the victim has moved off the visible firing line by the time the rail arrives.
  const lagA = await page(), lagB = await page();
  for(const p of [lagA,lagB]) await evaluate(p, "window.__code='M1D0SLAGG'");
  await join(lagA,'Lag shooter');await join(lagB,'Lag victim',false);
  await until(lagA, "[...__t.remotes.values()].some(r=>r.name==='Lag victim')");
  await until(lagB, "[...__t.remotes.values()].some(r=>r.name==='Lag shooter')");
  for(const p of [lagA,lagB]) await evaluate(p, 'window.__pauseGame=true;__t.isolate();for(let i=0;i<30;i++) __t.gotPing(140);__t.me.lv=1;__t.me.dead=false;__t.me.inv=0;__t.me.shield=0;__t.me.lives=10;__t.me.vx=__t.me.vy=0;__t.me.a=0;__t.me.ampUntil=0');
  await evaluate(lagA, '__t.me.x=100;__t.me.y=600;__t.netSend(1,performance.now())');
  await evaluate(lagB, '__t.me.x=600;__t.me.y=600;__t.netSend(1,performance.now())');
  await wait(250);
  relayDelay=140;dropStates=true;
  await evaluate(lagB, '__t.me.hitHistory=[];__t.recordHitPose(__t.me,performance.now()-100);__t.recordHitPose(__t.me,performance.now())');
  const lagShot = await evaluate(lagA, "__t.volley(__t.me,performance.now(),{shot:[__t.K.RAIL,4200]},{x:100,y:600}).id");
  await wait(70);
  await evaluate(lagB, '__t.me.y=750;__t.recordHitPose(__t.me,performance.now())');
  await until(lagB, `__t.seenShots.has(${JSON.stringify(lagShot)})`,3000);
  const lagDebug = await evaluate(lagB, '({now:performance.now(),shot:__t.shots[0],history:__t.me.hitHistory,pose:__t.hitPose(__t.shots[0],__t.me),round:__t.roundLive,remotes:[...__t.remotes.values()].map(r=>({tag:r.tag,ping:r.ping,off:r.off,tm:r.tm}))})');
  const lagHealth = await evaluate(lagB, '__t.updateShots(0.016,performance.now());__t.me.lives');
  if(lagHealth!==7.6) console.log('LAG DEBUG',JSON.stringify(lagDebug));
  assert.equal(lagHealth,7.6,'delayed rail hits historical position exactly once');
  dropStates=false;await evaluate(lagA,'__t.netSend(1,performance.now())');await wait(350);
  assert.equal(await evaluate(lagB,'__t.updateShots(0.016,performance.now());__t.me.lives'),7.6,'journal and second broker cannot repeat damage');
  // Lose the immediate channel; the repeated state journal must still deliver the shot.
  dropFire=true;
  const recovered = await evaluate(lagA, "__t.volley(__t.me,performance.now(),{shot:[__t.K.NAIL,1500]},{x:100,y:600}).id");
  await evaluate(lagA,'__t.netSend(1,performance.now())');
  await until(lagB,`__t.seenShots.has(${JSON.stringify(recovered)})`,3000);
  dropFire=false;relayDelay=0;
  // A real delayed bullet is recovered from state, swept through its missing flight time,
  // and produces one confirmed hit at the shooter despite duplicated broker deliveries.
  for(const p of [lagA,lagB]) await evaluate(p, '__t.isolate();__t.me.hitHistory=[];__t.me.inv=0;__t.me.dead=false;__t.me.lives=10');
  await evaluate(lagB, '__t.me.x=400;__t.me.y=600;__t.netSend(1,performance.now())');
  await wait(120);
  const hitsBefore=await evaluate(lagA,'__t.stats.hits');
  await evaluate(lagB,'__t.recordHitPose(__t.me,performance.now()-260);__t.recordHitPose(__t.me,performance.now())');
  relayDelay=140;dropFire=true;
  const bullet=await evaluate(lagA,'__t.volley(__t.me,performance.now(),{shot:[__t.K.BULLET_ALT,2600]},{x:100,y:600}).id');
  await evaluate(lagA,'__t.netSend(1,performance.now())');
  await until(lagB,`__t.seenShots.has(${JSON.stringify(bullet)})`,3000);
  assert.equal(await evaluate(lagB,'__t.recordHitPose(__t.me,performance.now());__t.updateShots(0.016,performance.now());__t.me.lives'),8.86,'delayed heavy bullet catches up and hits');
  await evaluate(lagB,'__t.netSend(1,performance.now())');
  await until(lagA,`__t.stats.hits===${hitsBefore+1}`,3000);
  await evaluate(lagB,'__t.netSend(1,performance.now())');await wait(300);
  assert.equal(await evaluate(lagA,'__t.stats.hits'),hitsBefore+1,'duplicate confirmation is credited once');
  dropFire=false;relayDelay=0;
  console.log('PASS delayed hitscan and bullet damage, confirmed hit, duplicate suppression and dropped-shot recovery');
  // The free command after the last round must reach the other browser too.
  dropFire=false;relayDelay=0;
  for(const [weapon,kind] of [['gamma',13],['mine',6]]) {
    for(const p of [lagA,lagB]) await evaluate(p,'__t.isolate();__t.me.dead=false;__t.me.inv=1e15;__t.me.x=100;__t.me.y=100;__t.me.vx=__t.me.vy=0');
    const id=await evaluate(lagA,`__t.me.weapon=${JSON.stringify(weapon)};__t.me.arsenal[${JSON.stringify(weapon)}]=1;__t.shoot(performance.now(),false);__t.netSend(1,performance.now());__t.myShotLog.at(-1).d[0]`);
    await until(lagB,`__t.shots.some(s=>s.id===${JSON.stringify(id)})`);
    assert.equal(await evaluate(lagA,'__t.me.weapon'),weapon,'last-round command slot over network');
    if(weapon==='mine') await evaluate(lagA,`__t.shots.find(s=>s.id===${JSON.stringify(id)}).life-=0.8`);
    if(weapon==='saw') for(const p of [lagA,lagB]) await evaluate(p,`const blade=__t.shots.find(s=>s.id===${JSON.stringify(id)});blade.x=blade.px=500;blade.y=blade.py=100`);
    await evaluate(lagA,'__t.shoot(performance.now()+2000,true);__t.netSend(1,performance.now())');
    const command=await evaluate(lagA,'__t.myShotLog.at(-1).d[0]');
    await until(lagB,`__t.seenShots.has(${JSON.stringify(command)})`);
    await evaluate(lagB,'__t.updateShots(0.016,performance.now())');
    if(weapon==='mine') {await wait(750);await evaluate(lagB,'__t.updateShots(0.016,performance.now())');}
    assert.equal(await evaluate(lagB,`(()=>{const s=__t.shots.find(s=>s.id===${JSON.stringify(id)});return ${weapon==='saw'?'!!s?.returning':'!s || s.life<=0 || !!s.boom'};})()`),true,'remote '+weapon+' command');
  }
  console.log('PASS last gamma/mine commands reach the other browser');
  for (const [weapon, alt, kind] of [['fire',false,29],['minigun',true,31],['saw',true,30],['laser',false,32],['laser',true,2]]) {
    for(const p of [lagA,lagB]) await evaluate(p,'__t.isolate();__t.me.dead=false;__t.me.inv=1e15');
    const id=await evaluate(lagA,`__t.me.weapon=${JSON.stringify(weapon)};__t.me.arsenal[${JSON.stringify(weapon)}]=20;__t.shoot(performance.now(),${alt});__t.netSend(1,performance.now());__t.myShotLog.at(-1).d[0]`);
    await until(lagB,`__t.shots.some(s=>s.id===${JSON.stringify(id)}&&s.kind===${kind})`);
  }
  console.log('PASS new UT projectile kinds and modes reach the other browser');

  // Max-sized crater history plus six busy bots must still fit the receiver's byte limit.
  if (smoke) {
  await evaluate(smoke, `(()=>{const t=__t, now=performance.now();
    for(let i=0;i<320;i++) t.myCarves.push({at:now,d:[t.stats.round,0,3000,3000,700,100000+i]});
    t.myShotLog.push(...Array.from({length:24},(_,i)=>({at:now,d:['stress.s'+i,10000,10000,4500,4500,0,5,1,0,Date.now()]})));
    for(const b of t.bots) {b.hitBy=Array.from({length:12},(_,i)=>'stress.'+i);b.koBy=b.hitBy.slice();
      b.shotLog=Array.from({length:9},(_,i)=>({at:now,d:[b.tag+'.s'+i,10000,10000,-4500,4500,0,5,1,0,Date.now()]}));}
  })()`);
  await wait(400);
  const phone = await page(true, true); await join(phone, 'Mobile',false);
  await until(phone, '__t.remotes.size > 0');
  const mobile = await evaluate(phone, '({w:innerWidth, mode:__t.mode, playing:__t.playing})');
  assert.equal(mobile.playing, true); console.log('PASS mobile viewport', JSON.stringify(mobile));
  }
  const foundry = await page();
  await evaluate(foundry, "window.__code='M1C0FFORG';localStorage.setItem('binrocket.hosted',JSON.stringify([__code.toLowerCase()])); const slider=document.getElementById('botCount');slider.value=24;slider.dispatchEvent(new Event('input'))");
  await join(foundry, 'Foundry host');
  await until(foundry, '__t.bots.length===24 && __t.remotes.size===24');
  const layout = await evaluate(foundry, `(()=>{const t=__t;
    return {station:t.stationMap(),rocks:t.world.rocks.length,sparks:t.world.sparks.length,walls:t.bodies.length,
      blockedSpots:[...t.arena.guns,...t.arena.supplies,t.arena.amp,...t.bases].filter(p=>t.solidAny(p.x,p.y)).length,
      rows:t.playerRows().length,timer:document.getElementById('roundInfo').textContent,
      hidden:document.getElementById('scoreboard').hidden};})()`);
  assert.equal(layout.station,true);assert.equal(layout.rocks,0);assert.equal(layout.sparks,0);assert.equal(layout.blockedSpots,0);
  assert.equal(layout.rows,25);assert.equal(layout.hidden,true);assert.match(layout.timer,/Round 1/);
  assert.equal(await evaluate(foundry,"document.activeElement.id"),'c');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},foundry);
  assert.equal(await evaluate(foundry,"document.getElementById('scoreboard').hidden"),false);
  assert.equal(await evaluate(foundry,"document.querySelectorAll('#board li:not(.team)').length"),25);
  await evaluate(foundry,"dispatchEvent(new WheelEvent('wheel',{deltaY:300,bubbles:true,cancelable:true}))");
  assert.ok(await evaluate(foundry,"document.getElementById('scoreboard').scrollTop > 0"));
  await evaluate(foundry,"dispatchEvent(new KeyboardEvent('keyup',{code:'Tab',key:'Tab',bubbles:true,cancelable:true}))");
  assert.equal(await evaluate(foundry,"document.getElementById('scoreboard').hidden"),true);
  const walls = await evaluate(foundry,`(()=>{const t=__t,p=t.foundryPoint(10,10),b=t.bodies.find(b=>b.fixed),mass=b.mass;
    t.carveAt(b,b.x,b.y,700,true); return {preserved:b.mass===mass,reach:t.beamReach({x:p.x,y:p.y,vx:0,vy:-4200,kind:t.K.RAIL})};})()`);
  assert.equal(walls.preserved,true);assert.ok(walls.reach>0 && walls.reach<400);
  const guest = await page(true);await evaluate(guest,"window.__code='M1C0FFORG'");await join(guest,'Foundry guest',false);
  await until(guest,"[...__t.remotes.values()].filter(r=>r.host).length===24",20000);
  assert.deepEqual(await evaluate(guest,'__t.match'),await evaluate(foundry,'__t.match'));
  await wait(8000);
  const performanceResult=await evaluate(foundry,'({frameMs:Math.round(__t.getFrame()*1000),kills:__t.bots.reduce((n,b)=>n+b.st.kills,0),shots:__t.bots.reduce((n,b)=>n+b.st.shots,0),stuck:__t.bots.filter(b=>!b.dead&&__t.solidAny(b.x,b.y)).length})');
  assert.ok(performanceResult.shots>0);assert.equal(performanceResult.stuck,0);
  console.log('PASS Foundry connected corridors, fixed shell, 24 networked bots, Tab roster',layout,performanceResult);
  if (process.env.BRS_BALANCE_REPORT) {
    await evaluate(foundry,'__t.setScoreLimit(0);__t.setEnd(__t.clockNow()+180000)');
    for(let i=0;i<6;i++) {await wait(30000);console.log('Match sample', (i+1)*30, 'seconds');}
    const report=await evaluate(foundry,'__t.metricsReport()');
    await writeFile(process.env.BRS_BALANCE_REPORT,JSON.stringify(report,null,2));
    assert.ok(report.rows.some(r=>r.damageValidated>0),'match measurements include actual damage');
    console.log('PASS three-minute hosted-bot match measurements',report.rows.length,'rows');
  }
  // Decode every shipped sample, including the new voice and atmosphere files.
  const audioAudit=await evaluate(foundry,`(async()=>{const paths=await fetch('sfx/pack/index.json').then(r=>r.json());
    const context=new AudioContext();let samples=0;for(const path of paths){const response=await fetch('sfx/pack/'+path);if(!response.ok)throw Error(path);
      const buffer=await context.decodeAudioData(await response.arrayBuffer());if(!buffer.duration)throw Error('empty '+path);samples++;}
    await context.close();return samples;})()`);
  console.log('PASS all sound-pack files decode',audioAudit);
  if(process.env.BRS_FOUNDRY_PREVIEW){
    await evaluate(foundry,'Object.assign(__t.me,__t.foundryPoint(10,10));__t.me.inv=1e15');await wait(300);
    const shot=await send('Page.captureScreenshot',{format:'png'},foundry);await writeFile(process.env.BRS_FOUNDRY_PREVIEW,Buffer.from(shot.data,'base64'));
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},foundry);
    await wait(300);
    const small=await send('Page.captureScreenshot',{format:'png'},foundry);await writeFile(process.env.BRS_FOUNDRY_PREVIEW.replace('.png','-mobile.png'),Buffer.from(small.data,'base64'));
    assert.equal(await evaluate(foundry,'document.documentElement.scrollWidth>innerWidth'),false);
    await evaluate(foundry,"document.getElementById('scoreBtn').click()");
    assert.equal(await evaluate(foundry,"document.getElementById('scoreboard').hidden"),false);
    await evaluate(foundry,"document.getElementById('scoreBtn').click()");
  }
  // The score-limit finish, clock replication and reset run through the real game functions.
  await evaluate(foundry,'window.__pauseGame=true;__t.setScoreLimit(3);__t.me.caps=3;__t.roundTick(performance.now());__t.netSend(1,performance.now())');
  await until(guest,'!__t.roundLive');
  assert.match(await evaluate(foundry,"document.getElementById('roundInfo').textContent"),/next round in 15s/);
  await evaluate(foundry,'__t.setEnd(__t.clockNow()-15001);__t.roundTick(performance.now())');
  assert.equal(await evaluate(foundry,'__t.me.caps'),0);
  assert.equal(await evaluate(foundry,'__t.bots.every(b=>b.lv===1&&b.xp===0&&b.st.kills===0)'),true);
  console.log('PASS score-limit finish, guest clock and full round reset');
  const preview=await page();
  await send('Page.navigate',{url:url+'/audio-preview.html'},preview);
  await until(preview,'!!document.querySelector("[data-play=engine]")');
  for(const mode of ['engine','minigun','minigun-alt','pulse','pulse-alt','fight']) {
    await evaluate(preview,`document.querySelector('[data-play="${mode}"]').click()`);
    await until(preview,'document.querySelector("#status").textContent!=="Загрузка…"');
    assert.equal(await evaluate(preview,'document.querySelector("#status").textContent.startsWith("Не удалось")'),false,'preview '+mode);
    if(mode.includes('minigun')||mode.includes('pulse')) assert.equal(await evaluate(preview,'!!packLoops["fire:me"]'),true,'preview loop '+mode);
    await evaluate(preview,'document.querySelector("#stop").click()');
  }
  console.log('PASS standalone sound preview and playback controls');
  assert.deepEqual(errors, []);
  const max = Math.max(...traffic.map(p=>p.bytes));
  assert.ok(max <= 65536, 'All state packets fit receiver limit: ' + max);
  console.log('PASS browser errors=0; maximum packet bytes=' + max);
} finally {
  if (socket) socket.close();
  const exited = new Promise(r => chrome.once('exit', r)); chrome.kill(); await exited;
  server.closeAllConnections(); await new Promise(r => server.close(r));
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
