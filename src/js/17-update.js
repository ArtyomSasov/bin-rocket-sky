  // ---------- update ----------
  let sendAcc = 0, boardAcc = 0, sendSeq = 0, slowAcc = 1, lastSlow = "";
  const ampChip = document.getElementById("ampChip");
  let ampShown = -1;
  function ampHud(now) {
    const left = me.ampUntil > now ? Math.ceil((me.ampUntil - now) / 1000) : 0;
    if (left === ampShown) return;
    ampShown = left; ampChip.hidden = !left; ampChip.textContent = "OVERDRIVE x3 · " + left + "s";
  }
  function update(dt, now) {
    ampHud(now);
    const kd = Math.exp(-14 * dt); camKick.x *= kd; camKick.y *= kd;
    hurtFlash = Math.max(0, hurtFlash - dt * 2.2);
    // input → acceleration
    let ix = 0, iy = 0;
    const shiftHeld = keys.has("ShiftLeft") || keys.has("ShiftRight");
    let boost = (shiftHeld || boostBtnDown) && boostDownAt >= 0 && now - boostDownAt > BOOST_HOLD * 1000;
    if (me.dead && now >= me.respawnAt) respawn(now);
    fireCd -= dt; shake = Math.max(0, shake - dt);
    heatTick(dt, now);
    const ready = playing && roundLive && !me.dead && fireCd <= 0;
    if (ready && (altFiring || keys.has("KeyC")) && WEAPONS[me.weapon].alt) shoot(now, true);
    else if (ready && (firing || FIRE_KEYS.some(k => keys.has(k))) && !(me.weapon === "laser" && overheated)) shoot(now);
    if (playing && !me.dead) {
      if (keys.has("KeyA") || keys.has("ArrowLeft")) ix -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) ix += 1;
      if (keys.has("KeyW") || keys.has("ArrowUp")) iy -= 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) iy += 1;
      const jm = Math.hypot(joy.x, joy.y);
      if (jm > 0.12) { const m = Math.min(1, (jm - 0.12) / 0.8); ix += joy.x / jm * m; iy += joy.y / jm * m; }
      if (ptr.down) {
        const dx = ptr.x - vw / 2, dy = ptr.y - vh / 2, d = Math.hypot(dx, dy);
        if (d > 8) { const m = Math.min(1, d / 140); ix += dx / d * m; iy += dy / d * m; }
        if (d > Math.min(vw, vh) * 0.4) boost = true;
      }
    }
    const raw = Math.hypot(ix, iy);
    if (raw > 1) { ix /= raw; iy /= raw; }
    // input eases in/out over ~0.1 s, then velocity eases toward the wanted velocity: turns become arcs
    const ease = 1 - Math.exp(-10 * dt);
    steer.x += (ix - steer.x) * ease; steer.y += (iy - steer.y) * ease;
    const im = Math.hypot(steer.x, steer.y);
    boost = boost && playing && !me.dead && energy > 0 && im > 0.1;
    me.boostFx = now - me.dashAt < 350 ? 2 : boost ? 1 : 0;
    if (boost) { energy = Math.max(0, energy - 20 * dt); energyRegenAt = now + 700; }   // a full bar is ~5 s of boost
    else if (now > energyRegenAt) energy = Math.min(100, energy + 22 * dt);
    // inertia: thrust pushes the bin and it keeps its speed, coasting down only slowly. Pushing against your motion
    // fires the retro thrusters (they bite harder), X is an air brake; past top speed the excess (a hit, a blast) bleeds off
    const top = boost ? 880 : 560, acc = boost ? 1250 : 720;
    const braking = playing && !me.dead && keys.has("KeyX");
    if (playing && !me.dead) {
      const sp0 = Math.hypot(me.vx, me.vy);
      if (im > 0.05) {
        const ux = steer.x / im, uy = steer.y / im, along = sp0 > 1 ? (me.vx * ux + me.vy * uy) / sp0 : 1;
        const va = me.vx * ux + me.vy * uy;   // speed already going this way: thrust fades out as it nears top speed
        const k = Math.max(0, Math.min(acc * Math.min(1, im) * (along < 0 ? 1 - 0.8 * along : 1) * dt, (top * Math.min(1, im) - va) * Math.min(1, 6 * dt)));
        me.vx += ux * k; me.vy += uy * k;
        const lat = -me.vx * uy + me.vy * ux, ld = lat * (1 - Math.exp(-1.2 * dt));   // sideways slip fades: turns sweep in arcs
        me.vx += uy * ld; me.vy -= ux * ld;
      } else { const d = Math.exp(-0.45 * dt); me.vx *= d; me.vy *= d; }
      if (braking) {
        const s = Math.hypot(me.vx, me.vy), ns = Math.max(0, s - 1000 * dt);
        if (s > 1) { me.vx *= ns / s; me.vy *= ns / s; }
        if (s > 60 && Math.random() < 40 * dt) {   // retro jets puffing out of the nose
          const fx = me.x + Math.cos(me.a) * 30 * sizeOf(me.lv), fy = me.y + Math.sin(me.a) * 30 * sizeOf(me.lv);
          puff(fx, fy, Math.cos(me.a) * 220 + me.vx, Math.sin(me.a) * 220 + me.vy, 0.35, 3 + Math.random() * 3, "#cfe8ff", 2);
        }
      }
      const s1 = Math.hypot(me.vx, me.vy);
      if (s1 > top) { const ns = top + (s1 - top) * Math.exp(-2.5 * dt); me.vx *= ns / s1; me.vy *= ns / s1; }
    }
    const sp = Math.hypot(me.vx, me.vy);
    if (!playing) { me.vx = Math.cos(now / 2400) * 120; me.vy = Math.sin(now / 3100) * 90 - 40; }
    if (me.dead) { me.vx = me.vy = 0; }
    bodyTick(now, dt);
    if (!me.dead) gravityOn(me, dt);
    me.x += me.vx * dt; me.y += me.vy * dt;
    // walls: crash, lose a life, bounce back in
    const wr = WALL_R * sizeOf(me.lv);
    // planets and moons: same as a wall, and worse on boost
    const pc = me.dead ? null : bounceOff(me, wr, 0.7);
    if (pc) {
      const big = hurtsOnHit(pc.b);
      if (big) { me.vx += pc.nx * 220; me.vy += pc.ny * 220; }
      const hs = -pc.vn, cx = me.x - pc.nx * wr, cy = me.y - pc.ny * wr;
      if (playing && hs > 60) {
        impact(cx, cy, "#ffd9b0", Math.min(2, (big ? 0.4 : 0.2) + hs / 450));
        if (hs > 300) sparkShower(cx, cy, pc.nx, pc.ny, Math.min(1.6, hs / 600));
        sfx("crash", Math.min(1, (big ? 0.3 : 0.15) + hs / 700), big ? 0.8 : 1.2);
        const dmg = big ? crashDmg(hs, me.boostFx > 0) : 0;
        if (dmg > 0) hurt(now, dmg); else shake = Math.max(shake, big ? 0.12 : 0.06);
      }
    }
    let hitX = me.x < wr ? wr : me.x > W - wr ? W - wr : null;
    let hitY = me.y < wr ? wr : me.y > H - wr ? H - wr : null;
    if (hitX !== null || hitY !== null) {
      const hitSpeed = Math.hypot(me.vx, me.vy);
      if (hitX !== null) { me.x = hitX; me.vx = -me.vx * 0.7 + Math.sign(W / 2 - me.x) * 220; }
      if (hitY !== null) { me.y = hitY; me.vy = -me.vy * 0.7 + Math.sign(H / 2 - me.y) * 220; }
      if (playing && !me.dead) {
        const wx = hitX !== null ? (hitX < W / 2 ? 0 : W) : me.x, wy = hitY !== null ? (hitY < H / 2 ? 0 : H) : me.y;
        impact(wx, wy, "#bdfff6", Math.min(2, 0.4 + hitSpeed / 450));
        if (hitSpeed > 300) sparkShower(wx, wy, W / 2 - wx || (W / 2 - me.x), H / 2 - wy || (H / 2 - me.y), Math.min(1.6, hitSpeed / 600));
        sfx("crash", Math.min(1, 0.3 + hitSpeed / 700));
        if (hitSpeed > 120) hurt(now, 0.6); else shake = Math.max(shake, 0.12);
      }
    }
    // face where you steer, not where you drift: recoil, bumps and the black hole's pull move the bin
    // but no longer spin it (shooting while standing still used to flip it round and round)
    const steerMag = Math.hypot(steer.x, steer.y);
    if (playing && steerMag > 0.15) me.a = lerpAng(me.a, Math.atan2(steer.y, steer.x), 1 - Math.exp(-7 * dt));
    else if (!playing && sp > 25) me.a = lerpAng(me.a, Math.atan2(me.vy, me.vx), 1 - Math.exp(-6 * dt));
    me.thrust += ((playing ? Math.min(1, im) * (boost ? 1.4 : 1) : 0.6) - me.thrust) * Math.min(1, dt * 6);
    if (!me.dead) { trailFrom(me, 0.6 + me.thrust * 1.6 + me.boostFx * 1.5, dt); if (playing) damageFx(me, dt); afterburner(me, me.boostFx, dt); }

    // fireballs
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.life -= dt;
      if (s.life <= 0) { if (s.kind === K.ROCKET) rocketSplash(s, now); if (s.kind === K.ORB && !s.boom) explode(s.x, s.y, 24, 220); if (s.kind === K.NUKE) detonate(s, now); else if (s.kind === K.MINE && !s.boom) explode(s.x, s.y, 20, 180); shots.splice(i, 1); continue; }
      if (s.kind === K.ROCKET) steerRocket(s, dt);
      if (s.kind === K.ROCKET && s.life > 0) for (const o of shots) {   // rockets are big and slow: any enemy shot can blow one up mid-air
        if (o === s || o.life <= 0 || o.kind === K.NUKE || o.kind === K.MINE || (o.mine ? s.mine : o.owner === s.owner)) continue;
        if (segHit(o, s.x, s.y, 24)) { s.life = 0; if (o.kind !== K.RAIL) o.life = 0; impact(s.x, s.y, "#ffb43c", 1.6); explode(s.x, s.y, 40, 300); sfx("boom_small", 0.8, 1.2, s.x, s.y); break; }
      }
      if (s.life <= 0) continue;   // shot down: it blows up (splash) at the start of next frame
      if (s.kind === K.MINE) { const k = Math.exp(-2.5 * dt); s.vx *= k; s.vy *= k; }
      if (s.kind === K.NUKE) { const v = Math.hypot(s.vx, s.vy), nv = Math.min(720, v + 260 * dt); s.vx *= nv / v; s.vy *= nv / v; }
      s.px = s.x; s.py = s.y;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.kind === K.NUKE && (s.x < 0 || s.x > W || s.y < 0 || s.y > H || solidAny(s.x, s.y) || nukeTouches(s))) { detonate(s, now); shots.splice(i, 1); continue; }
      if (s.kind === K.NUKE) {
        if (Math.random() < dt * 70) puff(s.x, s.y, -s.vx * 0.15 + (Math.random() - .5) * 50, -s.vy * 0.15 + (Math.random() - .5) * 50, 0.9, 3 + Math.random() * 3, Math.random() < 0.5 ? "#8a7fb0" : "#ffe14d");
        continue;
      }
      if (s.kind === K.MINE && (s.x < 0 || s.x > W || s.y < 0 || s.y > H)) { s.x = clamp(s.x, 0, W); s.y = clamp(s.y, 0, H); s.vx = s.vy = 0; }
      if (s.kind === K.SHARD && s.bn < 2) {   // shards ricochet off the fence and off planets, losing a bit of speed
        let hit = false;
        if (s.x < 0 || s.x > W) { s.vx = -s.vx; s.x = clamp(s.x, 0, W); hit = true; }
        if (s.y < 0 || s.y > H) { s.vy = -s.vy; s.y = clamp(s.y, 0, H); hit = true; }
        if (hit) { s.bn++; s.vx *= 0.85; s.vy *= 0.85; s.px = s.x; s.py = s.y; impact(s.x, s.y, "#ff9a3c", 0.5); }
      }
      if ((s.kind === K.RAIL || s.kind === K.LASER) && s.life > 0) for (const o of shots) {
        if (o.kind === K.ORB && o.life > 0 && !o.combo && segHit(s, o.x, o.y, 45)) { comboBlast(o, s, now); if (s.kind === K.LASER) { s.life = 0; break; } }
      }
      // planets, moons, wrecks and rubble: the shot digs a crater where it lands (my shots and my bots' report theirs;
      // others' craters on shared bodies arrive over the network, but anyone's shot chips local rubble)
      const hb = shotBody(s);
      if (hb) {
        const own = s.mine || botById.has(s.owner), dig = own || hb.b.free;
        if (s.kind === K.RAIL) {   // the rail slug bores a tunnel straight through and keeps going
          if (dig) for (let f = 0; f <= 1.0001; f += 0.125) { const px = s.px + (s.x - s.px) * f, py = s.py + (s.y - s.py) * f; if (solidAt(hb.b, px, py)) carveAt(hb.b, px, py, SHOTS[K.RAIL].carve, own); }
          impact(hb.x, hb.y, SHOTS[K.RAIL].col, 0.8);
        } else if (s.kind === K.SHARD && s.bn < 2) {   // shards chip and ricochet
          if (dig) carveAt(hb.b, hb.x, hb.y, SHOTS[K.SHARD].carve, own);
          const [nx, ny] = normalAt(hb.b, hb.x, hb.y), vn = s.vx * nx + s.vy * ny;
          if (vn < 0) { s.vx = (s.vx - 2 * vn * nx) * 0.85; s.vy = (s.vy - 2 * vn * ny) * 0.85; }
          s.x = hb.x + nx * 4; s.y = hb.y + ny * 4; s.px = s.x; s.py = s.y; s.bn++;
          impact(s.x, s.y, "#ff9a3c", 0.5);
        } else {
          if (dig) carveAt(hb.b, hb.x, hb.y, SHOTS[s.kind].carve, own);
          s.x = hb.x; s.y = hb.y;
          if (s.kind === K.ROCKET) rocketSplash(s, now);
          if (s.kind === K.ORB) s.boom = true;
          impact(hb.x, hb.y, SHOTS[s.kind].col, s.kind === K.ROCKET || s.kind === K.MINE || s.kind === K.ORB ? 1.6 : 0.8);
          if (s.kind === K.ROCKET || s.kind === K.MINE || s.kind === K.ORB) explode(hb.x, hb.y, 40, 260);
          shots.splice(i, 1); continue;
        }
      }
      if ((s.x < 0 || s.x > W || s.y < 0 || s.y > H) && s.kind === K.ROCKET) rocketSplash(s, now);
      if (s.x < 0 || s.x > W || s.y < 0 || s.y > H) { explode(clamp(s.x, 0, W), clamp(s.y, 0, H), s.kind === K.ROCKET ? 40 : 10, 160); shots.splice(i, 1); continue; }
      if (s.kind === K.ROCKET) {   // a thick billowing smoke trail with fire licking out of the motor
        const sp = Math.hypot(s.vx, s.vy) || 1, bx = s.x - s.vx / sp * 26, by = s.y - s.vy / sp * 26;
        if (Math.random() < dt * (lowQ ? 30 : 70)) puff(bx, by, -s.vx * 0.08 + (Math.random() - .5) * 50, -s.vy * 0.08 + (Math.random() - .5) * 50, 1.2 + Math.random() * 1.0, 6 + Math.random() * 6, "rgb(120,110,140)", 2);
        if (Math.random() < dt * 60) puff(bx, by, -s.vx * 0.4 + (Math.random() - .5) * 60, -s.vy * 0.4 + (Math.random() - .5) * 60, 0.2 + Math.random() * 0.2, 3 + Math.random() * 3, FIRE_COLS[(Math.random() * 3) | 0]);
      } else if (s.kind === K.LASER) {
        if (Math.random() < dt * 15) puff(s.x, s.y, (Math.random() - .5) * 40, (Math.random() - .5) * 40, 0.2, 1.5, "#bff9ff");
      } else if (s.kind === K.RAIL) {   // the slug leaves a glowing wake along its whole path
        for (let k = 0; k < 4; k++) { const f = Math.random(); puff(s.px + (s.x - s.px) * f, s.py + (s.y - s.py) * f, (Math.random() - .5) * 30, (Math.random() - .5) * 30, 0.5 + Math.random() * 0.4, 1.6 + Math.random() * 1.6, k % 2 ? "#e9c8ff" : "#ffffff"); }
      } else if (s.kind === K.ORB) {
        if (Math.random() < dt * 40) puff(s.x, s.y, (Math.random() - .5) * 80, (Math.random() - .5) * 80, 0.35, 2 + Math.random() * 2, Math.random() < 0.5 ? "#6fd8ff" : "#ffffff");
      } else if (s.kind === K.SHARD) {
        if (Math.random() < dt * 30) puff(s.x, s.y, -s.vx * 0.05, -s.vy * 0.05, 0.2, 1.5, "#ffc070");
      } else if (s.kind === K.SLUG) {   // the slug drags a short hot trail
        if (Math.random() < dt * 50) puff(s.x, s.y, -s.vx * 0.05, -s.vy * 0.05, 0.25, 2, Math.random() < 0.5 ? "#ffe7a0" : "#ffb43c");
      } else if (s.kind === K.PELLET || s.kind === K.MINE || s.kind === K.BOLT) {
        // pellets are too short-lived for a trail; mines just sit there blinking
      } else if (Math.random() < dt * 40) puff(s.x, s.y, -s.vx * 0.08 + (Math.random() - .5) * 60, -s.vy * 0.08 + (Math.random() - .5) * 60, 0.25 + Math.random() * 0.25, 1.5 + Math.random() * 2, FIRE_COLS[(Math.random() * 4) | 0]);
      // enemy fireball hits me (I decide, then report the shot id)
      const armed = s.kind !== K.MINE || SHOTS[K.MINE].life - s.life >= MINE_ARM;
      if (armed && canHurt(s, me, "me") && segHit(s, me.x, me.y, 12 + 26 * sizeOf(me.lv) + SHOTS[s.kind].r) && (s.kind !== K.RAIL || railOnce(s, "me"))) {
        if (s.kind !== K.RAIL) s.life = 0;
        s.splashed = true;
        shotBurst(s);
        if (SHOTS[s.kind].shove) pelletShove(me, s, SHOTS[s.kind].shove);
        if (s.kind === K.BOLT) boltChain(s, me.x, me.y, "me", now);
        if (hurt(now, shotDmg(s), false, s.kind, Math.atan2(s.vy, s.vx))) {
          pushCapped(hitBy, s.id, 12);
          if (me.dead) { meKilled(s.id); killedBy(s.owner); }
        }
      }
      // someone else's bolt hitting a third pilot can still jump to me or my bots
      if (s.kind === K.BOLT && !s.mine && !s.chained && s.life > 0) for (const [rid, r] of remotes) {
        if (r.inv || botById.has(rid) || !canHurt(s, r, rid)) continue;
        if (segHit(s, r.x, r.y, 16 + 26 * sizeOf(r.lv || 1))) { s.life = 0; boltChain(s, r.x, r.y, rid, now); break; }
      }
      // my fireball reaches another bin: fizzle here, they confirm the hit
      if (s.mine && s.life > 0) for (const [rid, r] of remotes) {
        if (botById.has(rid)) continue;
        if (r.inv || !canHurt(s, r, rid)) continue;
        if (armed && segHit(s, r.x, r.y, 16 + 26 * sizeOf(r.lv || 1) + SHOTS[s.kind].r)) {
          if (s.kind === K.RAIL) { if (railOnce(s, rid)) { shotBurst(s); hitConfirm(s, r.lv, r.x, r.y); } continue; }
          s.life = 0; shotBurst(s); hitConfirm(s, r.lv, r.x, r.y); if (s.kind === K.BOLT) boltChain(s, r.x, r.y, rid, now); break;
        }
      }
    }
    while (myShotLog.length && now - myShotLog[0].at > 700) myShotLog.shift();

    // space junk
    for (let i = 0; i < ROCKS; i++) {
      const k = world.rocks[i];
      if (grabbed.has(k.key) || k.age < 0.6) continue;
      for (const s of shots) {
        if (s.life <= 0 || s.kind === K.NUKE || !segHit(s, k.x, k.y, k.r + 10)) continue;
        if (s.kind !== K.RAIL) s.life = 0;
        impact(s.x, s.y, "#d9c8ff", 1);
        if (s.mine) {
          grabbed.add(k.key); pushCapped(myGrabs, k.key, 40);
          me.score += 2; showScore();
          floaters.push({ x: k.x, y: k.y, t: 0, txt: "+2", gold: false });
          explode(k.x, k.y, 30, 220); sfx("chunk", 0.5, 1.3, k.x, k.y) || blip(300, 0.2, "square");
        }
        break;
      }
      if (grabbed.has(k.key)) continue;
      if (playing && !me.dead && Math.hypot(wrapD(k.x - me.x, W), wrapD(k.y - me.y, H)) < k.r + 26 * sizeOf(me.lv) && now >= me.inv && now >= (me.hazardAt || 0)) {
        grabbed.add(k.key); pushCapped(myGrabs, k.key, 40);
        explode(k.x, k.y, 30, 220);
        impact((k.x + me.x) / 2, (k.y + me.y) / 2, "#ffb43c", 1.5);
        hurt(now, 0.5);
      }
    }

    updateEvents(dt, now);

    updateBots(dt, now);
    ctfTick(now);

    // shared clock: drift smoothly toward the average offset
    let offSum = 0, offN = 1;
    for (const r of remotes.values()) if (Number.isFinite(r.off)) { offSum += r.off; offN++; }
    clockTarget = offSum / offN;
    clockOff += (clockTarget - clockOff) * Math.min(1, dt * 0.5);

    // remotes: extrapolate + ease toward reported spot
    for (const [rid, r] of remotes) {
      if (now - r.seen > 7000) { remotes.delete(rid); continue; }
      r.tx = clamp(r.tx + r.vx * dt, 0, W); r.ty = clamp(r.ty + r.vy * dt, 0, H);
      const corr = 1 - Math.exp(-12 * dt);
      r.x = clamp(r.x + r.vx * dt + (r.tx - r.x) * corr, 0, W);
      r.y = clamp(r.y + r.vy * dt + (r.ty - r.y) * corr, 0, H);
      r.a = lerpAng(r.a, r.ta, 1 - Math.exp(-14 * dt));
      if (r.dead) continue;
      if (Math.abs(r.x - me.x) < vw / 2 + 300 && Math.abs(r.y - me.y) < vh / 2 + 300) { trailFrom(r, 0.6 + r.thrust * 1.4 + (r.boost || 0) * 1.5, dt); damageFx(r, dt); afterburner(r, r.boost || 0, dt); }
      // boop
      const dx = wrapD(me.x - r.x, W), dy = wrapD(me.y - r.y, H), d = Math.hypot(dx, dy);
      if (playing && !me.dead && d < 31 * (sizeOf(me.lv) + sizeOf(r.lv || 1)) && d > 0.01 && (!r.boop || now - r.boop > 400)) {
        r.boop = now;
        const rammed = (r.boost || 0) > 0, mineRam = me.boostFx > 0;
        const kick = rammed ? 900 : mineRam ? 260 : 420;
        me.vx += dx / d * kick; me.vy += dy / d * kick;
        impact(me.x - dx / 2, me.y - dy / 2, "#bdfff6", 1.2);
        if (rammed || mineRam) { sparkShower(me.x - dx / 2, me.y - dy / 2, -dy, dx, 1.3); sparkShower(me.x - dx / 2, me.y - dy / 2, dy, -dx, 1.3); shake = Math.max(shake, 0.4); }
        sfx("ram", rammed ? 1 : 0.6) || blip(rammed ? 120 : 220, 0.2, "square");
        // they rammed me on boost: I take the damage and report it so they get the credit
        if (rammed && r.tag && !mates(r, me)) {
          const id = r.tag + ".ram" + Math.floor(now);
          if (hurt(now, r.boost === 2 ? 1.2 : 0.6)) {
            pushCapped(hitBy, id, 12);
            if (me.dead) { meKilled(id); killedBy(rid); }
          }
        }
      }
    }

    // sparks
    if (playing && !me.dead) {
      for (let i = 0; i < SLOTS; i++) {
        const s = world.sparks[i];
        if (grabbed.has(s.key) || s.age < 0.04) continue;
        if (Math.hypot(wrapD(s.x - me.x, W), wrapD(s.y - me.y, H)) < 22 + 30 * sizeOf(me.lv)) {
          grabbed.add(s.key); pushCapped(myGrabs, s.key, 40);
          const val = s.gold ? 5 : 1;
          me.score += val;
          showScore();
          floaters.push({ x: s.x, y: s.y, t: 0, txt: "+" + val, gold: s.gold });
          gainXp(val, now);
          for (let k = 0; k < (s.gold ? 30 : 14); k++) {
            const a = Math.random() * 6.28, v = 60 + Math.random() * 200;
            puff(s.x, s.y, Math.cos(a) * v, Math.sin(a) * v, 0.5 + Math.random() * 0.6, 1.5 + Math.random() * 2, s.gold ? "#ffd36b" : "#ffffff");
          }
          blip(s.gold ? 660 : 880, s.gold ? 0.3 : 0.12);
        }
      }
    }
    // spilled stars
    for (const [id, d] of drops) {
      if (now - d.born > DROP_LIFE) { drops.delete(id); continue; }
      if (!playing || me.dead) continue;
      for (let j = 0; j < d.n; j++) {
        const st = dropStar(d, id, j, now);
        if (!st.ready || grabbed.has(st.key)) continue;
        if (Math.hypot(st.x - me.x, st.y - me.y) < 22 + 30 * sizeOf(me.lv)) {
          grabbed.add(st.key); pushCapped(myGrabs, st.key, 40);
          me.score += 1; showScore();
          for (let k = 0; k < 8; k++) { const a = Math.random() * 6.28; puff(st.x, st.y, Math.cos(a) * 120, Math.sin(a) * 120, 0.4, 1.8, "#ffe3f6"); }
          blip(990, 0.06);
          gainXp(1, now);
        }
      }
    }
    // medkits and shields (left on the ground when they would do nothing, like in Doom)
    if (playing && !me.dead) {
      for (const c of world.supplies) {
        if (grabbed.has(c.key) || c.age < 0.05) continue;
        if (Math.hypot(c.x - me.x, c.y - me.y) > 26 + 30 * sizeOf(me.lv)) continue;
        const sp = SUPPLIES[c.type], maxL = maxLivesOf(me.lv);
        if (sp.heal && me.lives >= maxL) continue;
        if (sp.armor && me.shield >= MAX_SHIELD) continue;
        grabbed.add(c.key); pushCapped(myGrabs, c.key, 40);
        if (sp.heal) { me.lives = Math.min(maxL, me.lives + sp.heal); renderHearts(false); }
        if (sp.armor) { me.shield = Math.min(MAX_SHIELD, me.shield + sp.armor); renderShield(); }
        floaters.push({ x: c.x, y: c.y - 20, t: 0, txt: "+" + Math.round((sp.heal || sp.armor) / maxLivesOf(me.lv) * 100) + "% " + (sp.heal ? "health" : "armour"), gold: !!sp.big });
        for (let k = 0; k < 26; k++) { const a = Math.random() * 6.28, v = 80 + Math.random() * 200; puff(c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, 0.6, 2.2, sp.col); }
        impacts.push({ x: c.x, y: c.y, t: 0, r: 70, col: sp.col });
        if (!sfx(sp.heal ? "heal" : "shield_get", 0.8)) [523, 784].forEach((f, j) => setTimeout(() => blip(f, 0.14, "triangle"), j * 70));
      }
    }
    // Overdrive
    if (playing && !me.dead && world.amp && !grabbed.has(world.amp.key) && Math.hypot(world.amp.x - me.x, world.amp.y - me.y) < 30 + 30 * sizeOf(me.lv)) {
      const c = world.amp;
      grabbed.add(c.key); pushCapped(myGrabs, c.key, 40);
      me.ampUntil = now + AMP_TIME;
      announce("OVERDRIVE", "triple damage for 20 seconds", "#c38bff", 4);
      for (let k = 0; k < 50; k++) { const a = Math.random() * 6.28, v = 100 + Math.random() * 300; puff(c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, 0.8, 2.5, k % 2 ? "#c38bff" : "#ffffff"); }
      rings.push({ x: c.x, y: c.y, t: 0, r: 260, col: "195,139,255", warp: true, dur: 0.6, w: 14 });
    }
    // weapon crates
    if (playing && !me.dead) {
      for (const c of world.nuke ? [...world.picks, world.nuke] : world.picks) {
        if (grabbed.has(c.key) || c.age < (c.type === "nuke" ? 0.01 : 0.05)) continue;
        if (Math.hypot(c.x - me.x, c.y - me.y) < 26 + 30 * sizeOf(me.lv)) {
          grabbed.add(c.key); pushCapped(myGrabs, c.key, 40);
          const w = WEAPONS[c.type];
          const had = !!me.arsenal[c.type];   // a gun you already carry just gets more ammo; a new one goes straight into your hands
          me.arsenal[c.type] = Math.min(w.ammo * 2, (me.arsenal[c.type] || 0) + w.ammo);
          if (!had) me.weapon = c.type;
          renderWeapon();
          floaters.push({ x: c.x, y: c.y - 20, t: 0, txt: had ? "+AMMO " + w.name.toUpperCase() : w.name.toUpperCase() + "!", gold: true });
          for (let k = 0; k < 30; k++) { const a = Math.random() * 6.28, v = 80 + Math.random() * 220; puff(c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, 0.6, 2.2, w.col); }
          if (!sfx("weapon_get", 0.8)) [440, 660, 880].forEach((f, j) => setTimeout(() => blip(f, 0.1, "square"), j * 60));
        }
      }
    }
    if (grabbed.size > 600) { const keep = [...grabbed].slice(-300); grabbed.clear(); keep.forEach(k => grabbed.add(k)); }

    // flying through smoke and sparks shoves them aside (faster = harder)
    const meSp = Math.hypot(me.vx, me.vy), pushR = 46 * sizeOf(me.lv), pushR2 = pushR * pushR, canPush = playing && !me.dead && meSp > 60;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt;
      if (canPush && p.k !== 1) {
        const dx = p.x - me.x, dy = p.y - me.y, d2 = dx * dx + dy * dy;
        if (d2 < pushR2 && d2 > 1) { const d = Math.sqrt(d2), v = meSp * 0.8 + 80; p.vx = dx / d * v + me.vx * 0.3; p.vy = dy / d * v + me.vy * 0.3; }
      }
      if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const damp = p.k === 2 ? 0.93 : 0.97;
      p.vx *= damp; p.vy *= damp;
    }
    const partCap = lowQ ? MAX_PARTS / 3 : MAX_PARTS;
    if (parts.length > partCap) parts.splice(0, parts.length - partCap);
    updateMelts(dt);
    for (let i = hulks.length - 1; i >= 0; i--) {
      const h = hulks[i];
      h.life -= dt;
      if (h.life <= 0) { hulks.splice(i, 1); continue; }
      const drag = Math.exp(-0.015 * dt);   // space: practically no drag
      h.x += h.vx * dt; h.y += h.vy * dt; h.vx *= drag; h.vy *= drag; h.a += h.spin * dt;
      bounceOff(h, 30 * sizeOf(h.lv), 0.8);
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
        const push = Math.max(160, Math.hypot(me.vx, me.vy) * 0.8);
        me.vx += dx / d * 260; me.vy += dy / d * 260; h.vx -= dx / d * push; h.vy -= dy / d * push; h.spin += (Math.random() - 0.5) * 2;
        impact(me.x - dx / 2, me.y - dy / 2, "#d9c8ff", 1.2);
        if (push > 300) sparkShower(me.x - dx / 2, me.y - dy / 2, -dy, dx, 0.8);
        sfx("crash", 0.6) || blip(180, 0.15, "square");
      }
    }
    for (let i = frags.length - 1; i >= 0; i--) {
      const f = frags[i];
      f.life -= dt;
      if (f.life <= 0) { frags.splice(i, 1); continue; }
      const drag = Math.exp(-0.015 * dt);
      f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= drag; f.vy *= drag; f.a += f.spin * dt;
      // you can shove the pieces around
      const fdx = f.x - me.x, fdy = f.y - me.y, fd = Math.hypot(fdx, fdy), fr = 30 * sizeOf(me.lv) + f.s * 0.3;
      if (playing && !me.dead && fd < fr && fd > 0.01 && (!f.bump || now - f.bump > 250)) {
        f.bump = now;
        const push = Math.max(140, Math.hypot(me.vx, me.vy) * 0.9);
        f.vx += fdx / fd * push; f.vy += fdy / fd * push; f.spin += (Math.random() - 0.5) * 3;
        impact((f.x + me.x) / 2, (f.y + me.y) / 2, "#d9c8ff", 0.7);
      }
      bounceOff(f, f.s * 0.25, 0.8);
      if (f.x < 0 || f.x > W) { f.vx = -f.vx; f.x = clamp(f.x, 0, W); }
      if (f.y < 0 || f.y > H) { f.vy = -f.vy; f.y = clamp(f.y, 0, H); }
      if ((now - f.born) / 1000 < 4 && Math.random() < (lowQ ? 3 : 8) * dt) puff(f.x, f.y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 1.4, 3 + Math.random() * 3, "rgb(60,54,72)", 2);
    }
    for (const s of shots) {
      if (s.life <= 0 || s.kind === K.NUKE || s.kind === K.MINE) continue;
      for (const o of hulks) if (segHit(s, o.x, o.y, 34 * sizeOf(o.lv)) && (s.kind !== K.RAIL || railOnce(s, o))) { o.vx += s.vx * (s.kind === K.RAIL ? 0.03 : 0.08); o.vy += s.vy * (s.kind === K.RAIL ? 0.03 : 0.08); o.spin += (Math.random() - 0.5); if (s.kind !== K.RAIL) s.life = 0; impact(s.x, s.y, "#d9c8ff", 0.8); break; }
      if (s.life <= 0) continue;
      for (const o of frags) if (segHit(s, o.x, o.y, o.s * 0.3)) { o.vx += s.vx * 0.12; o.vy += s.vy * 0.12; o.spin += (Math.random() - 0.5) * 2; s.life = 0; impact(s.x, s.y, "#d9c8ff", 0.6); break; }
    }
    // wreckage drifts (almost no drag in space), spins, bounces off the fence, smoulders at first
    const drift = Math.exp(-0.015 * dt);
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.life -= dt;
      if (d.life <= 0) { debris.splice(i, 1); continue; }
      d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= drift; d.vy *= drift; d.rot += d.vr * dt;
      bounceOff(d, 4, 0.8);
      if (d.x < 0 || d.x > W) { d.vx = -d.vx; d.x = clamp(d.x, 0, W); }
      if (d.y < 0 || d.y > H) { d.vy = -d.vy; d.y = clamp(d.y, 0, H); }
      const ddx = d.x - me.x, ddy = d.y - me.y, dd = Math.hypot(ddx, ddy);
      if (playing && !me.dead && dd < 34 * sizeOf(me.lv) && dd > 0.01) { const pv = Math.max(120, Math.hypot(me.vx, me.vy)); d.vx = ddx / dd * pv; d.vy = ddy / dd * pv; d.vr += (Math.random() - 0.5) * 4; }
      if ((now - d.born) / 1000 < 3 && Math.random() < (lowQ ? 1 : 3) * dt) puff(d.x, d.y, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 1.2, 2 + Math.random() * 2, "rgb(80,72,98)", 2);
    }
    for (let i = impacts.length - 1; i >= 0; i--) { impacts[i].t += dt; if (impacts[i].t > 0.22) impacts.splice(i, 1); }
    for (let i = beams.length - 1; i >= 0; i--) { beams[i].t += dt; if (beams[i].t > BEAM_T) beams.splice(i, 1); }
    for (let i = arcs.length - 1; i >= 0; i--) { arcs[i].t += dt; if (arcs[i].t > 0.3) arcs.splice(i, 1); }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > (rings[i].dur || 0.6)) rings.splice(i, 1); }
    for (let i = booms.length - 1; i >= 0; i--) { booms[i].t += dt; if (booms[i].t > BOOM_LIFE) booms.splice(i, 1); }
    // nuke aftershocks: smaller blasts popping around the blast zone for a second
    for (let i = aftershocks.length - 1; i >= 0; i--) {
      const a = aftershocks[i];
      if (now < a.at) continue;
      aftershocks.splice(i, 1);
      explode(a.x, a.y, lowQ ? 12 : 30, 300);
      impacts.push({ x: a.x, y: a.y, t: 0, r: 110, col: "#ff9a2e" });
      sfx("boom_small", 0.7, 0.8, a.x, a.y) || blip(70 + Math.random() * 40, 0.3, "sawtooth");
    }
    flash = Math.max(0, flash - dt * 1.4);
    for (let i = floaters.length - 1; i >= 0; i--) { floaters[i].t += dt; if (floaters[i].t > 1) floaters.splice(i, 1); }

    sendAcc += dt; slowAcc += dt;
    if (playing && sendAcc >= 1 / net.hz) {
      sendAcc = 0;
      const msg = {
        q: ++sendSeq, ts: Date.now(), x: Math.round(me.x), y: Math.round(me.y),
        vx: Math.round(me.vx), vy: Math.round(me.vy), a: +me.a.toFixed(2),
        t: me.thrust > 0.3 ? 1 : 0, b: me.boostFx, d: me.dead ? 1 : 0, i: now < me.inv ? 1 : 0, ds: me.dead ? me.ds : 0,
        dk: me.dead ? me.dk : 0, da: me.dead ? +me.da.toFixed(2) : 0
      };
      const slow = {
        tm: me.tm ?? -1, fc: me.fc ?? -1, cp: [stats.round, me.caps || 0],
        tg: myTag, n: me.name, h: me.hue, ck: me.ck, s: me.score, l: Math.round(me.lives * 100) / 100, am: me.ampUntil > now ? 1 : 0, lv: me.lv, sh: Math.round(me.shield * 100) / 100, wp: WEAPON_KEYS.indexOf(me.weapon), g: myGrabs, hb: hitBy, ko: koBy,
        st: [stats.round, stats.kills, stats.deaths, stats.shots, stats.hits, stats.best],
        cv: myCarves.filter(e => performance.now() - e.at < 4000).map(e => e.d),
        dr: myDrops.filter(d => Date.now() - d[4] < DROP_LIFE).slice(-3).map(d => d.slice(0, 4))
      };
      const sig = JSON.stringify(slow);
      if ((sig !== lastSlow && slowAcc >= 0.1) || slowAcc >= 1) { Object.assign(msg, slow); lastSlow = sig; slowAcc = 0; }
      // always send the list when shots ride in the state, even empty: the Claude room merges presence
      // field by field, so an omitted "f" would keep old shots there forever and they could come back as ghosts
      if (net.shotsInState) msg.f = myShotLog.slice(-9).map(e => e.d);
      if (bots.length) {
        const bs = botStates(now);
        if (standalone) msg.bots = bs;   // the Claude room's presence is too small for bots: they stay local there
      }
      net.send(msg);
    }
    boardAcc += dt;
    if (boardAcc > 0.5) { boardAcc = 0; renderBoard(); renderFeed(); }
  }

  const boardEl = document.getElementById("board");
  // everyone's numbers for the current round (others' come from their latest state)
  function playerRows() {
    const rows = [{ name: me.name || "You", hue: me.hue, me: true, score: me.score, kills: stats.kills, deaths: stats.deaths, shots: stats.shots, hits: stats.hits, best: stats.best, tm: me.tm, caps: me.caps || 0 }];
    for (const r of remotes.values()) {
      const st = r.st && r.st[0] === stats.round ? r.st : [0, 0, 0, 0, 0, 0];
      rows.push({ name: r.name, hue: r.hue, score: r.score, kills: st[1], deaths: st[2], shots: st[3], hits: st[4], best: st[5], tm: r.tm, caps: r.cpRound === stats.round ? r.caps || 0 : 0 });
    }
    return rows;
  }
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const acc = r => r.shots ? Math.round(r.hits / r.shots * 100) : 0;
  function teamWinLine() {
    if (!isTeams()) return "";
    const t = teamTotals(), flags = MODES[MODE].flags, sc = i => flags ? t.c[i] + " flags, " + t.k[i] + " kills" : t.k[i] + " kills";
    if (!t.lead) return "A draw · " + sc(0) + " each side";
    const w = t.lead > 0 ? 0 : 1;
    return `<span style="color:${TEAM_HEX[w]}">${TEAM_NAME[w]} team wins</span> · ${sc(w)} to ${sc(1 - w)}`;
  }
  function showResults(roundNo) {
    const rows = playerRows().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    const top = rows[0];
    const shooters = rows.filter(r => r.shots >= 10);
    const pick = (list, f) => list.length ? list.reduce((a, b) => f(b) > f(a) ? b : a) : null;
    const awards = [
      ["Most kills", pick(rows, r => r.kills), r => r.kills + " kills"],
      ["Sharpshooter", pick(shooters, r => acc(r)), r => acc(r) + "% of shots hit"],
      ["Stormtrooper", shooters.length > 1 ? pick(shooters, r => -acc(r)) : null, r => "only " + acc(r) + "% hit"],
      ["Untouchable", rows.length > 1 ? pick(rows, r => -r.deaths) : null, r => r.deaths + " deaths"],
      ["Rampage", pick(rows, r => r.best), r => r.best + " kills in a row"],
      ["Kamikaze", rows.length > 1 ? pick(rows, r => r.deaths) : null, r => r.deaths + " deaths"]
    ].filter(([, who]) => who);
    const card = document.getElementById("resultsCard");
    card.innerHTML = `<h2>Round ${roundNo} over</h2>
      <div class="winner">${teamWinLine() || (top.kills ? "Winner: " + esc(top.name) + " · " + top.kills + " kills" : "Nobody scored a kill")}</div>
      <table><thead><tr><th>Pilot</th><th>Kills</th><th>Deaths</th><th>Accuracy</th></tr></thead><tbody>
      ${rows.map(r => `<tr class="${r.me ? "me" : ""}"><td${isTeams() && onTeam(r) ? ` style="color:${TEAM_HEX[r.tm]}"` : ""}>${esc(r.name)}${r.me ? " (you)" : ""}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.shots ? acc(r) + "%" : "–"}</td></tr>`).join("")}
      </tbody></table>
      <div class="awards">${awards.map(([title, who, why]) => `<div class="award"><b>${title}</b><span>${esc(who.name)}</span><small>${why(who)}</small></div>`).join("")}</div>
      <div class="next" id="nextRound"></div>`;
    document.getElementById("results").hidden = false;
  }

  // round bookkeeping, run every frame
  let shownRound = -1, resultsFor = -1, resultsAt = 0, preparedFor = -1;
  // the round is over: the announcer tells you how it went (only when someone else took part)
  function roundEndVoice() {
    const rows = playerRows();
    if (rows.length < 2) return;
    const top = rows.reduce((a, b) => b.kills > a.kills || (b.kills === a.kills && b.deaths < a.deaths) ? b : a);
    const won = isTeams() ? (teamTotals().lead || 0) * (me.tm === 0 ? 1 : -1) > 0 : top.me && stats.kills > 0;
    setTimeout(() => sfx(won ? (stats.deaths === 0 ? "v_flawless" : "v_win") : "v_lose", 1), 600);
  }
  function roundTick(now) {
    const rd = roundAt(clockNow());
    if (rd.idx !== stats.round) {
      // a new round: everyone starts from scratch
      Object.assign(stats, { round: rd.idx, kills: 0, deaths: 0, shots: 0, hits: 0, streak: 0, best: 0 });
      if (shownRound !== -1 && playing) {
        me.score = 0; showScore(); me.xp = 0; me.lv = 1; renderLevel();
        baseArsenal(); me.ampUntil = 0; renderWeapon();
        if (!me.dead) { me.lives = maxLivesOf(1); me.shield = 0; renderShield(); renderHearts(false); me.inv = now + 2000; }
        floaters.push({ x: me.x, y: me.y - 90, t: 0, txt: "ROUND " + (rd.idx % 1000) + " · FIGHT!", gold: true });
        sfx("v_fight", 1);
      }
      for (const b of bots) Object.assign(b, { st: { kills: 0, deaths: 0, shots: 0, hits: 0, streak: 0, best: 0 }, lives: LIVES, dead: false, ...spawnPoint(b.tm), inv: now + 2000, fc: -1, caps: 0, weapon: "fire" });
      me.fc = -1; me.caps = 0;
      hulks.length = 0; frags.length = 0; debris.length = 0; melts.length = 0;
      if (shownRound !== -1) { myCarves.length = 0; seenCarves.clear(); buildPlanets(worldCode); }   // every crater filled in again
      firstBlood = false; streaks.clear(); multi = 0;
      shownRound = rd.idx;
      document.getElementById("results").hidden = true;
    }
    roundLive = rd.live;
    const info = document.getElementById("roundInfo");
    if (rd.live) {
      const m = Math.floor(rd.left / 60), sec = Math.floor(rd.left % 60);
      info.textContent = "Round " + (rd.idx % 1000) + " · " + m + ":" + String(sec).padStart(2, "0");
      info.classList.toggle("last", rd.left < 30);
    } else {
      info.textContent = "Results · next round in " + Math.ceil(ROUND_LEN - rd.ph) + "s";
      if (playing && resultsFor !== rd.idx) roundEndVoice();
      if (playing && ROUND_LEN - rd.ph < 2.6 && preparedFor !== rd.idx) { preparedFor = rd.idx; sfx("v_prepare", 1); }
      // refresh once a second so late state updates from other pilots still land in the table
      if (playing && (resultsFor !== rd.idx || now - resultsAt > 1000)) { resultsFor = rd.idx; resultsAt = now; showResults(rd.idx % 1000); }
      const nx = document.getElementById("nextRound");
      if (nx) nx.textContent = "Next round in " + Math.ceil(ROUND_LEN - rd.ph) + " s";
    }
  }
  // team totals: kills, and flags captured
  function teamTotals() {
    const k = [0, 0], c = [0, 0];
    for (const r of playerRows()) if (onTeam(r)) { k[r.tm] += r.kills; c[r.tm] += r.caps; }
    return { k, c, lead: MODES[MODE].flags ? (c[0] - c[1] || k[0] - k[1]) : k[0] - k[1] };
  }
  function renderBoard() {
    const rows = playerRows();
    rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || b.score - a.score);
    const shown = rows.slice(0, 8);
    if (!shown.some(r => r.me)) shown[7] = rows.find(r => r.me);
    const team = [];
    if (isTeams()) {   // the two teams first: kills, or captures in CTF
      const t = teamTotals(), flags = MODES[MODE].flags;
      for (const i of [0, 1]) {
        const li = document.createElement("li"); li.className = "team";
        const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = TEAM_NAME[i] + " team"; nm.style.color = TEAM_HEX[i];
        const pts = document.createElement("span"); pts.className = "pts"; pts.textContent = flags ? t.c[i] + " flags · " + t.k[i] : String(t.k[i]);
        li.append(nm, pts); team.push(li);
      }
    }
    boardEl.replaceChildren(...team, ...shown.map(r => {
      const li = document.createElement("li"); if (r.me) li.className = "me";
      const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = r.name; nm.style.color = isTeams() && onTeam(r) ? TEAM_HEX[r.tm] : `hsl(${r.hue} 90% 80%)`;
      const pts = document.createElement("span"); pts.className = "pts"; pts.textContent = r.kills + " · " + r.deaths;
      li.append(nm, pts); return li;
    }));
  }

