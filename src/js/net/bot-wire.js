  // what of a bot's state goes on the wire. With 24 bots the host's packet was ~8 KB, eight times a second, and a
  // fifth of it repeated what never changes: the clock and round (the receiver takes the host's), the tag, team,
  // flag and captures (sent when they change and on every full tick), a living bot's death pose, empty lists
  // (m is this tick's own state, already shown here: it is trimmed in place, not copied)
  function botWire(b, m, full) {
    delete m.rd; delete m.ts;
    if (!m.d) { delete m.ds; delete m.dk; delete m.da; }
    for (const k of ["f", "hb", "ko"]) if (!m[k].length) delete m[k];
    const sticky = [m.tg, m.tm, m.fc, m.cp[1], m.sh].join("|");
    if (!full && sticky === b.wireSticky) { delete m.tg; delete m.tm; delete m.fc; delete m.cp; delete m.sh; }
    b.wireSticky = sticky;
    return m;
  }
  function botStates(now) {
    const out = [];
    const full = botTick++ % 10 === 0;   // names/looks/scores every 10th tick; motion, hits and shots every tick
    for (const b of bots) {
      const m = {
        q: ++b.q, rd: stats.round, ts: Date.now(), x: Math.round(b.x), y: Math.round(b.y), vx: Math.round(b.vx), vy: Math.round(b.vy), a: +b.a.toFixed(2),
        t: b.stick && Math.hypot(b.stick.x, b.stick.y) > 0.3 ? 1 : 0, td: b.stick ? +Math.atan2(b.stick.y, b.stick.x).toFixed(2) : undefined, b: now - (b.dashAt || 0) < 350 ? 2 : b.boosting ? 1 : 0, d: b.dead ? 1 : 0, i: now < b.inv ? 1 : 0, ds: b.dead ? b.ds : 0, dk: b.dead ? b.dk || 0 : 0, da: b.dead ? +(b.da || 0).toFixed(2) : 0,
        l: Math.max(0, Math.round(b.lives * 100) / 100), hb: b.hitBy, ko: b.koBy, f: b.shotLog.slice(-9).map(e => e.d),
        tm: b.tm ?? -1, fc: b.fc ?? -1, cp: [stats.round, b.caps || 0], tg: b.tag,
        bw: b.charge > 0 && !b.dead && botWeapon(b) === "saw" ? +b.charge.toFixed(2) : undefined   // its Blood Blade wound up this far
      };
      m.sh = b.shield || 0;
      m.am = Math.ceil(ampLeft(b, now));   // Quad damage: the seconds it has left
      // a player's own HUD (the guns they carry), and which of their controls this state already holds:
      // ak, the last one applied; ag, for how long (ms, including this step), so their screen can compare
      if (b.input) { m.ar = pilotArsenalWire(b); m.ak = (b.cq ? b.cmdAck : b.ackSeq) || 0; m.ag = Math.round(now - (b.ackAt ?? now)); m.en = Math.round(b.energy);
        if (b.cq) m.mv = moveState(b);
        m.al = [b.beltArmor || 0, b.bodyArmor || 0, b.padsArmor || 0].map(v => Math.round(v * 1000) / 1000); }   // the armour, layer by layer   // flown by commands: exactly where its last one left it (the screen flies the rest again)
      if (full) Object.assign(m, { n: b.name, h: b.hue, ck: b.ck, s: b.st.kills * 5, lv: 1, wp: WEAPON_KEYS.indexOf(botWeapon(b)), tg: b.tag,
        st: [stats.round, b.st.kills, b.st.deaths, b.st.shots, b.st.hits, b.st.best] });
      applyRemote(b.id, m);   // show it here
      out.push([b.id, botWire(b, m, full)]);
    }
    return out;
  }

