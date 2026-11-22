  // particles, wreckage, fragments, flashes, rings, floating text
  function updateFx(dt, now) {
    rebuildSolidGrid(now);
    // flying through smoke and sparks shoves them aside (faster = harder)
    const meSp = Math.hypot(me.vx, me.vy), pushR = 46 * sizeOf(me.lv), pushR2 = pushR * pushR, canPush = playing && !me.dead && meSp > 60;
    // the planets pull the heavy bits (sparks, embers, hot blobs, burning chunks): near one they arc down onto it
    // and bounce off its ground (smoke and fire clouds float)
    const gp = planets.filter(q => !q.dead && !q.free && q.mass > 0);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt;
      if (gp.length && (p.k === 1 || p.k === 3 || p.k === 5 || p.k === 8)) for (const q of gp) {
        const dx = q.x - p.x, dy = q.y - p.y, R = q.rr, d2 = dx * dx + dy * dy;
        if (d2 > 9 * R * R || d2 < 1) continue;
        const d = Math.sqrt(d2), acc = PLANET_G * 2.2 * (R / 250) * (R / Math.max(d, R)) ** 2 * (q.mass / q.mass0) * dt;
        p.vx += dx / d * acc; p.vy += dy / d * acc;
      }
      if (canPush && p.k !== 1) {
        const dx = p.x - me.x, dy = p.y - me.y, d2 = dx * dx + dy * dy;
        if (d2 < pushR2 && d2 > 1) { const d = Math.sqrt(d2), v = meSp * 0.8 + 80; p.vx = dx / d * v + me.vx * 0.3; p.vy = dy / d * v + me.vy * 0.3; }
      }
      if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); freePart(p); continue; }
      const ox = p.x, oy = p.y;
      p.x += p.vx * dt; p.y += p.vy * dt;
      // sparks, embers, hot blobs and burning bits bounce off what stands (smoke and fire clouds roll over it)
      if ((p.k === 1 || p.k === 3 || p.k === 5 || p.k === 8) && solidCell(p.x, p.y) && bounceSmall(p, ox, oy, p.k === 1 ? 0.45 : 0.3) && p.k === 1) p.life *= 0.7;
      const damp = Math.pow(p.drag || (p.k === 2 ? 0.93 : 0.97), dt * 60);
      p.vx *= damp; p.vy *= damp;
      if (p.curl) { const c = Math.cos(p.curl * dt), s = Math.sin(p.curl * dt), vx = p.vx; p.vx = vx * c - p.vy * s; p.vy = vx * s + p.vy * c; }   // an arc
      if (p.k === 8 && Math.random() < (lowQ ? 25 : 60) * dt) {   // a burning chunk leaves fire and smoke behind it
        const f = p.life / p.max;
        if (Math.random() < 0.65 * f + 0.15) puff(p.x, p.y, p.vx * 0.15 + (Math.random() - 0.5) * 30, p.vy * 0.15 + (Math.random() - 0.5) * 30, 0.25 + Math.random() * 0.2, (5 + Math.random() * 4) * (0.5 + f), "fire", 4, 0, 0, 0.9, 0.2 + (1 - f) * 0.3);
        else puff(p.x, p.y, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 0.8 + Math.random() * 0.6, 3 + Math.random() * 3, SMOKE_COLS[1], 2, 0, 0, 0.94, 0.3);
      }
    }
    shockTick(now); updateOil(dt); updateChunks(dt); updateDrips(dt); updateCasings(dt); updateMelt(dt); jetBlast(dt); updateCuts(dt); updatePlume(dt);
    for (let i = afterBlasts.length - 1; i >= 0; i--) if (now >= afterBlasts[i].at) {
      const b = afterBlasts[i]; afterBlasts.splice(i, 1);
      if (b.o) {   // a piece of a broken bin popping where it has flown to: a kick to it, sparks, a little fire
        if (!frags.includes(b.o)) continue;
        const o = b.o, a = Math.random() * 6.28;
        explode(o.x, o.y, 12, b.speed); sparkShower(o.x, o.y, Math.cos(a), Math.sin(a), 0.9);
        o.vx += Math.cos(a) * 120; o.vy += Math.sin(a) * 120; o.spin += (Math.random() - 0.5) * 4;
        shake = Math.max(shake, Math.hypot(o.x - me.x, o.y - me.y) < 900 ? 0.12 : 0);
      } else explode(b.x, b.y, 14, b.speed);
    }
    const partCap = lowQ ? MAX_PARTS / 3 : MAX_PARTS;
    if (parts.length > partCap) parts.splice(0, parts.length - partCap);
    updateMelts(dt);
    for (let i = hulks.length - 1; i >= 0; i--) {
      const h = hulks[i];
      h.life -= dt;
      if (h.life <= 0) { hulks.splice(i, 1); continue; }
      const drag = Math.exp(-(stationMap() ? 1.4 : 0.015) * dt);   // space: practically no drag; a deck: it skids to rest
      if (!h.rest) { h.x += h.vx * dt; h.y += h.vy * dt; } h.vx *= drag; h.vy *= drag; h.a += h.spin * dt;
      if (stationMap()) h.spin *= Math.exp(-1.8 * dt);
      const pc = h.dying ? bounceOff(h, 30 * sizeOf(h.lv), 0.8, 0.35 * binMass(h.lv)) : wreckFalls(h, 30 * sizeOf(h.lv), dt, now, 0.35 * binMass(h.lv));   // (a thrown one flies until it blows)
      if (h.dying) {   // a bin thrown by the blow that killed it: burning as it flies, until it slams into something
        const d = h.dying, sz2 = sizeOf(h.lv);
        d.fuse -= dt; d.age = (d.age || 0) + dt;
        if (Math.random() < (lowQ ? 25 : 60) * dt) puff(h.x + (Math.random() - 0.5) * 30 * sz2, h.y + (Math.random() - 0.5) * 30 * sz2, -h.vx * 0.2 + (Math.random() - 0.5) * 60, -h.vy * 0.2 + (Math.random() - 0.5) * 60, 0.3 + Math.random() * 0.3, (8 + Math.random() * 8) * sz2, "fire", 4, 0, 0, 0.9, 0.2);
        if (Math.random() < (lowQ ? 10 : 25) * dt) puff(h.x, h.y, -h.vx * 0.1, -h.vy * 0.1, 1 + Math.random(), (6 + Math.random() * 6) * sz2, SMOKE_COLS[0], 2, 0, (Math.random() - 0.5), 0.95);
        if (Math.random() < 12 * dt) { const a = Math.random() * 6.28; puff(h.x, h.y, Math.cos(a) * 300, Math.sin(a) * 300, 0.2, 1, "#fff1b8", 1, 0.05); }
        if (Math.random() < 8 * dt) oilSplash(h.x, h.y, 1, 60, h.vx * 0.3, h.vy * 0.3);
        const slam = pc && -pc.vn > 120, edge = h.x < 60 || h.x > W - 60 || h.y < 60 || h.y > H - 60;
        let hitBin = false;
        if (d.age > 0.12) {   // (not the one it was killed by, beside it as it dies)
          for (const r of remotes.values()) if (!r.dead && Math.hypot(r.x - h.x, r.y - h.y) < 60 * sz2) hitBin = true;
          if (!me.dead && playing && Math.hypot(me.x - h.x, me.y - h.y) < 60 * sz2) hitBin = true;
        }
        if (slam || edge || hitBin || d.fuse <= 0) { hulks.splice(i, 1); wreckBlows(h); continue; }
      }
      if (h.burn) {   // burning: flames lick up off it, then it crumbles to ash
        const bt = (now - h.burn) / 1000, sz1 = sizeOf(h.lv);
        if (bt >= 0 && bt < 3.2 && Math.random() < (lowQ ? 20 : 50) * dt) puff(h.x + (Math.random() - 0.5) * 50 * sz1, h.y + (Math.random() - 0.5) * 50 * sz1, (Math.random() - 0.5) * 40, -60 - Math.random() * 80, 0.5 + Math.random() * 0.4, 3 + Math.random() * 4, FIRE_COLS[(Math.random() * 4) | 0]);
        if (bt > 3.4 && !h.ashed) { h.ashed = true; for (let k = 0; k < (lowQ ? 20 : 50); k++) { const a = Math.random() * 6.28, v = 30 + Math.random() * 120; puff(h.x, h.y, Math.cos(a) * v, Math.sin(a) * v, 1.2 + Math.random(), 2 + Math.random() * 3, k % 2 ? "rgb(60,56,62)" : "rgb(120,112,110)", 2); } }
      }
      if (h.x < 40 || h.x > W - 40) { h.vx = -h.vx; h.x = clamp(h.x, 40, W - 40); }
      if (h.y < 40 || h.y > H - 40) { h.vy = -h.vy; h.y = clamp(h.y, 40, H - 40); }
      const sz = sizeOf(h.lv);
      const hAge = (now - h.born) / 1000;
      if (hAge < 15 && Math.random() < (lowQ ? 6 : 14) * dt) puff(h.x + (Math.random() - 0.5) * 40 * sz, h.y + (Math.random() - 0.5) * 40 * sz, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 1.6, 4 + Math.random() * 4, "rgb(52,46,64)", 2);
      if (h.zap && hAge < 2.8) {
        if (Math.random() < 10 * dt) { const a = Math.random() * 6.28, v = 150 + Math.random() * 300; puff(h.x, h.y, Math.cos(a) * v, Math.sin(a) * v, 0.25 + Math.random() * 0.3, 1 + Math.random(), Math.random() < 0.5 ? "#bfefff" : "#ffffff", 1, 0.05); }
        if (Math.random() < 3 * dt) { impact(h.x + (Math.random() - 0.5) * 40 * sz, h.y + (Math.random() - 0.5) * 40 * sz, "#9fe8ff", 0.5); sfx("laser", 0.25, 2 + Math.random(), h.x, h.y); }
      } else if (hAge < 6 && Math.random() < 2.5 * dt) impact(h.x + (Math.random() - 0.5) * 50 * sz, h.y + (Math.random() - 0.5) * 50 * sz, "#ff9a2e", 0.5);
      // it is solid: bump off it
      const dx = me.x - h.x, dy = me.y - h.y, d = Math.hypot(dx, dy);
      if (playing && !me.dead && d > 0.01 && d < 31 * (sizeOf(me.lv) + sz) && (!h.bump || now - h.bump > 300)) {
        h.bump = now;
        // a wreck is a shell, lighter than a live bin: momentum shared by weight (a third of a bin's), restitution 0.4, so
        // flying into it knocks it away and barely slows me, and one drifting into me at rest nudges me only a little.
        // On the server it is only a picture here (the server has no wrecks): it never moves my bin there
        const nx = dx / d, ny = dy / d, vn = (me.vx - h.vx) * nx + (me.vy - h.vy) * ny, mh = 0.35;
        const j = vn < 0 ? -1.4 * vn / (1 + 1 / mh) : 40 * mh / (1 + mh);   // (touching but parting: just a little push apart)
        if (!serverRun) { me.vx += nx * j; me.vy += ny * j; }
        h.rest = null; h.vx -= nx * j / mh; h.vy -= ny * j / mh; h.spin += (Math.random() - 0.5) * 2 * Math.min(1, j / 200);
        impact(me.x - dx / 2, me.y - dy / 2, "#d9c8ff", Math.min(1.2, 0.3 + j / 250));
        if (j > 250) sparkShower(me.x - dx / 2, me.y - dy / 2, -dy, dx, 0.8);
        sfx("crash", Math.min(0.6, 0.15 + j / 600));
      }
    }
    for (let i = frags.length - 1; i >= 0; i--) {
      const f = frags[i];
      f.life -= dt;
      if (f.life <= 0) { frags.splice(i, 1); continue; }
      const drag = Math.exp(-(stationMap() ? 1.1 : 0.015) * dt), spinDrag = stationMap() ? Math.exp(-1.5 * dt) : 1;
      if (!f.rest) { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= drag; f.vy *= drag; f.spin *= spinDrag; f.a += f.spin * dt; }
      // (bins shove the pieces about: piecesCollide)
      wreckFalls(f, f.s * 0.25, dt, now, 0.25 * (f.s / BOT) ** 2, "a", "spin", 0.35);
      if (f.x < 0 || f.x > W) { f.vx = -f.vx; f.x = clamp(f.x, 0, W); }
      if (f.y < 0 || f.y > H) { f.vy = -f.vy; f.y = clamp(f.y, 0, H); }
      if ((now - f.born) / 1000 < 4 && Math.random() < (lowQ ? 3 : 8) * dt) puff(f.x, f.y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 1.4, 3 + Math.random() * 3, "rgb(60,54,72)", 2);
    }
    for (const s of shots) {
      if (s.life <= 0 || SHOTS[s.kind].inert || s.kind === K.MINE) continue;
      for (const o of hulks) if (segHit(s, o.x, o.y, 34 * sizeOf(o.lv)) && (!pierces(s) || railOnce(s, o))) { const pk = pierces(s) ? 0.03 : 0.08; o.rest = null; o.vx += s.vx * pk; o.vy += s.vy * pk; o.spin += (Math.random() - 0.5); if (!pierces(s)) s.life = 0; impact(s.x, s.y, "#d9c8ff", 0.8); break; }
      if (s.life <= 0) continue;
      for (const o of frags) if (segHit(s, o.x, o.y, o.s * 0.3)) { o.rest = null; o.vx += s.vx * 0.12; o.vy += s.vy * 0.12; o.spin += (Math.random() - 0.5) * 2; s.life = 0; impact(s.x, s.y, "#d9c8ff", 0.6); break; }
    }
    // wreckage drifts (almost no drag in space), spins, bounces off the fence, smoulders at first
    // (on a station's deck it scrapes along and comes to rest; in space it drifts on)
    const drift = Math.exp(-(stationMap() ? 1.4 : 0.015) * dt);
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.life -= dt;
      if (d.life <= 0) { debris.splice(i, 1); continue; }
      if (!d.rest) { d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= drift; d.vy *= drift; d.vr *= drift; d.rot += d.vr * dt; }
      wreckFalls(d, 4, dt, now, debrisMass(d), "rot", "vr", 0.4);
      if (d.x < 0 || d.x > W) { d.vx = -d.vx; d.x = clamp(d.x, 0, W); }
      if (d.y < 0 || d.y > H) { d.vy = -d.vy; d.y = clamp(d.y, 0, H); }
      const ddx = d.x - me.x, ddy = d.y - me.y, dd = Math.hypot(ddx, ddy);
      if (playing && !me.dead && dd < 34 * sizeOf(me.lv) && dd > 0.01) { d.rest = null; const pv = Math.max(120, Math.hypot(me.vx, me.vy)); d.vx = ddx / dd * pv; d.vy = ddy / dd * pv; d.vr += (Math.random() - 0.5) * 4; }
      if ((now - d.born) / 1000 < 3 && Math.random() < (lowQ ? 1 : 3) * dt) puff(d.x, d.y, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 1.2, 2 + Math.random() * 2, "rgb(80,72,98)", 2);
    }
    for (let i = impacts.length - 1; i >= 0; i--) { impacts[i].t += dt; if (impacts[i].t > (impacts[i].dur || 0.22)) impacts.splice(i, 1); }
    for (let i = beams.length - 1; i >= 0; i--) { beams[i].t += dt; if (beams[i].t > (beams[i].duration || (beams[i].pistol ? .12 : BEAM_T))) beams.splice(i, 1); }
    for (let i = lasers.length - 1; i >= 0; i--) { lasers[i].t += dt; if (lasers[i].t > (lasers[i].shock ? 0.35 : LASER_T)) lasers.splice(i, 1); }
    for (let i = arcs.length - 1; i >= 0; i--) { arcs[i].t += dt; if (arcs[i].t > 0.3) arcs.splice(i, 1); }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > (rings[i].dur || 0.6)) rings.splice(i, 1); }
    waveTick(dt);
    for (let i = booms.length - 1; i >= 0; i--) { booms[i].t += dt; if (booms[i].t > BOOM_LIFE) booms.splice(i, 1); }
    flash = Math.max(0, flash - dt * 1.4);
    for (let i = floaters.length - 1; i >= 0; i--) { floaters[i].t += dt; if (floaters[i].t > 1) floaters.splice(i, 1); }
  }
