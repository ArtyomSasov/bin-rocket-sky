  // ---------- bots (simulated here, broadcast like real pilots) ----------
  const BOT_NAMES = ["Rusty", "Bolt", "Zappy", "Clank", "Nova", "Sprocket", "Dusty", "Orbit"];
  const BOT_LEVELS = { easy: { aim: 0.26, cd: 0.7, speed: 0.75, label: "Easy" }, normal: { aim: 0.13, cd: 0.45, speed: 0.9, label: "Normal" }, hard: { aim: 0.05, cd: 0.3, speed: 1, label: "Hard" } };
  const bots = [], botById = new Map(), botCredited = new Set();
  function addBots(n, level) {
    const L = BOT_LEVELS[level];
    for (let i = 0; i < n; i++) {
      const id = "pb" + Math.random().toString(36).slice(2, 8);
      const b = { id, tag: "b" + Math.random().toString(36).slice(2, 7), name: BOT_NAMES[(bots.length) % BOT_NAMES.length] + " (bot)", L,
        hue: Math.floor(Math.random() * 360), ck: [Math.floor(Math.random() * 7), Math.floor(Math.random() * 6), Math.floor(Math.random() * 5), Math.floor(Math.random() * 5), Math.floor(Math.random() * 6)],
        ...spawnPoint(), vx: 0, vy: 0, a: Math.random() * 6.28, lives: LIVES, dead: false, respawnAt: 0, inv: 0, ds: 0,
        fireCd: 1 + Math.random(), side: Math.random() < 0.5 ? 1 : -1, wander: Math.random() * 6.28, seq: 0, q: 0,
        weapon: "fire", shotLog: [], hitBy: [], koBy: [], st: { kills: 0, deaths: 0, shots: 0, hits: 0, streak: 0, best: 0 } };
      bots.push(b); botById.set(id, b);
    }
  }
  function creditBots(list, ko) {
    for (const k of list) {
      if (typeof k !== "string") continue;
      const key = (ko ? "ko" : "") + k;
      if (botCredited.has(key)) continue;
      for (const b of bots) if (k.startsWith(b.tag + ".")) {
        botCredited.add(key);
        if (ko) { b.st.kills++; b.st.streak++; b.st.best = Math.max(b.st.best, b.st.streak); } else b.st.hits++;
      }
    }
  }
  function botHurt(b, dmg, shotId, now, force, kind = -1, ang = 0) {
    if (b.dead || (!force && now < b.inv) || !roundLive) return;
    b.lives = Math.round((b.lives - dmg) * 1000) / 1000;
    const shown = remotes.get(b.id); if (shown) shown.hitAt = performance.now();
    const byHole = shotId === "x" || shotId === "p";   // the black hole or a planet: nobody gets credit
    if (!byHole) pushCapped(b.hitBy, shotId, 12);
    if (b.lives <= 0) {
      b.dead = true; b.respawnAt = now + 3000; b.fc = -1; b.weapon = "fire"; b.ds = 1 + Math.floor(Math.random() * 4); b.dk = deathStyleOf(kind); b.da = ang;
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
    volley(b, now, pat, null, w === "bolt" ? boltLock(b, null) : undefined);
    shotSound(pat.shot[0], b.x, b.y);
    b.vx -= Math.cos(b.a) * 25; b.vy -= Math.sin(b.a) * 25;
    if (!MODES[MODE].only && w !== "fire" && --b.ammo <= 0) b.weapon = "fire";
    return pat.cd;
  }
  function updateBots(dt, now) {
    if (!bots.length) return;
    creditBots(hitBy, false); creditBots(koBy, true);   // bots that hit or killed me
    const ev = eventAt(clockNow()), bh = ev.active && ev.type === "blackhole" ? blackHole(ev) : null;
    for (const b of bots) {
      while (b.shotLog.length && now - b.shotLog[0].at > 700) b.shotLog.shift();
      if (b.dead) {
        if (now < b.respawnAt) continue;
        Object.assign(b, { dead: false, lives: LIVES, inv: now + 2000, ...spawnPoint(b.tm), vx: 0, vy: 0 });
      }
      // nearest living target: me or anyone else in the lobby (other bots included)
      let tgt = null, td = 1700;
      if (playing && !me.dead && !mates(b, me)) { const d = Math.hypot(me.x - b.x, me.y - b.y); if (d < td) { td = d; tgt = me; } }
      for (const [rid, r] of remotes) {
        if (rid === b.id || r.dead || mates(r, b)) continue;
        const d = Math.hypot(r.x - b.x, r.y - b.y);
        if (d < td) { td = d; tgt = r; }
      }
      let dx = 0, dy = 0;
      if (tgt) {
        const ax = (tgt.x - b.x) / td, ay = (tgt.y - b.y) / td, want = td > 430 ? 1 : td < 260 ? -0.8 : 0;
        dx = ax * want - ay * 0.65 * b.side; dy = ay * want + ax * 0.65 * b.side;
        if (Math.random() < dt * 0.4) b.side = -b.side;
      } else {
        b.wander += (Math.random() - 0.5) * dt * 2; dx = Math.cos(b.wander); dy = Math.sin(b.wander);
      }
      if (bases && onTeam(b)) {
        const ef = 1 - b.tm, home = bases[b.tm], thief = flagCarrier[b.tm];
        let goal = null, w = 1.6;
        if (b.fc === ef) { goal = home; w = 3; }                                  // bring it home
        else if (thief) goal = thief.o;                                          // get our flag back
        else if (b.attacker && !flagCarrier[ef]) goal = bases[ef];               // go and grab theirs
        else if (!b.attacker && Math.hypot(home.x - b.x, home.y - b.y) > 500) goal = home;   // guard
        if (goal) { const gx = goal.x - b.x, gy = goal.y - b.y, gd = Math.hypot(gx, gy) || 1; dx += gx / gd * w; dy += gy / gd * w; }
      }
      if (!MODES[MODE].only && roundLive) {
        let best = null, bd = b.weapon === "fire" && td > 700 ? 1300 : 0;
        for (const c of world.picks) {
          if (grabbed.has(c.key) || c.age < 0.05 || c.type === "mine") continue;   // mines are left for players
          const d = Math.hypot(c.x - b.x, c.y - b.y);
          if (d < 34 + 30) {   // picked up
            grabbed.add(c.key); pushCapped(myGrabs, c.key, 40);
            b.weapon = c.type; b.ammo = Math.ceil(WEAPONS[c.type].ammo * (c.type === "laser" || c.type === "bolt" ? 0.4 : 1));
            for (let k = 0; k < 20; k++) { const a = Math.random() * 6.28, v = 80 + Math.random() * 200; puff(c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, 0.5, 2, WEAPONS[c.type].col); }
            sfx("weapon_get", 0.5, 1, c.x, c.y);
            best = null; break;
          }
          if (d < bd) { bd = d; best = c; }
        }
        if (best) { const gx = best.x - b.x, gy = best.y - b.y, gd = Math.hypot(gx, gy) || 1; dx += gx / gd * 1.4; dy += gy / gd * 1.4; }
      }
      const m = 260;   // keep off the fence
      if (b.x < m) dx += (m - b.x) / m * 2.5; if (b.x > W - m) dx -= (b.x - W + m) / m * 2.5;
      if (b.y < m) dy += (m - b.y) / m * 2.5; if (b.y > H - m) dy -= (b.y - H + m) / m * 2.5;
      for (const p of bodies) {   // and around planets and moons
        const hx = b.x - p.x, hy = b.y - p.y, hd = Math.hypot(hx, hy) || 1, gap = hd - p.rr;
        if (gap < 280) { dx += hx / hd * 3 * (1 - gap / 280); dy += hy / hd * 3 * (1 - gap / 280); }
      }
      if (bh) {   // and away from a black hole
        const hx = b.x - bh.x, hy = b.y - bh.y, hd = Math.hypot(hx, hy) || 1;
        if (hd < 900) { dx += hx / hd * 3 * (1 - hd / 900) * 2; dy += hy / hd * 3 * (1 - hd / 900) * 2; }
        if (hd < 1500) { const acc = bh.k * 9e7 / (hd * hd + 1.5e4); b.vx -= hx / hd * acc * dt; b.vy -= hy / hd * acc * dt; }
        if (hd < 60 * bh.k) botHurt(b, 99, "x", now, true);
      }
      const dm = Math.hypot(dx, dy) || 1, top = 540 * b.L.speed;
      const resp = 1 - Math.exp(-2.4 * dt);
      b.vx += (dx / dm * top - b.vx) * resp; b.vy += (dy / dm * top - b.vy) * resp;
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
      // aim (with some error) and shoot
      const aim = tgt ? Math.atan2(tgt.y + (tgt.vy || 0) * 0.25 - b.y, tgt.x + (tgt.vx || 0) * 0.25 - b.x) + Math.sin(now / 400 + b.seq) * b.L.aim
                      : Math.atan2(b.vy, b.vx);
      b.a = lerpAng(b.a, aim, 1 - Math.exp(-5 * dt));
      b.fireCd -= dt;
      if (tgt && roundLive && td < 950 && Math.abs(angD(aim - b.a)) < 0.3 && b.fireCd <= 0) { const cd = botFire(b, now);   // rapid guns fire faster than the bot's usual pace, slow guns slower
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
        shake = Math.max(shake, 0.4); sfx("ram", 1) || blip(120, 0.2, "square");
        botHurt(b, me.boostFx === 2 ? 1.2 : 0.6, myTag + ".ram" + Math.floor(now), now, false);
      }
      // anyone's shots can hit the bot (the bot's own excepted)
      for (const s of shots) {
        if (s.life <= 0 || s.kind === K.NUKE || !canHurt(s, b, b.id)) continue;
        if (s.kind === K.MINE && SHOTS[K.MINE].life - s.life < MINE_ARM) continue;
        if (segHit(s, b.x, b.y, binR(b.lv) + SHOTS[s.kind].r)) {
          if (s.kind === K.RAIL) { if (!railOnce(s, b.id)) continue; } else { s.life = 0; s.direct = b.id; }
          shotBurst(s); hitConfirm(s, b.lv, b.x, b.y, remotes.get(b.id)); if (SHOTS[s.kind].shove) pelletShove(b, s, SHOTS[s.kind].shove);
          if (s.kind === K.BOLT) boltChain(s, b.x, b.y, b.id, now);
          botHurt(b, shotDmg(s), s.id, now, false, s.kind, Math.atan2(s.vy, s.vx));
        }
      }
    }
  }
  // all bots travel inside my own state message (one publish per tick, whatever the bot count):
  // brokers rate-limit per client, and six bots sending separately would blow past that
  let botTick = 0;
  function botStates(now) {
    const out = [];
    const full = botTick++ % 10 === 0;   // names/looks/scores every 10th tick; motion, hits and shots every tick
    for (const b of bots) {
      const m = {
        q: ++b.q, x: Math.round(b.x), y: Math.round(b.y), vx: Math.round(b.vx), vy: Math.round(b.vy), a: +b.a.toFixed(2),
        t: 1, b: 0, d: b.dead ? 1 : 0, i: now < b.inv ? 1 : 0, ds: b.dead ? b.ds : 0, dk: b.dead ? b.dk || 0 : 0, da: b.dead ? +(b.da || 0).toFixed(2) : 0,
        l: Math.max(0, Math.round(b.lives * 100) / 100), hb: b.hitBy, ko: b.koBy, f: b.shotLog.map(e => e.d),
        tm: b.tm ?? -1, fc: b.fc ?? -1, cp: [stats.round, b.caps || 0], tg: b.tag
      };
      if (full) Object.assign(m, { n: b.name, h: b.hue, ck: b.ck, s: b.st.kills * 5, lv: 1, sh: 0, wp: WEAPON_KEYS.indexOf(botWeapon(b)), tg: b.tag,
        st: [stats.round, b.st.kills, b.st.deaths, b.st.shots, b.st.hits, b.st.best] });
      applyRemote(b.id, m);   // show it here
      out.push([b.id, m]);
    }
    return out;
  }

