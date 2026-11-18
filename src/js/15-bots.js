  // ---------- bots (simulated here, broadcast like real pilots) ----------
  const MAX_BOTS = 24;
  const BOT_NAMES = ["Rusty", "Bolt", "Zappy", "Clank", "Nova", "Sprocket", "Dusty", "Orbit", "Razor", "Vex", "Scrap", "Fury", "Nail", "Cinder", "Hex", "Rivet", "Grinder", "Rook", "Torque", "Wraith", "Flint", "Rattle", "Havoc", "Slag"];
  const BOT_LEVELS = { easy: { aim: 0.26, cd: 0.7, speed: 0.75, label: "Easy" }, normal: { aim: 0.13, cd: 0.45, speed: 0.9, label: "Normal" }, hard: { aim: 0.05, cd: 0.3, speed: 1, label: "Hard" } };
  const bots = [], botById = new Map(), botCredited = new Set();
  function addBots(n, level) {
    n = Math.max(0, Math.min(MAX_BOTS - bots.length, Math.floor(Number(n) || 0)));
    if (!BOT_LEVELS[level]) level = "normal";
    const L = BOT_LEVELS[level];
    for (let i = 0; i < n; i++) {
      const id = "pb" + Math.random().toString(36).slice(2, 8);
      const b = { id, tag: "b" + Math.random().toString(36).slice(2, 7), name: BOT_NAMES[(bots.length) % BOT_NAMES.length] + " (bot)", L, level,
        hue: Math.floor(Math.random() * 360), ck: [Math.floor(Math.random() * 7), Math.floor(Math.random() * 6), Math.floor(Math.random() * 5), Math.floor(Math.random() * 5), Math.floor(Math.random() * 6)],
        ...spawnPoint(), vx: 0, vy: 0, a: Math.random() * 6.28, lives: LIVES, lv: 1, xp: 0, dead: false, respawnAt: 0, inv: 0, ds: 0,
        fireCd: 1 + Math.random(), side: Math.random() < 0.5 ? 1 : -1, wander: Math.random() * 6.28, seq: 0, q: 0,
        weapon: "fire", shotLog: [], hitBy: [], koBy: [], st: { kills: 0, deaths: 0, shots: 0, hits: 0, streak: 0, best: 0 } };
      bots.push(b); botById.set(id, b);
    }
  }
  // a pilot flown from outside, like a player on the authoritative server: a bot whose stick, aim and triggers
  // come from b.input instead of the AI, judged by exactly the same rules (see server/sim)
  //   input: { mx, my: the stick (-1..1), aim: radians, fire, boost: booleans, dash: a counter, +1 per dash }
  // A full arena makes room by retiring an AI bot; with only players left there is no room (null).
  function addPilot(name) {
    if (bots.length >= MAX_BOTS) {
      const ai = bots.findLast(b => !b.input);
      if (!ai) return null;
      removePilot(ai.id);
    }
    const before = bots.length;
    addBots(1, "hard");
    if (bots.length === before) return null;
    const b = bots[bots.length - 1];
    b.name = String(name || "Pilot").slice(0, 14); b.input = { mx: 0, my: 0, aim: b.a, fire: false, alt: false, boost: false, brake: false, dash: 0, tele: 0, w: -1, s: 0 }; b.ackSeq = 0; b.energy = 100; b.dashDone = 0; b.teleDone = 0; b.fireCd = 0;   // a bot's opening pause is not for players
    pilotArm(b);
    return b;
  }
  function removePilot(id) {
    const i = bots.findIndex(b => b.id === id);
    if (i >= 0) bots.splice(i, 1);
    botById.delete(id); remotes.delete(id);
  }
  function creditBots(list, ko, victim = "me") {
    for (const k of list) {
      if (typeof k !== "string") continue;
      const key = (ko ? "ko" : "") + victim + ":" + k;
      if (botCredited.has(key) || botCredited.size >= MAX_CREDITS) continue;
      for (const b of bots) if (b.id !== victim && k.startsWith(b.tag + ".")) {
        botCredited.add(key);
        if (ko) { b.st.kills++; b.st.streak++; b.st.best = Math.max(b.st.best, b.st.streak); botXp(b, 10); } else { b.st.hits++; botXp(b, 1); }
      }
    }
  }
  function botXp(b) { b.lv = 1; b.xp = 0; }
  function botHurt(b, dmg, shotId, now, force, kind = -1, ang = 0) {
    if (b.dead || (!force && now < b.inv) || !roundLive) return;
    const absorbed = force ? 0 : absorbArmor(b, dmg);
    dmg -= absorbed;
    if (!shotId.startsWith(b.tag + ".")) metricDamage(shotId, absorbed + Math.min(b.lives, dmg), b.lives <= dmg);
    b.lives = Math.round((b.lives - dmg) * 1000) / 1000;
    if (Math.random() < ({ easy: 0.15, normal: 0.35, hard: 0.6 })[b.level]) b.dashReq = true;
    const shown = remotes.get(b.id); if (shown) shown.hitAt = performance.now();
    const byHole = shotId === "x" || shotId === "p";   // the black hole or a planet: nobody gets credit
    if (!byHole) pushCapped(b.hitBy, shotId, 12);
    if (b.lives <= 0) {
      if (b.weapon !== "fire" && !MODES[MODE].only) dropGun(b.x, b.y, b.weapon, b.input ? b.arsenal[b.weapon] : b.ammo);   // its trophy
      b.dead = true; b.respawnAt = now + 3000; b.fc = -1; b.weapon = "fire";
      if (b.input) pilotArm(b);   // a player starts again with the fireball and the gauntlet
      b.lv = levelAfterDeath(b.lv); b.xp = XP_STEPS[b.lv - 1]; b.ds = deathPiecesOf(kind); b.dk = deathStyleOf(kind); b.da = ang;
      b.st.deaths++; b.st.streak = 0;
      if (byHole) feedPush(`<span class="v">${esc(b.name)}</span> ${shotId === "p" ? "crashed into a planet" : "was swallowed by the black hole"}`);
      else pushCapped(b.koBy, shotId, 12);
    }
  }
  // what a bot shoots with: the mode's gun, or a gun from a crate it grabbed (mines are left for players)
  const botWeapon = b => MODES[MODE].only || b.weapon;
  // fires once; returns the gun's reload time
  function botFire(b, now) {
    const w = botWeapon(b), pat = WEAPONS[w];
    if (w === "gamma" && shots.some(s => s.owner === b.id && s.kind === K.GAMMA && s.life > 0 && !s.boom)) return .3;
    const s = volley(b, now, pat, null, w === "bolt" ? boltLock(b, null) : undefined);
    if (w === "orb") b.orb = s;   // a bot can set its orb off with the beam (see updateBots)
    shotSound(pat.shot[0], b.x, b.y, b.id);
    b.vx -= Math.cos(b.a) * 25; b.vy -= Math.sin(b.a) * 25;
    if (!MODES[MODE].only && w !== "fire" && --b.ammo <= 0) b.weapon = "fire";
    return pat.cd;   // twin fireballs reload a little slower
  }
  function updateBots(dt, now) {
    if (!bots.length) return;
    creditBots(hitBy, false); creditBots(koBy, true);   // bots that hit or killed me
    const ev = eventAt(clockNow()), bh = ev.active && ev.type === "blackhole" ? blackHole(ev) : null;
    for (const b of bots) {
      if (!b.dead && roundLive) botXp(b, dt * 0.35);   // what a player gets from sparks: about 20 XP a minute
      while (b.shotLog.length && now - b.shotLog[0].at > 700) b.shotLog.shift();
      if (b.dead) {
        if (now < b.respawnAt) continue;
        clearArmor(b);
        Object.assign(b, { dead: false, lives: maxLivesOf(b.lv), inv: now + 2000, ...spawnPoint(b.tm), vx: 0, vy: 0 });
      }
      const human = b.input;   // flown by a player: the AI below only steers the others
      // nearest living target: me or anyone else in the lobby (other bots included)
      let tgt = null, td = 1700;
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
      if (!MODES[MODE].only && roundLive) {
        let best = null, bd = b.weapon === "fire" && td > 700 ? 1300 : 0;
        for (const c of world.picks) {
          if (grabbed.has(c.key) || c.age < 0.05 || (!human && (c.type === "mine" || c.type === "tele")) || WEAPONS[c.type]?.disabled) continue;   // mines and the teleporter are left for players
          const d = Math.hypot(c.x - b.x, c.y - b.y);
          if (d < 34 + 30) {   // picked up
            grabbed.add(c.key); pushCapped(myGrabs, c.key, 40);
            if (human) pilotGive(b, c.type, WEAPONS[c.type].ammo);
            else { b.weapon = c.type; b.ammo = Math.ceil(WEAPONS[c.type].ammo * (c.type === "laser" || c.type === "bolt" ? 0.4 : 1)); }
            for (let k = 0; k < 20; k++) { const a = Math.random() * 6.28, v = 80 + Math.random() * 200; puff(c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, 0.5, 2, WEAPONS[c.type].col); }
            sfx("weapon_get", 0.5, 1, c.x, c.y);
            best = null; break;
          }
          if (d < bd) { bd = d; best = c; }
        }
        for (const [gid, d] of gunDrops) {   // trophies count as crates
          if (grabbed.has("W" + gid) || WEAPONS[d.type]?.disabled || (d.type === "mine" && !human) || performance.now() - d.born < 600) continue;
          const dd = Math.hypot(d.x - b.x, d.y - b.y);
          if (dd < 64) { grabbed.add("W" + gid); pushCapped(myGrabs, "W" + gid, 40); if (human) pilotGive(b, d.type, d.ammo); else { b.weapon = d.type; b.ammo = d.ammo; } sfx("weapon_get", 0.5, 1, d.x, d.y); best = null; break; }
          if (dd < bd) { bd = dd; best = d; }
        }
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
      if (bh) {   // and away from a black hole
        const hx = b.x - bh.x, hy = b.y - bh.y, hd = Math.hypot(hx, hy) || 1;
        if (hd < 900 && !human) { dx += hx / hd * 3 * (1 - hd / 900) * 2; dy += hy / hd * 3 * (1 - hd / 900) * 2; }
        if (hd < 1500) { const acc = bh.k * 9e7 / (hd * hd + 1.5e4); b.vx -= hx / hd * acc * dt; b.vy -= hy / hd * acc * dt; }
        if (hd < 60 * bh.k) botHurt(b, 99, "x", now, true);
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
      if (cmds) {}
      else if (human) {   // a player's energy works as the local pilot's (steerAndShoot): regen waits 0.7 s after a boost or a dash
        b.boosting = wantBoost && b.energy > 0 && Math.hypot(st.x, st.y) > 0.1;
        if (b.boosting && !b.boostOn) { b.vx += Math.cos(b.a) * 220; b.vy += Math.sin(b.a) * 220; }   // lighting it shoves forward, as flyStep
        b.boostOn = b.boosting;
        if (b.boosting) { b.energy = Math.max(0, b.energy - 20 * dt); b.regenAt = now + 700; }
        else if (now > (b.regenAt || 0)) b.energy = Math.min(100, b.energy + 22 * dt);
      } else {
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
      if (b.dashReq && b.energy >= 25 && now - (b.dashAt || 0) > 900) {   // hit: a quick dodge to one side
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
            if (cmds.length) { c = cmds.shift(); b.lastCmd = c; b.ackSeq = c.s; }
            else if (b.cqBudget >= CMD_DT * 8) { c = b.lastCmd || { mx: 0, my: 0, aim: b.a, boost: false, brake: false, dash: b.dashDone || 0 }; b.cqOwed = Math.min(30, (b.cqOwed || 0) + 1); b.cqRepeats = (b.cqRepeats || 0) + 1; }
            else break;
            b.cqBudget -= CMD_DT;
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
        for (const k of world.rocks) if (k && !grabbed.has(k.key) && k.age >= 0.6) collideRock(b, k);
        // and touching another pilot pushes it off, as updateRemotes pushes my bin
        for (const o of bots) {
          if (o === b || o.dead) continue;
          const ox = b.x - o.x, oy = b.y - o.y, d = Math.hypot(ox, oy);
          if (d >= 31 * (sizeOf(b.lv || 1) + sizeOf(o.lv || 1)) || d <= 0.01 || now - ((b.boops ||= new Map()).get(o.id) || 0) <= 400) continue;
          b.boops.set(o.id, now);
          const kick = boopKick(o.boosting || now - (o.dashAt || 0) < 350, b.boosting || now - (b.dashAt || 0) < 350);
          b.vx += ox / d * kick; b.vy += oy / d * kick;
        }
      } else {   // a bot
      thrustPilot(b, st.x, st.y, b.boosting, false, dt, b.L.speed * (now < (b.pinnedUntil || 0) ? 0.6 : 1));
      slingshot(b, dt); padsFor(b, now);
      if (Math.hypot(st.x, st.y) > 0.15) b.a = lerpAng(b.a, Math.atan2(st.y, st.x), 1 - Math.exp(-13 * dt));
      gravityOn(b, dt);
      b.x += b.vx * dt; b.y += b.vy * dt;
      const pc = bounceOff(b, 40, 0.6);
      if (pc && pc.vn < -200) {
        impact(b.x - pc.nx * 40, b.y - pc.ny * 40, "#ffd9b0", 1.2);
        const dmg = hurtsOnHit(pc.b) ? crashDmg(-pc.vn, false) : 0;
        if (dmg > 0) botHurt(b, dmg, "p", now, false);
      }
      if (b.x < 40 || b.x > W - 40) { b.vx = -b.vx * 0.6; b.x = clamp(b.x, 40, W - 40); }
      if (b.y < 40 || b.y > H - 40) { b.vy = -b.vy * 0.6; b.y = clamp(b.y, 40, H - 40); }
      }
      // shoot when the nose points at the target (where it will be)
      b.fireCd -= dt;
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
      if (human) pilotTriggers(b, dt, now);
      else if (tgt && roundLive && td < 950 && Math.abs(angD(aimA - b.a)) < 0.22 + b.L.aim && b.fireCd <= 0) { const cd = botFire(b, now);   // rapid guns fire faster than the bot's usual pace, slow guns slower
        const md = MODES[MODE];
        b.fireCd = (md.botCd ? b.L.cd * md.botCd : cd < 0.15 ? cd * 2 : Math.max(b.L.cd, cd * 1.3)) * (0.7 + Math.random() * 0.6); }
      // another pilot ramming my bot on boost (the bot is the victim, so its owner decides)
      for (const [rid, r] of remotes) {
        if (botById.has(rid) || r.dead || !(r.boost > 0) || !r.tag || mates(r, b)) continue;
        if (Math.hypot(r.x - b.x, r.y - b.y) < 31 * (sizeOf(r.lv || 1) + 1) && (!b.rammedBy || now - b.rammedBy > 400)) {
          b.rammedBy = now;
          const dx = b.x - r.x, dy = b.y - r.y, d = Math.hypot(dx, dy) || 1;
          b.vx += dx / d * 900; b.vy += dy / d * 900;
          botHurt(b, r.boost === 2 ? 1.2 : 0.6, r.tag + ".ram" + Math.floor(now), now, false);
        }
      }
      // ramming a bot on boost
      if (playing && !me.dead && !mates(b, me) && me.boostFx > 0 && Math.hypot(me.x - b.x, me.y - b.y) < 31 * (sizeOf(me.lv) + 1) && (!b.rammedAt || now - b.rammedAt > 400)) {
        b.rammedAt = now;
        const dx = b.x - me.x, dy = b.y - me.y, d = Math.hypot(dx, dy) || 1;
        b.vx += dx / d * 900; b.vy += dy / d * 900; me.vx -= dx / d * 260; me.vy -= dy / d * 260;
        sparkShower((b.x + me.x) / 2, (b.y + me.y) / 2, -dy, dx, 1.3); sparkShower((b.x + me.x) / 2, (b.y + me.y) / 2, dy, -dx, 1.3);
        shake = Math.max(shake, 0.4); sfx("ram", 1);
        botHurt(b, me.boostFx === 2 ? 1.2 : 0.6, myTag + ".ram" + Math.floor(now), now, false);
      }
      recordHitPose(b, now);
      // anyone's shots can hit the bot (the bot's own excepted)
      if (now < b.inv) continue;
      for (const s of shots) {
        if (s.life <= 0 || SHOTS[s.kind].inert || !canHurt(s, b, b.id)) continue;
        if (s.kind === K.MINE && SHOTS[K.MINE].life - s.life < MINE_ARM) continue;
        if (targetHit(s, b)) {
          if (pierces(s)) { if (!railOnce(s, b.id)) continue; } else { s.life = 0; s.direct = b.id; }
          shotBurst(s); hitConfirm(s, b.lv, b.x, b.y, remotes.get(b.id)); if (SHOTS[s.kind].shove) pelletShove(b, s, SHOTS[s.kind].shove);
          if (s.kind === K.BOLT || s.kind === K.LASER) boltChain(s, b.x, b.y, b.id, now);
          if (s.kind === K.NAIL || s.kind === K.SPIKE) b.pinnedUntil = now + 1000;
          botHurt(b, shotDmg(s), s.id, now, false, s.kind, Math.atan2(s.vy, s.vx));
        }
      }
    }
  }
  // all bots travel inside my own state message (one publish per tick, whatever the bot count):
  // brokers rate-limit per client, and six bots sending separately would blow past that
  let botTick = 0;
  // what of a bot's state goes on the wire. With 24 bots the host's packet was ~8 KB, eight times a second, and a
  // fifth of it repeated what never changes: the clock and round (the receiver takes the host's), the tag, team,
  // flag and captures (sent when they change and on every full tick), a living bot's death pose, empty lists
  function botWire(b, m, full) {
    const w = { ...m };
    delete w.rd; delete w.ts;
    if (!m.d) { delete w.ds; delete w.dk; delete w.da; }
    for (const k of ["f", "hb", "ko"]) if (!w[k].length) delete w[k];
    const sticky = [m.tg, m.tm, m.fc, m.cp[1], m.sh].join("|");
    if (!full && sticky === b.wireSticky) { delete w.tg; delete w.tm; delete w.fc; delete w.cp; delete w.sh; }
    b.wireSticky = sticky;
    return w;
  }
  function botStates(now) {
    const out = [];
    const full = botTick++ % 10 === 0;   // names/looks/scores every 10th tick; motion, hits and shots every tick
    for (const b of bots) {
      const m = {
        q: ++b.q, rd: stats.round, ts: Date.now(), x: Math.round(b.x), y: Math.round(b.y), vx: Math.round(b.vx), vy: Math.round(b.vy), a: +b.a.toFixed(2),
        t: b.stick && Math.hypot(b.stick.x, b.stick.y) > 0.3 ? 1 : 0, td: b.stick ? +Math.atan2(b.stick.y, b.stick.x).toFixed(2) : undefined, b: now - (b.dashAt || 0) < 350 ? 2 : b.boosting ? 1 : 0, d: b.dead ? 1 : 0, i: now < b.inv ? 1 : 0, ds: b.dead ? b.ds : 0, dk: b.dead ? b.dk || 0 : 0, da: b.dead ? +(b.da || 0).toFixed(2) : 0,
        l: Math.max(0, Math.round(b.lives * 100) / 100), hb: b.hitBy, ko: b.koBy, f: b.shotLog.slice(-9).map(e => e.d),
        tm: b.tm ?? -1, fc: b.fc ?? -1, cp: [stats.round, b.caps || 0], tg: b.tag
      };
      m.sh = b.shield || 0;
      // a player's own HUD (the guns they carry), and which of their controls this state already holds:
      // ak, the last one applied; ag, for how long (ms, including this step), so their screen can compare
      if (b.input) { m.ar = pilotArsenalWire(b); m.tn = b.teleN || 0; m.ak = b.ackSeq || 0; m.ag = Math.round(now - (b.ackAt ?? now)); m.en = Math.round(b.energy);
        if (b.cq) m.mv = moveState(b); }   // flown by commands: exactly where its last one left it (the screen flies the rest again)
      if (full) Object.assign(m, { n: b.name, h: b.hue, ck: b.ck, s: b.st.kills * 5, lv: 1, wp: WEAPON_KEYS.indexOf(botWeapon(b)), tg: b.tag,
        st: [stats.round, b.st.kills, b.st.deaths, b.st.shots, b.st.hits, b.st.best] });
      applyRemote(b.id, m);   // show it here
      out.push([b.id, botWire(b, m, full)]);
    }
    return out;
  }

