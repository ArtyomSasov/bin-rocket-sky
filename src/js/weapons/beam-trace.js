  function traceBeam(s) {
    s.traced = true; s.expireAfterStep = true;
    const v = Math.hypot(s.vx, s.vy) || 1, dx = s.vx / v, dy = s.vy / v, pierce = pierces(s);
    s.px = s.x; s.py = s.y;
    const reach = beamReach(s), max = pierce ? reach : firstBinAlong(s, reach);
    const own = s.mine || botById.has(s.owner);
    let L = pierce ? max : 0, stop = null;
    while (L < max) {
      const nl = Math.min(max, L + 4), x = s.x + dx * nl, y = s.y + dy * nl;
      if (x < 0 || x > W || y < 0 || y > H) break;
      L = nl;
      const b = solidAny(x, y);
      if (!b) continue;
      if (!pierce) { stop = { b, x, y }; break; }
      // Piercing terrain is cut as a single capsule after the endpoint is known.
    }
    const ex = s.x + dx * L, ey = s.y + dy * L;
    s.px = s.x; s.py = s.y; s.x = ex; s.y = ey;
    if (pierce && (s.kind === K.RAIL || s.cut)) railMelt(s.px, s.py, ex, ey, (s.cut || SHOTS[s.kind].carve) * 0.7);   // (before the cut: it sees what was there)
    if (pierce) carveBeam(s, s.cut || SHOTS[s.kind].carve);
    if (stop) {   // a beam ends on rock: it scorches a crater there
      surfaceHit(stop.b, stop.x, stop.y, s.kind);   // (first: its pieces are cut from the face before the crater is)
      if (own || stop.b.free) carveAt(stop.b, stop.x, stop.y, SHOTS[s.kind].carve, own);
      impact(stop.x, stop.y, SHOTS[s.kind].col, 0.8);
    }
    if (s.kind === K.PISTOL) beams.push({ x1: s.px, y1: s.py, x2: s.x, y2: s.y, t: 0, pistol: true });
    if (s.kind === K.BULLET) {
      const speed = 2600;
      const distance = Math.hypot(s.x - s.px, s.y - s.py);
      beams.push({ x1: s.px, y1: s.py, x2: s.x, y2: s.y, t: 0, round: s.kind, speed, duration: Math.min(.45, distance / speed + .035) });
      if (beams.length > 256) beams.splice(0, beams.length - 256);
    }
    s.beamHit = stop ? "body" : max < reach ? "bin" : null;
    if (s.kind === K.SHOCK) laserBeam(s, s.owner);
    s.life = Math.min(s.life, 1e-4);   // one frame of hits, then gone
  }
  const spotHeard = new Set();
  // the hook: it flies until it bites into something solid or a bin (not its own), then holds there (following a bin)
  // and hauls its pilot in, up to 0.9 s or until the pilot is there. Hauled where the pilot's flight is decided: my
  // own on my screen (and foreseen on the server's game), a server pilot's on the server. Returns true when it is done
  const HOOK_PULL = 1900, HOOK_HOLD = 0.9;
  function hookStep(s, dt, now) {
    const mineHere = s.mine || (serverRun && s.owner === srv.id), sh = mineHere ? me : botById.get(s.owner) || remotes.get(s.owner);
    if (!sh || sh.dead) return true;
    if (!s.latch) {
      const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt, len = Math.hypot(nx - s.x, ny - s.y), n = Math.max(1, Math.ceil(len / 10));
      for (let k = 1; k <= n; k++) {
        const px = s.x + (nx - s.x) * k / n, py = s.y + (ny - s.y) * k / n;
        let o = null;
        for (const [rid, r] of remotes) if (rid !== s.owner && !r.dead && Math.hypot(r.x - px, r.y - py) < binR(r.lv || 1) + 4) { o = [rid, r]; break; }
        if (!o && !mineHere && playing && !me.dead && Math.hypot(me.x - px, me.y - py) < binR(me.lv) + 4) o = ["me", me];
        if (o || solidAny(px, py)) {
          s.latch = o ? { id: o[0], dx: px - o[1].x, dy: py - o[1].y } : { x: px, y: py }; s.x = px; s.y = py; s.vx = s.vy = 0; s.held = 0; s.life = 1;
          sparkShower(px, py, -(nx - s.x), -(ny - s.y), 0.6); impact(px, py, "#dfe6f0", 0.6);
          if (Math.hypot(px - me.x, py - me.y) < 1800) packPlay("p_metal", 0.7, px, py);
          return false;
        }
      }
      s.x = nx; s.y = ny;
      return s.expireAfterStep;   // (missed: reeled back in)
    }
    const L = s.latch, o = L.id === undefined ? null : L.id === "me" ? me : remotes.get(L.id) || botById.get(L.id);
    if (L.id !== undefined && (!o || o.dead)) return true;
    if (o) { s.x = o.x + L.dx * 0.6; s.y = o.y + L.dy * 0.6; }   // (a bin: held to it as it moves)
    s.held += dt; s.life = 1; s.expireAfterStep = false;
    const dx = s.x - sh.x, dy = s.y - sh.y, d = Math.hypot(dx, dy) || 1;
    if (d < binR(sh.lv || 1) + (o ? binR(o.lv || 1) + 10 : 30) || s.held > HOOK_HOLD) return true;   // there
    const hauls = mineHere || (botById.get(s.owner) || {}).input;
    if (hauls) { const k = Math.min(1, dt * 14); sh.vx += (dx / d * HOOK_PULL - sh.vx) * k; sh.vy += (dy / d * HOOK_PULL - sh.vy) * k; }
    return false;
  }
