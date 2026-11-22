  // everyone's numbers for the current round (others' come from their latest state)
  function playerRows() {
    const rows = [{ name: me.name || "You", hue: me.hue, me: true, ping: myPing, score: me.score, kills: stats.kills, deaths: stats.deaths, shots: stats.shots, hits: stats.hits, best: stats.best, tm: me.tm, caps: me.caps || 0 }];
    for (const b of bots) rows.push({ name: b.name, hue: b.hue, ping: 0, score: b.st.kills * 5, ...b.st, tm: b.tm, caps: b.caps || 0 });
    for (const [id, r] of remotes) {
      if (botById.has(id)) continue;
      const st = r.st && r.st[0] === stats.round ? r.st : [0, 0, 0, 0, 0, 0];
      rows.push({ name: r.name, hue: r.hue, ping: r.ping, score: r.st && r.st[0] === stats.round ? r.score : 0, kills: st[1], deaths: st[2], shots: st[3], hits: st[4], best: st[5], tm: r.tm, caps: r.cpRound === stats.round ? r.caps || 0 : 0 });
    }
    return rows;
  }
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const acc = r => r.shots ? Math.min(100, Math.round(r.hits / r.shots * 100)) : 0;
  function teamWinLine() {
    if (!isTeams()) return "";
    const t = teamTotals(), flags = MODES[MODE].flags, sc = i => flags ? t.c[i] + " flags, " + t.k[i] + " kills" : t.k[i] + " kills";
    if (!t.lead) return "A draw · " + sc(0) + " each side";
    const w = t.lead > 0 ? 0 : 1;
    return `<span style="color:${TEAM_HEX[w]}">${TEAM_NAME[w]} team wins</span> · ${sc(w)} to ${sc(1 - w)}`;
  }
  const comparePlayers = (a, b) => (MODES[MODE].flags ? b.caps - a.caps : 0) || b.kills - a.kills || a.deaths - b.deaths;
  function showResults(roundNo) {
    const rows = playerRows().sort(comparePlayers);
    const top = rows[0], tied = rows.length > 1 && comparePlayers(rows[0], rows[1]) === 0;
    const shooters = rows.filter(r => r.shots >= 10);
    const pick = (list, f) => list.length ? list.reduce((a, b) => f(b) > f(a) ? b : a) : null;
    const awards = [
      ["Most kills", pick(rows, r => r.kills), r => r.kills + " kills"],
      ["Sharpshooter", pick(shooters, r => acc(r)), r => acc(r) + "% of shots hit"],
      ["Stormtrooper", shooters.length > 1 ? pick(shooters, r => -acc(r)) : null, r => "only " + acc(r) + "% hit"],
      ["Untouchable", rows.length > 1 ? pick(rows, r => -r.deaths) : null, r => r.deaths + " deaths"],
      ["Rampage", pick(rows, r => r.best), r => r.best + " kills in a row"],
      ["Kamikaze", rows.length > 1 ? pick(rows, r => r.deaths) : null, r => r.deaths + " deaths"]
    ].filter(([, who]) => who);
    const card = document.getElementById("resultsCard");
    card.innerHTML = `<h2>Round ${roundNo} over</h2>
      <div class="winner">${teamWinLine() || (top.kills ? tied ? "Draw · " + top.kills + " kills" : "Winner: " + esc(top.name) + " · " + top.kills + " kills" : "Nobody scored a kill")}</div>
      <table><thead><tr><th>Pilot</th><th>Kills</th><th>Deaths</th>${MODES[MODE].flags ? "<th>Flags</th>" : ""}<th>Points</th><th>Accuracy</th></tr></thead><tbody>
      ${rows.map(r => `<tr class="${r.me ? "me" : ""}"><td${isTeams() && onTeam(r) ? ` style="color:${TEAM_HEX[r.tm]}"` : ""}>${esc(r.name)}${r.me ? " (you)" : ""}</td><td>${r.kills}</td><td>${r.deaths}</td>${MODES[MODE].flags ? `<td>${r.caps}</td>` : ""}<td>${r.score}</td><td>${r.shots ? acc(r) + "%" : "–"}</td></tr>`).join("")}
      </tbody></table>
      <div class="awards">${awards.map(([title, who, why]) => `<div class="award"><b>${title}</b><span>${esc(who.name)}</span><small>${why(who)}</small></div>`).join("")}</div>
      <div class="next" id="nextRound"></div>`;
    document.getElementById("results").hidden = false;
  }

  // round bookkeeping, run every frame
  let shownRound = -1, resultsFor = -1, resultsAt = 0, preparedFor = -1;
  // the round is over: the announcer tells you how it went (only when someone else took part)
  function roundEndVoice() {
    const rows = playerRows();
    if (rows.length < 2) return;
    rows.sort(comparePlayers);
    if (isTeams() ? teamTotals().lead === 0 : comparePlayers(rows[0], rows[1]) === 0) return;
    const top = rows[0];
    const won = isTeams() ? (teamTotals().lead || 0) * (me.tm === 0 ? 1 : -1) > 0 : top.me && stats.kills > 0;
    setTimeout(() => { const line = won ? (stats.deaths === 0 ? "v_flawless" : "v_win") : "v_lose"; sfx(line, 1); }, 600);
  }
  let decidedRound = -1;
  // the best score in the lobby, in the unit the limit counts: kills, team kills, or flags
  function leaderScore() {
    if (isTeams()) { const t = teamTotals(); return MODES[MODE].flags ? Math.max(...t.c) : Math.max(...t.k); }
    return Math.max(0, ...playerRows().map(r => r.kills));
  }
  function roundTick(now) {
    const rd = roundAt(clockNow());
    if (!matchReady) { roundLive = false; document.getElementById("roundInfo").textContent = "Waiting for host…"; return; }
    if (rd.idx !== stats.round) {
      // a new round: everyone starts from scratch
      Object.assign(stats, { round: rd.idx, kills: 0, deaths: 0, shots: 0, hits: 0, streak: 0, best: 0 });
      if (shownRound !== -1 && playing) {
        me.score = 0; showScore(); me.xp = 0; me.lv = 1; renderLevel();
        baseArsenal(); me.ampUntil = 0; renderWeapon();
        me.dead = false; me.respawnAt = 0; me.lives = maxLivesOf(1); clearArmor(me); renderShield(); renderHearts(false); me.inv = now + 2000;
        floaters.push({ x: me.x, y: me.y - 90, t: 0, txt: "ROUND " + (rd.idx - (firstRoundIdx ?? rd.idx) + 1) + " · FIGHT!", gold: true });
        sfx("v_fight", 1);
      }
      for (const b of bots) resetCmds(b);
      for (const b of bots) Object.assign(b, { st: { kills: 0, deaths: 0, shots: 0, hits: 0, streak: 0, best: 0 }, lives: LIVES, shield: 0, beltArmor: 0, bodyArmor: 0, padsArmor: 0, lv: 1, xp: 0, vx: 0, vy: 0, ammo: 0, dead: false, ...spawnPoint(b.tm), inv: now + 2000, fc: -1, caps: 0, weapon: "fire" });
      for (const b of bots) if (b.input) pilotArm(b);
      me.fc = -1; me.caps = 0; me.heat = 0; me.overheat = false; railCharge = 0; charge = 0; cancelRocketLoad();
      energy = 100; energyRegenAt = 0; dashReadyAt = 0; lungeReady = 0;
      flagWas = ["", ""]; flagHeld.fill(null); flagCarrier.fill(null);
      grabbed.clear(); myGrabs.length = 0; drops.clear(); gunDrops.clear(); myDrops.length = 0; myGunDrops.length = 0;
      hulks.length = 0; frags.length = 0; debris.length = 0; melts.length = 0; scorches.length = 0; oilDrops.length = 0; oilStains.length = 0; chunks.length = 0; wallDrips.length = 0; casings.length = 0; meltLines.length = 0; cuts.length = 0; scars.length = 0; voids.length = 0; decalTiles.clear(); afterBlasts.length = 0; shockQueue.length = 0;
      if (shownRound !== -1) {
        myCarves.length = 0; seenCarves.clear(); buildPlanets(worldCode);
        // Respawn after rebuilding: a repaired planet must not enclose a pilot in its old tunnel.
        Object.assign(me, spawnPoint(me.tm), { vx: 0, vy: 0 });
        if (serverRun) srv.placed = false;   // on the server, the server says where (serverSelf)
        for (const b of bots) Object.assign(b, spawnPoint(b.tm), { nav: null, navAt: 0, patrol: null, dashReq: false });
      }
      firstBlood = false; streaks.clear(); multi = 0;
      me.hitHistory = []; for (const b of bots) b.hitHistory = [];
      credited.clear(); botCredited.clear(); killSeen.clear(); ufoHits.clear(); pendingHitFx.clear();
      rockMotion.clear();
      hitBy.length = 0; koBy.length = 0; myShotLog.length = 0; shots.length = 0; seenShots.clear();
      for (const b of bots) { b.hitBy.length = 0; b.koBy.length = 0; b.shotLog.length = 0; }
      slowAcc = 1; lastSlow = "";
      shownRound = rd.idx;
      document.getElementById("results").hidden = true;
    }
    // the score limit: once someone (or a team) reaches it, the round is decided; results show until the next one
    if (rd.live && SCORE_LIMIT && decidedRound !== rd.idx && leaderScore() >= SCORE_LIMIT) {
      decidedRound = rd.idx; matchEnd = clockNow(); rd.next = ROUND_BREAK;
      announce("ROUND DECIDED", "score limit " + SCORE_LIMIT + " reached", "#ffd36b", 2);
    }
    const live = rd.live && decidedRound !== rd.idx;
    if (roundLive && !live) { shots.length = 0; guided = null; }
    roundLive = live;
    const info = document.getElementById("roundInfo");
    if (live) {
      const remaining = Math.ceil(rd.left), m = Math.floor(remaining / 60), sec = remaining % 60;
      if (firstRoundIdx === null) firstRoundIdx = rd.idx;
      info.textContent = "Round " + (rd.idx - firstRoundIdx + 1) + " · " + m + ":" + String(sec).padStart(2, "0") + (SCORE_LIMIT ? " · first to " + SCORE_LIMIT : "");
      info.classList.toggle("last", rd.left < 30);
    } else {
      info.textContent = "Results · next round in " + Math.ceil(rd.next) + "s";
      if (playing && resultsFor !== rd.idx) roundEndVoice();
      if (playing && rd.next < 2.6 && preparedFor !== rd.idx) { preparedFor = rd.idx; sfx("v_prepare", 1); }
      // refresh once a second so late state updates from other pilots still land in the table
      if (playing && (resultsFor !== rd.idx || now - resultsAt > 1000)) { resultsFor = rd.idx; resultsAt = now; showResults(rd.idx - (firstRoundIdx ?? rd.idx) + 1); }
      const nx = document.getElementById("nextRound");
      if (nx) nx.textContent = "Next round in " + Math.ceil(rd.next) + " s";
    }
  }
  // team totals: kills, and flags captured
  function teamTotals() {
    const k = [0, 0], c = [0, 0];
    for (const r of playerRows()) if (onTeam(r)) { k[r.tm] += r.kills; c[r.tm] += r.caps; }
    return { k, c, lead: MODES[MODE].flags ? (c[0] - c[1] || k[0] - k[1]) : k[0] - k[1] };
  }
  function renderBoard() {
    const rows = playerRows();
    rows.sort(comparePlayers);
    const shown = rows;
    const team = [];
    if (isTeams()) {   // the two teams first: kills, or captures in CTF
      const t = teamTotals(), flags = MODES[MODE].flags;
      for (const i of [0, 1]) {
        const li = document.createElement("li"); li.className = "team";
        const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = TEAM_NAME[i] + " team"; nm.style.color = TEAM_HEX[i];
        const pts = document.createElement("span"); pts.className = "pts"; pts.textContent = flags ? t.c[i] + " flags · " + t.k[i] : String(t.k[i]);
        li.append(nm, pts); team.push(li);
      }
    }
    boardEl.replaceChildren(...team, ...shown.map(r => {
      const li = document.createElement("li"); if (r.me) li.className = "me";
      const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = r.name; nm.style.color = isTeams() && onTeam(r) ? TEAM_HEX[r.tm] : `hsl(${r.hue} 90% 80%)`;
      const pts = document.createElement("span"); pts.className = "pts"; pts.textContent = (MODES[MODE].flags ? r.caps + " flags · " : "") + r.kills + " / " + r.deaths + " · " + r.score + " pts";
      if (r.ping) { const pg = document.createElement("small"); pg.className = "pg " + (r.ping < 90 ? "good" : r.ping < 180 ? "ok" : "bad"); pg.textContent = Math.round(r.ping) + "ms"; nm.append(" ", pg); }
      li.append(nm, pts); return li;
    }));
  }

