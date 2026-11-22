// Sound: every sound the game plays from its pack has a recording that ships with it, and nothing ships unused.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { skip, loadGame, ROOT } = require('./helpers/game.cjs');
const { readAll } = require('../tools/lib/source.cjs');

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(wav|ogg|mp3)$/.test(e.name) ? [path.join(dir, e.name)] : []);

test('every pack event has a recording, every recording belongs to an event, and every event the code plays exists', { skip }, async () => {
  const g = await loadGame();
  try {
    const packRoot = path.join(ROOT, 'sfx', 'pack'), files = walk(packRoot).map(p => path.relative(packRoot, p).split(path.sep).join('/'));
    const owner = g.get(`(() => { const out = {}; for (const f of ${JSON.stringify(files)}) out[f] = packEventFor(f) || null; return out; })()`);
    const events = g.get('Object.keys(PACK_PATHS)'), shipped = new Set(Object.values(owner));
    for (const e of events) assert.ok(shipped.has(e), 'no recording for ' + e);
    for (const [f, e] of Object.entries(owner)) assert.ok(e, f + ' is not used by any event');
    const src = readAll(), played = new Set([...src.matchAll(/packPlay\("([a-z0-9_]+)"[,)]/g), ...src.matchAll(/packLoop\([^,()]+, "([a-z0-9_]+)"/g)].map(m => m[1]));
    const alias = g.get('SOUND_OVERRIDE');   // (an event may be played under another's recording)
    for (const e of played) assert.ok(events.includes(e) || events.includes(alias[e]), 'the code plays ' + e + ', which has no recording');
  } finally { g.dispose(); }
});
