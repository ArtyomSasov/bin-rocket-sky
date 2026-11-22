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
      mega: [10, 3], pads: [[5, 3, 0], [15, 17, Math.PI]],
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
      mega: [10, 3], pads: [[4, 1, 0], [16, 19, Math.PI]],
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
      mega: [10, 3], pads: [[3, 1, 0], [17, 19, Math.PI]],
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
      mega: [10, 3], pads: [[1, 6, Math.PI / 2], [19, 14, -Math.PI / 2]],
      props: [["crate", 4.6, 6.3, 0.1], ["crate", 5.3, 6.3, -0.1], ["drum", 7.6, 6.4], ["crate", 5.1, 14.6, -0.15], ["drum", 4.3, 13.4]],
      labels: [["ENGINES", 5, 10, "#ffb070"], ["BRIDGE", 15, 10, "#9fd4ff"], ["THE BREACH", 10, 10, "#c9b6ff"]]
    },
    v: {
      open: vaultOpen,
      floor: ["#231b1a", "#2d2321", "#4d3a33"], wall: ["#5e3d33", "#3a2522", "#ffb070"], accent: ["#ff8a4a", "#ffd27a"], void: "#0a0605", style: "inlay", lamp: "#ffc890",
      guns: [["rocket", 3, 3], ["rail", 10, 1], ["scatter", 2, 9], ["minigun", 10, 6], ["orb", 9, 10], ["laser", 5, 5], ["shard", 15, 3], ["gamma", 1, 5], ["mine", 5, 12], ["gren", 12, 1]],
      supplies: [["med", 1, 1], ["shield", 5, 9], ["vial", 3, 1], ["vial", 1, 3], ["bigmed", 10, 12], ["pads", 11, 4], ["shield", 8, 15]],
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
  // A cell a bin can get through: open by the plan, or an inner wall blown wide open there (its middle and four points
  // round it clear of what still stands). Looked up afresh every half second, as walls go
  let passCache = null, passAt = -1e9;
  function passable(x, y) {
    if (foundryOpen(x, y)) return true;
    if (x <= 0 || y <= 0 || x >= FOUNDRY_N - 1 || y >= FOUNDRY_N - 1) return false;   // (the hull never gives)
    const now = performance.now();
    if (!passCache || now - passAt > 500) { passCache = new Map(); passAt = now; }
    const k = y * FOUNDRY_N + x;
    let v = passCache.get(k);
    if (v === undefined) {
      const c = foundryPoint(x, y), u = W / FOUNDRY_N * 0.28;
      v = [[0, 0], [u, 0], [-u, 0], [0, u], [0, -u]].every(([dx, dy]) => !solidAny(c.x + dx, c.y + dy));
      passCache.set(k, v);
    }
    return v;
  }
  function foundryRoute(from, to) {
    const start = foundryCell(from), end = foundryCell(to), key = (x, y) => y * FOUNDRY_N + x;
    if (!passable(...start) || !passable(...end)) return null;
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
        if (!passable(nx, ny) || seen.has(k)) continue;
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
