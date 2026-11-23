  // Bins meeting bins (bots, players' pilots on the server, and my own bin when this page runs the bots): each pair
  // once, pushed apart by their overlap (the lighter further) and struck by weight (collide, a fairly dead bounce,
  // e 0.5). What each one feels (its change of speed) is what hurts it (knockDmg): a ram on boost or a dash hurts the
  // one rammed, and the credit is the rammer's; the rammer, nose first, takes 40% of what it feels; a plain crash at
  // speed hurts both, and nobody gets the credit
  function binContacts(now) {
    const list = bots.filter(b => !b.dead);
    if (!serverRun && playing && !me.dead) list.push(me);
    for (let i = 0; i < list.length; i++) for (let k = i + 1; k < list.length; k++) {
      const a = list[i], b = list[k], R = 62;
      const dx = a.x - b.x, dy = a.y - b.y;
      if (Math.abs(dx) >= R || Math.abs(dy) >= R) continue;
      const d = Math.hypot(dx, dy);
      if (d >= R || d <= 0.01) continue;
      const nx = dx / d, ny = dy / d, ma = BIN_MASS, mb = BIN_MASS, over = R - d;
      a.x += nx * over * mb / (ma + mb); a.y += ny * over * mb / (ma + mb); b.x -= nx * over * ma / (ma + mb); b.y -= ny * over * ma / (ma + mb);
      const j = collide(a, ma, b, mb, nx, ny, 0.5);
      if (j <= 0) continue;
      const dvA = j / ma, dvB = j / mb, ramOf = o => o === me ? me.boostFx > 0 : o.boosting || now - (o.dashAt || 0) < 350;
      const ramA = ramOf(a), ramB = ramOf(b), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      impact(cx, cy, "#bdfff6", Math.min(1.6, 0.4 + j / 600));
      if (j > 350) { sparkShower(cx, cy, -ny, nx, Math.min(1.5, j / 600)); sparkShower(cx, cy, ny, -nx, Math.min(1.5, j / 600)); oilSplash(cx, cy, Math.min(16, j / 60), Math.min(420, j * 0.5), (a.vx + b.vx) / 2, (a.vy + b.vy) / 2); }
      sfx("ram", Math.min(1, 0.3 + j / 900), 1, cx, cy);
      if ((a === me || b === me) && j > 350) shake = Math.max(shake, Math.min(0.6, j / 1500));
      if (!roundLive || mates(a, b) || now - ((a.knocks ||= new WeakMap()).get(b) || 0) < 300) continue;
      a.knocks.set(b, now);
      const hit = (o, other, dv, rammer, rammed, ux, uy) => {
        if (rammed && !rammer && !(o === me && serverRun)) { o.vx += ux * RAM_PUSH; o.vy += uy * RAM_PUSH; }   // thrown off by a ram
        const dmg = knockDmg(dv) * (rammer && !rammed ? 0.4 : rammed && !rammer ? RAM_DMG : 1);
        if (dmg <= 0) return;
        const id = rammed && !rammer && other.tag ? other.tag + ".ram" + Math.floor(now) : (o === me ? myTag : o.tag || "x") + ".crash" + Math.floor(now);
        if (o === me) { if (hurt(now, dmg) && rammed && other.tag) { pushCapped(hitBy, id, 12); if (me.dead) { meKilled(id); } } }
        else botHurt(o, dmg, rammed && !rammer ? id : "p", now, false);
      };
      hit(a, b, dvA, ramA, ramB, nx, ny); hit(b, a, dvB, ramB, ramA, -nx, -ny);
    }
  }
  // all bots travel inside my own state message (one publish per tick, whatever the bot count):
  // brokers rate-limit per client, and six bots sending separately would blow past that
  let botTick = 0;
  // a station's loose crates and drums against the pilots flown by commands (me, a player on the server): met here, in
  // the world's step as other pilots are, not in the flight (where a crate that has moved since could not be flown
  // again exactly); a bin shoves a crate by weight and is pushed back. (Bots meet them in their own flight.)
  function propContacts() {
    const fliers = bots.filter(b => b.input && !b.dead);
    if (playing && !me.dead && !serverRun) fliers.push(me);   // (on the server, its word on where I am)
    for (const o of fliers) bounceOff(o, WALL_R, WALL_BOUNCE, BIN_MASS, "only");
  }
