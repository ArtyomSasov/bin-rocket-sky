  // smoke over the bins, impact flashes, rail trails, zaps, shock rings, nuke blasts
  function drawBlastFx(now) {
    // smoke on top of the bins, so a damaged bin visibly smokes
    let hot = 0, fire = 0;
    for (const p of parts) {
      if (p.k === 4 || p.k === 6) { fire++; continue; }
      if (p.k !== 2) continue;
      const x = sx(p.x), y = sy(p.y), f = Math.max(0, p.life / p.max);
      if (!onScreen(x, y, 40 + p.size * 8)) continue;
      if (p.glow) hot++;
      g.globalAlpha = Math.min(1, (1 - f) * 12) * (p.glow ? Math.min(1, Math.sqrt(f) * 1.3) * 0.8 : f * 0.65);   // blast smoke stays thick, then thins
      const d = p.size * (3 + (1 - f) * 5);
      g.save(); g.translate(x, y); g.rotate(p.rot + (1 - f) * p.vr * 0.08);
      g.drawImage(smokeSprite(p.col), -d / 2, -d / 2, d, d); g.restore();
    }
    g.globalCompositeOperation = "lighter";
    // smoke still lit from inside by the fire, the glow dying away over its first half second or so
    if (hot) for (const p of parts) {
      if (p.k !== 2 || !p.glow) continue;
      const f = Math.max(0, p.life / p.max), age = (p.max - p.life), lit = p.glow * Math.max(0, 1 - age / (0.35 + p.max * 0.15));
      if (lit <= 0) continue;
      const x = sx(p.x), y = sy(p.y), d = p.size * (3 + (1 - f) * 5) * 0.8;
      if (!onScreen(x, y, d)) continue;
      g.globalAlpha = lit * lit * 0.75;
      g.drawImage(smokeSprite("#ff7a2a"), x - d / 2, y - d / 2, d, d);
    }
    // the fireball's clouds: swelling, cooling white to red, fading
    if (fire) for (const p of parts) {
      if (p.k === 6) {   // a tongue of flame: a fire cloud stretched along its flight, cooling as it goes
        const a = 1 - Math.max(0, p.life / p.max), x = sx(p.x), y = sy(p.y), sp = Math.hypot(p.vx, p.vy);
        const L = p.size * 2 + sp * 0.09, Wd = p.size * (1.3 - a * 0.5);
        if (!onScreen(x, y, L)) continue;
        g.globalAlpha = Math.min(1, a / 0.05) * (1 - a) * 0.95;
        g.save(); g.translate(x, y); g.rotate(Math.atan2(p.vy, p.vx));
        g.drawImage(fireSprite(Math.min(7, ((a + p.glow) * 7) | 0), (p.rot * 3) | 0, rampOf(p.col)), -L * 0.7, -Wd, L, Wd * 2); g.restore();
        continue;
      }
      if (p.k !== 4) continue;
      const a = 1 - Math.max(0, p.life / p.max), d = p.size * 2 * (1 + 1.7 * (1 - (1 - a) * (1 - a)));
      const x = sx(p.x), y = sy(p.y);
      if (!onScreen(x, y, d)) continue;
      g.globalAlpha = Math.min(1, a / 0.06) * Math.pow(1 - a, 0.7) * 0.5;   // (many overlap: added up they would burn to white)
      const i = Math.min(7, ((a * 1.1 + p.glow) * 8) | 0);
      g.save(); g.translate(x, y); g.rotate(p.rot + a * p.vr * 0.05);
      g.drawImage(fireSprite(i, (p.rot * 3) | 0, rampOf(p.col)), -d / 2, -d / 2, d, d); g.restore();
    }
    g.globalAlpha = 1;
    for (const m of impacts) {
      if (m.t < 0) continue;   // delayed flash
      const k = m.t / (m.dur || 0.22), x = sx(m.x), y = sy(m.y);
      if (m.soft) {   // light thrown round a blast: a wide soft pool, gone in a moment
        const r = m.r * (0.8 + 0.4 * k);
        if (!onScreen(x, y, r)) continue;
        // (a fire's light, flick: it dies away slower and flickers as flames do)
        const fl = m.flick ? (1 - k) * (0.7 + 0.3 * Math.sin(now / 37 + m.flick) * Math.sin(now / 61 + m.flick * 2)) : (1 - k) * (1 - k);
        g.globalAlpha = m.soft * fl; g.drawImage(lightSprite(m.col), x - r, y - r, r * 2, r * 2);
        continue;
      }
      const r = m.r * (0.5 + k);
      if (!onScreen(x, y, r)) continue;
      const fg = g.createRadialGradient(x, y, 0, x, y, r);
      fg.addColorStop(0, "rgba(255,255,240,1)"); fg.addColorStop(0.35, m.col); fg.addColorStop(1, "rgba(255,120,40,0)");
      g.globalAlpha = 1 - k; g.fillStyle = fg; g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill();
    }
    g.globalAlpha = 1;
    for (const b of beams) {
      if (b.round !== undefined) {
        const dx = b.x2 - b.x1, dy = b.y2 - b.y1, distance = Math.hypot(dx, dy);
        const t = distance > 0 ? Math.min(1, b.t * b.speed / distance) : 1;
        const x = sx(b.x1 + dx * t), y = sy(b.y1 + dy * t);
        if (onScreen(x, y, 60)) {
          g.save(); g.globalAlpha = Math.min(1, Math.max(0, (b.duration - b.t) / .06));
          drawShot({kind: b.round, vx: dx, vy: dy, m: 1}, x, y, now); g.restore();
        }
        continue;
      }
      if (b.pistol) {   // the laser pistol: a red beam with a soft glow and a white-hot core, gone in a blink
        const fade = Math.max(0, 1 - b.t / .16);
        if (fade > 0) {
          const x1 = sx(b.x1), y1 = sy(b.y1), x2 = sx(b.x2), y2 = sy(b.y2);
          g.save(); g.lineCap = "round"; g.globalCompositeOperation = "lighter";
          g.strokeStyle = `rgba(255,40,70,${0.28 * fade})`; g.lineWidth = 9 * fade + 2; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
          g.strokeStyle = `rgba(255,70,90,${0.8 * fade})`; g.lineWidth = 3.2; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
          g.strokeStyle = `rgba(255,225,230,${fade})`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
          if (!lowQ) { g.fillStyle = `rgba(255,90,110,${0.6 * fade})`; g.beginPath(); g.arc(x2, y2, 7 * fade + 2, 0, 6.29); g.fill(); }   // where it lands
          g.restore();
        }
        continue;
      }   // rail trails: a white-hot core in a violet glow that goes quickly, and a double spiral that lingers and unwinds
      const k = 1 - b.t / BEAM_T, kc = Math.max(0, 1 - b.t / 0.4), x1 = sx(b.x1), y1 = sy(b.y1), x2 = sx(b.x2), y2 = sy(b.y2);
      g.lineCap = "round"; g.lineJoin = "round";
      if (kc > 0) {
        const bw = b.cut ? b.cut / 15 : b.big ? 1.9 : 1;   // the charged slug: wider and blue
        g.strokeStyle = `rgba(255,${b.big ? 110 : 130},50,${0.38 * kc})`; g.lineWidth = (26 * kc + 4) * bw;   // (white-hot, orange round it: a slug that melts what it goes through)
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        g.strokeStyle = `rgba(255,${b.big ? 200 : 215},150,${0.85 * kc})`; g.lineWidth = (8 * kc + 1) * bw;
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        g.strokeStyle = `rgba(255,255,255,${kc})`; g.lineWidth = 2.5 * kc + 0.5;
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      }
      // only the part on screen is traced, so a long trail stays cheap
      const L = Math.hypot(x2 - x1, y2 - y1), nx = (x2 - x1) / (L || 1), ny = (y2 - y1) / (L || 1), r = 8 + b.t * 26;
      const proj = (px, py) => (px - x1) * nx + (py - y1) * ny, ds = [proj(0, 0), proj(vw, 0), proj(0, vh), proj(vw, vh)];
      const d0 = Math.max(0, Math.min(...ds) - 40), d1 = Math.min(L, Math.max(...ds) + 40), step = lowQ ? 10 : 5;
      const side = (px, py) => (px - x1) * -ny + (py - y1) * nx, ss = [side(0, 0), side(vw, 0), side(0, vh), side(vw, vh)];
      if (Math.min(...ss) > r + 40 || Math.max(...ss) < -r - 40) continue;   // the whole screen is off to one side of the trail
      for (const [ph, col] of [[0, "255,160,80"], [Math.PI, "255,230,200"]]) {
        g.strokeStyle = `rgba(${col},${0.75 * k})`; g.lineWidth = 2 * k + 0.6;
        g.beginPath();
        for (let d = d0; d <= d1; d += step) {
          const a = d / 22 + ph + b.t * 4, o = Math.sin(a) * r;
          const px = x1 + nx * d - ny * o, py = y1 + ny * d + nx * o;
          d === d0 ? g.moveTo(px, py) : g.lineTo(px, py);
        }
        g.stroke();
      }
    }
    // the laser: one electric beam per shooter (the newest pulse; at 12 a second they'd fan out otherwise): a wide
    // cold glow, a cyan body, a white-hot core, three jagged arcs crackling round it, bolts of energy running up it,
    // a flare at the emitter and a spray of sparks where it lands. The shock beam is a thinner violet one.
    const beamSeen = new Set();
    for (let li = lasers.length - 1; li >= 0; li--) {
      const b = lasers[li];
      if (beamSeen.has(b.who)) continue;
      beamSeen.add(b.who);
      const x1 = sx(b.x1), y1 = sy(b.y1), x2 = sx(b.x2), y2 = sy(b.y2), L = Math.hypot(x2 - x1, y2 - y1) || 1;
      if (!onScreen((x1 + x2) / 2, (y1 + y2) / 2, L / 2 + 60)) continue;
      const now = performance.now(), k = !b.shock && b.t < 0.27 ? 1 : Math.max(0, 1 - b.t / ((b.shock ? 0.35 : LASER_T) * 1.4)), nx = (x2 - x1) / L, ny = (y2 - y1) / L;
      const ht = b.heat || 0, [glow, body, arc] = b.shock ? ["150,100,255", "201,164,255", "235,220,255"] : ht > 0.8 ? ["255,230,120", "255,250,210", "255,255,240"] : ht > 0.45 ? ["160,255,80", "225,255,170", "255,255,220"] : ["65,220,25", "155,255,80", "220,255,160"];   // (heating: green, lime, then yellow-white)
      g.lineCap = "round"; g.lineJoin = "round";
      const line = (w, c) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
      const flick = 0.92 + 0.08 * Math.sin(now / 23 + b.seed);
      const hw = 0.75 + ht * 1.5;   // (a heated link beam: from thin to twice as thick, and whiter)
      line((b.shock ? 22 : 34) * k * flick * hw + 6, `rgba(${glow},${(0.16 + ht * 0.12) * k})`);
      line((b.shock ? 10 : 15) * k * flick * hw + 2, `rgba(${glow},${(0.35 + ht * 0.2) * k})`);
      line((b.shock ? 4 : 6) * k * hw + 1, `rgba(${body},${0.9 * k})`);
      line((b.shock ? 1.6 : 2.4) * k + 0.6, `rgba(255,255,255,${k})`);
      if (!lowQ) {   // stable between 45 ms electrical discharges, independent of display refresh
        let noise = (Math.floor(now / 45) + b.seed * 997 | 0) >>> 0;
        const random = () => { noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0; return noise / 4294967296; };
        for (let a = 0; a < (b.shock ? 2 : 3); a++) {
          const amp = (b.shock ? 7 : 11) + a * 4, pts = [];
          for (let d = 0; d <= L; d += 18) { const env = Math.sin(Math.PI * Math.min(1, d / L)) * 0.7 + 0.3, o = (random() - 0.5) * 2 * amp * env; pts.push([x1 + nx * d - ny * o, y1 + ny * d + nx * o]); }
          pts.push([x2, y2]);
          for (const [w, al] of [[4, 0.25], [1.4, 0.9]]) {
            g.strokeStyle = `rgba(${a === 1 ? "190,160,255" : arc},${al * k})`; g.lineWidth = w;
            g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.stroke();
          }
        }
        for (let p = 0; p < 4; p++) {   // bolts of energy racing up the beam
          const f = ((now / (b.shock ? 160 : 240) + p / 4 + b.seed) % 1), px = x1 + nx * L * f, py = y1 + ny * L * f;
          g.globalAlpha = k * 0.9; g.drawImage(dotSprite(b.shock ? "#e4d2ff" : "#e8fdff"), px - 12, py - 12, 24, 24); g.globalAlpha = 1;
        }
      }
      g.globalAlpha = k; g.drawImage(dotSprite(b.shock ? "#c9a4ff" : "#bff9ff"), x1 - 24, y1 - 24, 48, 48);   // the emitter's flare
      if (b.hit && b.hit !== "wall") {   // where it lands: a white-hot flare and sparks spitting off it
        g.drawImage(dotSprite(b.shock ? "#e4d2ff" : "#ffffff"), x2 - 34, y2 - 34, 68, 68);
        g.strokeStyle = `rgba(${arc},${0.9 * k})`; g.lineWidth = 1.5;
        for (let sp = 0; sp < 5; sp++) { const a = Math.atan2(-ny, -nx) + (Math.random() - 0.5) * 2.4, r = 10 + Math.random() * 26; g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 + Math.cos(a) * r, y2 + Math.sin(a) * r); g.stroke(); }
      }
      g.globalAlpha = 1;
    }
    for (const q of arcs) {   // zaps and arcs
      const k = 1 - q.t / 0.3, x1 = sx(q.x1), y1 = sy(q.y1), x2 = sx(q.x2), y2 = sy(q.y2), L = Math.hypot(x2 - x1, y2 - y1) || 1, nx = (x2 - x1) / L, ny = (y2 - y1) / L;
      const pts = [[x1, y1]];
      for (let s2 = 1; s2 < 8; s2++) { const t = s2 / 8, o = (Math.random() - 0.5) * 30; pts.push([x1 + (x2 - x1) * t - ny * o, y1 + (y2 - y1) * t + nx * o]); }
      pts.push([x2, y2]);
      for (const [w, c] of [[8, `rgba(${q.col || "120,200,255"},${0.35 * k})`], [2.5, `rgba(220,248,255,${k})`]]) {
        g.strokeStyle = c; g.lineWidth = w; g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.stroke();
      }
    }
    for (const q of rings) {
      if (q.t < 0) continue;
      const x = sx(q.x), y = sy(q.y), k = q.t / (q.dur || 0.6), e = 1 - (1 - k) * (1 - k);
      if (q.shock) {   // a blast's shock wave: the lens, a darker band of compressed air behind it, a hot bright front
        const rr = q.r * e, w = q.shock * (1 - 0.5 * k), fade = 1 - k;
        if (!onScreen(x, y, rr + w)) continue;
        g.globalCompositeOperation = "source-over";
        if (!lowQ && k < 0.85) shockLens(x, y, rr, w, fade);
        g.strokeStyle = `rgba(20,14,24,${0.18 * fade})`; g.lineWidth = w * 0.9; g.beginPath(); g.arc(x, y, Math.max(0, rr - w * 0.6), 0, 6.29); g.stroke();
        g.globalCompositeOperation = "lighter";
        g.strokeStyle = `rgba(${q.col},${0.22 * fade})`; g.lineWidth = w * 0.7; g.beginPath(); g.arc(x, y, rr, 0, 6.29); g.stroke();
        g.strokeStyle = `rgba(255,255,255,${0.85 * fade * fade})`; g.lineWidth = 2 + 2 * fade; g.beginPath(); g.arc(x, y, rr + w * 0.15, 0, 6.29); g.stroke();
        continue;
      }
      if (q.warp && !lowQ && k < 0.9 && onScreen(x, y, q.r)) {
        g.globalCompositeOperation = "source-over"; refractRing(x, y, q.r * e, 24, 1 - k); g.globalCompositeOperation = "lighter";
      }
      if (q.bare) continue;   // (only the air bending: no ring drawn)
      g.strokeStyle = `rgba(${q.col},${0.7 * (1 - k)})`; g.lineWidth = (q.w || 10) * (1 - k) + 1.5;
      g.beginPath(); g.arc(x, y, q.r * e, 0, 6.29); g.stroke();
    }
    g.globalCompositeOperation = "source-over";
    for (const b of booms) {
      const x = sx(b.x), y = sy(b.y), T = b.t;
      const R = b.R;
      if (!onScreen(x, y, R)) continue;
      const grow = Math.min(1, T / 0.8), e = 1 - Math.pow(1 - grow, 3);
      const fr = R * 0.8 * e * (T > 1.6 ? 1 - (T - 1.6) / (BOOM_LIFE - 1.6) * 0.3 : 1);
      const heat = T < 0.3 ? 1 : Math.max(0, 1 - (T - 0.3) / (BOOM_LIFE - 0.3));
      const cool = b.holy ? 0 : Math.min(1, T / 1.5);   // white -> orange -> deep red as it cools (the holy one stays white-gold)
      g.globalCompositeOperation = "lighter";
      // churning edge: blobs around the rim, drifting
      for (let j = 0; j < (lowQ ? 6 : 14); j++) {
        const a = j * 0.4488 + b.seed + T * 0.35 * (j % 2 ? 1 : -1);
        const rr = fr * (0.62 + 0.22 * Math.sin(j * 3.1 + T * 3 + b.seed));
        const bx = x + Math.cos(a) * rr, by = y + Math.sin(a) * rr, br = fr * (0.38 + 0.08 * Math.sin(T * 5 + j));
        const bg = g.createRadialGradient(bx, by, 0, bx, by, br);
        bg.addColorStop(0, b.holy ? `rgba(255,${Math.round(200 + 20 * heat)},90,${0.22 * heat})` : `rgba(255,${Math.round(170 - cool * 90)},${Math.round(70 - cool * 50)},${0.24 * heat})`); bg.addColorStop(1, "rgba(255,60,20,0)");
        g.fillStyle = bg; g.beginPath(); g.arc(bx, by, br, 0, 6.29); g.fill();
      }
      // the core
      const cg = g.createRadialGradient(x, y, 0, x, y, fr);
      cg.addColorStop(0, `rgba(255,255,245,${heat})`);
      cg.addColorStop(0.3, `rgba(255,${Math.round(240 - cool * 80)},${Math.round(180 - cool * 120)},${0.9 * heat})`);
      cg.addColorStop(0.7, `rgba(255,${Math.round(140 - cool * 60)},40,${0.55 * heat})`);
      cg.addColorStop(1, "rgba(200,40,20,0)");
      g.globalAlpha = Math.max(0, 0.45 - T * 0.25); g.fillStyle = cg; g.beginPath(); g.arc(x, y, fr * 0.6, 0, 6.29); g.fill(); g.globalAlpha = 1;   // (a hot heart only: the fire is the show)
      // the fireball itself: billowing flame clouds churning through it, cooling from the outside in
      g.globalCompositeOperation = "source-over";
      const ramp = b.holy ? PLASMA_RAMP : FIRE_RAMP;
      for (let j = 0, n = lowQ ? 10 : 26; j < n; j++) {
        const a = j * 2.4 + b.seed + T * (j % 2 ? 0.25 : -0.2), rr = fr * (j / n) * 0.9, d = fr * (0.5 + 0.35 * Math.sin(j * 1.3 + b.seed));
        const shade = Math.min(7, Math.floor(1 + (j / n) * 3 + cool * 4 * (0.5 + j / n)));
        g.globalAlpha = Math.min(1, heat * 1.4) * 0.8;
        g.save(); g.translate(x + Math.cos(a) * rr, y + Math.sin(a) * rr); g.rotate(a + T * 0.5);
        g.drawImage(fireSprite(b.holy ? Math.min(6, shade + 2) : shade, j & 3, b.holy ? FIRE_RAMP : ramp), -d / 2, -d / 2, d, d); g.restore();
      }
      g.globalAlpha = 1; g.globalCompositeOperation = "lighter";
      // a ring of fire rolling outward with the blast wave
      if (T < 2.2) {
        const k = T / 2.2, rr = R * (0.35 + 1.05 * (1 - Math.pow(1 - k, 2.2)));
        for (let j = 0, n = lowQ ? 14 : 34; j < n; j++) {
          const a = j / n * 6.283 + b.seed, wob = rr * (1 + 0.06 * Math.sin(j * 5 + T * 4)), d = R * (0.22 + 0.08 * Math.sin(j * 2.1)) * (1 - k * 0.5);
          g.globalAlpha = 0.55 * (1 - k);
          g.save(); g.translate(x + Math.cos(a) * wob, y + Math.sin(a) * wob); g.rotate(a);
          g.drawImage(fireSprite(Math.min(7, 2 + Math.floor(k * 5)), j & 3, b.holy ? FIRE_RAMP : FIRE_RAMP), -d / 2, -d / 2, d, d); g.restore();
        }
        g.globalAlpha = 1;
      }
      // a short blinding instant
      if (T < 0.25) {
        const fl = g.createRadialGradient(x, y, 0, x, y, R * 1.2);
        fl.addColorStop(0, `rgba(255,255,255,${0.8 * (1 - T / 0.25)})`); fl.addColorStop(0.25, `rgba(255,235,190,${0.25 * (1 - T / 0.25)})`); fl.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = fl; g.beginPath(); g.arc(x, y, R * 1.2, 0, 6.29); g.fill();
      }
      if (b.holy && T < 3) {   // long beams of light fanning out of the holy blast
        const a0 = b.seed, fade = T < 0.3 ? T / 0.3 : 1 - (T - 0.3) / 2.7;
        for (let j = 0; j < (lowQ ? 6 : 12); j++) {
          const a = a0 + j * 0.5236 + T * 0.15, len = R * (1.2 + 0.4 * Math.sin(j * 2.3 + a0)), wd = 0.05 + 0.03 * Math.sin(j * 1.7);
          const rg = g.createRadialGradient(x, y, 0, x, y, len);
          rg.addColorStop(0, `rgba(255,230,150,${0.3 * fade})`); rg.addColorStop(1, "rgba(255,200,90,0)");
          g.fillStyle = rg; g.beginPath(); g.moveTo(x, y); g.arc(x, y, len, a - wd, a + wd); g.closePath(); g.fill();
        }
      }
      if (T < 1.4) {   // a white-hot shock shell racing out ahead of the fireball
        const k = T / 1.4, rr = R * (0.2 + 1.1 * (1 - Math.pow(1 - k, 2)));
        const sg = g.createRadialGradient(x, y, rr * 0.82, x, y, rr);
        sg.addColorStop(0, "rgba(255,255,255,0)"); sg.addColorStop(0.7, `rgba(255,240,200,${0.5 * (1 - k)})`); sg.addColorStop(1, "rgba(255,200,140,0)");
        g.fillStyle = sg; g.beginPath(); g.arc(x, y, rr, 0, 6.29); g.fill();
      }
      g.globalCompositeOperation = "source-over";
    }
  }
