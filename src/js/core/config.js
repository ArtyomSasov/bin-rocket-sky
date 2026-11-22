  "use strict";
  // ---------- config: world size, levels, weapons, shots, modes, supplies, rounds ----------
  // walled arena; its size comes from the lobby code's first letter (s/m/l/x), so everyone in a lobby shares it
  const MAP_SIZES = { s: [2600, "Small", 3], m: [4200, "Medium", 5], l: [6000, "Large", 9], x: [8000, "Huge", 14] };
  const mapOf = code => MAP_SIZES[String(code)[0]] ? String(code)[0] : "m";
  // map variants: what fills the arena. A new lobby's code carries it as "0<letter>" after the size (and the mode),
  // e.g. M0Y... or M1C0A...; generated codes never contain 0, and a code without it is Classic.
  // The layout of each map is in world/arenas.js. star: a sun in the middle; lumpy: planets become ragged asteroids
  const MAPS = {
    f: { name: "Foundry", label: "Foundry", hint: "industrial corridors, three routes", station: true },
    k: { name: "Cargo Deck", label: "Cargo Deck", hint: "a ring corridor round a cargo hall, crates to smash", station: true },
    h: { name: "Hangar", label: "Hangar · NEW", hint: "one huge hangar bay, corridors all round", station: true },
    d: { name: "Derelict", label: "Derelict · NEW", hint: "a cruiser broken in two, open space round it", station: true },
    v: { name: "Vault", label: "Vault · NEW", hint: "nine rooms and narrow doors, the vault in the middle", station: true },
    c: { name: "Twin Worlds", label: "Twin Worlds", hint: "two giants, an open centre" },
    a: { name: "The Ring", label: "The Ring", hint: "a ring of asteroids, four gates", lumpy: true },
    y: { name: "Drydocks", label: "Drydocks", hint: "rows of moored hulls" },
    r: { name: "Downtown", label: "Downtown", hint: "tower blocks, a main street" },
    s: { name: "Orrery", label: "Orrery", hint: "a sun and its planets", star: true },
    w: { name: "The Tip", label: "The Tip", hint: "trucks, skips, a landfill hill" },
    i: { name: "Frost Belt", label: "Frost Belt · NEW", hint: "an ice belt across the middle, a frozen hull" },
    g: { name: "Graveyard", label: "Graveyard · NEW", hint: "a lost fleet's wrecks round a dead red world" },
    o: { name: "Duel", label: "Duel", hint: "nearly empty: duels" }
  };

  // A lobby code: the size letter, then settings as pairs ("1"+letter mode, "0"+letter map, "1"+digit time limit,
  // "0"+digit score limit), then random letters. Random letters never use 0 or 1, so the pairs can't be mistaken.
  const codeOpts = code => {
    const o = {};
    for (const [, a, b] of String(code).slice(1).matchAll(/([01])([a-z0-9])/g)) o[a + (/\d/.test(b) ? "d" : "l")] = b;
    return { mode: o["1l"], map: o["0l"], time: o["1d"], score: o["0d"] };
  };
  // Rotation (map letter z): a different map every round, the same on every screen and the server: the round's
  // number picks it, going round every map but the duel one, from a start the code's random letters choose
  const ROTATION = "z", ROTATION_LABEL = "Rotation";
  const rotates = code => codeOpts(code).map === ROTATION;
  const rotationMap = (code, round) => {
    const list = Object.keys(MAPS).filter(k => k !== "o");
    let seed = 0; for (const ch of String(code)) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
    return list[(seed + Math.max(0, round)) % list.length];
  };
  // the map a code names ("c" if none) for the round being played: asked many times a step (stationMap), so the last
  // answer is kept
  let themeCode = null, themeRound = null, themeOf = "c";
  const mapThemeOf = code => {
    const round = rotates(code) ? stats.round : null;
    if (code !== themeCode || round !== themeRound) {
      const m = codeOpts(code).map; themeCode = code; themeRound = round;
      themeOf = round !== null ? rotationMap(code, round) : MAPS[m] ? m : "c";
    }
    return themeOf;
  };
  // a code's map as a lobby list says it
  const mapLabel = (code, key = "label") => rotates(code) ? ROTATION_LABEL : MAPS[mapThemeOf(code)][key];
  let W = 4200, H = 4200;
  const BOT = 84;                    // sprite size on screen
  const BIN_R = 40;                  // a bin's hit circle: the same on the victim's screen and the shooter's
  const BIN_MASS = 1;                // a bin's weight, the unit loose rubble is weighed in
  let SLOTS = 100; const PERIOD = 16;     // spark slots, seconds per respawn cycle
  const SPRITE_TILT = 0.24;          // the art leans right a little (its engine points down-left)
  const NOZZLE = [140 / 320 - 0.5, 186 / 320 - 0.5];   // engine opening in the art, as a fraction of size
  const LIVES = 3, ROCK_PERIOD = 22; let ROCKS = 36;
  const RESPAWN_MS = 2000;           // dead this long, then back in (see safeSpawn)
  const FLAME = { outer: [255, 70, 20], mid: [255, 150, 40], core: [255, 240, 170] };   // an engine's fire, unless its look picks another
  // shot kinds: what flies. The number is what goes over the network; everything per kind lives in SHOTS
  const K = { FIRE: 0, ROCKET: 1, LASER: 2, NUKE: 3, PELLET: 4, RAIL: 5, MINE: 6, ORB: 7, BOLT: 8, SHARD: 9, SLUG: 10, HOLY: 11, SAW: 12, GAMMA: 13, BEACON: 14, TFRAG: 15, BULLET: 16, GAUSS: 17, SHOCK: 18, PULSE: 19, FLAK: 20, DET: 21, NAIL: 22, GREN: 23, MELEE: 24, SPIKE: 25, MDET: 26, HROCKET: 27, RECALL: 28, PISTOL: 29, SAW_ALT: 30, BULLET_ALT: 31, PULSE_BOLT: 32, SWORD: 33, VOID: 34, HOOK: 35, NOVA: 36 };
  const MINE_R = 55, MINE_ARM = 0.7;   // mines go off when a bin comes this close, after arming
