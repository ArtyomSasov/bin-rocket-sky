const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { legacy } = require('./lib/source.cjs');
const read = legacy;
function setup() {
  const started = [], timers = [], gainTargets = [], listeners = {};
  const node = () => ({ connect() { return this; }, gain: { value: 1 } });
  const c = { performance: { now: () => 1000 }, document: { hidden: false, addEventListener: (name, f) => { listeners[name] = f; } },
    audio: { currentTime: 1, createGain: node, createBufferSource() {
      const src = { ...node(), playbackRate: { value: 0 }, start() { started.push(src); }, stop() { this.onended?.(); } }; return src;
    } }, voiceBus: node(), mixBus: { gain: { setTargetAtTime: n => gainTargets.push(n) } },
    packBuf: { a_firstblood: [{ name: 'first' }], a_doublekill: [{ name: 'double' }], v_win: [{ name: 'win' }] }, sfxBuf: {},
    setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {}, sfx: () => true, packKnows: n => /^(a_|v_)/.test(n) };
  vm.createContext(c); vm.runInContext(read('05b-audio-cues.js'), c);
  return { c, started, gainTargets, timers, listeners };
}
test('announcer: a kill call speaks at once and cuts the previous one (as in UT); round calls keep their turn; pitch stays put', () => {
  const { c, started, timers, gainTargets } = setup();
  c.queueVoice('a_firstblood'); c.queueVoice('a_doublekill'); c.queueVoice('a_doublekill');
  assert.equal(started.length, 2, 'double kill did not wait for first blood to finish');
  assert.equal(started[1].buffer.name, 'double'); assert.equal(started[1].playbackRate.value, 1);
  c.queueVoice('v_win');
  assert.equal(started.length, 2, 'the result waits for the line being spoken');
  started[1].onended(); timers.pop()();
  assert.equal(started.length, 3); assert.equal(started[2].buffer.name, 'win');
  c.queueVoice('a_doublekill');
  assert.equal(started.length, 3, 'a kill call does not cut a round call');
  assert.deepEqual(gainTargets, [0.55, 0.55, 1, 0.55]);
});
test('announcer waits for decoded recordings and drops speech when the tab is hidden', () => {
  const { c, started, timers, listeners } = setup();
  c.queueVoice('a_capturetheflag'); assert.equal(started.length, 0);
  c.packBuf.a_capturetheflag = [{ name: 'ctf' }]; timers.pop()();
  assert.equal(started[0].buffer.name, 'ctf');
  c.document.hidden = true; listeners.visibilitychange();
  assert.equal(c.queueVoice('a_firstblood'), false);
});
test('each mapped pack event has a shipped file and every shipped file maps to an event', () => {
  const c = {}; vm.createContext(c);
  const source = read('05-sound.js');
  vm.runInContext(source.slice(source.indexOf('  const PACK_PATHS'), source.indexOf('  const packBuf')) + '\nglobalThis.paths=PACK_PATHS;', c);
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(wav|ogg|mp3)$/.test(e.name) ? [path.join(dir, e.name)] : []);
  const root = path.join(__dirname, '../sfx/pack'), files = walk(root).map(p => path.relative(root, p));
  const events = new Set(files.map(f => c.packEventFor(f)));
  for (const event of Object.keys(c.paths)) assert.ok(events.has(event), event);
  for (const file of files) assert.ok(c.packEventFor(file), file);
});

test('primary fire, boost, collisions and large blasts select the replacement recordings', () => {
  const played = [], later = [];
  const c = { audio: { currentTime: 1,
    createBufferSource() { const s = { playbackRate: {}, connect() { return this; }, start() { played.push(this.buffer); } }; return s; },
    createGain() { return { gain: {}, connect() { return this; } }; }
  }, packBuf: Object.fromEntries(['p_ut_fire', 'p_ut_rocket_fire', 'p_ut_rocket_boom', 'p_ut_nuke_boom', 'p_ut_mini_fire', 'p_ut_flak_fire', 'p_ut_flak_boom', 'p_user_demonic', 'p_user_demonic_explosion', 'p_user_cannon', 'p_user_autocannon', 'p_user_explosion', 'p_user_massive', 'p_burst_minigun', 'p_fire_rocket', 'p_fire_gren', 'p_boom_rocket', 'p_boom_mine', 'p_warp', 'p_metal'].map(k => [k, [k]])),
    sfxBuf: { boom_low: 'low' }, SFX_TUNE: {}, sfxBus: {}, userBus: {}, engineBus: {}, priorityBus:{}, priorityVoices:0, heavyBus: {}, sfxVoices: 0, blastVoices: 0, me:{x:0,y:0},
    document: { hidden: false, addEventListener() {} }, setTimeout: f => later.push(f), queueVoice() {} };
  const source = read('05-sound.js'); vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('  const packListed'), source.indexOf('  // ---------- the energy blades')) + '\nfor (const k in packBuf) packListed.add(k);', c);
  c.sfx('fire'); c.sfx('dash'); c.sfx('crash'); c.sfx('crash');
  assert.deepEqual(played, ['p_ut_fire', 'p_warp', 'p_metal']);
  for (const event of ['p_death', 'p_boom_nuke', 'p_boom_holy', 'p_fire_gamma', 'p_boom_gamma', 'p_fire_minigun', 'p_fire_rocket', 'p_fire_gren', 'p_fire_shard', 'p_boom_shard', 'p_boom_rocket', 'p_boom_mine']) c.sfx(event);
  assert.deepEqual(played.slice(3), ['p_user_explosion', 'p_ut_nuke_boom', 'p_user_massive', 'p_user_demonic', 'p_user_demonic_explosion', 'p_ut_mini_fire', 'p_ut_rocket_fire', 'p_fire_gren', 'p_ut_flak_fire', 'p_ut_flak_boom', 'p_ut_rocket_boom', 'p_boom_mine']);
  assert.equal(later.length, 0, 'custom explosion tails are not covered with the old extra layers');
  const before = played.length; c.packBuf.p_ut_rocket_fire = []; c.packBuf.p_fire_rocket = ['original rocket']; c.sfx('p_fire_rocket');
  assert.equal(played.length, before, 'while its own sound loads, an event stays silent rather than play another');
  c.sfxVoices=29;c.blastVoices=0;
  c.sfx('p_boom_gamma',1,1,1700,0);
  assert.equal(played.at(-1),'p_user_demonic_explosion','a distant demonic blast survives the ordinary voice limit');
  const count=played.length;c.blastVoices=4;c.sfx('p_boom_gamma');assert.equal(played.length,count,'reserved voices stay bounded');
});

test('rocket uses UT and grenade keeps Quake while the demonic orb plays its own explosion once', () => {
  const events = [];
  const c = { K:{MINE:6,ORB:7,GAMMA:13,ROCKET:1,GREN:23}, me:{x:0,y:0}, lowQ:true, shake:0,
    impacts:[],rings:[],arcs:[], post:null, explode(){},puff(){},smoke(){},
    packPlay(name){events.push(name);return true;},sfx(){throw Error('unexpected fallback');} };
  vm.createContext(c); const source=read('11-weapons.js');
  vm.runInContext(source.slice(source.indexOf('  function blastFx'),source.indexOf('  let hitTickAt')),c);
  for(const kind of [1,23,13]) {const shot={kind,x:kind===13?1700:20,y:20};c.blastFx(shot);c.blastFx(shot);}
  assert.deepEqual(events,['p_boom_rocket','p_quake_grenade_boom','p_boom_gamma','p_blast_heavy']);   // (the demonic orb: its own blast with a heavy one under it)
});

test('the jet engine is made here: it roars up with the throttle, lights its afterburner on boost and falls silent when it should', () => {
  const param = v => ({ value: v, setValueAtTime(x) { this.value = x; }, setTargetAtTime(x) { this.value = x; }, exponentialRampToValueAtTime(x) { this.value = x; } });
  const node = extra => ({ connect(x) { return x; }, start() {}, stop() {}, ...extra });
  const audio = { currentTime: 0, sampleRate: 8000,
    createBuffer: (n, len) => ({ getChannelData: () => new Float32Array(len) }), createBufferSource: () => node({ loop: false }),
    createGain: () => node({ gain: param(1) }), createBiquadFilter: () => node({ type: '', frequency: param(0), Q: param(1) }),
    createOscillator: () => node({ type: '', frequency: param(0) }) };
  const c = { audio, sfxBus: {}, engineBus: {}, settings: { engine: 'on' }, document: { hidden: false }, Math };
  vm.createContext(c); const source = read('05-sound.js');
  vm.runInContext(source.slice(source.indexOf('  let jet = null;'), source.indexOf('  function loadSfx')) + '\nglobalThis.engineHum=engineHum; globalThis.jetOf=()=>jet;', c);
  c.engineHum(0, 0, 0, 0); const idle = c.jetOf().roarF.frequency.value;
  c.engineHum(500, 1, 0, 0); assert.ok(c.jetOf().roarF.frequency.value > idle, 'the throttle opens the roar'); assert.ok(c.jetOf().out.gain.value > 0.3);
  assert.equal(c.jetOf().abG.gain.value, 0, 'no afterburner off boost');
  c.engineHum(800, 1.4, 1, 0); assert.ok(c.jetOf().abG.gain.value > 0.5, 'boost lights the afterburner');
  c.engineHum(800, 1, 0, 0, false); assert.equal(c.jetOf().out.gain.value, 0, 'silent when inactive');
  c.settings.engine = 'off'; c.engineHum(800, 1, 0, 0); assert.equal(c.jetOf().out.gain.value, 0, 'silent when switched off');
});

test('Fight waits for the supplied Q3 recording even when the old fallback decoded first', () => {
  const { c, started, timers } = setup();
  c.sfxBuf.v_fight = { name: 'old fallback' };
  c.queueVoice('v_fight'); assert.equal(started.length, 0);
  c.packBuf.v_fight = [{ name: 'Q3 fight' }]; timers.pop()();
  assert.equal(started.length, 1); assert.equal(started[0].buffer.name, 'Q3 fight');
  assert.equal(started[0].playbackRate.value, 1);
});

test('audio loads the page manifest without consulting a stale cached pack index', async () => {
  const requested = [], loaded = {};
  const c = { window: { BRS_PACK_FILES: ['ut/default-weapon-fire.wav', 'engine/warp-dash.wav'] },
    packBuf: loaded, packEventFor: p => p,
    fetch: async url => { requested.push(url); return { ok: true, arrayBuffer: async () => url }; },
    audio: { decodeAudioData: async value => value } };
  vm.createContext(c);
  const source = read('05-sound.js');
  vm.runInContext(source.slice(source.indexOf('  // ---- loading:'), source.indexOf('  const packHas')) + '\nglobalThis.audioOn = () => audioUp(audio); globalThis.loaded = () => loadState;', c);
  c.audioOn(); c.loadPack(); for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual({ ...c.loaded() }, { total: 3, done: 3, failed: 0 }, 'the list and both files counted for the progress bar');
  assert.deepEqual(requested, ['sfx/pack/ut/default-weapon-fire.wav', 'sfx/pack/engine/warp-dash.wav']);
  assert.equal(Object.keys(loaded).length, 2);
});
