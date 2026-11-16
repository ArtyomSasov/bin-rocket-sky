  // Foundry: a fixed, point-symmetric station with three lanes and cross-connectors.
  // The shell is permanent; wreckage from combat remains physical inside the corridors.
  const FOUNDRY_N = 21;
  const foundryOpen = (x, y) => {
    if (x < 1 || x > 19 || y < 1 || y > 19) return false;
    const lane = (y >= 2 && y <= 4 || y >= 9 && y <= 11 || y >= 16 && y <= 18) && x >= 2 && x <= 18;
    const link = [3, 7, 13, 17].some(c => Math.abs(x - c) <= 1) && y >= 3 && y <= 17;
    const room = (x >= 1 && x <= 5 || x >= 8 && x <= 12 || x >= 15 && x <= 19) && y >= 7 && y <= 13;
    const pillar = x === 10 && (y === 8 || y === 12);
    return (lane || link || room) && !pillar;
  };
  const foundryPoint = (x, y) => ({ x: (x + 0.5) * W / FOUNDRY_N, y: (y + 0.5) * H / FOUNDRY_N });
  const stationMap = () => mapThemeOf(worldCode) === "f";
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
  function buildFoundry() {
    SLOTS = ROCKS = GOLD_N = 0;
    world.sparks.length = world.rocks.length = 0;
    const unit = W / FOUNDRY_N;
    for (let y = 0; y < FOUNDRY_N; y++) for (let x = 0; x < FOUNDRY_N;) {
      if (foundryOpen(x, y)) { x++; continue; }
      const start = x; while (x < FOUNDRY_N && !foundryOpen(x, y)) x++;
      const b = newBody("f" + wrecks.length, "station", (x - start) * unit, unit, unit / 12);
      Object.assign(b, { fixed: true, hx: (start + x) * unit / 2, hy: (y + 0.5) * unit });
      b.x = b.hx; b.y = b.hy;
      const q = b.q, w = b.hw * 2, h = b.hh * 2;
      const shade = q.createLinearGradient(0, 0, 0, h);
      shade.addColorStop(0, "#4a6372"); shade.addColorStop(0.12, "#233743"); shade.addColorStop(0.86, "#15232f"); shade.addColorStop(1, "#081119");
      q.fillStyle = shade; q.fillRect(0, 0, w, h);
      q.strokeStyle = "#63808b"; q.lineWidth = 3; q.strokeRect(3, 3, w - 6, h - 6);
      q.strokeStyle = "#0b1620"; q.lineWidth = 5;
      for (let i = 0; i < w; i += unit) { q.strokeRect(i + 14, 18, unit - 28, h - 36); q.fillStyle = "#0a131c"; for (let v = 0; v < 5; v++) q.fillRect(i + unit * 0.3, h * 0.35 + v * 8, unit * 0.4, 3); }
      const col = (start + x) / 2 < 10.5 ? "#e49a59" : "#62d7e0";
      q.fillStyle = col; q.fillRect(12, h - 11, w - 24, 3);
      cellsFromArt(b); wrecks.push(b);
    }
    const spot = (type, x, y, P = GUN_PERIOD[type] || GUN_PERIOD_BASE) => ({ type, ...foundryPoint(x, y), P, off: 0 });
    const gunLayout = [["scatter", 3, 9], ["minigun", 3, 12], ["rocket", 7, 3], ["rail", 10, 2], ["laser", 7, 7], ["orb", 8, 10], ["shard", 7, 17], ["saw", 13, 5], ["mine", 3, 5], ["tele", 3, 15], ["gamma", 10, 4], ["nail", 13, 8], ["gren", 7, 13]];
    const guns = gunLayout.flatMap(([type, x, y]) => [spot(type, x, y), spot(type, 20 - x, 20 - y)]);
    arena = { guns, supplies: [["med", 3, 7], ["shield", 7, 10], ["bigmed", 13, 16]].flatMap(([t, x, y]) => [spot(t, x, y, SUPPLY_PERIOD), spot(t, 20 - x, 20 - y, SUPPLY_PERIOD)]),
      amp: spot("amp", 10, 10, AMP_PERIOD), nuke: null, holy: null,
      pads: [ { ...foundryPoint(5, 3), a: 0 }, { ...foundryPoint(15, 17), a: Math.PI } ] };
    PICKS = guns.length; SUPPLY_SLOTS = arena.supplies.length;
    det = [...wrecks]; rebuildBodies();
  }
  function drawFoundry(now) {
    g.fillStyle = "#060d16"; g.fillRect(0, 0, vw, vh);
    const unit = W / FOUNDRY_N;
    for (let y = 1; y < 20; y++) for (let x = 1; x < 20; x++) {
      if (!foundryOpen(x, y)) continue;
      const px = sx(x * unit), py = sy(y * unit);
      if (!onScreen(px, py, unit)) continue;
      g.fillStyle = (x + y) % 2 ? "#14232d" : "#182832"; g.fillRect(px, py, unit, unit);
      g.strokeStyle = "#253b46"; g.lineWidth = 2; g.strokeRect(px + 8, py + 8, unit - 16, unit - 16);
      g.fillStyle = "#31434b"; for (const ox of [16, unit - 20]) for (const oy of [16, unit - 20]) g.fillRect(px + ox, py + oy, 4, 4);
      if (y === 3 || y === 17) { g.fillStyle = "#b58a3b"; g.fillRect(px + unit * 0.1, py + unit * 0.49, unit * 0.65, 3); }
      // Recessed service grates and lit seams make the floor read as machinery.
      if ((x + y) % 3 === 0) {
        g.fillStyle = "#0a151e"; g.fillRect(px + unit * 0.28, py + unit * 0.27, unit * 0.44, unit * 0.46);
        g.strokeStyle = "#2c424e"; g.lineWidth = 3;
        for (let v = 0; v < 6; v++) { const yy = py + unit * (0.3 + v * 0.07); g.beginPath(); g.moveTo(px + unit * 0.29, yy); g.lineTo(px + unit * 0.71, yy); g.stroke(); }
      }
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (!foundryOpen(x + dx, y + dy)) {
        g.fillStyle = "#02080c88";
        const ex = dx > 0 ? px + unit - 16 : px, ey = dy > 0 ? py + unit - 16 : py;
        g.fillRect(ex, ey, dx ? 16 : unit, dy ? 16 : unit);
        g.fillStyle = x < 10 ? "#dd9359" : "#63c3d0";
        g.fillRect(dx ? ex + 6 : px + unit * 0.3, dy ? ey + 6 : py + unit * 0.3, dx ? 3 : unit * 0.4, dy ? 3 : unit * 0.4);
      }
    }
    // Walkable reactor hatch: a visual landmark beneath the contested Quad pickup.
    const reactor = foundryPoint(10, 10), rx = sx(reactor.x), ry = sy(reactor.y), radius = unit * 0.76;
    if (onScreen(rx, ry, radius * 2)) {
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
    for (const [text, x, y, color] of [["FORGE 01", 3, 10, "#ffae70"], ["REACTOR", 10, 10, "#a8eacb"], ["FORGE 02", 17, 10, "#76e3ed"], ["RAIL DECK", 10, 3, "#bbabdf"], ["SERVICE LOOP", 10, 17, "#b8a987"]]) {
      const p = foundryPoint(x, y), px = sx(p.x), py = sy(p.y);
      if (!onScreen(px, py, unit * 2)) continue;
      g.save(); g.globalAlpha = 0.3; g.strokeStyle = color; g.lineWidth = 4; g.strokeRect(px - unit * 0.9, py - unit * 0.7, unit * 1.8, unit * 1.4);
      g.fillStyle = color; g.font = "800 " + Math.max(18, unit * 0.15) + "px monospace"; g.textAlign = "center"; g.fillText(text, px, py + unit * 0.55); g.restore();
    }
  }
