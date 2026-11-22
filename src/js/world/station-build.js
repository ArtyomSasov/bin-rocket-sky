  // ---------- a station built: its walls painted as raised slabs, its crates, drums and partitions ----------
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
      amp: spot("amp", 10, 10, AMP_PERIOD), nuke: null, holy: null };
    arena.supplies.push(spot("mega", ...st.mega, SUPPLIES.mega.period));
    PICKS = guns.length; SUPPLY_SLOTS = arena.supplies.length;
    det = [...wrecks, ...props]; rebuildBodies();
  }
  // the floor: one tile of tread plate per station, painted once (a cell is a single drawImage)
  const floorCache = new Map();
