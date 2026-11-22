  // Stations: fixed, symmetric maps of corridors and rooms on a 21x21 grid (Foundry, Cargo Deck). The shell is
  // permanent; crates, drums and partitions inside are ordinary destructible bodies that break up into rubble.
  // Floor and walls read apart at a glance: the floor is dark tread plate, sunk in the shadow of the walls; the walls
  // are raised slabs, lit along every edge that meets the floor and banded in hazard stripes there.
  const FOUNDRY_N = 21;
  const stationHull = (x, y) => x <= 0 || y <= 0 || x >= FOUNDRY_N - 1 || y >= FOUNDRY_N - 1;   // the outer ring: never broken
  // Cargo Deck, folded into one quarter (it is mirrored both ways): a ring corridor, a cross through the middle, a
  // pillared hall round the centre and four store rooms, each with a door to the ring and one to the cross
  const cargoOpen = (x, y) => {
    if (x < 1 || x > 19 || y < 1 || y > 19) return false;
    const ax = Math.min(x, 20 - x), ay = Math.min(y, 20 - y);
    if (ax === 8 && ay === 8) return false;   // the hall's four pillars
    const ring = ax <= 2 || ay <= 2, cross = ax >= 9 || ay >= 9, hall = ax >= 7 && ay >= 7;
    const room = ax >= 4 && ax <= 6 && ay >= 4 && ay <= 6;
    const door = ax === 3 && ay === 5 || ax === 5 && ay === 3 || ax === 5 && (ay === 7 || ay === 8) || ay === 5 && (ax === 7 || ax === 8);
    return ring || cross || hall || room || door;
  };
  // Hangar: one huge hangar bay in the middle (long sight lines, crates for cover, four support pillars), a narrow
  // corridor all round it, a small room in each corner and a passage into the bay from each side
  const hangarOpen = (x, y) => {
    if (x < 1 || x > 19 || y < 1 || y > 19) return false;
    const ax = Math.min(x, 20 - x), ay = Math.min(y, 20 - y);
    if (ax === 6 && ay === 6) return false;   // the bay's support pillars
    const ring = ax === 1 || ay === 1, bay = ax >= 4 && ay >= 4, corner = ax >= 2 && ax <= 3 && ay >= 2 && ay <= 3;
    const pass = (ax >= 2 && ax <= 3 && ay >= 9) || (ay >= 2 && ay <= 3 && ax >= 9);
    return ring || bay || corner || pass;
  };
  // Derelict: a cruiser broken in two across the middle of open space. Each half (the right is the left turned round)
  // is a hull of plating round two decks split by a bulkhead with a gap in it; doors in the hull lead out to space,
  // into the breach between the halves and round the bow. Outside the hull is open space (drawn as the sky)
  const cruiserHull = (x, y) => y >= 5 && y <= 15 && (x >= 2 && x <= 8 || x >= 12 && x <= 18);
  const cruiserOpen = (x, y) => {
    if (x < 1 || x > 19 || y < 1 || y > 19) return false;
    if (!cruiserHull(x, y)) return true;
    const hx = x <= 8 ? x : 20 - x, hy = x <= 8 ? y : 20 - y;   // in the left half's terms
    if (hy === 5 || hy === 15 || hx === 2 || hx === 8) return [[4, 5], [8, 10], [8, 7], [2, 12], [6, 15]].some(([a, b]) => a === hx && b === hy);   // the hull, and its doors
    return !(hx === 5 && (hy >= 7 && hy <= 8 || hy >= 12 && hy <= 13));   // the bulkhead between the decks
  };
  const cruiserSpace = (x, y) => !cruiserHull(x, y);
  // Vault: nine rooms in a grid joined by narrow doors, the vault itself in the middle behind four pillars
  const vaultOpen = (x, y) => {
    if (x < 1 || x > 19 || y < 1 || y > 19) return false;
    const room = v => v <= 5 || (v >= 8 && v <= 12) || v >= 15, mid = v => v === 3 || v === 10 || v === 17, gap = v => v === 6 || v === 7 || v === 13 || v === 14;
    if (room(x) && room(y)) return !(Math.min(x, 20 - x) === 9 && Math.min(y, 20 - y) === 9);
    return (gap(x) && mid(y)) || (gap(y) && mid(x));
  };
  const STATIONS = {
    f: {
      open: (x, y) => {
        if (x < 1 || x > 19 || y < 1 || y > 19) return false;
        const lane = (y >= 2 && y <= 4 || y >= 9 && y <= 11 || y >= 16 && y <= 18) && x >= 2 && x <= 18;
        const link = [3, 7, 13, 17].some(c => Math.abs(x - c) <= 1) && y >= 3 && y <= 17;
        const room = (x >= 1 && x <= 5 || x >= 8 && x <= 12 || x >= 15 && x <= 19) && y >= 7 && y <= 13;
        const pillar = x === 10 && (y === 8 || y === 12);
        return (lane || link || room) && !pillar;
      },
      floor: ["#1d2328", "#262d33", "#39434a"], wall: ["#3d5868", "#2a3f4d", "#93c4d2"], accent: ["#e49a59", "#62d7e0"], void: "#060d16", style: "tread", lamp: "#ffd2a0",
      guns: [["scatter", 3, 9], ["minigun", 3, 12], ["rocket", 7, 3], ["rail", 10, 2], ["laser", 7, 7], ["orb", 8, 10], ["shard", 7, 17], ["mine", 3, 5], ["saw", 3, 15], ["gren", 7, 13]],
      supplies: [["med", 3, 7], ["shield", 7, 10], ["shield", 3, 11], ["bigmed", 13, 16], ["vial", 3, 8], ["vial", 3, 10], ["pads", 3, 16]],
      mega: [10, 3],
      // [type, x, y (in cells, centre), turn]; each is mirrored through the middle
      props: [["crate", 1.3, 7.3, 0.1], ["crate", 1.75, 7.3, -0.05], ["crate", 1.3, 7.78, 0], ["drum", 5.62, 7.35], ["drum", 5.62, 12.62], ["crate", 1.3, 12.7, 0.2],
        ["panel", 9.0, 4.0, 0], ["crate", 12.4, 2.3, 0.15], ["drum", 8.3, 7.3], ["crate", 11.68, 12.7, -0.1], ["panel", 4.5, 17.0, Math.PI / 2], ["drum", 2.3, 17.65]],
      labels: [["FORGE 01", 3, 10, "#ffae70"], ["REACTOR", 10, 10, "#a8eacb"], ["FORGE 02", 17, 10, "#76e3ed"], ["RAIL DECK", 10, 3, "#bbabdf"], ["SERVICE LOOP", 10, 17, "#b8a987"]],
      reactor: true
    },
    k: {
      open: cargoOpen,
      floor: ["#25211d", "#2e2924", "#4a4038"], wall: ["#5a5148", "#3b342e", "#e6c08a"], accent: ["#f0b43c", "#58c8e8"], void: "#0c0a09", style: "cargo", lamp: "#ffe6c0",
      guns: [["rocket", 2, 2], ["rail", 10, 1], ["scatter", 5, 5], ["minigun", 1, 6], ["laser", 7, 7], ["orb", 10, 6], ["shard", 6, 9], ["gamma", 5, 2], ["mine", 2, 15], ["gren", 15, 2]],
      supplies: [["med", 5, 6], ["shield", 8, 10], ["vial", 2, 8], ["vial", 2, 12], ["bigmed", 11, 15], ["pads", 13, 10], ["shield", 5, 4]],
      mega: [10, 3],
      props: [["crate", 4.32, 4.32, 0], ["crate", 4.8, 4.3, 0.08], ["crate", 4.3, 4.8, -0.06], ["crate", 6.66, 6.62, 0.12], ["drum", 6.7, 4.3], ["drum", 4.3, 6.7],
        ["crate", 1.3, 1.3, 0.1], ["drum", 1.75, 1.28], ["panel", 1.5, 9.0, Math.PI / 2], ["panel", 9.0, 1.5, 0], ["crate", 7.25, 8.75, -0.15], ["drum", 7.25, 12.75],
        ["crate", 18.7, 1.3, -0.1], ["drum", 18.25, 1.28], ["crate", 12.75, 7.3, 0.2], ["panel", 5.0, 10.0, Math.PI / 2]],
      labels: [["CARGO HALL", 10, 10, "#ffd08a"], ["STORE A", 5, 5, "#f0b43c"], ["STORE B", 15, 5, "#58c8e8"], ["STORE C", 5, 15, "#58c8e8"], ["STORE D", 15, 15, "#f0b43c"]],
      lift: true
    },
    h: {
      open: hangarOpen,
      floor: ["#1f2328", "#282d33", "#454d55"], wall: ["#4b5562", "#2e3640", "#ffd34d"], accent: ["#ffd34d", "#5ad1ff"], void: "#05070a", style: "hangar", lamp: "#cfe4ff",
      guns: [["rocket", 5, 5], ["rail", 10, 1], ["scatter", 2, 2], ["minigun", 1, 10], ["laser", 8, 10], ["orb", 10, 5], ["shard", 2, 9], ["mine", 9, 2], ["saw", 5, 14], ["gren", 14, 1]],
      supplies: [["med", 3, 3], ["shield", 10, 7], ["vial", 1, 5], ["vial", 5, 1], ["bigmed", 7, 13], ["pads", 14, 7], ["shield", 4, 10]],
      mega: [10, 3],
      props: [["crate", 7.3, 8.0, 0.05], ["crate", 7.78, 8.0, -0.1], ["crate", 7.55, 8.45, 0.2], ["drum", 12.6, 7.4], ["drum", 12.95, 7.6], ["crate", 8.6, 12.65, 0],
        ["panel", 6.5, 10.5, Math.PI / 2], ["crate", 3.6, 2.4, 0.1], ["drum", 1.4, 3.5], ["crate", 4.5, 7.6, -0.2], ["drum", 11.4, 4.4], ["panel", 10.5, 8.6, 0]],
      labels: [["HANGAR BAY", 10, 10, "#ffe08a"], ["DOCK 1", 2.5, 2.5, "#ffd34d"], ["DOCK 2", 17.5, 17.5, "#5ad1ff"]],
      hangar: true
    },
    d: {
      open: cruiserOpen, space: cruiserSpace,
      floor: ["#1b1f27", "#232833", "#3a4252"], wall: ["#4a5262", "#2b303b", "#a8c4e0"], accent: ["#ff5a4a", "#7fd0ff"], void: "#02030a", style: "tread", lamp: "#ff9a8a",
      guns: [["rocket", 4, 7], ["scatter", 6, 13], ["laser", 7, 10], ["minigun", 3, 10], ["rail", 10, 2], ["gamma", 10, 7], ["shard", 1, 3], ["gren", 6, 6], ["orb", 14, 2], ["mine", 3, 14]],
      supplies: [["med", 3, 6], ["shield", 7, 14], ["vial", 6, 10], ["vial", 4, 10], ["bigmed", 10, 16], ["pads", 1, 10], ["shield", 8, 4]],
      mega: [10, 3],
      props: [["crate", 4.6, 6.3, 0.1], ["crate", 5.3, 6.3, -0.1], ["drum", 7.6, 6.4], ["crate", 5.1, 14.6, -0.15], ["drum", 4.3, 13.4]],
      labels: [["ENGINES", 5, 10, "#ffb070"], ["BRIDGE", 15, 10, "#9fd4ff"], ["THE BREACH", 10, 10, "#c9b6ff"]]
    },
    v: {
      open: vaultOpen,
      floor: ["#231b1a", "#2d2321", "#4d3a33"], wall: ["#5e3d33", "#3a2522", "#ffb070"], accent: ["#ff8a4a", "#ffd27a"], void: "#0a0605", style: "inlay", lamp: "#ffc890",
      guns: [["rocket", 3, 3], ["rail", 10, 1], ["scatter", 2, 9], ["minigun", 10, 6], ["orb", 9, 10], ["laser", 5, 5], ["shard", 15, 3], ["gamma", 1, 5], ["mine", 5, 12], ["gren", 12, 1]],
      supplies: [["med", 1, 1], ["shield", 5, 9], ["vial", 3, 1], ["vial", 1, 3], ["bigmed", 10, 12], ["pads", 11, 4], ["shield", 8, 15]],
      mega: [10, 3],
      props: [["crate", 1.3, 8.3, 0.1], ["crate", 1.3, 8.78, -0.05], ["crate", 4.7, 8.3, 0.15], ["drum", 8.3, 1.3], ["drum", 12.7, 4.7], ["crate", 11.7, 8.3, -0.1],
        ["panel", 4.0, 16.5, 0], ["drum", 19.6, 5.65], ["crate", 18.7, 4.7, 0.2], ["crate", 8.35, 4.6, -0.15]],
      labels: [["THE VAULT", 10, 10, "#ffcf8a"], ["WEST WING", 3, 10, "#ff8a4a"], ["EAST WING", 17, 10, "#ffd27a"]],
      vault: true
    }
  };
  const station = () => STATIONS[mapThemeOf(worldCode)] || STATIONS.f;
  const foundryOpen = (x, y) => station().open(x, y);
  const foundryPoint = (x, y) => ({ x: (x + 0.5) * W / FOUNDRY_N, y: (y + 0.5) * H / FOUNDRY_N });
  const stationMap = () => !!MAPS[mapThemeOf(worldCode)].station;
  const foundryCell = p => [clamp(Math.floor(p.x / W * FOUNDRY_N), 0, 20), clamp(Math.floor(p.y / H * FOUNDRY_N), 0, 20)];
