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
  const crashDmg = (hs, boosting) => hs < 220 ? 0 : Math.min(0.5, (boosting ? 0.25 : 0.12) * hs / 400);
  function bounceOff(o, rad, k) {
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
        o.vx -= (1 + k) * vn * nx; o.vy -= (1 + k) * vn * ny;
        if (b.free) { const w = Math.min(0.8, 40 / b.mass); b.vx += vn * nx * w; b.vy += vn * ny * w; b.va += (Math.random() - 0.5) * w; }
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
    for (const b of bodies) {
      const t = L ? clamp(((b.x - s.px) * dx + (b.y - s.py) * dy) / (L * L), 0, 1) : 0, cx = s.px + dx * t - b.x, cy = s.py + dy * t - b.y;
      if (cx * cx + cy * cy > b.r * b.r) continue;
      const steps = Math.min(80, Math.ceil(L / (b.cs * 0.6)) + 1);
      for (let k = 1; k <= steps; k++) { const f = k / steps, px = s.px + dx * f, py = s.py + dy * f; if (solidAt(b, px, py)) return { b, x: px, y: py }; }
    }
    return null;
  }
  // a scratch canvas for masking crater glow, grown as needed
  let heatC = null;
  function heatQ(S) {
    if (!heatC) heatC = document.createElement("canvas").getContext("2d");
    if (heatC.canvas.width < S) heatC.canvas.width = heatC.canvas.height = Math.min(2048, S);
    return heatC;
  }
  function drawBodies(now) {
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
          if (k <= 0) { b.heat.splice(i, 1); continue; }
          // the glow is masked by what's left of the body, so only the torn edge itself burns, not the empty hole
          const R1 = h.r * 1.45, S = Math.ceil(R1 * 2), hq = heatQ(S), hg = hq.createRadialGradient(R1, R1, h.r * 0.8, R1, R1, R1);
          hg.addColorStop(0, "rgba(255,120,40,0)");
          hg.addColorStop(0.3, `rgba(255,${(70 + 170 * k) | 0},${(20 + 120 * k * k) | 0},${0.95 * k * k})`);
          hg.addColorStop(1, "rgba(255,60,20,0)");
          hq.globalCompositeOperation = "copy"; hq.fillStyle = hg; hq.fillRect(0, 0, S, S);
          hq.globalCompositeOperation = "destination-in";
          hq.drawImage(b.cv, (h.lx - R1) * BODY_RES, (h.ly - R1) * BODY_RES, S * BODY_RES, S * BODY_RES, 0, 0, S, S);
          g.drawImage(hq.canvas, 0, 0, S, S, h.lx - R1 - b.hw, h.ly - R1 - b.hh, S, S);
        }
        g.globalCompositeOperation = "source-over";
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

