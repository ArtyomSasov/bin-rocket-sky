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
  }, packBuf: Object.fromEntries(['p_fire_orb', 'p_boost', 'p_metal', 'p_blast_heavy'].map(k => [k, [k]])),
    sfxBuf: { boom_low: 'low' }, SFX_TUNE: {}, sfxBus: {}, heavyBus: {}, sfxVoices: 0,
    document: { hidden: false }, setTimeout: f => later.push(f), queueVoice() {} };
  const source = read('05-sound.js'); vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('  const SOUND_OVERRIDE'), source.indexOf('  // the holy bomb')), c);
  c.sfx('fire'); c.sfx('dash'); c.sfx('crash'); c.sfx('crash');
  assert.deepEqual(played, ['p_fire_orb', 'p_boost', 'p_metal']);
  c.sfx('p_death'); later.pop()();
  assert.deepEqual(played.slice(3), ['low', 'p_blast_heavy', 'p_metal']);
});
