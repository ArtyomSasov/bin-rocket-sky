  // ---------- arenas: one hand-made layout per map ----------
  // Every map is always the same, in every lobby, so it can be learned: where the planets are, where each gun lies.
  // Coordinates are fractions of the arena's side. Each entry also appears mirrored through the centre (point
  // symmetry), unless it sits on the centre, so both halves and both CTF bases (left and right middle) get the same.
  //   planets:  [kind, x, y, radius at Medium, moons]          (kind: gas, ice, lava, rock; asteroid maps make them rocks)
  //   wrecks:   [type, x, y, angle?]                          (an angle keeps it lined up and barely turning)
  //   guns:     [weapon, x, y]                                 a crate that is always there until someone takes it
  //   supplies: [med | bigmed | shield | mega, x, y]
  //   amp, nuke, holy, void: [x, y] one spot each (on the vertical axis or the centre: as far from either base; each its own)
  //   pads:     [x, y, direction in degrees] boost pads: fly over one and it flings you that way
  // Each layout has its own deliberate weapon pool; large maps repeat its placements.
  // The Large and Huge arenas add a few more bodies and spots in the widest gaps (fixed too, see buildPlanets).
  // Gun respawn (s): a taken crate comes back at the start of its spot's next cycle
  const GUN_PERIOD = { rocket: 30, gren: 30, orb: 30, mine: 30, shard: 26, rail: 40, saw: 60, gamma: 75 }, GUN_PERIOD_BASE = 18;   // by how strong: common 18 s, strong ~30, the railgun 40, the Blood Blade 60, the demonic orb 75
  const ARENA_SCALE = { s: 0.72, m: 1, l: 1.2, x: 1.4 };   // body sizes per map size
  // the asteroid ring: rocks round the centre with wide gates towards the bases and the top and bottom
  const ringRocks = (r, angles, R) => angles.map((a, i) => ["rock", 0.5 + Math.cos(a / 57.3) * r, 0.5 + Math.sin(a / 57.3) * r, R + (i % 2) * 18, 0]);
  const ARENAS = {
    // Twin Worlds: two ringed giants, two ice worlds, the Gate (two towers) round an open centre with Overdrive
    c: { name: "Twin Worlds",
      planets: [["gas", 0.33, 0.28, 260, 1], ["ice", 0.77, 0.2, 160, 1]],
      wrecks: [["hull", 0.62, 0.1, 0], ["ring", 0.12, 0.2], ["tower", 0.5, 0.36, 0], ["crates", 0.3, 0.64]],
      guns: [["rail", 0.05, 0.05], ["rocket", 0.33, 0.07], ["scatter", 0.62, 0.5], ["laser", 0.92, 0.1], ["shard", 0.18, 0.4], ["saw", 0.4, 0.2]],
      supplies: [["med", 0.42, 0.13], ["med", 0.2, 0.31], ["shield", 0.07, 0.34], ["bigmed", 0.88, 0.3]],
      amp: [0.5, 0.5], nuke: [0.5, 0.05], void: [0.5, 0.2], holy: [0.5, 0.95], pads: [[0.24, 0.5, 0], [0.15, 0.09, 0]] },
    // The Ring: a circle of rocks round the centre, gates in four directions, rock clusters in two corners
    a: { name: "The Ring",
      planets: [...ringRocks(0.27, [18, 36, 54, 72, 108, 126, 144, 162], 72),
        ["rock", 0.12, 0.12, 110, 0], ["rock", 0.22, 0.07, 70, 0], ["rock", 0.07, 0.23, 75, 0], ["rock", 0.86, 0.12, 90, 0], ["rock", 0.5, 0.13, 85, 0], ["rock", 0.43, 0.43, 55, 0]],
      wrecks: [],
      guns: [["gamma", 0.5, 0.38], ["gren", 0.33, 0.1], ["minigun", 0.88, 0.3], ["scatter", 0.77, 0.5], ["laser", 0.5, 0.24], ["rail", 0.95, 0.05]],
      supplies: [["med", 0.37, 0.37], ["shield", 0.8, 0.07], ["bigmed", 0.91, 0.41]],
      amp: [0.5, 0.5], nuke: [0.5, 0.04], void: [0.5, 0.32], holy: [0.5, 0.96], pads: [[0.5, 0.18, 90]] },
    // Drydocks: rows of moored hulls above and below, two ring stations either side of the moonbase in the middle
    y: { name: "Drydocks",
      planets: [["rock", 0.5, 0.5, 150, 0]],
      wrecks: [["hull", 0.3, 0.2, 0], ["hull", 0.5, 0.2, 0], ["hull", 0.7, 0.2, 0], ["ring", 0.34, 0.5], ["tower", 0.1, 0.1, 0], ["crates", 0.9, 0.1]],
      guns: [["rail", 0.4, 0.05], ["minigun", 0.38, 0.35], ["laser", 0.2, 0.32], ["saw", 0.7, 0.36], ["gren", 0.92, 0.27], ["rocket", 0.6, 0.08]],
      supplies: [["med", 0.6, 0.32], ["shield", 0.2, 0.08], ["bigmed", 0.64, 0.4]],
      amp: [0.5, 0.05], nuke: [0.5, 0.95], void: [0.5, 0.65], holy: [0.5, 0.33], pads: [[0.12, 0.38, 0]] },
    // Downtown: two blocks of towers with a plaza in each, the main street between the bases, a fallen hull in the middle
    r: { name: "Downtown",
      planets: [["rock", 0.9, 0.31, 100, 0]],
      wrecks: [["tower", 0.3, 0.16, 0], ["tower", 0.5, 0.16, 0], ["tower", 0.7, 0.16, 0], ["tower", 0.3, 0.34, 0], ["tower", 0.7, 0.34, 0],
        ["hull", 0.5, 0.5, 0], ["crates", 0.1, 0.12]],
      guns: [["rocket", 0.4, 0.26], ["gamma", 0.5, 0.32], ["scatter", 0.2, 0.25], ["shard", 0.6, 0.05], ["laser", 0.25, 0.45], ["rail", 0.95, 0.05]],
      supplies: [["med", 0.4, 0.1], ["bigmed", 0.64, 0.42], ["shield", 0.8, 0.26]],
      amp: [0.5, 0.05], nuke: [0.5, 0.95], void: [0.5, 0.63], holy: [0.5, 0.39], pads: [[0.22, 0.56, 0]] },
    // Orrery: the sun in the middle, two giants with two moons each, two small hot worlds on the axis
    s: { name: "Orrery",
      planets: [["gas", 0.24, 0.21, 230, 2], ["ice", 0.77, 0.2, 180, 1], ["lava", 0.5, 0.11, 110, 0]],
      wrecks: [],
      guns: [["gamma", 0.66, 0.37], ["rail", 0.05, 0.05], ["rocket", 0.94, 0.38], ["minigun", 0.19, 0.4], ["orb", 0.35, 0.39]],
      supplies: [["med", 0.12, 0.33], ["shield", 0.62, 0.21], ["bigmed", 0.95, 0.06]],
      amp: [0.5, 0.71], nuke: [0.5, 0.29], void: [0.5, 0.23], holy: [0.5, 0.03], pads: [[0.3, 0.52, -90]] },
    // The Tip: a landfill hill in the middle, a convoy of refuse trucks along the top and bottom, skips and bales round the edge
    w: { name: "The Tip",
      planets: [["rock", 0.5, 0.5, 190, 0]],
      wrecks: [["truck", 0.27, 0.17, 0], ["truck", 0.5, 0.16, 0], ["truck", 0.73, 0.17, 0], ["wheelie", 0.35, 0.36, 0], ["bales", 0.1, 0.1], ["skip", 0.85, 0.33, 0]],
      guns: [["scatter", 0.5, 0.3], ["saw", 0.2, 0.32], ["gren", 0.93, 0.18], ["rocket", 0.4, 0.05], ["laser", 0.2, 0.43], ["minigun", 0.67, 0.4]],
      supplies: [["med", 0.6, 0.27], ["bigmed", 0.05, 0.25], ["shield", 0.62, 0.06]],
      amp: [0.5, 0.05], nuke: [0.5, 0.95], void: [0.5, 0.64], holy: [0.5, 0.38], pads: [[0.22, 0.56, 0]] },
    // Frost Belt: a belt of ice and rock running corner to corner through the middle (gaps to fly through), an ice
    // giant with its moon in two corners, a hull frozen in the ice either side of the belt, a ring station on the flank
    i: { name: "Frost Belt",
      planets: [["ice", 0.13, 0.14, 200, 1], ["ice", 0.6, 0.4, 62, 0], ["ice", 0.69, 0.31, 84, 0], ["rock", 0.77, 0.24, 52, 0], ["ice", 0.86, 0.13, 72, 0],
        ["rock", 0.36, 0.17, 48, 0], ["ice", 0.93, 0.45, 50, 0]],
      wrecks: [["hull", 0.32, 0.43, 0.65], ["ring", 0.84, 0.76], ["crates", 0.12, 0.42]],
      guns: [["laser", 0.42, 0.3], ["minigun", 0.22, 0.06], ["shard", 0.6, 0.14], ["gren", 0.9, 0.3], ["rail", 0.96, 0.04], ["gamma", 0.52, 0.22]],
      supplies: [["med", 0.46, 0.12], ["shield", 0.24, 0.3], ["bigmed", 0.96, 0.36]],
      amp: [0.5, 0.5], nuke: [0.5, 0.05], void: [0.5, 0.7], holy: [0.5, 0.95], pads: [[0.2, 0.58, 0]] },
    // Graveyard: the wrecks of a lost battle drifting at every angle round a dead red world, a burning world in two
    // corners, broken towers and spilt cargo among them; close fights from hull to hull
    g: { name: "Graveyard",
      planets: [["lava", 0.5, 0.5, 210, 1], ["lava", 0.13, 0.13, 140, 0], ["rock", 0.37, 0.3, 46, 0], ["rock", 0.7, 0.2, 40, 0], ["rock", 0.9, 0.6, 44, 0]],
      wrecks: [["hull", 0.3, 0.17, 0.9], ["hull", 0.66, 0.36, -0.5], ["hull", 0.2, 0.76, 1.6], ["tower", 0.85, 0.12, 0.4], ["crates", 0.46, 0.1], ["hull", 0.42, 0.8, 2.6], ["tower", 0.06, 0.7, -0.3]],
      guns: [["minigun", 0.27, 0.36], ["scatter", 0.42, 0.21], ["orb", 0.76, 0.16], ["rail", 0.05, 0.3], ["shard", 0.84, 0.4], ["saw", 0.58, 0.4]],
      supplies: [["med", 0.36, 0.43], ["shield", 0.6, 0.07], ["bigmed", 0.94, 0.22]],
      amp: [0.5, 0.29], nuke: [0.5, 0.03], void: [0.5, 0.71], holy: [0.5, 0.97], pads: [[0.2, 0.42, 0]] },
    // Duel: almost empty. Two ice pillars on the line between the bases, two stations above and below the centre
    o: { name: "Duel",
      planets: [["ice", 0.32, 0.5, 130, 0]],
      wrecks: [["ring", 0.5, 0.2]],
      guns: [["rail", 0.2, 0.2], ["orb", 0.8, 0.2], ["laser", 0.5, 0.36], ["rocket", 0.06, 0.06], ["shard", 0.94, 0.06]],
      supplies: [["med", 0.33, 0.3], ["shield", 0.67, 0.3]],
      amp: [0.5, 0.5], nuke: [0.5, 0.06], void: [0.5, 0.43], holy: [0.5, 0.94], pads: [[0.2, 0.36, 0]] }
  };
  for (const [map, x, y] of [["c", .14, .42], ["a", .15, .38], ["y", .12, .27], ["r", .18, .38], ["s", .12, .43], ["w", .13, .29], ["i", .1, .3], ["g", .12, .26], ["o", .22, .3]]) ARENAS[map].supplies.push(["pads", x, y]);
  // an entry and its mirror through the centre (one entry when it sits on the centre)
  const mirrored = list => list.flatMap(e => {
    const [k, x, y, ...rest] = e;
    if (Math.abs(x - 0.5) < 0.005 && Math.abs(y - 0.5) < 0.005) return [e];
    return [e, [k, 1 - x, 1 - y, ...rest]];
  });
