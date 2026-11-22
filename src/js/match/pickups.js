  function updatePickups(dt, now) {
    if (serverRun) { if (roundLive) serverPickups(now); return; }   // on the server, what I pick up is its call: shown at once, confirmed by its snapshots
    if (!roundLive) return;
    // sparks
    if (playing && !me.dead) {
      for (let i = 0; i < SLOTS; i++) {
        const s = world.sparks[i];
        if (grabbed.has(s.key) || s.age < 0.04) continue;
        if (Math.hypot(wrapD(s.x - me.x, W), wrapD(s.y - me.y, H)) < 52 + magnet()) {
          grabbed.add(s.key); pushCapped(myGrabs, s.key, 40);
          const val = s.gold ? 5 : 1;
          me.score += val;
          showScore();
          floaters.push({ x: s.x, y: s.y, t: 0, txt: "+" + val, gold: s.gold });
          for (let k = 0; k < (s.gold ? 30 : 14); k++) {
            const a = Math.random() * 6.28, v = 60 + Math.random() * 200;
            puff(s.x, s.y, Math.cos(a) * v, Math.sin(a) * v, 0.5 + Math.random() * 0.6, 1.5 + Math.random() * 2, s.gold ? "#ffd36b" : "#ffffff");
          }
          audioCue("pickup");
        }
      }
    }
    // trophies: a dead pilot's gun, with its ammo
    for (const [id, d] of gunDrops) {
      if (now - d.born > GUN_DROP_LIFE) { gunDrops.delete(id); continue; }
      const key = "W" + id;
      if (!playing || me.dead || grabbed.has(key) || now - d.born < 600 || Math.hypot(d.x - me.x, d.y - me.y) > 60 + magnet()) continue;
      grabbed.add(key); pushCapped(myGrabs, key, 40);
      const w = WEAPONS[d.type];
      me.arsenal[d.type] = Number.isFinite(w.ammo) ? Math.min(w.ammo * 2, (me.arsenal[d.type] || 0) + d.ammo) : Infinity;   // (a blade never runs out)
      renderWeapon();
      floaters.push({ x: d.x, y: d.y - 20, t: 0, txt: "TROPHY · " + w.name.toUpperCase(), gold: true });
      for (let k = 0; k < 30; k++) { const a = Math.random() * 6.28, v = 80 + Math.random() * 220; puff(d.x, d.y, Math.cos(a) * v, Math.sin(a) * v, 0.6, 2.2, k % 2 ? "#ffd36b" : w.col); }
      if (d.type === "nuke") packPlay("p_ut_nuke_pick", .9); else sfx("weapon_get", 0.9, 0.85);
    }
    // medkits and shields (left on the ground when they would do nothing, like in Doom)
    if (playing && !me.dead) {
      for (const c of world.supplies) {
        if (grabbed.has(c.key) || c.age < 0.05) continue;
        if (Math.hypot(c.x - me.x, c.y - me.y) > 56 + magnet()) continue;
        const sp = SUPPLIES[c.type];
        if (!applySupply(me, c.type)) continue;
        grabbed.add(c.key); pushCapped(myGrabs, c.key, 40);
        renderHearts(false); renderShield();
        floaters.push({ x: c.x, y: c.y - 20, t: 0, txt: sp.name, gold: !!sp.big });
        for (let k = 0; k < 26; k++) { const a = Math.random() * 6.28, v = 80 + Math.random() * 200; puff(c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, 0.6, 2.2, sp.col); }
        impacts.push({ x: c.x, y: c.y, t: 0, r: 70, col: sp.col });
        sfx(sp.heal ? "heal" : "shield_get", 0.8);
      }
    }
    // Overdrive
    if (!serverRun && playing && !me.dead && world.amp && !grabbed.has(world.amp.key) && Math.hypot(world.amp.x - me.x, world.amp.y - me.y) < 60 + magnet()) {
      const c = world.amp;
      grabbed.add(c.key); pushCapped(myGrabs, c.key, 40);
      me.ampUntil = now + AMP_TIME;
      announce("QUAD DAMAGE", "four times the damage for 20 seconds", "#6fa8ff", 4);
      for (let k = 0; k < 50; k++) { const a = Math.random() * 6.28, v = 100 + Math.random() * 300; puff(c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, 0.8, 2.5, k % 2 ? "#5b9bff" : "#ffffff"); }
      rings.push({ x: c.x, y: c.y, t: 0, r: 260, col: "91,155,255", warp: true, dur: 0.6, w: 14 });
    }
    // a gun lying on its spot hums as you come near (once per approach)
    if (playing && !me.dead) for (const c of world.picks) {
      const d = Math.hypot(c.x - me.x, c.y - me.y), k = "h" + Math.round(c.x) + ":" + Math.round(c.y);
      if (d < 260 && !grabbed.has(c.key) && !spotHeard.has(k)) { spotHeard.add(k); packPlay("p_spot", 0.5, c.x, c.y); }
      else if (d > 520) spotHeard.delete(k);
    }
    // weapon crates
    if (playing && !me.dead) {
      for (const c of [...world.picks, ...world.bombs]) {
        if (grabbed.has(c.key) || c.age < (BOMB_CRATES[c.type] ? 0.01 : 0.05)) continue;
        if (Math.hypot(c.x - me.x, c.y - me.y) < 56 + magnet()) {
          grabbed.add(c.key); pushCapped(myGrabs, c.key, 40);
          const w = WEAPONS[c.type];
          const had = !!me.arsenal[c.type];   // a gun you already carry just gets more ammo; a new one joins the gun bar
          me.arsenal[c.type] = Math.min(w.ammo * 2, (me.arsenal[c.type] || 0) + w.ammo);
          renderWeapon();   // it goes into the gun bar; the gun in your hands stays until you switch
          const key = COARSE ? "" : " · press " + weaponKey(c.type);
          floaters.push({ x: c.x, y: c.y - 20, t: 0, txt: had ? "+AMMO " + w.name.toUpperCase() : w.name.toUpperCase() + key, gold: true });
          for (let k = 0; k < 30; k++) { const a = Math.random() * 6.28, v = 80 + Math.random() * 220; puff(c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, 0.6, 2.2, w.col); }
          if (c.type === "nuke") packPlay("p_ut_nuke_pick", .9); else sfx("weapon_get", 0.8);
        }
      }
    }
  }
