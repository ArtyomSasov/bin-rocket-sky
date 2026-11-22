// Test helpers: the whole game, loaded as the server loads it (server/sim/headless.mjs: the real source in its
// build order, with an inert page), so a test exercises the game's own code, never a copy or a slice of it.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
// the server's dependencies (a real canvas for the bodies) are needed to run the game outside a browser
const ready = fs.existsSync(path.join(ROOT, 'server', 'node_modules', '@napi-rs', 'canvas'));
const skip = ready ? false : 'server dependencies are not installed (cd server && npm ci)';

// A fresh game in its own context. ev(expr) evaluates an expression inside the game's scope (its own variables and
// functions), so a test can arrange a situation and read the outcome the way the game itself would; get(expr) is
// the same with the result copied out as plain data (values from the game's context are not this one's)
async function loadGame() {
  const { loadGame: load } = await import(path.join(ROOT, 'server', 'sim', 'headless.mjs'));
  const ctx = load('\n  globalThis.__ev = src => eval(src);\n');
  const ev = src => ctx.__ev(src), get = src => { const v = ev(src); return v === undefined ? v : JSON.parse(JSON.stringify(v)); };
  return { ctx, ev, get, dispose: () => ctx.__dispose() };
}

// A match as the authoritative server runs it (server/sim/sim.mjs), stepped on a clock of the test's own
async function createMatch(opts) {
  const { createMatch: create } = await import(path.join(ROOT, 'server', 'sim', 'sim.mjs'));
  return create(opts);
}
// steps a match for some seconds on its own clock (60 steps a second, a snapshot every other one, as the server)
function run(m, seconds, each, clock = { t: 1e6 }) {
  for (let i = 0; i < seconds * 60; i++) { clock.t += 1000 / 60; if (each) each(clock.t, i); m.step(1 / 60, clock.t); if (i % 2) m.packet(clock.t); }
  return clock.t;
}

module.exports = { ROOT, ready, skip, loadGame, createMatch, run };
