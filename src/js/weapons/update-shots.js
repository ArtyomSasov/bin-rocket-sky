  function updateShots(dt, now) {
    // fireballs
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      // Preserve the final partial step; collision checks (including bots) run before expiry.
      if (s.expireAfterStep) s.life = 0;
      let extra = s.catchup || 0; s.catchup = 0;
      if (s.catchSlow > 0) { const e = Math.min(s.catchSlow, s.catchRate * dt); s.catchSlow -= e; extra += e; }   // made up gradually
      const stepDt = Math.min(Math.max(0, s.life), dt + extra);
      s.stepFrom = now - (dt + extra) * 1000; s.stepTo = s.stepFrom + stepDt * 1000;
      if (s.life > 0) {
        const left = s.life - stepDt;
        s.expireAfterStep = left <= 1e-8;
        s.life = Math.max(1e-4, left);
      }
      if (s.kind === K.PULSE_BOLT && s.life > 0 && Math.random() < (lowQ ? 0.35 : 0.8)) puff(s.x, s.y, s.vx * 0.05 + (Math.random() - 0.5) * 60, s.vy * 0.05 + (Math.random() - 0.5) * 60, 0.18 + Math.random() * 0.2, 1 + Math.random(), Math.random() < 0.5 ? "#9dff5a" : "#e8ffc0", 5, 0, 0, 0.9);   // its trail of motes
      if (s.kind === K.GAMMA && s.life > 0 && Math.random() < (lowQ ? 0.3 : 0.75)) puff(s.x - s.vx / (Math.hypot(s.vx, s.vy) || 1) * 50, s.y - s.vy / (Math.hypot(s.vx, s.vy) || 1) * 50, s.vx * 0.1 + (Math.random() - 0.5) * 50, s.vy * 0.1 + (Math.random() - 0.5) * 50, 0.9 + Math.random() * 0.8, 10 + Math.random() * 10, Math.random() < 0.7 ? "#0c0608" : "#2a0a10", 2, 0, (Math.random() - 0.5) * 0.6, 0.96);   // a trail of black smoke
      if (s.kind === K.HOOK) { if (hookStep(s, stepDt, now)) shots.splice(i, 1); continue; }
      if (s.kind === K.NOVA && s.life > 0) { novaZap(s, stepDt, now); if (Math.random() < (lowQ ? 0.4 : 0.9)) puff(s.x + (Math.random() - 0.5) * 20, s.y + (Math.random() - 0.5) * 20, -s.vx * 0.1 + (Math.random() - 0.5) * 80, -s.vy * 0.1 + (Math.random() - 0.5) * 80, 0.25 + Math.random() * 0.25, 1.5 + Math.random() * 1.5, Math.random() < 0.5 ? "#b8ff6a" : "#ffffff", 1, 0.04); }
      if (s.kind === K.SWORD) {   // a sword swing: its bin swings the blade, the crescent sweeps, and the blade cuts as it goes
        const sh = s.mine || (serverRun && s.owner === srv.id) ? me : botById.get(s.owner) || remotes.get(s.owner);
        if (!sh || sh.dead) { s.life = 0; shots.splice(i, 1); continue; }
        if (!s.swung) { s.swung = true; s.sa = Math.atan2(s.vy, s.vx); swingStart(sh); }
        s.vx = s.vy = 0; s.traced = true; swordSweep(s, sh);   // (traced: its line is set here, not flown)
        // the blade cuts what it sweeps through: rock, walls, crates (a narrow cut along it), with sparks where it bites
        if (s.lastCut === undefined || now - s.lastCut > 25) {
          s.lastCut = now;
          const own = s.mine || botById.has(s.owner) || (serverRun && s.owner === srv.id);
          for (let f = 0.35; f <= 1.0001; f += 0.13) {
            const px = s.px + (s.x - s.px) * f, py = s.py + (s.y - s.py) * f, b = solidAny(px, py);
            if (!b) continue;
            if (own || b.free) carveAt(b, px, py, 16, own);
            if (Math.random() < 0.6) sparkShower(px, py, -(s.y - s.py), s.x - s.px, 0.5);
            if (!s.clanged) { s.clanged = true; bladeClash(clamp((px - me.x) / 900, -1, 1), true); }
          }
        }
      }
      if (s.kind === K.BULLET && !s.cased) {   // a minigun round just fired: its case flies out, and its gun's barrels are spinning
        s.cased = true; const sh = s.mine ? me : remotes.get(s.owner) || botById.get(s.owner);
        if (sh && Math.hypot(sh.x - s.x, sh.y - s.y) < 140) { ejectCasing(s.x, s.y, Math.atan2(s.vy, s.vx), sh.vx || 0, sh.vy || 0); if (sh !== me) sh.spinVis = Math.min(1, (sh.spinVis || 0) + 0.12); }
      }
      if (s.kind === K.DET) { detonateOrb(s); if (s.life <= 0) shots.splice(i, 1); continue; }   // inert: it only sets off its orb
      if (HITSCAN[s.kind] && !s.traced && s.life > 0) traceBeam(s);   // rail, laser, beams: the whole line, this very frame
      if (s.kind === K.MDET) { detonateMines(s); if (s.life <= 0) shots.splice(i, 1); continue; }   // ...and this one its pilot's mines
      if (s.kind === K.MINE && s.trigAt && now >= s.trigAt) s.life = 0;   // a triggered mine goes off
      if (s.life <= 0 && s.kind === K.FLAK) flakBurst(s);
      if (s.life <= 0) { if (SPLASH[s.kind]) splash(s, now); if (BOMBS[s.kind]) detonate(s, now); shots.splice(i, 1); continue; }
      if (s.kind === K.MINE) {
        if (s.stuck) mineStick(s); else { const k = Math.exp(-1.6 * stepDt); s.vx *= k; s.vy *= k; }   // a prox mine slows in flight, then rides the rock it stuck to
        if (!s.trigAt && SHOTS[K.MINE].life - s.life >= MINE_ARM) {   // armed: an enemy coming within reach sets it ticking
          let near = canHurt(s, me, "me") && playing && Math.hypot(me.x - s.x, me.y - s.y) < 150;
          if (!near) for (const [rid, r] of remotes) if (canHurt(s, r, rid) && Math.hypot(r.x - s.x, r.y - s.y) < 150 + BIN_R * 0.5) { near = true; break; }
          if (near) { s.trigAt = now + 250; packPlay("p_tick_mine", 0.8, s.x, s.y); }
        }
      }
      if (s.kind === K.GREN) { const k = Math.exp(-0.7 * stepDt); s.vx *= k; s.vy *= k; }   // a grenade slows as it flies
      if (s.kind === K.VOID) { const k = Math.exp(-1.6 * stepDt); s.vx *= k; s.vy *= k; }   // the void bomb too, and bursts where it is after 1.4 s (about 560 px)
      if (s.kind === K.NUKE) { const v = Math.hypot(s.vx, s.vy), nv = Math.min(720, v + 260 * stepDt); s.vx *= nv / v; s.vy *= nv / v; }
      if (!s.traced) { s.px = s.x; s.py = s.y; s.x += s.vx * stepDt; s.y += s.vy * stepDt; }   // a traced beam already spans its whole line
      if (!s.traced && !pierces(s) && !SHOTS[s.kind].inert && s.kind !== K.MINE) {
        const v = Math.hypot(s.vx, s.vy) || 1, L = firstBinAlong(s, v * stepDt);
        const full = v * stepDt;
        if (full > 0) s.stepTo = s.stepFrom + (s.stepTo - s.stepFrom) * L / full;
        s.x = s.px + s.vx / v * L; s.y = s.py + s.vy / v * L;
      }
      if ((s.kind === K.NUKE || s.kind === K.VOID) && (s.x < 0 || s.x > W || s.y < 0 || s.y > H || solidAny(s.x, s.y) || nukeTouches(s))) { detonate(s, now); shots.splice(i, 1); continue; }
      if (s.kind === K.HOLY) { holyFlight(s, stepDt); continue; }
      // the demonic orb draws every bin near it gently in (not its own): 900 px round it, strongest close up; a pull a
      // bin can fly out of, but one that bends a fight round it. The same on the server (its pilots) and my own bin here
      if (s.kind === K.GAMMA && s.life > 0) {
        const pull = (o, isOwner) => { if (isOwner || o.dead) return; const dx = s.x - o.x, dy = s.y - o.y, d = Math.hypot(dx, dy); if (d < 900 && d > 30) { const acc = 520 * (1 - d / 900); o.vx += dx / d * acc * stepDt; o.vy += dy / d * acc * stepDt; } };
        for (const b of bots) pull(b, b.id === s.owner);
        if (playing && !me.dead) pull(me, s.mine || (serverRun && s.owner === srv.id));
      }
      if (s.kind === K.NUKE) {
        if (Math.random() < stepDt * 70) puff(s.x, s.y, -s.vx * 0.15 + (Math.random() - .5) * 50, -s.vy * 0.15 + (Math.random() - .5) * 50, 0.9, 3 + Math.random() * 3, Math.random() < 0.5 ? "#8a7fb0" : "#ffe14d");
        continue;
      }
      if (s.kind === K.MINE && !s.stuck && (s.x < 0 || s.x > W || s.y < 0 || s.y > H)) { s.x = clamp(s.x, 0, W); s.y = clamp(s.y, 0, H); s.stuck = { b: null }; packPlay("p_mine_hit", 0.7, s.x, s.y); }   // sticks to the fence
      const bounce = SHOTS[s.kind].bounce;
      if (bounce && s.bn < bounce) {   // shards and saws ricochet off the fence and off planets, losing a bit of speed
        let hit = false;
        if (s.x < 0 || s.x > W) { s.vx = -s.vx; s.x = clamp(s.x, 0, W); hit = true; }
        if (s.y < 0 || s.y > H) { s.vy = -s.vy; s.y = clamp(s.y, 0, H); hit = true; }
        if (hit) { s.bn++; s.vx *= s.kind === K.GREN ? 0.6 : 0.85; s.vy *= s.kind === K.GREN ? 0.6 : 0.85; s.px = s.x; s.py = s.y; impact(s.x, s.y, SHOTS[s.kind].col, 0.5); if (s.kind === K.SHARD) shardRicochet(s); if (s.kind === K.GREN) grenBounce(s); }
      }
      if ((s.kind === K.RAIL || s.kind === K.SHOCK) && s.life > 0) for (const o of shots) {
        if (o.kind === K.ORB && o.life > 0 && !o.combo && segHit(s, o.x, o.y, 45)) { comboBlast(o, s, now); if (s.kind === K.SHOCK) { s.life = 0; break; } }
      }
      // planets, moons, wrecks and rubble: the shot digs a crater where it lands (my shots and my bots' report theirs;
      // others' craters on shared bodies arrive over the network, but anyone's shot chips local rubble)
      const hb = s.stuck || s.traced ? null : shotBody(s);
      if (hb) {
        const own = s.mine || botById.has(s.owner), dig = own || hb.b.free;
        if (s.kind === K.RAIL) {   // a rail slug bores a tunnel straight through and keep going
          if (!s.surfFx) { s.surfFx = true; surfaceHit(hb.b, hb.x, hb.y, K.SLUG); }   // (a rail bores: chips where it goes in)
          if (dig) for (let f = 0; f <= 1.0001; f += 0.125) { const px = s.px + (s.x - s.px) * f, py = s.py + (s.y - s.py) * f; if (solidAt(hb.b, px, py)) carveAt(hb.b, px, py, SHOTS[s.kind].carve, own); }
          impact(hb.x, hb.y, SHOTS[s.kind].col, 0.8);
        } else if (bounce && s.bn < bounce) {   // shards and saws chip and ricochet; grenades just bounce
          if (s.kind !== K.GREN) surfaceHit(hb.b, hb.x, hb.y, K.PELLET);   // (a ricochet chips)
          if (dig && s.kind !== K.GREN) carveAt(hb.b, hb.x, hb.y, SHOTS[s.kind].carve, own);
          const [nx, ny] = normalAt(hb.b, hb.x, hb.y), vn = s.vx * nx + s.vy * ny, keep = s.kind === K.GREN ? 0.6 : 0.85;
          if (vn < 0) { s.vx = (s.vx - 2 * vn * nx) * keep; s.vy = (s.vy - 2 * vn * ny) * keep; }
          if (s.kind === K.GREN) grenBounce(s);
          s.x = hb.x + nx * 4; s.y = hb.y + ny * 4; s.px = s.x; s.py = s.y; s.bn++;
          impact(s.x, s.y, SHOTS[s.kind].col, 0.5);
          if (s.kind === K.SHARD) shardRicochet(s);
        } else {
          if (s.kind !== K.MINE && !s.surfFx) { s.surfFx = true; surfaceHit(hb.b, hb.x, hb.y, s.kind); }
          if (dig && SHOTS[s.kind].carve && s.kind !== K.MINE) carveAt(hb.b, hb.x, hb.y, SHOTS[s.kind].carve, own);   // only the mine attaches; an exhausted saw disappears
          if ((s.kind === K.BULLET || s.kind === K.PELLET) && now - ricAt > 90) { ricAt = now; packPlay("p_ric", 0.4, hb.x, hb.y); }   // whine off the rock
          if (s.kind === K.MINE) {   // a prox mine sticks where it lands, just off the surface
            const [nx, ny] = normalAt(hb.b, hb.x, hb.y), px = hb.x + nx * 10, py = hb.y + ny * 10, [lx, ly] = toLocal(hb.b, px, py);
            s.stuck = { b: hb.b, lx, ly }; s.x = px; s.y = py; s.vx = s.vy = 0;
            packPlay("p_mine_hit", 0.7, hb.x, hb.y);
            continue;
          }
          s.x = hb.x; s.y = hb.y;
          if (s.kind === K.PULSE_BOLT) shotBurst(s);
          if (s.kind === K.SHARD) packPlay("p_ric", .25, s.x, s.y);
          if (s.kind === K.FLAK) { const [nx, ny] = normalAt(hb.b, hb.x, hb.y); s.x += nx * 12; s.y += ny * 12; flakBurst(s); }   // bursts just off the surface
          if (SPLASH[s.kind]) splash(s, now);
          impact(hb.x, hb.y, SHOTS[s.kind].col, s.kind === K.MINE ? 1.6 : 0.8);
          if (s.kind === K.MINE) explode(hb.x, hb.y, 40, 260);
          shots.splice(i, 1); continue;
        }
      }
      if ((s.x < 0 || s.x > W || s.y < 0 || s.y > H) && SPLASH[s.kind]) splash(s, now);
      if (s.x < 0 || s.x > W || s.y < 0 || s.y > H) { if (!SPLASH[s.kind]) explode(clamp(s.x, 0, W), clamp(s.y, 0, H), 10, 160); shots.splice(i, 1); continue; }   // (a blast weapon has had its own)
      if (s.kind === K.ROCKET) {   // a smoke trail with fire licking out of the motor
        const sp = Math.hypot(s.vx, s.vy) || 1, bx = s.x - s.vx / sp * 26, by = s.y - s.vy / sp * 26;
        if (Math.random() < stepDt * (lowQ ? 30 : 70)) puff(bx, by, -s.vx * 0.08 + (Math.random() - .5) * 50, -s.vy * 0.08 + (Math.random() - .5) * 50, 1.2 + Math.random() * 1.0, 6 + Math.random() * 6, "rgb(120,110,140)", 2);
        if (Math.random() < stepDt * 60) puff(bx, by, -s.vx * 0.4 + (Math.random() - .5) * 60, -s.vy * 0.4 + (Math.random() - .5) * 60, 0.2 + Math.random() * 0.2, 3 + Math.random() * 3, FIRE_COLS[(Math.random() * 3) | 0]);
      } else if (s.kind === K.SHOCK || s.kind === K.MELEE) {
        // a beam is drawn as a beam; a blade's touch isn't seen
      } else if (s.kind === K.RAIL) {   // the slug leaves a glowing wake along its whole path
        for (let k = 0; k < 4; k++) { const f = Math.random(); puff(s.px + (s.x - s.px) * f, s.py + (s.y - s.py) * f, (Math.random() - .5) * 30, (Math.random() - .5) * 30, 0.5 + Math.random() * 0.4, 1.6 + Math.random() * 1.6, k % 2 ? "#ffb070" : "#ffffff"); }
      } else if (s.kind === K.ORB) {   // a plasma wake: glowing motes peeling off, and crackle
        if (Math.random() < stepDt * (lowQ ? 40 : 90)) puff(s.x + (Math.random() - .5) * 30, s.y + (Math.random() - .5) * 30, -s.vx * 0.15 + (Math.random() - .5) * 60, -s.vy * 0.15 + (Math.random() - .5) * 60, 0.5 + Math.random() * 0.4, 2.5 + Math.random() * 3, Math.random() < 0.6 ? "#6fd8ff" : "#ffffff");
      } else if (s.kind === K.SHARD) {   // a hot trail that grows with every ricochet
        if (Math.random() < stepDt * (40 + s.bn * 25)) puff(s.x, s.y, -s.vx * 0.05, -s.vy * 0.05, 0.25 + s.bn * 0.05, 2 + s.bn * 0.6, s.bn ? "#ffe0a0" : "#ffc070");
      } else if (s.kind === K.PELLET || s.kind === K.MINE) {
        // pellets are too short-lived for a trail; mines just sit there blinking
      } else if (Math.random() < stepDt * 40) puff(s.x, s.y, -s.vx * 0.08 + (Math.random() - .5) * 60, -s.vy * 0.08 + (Math.random() - .5) * 60, 0.25 + Math.random() * 0.25, 1.5 + Math.random() * 2, FIRE_COLS[(Math.random() * 4) | 0]);
      // a round that only just misses me whizzes by
      if (!s.mine && !s.whiz && playing && !me.dead && (s.kind === K.BULLET || s.kind === K.PELLET || s.kind === K.SHARD || s.kind === K.RAIL) && now - whizAt > 120
          && segHit(s, me.x, me.y, BIN_R + 140) && !segHit(s, me.x, me.y, BIN_R)) { s.whiz = true; whizAt = now; packPlay("p_whiz", 0.7, s.x, s.y); }
      // a rocket or an orb flying past roars by (yours too, once, as it leaves)
      if (!s.flyby && s.kind === K.ORB && playing && !me.dead && Math.hypot(s.x - me.x, s.y - me.y) < (s.mine ? 200 : 380)) {
        s.flyby = true; packPlay(s.kind === K.ORB ? "p_fly_orb" : "p_fly_rocket", s.mine ? 0.35 : 0.7, s.x, s.y);
      }

      if (s.kind === K.MINE && s.mine && !s.armedFx && SHOTS[K.MINE].life - s.life >= MINE_ARM) { s.armedFx = true; packPlay("p_arm_mine", 0.5, s.x, s.y); }   // my mine is armed
      // enemy fireball hits me (I decide, then report the shot id)
      const armed = s.kind !== K.MINE || SHOTS[K.MINE].life - s.life >= MINE_ARM;
      if (armed && canHurt(s, me, "me", s.kind === K.MINE) && targetHit(s, me) && (!pierces(s) || railOnce(s, "me"))) {
        if (!pierces(s)) s.life = 0;
        s.direct = "me";   // its blast (if any) spares me: I took the direct hit
        shotBurst(s);
        if (SHOTS[s.kind].shove) pelletShove(me, s, SHOTS[s.kind].shove);
        hurtMe(s, now, shotDmg(s), s.kind, Math.atan2(s.vy, s.vx));
      }
      // someone else's bolt hitting a third pilot can still jump to me or my bots
      // a shot reaches a bin flown in another browser: it ends here and they confirm the hit. Mine is predicted
      // (the hit marker waits for their word); a bot's or a third pilot's just bursts, so it neither hangs on its
      // target nor flies on through it and blows up somewhere it never reached on the victim's screen
      if (s.life > 0) for (const [rid, r] of remotes) {
        if (botById.has(rid)) continue;
        if ((serverRun && r.buf?.length ? r.shownInv : r.inv) || !canHurt(s, r, rid)) continue;
        if (armed && targetHit(s, r)) {
          if (pierces(s)) { if (railOnce(s, rid)) { shotBurst(s); if (s.mine) predictHit(s, rid, r); else if (mySrvShot(s)) serverHitFx(s, rid, r); } continue; }
          s.life = 0; s.direct = rid; shotBurst(s); if (s.mine) predictHit(s, rid, r); else if (mySrvShot(s)) serverHitFx(s, rid, r);
          break;
        }
      }
    }
    while (myShotLog.length && now - myShotLog[0].at > 1200) myShotLog.shift();
  }
  // space junk: shot apart for points, or crashed into
  // space junk: little rocks that take a few hits, chipping and shrinking, then crack into drifting chunks.
  // Everyone sees the same shots hit them, so they wear down alike; the one whose shot breaks a rock reports it (+2).
  // Collisions exchange momentum with the bin; a hard knock also chips the rock.
  const rockWear = new Map();   // rock key -> damage taken, in fireballs
  const rockHp = k => 2 + Math.round((k.r - 22) / 18 * 3);   // 2 fireballs for the smallest, 5 for the biggest
