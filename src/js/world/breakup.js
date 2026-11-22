  // ---------- breaking apart: cut-off pieces fly away as rubble; a planet whittled down to its last 15% blows apart ----------
  function splitBody(b, now) {
    b.dirty = false; b.lastSplit = now;
    const { gw, gh, cells } = b, lab = new Int32Array(gw * gh).fill(-1), comps = [], stack = [];
    for (let k0 = 0; k0 < cells.length; k0++) {
      if (!cells[k0] || lab[k0] >= 0) continue;
      const id = comps.length, list = [];
      lab[k0] = id; stack.push(k0);
      while (stack.length) {
        const k = stack.pop(), i = k % gw;
        list.push(k);
        if (i > 0 && cells[k - 1] && lab[k - 1] < 0) { lab[k - 1] = id; stack.push(k - 1); }
        if (i < gw - 1 && cells[k + 1] && lab[k + 1] < 0) { lab[k + 1] = id; stack.push(k + 1); }
        if (k >= gw && cells[k - gw] && lab[k - gw] < 0) { lab[k - gw] = id; stack.push(k - gw); }
        if (k + gw < cells.length && cells[k + gw] && lab[k + gw] < 0) { lab[k + gw] = id; stack.push(k + gw); }
      }
      comps.push(list);
    }
    if (!comps.length) { b.dead = true; rebuildBodies(); return; }
    if (comps.length > 1) {
      let main = 0;
      comps.forEach((c, i) => { if (c.length > comps[main].length) main = i; });
      // a station wall is one wall to the eye, though it is built of one body per row: a part of it cut off from the
      // rest of its row still stands (it holds to the rows above and below); only slivers fall away as rubble
      comps.forEach((c, i) => { if (i !== main && (!b.wall || c.length < Math.max(24, b.mass0 * 0.06))) breakAway(b, c); });
      rebuildBodies();
    }
    if (b.prop && !b.free && !b.dead && b.mass < b.mass0 * 0.5) { collapseProp(b); return; }
    if (b.planet && !b.free && b.mass < b.mass0 * 0.15) {
      destroyPlanet(b, now);
      if (b.lastOwn && playing) { me.score += 25; showScore(); gainXp(5, now); floaters.push({ x: b.x, y: b.y - 80, t: 0, txt: "PLANET +25", gold: true }); }
      setFree(b, 0, 0);
      for (const m of moons) if (m.p === b && !m.free) setFree(m, -Math.sin(m.a) * m.dir * 60, Math.cos(m.a) * m.dir * 60);
      rebuildBodies();
    }
  }
  // key: the same name for the same piece on every machine (its parent and its own cells), so the server can say
  // where each piece is (rubbleWire / applyRubble)
  function setFree(b, vx, vy, va = 0) { b.free = true; b.planet = false; b.vx = vx; b.vy = vy; b.va = va; b.hotUntil = 0; b.key ||= "d" + det.indexOf(b); b.freedAt = performance.now(); rubble.push(b); }
  function breakAway(b, list) {
    const { gw, cs } = b;
    let i0 = 1e9, i1 = -1, j0 = 1e9, j1 = -1;
    for (const k of list) { const i = k % gw, j = (k - i) / gw; i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
    const [x, y] = toWorld(b, (i0 + i1 + 1) / 2 * cs, (j0 + j1 + 1) / 2 * cs);
    if (list.length >= 6) {   // big enough to be its own body
      const f = newBody("r" + (++rubbleSeq), b.kind, (i1 - i0 + 1) * cs, (j1 - j0 + 1) * cs, cs), R = BODY_RES;
      f.q.drawImage(b.cv, i0 * cs * R, j0 * cs * R, (i1 - i0 + 1) * cs * R, (j1 - j0 + 1) * cs * R, 0, 0, (i1 - i0 + 1) * cs, (j1 - j0 + 1) * cs);
      const inPiece = new Set(list);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * gw + i;
        if (inPiece.has(k)) f.cells[(j - j0) * f.gw + (i - i0)] = 1;
      }
      sweepOrphans(f, 0, f.gw - 1, 0, f.gh - 1);   // drop the parent's art that isn't part of this piece
      f.mass = f.mass0 = list.length; f.x = x; f.y = y; f.a = b.a; f.rr = Math.max(f.hw, f.hh);
      f.key = (b.key || "d" + det.indexOf(b)) + "." + list[0].toString(36) + "." + list.length.toString(36);
      // Flung away from the crater that cut it loose (or from the parent's middle), harder by a bigger blast and
      // for a lighter piece; a push off its centre sets it spinning. Seeded by the piece's own cells, so every
      // screen and the server see the same piece fly the same way.
      const rnd = carveRnd(list[0], list.length, det.indexOf(b) + 1, 1), bl = b.blast && performance.now() - b.blast.at < 600 ? b.blast : null;
      const from = bl || b, ox = x - from.x, oy = y - from.y, od = Math.hypot(ox, oy) || 1;
      const v = (bl ? 40 + Math.min(320, bl.rad * 9 / Math.sqrt(Math.max(1, list.length / 12))) : 30) + rnd() * 60;
      const ux = ox / od, uy = oy / od, cx = x - b.x, cy = y - b.y;
      const spin = clamp((cx * uy - cy * ux) / Math.max(40, f.rr) * v / 300, -2.5, 2.5) + (rnd() - 0.5) * 0.6;
      setFree(f, (b.vx || 0) + ux * v, (b.vy || 0) + uy * v, spin);
      if (bl) {   // the torn faces glow where the blast tore them
        f.hotUntil = performance.now() + 1400;
        const [lx, ly] = toLocal(b, x, y);
        (b.heat ||= []).push({ lx, ly, r: Math.max(f.hw, f.hh) * 0.7, t: performance.now() }); if (b.heat.length > 10) b.heat.shift();
      }
      for (let k = 0; k < (lowQ ? 3 : 8); k++) { const a = Math.random() * 6.28, v = 20 + Math.random() * 70; puff(x + (Math.random() - 0.5) * f.hw, y + (Math.random() - 0.5) * f.hh, Math.cos(a) * v + f.vx, Math.sin(a) * v + f.vy, 1.2 + Math.random(), 7 + Math.random() * 8, k % 2 ? bodyCol(b) : "rgb(90,80,100)", 2); }
      for (let k = 0; k < Math.min(5, list.length >> 3); k++) { const a = Math.random() * 6.28, v = 40 + Math.random() * 110; addDebris(x, y, Math.cos(a) * v + f.vx, Math.sin(a) * v + f.vy, 3 + Math.random() * 5, bodyCol(b), 6 + Math.random() * 4); }
      sfx("chunk", Math.min(0.9, 0.3 + list.length / 120), 0.7 + Math.random() * 0.3, x, y);
      while (rubble.length > 50) { const old = rubble.shift(); old.dead = true; }
    } else {
      for (let k = 0; k < Math.min(6, list.length); k++) { const a = Math.random() * 6.28, v = 40 + Math.random() * 120; addDebris(x, y, Math.cos(a) * v, Math.sin(a) * v, 4 + Math.random() * 6, bodyCol(b)); }
    }
    for (const k of list) { b.cells[k] = 0; const i = k % gw, j = (k - i) / gw; b.q.clearRect(i * cs, j * cs, cs, cs); }
    sweepOrphans(b, i0 - 1, i1 + 1, j0 - 1, j1 + 1);
    b.mass -= list.length;
  }
  function destroyPlanet(p, now) {
    const q = lowQ ? 0.4 : 1, R = p.rr;
    for (let k = 0; k < 40 * q; k++) {
      const a = Math.random() * 6.283, rr = Math.random() * R, v = 120 + Math.random() * 520;
      addDebris(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, Math.cos(a) * v, Math.sin(a) * v, 12 + Math.random() * 30, bodyCol(p));
    }
    for (let k = 0; k < 7; k++) { const a = Math.random() * 6.283, rr = Math.random() * R; explode(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, Math.round(70 * q), 700); }
    explode(p.x, p.y, Math.round(200 * q), 1100);
    smoke(p.x, p.y, Math.round(50 * q), R * 1.6, 5);
    rings.push({ x: p.x, y: p.y, t: 0, r: R * 4, col: "255,230,190", warp: true, dur: 1.1, w: 30 });
    rings.push({ x: p.x, y: p.y, t: -0.15, r: R * 6, col: "255,160,90", dur: 1.6, w: 14 });
    shove(p.x, p.y, R * 4, 1200);
    const d = Math.hypot(me.x - p.x, me.y - p.y);
    if (d < 2600) { shake = Math.max(shake, 1.2 * (1 - d / 2600)); flash = Math.max(flash, 0.7 * (1 - d / 2600)); }
    sfx("boom_big", 1, 0.8, p.x, p.y);
    sfx("boom_low", 1, 0.75, p.x, p.y);
    feedPush("A planet was blown apart!");
    if (d < 2600) announce("PLANET DESTROYED", "", "#ffb070");
  }
  // every frame: shared poses, rubble drifting, and pending break-ups
  function bodyTick(now, dt) {
    posesAt(clockNow(), dt);
    // (on a station's deck a loose piece scrapes along the floor and comes to rest; in space it drifts on)
    const deck = stationMap(), drag = Math.exp(-(deck ? 1.6 : 0.02) * dt), spinDrag = Math.exp(-(deck ? 2 : 0.05) * dt);
    for (const b of rubble) {
      if (b.dead) continue;
      gravityOn(b, dt);   // planets pull their own rubble back
      b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt; b.vx *= drag; b.vy *= drag; b.va *= spinDrag;
      if (b.x < 0 || b.x > W) { b.vx = -b.vx * 0.6; b.x = clamp(b.x, 0, W); }
      if (b.y < 0 || b.y > H) { b.vy = -b.vy * 0.6; b.y = clamp(b.y, 0, H); }
      rubbleCollide(b, now);
      if (b.hotUntil > now && Math.random() < dt * 30) {   // a freshly torn piece trails smoke and embers for a moment
        const k = (b.hotUntil - now) / 1400;
        puff(b.x + (Math.random() - 0.5) * b.hw, b.y + (Math.random() - 0.5) * b.hh, b.vx * 0.3, b.vy * 0.3, 0.8 + Math.random() * 0.6, 4 + Math.random() * 6 * k, Math.random() < k * 0.6 ? "#ff8a3c" : "rgb(90,80,100)", 2);
      }
    }
    for (const b of bodies) if (b.dirty && now - b.lastSplit > 120) splitBody(b, now);
    if (bodies.some(b => b.dead || b.mass <= 0)) { for (const b of bodies) if (b.mass <= 0) b.dead = true; rubble = rubble.filter(b => !b.dead); rebuildBodies(); }
  }
  // A free piece of rubble against the fixed world (planets, moons, wrecks, station walls): pushed out along the
  // surface normal, bounced with little restitution, its slide turned partly into spin; a hard knock chips it and
  // throws dust, and a small piece hitting very hard crumbles to grit. Rubble-on-rubble is left out (cheap, and
  // the pieces are few). Only the rubble itself is changed: shared terrain is cut by shots alone.
  // a piece of rubble falls apart into grit
  function crumble(r) {
    for (let k = 0; k < Math.min(8, 2 + (r.mass >> 3)); k++) { const a = Math.random() * 6.28, v = 30 + Math.random() * 120; addDebris(r.x, r.y, Math.cos(a) * v + r.vx * 0.3, Math.sin(a) * v + r.vy * 0.3, 2.5 + Math.random() * 4, bodyCol(r), 4 + Math.random() * 4); }
    r.dead = true;
  }
  function rubbleCollide(r, now) {
    const rad = Math.max(r.cs * 1.5, Math.sqrt(r.mass) * r.cs * 0.5);
    for (const o of bodies) {
      if (o === r || o.free || o.dead) continue;
      const dx = r.x - o.x, dy = r.y - o.y;
      if (dx * dx + dy * dy > (o.r + rad) ** 2) continue;
      let nx = 0, ny = 0, hits = 0;
      for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; if (solidAt(o, r.x + Math.cos(a) * rad, r.y + Math.sin(a) * rad)) { nx -= Math.cos(a); ny -= Math.sin(a); hits++; } }
      if (!hits) continue;
      let nl = Math.hypot(nx, ny);
      if (nl < 0.01) { nx = dx; ny = dy; nl = Math.hypot(nx, ny) || 1; }
      nx /= nl; ny /= nl;
      for (let it = 0; it < 8 && solidAt(o, r.x - nx * rad * 0.7, r.y - ny * rad * 0.7); it++) { r.x += nx * Math.max(2, rad * 0.15); r.y += ny * Math.max(2, rad * 0.15); }
      const vn = (r.vx - (o.vx || 0)) * nx + (r.vy - (o.vy || 0)) * ny;
      if (vn >= 0) continue;
      const vt = (r.vx - (o.vx || 0)) * -ny + (r.vy - (o.vy || 0)) * nx;
      r.vx -= 1.35 * vn * nx; r.vy -= 1.35 * vn * ny;          // restitution 0.35
      r.vx -= vt * 0.25 * -ny; r.vy -= vt * 0.25 * nx;          // friction takes a quarter of the slide...
      r.va += vt * 0.25 / Math.max(20, rad);                   // ...and turns it into a roll
      const speed = -vn;
      if (speed > 90 && now - (r.knockAt || 0) > 150) {
        r.knockAt = now;
        const px = r.x - nx * rad, py = r.y - ny * rad;
        for (let k = 0; k < (lowQ ? 2 : 5); k++) { const a = Math.atan2(ny, nx) + (Math.random() - 0.5) * 2.4, v = 40 + Math.random() * speed * 0.6; puff(px, py, Math.cos(a) * v, Math.sin(a) * v, 0.7 + Math.random() * 0.8, 4 + Math.random() * 5, k % 2 ? bodyCol(o) : "rgb(90,80,100)", 2); }
        if (o.fixed || WRECK_PAL[o.kind]) impact(px, py, "#ffd36b", Math.min(1.2, speed / 300));
        sfx("chunk", Math.min(0.8, speed / 400), 0.6 + Math.random() * 0.3, px, py);
        if (r.mass < 40 && speed > 260) { crumble(r); return; }
        if (speed > 160) { const [lx, ly] = toLocal(r, px + nx * 4, py + ny * 4); carveLocal(r, lx, ly, Math.min(14, 4 + speed / 40), false); }   // a corner breaks off
      }
      return;
    }
  }
