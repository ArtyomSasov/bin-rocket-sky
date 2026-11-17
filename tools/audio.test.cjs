const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '../src/js', name), 'utf8');
function setup() {
  const started = [], timers = [], gainTargets = [], listeners = {};
  const node = () => ({ connect() { return this; }, gain: { value: 1 } });
  const c = { performance: { now: () => 1000 }, document: { hidden: false, addEventListener: (name, f) => { listeners[name] = f; } },
    audio: { currentTime: 1, createGain: node, createBufferSource() {
      const src = { ...node(), playbackRate: { value: 0 }, start() { started.push(src); }, stop() { this.onended?.(); } }; return src;
    } }, voiceBus: node(), mixBus: { gain: { setTargetAtTime: n => gainTargets.push(n) } },
    packBuf: { a_firstblood: [{ name: 'first' }], a_doublekill: [{ name: 'double' }], v_win: [{ name: 'win' }] }, sfxBuf: {},
    setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {}, sfx: () => true };
  vm.createContext(c); vm.runInContext(read('05b-audio-cues.js'), c);
  return { c, started, gainTargets, timers, listeners };
}
test('announcer serializes speech, keeps pitch stable and gives results priority', () => {
  const { c, started, timers, gainTargets } = setup();
  c.queueVoice('a_firstblood'); c.queueVoice('a_doublekill'); c.queueVoice('a_doublekill');
  assert.equal(started.length, 1); assert.equal(started[0].playbackRate.value, 1);
  c.queueVoice('v_win'); started[0].onended(); timers.pop()();
  assert.equal(started.length, 2); assert.equal(started[1].buffer.name, 'win');
  assert.deepEqual(gainTargets, [0.55, 1, 0.55]);
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
  }, packBuf: Object.fromEntries(['p_user_fire', 'p_user_demonic', 'p_user_demonic_explosion', 'p_user_cannon', 'p_user_autocannon', 'p_user_explosion', 'p_user_massive', 'p_burst_minigun', 'p_fire_rocket', 'p_fire_gren', 'p_boom_rocket', 'p_boom_mine', 'p_boost', 'p_metal'].map(k => [k, [k]])),
    sfxBuf: { boom_low: 'low' }, SFX_TUNE: {}, sfxBus: {}, userBus: {}, priorityBus:{}, priorityVoices:0, heavyBus: {}, sfxVoices: 0, blastVoices: 0, me:{x:0,y:0},
    document: { hidden: false }, setTimeout: f => later.push(f), queueVoice() {} };
  const source = read('05-sound.js'); vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('  const SOUND_OVERRIDE'), source.indexOf('  // the holy bomb')), c);
  c.sfx('fire'); c.sfx('dash'); c.sfx('crash'); c.sfx('crash');
  assert.deepEqual(played, ['p_user_fire', 'p_boost', 'p_metal']);
  for (const event of ['p_death', 'p_boom_nuke', 'p_boom_holy', 'p_fire_gamma', 'p_boom_gamma', 'p_fire_minigun', 'p_fire_rocket', 'p_fire_gren', 'p_fire_shard', 'p_boom_shard', 'p_boom_rocket', 'p_boom_mine']) c.sfx(event);
  assert.deepEqual(played.slice(3), ['p_user_explosion', 'p_user_massive', 'p_user_massive', 'p_user_demonic', 'p_user_demonic_explosion', 'p_burst_minigun', 'p_fire_rocket', 'p_fire_gren', 'p_user_autocannon', 'p_user_cannon', 'p_boom_rocket', 'p_boom_mine']);
  assert.equal(later.length, 0, 'custom explosion tails are not covered with the old extra layers');
  c.packBuf.p_fire_rocket = ['original rocket']; c.sfx('p_fire_rocket');
  assert.equal(played.at(-1), 'original rocket', 'retain the supplied old pack while the replacement loads');
  c.sfxVoices=29;c.blastVoices=0;
  c.sfx('p_boom_gamma',1,1,1700,0);
  assert.equal(played.at(-1),'p_user_demonic_explosion','a distant demonic blast survives the ordinary voice limit');
  const count=played.length;c.blastVoices=4;c.sfx('p_boom_gamma');assert.equal(played.length,count,'reserved voices stay bounded');
});

test('rocket and grenade impacts keep Quake while the demonic orb plays its own explosion once', () => {
  const events = [];
  const c = { K:{MINE:6,ORB:7,GAMMA:13,ROCKET:1,GREN:23}, me:{x:0,y:0}, lowQ:true, shake:0,
    impacts:[],rings:[],arcs:[], explode(){},puff(){},smoke(){},
    packPlay(name){events.push(name);return true;},sfx(){throw Error('unexpected fallback');} };
  vm.createContext(c); const source=read('11-weapons.js');
  vm.runInContext(source.slice(source.indexOf('  function blastFx'),source.indexOf('  let hitTickAt')),c);
  for(const kind of [1,23,13]) {const shot={kind,x:kind===13?1700:20,y:20};c.blastFx(shot);c.blastFx(shot);}
  assert.deepEqual(events,['p_boom_rocket','p_boom_rocket','p_boom_gamma']);
});

test('spaceship engine responds to thrust, boost and wall contact; stops when inactive', () => {
  let available = true;
  const c = {audio:{currentTime:0},sfxBus:{},settings:{engine:'on'},document:{hidden:false},packLoops:{},
    packHas:event=>available && event==='p_ship_engine', packLoop(slot,event) {
      c.packLoops[slot] = event ? {ev:event,src:{playbackRate:{setTargetAtTime:v=>c.pitch=v}},g:{gain:{setTargetAtTime:v=>c.volume=v}}} : null;
    }};
  vm.createContext(c);const source=read('05-sound.js');
  vm.runInContext(source.slice(source.indexOf('  function engineHum'),source.indexOf('  function loadSfx')),c);
  c.engineHum(500,0,0,0);const coast=c.volume;
  c.engineHum(500,1,0,0);const thrust=c.volume;
  assert.equal(c.packLoops.engine.ev,'p_ship_engine');assert.ok(thrust>coast*5);assert.ok(c.pitch>=0.96&&c.pitch<=1.12);
  c.engineHum(800,1.4,2,0);assert.ok(c.volume>thrust);assert.ok(c.volume<0.65);assert.ok(c.pitch<=1.160001);
  c.engineHum(0,1,0,0);assert.ok(c.packLoops.engine,'thrust against a wall is audible');
  c.engineHum(0,0,0,0);assert.equal(c.packLoops.engine,null);
  for(const reason of ['inactive','hidden','off','unloaded']) {
    c.document.hidden=reason==='hidden';c.settings.engine=reason==='off'?'off':'on';available=reason!=='unloaded';
    c.engineHum(800,1,1,0,reason!=='inactive');assert.equal(c.packLoops.engine,null,reason);
  }
});
