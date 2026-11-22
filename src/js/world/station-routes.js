  // ---------- getting about a station: which cells a bin can pass, and the way from one to another ----------
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
