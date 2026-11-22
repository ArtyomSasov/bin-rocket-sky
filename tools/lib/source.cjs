// The game's source as the build joins it: src/js/build-order.json lists the files, in the order they run (they
// are sections of one scope, see tools/build.mjs). For tests that load a part of the game on its own.
const fs = require('node:fs');
const path = require('node:path');

const JS = path.join(__dirname, '..', '..', 'src', 'js');
const order = () => JSON.parse(fs.readFileSync(path.join(JS, 'build-order.json'), 'utf8'));
// one file, by its path under src/js (e.g. 'weapons/catalog.js')
const read = file => fs.readFileSync(path.join(JS, file), 'utf8');
// the whole game, joined as the build joins it
const readAll = () => order().map(read).join('');
// TRANSITIONAL: the text of a file as it was before the split into domains (tools/lib/legacy-files.json), for the
// tests still written against it; removed once those are rewritten
const LEGACY = JSON.parse(fs.readFileSync(path.join(__dirname, 'legacy-files.json'), 'utf8'));
const legacy = name => { if (!LEGACY[name]) throw new Error('no such source: ' + name); return LEGACY[name].map(read).join(''); };

module.exports = { JS, order, read, readAll, legacy };
