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

module.exports = { JS, order, read, readAll };
