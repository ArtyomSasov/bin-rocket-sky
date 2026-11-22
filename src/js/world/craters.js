  // ---------- craters ----------
  const myCarves = [], seenCarves = new Set();
  let carveSeq = 0;
  function bodyCol(b) {
    if (b.fixed) return "#6f8996";
    if (b.wall || b.kind === "station") return station().wall[Math.random() < 0.5 ? 0 : 1];   // a station wall's chips (and a piece blown off it): its own colours
    const list = PLANET_PAL[b.kind] ? PLANET_PAL[b.kind].bands : WRECK_PAL[b.kind];
    return list[Math.floor(Math.random() * list.length)];
  }
  // art in an empty cell is only kept while it borders a solid one (it's the soft outline of the body);
  // once nothing solid is next to it, it would hang in space as a ghost sliver, so it's wiped
  const solidNear = (b, i, j) => {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj;
      if (ii >= 0 && jj >= 0 && ii < b.gw && jj < b.gh && b.cells[jj * b.gw + ii]) return true;
    }
    return false;
  };
  function sweepOrphans(b, i0, i1, j0, j1) {
    i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(b.gw - 1, i1); j1 = Math.min(b.gh - 1, j1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (!b.cells[j * b.gw + i] && !solidNear(b, i, j)) b.q.clearRect(i * b.cs - 0.5, j * b.cs - 0.5, b.cs + 1, b.cs + 1);
    }
  }
  // around a fresh crater, a cell that kept less than a quarter of its art stops being solid
  // (otherwise a shot would stop on a corner sliver while the visible edge is further in)
  function dropBareCells(b, i0, i1, j0, j1) {
    i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(b.gw - 1, i1); j1 = Math.min(b.gh - 1, j1);
    const cs = b.cs, R = BODY_RES, X = Math.floor(i0 * cs * R), Y = Math.floor(j0 * cs * R);
    const Wd = Math.min(b.cv.width - X, Math.ceil((i1 - i0 + 1) * cs * R)), Hd = Math.min(b.cv.height - Y, Math.ceil((j1 - j0 + 1) * cs * R));
    if (Wd <= 0 || Hd <= 0) return 0;
    const img = b.q.getImageData(X, Y, Wd, Hd).data;
    let n = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * b.gw + i;
      if (!b.cells[k]) continue;
      const x0 = Math.floor(i * cs * R) - X, y0 = Math.floor(j * cs * R) - Y, x1 = Math.min(Wd, Math.floor((i + 1) * cs * R) - X), y1 = Math.min(Hd, Math.floor((j + 1) * cs * R) - Y);
      let on = 0, all = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { all++; if (img[(y * Wd + x) * 4 + 3] > 60) on++; }
      if (all && on < all * 0.25) { b.cells[k] = 0; n++; b.q.clearRect(i * cs, j * cs, cs, cs); }
    }
    return n;
  }
  // (a station's inner wall: a light weapon chips a small bite out of it, a heavy one blows a hole: WALL_CARVE)
  function carveLocal(b, lx, ly, rad, hot, rnd = Math.random) {
    if (b.fixed) return 0;   // rnd: a seeded one when every client must cut the same shape
    if (b.wall) rad *= rad < WALL_CARVE ? 0.6 : WALL_GIVE;
    const cs = b.cs, R2 = rad * 1.2, i0 = Math.max(0, Math.floor((lx - R2) / cs)), i1 = Math.min(b.gw - 1, Math.floor((lx + R2) / cs));
    const j0 = Math.max(0, Math.floor((ly - R2) / cs)), j1 = Math.min(b.gh - 1, Math.floor((ly + R2) / cs));
    // one ragged outline for both the cells and the art, so what you see is exactly what can be hit
    const jag = []; for (let k = 0; k < 12; k++) jag.push(rad * (0.9 + rnd() * 0.25));
    const edge = a => { const f = (a / 6.2832 + 1) % 1 * 12, k = Math.floor(f), t = f - k; return jag[k] * (1 - t) + jag[(k + 1) % 12] * t; };
    let n = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * b.gw + i;
      if (!b.cells[k]) continue;
      const dx = (i + 0.5) * cs - lx, dy = (j + 0.5) * cs - ly;
      if (dx * dx + dy * dy < edge(Math.atan2(dy, dx)) ** 2) { b.cells[k] = 0; n++; }
    }
    if (!n) return 0;
    // the hole in the art is cut along the very same outline the cells were cleared by
    const q = b.q;
    q.save(); q.globalCompositeOperation = "destination-out"; q.beginPath();
    for (let k = 0; k < 48; k++) { const a = k / 48 * 6.2832, rr = edge(a); q.lineTo(lx + Math.cos(a) * rr, ly + Math.sin(a) * rr); }
    q.closePath(); q.fill();
    q.globalCompositeOperation = "source-atop";
    const rg = q.createRadialGradient(lx, ly, rad * 0.8, lx, ly, rad * 1.7);
    rg.addColorStop(0, "rgba(15,8,18,0.9)"); rg.addColorStop(0.3, hot ? "rgba(255,120,40,0.5)" : "rgba(40,24,30,0.6)"); rg.addColorStop(1, "rgba(15,8,18,0)");
    q.fillStyle = rg; q.beginPath(); q.arc(lx, ly, rad * 1.7, 0, 6.29); q.fill();
    // a broken rim: a dark lip right at the hole and a thin pale fracture line just behind it
    const rim = (d, w, col) => {
      q.beginPath();
      for (let k = 0; k < 48; k++) { const a = k / 48 * 6.2832, rr = edge(a) + d; q.lineTo(lx + Math.cos(a) * rr, ly + Math.sin(a) * rr); }
      q.closePath(); q.lineWidth = w; q.strokeStyle = col; q.stroke();
    };
    q.lineJoin = "round";
    rim(1, 4, "rgba(8,4,12,0.55)");
    rim(3.5, 1.2, "rgba(255,236,210,0.22)");
    q.restore();
    if (hot) { (b.heat ||= []).push({ lx, ly, r: rad, t: performance.now() }); if (b.heat.length > 10) b.heat.shift(); }
    n += dropBareCells(b, i0 - 1, i1 + 1, j0 - 1, j1 + 1);
    sweepOrphans(b, i0 - 1, i1 + 1, j0 - 1, j1 + 1);
    b.mass -= n; b.dirty = true;
    return n;
  }
  // chips, dust and sparks flying out of a fresh crater
  // (a budget per frame: a railgun tunnel digs many craters at once and shouldn't bury the screen in particles)
  let fxT = 0, fxN = 0;
  function rubbleFx(b, x, y, rad, n) {
    const t = performance.now();
    if (t - fxT > 16) { fxT = t; fxN = 0; }
    if (fxN > (lowQ ? 8 : 20)) return;
    const big = rad >= 14, metal = !!WRECK_PAL[b.kind] && b.kind !== "crate", k = Math.min(big ? 7 : 2, 1 + (n >> 1)), [nx, ny] = normalAt(b, x, y), out = Math.atan2(ny, nx), bvx = b.vx || 0, bvy = b.vy || 0;
    fxN += k + 4;
    for (let i = 0; i < k; i++) {
      const a = out + (Math.random() - 0.5) * 2.2, v = 80 + Math.random() * (big ? 280 : 160);
      addDebris(x, y, Math.cos(a) * v + bvx, Math.sin(a) * v + bvy, 2.5 + Math.random() * (big ? 8 : 3.5), bodyCol(b), 5 + Math.random() * 5);
    }
    for (let i = 0; i < (lowQ ? 2 : 5); i++) {
      const a = out + (Math.random() - 0.5) * 1.8, v = 30 + Math.random() * 120;
      puff(x, y, Math.cos(a) * v + bvx, Math.sin(a) * v + bvy, 0.9 + Math.random() * 1.1, 5 + Math.random() * Math.min(14, rad * 0.35), i % 2 ? bodyCol(b) : "rgb(90,80,100)", 2);
    }
    const m = Math.round((lowQ ? 3 : 8) * (big ? 1 : 0.5));
    for (let i = 0; i < m; i++) {
      const a = out + (Math.random() - 0.5) * 1.5, v = metal ? 320 + Math.random() * 520 : 120 + Math.random() * 260;
      if (metal) puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.25 + Math.random() * 0.35, 1 + Math.random(), i % 3 ? "#fff1b8" : "#ff9a3c", 1, 0.06);
      else puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.5 + Math.random() * 0.6, 1.2 + Math.random(), i % 2 ? "#ffb050" : "#ff7a30", 1);
    }
  }
  // own: my shots (and my bots') on shared bodies are reported so everyone digs the same hole
  // the ragged edge of a shared crater comes from its own numbers, so every client cuts exactly the same shape
  const carveRnd = (lx, ly, r, sq) => { let n = 0; return () => hash(lx * 31 + ly, sq * 7 + n++, r); };
  // what a hit leaves on a station wall's face (painted only where the wall still stands): a light weapon a sooty
  // scorch and a few scratches; a heavy one, round the hole it blew, soot and cracks running out from it
  function wallMark(b, x, y, rad, heavy) {
    const [lx, ly] = toLocal(b, x, y), q = b.q;
    q.save(); q.globalCompositeOperation = "source-atop";
    const R = heavy ? rad * 1.6 : rad * 1.3 + 4, gr = q.createRadialGradient(lx, ly, 0, lx, ly, R);
    gr.addColorStop(0, `rgba(12,9,8,${heavy ? 0.7 : 0.4})`); gr.addColorStop(1, "rgba(12,9,8,0)");
    q.fillStyle = gr; q.fillRect(lx - R, ly - R, R * 2, R * 2);
    q.strokeStyle = heavy ? "rgba(8,6,6,0.75)" : "rgba(20,16,16,0.45)"; q.lineCap = "round";
    for (let k = 0, n = heavy ? 5 + Math.floor(Math.random() * 4) : 2 + Math.floor(Math.random() * 2); k < n; k++) {
      let a = Math.random() * 6.283, px = lx + Math.cos(a) * (heavy ? rad : 2), py = ly + Math.sin(a) * (heavy ? rad : 2);
      q.lineWidth = heavy ? 1.6 + Math.random() * 1.4 : 0.8; q.beginPath(); q.moveTo(px, py);
      for (let j = 0, m = heavy ? 4 : 2; j < m; j++) {   // a crack wanders a little as it runs
        a += (Math.random() - 0.5) * 0.9; const step = (heavy ? rad * 0.45 : 5) * (0.6 + Math.random() * 0.8);
        px += Math.cos(a) * step; py += Math.sin(a) * step; q.lineTo(px, py);
      }
      q.stroke();
    }
    q.restore();
  }
  // a station wall blown open: a cloud of dust rolling out both ways, shards of the wall flung out (some through the
  // hole) that skid to rest on the deck, a spray of sparks, burning bits arcing away with smoke trails, flames licking
  // round the edge of the hole for a moment, dark smoke hanging after, and the fire's light on everything round it
  function wallBreach(b, x, y, rad) {
    const [nx, ny] = normalAt(b, x, y), out = Math.atan2(ny, nx), q = lowQ ? 0.4 : 1, R = rad, col = () => bodyCol(b);
    const dust = materialOf(b) === "metal" ? ["rgb(126,120,116)", "rgb(98,94,92)", "rgb(150,142,134)"] : [col(), col(), "rgb(120,106,96)"];
    for (let i = 0, m = Math.round(14 * q); i < m; i++) {   // dust
      const side = Math.random() < 0.3 ? out + Math.PI : out, a = side + (Math.random() - 0.5) * 2.4, v = 50 + Math.random() * 220;
      puff(x + Math.cos(a) * R * 0.4, y + Math.sin(a) * R * 0.4, Math.cos(a) * v, Math.sin(a) * v, 1.6 + Math.random() * 1.6, 12 + Math.random() * 18, i % 3 ? dust[i % 3] : col(), 2, 0, (Math.random() - 0.5) * 1.2, 0.9);
    }
    for (let i = 0, m = Math.round(22 * q); i < m; i++) {   // shards
      const side = Math.random() < 0.3 ? out + Math.PI : out, a = side + (Math.random() - 0.5) * 2.2, v = 220 + Math.random() * 520;
      addDebris(x, y, Math.cos(a) * v, Math.sin(a) * v, 2.5 + Math.random() * 7.5, col(), 10 + Math.random() * 8);
    }
    sparkShower(x, y, Math.cos(out), Math.sin(out), 1.3); sparkShower(x, y, -Math.cos(out), -Math.sin(out), 0.7);
    for (let i = 0, m = Math.round(16 * q); i < m; i++) {   // white-hot streaks off the metal
      const a = out + (Math.random() - 0.5) * 2.6, v = 400 + Math.random() * 700;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.25 + Math.random() * 0.45, 1 + Math.random() * 1.2, i % 3 ? "#fff1b8" : "#ffb04a", 1, 0.07, 0, 0.93);
    }
    for (let i = 0, m = Math.round(4 * q) + 1; i < m; i++) {   // burning bits arcing away
      const a = out + (Math.random() - 0.5) * 2, v = 260 + Math.random() * 380;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.9 + Math.random() * 0.8, 2.4 + Math.random() * 1.6, "fire", 8, 0, (Math.random() - 0.5) * 1.8, 0.975);
    }
    for (let i = 0, m = Math.round(12 * q); i < m; i++) {   // flames round the edge of the hole
      const a = Math.random() * 6.283, v = 20 + Math.random() * 60;
      puff(x + Math.cos(a) * R, y + Math.sin(a) * R, Math.cos(out) * v + Math.cos(a) * 20, Math.sin(out) * v + Math.sin(a) * 20, 0.5 + Math.random() * 0.7, 8 + Math.random() * 9, "fire", 4, 0, (Math.random() - 0.5) * 2, 0.92, 0.25 + Math.random() * 0.3);
    }
    for (let i = 0, m = Math.round(5 * q); i < m; i++) {   // dark smoke hanging after
      const a = out + (Math.random() - 0.5) * 1.4, v = 15 + Math.random() * 40;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 3 + Math.random() * 2, 18 + Math.random() * 14, SMOKE_COLS[i % 2], 2, 0, (Math.random() - 0.5) * 0.6, 0.95);
    }
    impacts.push({ x, y, t: 0, r: 220, col: "255,170,90", dur: 1.2, soft: 0.3, flick: Math.random() * 6.28 });
    if (Math.hypot(x - me.x, y - me.y) < 1200) shake = Math.max(shake, 0.35 * (1 - Math.hypot(x - me.x, y - me.y) / 1200));
    sfx("chunk", 0.9, 0.7, x, y);
  }
  // what a body is made of, for how a hit looks on it
  const materialOf = b => b.wall || b.fixed || b.kind === "station" || b.kind === "drum" || b.kind === "panel" || (WRECK_PAL[b.kind] && b.kind !== "crate") ? "metal" : b.kind === "crate" ? "wood" : "rock";
  const ENERGY_HIT = new Set([K.LASER, K.PISTOL, K.PULSE, K.PULSE_BOLT, K.SHOCK, K.ORB, K.GAMMA]);
  // a burn on a body's face (painted only where it still stands): black at the heart, scorched brown round it
  function scorchMark(b, x, y, r) {
    const [lx, ly] = toLocal(b, x, y), q = b.q;
    q.save(); q.globalCompositeOperation = "source-atop";
    const gr = q.createRadialGradient(lx, ly, 0, lx, ly, r);
    gr.addColorStop(0, "rgba(6,4,4,0.8)"); gr.addColorStop(0.45, "rgba(40,22,12,0.55)"); gr.addColorStop(1, "rgba(60,34,18,0)");
    q.fillStyle = gr; q.fillRect(lx - r, ly - r, r * 2, r * 2); q.restore();
  }
  // a bullet's pit: a small dark dent with a lighter lip
  function pitMark(b, x, y, r) {
    const [lx, ly] = toLocal(b, x, y), q = b.q;
    q.save(); q.globalCompositeOperation = "source-atop";
    q.fillStyle = "rgba(255,255,255,0.12)"; q.beginPath(); q.arc(lx + 0.6, ly + 0.6, r * 1.35, 0, 6.29); q.fill();
    q.fillStyle = "rgba(10,8,8,0.6)"; q.beginPath(); q.arc(lx, ly, r, 0, 6.29); q.fill(); q.restore();
  }
