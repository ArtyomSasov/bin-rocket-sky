  // ---------- body physics: pick-up placement, gravity, bouncing off bodies, shot hits ----------
  // pick-ups that would land inside a planet sit on its rim instead (same result on every client)
  function outside(o) {
    for (const p of planets) {
      const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy);
      if (d < p.rr + 50) { const k = (p.rr + 50) / (d || 1); o.x = p.x + (d ? dx : 1) * k; o.y = p.y + dy * k; }
    }
    return o;
  }
  // planets pull, less as they are chipped away
  function gravityOn(o, dt) {
    for (const p of planets) {
      if (p.dead || p.free) continue;
      const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy), R = p.rr;
      if (d > R * 4 || d < 1) continue;
      const acc = PLANET_G * (R / 250) * (R / Math.max(d, R)) ** 2 * (1 - d / (R * 4)) * (p.mass / p.mass0);
      o.vx += dx / d * acc * dt; o.vy += dy / d * acc * dt;
    }
  }
  // a round thing of radius rad against the solid cells: push it out and bounce it; free rubble gets shoved back
  function ringHits(b, o, rad) {
    for (let s = 0; s < 10; s++) { const a = s / 10 * 6.283; if (solidAt(b, o.x + Math.cos(a) * rad, o.y + Math.sin(a) * rad)) return true; }
    return solidAt(b, o.x, o.y);
  }
  // only something big hurts when you fly into it: planets, moons and whole wrecks; small rubble just gets knocked aside
  const hurtsOnHit = b => b.mass >= 150;
  // crash damage grows with how hard you hit, small even at full boost (in lives: Lv 1 has 3)
  const crashDmg = (hs, boosting) => hs < 380 ? 0 : Math.min(0.25, (boosting ? 0.1 : 0.05) * (hs - 300) / 300);   // (a hard head-on hit only, and a little)
  // ---------- mass and collisions: one set of weights for everything ----------
  // Masses in "bins": a Lv 1 bin weighs 1, a bigger one with its area. A wreck's hulk is a shell (a third of a bin), a
  // piece of a broken bin a quarter, a scrap of debris almost nothing; loose rubble weighs what its rock does (its
  // cells' area, rock half again as dense as a bin); planets, moons, wrecks and walls do not move (Infinity).
  const BIN_AREA = Math.PI * 30 * 30;
  const binMass = lv => sizeOf(lv || 1) ** 2;
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
    let nearest = null, fraction = Infinity;
    for (const b of bodies) {
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
  function heatLayers(b, h) {
    if (h.layers && (h.mass === b.mass || heatBudget <= 0)) return h.layers;
    heatBudget--;
    const R1 = h.r * 1.45, S = Math.min(1024, Math.ceil(R1 * 2));
    const reuse = h.layers || [heatPool.pop(), heatPool.pop()];
    h.layers = ["255,240,140", "255,70,20"].map((col, n) => {
      const c = reuse[n] || document.createElement("canvas");
      if (c.width !== S) c.width = c.height = S;
      const q = c.getContext("2d");
      q.globalCompositeOperation = "copy";
      const gr = q.createRadialGradient(R1, R1, h.r * 0.8, R1, R1, R1);
      gr.addColorStop(0, `rgba(${col},0)`); gr.addColorStop(0.3, `rgba(${col},0.95)`); gr.addColorStop(1, `rgba(${col},0)`);
      q.fillStyle = gr; q.fillRect(0, 0, S, S);
      q.globalCompositeOperation = "destination-in";
      q.drawImage(b.cv, (h.lx - R1) * BODY_RES, (h.ly - R1) * BODY_RES, S * BODY_RES, S * BODY_RES, 0, 0, S, S);
      return c;
    });
    h.mass = b.mass; h.R1 = R1;
    return h.layers;
  }
  function drawBodies(now) {
    heatBudget = 4;
    for (const b of bodies) {
      const x = sx(b.x), y = sy(b.y), ring = b.ringB && !b.free;
      if (!onScreen(x, y, ring ? b.ringHalf : b.star ? b.rr * 2.4 : b.r)) continue;
      const mr = b.mass / b.mass0;
      if (b.planet && !b.bare) {   // the atmosphere thins out as the planet is chipped away
        const pal = PLANET_PAL[b.kind], ag = g.createRadialGradient(x, y, b.rr * 0.92, x, y, b.rr * 1.28);
        ag.addColorStop(0, `rgba(${pal.glow},${0.5 * mr})`); ag.addColorStop(1, `rgba(${pal.glow},0)`);
        g.fillStyle = ag; g.beginPath(); g.arc(x, y, b.rr * 1.28, 0, 6.29); g.fill();
      }
      if (ring) g.drawImage(b.ringB, x - b.ringHalf, y - b.ringHalf, b.ringHalf * 2, b.ringHalf * 2);
      g.save(); g.translate(x, y); g.rotate(b.a);
      g.drawImage(b.cv, -b.hw, -b.hh, b.hw * 2, b.hh * 2);
      if (b.heat && b.heat.length) {
        g.globalCompositeOperation = "lighter";
        for (let i = b.heat.length - 1; i >= 0; i--) {
          const h = b.heat[i], k = 1 - (now - h.t) / 2600;
          if (k <= 0) { const [h0] = b.heat.splice(i, 1); if (h0.layers && heatPool.length < 24) heatPool.push(...h0.layers); continue; }
          const [hot, cool] = heatLayers(b, h), R1 = h.R1, D = R1 * 2;
          g.globalAlpha = k * k * k; g.drawImage(hot, h.lx - R1 - b.hw, h.ly - R1 - b.hh, D, D);
          g.globalAlpha = k * k * (1 - k); g.drawImage(cool, h.lx - R1 - b.hw, h.ly - R1 - b.hh, D, D);
        }
        g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
      }
      g.restore();
      if (ring) g.drawImage(b.ringF, x - b.ringHalf, y - b.ringHalf, b.ringHalf * 2, b.ringHalf * 2);
      if (b.star && b.planet) {   // the sun: a white-hot core and a wide pulsing corona over the lava ball
        const mr = b.mass / b.mass0, k = (0.85 + 0.15 * Math.sin(now / 900)) * mr;
        g.globalCompositeOperation = "lighter";
        const cg = g.createRadialGradient(x, y, b.rr * 0.3, x, y, b.rr * 2.4);
        cg.addColorStop(0, `rgba(255,250,220,${0.55 * k})`); cg.addColorStop(0.35, `rgba(255,200,90,${0.35 * k})`); cg.addColorStop(1, "rgba(255,120,40,0)");
        g.fillStyle = cg; g.beginPath(); g.arc(x, y, b.rr * 2.4, 0, 6.29); g.fill();
        g.globalCompositeOperation = "source-over";
      }
      if (b.kind === "lava" && b.planet && !b.bare) {
        g.globalCompositeOperation = "lighter";
        const lg = g.createRadialGradient(x, y, b.rr * 0.7, x, y, b.rr * 1.25);
        lg.addColorStop(0, "rgba(255,90,30,0)"); lg.addColorStop(0.75, `rgba(255,90,30,${(0.12 + 0.08 * Math.sin(now / 400)) * mr})`); lg.addColorStop(1, "rgba(255,90,30,0)");
        g.fillStyle = lg; g.beginPath(); g.arc(x, y, b.rr * 1.25, 0, 6.29); g.fill();
        g.globalCompositeOperation = "source-over";
      }
    }
  }

  buildPlanets("lobby");

