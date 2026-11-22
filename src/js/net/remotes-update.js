  // the shared clock and the other pilots: extrapolated and eased toward their reported spots
  function updateRemotes(dt, now) {
    // shared clock: drift smoothly toward the average offset
    let offSum = 0, offN = 1;
    for (const r of remotes.values()) if (Number.isFinite(r.off)) { offSum += r.off; offN++; }
    clockTarget = clockBase + offSum / offN;
    clockOff += (clockTarget - clockOff) * Math.min(1, dt * 0.5);

    // remotes: extrapolate + ease toward reported spot
    for (const [rid, r] of remotes) {
      if (!botById.has(rid) && now - r.seen > 7000) { removeRemote(rid); continue; }
      if (serverRun && r.buf?.length) serverInterp(r);   // the server's pilots: between two of its snapshots
      else {
      const predict = now - r.seen < 250 ? dt : 0; // packet loss must not make a ghost fly through the whole map
      r.tx = clamp(r.tx + r.vx * predict, 0, W); r.ty = clamp(r.ty + r.vy * predict, 0, H);
      const corr = 1 - Math.exp(-12 * dt);
      r.x = clamp(r.x + r.vx * predict + (r.tx - (r.x + r.vx * predict)) * corr, 0, W);
      r.y = clamp(r.y + r.vy * predict + (r.ty - (r.y + r.vy * predict)) * corr, 0, H);
      r.a = lerpAng(r.a, r.ta, 1 - Math.exp(-14 * dt));
      }
      if (r.dead) continue;
      if (Math.abs(r.x - me.x) < vw / 2 + 300 && Math.abs(r.y - me.y) < vh / 2 + 300) { trailFrom(r, 0.6 + r.thrust * 1.4 + (r.boost || 0) * 1.5, dt); damageFx(r, dt); emitPlume(r, dt, (r.boost || 0) > 0); }
      // boop
      const dx = wrapD(me.x - r.x, W), dy = wrapD(me.y - r.y, H), d = Math.hypot(dx, dy);
      // touching another pilot's bin: struck by weight (binContacts' rules), only my bin moved here (theirs is theirs,
      // or the server's); on the server its own contact is the one that counts, mine only shows it at once
      if (playing && !me.dead && d < 31 * (sizeOf(me.lv) + sizeOf(r.lv || 1)) && d > 0.01) {
        const nx = dx / d, ny = dy / d, ma = binMass(me.lv), mr = binMass(r.lv), over = 31 * (sizeOf(me.lv) + sizeOf(r.lv || 1)) - d;
        me.x += nx * over * mr / (ma + mr); me.y += ny * over * mr / (ma + mr);
        const vn = (me.vx - (r.vx || 0)) * nx + (me.vy - (r.vy || 0)) * ny;
        if (vn < 0) {
          const j = -1.5 * vn / (1 / ma + 1 / mr), dv = j / ma;
          me.vx += j * nx / ma; me.vy += j * ny / ma;
          const rammed = (r.boost || 0) > 0, mineRam = me.boostFx > 0, cx = me.x - dx / 2, cy = me.y - dy / 2;
          impact(cx, cy, "#bdfff6", Math.min(1.6, 0.4 + j / 600));
          if (j > 350) { sparkShower(cx, cy, -dy, dx, Math.min(1.5, j / 600)); sparkShower(cx, cy, dy, -dx, Math.min(1.5, j / 600)); shake = Math.max(shake, Math.min(0.6, j / 1500)); oilSplash(cx, cy, Math.min(16, j / 60), Math.min(420, j * 0.5), me.vx * 0.5, me.vy * 0.5); }
          sfx("ram", Math.min(1, 0.3 + j / 900));
          // what I feel hurts me (offline and between browsers: on the server only its snapshots change my health); if
          // they rammed me, the credit is theirs, and I report it
          const dmg = knockDmg(dv) * (mineRam && !rammed ? 0.4 : 1);
          if (!serverRun && dmg > 0 && !mates(r, me) && roundLive && (!r.knockAt || now - r.knockAt > 300)) {
            r.knockAt = now;
            const id = rammed && !mineRam && r.tag ? r.tag + ".ram" + Math.floor(now) : null;
            if (hurt(now, dmg) && id) { pushCapped(hitBy, id, 12); if (me.dead) { meKilled(id); killedBy(rid); } }
          }
        }
      }
    }
  }
  // sparks, spilled stars, medkits and shields, Overdrive and weapon crates
  const magnet = () => 0;   // perk: pick-ups from further away from Lv 5
