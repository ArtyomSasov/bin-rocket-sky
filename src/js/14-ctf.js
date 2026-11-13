  // ---------- capture the flag ----------
  // A flag is carried by whoever claims it (a tie goes to the lowest tag, the same on every screen); nobody holding it
  // means it sits on its pad. The carrier's death sends it home. You score by bringing theirs to your pad while yours is home.
  const flagCarrier = [null, null];   // per team's flag: { id, o } of who has it
  let flagWas = ["", ""];
  const whoName = o => o === me ? "You" : o.name || "Someone";
  function ctfTick(now) {
    if (!bases) return;
    for (const f of [0, 1]) {
      let best = null;
      const claim = (id, o) => { if (!id || o.dead || o.fc !== f || o.tm === f || (o.tm !== 0 && o.tm !== 1)) return; if (!best || id < best.id) best = { id, o }; };
      if (playing) claim(myTag, me);
      for (const r of remotes.values()) claim(r.tag, r);
      flagCarrier[f] = best;
    }
    if (me.fc >= 0 && flagCarrier[me.fc] && flagCarrier[me.fc].o !== me) me.fc = -1;   // someone else got it first
    for (const b of bots) if (b.fc >= 0 && flagCarrier[b.fc] && flagCarrier[b.fc].id !== b.tag) b.fc = -1;
    // grabbing and scoring, for me and my bots
    const actors = [];
    if (playing && !me.dead && (me.tm === 0 || me.tm === 1)) actors.push([me, myTag]);
    if (roundLive) for (const b of bots) if (!b.dead && (b.tm === 0 || b.tm === 1)) actors.push([b, b.tag]);
    for (const [o, tag] of actors) {
      const ef = 1 - o.tm, reach = 70 + 26 * sizeOf(o.lv || 1);
      if (o.fc !== ef && !flagCarrier[ef] && Math.hypot(o.x - bases[ef].x, o.y - bases[ef].y) < reach) { o.fc = ef; flagCarrier[ef] = { id: tag, o }; }
      else if (o.fc === ef && !flagCarrier[o.tm] && Math.hypot(o.x - bases[o.tm].x, o.y - bases[o.tm].y) < reach) {
        o.fc = -1; o.caps = (o.caps || 0) + 1; flagCarrier[ef] = null;
        if (o === me) { me.score += 25; showScore(); gainXp(10, now); }
      }
    }
    // tell everyone what happened to each flag
    for (const f of [0, 1]) {
      const c = flagCarrier[f], id = c ? c.id : "";
      if (id === flagWas[f]) continue;
      const pad = bases[f];
      if (c) {
        const mine = c.o === me;
        announce(mine ? "YOU HAVE THE FLAG" : whoName(c.o) + " has the " + TEAM_NAME[f] + " flag", mine ? "bring it to your pad" : "", TEAM_HEX[f], 1, !mine && f !== me.tm);
        sfx("shield_get", 0.9, 0.8);
      } else {
        const capturedBy = flagWas[f] && [...remotes.values(), me, ...bots].find(o => (o === me ? myTag : o.tag) === flagWas[f]);
        const scored = capturedBy && !capturedBy.dead;
        announce(scored ? TEAM_NAME[1 - f] + " team scores!" : TEAM_NAME[f] + " flag returned", scored ? whoName(capturedBy) + " captured the " + TEAM_NAME[f] + " flag" : "", TEAM_HEX[scored ? 1 - f : f], scored ? 2 : 1, !scored);
        if (scored) { sfx("level_up", 1); rings.push({ x: pad.x, y: pad.y, t: 0, r: 420, col: TEAM_RGB[1 - f], warp: true, dur: 0.8, w: 18 }); }
        renderBoard();
      }
      flagWas[f] = id;
    }
  }
  function drawFlag(x, y, t, now) {
    const col = TEAM_HEX[t];
    g.strokeStyle = "#e8e4f0"; g.lineWidth = 3 * TS; g.lineCap = "round";
    g.beginPath(); g.moveTo(x, y + 34 * TS); g.lineTo(x, y - 38 * TS); g.stroke();
    g.fillStyle = col; g.beginPath(); g.moveTo(x, y - 38 * TS);
    for (let i = 0; i <= 8; i++) g.lineTo(x + i * 5.5 * TS, y - 38 * TS + Math.sin(now / 140 + i * 0.7) * 3.5 * TS * i / 8);
    for (let i = 8; i >= 0; i--) g.lineTo(x + i * 5.5 * TS, y - 14 * TS + Math.sin(now / 140 + i * 0.7) * 3.5 * TS * i / 8);
    g.closePath(); g.fill();
    g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.5;
    g.drawImage(dotSprite(col), x - 20 * TS, y - 60 * TS, 70 * TS, 70 * TS);
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  }
  function drawFlags(now) {
    if (!bases) return;
    for (const t of [0, 1]) {
      const b = bases[t], x = sx(b.x), y = sy(b.y);
      if (onScreen(x, y, 160)) {   // the pad: a glowing ring that turns
        g.globalCompositeOperation = "lighter";
        const pg = g.createRadialGradient(x, y, 20, x, y, 120);
        pg.addColorStop(0, `rgba(${TEAM_RGB[t]},0.3)`); pg.addColorStop(1, `rgba(${TEAM_RGB[t]},0)`);
        g.fillStyle = pg; g.beginPath(); g.arc(x, y, 120, 0, 6.29); g.fill();
        g.globalCompositeOperation = "source-over";
        g.strokeStyle = `rgba(${TEAM_RGB[t]},0.85)`; g.lineWidth = 3; g.setLineDash([12, 9]); g.lineDashOffset = -now / 40;
        g.beginPath(); g.arc(x, y, 86, 0, 6.29); g.stroke(); g.setLineDash([]);
      }
      const c = flagCarrier[t], fx = c ? sx(c.o.x) + 22 : x, fy = c ? sy(c.o.y) - 26 : y;
      if (onScreen(fx, fy, 90)) drawFlag(fx, fy, t, now);
    }
  }
