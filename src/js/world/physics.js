  // ---------- mass and collisions: one set of weights for everything ----------
  // Masses in "bins": a Lv 1 bin weighs 1, a bigger one with its area. A wreck's hulk is a shell (a third of a bin), a
  // piece of a broken bin a quarter, a scrap of debris almost nothing; loose rubble weighs what its rock does (its
  // cells' area, rock half again as dense as a bin); planets, moons, wrecks and walls do not move (Infinity).
  const BIN_AREA = Math.PI * 30 * 30;
  const rubbleMass = b => Math.max(0.04, b.mass * b.cs * b.cs / BIN_AREA * 1.5);
  const debrisMass = d => Math.max(0.003, 0.012 * ((d.size || 4) / 5) ** 2);
  // two things meeting along n (from b to a): momentum kept, the bounce by e (0 dead, 1 elastic); returns the impulse
  // (in bin x px/s; what each feels is j / its mass: that is what hurts)
  function collide(a, ma, b, mb, nx, ny, e) {
    const vn = (a.vx - (b.vx || 0)) * nx + (a.vy - (b.vy || 0)) * ny;
    if (vn >= 0) return 0;
    const j = -(1 + e) * vn / (1 / ma + (mb === Infinity ? 0 : 1 / mb));
    a.vx += j * nx / ma; a.vy += j * ny / ma;
    if (mb !== Infinity) { b.vx -= j * nx / mb; b.vy -= j * ny / mb; }
    return j;
  }
  // where the world is solid, on a coarse grid (16 px), redrawn four times a second: cheap enough for every spark and
  // ember to ask whether it has hit something (the effects only: play goes by the bodies' own cells)
  const SG = 16;
  let sgrid = null, sgW = 0, sgH = 0, sgAt = -1e9;
  function rebuildSolidGrid(now) {
    if (sgrid && now - sgAt < 250) return;
    sgAt = now; sgW = Math.ceil(W / SG); sgH = Math.ceil(H / SG);
    if (!sgrid || sgrid.length !== sgW * sgH) sgrid = new Uint8Array(sgW * sgH); else sgrid.fill(0);
    for (const b of bodies) {
      if (b.dead || b.free) continue;
      const i0 = Math.max(0, Math.floor((b.x - b.r) / SG)), i1 = Math.min(sgW - 1, Math.floor((b.x + b.r) / SG));
      const j0 = Math.max(0, Math.floor((b.y - b.r) / SG)), j1 = Math.min(sgH - 1, Math.floor((b.y + b.r) / SG));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (!sgrid[j * sgW + i] && solidAt(b, (i + 0.5) * SG, (j + 0.5) * SG)) sgrid[j * sgW + i] = 1;
    }
  }
  const solidCell = (x, y) => { if (!sgrid) return 0; const i = Math.floor(x / SG), j = Math.floor(y / SG); return i < 0 || j < 0 || i >= sgW || j >= sgH ? 0 : sgrid[j * sgW + i]; };
  // a small thing (spark, ember, drop) that moved from (ox, oy) into something solid: put back, its speed turned off
  // the surface (e: how much of it comes back), a little lost along it. True if it bounced
  function bounceSmall(p, ox, oy, e) {
    if (!solidCell(p.x, p.y)) return false;
    let nx = solidCell(p.x - SG, p.y) - solidCell(p.x + SG, p.y), ny = solidCell(p.x, p.y - SG) - solidCell(p.x, p.y + SG);
    const l = Math.hypot(nx, ny);
    if (!l) { nx = -p.vx; ny = -p.vy; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m; } else { nx /= l; ny /= l; }
    const vn = p.vx * nx + p.vy * ny;
    if (vn < 0) { p.vx -= (1 + e) * vn * nx; p.vy -= (1 + e) * vn * ny; p.vx *= 0.85; p.vy *= 0.85; }
    p.x = ox; p.y = oy;
    return true;
  }
  // a collision's damage, from the change of speed felt (dv, px/s): nothing under 300 (a bump), then rising steeply
  const knockDmg = dv => dv > 300 ? (dv - 300) * 0.0016 : 0;
  // o (its mass mo; omitted: heavy, as before) against the bodies: the fixed ones throw it back; loose rubble takes its
  // share of the blow by weight (a bin ploughs through grit, a boulder stops it)
  function bounceOff(o, rad, k, mo) {
    for (const b of bodies) {
      const dx = o.x - b.x, dy = o.y - b.y;
      if (dx * dx + dy * dy > (b.r + rad) ** 2) continue;
      let nx = 0, ny = 0, hits = 0;
      for (let s = 0; s < 12; s++) { const a = s / 12 * 6.283; if (solidAt(b, o.x + Math.cos(a) * rad, o.y + Math.sin(a) * rad)) { nx -= Math.cos(a); ny -= Math.sin(a); hits++; } }
      if (solidAt(b, o.x, o.y)) hits++;
      if (!hits) continue;
      let nl = Math.hypot(nx, ny);
      if (nl < 0.01) { nx = dx; ny = dy; nl = Math.hypot(nx, ny) || 1; }
      nx /= nl; ny /= nl;
      for (let it = 0; it < 10 && ringHits(b, o, rad); it++) { o.x += nx * Math.max(2, rad * 0.2); o.y += ny * Math.max(2, rad * 0.2); }
      const vn = (o.vx - (b.vx || 0)) * nx + (o.vy - (b.vy || 0)) * ny;
      if (vn < 0) {
        if (b.free && mo !== undefined) {   // loose rubble: by weight (a replay moves only o: the rubble took its blow the first time)
          const mb = rubbleMass(b), j = -(1 + k * 0.6) * vn / (1 / mo + 1 / mb);
          o.vx += j * nx / mo; o.vy += j * ny / mo;
          if (!replaying) { b.vx -= j * nx / mb; b.vy -= j * ny / mb; b.va += (Math.random() - 0.5) * Math.min(3, j / mb / 200); }
        } else {
          o.vx -= (1 + k) * vn * nx; o.vy -= (1 + k) * vn * ny;
          if (b.free && !replaying) { const w = Math.min(0.8, 40 / b.mass); b.vx += vn * nx * w; b.vy += vn * ny * w; b.va += (Math.random() - 0.5) * w; }
        }
      }
      return { b, nx, ny, vn };
    }
    return null;
  }
  // Wreckage (a dead bin's hulk, its pieces, scraps) falls and lands: a planet's pull draws it down (a little harder
  // than a live bin feels it: no engine holds it up), it strikes the ground with a thud of dust and bounces low, its
  // slide is braked by the ground and turns into a roll (spin = speed / radius), and once it is all but still it lies
  // there, riding the body as it turns, until the ground under it is shot away or something knocks it loose.
  // ang/spin: the names of its angle and spin. Returns the contact, if any
  function wreckFalls(o, rad, dt, now, mass, ang = "a", spin = "spin", e = 0.3) {
    if (o.rest) {
      const R = o.rest, b = R.b;
      if (!b.dead && bodies.includes(b)) {
        const [gx, gy] = toWorld(b, R.gx, R.gy);
        if (solidAt(b, gx, gy)) { [o.x, o.y] = toWorld(b, R.lx, R.ly); o[ang] = R.a + b.a; o.vx = b.vx || 0; o.vy = b.vy || 0; o[spin] = 0; return null; }
      }
      o.rest = null;   // the ground went (shot away, swallowed): it falls again
    }
    gravityOn(o, dt * 1.6);
    const pc = bounceOff(o, rad, e, mass);
    if (!pc) return null;
    const bvx = pc.b.vx || 0, bvy = pc.b.vy || 0, tx = -pc.ny, ty = pc.nx, vt = (o.vx - bvx) * tx + (o.vy - bvy) * ty, f = 1 - Math.exp(-5.5 * dt);
    o.vx -= tx * vt * f; o.vy -= ty * vt * f;   // the ground brakes its slide
    o[spin] += (vt / rad - o[spin]) * Math.min(1, 7 * dt);   // ... and it rolls
    if (pc.vn < -170 && (!o.thudAt || now - o.thudAt > 250)) {   // a thud: dust thrown up off the ground, a crunch
      o.thudAt = now; const hard = Math.min(1, -pc.vn / 700), cx = o.x - pc.nx * rad, cy = o.y - pc.ny * rad;
      for (let k = 0, n = Math.round((lowQ ? 4 : 10) * (0.4 + hard)); k < n; k++) { const s = (Math.random() - 0.5) * 2, v = 60 + Math.random() * 160 * (0.5 + hard); puff(cx, cy, tx * s * v + pc.nx * v * 0.4, ty * s * v + pc.ny * v * 0.4, 0.6 + Math.random() * 0.6, 4 + Math.random() * 6 * (0.5 + hard), SMOKE_COLS[k % 3], 2, 0, 0, 0.93); }
      if (rad > 12 && Math.hypot(cx - me.x, cy - me.y) < 1400) sfx("crash", 0.2 + 0.4 * hard, 0.7 + Math.random() * 0.2, cx, cy);
    }
    if (!pc.b.free && Math.hypot(o.vx - bvx, o.vy - bvy) < 40 && Math.abs(o[spin]) < 1.6) {   // all but still: it lies there
      const [lx, ly] = toLocal(pc.b, o.x, o.y), [gx, gy] = toLocal(pc.b, o.x - pc.nx * rad * 1.25, o.y - pc.ny * rad * 1.25);
      o.rest = { b: pc.b, lx, ly, gx, gy, a: o[ang] - pc.b.a };
    }
    return pc;
  }
  // outward normal at a point on a body's surface (towards the empty cells around it)
  function normalAt(b, x, y) {
    let nx = 0, ny = 0;
    for (let s = 0; s < 8; s++) { const a = s / 8 * 6.283, d = b.cs * 1.5; if (!solidAt(b, x + Math.cos(a) * d, y + Math.sin(a) * d)) { nx += Math.cos(a); ny += Math.sin(a); } }
    const l = Math.hypot(nx, ny);
    return l ? [nx / l, ny / l] : [x - b.x, y - b.y].map(v => v / (Math.hypot(x - b.x, y - b.y) || 1));
  }
  // the first solid point along the path a shot travelled this frame
  function shotBody(s) {
    const dx = s.x - s.px, dy = s.y - s.py, L = Math.hypot(dx, dy);
    const x0 = Math.min(s.px, s.x), x1 = Math.max(s.px, s.x), y0 = Math.min(s.py, s.y), y1 = Math.max(s.py, s.y);
    let nearest = null, fraction = Infinity;
    for (const b of bodies) {
      if (b.x < x0 - b.r || b.x > x1 + b.r || b.y < y0 - b.r || b.y > y1 + b.r) continue;   // nowhere near the path
      const t = L ? clamp(((b.x - s.px) * dx + (b.y - s.py) * dy) / (L * L), 0, 1) : 0, cx = s.px + dx * t - b.x, cy = s.py + dy * t - b.y;
      if (cx * cx + cy * cy > b.r * b.r) continue;
      const steps = Math.min(80, Math.ceil(L / (b.cs * 0.6)) + 1);
      for (let k = 1; k <= steps; k++) {
        const f = k / steps;
        if (f >= fraction) break;
        const px = s.px + dx * f, py = s.py + dy * f;
        if (solidAt(b, px, py)) { nearest = { b, x: px, y: py }; fraction = f; break; }
      }
    }
    return nearest;
  }
  // A crater's glow, masked by what is left of the body so only the torn edge burns: painted once per crater, in
  // two colours, white-hot and dull red; each frame just fades from one to the other. When the body loses more
  // cells a glow is repainted to match, but only a few a frame (heatBudget): under a stream of hot hits the rest
  // keep their last mask a moment longer. Canvases of faded glows are kept for the next ones (heatPool).
  const heatPool = [];
  let heatBudget = 0;
