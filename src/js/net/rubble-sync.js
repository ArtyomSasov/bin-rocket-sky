  // ---- rubble on the authoritative server: its word on where each piece is, so a shot stops on the same rock on
  // every screen. The server sends the pieces that moved (all of them now and then, which also tells which are
  // gone); a screen eases its own copy of each piece there. Pieces only one side has stay as they are.
  let rubbleWireN = 0;
  function rubbleWire() {
    const all = rubbleWireN++ % 15 === 0, out = [];
    for (const b of rubble) {
      if (b.dead || !b.key) continue;
      if (!all && b.wx !== undefined && Math.abs(b.x - b.wx) < 1.5 && Math.abs(b.y - b.wy) < 1.5 && Math.abs(b.a - b.wa) < 0.02) continue;
      b.wx = b.x; b.wy = b.y; b.wa = b.a;
      out.push([b.key, Math.round(b.x), Math.round(b.y), Math.round(b.a * 100), Math.round(b.vx), Math.round(b.vy), Math.round(b.va * 100)]);
      if (out.length >= 60) break;
    }
    return out.length || all ? { all, list: out } : null;
  }
  function applyRubble(w, lead) {
    if (!w || typeof w !== "object" || !Array.isArray(w.list)) return;
    const byKey = new Map(); for (const b of rubble) if (!b.dead && b.key) byKey.set(b.key, b);
    const seen = new Set(), now = performance.now();
    for (const e of w.list.slice(0, 60)) {
      if (!Array.isArray(e) || e.length !== 7 || typeof e[0] !== "string" || e[0].length > 80 || !e.slice(1).every(Number.isFinite)) continue;
      seen.add(e[0]);
      const b = byKey.get(e[0]);
      if (!b) continue;
      const vx = clamp(e[4], -4000, 4000), vy = clamp(e[5], -4000, 4000), x = clamp(e[1] + vx * lead, 0, W), y = clamp(e[2] + vy * lead, 0, H), a = e[3] / 100;
      const err = Math.hypot(x - b.x, y - b.y);
      if (err > 160) { b.x = x; b.y = y; b.a = a; }
      else { b.x += (x - b.x) * 0.35; b.y += (y - b.y) * 0.35; b.a += angD(a - b.a) * 0.35; }
      b.vx = vx; b.vy = vy; b.va = clamp(e[6] / 100, -10, 10);
    }
    // the full list: a piece the server no longer has crumbled there (a moment's grace for one that just broke off here)
    if (w.all === true) for (const [k, b] of byKey) if (!seen.has(k) && now - (b.freedAt || 0) > 1500) crumble(b);
  }
