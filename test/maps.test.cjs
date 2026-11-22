// Maps: every map builds into solid terrain, stations are connected corridors, and what lies about is fair and usable.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { skip, loadGame, createMatch } = require('./helpers/game.cjs');

const SPACE = ['c', 'a', 'y', 'r', 's', 'w', 'i', 'g', 'o'], STATIONS = ['f', 'k', 'h', 'v', 'd'];

test('every map builds on the server into solid terrain; a station keeps its hull and has walls to break inside', { skip }, async () => {
  for (const map of [...STATIONS, ...SPACE]) {
    const m = await createMatch({ code: 'm1d0' + map });
    try {
      const { bodies, solidCells, walls, innerWalls, props } = m.info;
      assert.ok(bodies > 0 && solidCells > bodies * 20, `${map}: ${bodies} bodies, ${solidCells} solid cells`);
      if (STATIONS.includes(map) && map !== 'd') { assert.ok(walls >= 30, `${map}: ${walls} hull walls`); assert.ok(innerWalls >= 5, `${map}: ${innerWalls} inner walls`); assert.ok(props >= 10, `${map}: ${props} props`); }
    } finally { m.dispose(); }
  }
});

test('a station is symmetric, and every open cell is connected to the middle by a route through open cells', { skip }, async () => {
  const g = await loadGame();
  try {
    for (const map of STATIONS) {
      g.ev(`worldCode = "m1d0${map}"; setMapSize(mapOf(worldCode)); buildPlanets(worldCode);`);
      const r = g.get(`(() => {
        const out = { asym: [], cut: [], open: 0 };
        for (let y = 0; y < FOUNDRY_N; y++) for (let x = 0; x < FOUNDRY_N; x++) {
          if (foundryOpen(x, y) !== foundryOpen(FOUNDRY_N - 1 - x, FOUNDRY_N - 1 - y)) out.asym.push([x, y]);
          if (!foundryOpen(x, y)) continue;
          out.open++;
          const route = foundryRoute(foundryPoint(x, y), foundryPoint(10, 10));
          if (!route || !foundryOpen(Math.floor(route.x / (W / FOUNDRY_N)), Math.floor(route.y / (H / FOUNDRY_N)))) out.cut.push([x, y]);
        }
        return out; })()`);
      assert.deepEqual(r.asym, [], map + ': symmetric');
      assert.ok(r.open > 120, `${map}: ${r.open} open cells`);
      assert.deepEqual(r.cut, [], map + ': every open cell reaches the middle');
    }
  } finally { g.dispose(); }
});

test('on every map each pick-up has a spot of its own, and every gun lying there is one a pilot can carry', { skip }, async () => {
  const g = await loadGame();
  try {
    for (const map of [...SPACE, ...STATIONS]) for (const size of ['m', 'x']) {
      const r = g.get(`(() => {
        worldCode = "${size}1x0${map}"; setMapSize(mapOf(worldCode)); setMode(modeOf(worldCode)); buildPlanets(worldCode);
        const all = [...arena.guns, ...arena.supplies, arena.amp, arena.nuke, arena.holy, arena.void].filter(Boolean);
        const close = [];
        for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++)
          if (Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) < 100) close.push(all[i].type + "/" + all[j].type);
        return { n: all.length, close, bad: arena.guns.filter(c => !WEAPONS[c.type] || WEAPONS[c.type].disabled || !WEAPON_SLOTS.includes(c.type)).map(c => c.type),
          inside: all.filter(c => bodies.some(b => !b.moon && solidAt(b, c.x, c.y))).map(c => c.type) }; })()`);   // (moons orbit by the real clock: one may be passing over a spot)
      assert.ok(r.n >= 8, `${size}${map}: ${r.n} pick-ups`);
      assert.deepEqual(r.close, [], `${size}${map}: two pick-ups on one spot`);
      assert.deepEqual(r.bad, [], `${size}${map}: guns nobody can carry`);
      assert.deepEqual(r.inside, [], `${size}${map}: pick-ups inside solid terrain or a prop`);
    }
  } finally { g.dispose(); }
});

test('station props stand on the floor, clear of the walls and of every pick-up spot', { skip }, async () => {
  for (const map of STATIONS) {
    const m = await createMatch({ code: 'm1d0' + map });
    try {
      const { spots, props, unit, open } = m.game.__simArena();
      for (const [x, y, r] of props) {
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) assert.ok(open(Math.floor((x + dx * r * 0.7) / unit), Math.floor((y + dy * r * 0.7) / unit)), `${map}: a prop in a wall at ${(x / unit).toFixed(1)},${(y / unit).toFixed(1)}`);
        for (const [sx, sy] of spots) assert.ok(Math.hypot(sx - x, sy - y) > r + unit * 0.2, `${map}: a prop covers a pick-up at ${(sx / unit).toFixed(1)},${(sy / unit).toFixed(1)}`);
      }
    } finally { m.dispose(); }
  }
});
