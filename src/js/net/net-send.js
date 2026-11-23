  // my state (and my bots') out to everyone, at the transport's rate; the scoreboard twice a second
  function netSend(dt, now) {
    const elapsed = Math.max(dt, Math.min(0.25, (now - lastNetTick) / 1000)); lastNetTick = now;
    sendAcc += elapsed; slowAcc += elapsed;
    if (playing && !serverRun && sendAcc >= 1 / net.hz) {   // on the server only my controls go out (net/server-client.js)
      sendAcc %= 1 / net.hz;   // keep the remainder: frames don't divide the interval evenly, and dropping it sent 7.5 a second for 8
      const msg = {
        q: ++sendSeq, mc: matchReady ? [matchRound, matchStart, matchEnd] : undefined, rd: stats.round, hb: hitBy, ko: koBy, ts: Date.now(), x: Math.round(me.x), y: Math.round(me.y),
        vx: Math.round(me.vx), vy: Math.round(me.vy), a: +me.a.toFixed(2),
        t: me.thrust > 0.3 ? 1 : 0, b: me.boostFx, d: me.dead ? 1 : 0, i: now < me.inv ? 1 : 0, ds: me.dead ? me.ds : 0,
        dk: me.dead ? me.dk : 0, da: me.dead ? +me.da.toFixed(2) : 0, tm: me.tm ?? -1,   // the team rides every message: shots need it
        td: Number.isFinite(me.tdir) ? +me.tdir.toFixed(2) : undefined,   // which way I push (the jets show it)
        bw: me.weapon === "saw" && charge > 0 && !me.dead ? +charge.toFixed(2) : undefined,   // the Blood Blade wound up this far (others see it drawn back)
        em: emoteWire(me, now)   // an emote just made
      };
      const slow = {
        tm: me.tm ?? -1, fc: me.fc ?? -1, cp: [stats.round, me.caps || 0], pg: Math.round(myPing / 10) * 10, bc: bots.length ? [bots.length, bots[0].level] : 0,
        tg: myTag, n: me.name, h: me.hue, ck: me.ck, s: me.score, l: Math.round(me.lives * 100) / 100, am: amped(me, now) ? 1 : 0, sh: Math.round(me.shield * 100) / 100, wp: WEAPON_KEYS.indexOf(me.weapon), g: myGrabs, hb: hitBy, ko: koBy,
        st: [stats.round, stats.kills, stats.deaths, stats.shots, stats.hits, stats.best],
        // Keep live deltas within the packet budget; rolling terrain snapshots repair older holes.
        cv: myCarves.filter(e => performance.now() - e.at < 4000).slice(-128).map(e => e.d),
        wd: myGunDrops.filter(d => Date.now() - d[5] < GUN_DROP_LIFE).slice(-3).map(d => d.slice(0, 5))
      };
      const sig = JSON.stringify(slow);
      if ((sig !== lastSlow && slowAcc >= 0.1) || slowAcc >= 1) { Object.assign(msg, slow); lastSlow = sig; slowAcc = 0; }
      // always send the list when shots ride in the state, even empty: the Claude room merges presence
      // field by field, so an omitted "f" would keep old shots there forever and they could come back as ghosts
      if (net.shotsInState) msg.f = myShotLog.slice(-24).map(e => e.d);
      if (guided || now < guideOutUntil) msg.gw = guideOut;   // my guided nuke's course (and where it blew)
      if (bots.length) {
        const bs = botStates(now);
        if (standalone) msg.bots = bs;   // the Claude room's presence is too small for bots: they stay local there
      }
      const terrain = nextTerrain();
      if (terrain) msg.terrain = terrain;
      msg.rk = nextRockMotion();
      net.send(msg);
    }
    boardAcc += dt;
    if (boardAcc > 0.5) { boardAcc = 0; renderBoard(); renderFeed(); }
  }
