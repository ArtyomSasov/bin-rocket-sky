  // ---------- feel: others shown smoothly, my hits and pick-ups at once ----------
  // The server's clock, as seen here: srv.off = its time - mine, from the snapshots' stamps. A snapshot that came
  // quickly says the most about the offset, so it rises fast and sinks slowly (late arrivals are jitter, not drift);
  // how late they come (srv.jit) sets how far back the others are shown: two snapshot gaps and the jitter, which is
  // what Source (cl_interp) and Glenn Fiedler's snapshot interpolation do to always have a next snapshot in hand
  function serverClock(ts) {
    if (!Number.isFinite(ts)) return;
    const o = clamp(ts - Date.now(), -120000, 120000);
    if (!Number.isFinite(srv.off)) srv.off = o;
    else srv.off += (o - srv.off) * (o > srv.off ? 0.3 : 0.01);
    srv.jit += (Math.max(0, srv.off - o) - srv.jit) * 0.05;
    srv.interp = clamp(2000 / srv.sendHz + 2 * srv.jit, 50, 150);
  }
  // a pilot of the server's, where it was srv.interp ms ago: between the two snapshots around that moment (a gap
  // longer than a pilot can fly is a respawn or a teleport, shown as a jump); past the newest one, carried on
  // briefly along its last motion
  function serverInterp(r) {
    const buf = r.buf, t = Date.now() + (srv.off || 0) - srv.interp;
    while (buf.length > 2 && buf[1].t <= t) buf.shift();
    const a = buf[0], b = buf[1];
    let x = a.x, y = a.y, ang = a.a;
    if (b && Math.hypot(b.x - a.x, b.y - a.y) > 300) { if (t >= b.t) { x = b.x; y = b.y; ang = b.a; } }   // a jump
    else if (b && t > a.t) {
      // between the two (f <= 1), or past the newest: carried on along the last motion for at most 100 ms
      const f = Math.min((t - a.t) / (b.t - a.t || 1), 1 + 100 / (b.t - a.t || 1));
      x = a.x + (b.x - a.x) * f; y = a.y + (b.y - a.y) * f; ang = a.a + angD(b.a - a.a) * Math.min(f, 1);
    }
    r.x = clamp(x, 0, W); r.y = clamp(y, 0, H); r.a = ang; r.tx = r.x; r.ty = r.y;
    // invulnerable (a dash, a respawn) at the moment shown: the server judges my shots at that moment, not at the
    // newest state's (which is ahead of what I see)
    r.shownInv = !!(t >= (b?.t ?? Infinity) ? b.iv : a.iv);
    // where it was shown, moment by moment: a hitscan shot (the laser pistol, bullets) flies a few frames, and the
    // server meets it all the way with the target where it stood when the shot was fired (hitPose); judged here
    // against the target flying on, a shot shown hitting a moving pilot was one the server missed
    recordHitPose(r, performance.now());
  }
  // my shot reaching someone on my screen: its hit is shown now (spark, number, sound), as Overwatch and CS do; the
  // damage is still the server's call, which comes a round trip later. Over a long round trip the guess is too often
  // wrong, so then only the server's word is shown
  const HIT_GUESS_MS = 220;
  // The damage of my hits shown but not confirmed yet counts against the target's health as last reported (shields
  // included): once by that count it is dead, the server has most likely killed it already, and more hits on it are
  // not shown (they would only turn out to be misses), as Overwatch shows a predicted kill
  function serverHitFx(s, rid, r) {
    if ((myPing || 0) > HIT_GUESS_MS) return;
    const now = performance.now(), keep = 400 + (myPing || 100) * 2;
    let owed = 0; for (const h of srv.hits) if (h.rid === rid && now - h.at < keep) owed += h.dmg || 0;
    if (Number.isFinite(r.lives) && r.lives + (r.shield || 0) - owed <= 0) return;
    hitConfirm({ ...s, mine: true }, r.lv, r.x, r.y, r);
    srv.hits.push({ rid, at: now, dmg: shotDmg(s) }); srv.report.hs++;   // (hs: hits shown at once; hc: of them, confirmed; hn: confirmed hits not shown)
    if (srv.hits.length > 64) srv.hits.shift();
  }
  // the server confirms a hit of mine on rid: true if it was shown already (its effects then stay quiet)
  function serverHitShown(rid) {
    const now = performance.now(), keep = 400 + (myPing || 100) * 2;
    while (srv.hits.length && now - srv.hits[0].at > keep) srv.hits.shift();
    const i = srv.hits.findIndex(h => h.rid === rid);
    if (i < 0) { srv.report.hn++; return false; }
    srv.hits.splice(i, 1); srv.report.hc++;
    return true;
  }
  // Flying through a crate, a trophy or a medkit takes it here at once: it vanishes with its sound and its words,
  // and the gun, ammo or health follow with my state. The server's world then lists it as taken (p.g); if it does
  // not in time (someone was there first, or my flight was a little off) it comes back. My reach is a little short
  // of the server's, so a near miss is not shown as a catch
  const predictedGrabs = new Map(), gunFx = new Map();   // key -> { at, gun }; gun -> when its pick-up was shown
  function burst(x, y, col, n = 30) { for (let k = 0; k < n; k++) { const a = Math.random() * 6.28, v = 80 + Math.random() * 220; puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.6, 2.2, k % 2 ? "#ffd36b" : col); } }
  function serverPickups(now) {
    if (!playing || me.dead || !srv.joined) return;
    const near = (x, y, r) => Math.hypot(x - me.x, y - me.y) < r;
    const take = (key, gun) => { grabbed.add(key); predictedGrabs.set(key, { at: now, gun }); if (gun) gunFx.set(gun, now); };
    const gunGot = (type, x, y, trophy) => {
      const w = WEAPONS[type];
      floaters.push({ x, y: y - 20, t: 0, txt: trophy ? "TROPHY · " + w.name.toUpperCase() : me.arsenal[type] ? "+AMMO " + w.name.toUpperCase() : w.name.toUpperCase() + (COARSE ? "" : " · press " + weaponKey(type)), gold: true });
      burst(x, y, w.col);
      if (type === "nuke") packPlay("p_ut_nuke_pick", .9); else sfx("weapon_get", 0.8);
    };
    if (!MODES[MODE].only) {
      for (const c of world.picks) {
        if (grabbed.has(c.key) || c.age < 0.05 || !near(c.x, c.y, 56)) continue;
        take(c.key, c.type); gunGot(c.type, c.x, c.y, false);
      }
      for (const [id, d] of gunDrops) {
        const key = "W" + id;
        if (grabbed.has(key) || now - d.born < 650 || !near(d.x, d.y, 56)) continue;
        take(key, d.type); gunGot(d.type, d.x, d.y, true);
      }
    }
    if (!MODES[MODE].noSupplies) for (const c of world.supplies) {
      const sp = SUPPLIES[c.type];
      if (grabbed.has(c.key) || c.age < 0.05 || !near(c.x, c.y, 50)) continue;
      // would it do anything? The server's own rule (applySupply), tried on a copy of my health and armour layers
      const t = { lives: me.lives, dead: false, beltArmor: me.beltArmor || 0, bodyArmor: me.bodyArmor || 0, padsArmor: me.padsArmor || 0, shield: me.shield || 0 };
      if (!(t.beltArmor || t.bodyArmor || t.padsArmor)) t.bodyArmor = t.shield;   // (an older server: the total only)
      if (!applySupply(t, c.type)) continue;   // it would do nothing: left lying
      take(c.key, null);
      floaters.push({ x: c.x, y: c.y - 20, t: 0, txt: sp.name, gold: !!sp.big });
      burst(c.x, c.y, sp.col, 26); impacts.push({ x: c.x, y: c.y, t: 0, r: 70, col: sp.col });
      sfx(sp.heal ? "heal" : "shield_get", 0.8);
    }
  }
  // the server's taken keys: what I took here is confirmed; what it still has not taken after a while comes back
  function settleGrabs(g, now) {
    if (!predictedGrabs.size) return;
    const taken = new Set(Array.isArray(g) ? g : []), wait = 450 + (myPing || 100) * 1.6;
    for (const [key, e] of predictedGrabs) {
      if (taken.has(key)) predictedGrabs.delete(key);
      else if (now - e.at > wait) { predictedGrabs.delete(key); grabbed.delete(key); if (e.gun) gunFx.delete(e.gun); }
    }
  }
