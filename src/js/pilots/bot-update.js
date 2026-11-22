  function updateBots(dt, now) {
    if (!bots.length) return;
    creditBots(hitBy, false); creditBots(koBy, true);   // bots that hit or killed me
    const holes = holesNow();
    for (const b of bots) {
      if (!b.dead && roundLive) botXp(b, dt * 0.35);   // what a player gets from sparks: about 20 XP a minute
      while (b.shotLog.length && now - b.shotLog[0].at > 700) b.shotLog.shift();
      if (b.dead) {
        if (now < b.respawnAt) continue;
        clearArmor(b);
        Object.assign(b, { dead: false, lives: maxLivesOf(b.lv), inv: now + 2000, ...spawnPoint(b.tm), vx: 0, vy: 0, charge: 0 });
        resetCmds(b);
      }
      const human = b.input;   // flown by a player: the AI below only steers the others
      // nearest living target: me or anyone else in the lobby (other bots included)
      let tgt = null, td = botWeapon(b) === "holy" ? 3200 : botWeapon(b) === "nuke" || botWeapon(b) === "void" ? 2600 : 1700;   // (a big bomb looks further)
      if (playing && !me.dead && !mates(b, me)) { const d = Math.hypot(me.x - b.x, me.y - b.y); if (d < td) { td = d; tgt = me; } }
      for (const [rid, r] of remotes) {
        if (rid === b.id || r.dead || mates(r, b)) continue;
        const d = Math.hypot(r.x - b.x, r.y - b.y);
        if (d < td) { td = d; tgt = r; }
      }
      // a bot flies like a player: it pushes a stick, the bin turns to face where it pushes, and it can only shoot
      // where it faces. So it makes attack runs at its target (aiming ahead of it), breaks off when it gets too
      // close, loops round and comes back; it boosts to close a long gap and dashes aside when it gets hit
      let dx = 0, dy = 0, aimA = null, wantBoost = false, routeGoal = tgt;
      if (human) { dx = human.mx; dy = human.my; wantBoost = human.boost; }
      else if (tgt) {
        const fly = td / 1000 * 0.8, px = tgt.x + (tgt.vx || 0) * fly - (b.vx || 0) * fly * 0.6, py = tgt.y + (tgt.vy || 0) * fly - (b.vy || 0) * fly * 0.6;
        aimA = Math.atan2(py - b.y, px - b.x);
        if (now < (b.breakUntil || 0)) { dx = Math.cos(b.breakA); dy = Math.sin(b.breakA); }   // breaking off, then looping back
        else if (td < 240) {
          b.breakUntil = now + 450 + Math.random() * 500; b.side = Math.random() < 0.5 ? 1 : -1;
          b.breakA = aimA + b.side * (1.3 + Math.random() * 0.5); dx = Math.cos(b.breakA); dy = Math.sin(b.breakA);
        } else {   // the attack run: the stick wavers a little (more for an easy bot), so its aim does too
          const a = aimA + Math.sin(now / 450 + b.seq * 1.7) * b.L.aim * 1.6; dx = Math.cos(a); dy = Math.sin(a);
          wantBoost = td > 900;
        }
      } else {
        b.wander += (Math.random() - 0.5) * dt * 1.5; dx = Math.cos(b.wander) * 0.7; dy = Math.sin(b.wander) * 0.7;
      }
      if (bases && onTeam(b) && !human) {
        const ef = 1 - b.tm, home = bases[b.tm], thief = flagCarrier[b.tm];
        let goal = null, w = 1.6;
        if (b.fc === ef) { goal = home; w = 3; }                                  // bring it home
        else if (thief) goal = thief.o;                                          // get our flag back
        else if (b.attacker && !flagCarrier[ef]) goal = bases[ef];               // go and grab theirs
        else if (!b.attacker && Math.hypot(home.x - b.x, home.y - b.y) > 500) goal = home;   // guard
        if (goal) { routeGoal = goal; const gx = goal.x - b.x, gy = goal.y - b.y, gd = Math.hypot(gx, gy) || 1; dx += gx / gd * w; dy += gy / gd * w; }
      }
      if (roundLive && !MODES[MODE].noSupplies) for (const c of world.supplies) {
        if (grabbed.has(c.key) || c.age < .05 || Math.hypot(c.x - b.x, c.y - b.y) > 56 || !applySupply(b, c.type)) continue;
        grabbed.add(c.key); pushCapped(myGrabs, c.key, 40);
        sfx(SUPPLIES[c.type].heal ? "heal" : "shield_get", .5, 1, c.x, c.y);
      }
      // Quad damage: anyone flying through it takes it, a player on the server (their screen only shows it) or a bot
      const qd = world.amp;
      if (roundLive && qd && !grabbed.has(qd.key) && Math.hypot(qd.x - b.x, qd.y - b.y) < 30 + 30 * sizeOf(b.lv || 1)) {
        grabbed.add(qd.key); pushCapped(myGrabs, qd.key, 40); b.ampUntil = now + AMP_TIME;
        if (!human) for (let k = 0; k < 30; k++) { const a = Math.random() * 6.28, v = 100 + Math.random() * 300; puff(qd.x, qd.y, Math.cos(a) * v, Math.sin(a) * v, 0.8, 2.5, k % 2 ? "#5b9bff" : "#ffffff"); }
        sfx("shield_get", 0.6, 0.7, qd.x, qd.y);
      }
      if (!MODES[MODE].only && roundLive) {
        let best = null, bd = b.weapon === "fire" && td > 700 ? 1300 : 0;
        // the guns on their spots and the two big bombs' crates (a nuke, the holy bomb): a bot takes any of them, and so
        // does a player on the server (the teleporter is retired)
        for (const c of [...world.picks, ...world.bombs]) {
          if (grabbed.has(c.key) || c.age < 0.05 || c.type === "tele" || WEAPONS[c.type]?.disabled) continue;
          const d = Math.hypot(c.x - b.x, c.y - b.y);
          if (d < 34 + 30) {   // picked up
            grabbed.add(c.key); pushCapped(myGrabs, c.key, 40);
            if (human) pilotGive(b, c.type, WEAPONS[c.type].ammo);
            else { b.weapon = c.type; b.ammo = Math.ceil(WEAPONS[c.type].ammo * (c.type === "laser" || c.type === "bolt" ? 0.4 : 1)); }
            if (c.type === "holy" || c.type === "nuke") announce(c.type === "holy" ? "HOLY BOMB TAKEN" : "NUKE TAKEN", b.name + " has it", WEAPONS[c.type].col);
            for (let k = 0; k < 20; k++) { const a = Math.random() * 6.28, v = 80 + Math.random() * 200; puff(c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, 0.5, 2, WEAPONS[c.type].col); }
            sfx("weapon_get", 0.5, 1, c.x, c.y);
            best = null; break;
          }
          if (d < bd) { bd = d; best = c; }
        }
        for (const [gid, d] of gunDrops) {   // trophies count as crates
          if (grabbed.has("W" + gid) || WEAPONS[d.type]?.disabled || performance.now() - d.born < 600) continue;
          const dd = Math.hypot(d.x - b.x, d.y - b.y);
          if (dd < 64) { grabbed.add("W" + gid); pushCapped(myGrabs, "W" + gid, 40); if (human) pilotGive(b, d.type, d.ammo); else { b.weapon = d.type; b.ammo = d.ammo; } sfx("weapon_get", 0.5, 1, d.x, d.y); best = null; break; }
          if (dd < bd) { bd = dd; best = d; }
        }
        // Quad damage draws a bot from twice as far as a gun does (and a gun in hand does not stop it)
        if (qd && !grabbed.has(qd.key) && !human) { const dq = Math.hypot(qd.x - b.x, qd.y - b.y) / 2; if (dq < Math.max(bd, 900)) { bd = dq; best = qd; } }
        if (best && !human) { routeGoal = best; const gx = best.x - b.x, gy = best.y - b.y, gd = Math.hypot(gx, gy) || 1; dx += gx / gd * 1.4; dy += gy / gd * 1.4; }
      }
      const m = 260;   // keep off the fence
      if (!human) {
        if (b.x < m) dx += (m - b.x) / m * 2.5; if (b.x > W - m) dx -= (b.x - W + m) / m * 2.5;
        if (b.y < m) dy += (m - b.y) / m * 2.5; if (b.y > H - m) dy -= (b.y - H + m) / m * 2.5;
        for (const p of bodies) {   // and around planets and moons
          if (p.fixed || p.prop) continue;   // (a station's crates are steered round by its route, not kept off)
          const hx = b.x - p.x, hy = b.y - p.y, hd = Math.hypot(hx, hy) || 1, gap = hd - p.rr;
          if (gap < 280) { dx += hx / hd * 3 * (1 - gap / 280); dy += hy / hd * 3 * (1 - gap / 280); }
        }
      }
      for (const bh of holes) {   // and away from a black hole (the event's, a void bomb's)
        const hx = b.x - bh.x, hy = b.y - bh.y, hd = Math.hypot(hx, hy) || 1;
        if (hd < 900 && !human) { dx += hx / hd * 3 * (1 - hd / 900) * 2; dy += hy / hd * 3 * (1 - hd / 900) * 2; }
        if (hd < holeReach(bh)) { const acc = holeAcc(bh, hd); b.vx -= hx / hd * acc * dt; b.vy -= hy / hd * acc * dt; }
        if (bh.s) {   // a void bomb's hole burns as it drags, and its kills are its thrower's
          b.voidBurn = (b.voidBurn || 0) + voidBurn(bh, hd, dt);
          if (b.voidBurn >= VOID_BURN.bite) { const n = b.voidBurn; b.voidBurn = 0; botHurt(b, n * selfMul(bh.s, b.id), bh.s.id, now, false, K.VOID); }
        }
        if (hd < 60 * bh.k) botHurt(b, 99, bh.s ? bh.s.id : "x", now, true, bh.s ? K.VOID : -1);
      }
      if (stationMap() && !human) {
        if (!routeGoal) {
          if (!b.patrol || Math.hypot(b.x - b.patrol.x, b.y - b.patrol.y) < 140) b.patrol = spawnPoint();
          routeGoal = b.patrol;
        }
        if (!b.navAt || now > b.navAt || !b.nav || Math.hypot(b.x - b.nav.x, b.y - b.nav.y) < 50) { b.nav = foundryRoute(b, routeGoal); b.navAt = now + 350; }
        if (b.nav) { const nx = b.nav.x - b.x, ny = b.nav.y - b.y, nd = Math.hypot(nx, ny) || 1; dx = nx / nd; dy = ny / nd; wantBoost = false; }
      }
      // the stick, eased in like a thumb on a joystick, then the same thrust and turning as the player
      const dm = Math.hypot(dx, dy), ux = dm > 1 ? dx / dm : dx, uy = dm > 1 ? dy / dm : dy, ease = 1 - Math.exp(-(human ? 13 : 6 + 4 * b.L.speed) * dt);
      const st = b.stick || (b.stick = { x: 0, y: 0 });
      const cmds = human && b.cq;   // a player whose screen sends flight commands: flown by them (pilotMove), below
      const split = human && !cmds && b.prevIn && b.split > 1e-4 ? b.split : 0;   // new controls came in part way through this step
      if (!split && !cmds) { st.x += (ux - st.x) * ease; st.y += (uy - st.y) * ease; }
      if (human && !cmds) {   // a player's energy works as the local pilot's (steerAndShoot): regen waits 0.7 s after a boost or a dash
        b.boosting = wantBoost && b.energy > 0 && Math.hypot(st.x, st.y) > 0.1;
        if (b.boosting && !b.boostOn) { b.vx += Math.cos(b.a) * 220; b.vy += Math.sin(b.a) * 220; }   // lighting it shoves forward, as flyStep
        b.boostOn = b.boosting;
        if (b.boosting) { b.energy = Math.max(0, b.energy - 20 * dt); b.regenAt = now + 700; }
        else if (now > (b.regenAt || 0)) b.energy = Math.min(100, b.energy + 22 * dt);
      } else if (!human) {   // a bot's (a player flown by commands has its energy in pilotMove)
        b.energy = Math.min(100, (b.energy ?? 100) + (b.boosting ? -20 : 22) * dt);
        b.boosting = wantBoost && b.energy > (b.boosting ? 0 : 40) && b.L.speed >= 0.9;
      }
      if (human && !cmds) {   // a player's dash: toward where they steer (or ahead), like dash() for the local pilot
        b.dashReq = false;
        if (human.dash > b.dashDone) {
          b.dashDone = human.dash;
          if (b.energy >= 25 && now - (b.dashAt || 0) > 150) {
            const a = Math.hypot(st.x, st.y) > 0.2 ? Math.atan2(st.y, st.x) : b.a;
            b.vx += Math.cos(a) * 900; b.vy += Math.sin(a) * 900; b.energy -= 25; b.regenAt = now + 700; b.dashAt = now; b.inv = Math.max(b.inv, now + 280);
          }
        }
      }
      if (!human && b.dashReq && b.energy >= 25 && now - (b.dashAt || 0) > 900) {   // hit: a quick dodge to one side
        const a = Math.atan2(st.y, st.x) + (Math.random() < 0.5 ? 1.4 : -1.4);
        b.vx += Math.cos(a) * 900; b.vy += Math.sin(a) * 900; b.energy -= 25; b.dashAt = now; b.inv = Math.max(b.inv, now + 280);
      }
      b.dashReq = false;
      if (human) {   // a player's pilot flies by the very function that flies their own bin on their screen (flyPilot)
        // with controls that changed during the step: the old ones until they arrived, the new ones after, as the
        // player's own screen flew them (it changed them when it sent them, a fixed trip earlier)
        const parts = cmds ? [] : split ? [[b.prevIn, split], [human, dt - split]] : [[human, dt]];
        let f = { crash: null, fence: null };
        if (cmds) {
          // Commands are flown against the clock, as Source and Overwatch do: each step adds its time to an allowance
          // and each command spends CMD_DT of it, so sending them faster than time passes gains nothing (the queue
          // just overflows). A delay of up to 8 commands (~133 ms, the network's jitter) is waited out; past that the
          // last command is flown again, so the pilot never hangs in place, and as many late ones are skipped
          // (the allowance grows by the clock, not by the step: a server running late drops steps, never a player's time)
          const real = Number.isFinite(b.cqAt) ? Math.max(0, Math.min(0.5, (now - b.cqAt) / 1000)) : dt; b.cqAt = now;
          b.cqBudget = Math.min(CMD_DT * 30, (b.cqBudget || 0) + real);
          for (let n = 0; n < 3 && b.cqBudget >= CMD_DT - 1e-9; n++) {
            let c;
            // the next one is missing but later ones are here (lost or overtaken on the way): a moment's wait for it
            // (cmdAck: the number of the last command flown; it is not the controls messages' number, ackSeq)
            if (cmds.length && cmds[0].s !== (b.cmdAck || 0) + 1 && b.cmdAck && b.cqBudget < CMD_DT * 8) break;
            // jkN: the spread's number for this command's shots, counted here one by one (from the first command, or a
            // screen starting its count again at 1), so a screen cannot pick its numbers by skipping some; an honest
            // one, sending them all, counts the same (c.s). A command flown again (below) has none
            if (cmds.length) { c = cmds.shift(); b.lastCmd = c; b.cmdAck = c.s; b.jkN = b.jkN === undefined || c.s === 1 ? c.s : b.jkN + 1; c = { ...c, jk: b.jkN }; }
            else if (b.cqBudget >= CMD_DT * 8) { c = b.lastCmd || { mx: 0, my: 0, aim: b.a, boost: false, brake: false, fire: false, alt: false, dash: b.dashDone || 0 }; b.cqOwed = Math.min(30, (b.cqOwed || 0) + 1); b.cqRepeats = (b.cqRepeats || 0) + 1; }
            else break;
            b.cqBudget -= CMD_DT;
            // the trigger as this command held it, aimed as it was aimed, before the command's flight, as the player's
            // screen fires before it flies its frame (Source and Overwatch fire from the user command the same way)
            b.a = c.aim; human.fire = !!c.fire; human.alt = !!c.alt;
            b.fireCd -= CMD_DT; b.altCd = (b.altCd || 0) - CMD_DT;   // (the cooldowns run by commands too, as on the player's screen)
            b.cmdWait = c.at ? Math.max(0, now - c.at) : -1; b.viewAt = c.va > 0 ? c.va : -1; b.jk = c.jk; pilotTriggers(b, CMD_DT, now); b.cmdWait = b.viewAt = -1; b.jk = undefined;
            const g = pilotMove(b, c);
            f = { crash: g.crash || f.crash, fence: g.fence || f.fence };
          }
        }
        for (const [inp, d] of parts) {
          if (split) {
            const m = Math.hypot(inp.mx, inp.my), px = m > 1 ? inp.mx / m : inp.mx, py = m > 1 ? inp.my / m : inp.my, e = 1 - Math.exp(-13 * d);
            st.x += (px - st.x) * e; st.y += (py - st.y) * e;
          }
          const g = flyPilot(b, st.x, st.y, b.boosting, !!inp.brake, d, now, b.boosting || now - (b.dashAt || 0) < 350);
          f = { crash: g.crash || f.crash, fence: g.fence || f.fence };
        }
        if (!cmds) b.a = lerpAng(b.a, human.aim, 1 - Math.exp(-30 * dt));   // the nose follows the player's aim, as with mouse aim
        if (f.crash && f.crash.hs > 60) impact(f.crash.x, f.crash.y, "#ffd9b0", Math.min(2, 0.4 + f.crash.hs / 450));
        if (f.crash && f.crash.dmg > 0) botHurt(b, f.crash.dmg, "p", now, false);
        if (f.fence && f.fence.dmg > 0) botHurt(b, f.fence.dmg, "p", now, false);
        // the junk rocks bump it, as they bump my bin (updateJunk)
        if (!cmds) for (const k of world.rocks) if (k && !grabbed.has(k.key) && k.age >= 0.6) collideRock(b, k);   // (commands meet them in pilotMove)
      } else {   // a bot
      thrustPilot(b, st.x, st.y, b.boosting, false, dt, b.L.speed * (now < (b.pinnedUntil || 0) ? 0.6 : 1));
      slingshot(b, dt); padsFor(b, now);
      if (Math.hypot(st.x, st.y) > 0.15) b.a = lerpAng(b.a, Math.atan2(st.y, st.x), 1 - Math.exp(-13 * dt));
      gravityOn(b, dt);
      b.x += b.vx * dt; b.y += b.vy * dt;
      const pc = bounceOff(b, 40, 0.25, binMass(b.lv));
      if (pc && pc.vn < -200) {
        impact(b.x - pc.nx * 40, b.y - pc.ny * 40, "#ffd9b0", 1.2);
        const dmg = hurtsOnHit(pc.b) ? crashDmg(-pc.vn, false) : 0;
        if (dmg > 0) botHurt(b, dmg, "p", now, false);
      }
      if (b.x < 40 || b.x > W - 40) { b.vx = -b.vx * 0.6; b.x = clamp(b.x, 40, W - 40); }
      if (b.y < 40 || b.y > H - 40) { b.vy = -b.vy * 0.6; b.y = clamp(b.y, 40, H - 40); }
      }
      // shoot when the nose points at the target (where it will be)
      if (!b.cq) { b.fireCd -= dt; b.altCd = (b.altCd || 0) - dt; }   // (a player flown by commands: by each command, above)
      // shock combo: once its orb hangs near the target, a bot shoots the orb with the beam (harder bots do it more)
      if (b.orb && (b.orb.life <= 0 || !shots.includes(b.orb))) b.orb = null;
      if (!human && b.orb && tgt && botWeapon(b) === "orb" && SHOTS[K.ORB].life - b.orb.life > 0.5 && Math.hypot(tgt.x - b.orb.x, tgt.y - b.orb.y) < 260
          && Math.abs(angD(Math.atan2(b.orb.y - b.y, b.orb.x - b.x) - b.a)) < 0.45) {   // like a player, only when it faces the orb
        const o = b.orb; b.orb = null;
        if (Math.random() < ({ easy: 0.25, normal: 0.6, hard: 0.95 })[b.level]) {
          volley(b, now, WEAPONS.orb.alt, null, b.a + clamp(angD(Math.atan2(o.y - b.y, o.x - b.x) - b.a), -0.12, 0.12) + (Math.random() - 0.5) * b.L.aim * 0.3);   // a hair of aim assist, no more
          sfx(...WEAPONS.orb.alt.sfx.slice(0, 1), 0.6, 0.55, b.x, b.y);
          if (!MODES[MODE].only && --b.ammo <= 0) b.weapon = "fire";
          b.fireCd = Math.max(b.fireCd, 0.6);
        }
      }
      if (human) { if (!b.cq) pilotTriggers(b, dt, now); }   // (a pilot flown by commands has its trigger with each command, above)
      else if (botWeapon(b) === "saw" && roundLive && (b.charge > 0 || tgt && botInRange(b, td) && Math.abs(angD(aimA - b.a)) < 0.6 + b.L.aim && b.fireCd <= 0)) {
        // the Blood Blade: wound back first (seen by everyone), then swung at full strength
        b.charge = Math.min(1, (b.charge || 0) + dt / WEAPONS.saw.charge);
        if (b.charge >= 1) { botFire(b, now, b.charge); b.charge = 0; b.fireCd = Math.max(b.L.cd, WEAPONS.saw.cd * 1.3) * (0.7 + Math.random() * 0.6); }
      }
      else if (tgt && roundLive && botInRange(b, td) && Math.abs(angD(aimA - b.a)) < 0.22 + b.L.aim && b.fireCd <= 0) { const cd = botFire(b, now);   // rapid guns fire faster than the bot's usual pace, slow guns slower
        const md = MODES[MODE];
        b.fireCd = (md.botCd ? b.L.cd * md.botCd : cd < 0.15 ? cd * 2 : Math.max(b.L.cd, cd * 1.3)) * (0.7 + Math.random() * 0.6); }
      // another pilot ramming my bot on boost (the bot is the victim, so its owner decides)
      for (const [rid, r] of remotes) {
        if (botById.has(rid) || r.dead || !(r.boost > 0) || !r.tag || mates(r, b)) continue;
        const dx = b.x - r.x, dy = b.y - r.y, d = Math.hypot(dx, dy) || 1;
        if (d < 31 * (sizeOf(r.lv || 1) + sizeOf(b.lv || 1))) {   // (their bin is theirs to move: only mine takes the blow here)
          const nx = dx / d, ny = dy / d, mb = binMass(b.lv), mr = binMass(r.lv), vn = (b.vx - (r.vx || 0)) * nx + (b.vy - (r.vy || 0)) * ny;
          if (vn < 0) {
            const j = -1.5 * vn / (1 / mb + 1 / mr), dmg = knockDmg(j / mb);
            b.vx += j * nx / mb; b.vy += j * ny / mb;
            if (dmg > 0 && (!b.rammedBy || now - b.rammedBy > 300)) { b.rammedBy = now; botHurt(b, dmg, r.tag + ".ram" + Math.floor(now), now, false); }
          }
        }
      }
      recordHitPose(b, now);
      // anyone's shots can hit the bot (the bot's own excepted). Its invulnerability now (a dash, a respawn) stops a
      // shot judged now; a player's shot judged in the past (lag compensation) meets it as it was then (targetHit)
      const invNow = now < b.inv;
      for (const s of shots) {
        if (invNow && !(s.hitTime && HITSCAN[s.kind] && !s.mine)) continue;
        if (s.life <= 0 || SHOTS[s.kind].inert || !canHurt(s, b, b.id)) continue;
        if (s.kind === K.MINE && SHOTS[K.MINE].life - s.life < MINE_ARM) continue;
        if (targetHit(s, b)) {
          if (pierces(s)) { if (!railOnce(s, b.id)) continue; } else { s.life = 0; s.direct = b.id; }
          shotBurst(s); hitConfirm(s, b.lv, b.x, b.y, remotes.get(b.id)); if (SHOTS[s.kind].shove) pelletShove(b, s, SHOTS[s.kind].shove);
          if (s.kind === K.BOLT || s.kind === K.LASER) boltChain(s, b.x, b.y, b.id, now);
          if (s.kind === K.NAIL || s.kind === K.SPIKE) b.pinnedUntil = now + 1000;
          botHurt(b, shotDmg(s), s.id, now, false, s.kind, Math.atan2(s.vy, s.vx), invNow);
        }
      }
    }
    binContacts(now);
  }
