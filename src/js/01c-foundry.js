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
      floor: ["#1d2328", "#262d33", "#39434a"], wall: ["#3d5868", "#2a3f4d", "#93c4d2"], accent: ["#e49a59", "#62d7e0"], void: "#060d16",
      guns: [["scatter", 3, 9], ["minigun", 3, 12], ["rocket", 7, 3], ["rail", 10, 2], ["laser", 7, 7], ["orb", 8, 10], ["shard", 7, 17], ["mine", 3, 5], ["saw", 3, 15], ["gren", 7, 13]],
      supplies: [["med", 3, 7], ["shield", 7, 10], ["shield", 3, 11], ["bigmed", 13, 16], ["vial", 3, 8], ["vial", 3, 10], ["pads", 3, 16]],
      mega: [10, 3], pads: [[5, 3, 0], [15, 17, Math.PI]],
      // [type, x, y (in cells, centre), turn]; each is mirrored through the middle
      props: [["crate", 1.3, 7.3, 0.1], ["crate", 1.75, 7.3, -0.05], ["crate", 1.3, 7.78, 0], ["drum", 5.62, 7.35], ["drum", 5.62, 12.62], ["crate", 1.3, 12.7, 0.2],
        ["panel", 9.0, 4.0, 0], ["crate", 12.4, 2.3, 0.15], ["drum", 8.3, 7.3], ["crate", 11.68, 12.7, -0.1], ["panel", 4.5, 17.0, Math.PI / 2], ["drum", 2.3, 17.65]],
      labels: [["FORGE 01", 3, 10, "#ffae70"], ["REACTOR", 10, 10, "#a8eacb"], ["FORGE 02", 17, 10, "#76e3ed"], ["RAIL DECK", 10, 3, "#bbabdf"], ["SERVICE LOOP", 10, 17, "#b8a987"]],
      reactor: true
    },
    k: {
      open: cargoOpen,
      floor: ["#25211d", "#2e2924", "#4a4038"], wall: ["#5a5148", "#3b342e", "#e6c08a"], accent: ["#f0b43c", "#58c8e8"], void: "#0c0a09",
      guns: [["rocket", 2, 2], ["rail", 10, 1], ["scatter", 5, 5], ["minigun", 1, 6], ["laser", 7, 7], ["orb", 10, 6], ["shard", 6, 9], ["mine", 5, 2], ["saw", 2, 15], ["gren", 15, 2]],
      supplies: [["med", 5, 6], ["shield", 8, 10], ["vial", 2, 8], ["vial", 2, 12], ["bigmed", 10, 14], ["pads", 13, 10], ["shield", 5, 4]],
      mega: [10, 3], pads: [[4, 1, 0], [16, 19, Math.PI]],
      props: [["crate", 4.32, 4.32, 0], ["crate", 4.8, 4.3, 0.08], ["crate", 4.3, 4.8, -0.06], ["crate", 6.66, 6.62, 0.12], ["drum", 6.7, 4.3], ["drum", 4.3, 6.7],
        ["crate", 1.3, 1.3, 0.1], ["drum", 1.75, 1.28], ["panel", 1.5, 9.0, Math.PI / 2], ["panel", 9.0, 1.5, 0], ["crate", 7.25, 8.75, -0.15], ["drum", 7.25, 12.75],
        ["crate", 18.7, 1.3, -0.1], ["drum", 18.25, 1.28], ["crate", 12.75, 7.3, 0.2], ["panel", 5.0, 10.0, Math.PI / 2]],
      labels: [["CARGO HALL", 10, 10, "#ffd08a"], ["STORE A", 5, 5, "#f0b43c"], ["STORE B", 15, 5, "#58c8e8"], ["STORE C", 5, 15, "#58c8e8"], ["STORE D", 15, 15, "#f0b43c"]],
      lift: true
    },
    h: {
      open: hangarOpen,
      floor: ["#1f2328", "#282d33", "#454d55"], wall: ["#4b5562", "#2e3640", "#ffd34d"], accent: ["#ffd34d", "#5ad1ff"], void: "#05070a",
      guns: [["rocket", 5, 5], ["rail", 10, 1], ["scatter", 2, 2], ["minigun", 1, 10], ["laser", 8, 10], ["orb", 10, 5], ["shard", 2, 9], ["mine", 9, 2], ["saw", 5, 14], ["gren", 14, 1]],
      supplies: [["med", 3, 3], ["shield", 10, 7], ["vial", 1, 5], ["vial", 5, 1], ["bigmed", 7, 13], ["pads", 13, 7], ["shield", 4, 10]],
      mega: [10, 3], pads: [[3, 1, 0], [17, 19, Math.PI]],
      props: [["crate", 7.3, 8.0, 0.05], ["crate", 7.78, 8.0, -0.1], ["crate", 7.55, 8.45, 0.2], ["drum", 12.6, 7.4], ["drum", 12.95, 7.6], ["crate", 8.6, 12.65, 0],
        ["panel", 6.5, 10.5, Math.PI / 2], ["crate", 3.6, 2.4, 0.1], ["drum", 1.4, 3.5], ["crate", 4.5, 7.6, -0.2], ["drum", 11.4, 4.4], ["panel", 10.5, 8.6, 0]],
      labels: [["HANGAR BAY", 10, 10, "#ffe08a"], ["DOCK 1", 2.5, 2.5, "#ffd34d"], ["DOCK 2", 17.5, 17.5, "#5ad1ff"]],
      hangar: true
    },
    v: {
      open: vaultOpen,
      floor: ["#231b1a", "#2d2321", "#4d3a33"], wall: ["#5e3d33", "#3a2522", "#ffb070"], accent: ["#ff8a4a", "#ffd27a"], void: "#0a0605",
      guns: [["rocket", 3, 3], ["rail", 10, 1], ["scatter", 2, 9], ["minigun", 10, 6], ["orb", 9, 10], ["laser", 5, 5], ["shard", 15, 3], ["mine", 1, 5], ["saw", 5, 12], ["gren", 12, 1]],
      supplies: [["med", 1, 1], ["shield", 5, 9], ["vial", 3, 1], ["vial", 1, 3], ["bigmed", 10, 12], ["pads", 12, 5], ["shield", 8, 15]],
      mega: [10, 3], pads: [[3, 6, Math.PI / 2], [17, 14, -Math.PI / 2]],
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
  function foundryRoute(from, to) {
    const start = foundryCell(from), end = foundryCell(to), key = (x, y) => y * FOUNDRY_N + x;
    if (!foundryOpen(...start) || !foundryOpen(...end)) return null;
    const queue = [start], seen = new Map([[key(...start), null]]);
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      if (x === end[0] && y === end[1]) {
        let cur = [x, y], prev = seen.get(key(...cur));
        while (prev && key(...prev) !== key(...start)) { cur = prev; prev = seen.get(key(...cur)); }
        return foundryPoint(...cur);
      }
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (!foundryOpen(nx, ny) || seen.has(k)) continue;
        seen.set(k, [x, y]); queue.push([nx, ny]);
      }
    }
    return null;
  }
  // diagonal yellow-and-black hazard stripes in a band
  function hazardBand(q, x, y, w, h) {
    q.save(); q.beginPath(); q.rect(x, y, w, h); q.clip();
    q.fillStyle = "#d9a326"; q.fillRect(x, y, w, h);
    q.fillStyle = "#17140f"; const s = Math.max(8, Math.min(w, h) * 1.4);
    for (let k = -2; k * s < w + h; k++) { q.beginPath(); q.moveTo(x + k * s * 2, y); q.lineTo(x + k * s * 2 + s, y); q.lineTo(x + k * s * 2 + s - h, y + h); q.lineTo(x + k * s * 2 - h, y + h); q.fill(); }
    q.restore();
  }
  // one run of wall cells as a raised slab: a plated top, and on every edge that meets the floor a lit rim,
  // a hazard band and a dark lip (so the wall stands up off the floor)
  function paintStationWall(b, x0, x1, y, unit, st) {
    const q = b.q, h = unit, [top, deep, rim] = st.wall, open = st.open;
    const sg = q.createLinearGradient(0, 0, unit * 0.6, h);
    sg.addColorStop(0, top); sg.addColorStop(1, deep);
    q.fillStyle = sg; q.fillRect(0, 0, (x1 - x0) * unit, h);
    const e = Math.max(5, unit * 0.045), band = Math.max(7, unit * 0.06);
    for (let x = x0; x < x1; x++) {
      const px = (x - x0) * unit;
      // two plates per cell, with rivets and a brushed seam
      q.strokeStyle = "rgba(0,0,0,0.35)"; q.lineWidth = 3;
      for (const [ox, oy, ow, oh] of [[0.1, 0.1, 0.8, 0.36], [0.1, 0.54, 0.8, 0.36]]) q.strokeRect(px + unit * ox, unit * oy, unit * ow, unit * oh);
      q.strokeStyle = "rgba(255,255,255,0.07)"; q.lineWidth = 2;
      for (const [ox, oy, ow, oh] of [[0.1, 0.1, 0.8, 0.36], [0.1, 0.54, 0.8, 0.36]]) { q.beginPath(); q.moveTo(px + unit * ox + 3, unit * oy + 3); q.lineTo(px + unit * (ox + ow) - 3, unit * oy + 3); q.stroke(); }
      q.fillStyle = "rgba(0,0,0,0.45)";
      for (const rx of [0.16, 0.84]) for (const ry of [0.16, 0.4, 0.6, 0.84]) { q.beginPath(); q.arc(px + unit * rx, unit * ry, Math.max(2, unit * 0.014), 0, 6.29); q.fill(); }
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (!open(x + dx, y + dy)) continue;
        const L = dx < 0 ? px : dx > 0 ? px + unit - e : px, T = dy < 0 ? 0 : dy > 0 ? h - e : 0, Wd = dx ? e : unit, Hd = dy ? e : h;
        if (dx) hazardBand(q, dx < 0 ? px + e : px + unit - e - band, 0, band, h); else hazardBand(q, px, dy < 0 ? e : h - e - band, unit, band);
        q.fillStyle = rim; q.fillRect(L, T, Wd, Hd);   // the lit rim
        q.fillStyle = "rgba(0,0,0,0.55)"; q.fillRect(dx < 0 ? L : dx > 0 ? L + e - 2 : L, dy < 0 ? T : dy > 0 ? T + e - 2 : T, dx ? 2 : Wd, dy ? 2 : Hd);
      }
    }
  }
  // the props: top-down crates, drums and partitions, painted from seeded numbers (the server paints the same)
  const PROP_SIZE = { crate: [0.34, 0.34], drum: [0.24, 0.24], panel: [0.7, 0.1] };
  function paintProp(b, type, w, h, rnd) {
    const q = b.q;
    q.save(); q.translate(b.hw, b.hh);
    if (type === "crate") {
      const [base, dark, light] = [["#a8743f", "#6e4a28", "#d39a5c"], ["#5d6b3a", "#3c4626", "#7f8f52"], ["#3f6a8f", "#28465f", "#6a95ba"]][Math.floor(rnd(1) * 3)];
      q.fillStyle = dark; q.fillRect(-w / 2, -h / 2, w, h);
      q.fillStyle = base; q.fillRect(-w / 2 + w * 0.1, -h / 2 + h * 0.1, w * 0.8, h * 0.8);
      q.strokeStyle = "rgba(0,0,0,0.3)"; q.lineWidth = Math.max(1, w * 0.02);
      for (let k = 1; k < 5; k++) { const yy = -h / 2 + h * (0.1 + k * 0.16); q.beginPath(); q.moveTo(-w * 0.4, yy); q.lineTo(w * 0.4, yy); q.stroke(); }
      q.strokeStyle = dark; q.lineWidth = w * 0.09;   // the cross brace
      q.beginPath(); q.moveTo(-w * 0.38, -h * 0.38); q.lineTo(w * 0.38, h * 0.38); q.moveTo(w * 0.38, -h * 0.38); q.lineTo(-w * 0.38, h * 0.38); q.stroke();
      q.fillStyle = light; q.fillRect(-w / 2, -h / 2, w, h * 0.05); q.fillRect(-w / 2, -h / 2, w * 0.05, h);
      q.fillStyle = "rgba(0,0,0,0.5)"; q.fillRect(-w / 2, h / 2 - h * 0.05, w, h * 0.05); q.fillRect(w / 2 - w * 0.05, -h / 2, w * 0.05, h);
      q.fillStyle = "#c9c2b0";
      for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) q.fillRect(cx * w * 0.43 - w * 0.04, cy * h * 0.43 - h * 0.04, w * 0.08, h * 0.08);   // corner plates
    } else if (type === "drum") {
      const r = w / 2, [c0, c1] = [["#c23b2c", "#7a1f18"], ["#2f6aa8", "#1b3c62"], ["#d0a12a", "#7d5e14"]][Math.floor(rnd(1) * 3)];
      const gr = q.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      gr.addColorStop(0, c0); gr.addColorStop(1, c1);
      q.fillStyle = gr; q.beginPath(); q.arc(0, 0, r, 0, 6.29); q.fill();
      q.strokeStyle = "rgba(0,0,0,0.45)"; q.lineWidth = r * 0.12; q.beginPath(); q.arc(0, 0, r * 0.92, 0, 6.29); q.stroke();
      q.strokeStyle = "rgba(255,255,255,0.18)"; q.lineWidth = r * 0.06; q.beginPath(); q.arc(0, 0, r * 0.66, 0, 6.29); q.stroke();
      q.fillStyle = "#2a2a2a"; q.beginPath(); q.arc(r * 0.38, -r * 0.1, r * 0.14, 0, 6.29); q.fill();   // the bung
      q.fillStyle = "#f2e9d0"; q.beginPath(); q.moveTo(-r * 0.25, r * 0.2); q.lineTo(r * 0.05, -r * 0.32); q.lineTo(r * 0.12, r * 0.2); q.closePath(); q.fill();   // a warning triangle
    } else {   // a partition: a steel frame round a pane of tinted armour glass
      q.fillStyle = "#4d5a63"; q.fillRect(-w / 2, -h / 2, w, h);
      q.fillStyle = "rgba(120,210,230,0.82)"; q.fillRect(-w / 2 + h * 0.4, -h * 0.28, w - h * 0.8, h * 0.56);
      q.strokeStyle = "rgba(255,255,255,0.55)"; q.lineWidth = Math.max(1, h * 0.08);
      for (let k = 0; k < 3; k++) { const x = -w * 0.3 + k * w * 0.22; q.beginPath(); q.moveTo(x, h * 0.25); q.lineTo(x + h * 0.5, -h * 0.25); q.stroke(); }
      q.fillStyle = "#2b3238"; for (const sx2 of [-1, 0, 1]) q.fillRect(sx2 * w * 0.47 - h * 0.25, -h / 2, h * 0.5, h);   // the posts
    }
    q.restore();
    cellsFromArt(b);
  }
  function addProp(type, x, y, turn, unit, n) {
    const [fw, fh] = PROP_SIZE[type], w = fw * unit, h = fh * unit, cs = Math.max(3, Math.round(unit / 48));
    const b = newBody("k" + n, type, w + cs, h + cs, cs), rnd = k => hash(n, k, 977);
    paintProp(b, type, w, h, rnd);
    Object.assign(b, { prop: true, hx: x, hy: y, x, y, a: turn || 0 });
    return b;
  }
  // once worn down past half, a prop gives way: what is left comes apart in a few pieces (on every screen the same,
  // as the pieces follow from its cells), a drum with a burst of flame
  function collapseProp(b) {
    const { gw, gh } = b, nx = gw > gh * 2 ? 3 : 2, ny = gh > gw * 2 ? 3 : 2, groups = new Map();
    for (let k = 0; k < b.cells.length; k++) if (b.cells[k]) {
      const i = k % gw, j = (k - i) / gw, key = Math.floor(i * nx / gw) + Math.floor(j * ny / gh) * nx;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(k);
    }
    for (const list of groups.values()) breakAway(b, list);
    if (b.kind === "drum") explode(b.x, b.y, 30, 200);
    else smoke(b.x, b.y, lowQ ? 3 : 7, 70, 1.4);
    sfx("chunk", 0.8, b.kind === "panel" ? 1.4 : 0.8, b.x, b.y);
    b.dead = true; rebuildBodies();
  }
  function buildFoundry() {
    SLOTS = ROCKS = GOLD_N = 0;
    world.sparks.length = world.rocks.length = 0;
    const st = station(), unit = W / FOUNDRY_N;
    // a row's run of wall: the hull (the outer ring) stays whole; the walls inside are solid but heavy weapons break
    // them (wall: see carveLocal), and they stand again with the next round's station
    for (let y = 0; y < FOUNDRY_N; y++) for (let x = 0; x < FOUNDRY_N;) {
      if (foundryOpen(x, y)) { x++; continue; }
      const start = x, hull = stationHull(x, y); while (x < FOUNDRY_N && !foundryOpen(x, y) && stationHull(x, y) === hull) x++;
      const b = newBody("f" + wrecks.length, "station", (x - start) * unit, unit, unit / 12);
      Object.assign(b, { fixed: hull, wall: !hull, hx: (start + x) * unit / 2, hy: (y + 0.5) * unit });
      b.x = b.hx; b.y = b.hy;
      paintStationWall(b, start, x, y, unit, st);
      cellsFromArt(b); wrecks.push(b);
    }
    const props = [];
    for (const [type, x, y, turn] of st.props) for (const m of [false, true]) {
      const px = (m ? 21 - x : x) * unit, py = (m ? 21 - y : y) * unit;
      props.push(addProp(type, px, py, (turn || 0) + (m ? Math.PI : 0), unit, props.length));
    }
    const spot = (type, x, y, P = GUN_PERIOD[type] || GUN_PERIOD_BASE) => ({ type, ...foundryPoint(x, y), P, off: 0 });
    const guns = st.guns.flatMap(([type, x, y]) => [spot(type, x, y), spot(type, 20 - x, 20 - y)]);
    arena = { guns, supplies: st.supplies.flatMap(([t, x, y]) => [spot(t, x, y, SUPPLIES[t].period), spot(t, 20 - x, 20 - y, SUPPLIES[t].period)]),
      amp: spot("amp", 10, 10, AMP_PERIOD), nuke: null, holy: null,
      pads: BOOST_PADS ? st.pads.map(([x, y, a]) => ({ ...foundryPoint(x, y), a })) : [] };
    arena.supplies.push(spot("mega", ...st.mega, SUPPLIES.mega.period));
    PICKS = guns.length; SUPPLY_SLOTS = arena.supplies.length;
    det = [...wrecks, ...props]; rebuildBodies();
  }
  // the floor: one tile of tread plate per station, painted once (a cell is a single drawImage)
  const floorCache = new Map();
  function floorTile(st) {
    let c = floorCache.get(st);
    if (c) return c;
    const S = 192, [a, b2, seam] = st.floor;
    c = document.createElement("canvas"); c.width = c.height = S;
    const q = c.getContext("2d");
    q.fillStyle = a; q.fillRect(0, 0, S, S);
    q.fillStyle = b2;   // four plates
    for (const [x, y] of [[0, 0], [S / 2, 0], [0, S / 2], [S / 2, S / 2]]) q.fillRect(x + 4, y + 4, S / 2 - 8, S / 2 - 8);
    q.strokeStyle = "rgba(255,255,255,0.05)"; q.lineWidth = 2;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {   // the tread: little raised dashes, alternately turned
      const x = 12 + i * 24, y = 12 + j * 24, d = (i + j) % 2 ? 1 : -1;
      q.beginPath(); q.moveTo(x - 5, y - 5 * d); q.lineTo(x + 5, y + 5 * d); q.stroke();
    }
    q.strokeStyle = seam; q.lineWidth = 2; q.strokeRect(1, 1, S - 2, S - 2);
    q.beginPath(); q.moveTo(S / 2, 0); q.lineTo(S / 2, S); q.moveTo(0, S / 2); q.lineTo(S, S / 2); q.stroke();
    q.fillStyle = "rgba(0,0,0,0.5)";
    for (const x of [8, S / 2 - 8, S / 2 + 8, S - 8]) for (const y of [8, S / 2 - 8, S / 2 + 8, S - 8]) { q.beginPath(); q.arc(x, y, 2.2, 0, 6.29); q.fill(); }
    floorCache.set(st, c);
    return c;
  }
  function drawFoundry(now) {
    const st = station();
    g.fillStyle = st.void; g.fillRect(0, 0, vw, vh);
    const unit = W / FOUNDRY_N, tile = floorTile(st), sh = unit * 0.16;
    for (let y = 1; y < 20; y++) for (let x = 1; x < 20; x++) {
      const px = sx(x * unit), py = sy(y * unit);
      if (!onScreen(px + unit / 2, py + unit / 2, unit)) continue;
      if (!foundryOpen(x, y)) {   // the deck under a wall shows where the wall is broken: darker, dusty
        g.drawImage(tile, px, py, unit + 0.5, unit + 0.5);
        g.fillStyle = "rgba(10,8,10,0.55)"; g.fillRect(px, py, unit + 0.5, unit + 0.5);
        continue;
      }
      g.drawImage(tile, px, py, unit + 0.5, unit + 0.5);
      // the walls cast a shadow on the floor next to them, and a strip of light runs along their foot
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (!foundryOpen(x + dx, y + dy)) {
        const ex = dx > 0 ? px + unit - sh : px, ey = dy > 0 ? py + unit - sh : py, ew = dx ? sh : unit, eh = dy ? sh : unit;
        const gr = g.createLinearGradient(dx > 0 ? px + unit : dx < 0 ? px : 0, dy > 0 ? py + unit : dy < 0 ? py : 0, dx > 0 ? px + unit - sh : dx < 0 ? px + sh : 0, dy > 0 ? py + unit - sh : dy < 0 ? py + sh : 0);
        gr.addColorStop(0, "rgba(0,0,0,0.62)"); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(ex, ey, ew, eh);
        g.fillStyle = x < 10 ? st.accent[0] : st.accent[1]; g.globalAlpha = 0.55 + 0.1 * Math.sin(now / 900 + x + y);
        g.fillRect(dx ? (dx > 0 ? px + unit - sh * 0.55 : px + sh * 0.45) : px + unit * 0.3, dy ? (dy > 0 ? py + unit - sh * 0.55 : py + sh * 0.45) : py + unit * 0.3, dx ? 3 : unit * 0.4, dy ? 3 : unit * 0.4);
        g.globalAlpha = 1;
      }
    }
    // burns on the deck: a dark blot with a ragged edge, embers in it glowing out over a few seconds
    for (const b of scorches) {
      const x = sx(b.x), y = sy(b.y), r = b.r;
      if (!onScreen(x, y, r)) continue;
      const age = (now - b.born) / 1000, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(8,6,6,0.75)"); gr.addColorStop(0.55, "rgba(12,9,8,0.5)"); gr.addColorStop(1, "rgba(12,9,8,0)");
      g.fillStyle = gr; g.beginPath();
      for (let k = 0; k < 14; k++) { const a = k / 14 * 6.283, rr = r * (0.8 + 0.2 * Math.sin(b.seed + k * 2.3)); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.fill();
      if (age < 6) {
        g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.6 * (1 - age / 6) * (0.8 + 0.2 * Math.sin(now / 90 + b.seed));
        for (let k = 0; k < 7; k++) { const a = b.seed + k * 0.9, d = r * (0.15 + 0.5 * ((k * 37 % 10) / 10)); g.drawImage(dotSprite(k % 2 ? "#ff7a26" : "#ffab3d"), x + Math.cos(a) * d - 6, y + Math.sin(a) * d - 6, 12, 12); }
        g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
      }
    }
    if (st.reactor) drawReactor(now, unit);
    if (st.lift) drawLift(now, unit);
    if (st.hangar) drawHangarPads(now, unit);
    if (st.vault) drawVaultDoor(now, unit);
    for (const [text, x, y, color] of st.labels) {
      const p = foundryPoint(x, y), px = sx(p.x), py = sy(p.y);
      if (!onScreen(px, py, unit * 2)) continue;
      g.save(); g.globalAlpha = 0.3; g.strokeStyle = color; g.lineWidth = 4; g.strokeRect(px - unit * 0.9, py - unit * 0.7, unit * 1.8, unit * 1.4);
      g.fillStyle = color; g.font = "800 " + Math.max(18, unit * 0.15) + "px monospace"; g.textAlign = "center"; g.fillText(text, px, py + unit * 0.55); g.restore();
    }
  }
  // Foundry's walkable reactor hatch: a landmark beneath the contested Quad pickup
  function drawReactor(now, unit) {
    const reactor = foundryPoint(10, 10), rx = sx(reactor.x), ry = sy(reactor.y), radius = unit * 0.76;
    if (!onScreen(rx, ry, radius * 2)) return;
    g.save(); g.translate(rx, ry);
    const glow = g.createRadialGradient(0, 0, radius * 0.15, 0, 0, radius * 1.65);
    glow.addColorStop(0, "#57dcbc26"); glow.addColorStop(1, "#57dcbc00");
    g.fillStyle = glow; g.fillRect(-radius * 1.65, -radius * 1.65, radius * 3.3, radius * 3.3);
    g.fillStyle = "#0a161f"; g.strokeStyle = "#46606c"; g.lineWidth = 9;
    g.beginPath(); g.arc(0, 0, radius, 0, Math.PI * 2); g.fill(); g.stroke();
    g.strokeStyle = "#213a43"; g.lineWidth = 14;
    g.beginPath(); g.arc(0, 0, radius * 0.72, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      g.strokeStyle = i % 3 ? "#d7a650" : "#70e0c1"; g.lineWidth = 4;
      g.beginPath(); g.arc(0, 0, radius * 0.9, a, a + 0.22); g.stroke();
      g.strokeStyle = "#324a55"; g.lineWidth = 7;
      g.beginPath(); g.moveTo(Math.cos(a) * radius * 0.25, Math.sin(a) * radius * 0.25); g.lineTo(Math.cos(a) * radius * 0.62, Math.sin(a) * radius * 0.62); g.stroke();
    }
    g.strokeStyle = "rgba(104,239,201," + (0.4 + Math.sin(now / 1100) * 0.15) + ")"; g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, radius * 0.52, 0, Math.PI * 2); g.stroke(); g.restore();
  }
  // Cargo Deck's freight lift in the middle of the hall: a hazard-edged platform with a blinking beacon at each corner
  function drawLift(now, unit) {
    const c = foundryPoint(10, 10), x = sx(c.x), y = sy(c.y), s = unit * 1.3;
    if (!onScreen(x, y, s * 2)) return;
    g.save(); g.translate(x, y);
    g.fillStyle = "rgba(0,0,0,0.45)"; g.fillRect(-s * 0.56, -s * 0.56, s * 1.12, s * 1.12);
    hazardBand(g, -s / 2, -s / 2, s, s * 0.07); hazardBand(g, -s / 2, s / 2 - s * 0.07, s, s * 0.07);
    hazardBand(g, -s / 2, -s / 2, s * 0.07, s); hazardBand(g, s / 2 - s * 0.07, -s / 2, s * 0.07, s);
    g.fillStyle = "#35302a"; g.fillRect(-s * 0.43, -s * 0.43, s * 0.86, s * 0.86);
    g.strokeStyle = "#4d453c"; g.lineWidth = 4;
    for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(-s * 0.43, k * s * 0.12); g.lineTo(s * 0.43, k * s * 0.12); g.stroke(); }
    const on = Math.sin(now / 300) > 0;
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.fillStyle = on === (cx === cy) ? "#ffb43c" : "#5a3a12";
      g.beginPath(); g.arc(cx * s * 0.47, cy * s * 0.47, s * 0.03, 0, 6.29); g.fill();
    }
    g.restore();
  }
  // Hangar: two landing circles painted on the bay floor, an H in each, and the yellow taxi lines between them
  function drawHangarPads(now, unit) {
    for (const [cx, cy] of [[7.5, 7.5], [13.5, 13.5]]) {
      const x = sx(cx * unit), y = sy(cy * unit), r = unit * 1.15;
      if (!onScreen(x, y, r * 1.5)) continue;
      g.save(); g.translate(x, y);
      g.strokeStyle = "rgba(255,211,77,0.55)"; g.lineWidth = 8; g.beginPath(); g.arc(0, 0, r, 0, 6.29); g.stroke();
      g.setLineDash([24, 16]); g.lineWidth = 4; g.beginPath(); g.arc(0, 0, r * 0.78, 0, 6.29); g.stroke(); g.setLineDash([]);
      g.fillStyle = "rgba(255,211,77,0.45)"; const h = r * 0.5, w = r * 0.12;
      g.fillRect(-h * 0.6, -h, w, h * 2); g.fillRect(h * 0.6 - w, -h, w, h * 2); g.fillRect(-h * 0.6, -w / 2, h * 1.2, w);
      const on = Math.sin(now / 400 + cx) > 0;
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.fillStyle = on === (k % 2 === 0) ? "#5ad1ff" : "#1d3a48"; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, unit * 0.035, 0, 6.29); g.fill(); }
      g.restore();
    }
    const a = sx(7.5 * unit), b = sy(7.5 * unit), c = sx(13.5 * unit), d = sy(13.5 * unit);
    g.save(); g.strokeStyle = "rgba(255,211,77,0.3)"; g.lineWidth = 6; g.setLineDash([40, 30]);
    g.beginPath(); g.moveTo(a, b); g.lineTo(c, b); g.lineTo(c, d); g.moveTo(a, b); g.lineTo(a, d); g.lineTo(c, d); g.stroke(); g.restore();
  }
  // Vault: the great round vault door set in the floor of the middle room, its bolts and a slowly turning wheel
  function drawVaultDoor(now, unit) {
    const p = foundryPoint(10, 10), x = sx(p.x), y = sy(p.y), r = unit * 1.05;
    if (!onScreen(x, y, r * 1.6)) return;
    g.save(); g.translate(x, y);
    const gr = g.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
    gr.addColorStop(0, "#6b4a3a"); gr.addColorStop(0.7, "#3e2a24"); gr.addColorStop(1, "#22150f");
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 6.29); g.fill();
    g.strokeStyle = "#b07a4a"; g.lineWidth = 10; g.stroke();
    g.fillStyle = "#d8a060";
    for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; g.beginPath(); g.arc(Math.cos(a) * r * 0.88, Math.sin(a) * r * 0.88, unit * 0.04, 0, 6.29); g.fill(); }
    g.rotate(now / 6000);
    g.strokeStyle = "#c8925a"; g.lineWidth = 9;
    g.beginPath(); g.arc(0, 0, r * 0.42, 0, 6.29); g.stroke();
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12); g.lineTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62); g.stroke(); }
    g.fillStyle = "#ffcf8a"; g.beginPath(); g.arc(0, 0, r * 0.1, 0, 6.29); g.fill();
    g.restore();
  }

