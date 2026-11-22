  function setStatus(on, text) { netDot.classList.toggle("on", on); netText.textContent = text; }

  // how far ahead (s) to place a flyer from its last report: roughly the network delay we measured (~85-100 ms)
  // ping: my round trip through the broker (ms, smoothed); others' arrive in their state
  let myPing = 0;
  function gotPing(ms) {
    myPing = myPing ? myPing + (ms - myPing) * 0.3 : ms;
    const el = document.getElementById("pingInfo");
    el.textContent = "ping " + Math.round(myPing) + " ms";
    el.className = myPing < 90 ? "good" : myPing < 180 ? "ok" : "bad";
  }
  // how far ahead (s) to place a flyer from its last report: about the one-way delay from them to me
  const leadFor = r => clamp(((myPing || 90) + (r.ping || myPing || 90)) / 4000 + 0.03, 0.05, 0.3);
  // fresh: a shot fired on this screen this instant (my own, predicted on the authoritative server): no delay to make up
  function addRemoteShot(owner, f, sentAt = Date.now(), fresh = false) {
    if (!Array.isArray(f) || typeof f[0] !== "string" || f[0].length > 20 || seenShots.has(f[0])) return;
    // my own pilot on the server is no remote, but its shots come back the same way
    const peer = remotes.get(owner) || (owner && owner === srv.id ? srv : null);
    if (!peer || seenShots.size >= MAX_SEEN_SHOTS) return;
    if (!Number.isInteger(f[5]) || f[5] < 0 || f[5] >= SHOTS.length || RETIRED_SHOTS.has(f[5]) || !f.slice(1, 5).every(Number.isFinite) || f.length < 6) return;
    if (peer.tag && !f[0].startsWith(peer.tag + ".")) return;
    noteShotKind(f[0], f[5]);
    if (!Number.isFinite(f[9]) || !Number.isFinite(sentAt)) return;
    const queued = sentAt - f[9];
    if (queued < -100 || queued > 1200) return; // don't resurrect expired shots from a journal
    const link = ((myPing || 90) + (peer.ping || myPing || 90)) / 2;
    const jitter = Number.isFinite(peer.off) ? Math.max(0, Date.now() - sentAt + peer.off) : 0;
    const age = fresh ? 0 : Math.max(0, queued) + Math.max(link, jitter);
    if (age > 1200) return;
    const lag = clamp(age, 0, REWIND_MS);
    // m: Quad damage (x4) and the crown (x1.25), or the charge cannon's charge (0.25..1); anything else is ignored
    const kind = f[5], m = kind === K.SWORD && Number.isFinite(f[6]) ? clamp(f[6], 0.25, 5) : kind === K.PISTOL && Number.isFinite(f[6]) ? clamp(f[6], 0.5, remotes.get(owner)?.amp || botById.get(owner)?.ampUntil > performance.now() ? QUAD * 1.25 : 1.25) : kind === K.NOVA && Number.isFinite(f[6]) ? clamp(f[6], 0.3, remotes.get(owner)?.amp || botById.get(owner)?.ampUntil > performance.now() ? QUAD * 1.25 : 1.25) : kind === K.LASER && Number.isFinite(f[6]) ? clamp(f[6], LINK_MIN, LINK_HEAT * (remotes.get(owner)?.amp || botById.get(owner)?.ampUntil > performance.now() ? QUAD * 1.25 : 1.25)) : [QUAD, 1.25, QUAD * 1.25].includes(f[6]) ? f[6] : 1;   // (a link beam heats up to LINK_HEAT; Quad only if the shooter is seen to carry it)
    const x = clamp(num(f[1], 0), 0, W), y = clamp(num(f[2], 0), 0, H);
    // Keep an age bound relative to the newest state as well as to this packet.
    if (!fresh && Number.isFinite(peer.lastTs) && peer.lastTs - f[9] > 1200) return;
    const sh = {
      id: f[0], kind, x, y, px: x, py: y, ox: x, oy: y, m,
      vx: clamp(f[3], -6800, 6800), vy: clamp(f[4], -6800, 6800),
      // how far it has flown since it was fired: on the game server (which judges every hit) it starts at the gun, as
      // its shooter is shown a moment in the past, and makes that up over its first quarter second, as Overwatch
      // shows others' projectiles; elsewhere (a peer judges the hits on itself) it jumps there at once
      catchup: straightShot(kind) && !serverRun ? lag / 1000 : 0,
      catchSlow: straightShot(kind) && serverRun ? lag / 1000 : 0, catchRate: lag / 1000 / 0.25,
      life: SHOTS[kind].life, hitTime: performance.now() - lag, mine: false, owner, bn: 0,
    };
    // a peer can send anything: cap what one owner (and everyone together) can keep alive here
    let own = 0, ownMines = 0, ownBombs = 0;   // a big bomb is heavy to play out (blast, choir): one owner gets two at once
    for (const o of shots) if (o.owner === owner) { own++; if (o.kind === K.MINE) ownMines++; if (BOMBS[o.kind]) ownBombs++; }
    if (shots.length > 900 || own > 80 || (kind === K.MINE && ownMines >= 12) || (BOMBS[kind] && ownBombs >= 2)) return;
    seenShots.set(f[0], performance.now());
    if (kind === K.PELLET) scatterPellets(sh); else if (kind === K.SHARD) shardSpray(sh); else shots.push(sh);
    if (kind === K.RAIL) railBeam(sh);
    if (!fresh) shotSound(kind, x, y, owner);   // a fresh one is fired here, with its own sound
    if (seenShots.size > 400) { const t = performance.now(); for (const [k, at] of seenShots) if (t - at > 5000) seenShots.delete(k); }
    return true;
  }
  // Messages are partial: fast ones carry only motion, slow ones add name/look/score/lists.
  function applyRemote(id, p) {
    if (!p || typeof p !== "object" || Array.isArray(p) || !Number.isSafeInteger(p.q) || p.q < 0) return false;
    if ("ds" in p && (!Number.isInteger(p.ds) || p.ds < 0 || p.ds > 4)) return false;
    const hasPos = Number.isFinite(p.x) && Number.isFinite(p.y);
    let r = remotes.get(id);
    if (!r) {
      if (!hasPos || remotes.size >= MAX_REMOTES) return false;   // a flyer appears once we know where it is
      r = { x: clamp(p.x, 0, W), y: clamp(p.y, 0, H), a: num(p.a, 0), ta: num(p.a, 0), tx: p.x, ty: p.y, vx: 0, vy: 0,
            q: -1, name: "Bin", hue: 200, ck: [0, 0, 0, 0, 0], score: 0, lv: 1, lives: LIVES, thrust: 0, dead: false, inv: false };
      remotes.set(id, r);
    }
    // Reordered snapshots can contain an unseen shot even though their movement is obsolete.
    if (p.q <= r.q) {
      applyCombatReports(id, p, r);
      if (p.rd === stats.round && Array.isArray(p.f)) for (const f of p.f.slice(0, 24)) addRemoteShot(id, f, p.ts);
      return false;
    }
    r.seen = performance.now();
    if (Number.isFinite(p.ts)) {
      r.lastTs = Math.max(r.lastTs || p.ts, p.ts);
      const o = clamp(p.ts - Date.now(), -120000, 120000);
      r.off = Number.isFinite(r.off) ? r.off + (o - r.off) * 0.1 : o;
    }
    // Apply all fields only from states newer than what we have (two brokers / reordering).
    r.q = p.q;
    if (hasPos) {
      r.vx = clamp(num(p.vx, 0), -1200, 1200); r.vy = clamp(num(p.vy, 0), -1200, 1200);
      if (serverRun && Number.isFinite(p.ts)) {   // from the authoritative server: kept, to be shown a little in the past (updateRemotes)
        const buf = r.buf || (r.buf = []);
        if (!buf.length || p.ts > buf[buf.length - 1].t) buf.push({ t: p.ts, x: clamp(p.x, 0, W), y: clamp(p.y, 0, H), a: num(p.a, r.ta), iv: p.i === 1 });   // iv: invulnerable then
        if (buf.length > 24) buf.shift();
      } else {
        const lead = leadFor(r);
        r.tx = clamp(p.x + r.vx * lead, 0, W); r.ty = clamp(p.y + r.vy * lead, 0, H);
        if (Math.hypot(r.tx - r.x, r.ty - r.y) > 300) { r.x = r.tx; r.y = r.ty; }   // teleport (respawn, black hole)
      }
      if (Number.isFinite(p.a)) r.ta = p.a;
      r.thrust = p.t ? 1 : 0;
      r.tdir = Number.isFinite(p.td) ? clamp(p.td, -7, 7) : undefined;   // which way they push (r.ta is where they face)
      const bf = p.b === 1 || p.b === 2 ? p.b : 0;
      if (bf === 2 && r.boost !== 2) dashBurst(r);   // they just dashed
      r.boost = bf;
      const dead = p.d === 1;
      if (dead && !r.dead) deathFx(r, p.ds, Number.isInteger(p.dk) && p.dk >= 0 && p.dk <= DEATH_KINDS ? p.dk : 0, num(p.da, 0));
      r.dead = dead; r.inv = p.i === 1;
      r.wind = Number.isFinite(p.bw) && !dead ? clamp(p.bw, 0, 1) : 0;   // their Blood Blade's wind-up
    }
    if (typeof p.tg === "string" && /^[a-z0-9]{1,8}$/.test(p.tg)) r.tag = p.tg;
    if (Array.isArray(p.bc) && Number.isInteger(p.bc[0]) && p.bc[0] > 0 && p.bc[0] <= MAX_BOTS && BOT_LEVELS[p.bc[1]] && !/^pb/.test(id)) lobbyBots = { host: id, n: p.bc[0], level: p.bc[1] };
    if ("tm" in p) {
      const was = r.tm;
      r.tm = p.tm === 0 || p.tm === 1 ? p.tm : undefined;
      if (was === undefined && r.tm !== undefined && !botById.has(id)) settleTeam();   // a pilot's team just came in
    }
    if ("fc" in p) r.fc = p.fc === 0 || p.fc === 1 ? p.fc : -1;
    if (Array.isArray(p.cp) && Number.isInteger(p.cp[1])) { r.cpRound = p.cp[0]; r.caps = clamp(p.cp[1], 0, 99); }
    if (typeof p.n === "string") r.name = p.n.slice(0, 14);
    if (Number.isFinite(p.h)) r.hue = p.h % 360;
    if (Array.isArray(p.ck) && p.ck.length === 5 && p.ck.every(Number.isInteger)) r.ck = cleanCustom(p.ck);
    if (Number.isFinite(p.s)) r.score = Math.max(0, Math.floor(p.s));
    r.lv = 1;
    if (Array.isArray(p.st) && p.st.length === 6 && p.st.every(Number.isInteger)) r.st = p.st;   // [round, kills, deaths, shots, hits, best]
    if (Number.isInteger(p.wp)) r.weapon = WEAPON_KEYS[p.wp] || "fire";
    if (Number.isFinite(p.sh)) r.shield = clamp(p.sh, 0, MAX_SHIELD);
    if (Number.isFinite(p.pg)) r.ping = clamp(p.pg, 0, 5000);
    if ("am" in p) r.amp = p.am >= 1;   // (a player on the server: the seconds it has left)
    if (Number.isFinite(p.l)) r.lives = clamp(p.l, 0, LIVES * 1.99);
    if (p.rd === stats.round && Array.isArray(p.f)) for (const f of p.f.slice(0, 24)) addRemoteShot(id, f, p.ts);
    if (Array.isArray(p.gw) && p.gw.length === 6 && typeof p.gw[0] === "string" && p.gw.slice(1).every(Number.isFinite)) guideRemote(id, p.gw);
    applyWorld(id, p);
    // Event IDs belong to one round; old reports must not survive a round reset.
    if (p.rd !== stats.round) { showScore(); return true; }
    applyCombatReports(id, p, r);
    showScore();
    return true;
  }
  // what a pilot's state says about the world rather than the pilot: pick-ups taken, craters dug, stars and trophies
  // dropped, terrain and rock motion. A lobby host and the authoritative server send these the same way
  function applyWorld(id, p) {
    if (Array.isArray(p.cv)) applyRemoteCarves(id, p.cv);
    if (p.rd === stats.round && Array.isArray(p.g)) for (const k of p.g.slice(0, 48)) if (typeof k === "string" && /^[a-zA-Z][a-z0-9.:]{1,20}$/.test(k) && (grabbed.has(k) || grabbed.size < 16384)) grabbed.add(k);   // only pick-up keys
    if (p.rd === stats.round && Array.isArray(p.dr)) for (const d of p.dr.slice(0, 3)) {
      if (drops.size >= MAX_DROPS) break;
      if (!Array.isArray(d) || typeof d[0] !== "string" || d[0].length > 10 || drops.has(d[0])) continue;
      drops.set(d[0], { x: clamp(num(d[1], 0), 0, W), y: clamp(num(d[2], 0), 0, H), n: clamp(Math.floor(num(d[3], 0)), 0, 40), born: performance.now() });
    }
    if (p.rd === stats.round && Array.isArray(p.wd)) for (const d of p.wd.slice(0, 3)) {   // trophies: a dead pilot's gun and its ammo
      if (gunDrops.size >= 64) break;
      if (!Array.isArray(d) || typeof d[0] !== "string" || !/^[a-z0-9]{2,16}$/.test(d[0]) || gunDrops.has(d[0])) continue;
      if (!Number.isInteger(d[3]) || d[3] < 0 || d[3] >= WEAPON_KEYS.length) continue;   // an index, never a key like "length"
      const type = WEAPON_KEYS[d[3]];
      if (type === "fire" || WEAPONS[type]?.disabled) continue;
      gunDrops.set(d[0], { x: clamp(num(d[1], 0), 0, W), y: clamp(num(d[2], 0), 0, H), type, ammo: clamp(Math.floor(num(d[4], 1)), 1, 999), born: performance.now() });
    }
    if (Array.isArray(p.terrain)) applyTerrain(p.terrain);
    if (p.rd === stats.round && Array.isArray(p.rk)) applyRockMotion(p.rk);
  }
  // Combat events are monotonic within a round, even when movement arrives out of order.
  function applyCombatReports(id, p, r) {
    if (p.rd !== stats.round) return;
    // credit for my fireballs that they report
    const validHit = k => typeof k === "string" && k.length <= 48;
    const mine = k => validHit(k) && k.startsWith(myTag + ".") && credited.size < MAX_CREDITS;
    for (const k of Array.isArray(p.hb) ? p.hb.slice(0, 16).filter(validHit) : []) if (mine(k) && !credited.has(id + ":" + k)) {
      credited.add(id + ":" + k); me.score += 1; stats.hits++;
      // hits on one pilot within a moment (a shotgun's pellets) add up in one "Hit +N", not a pile of "+1"s
      const f0 = floaters.find(f => f.hitOf === id && f.t < 0.3);
      if (f0) { f0.n++; f0.txt = "Hit +" + f0.n; f0.x = r.x; f0.y = r.y - 30; }
      else floaters.push({ x: r.x, y: r.y - 30, t: 0, txt: "Hit +1", gold: false, hitOf: id, n: 1 });
      // on the server my hit may have been shown already; one it alone saw (a blast's edge) is felt now
      if (serverRun && !serverHitShown(id)) { r.hitAt = performance.now(); const t = r.hitAt; if (t - hitTickAt > 60) { hitTickAt = t; sfx("hit", 0.4, 1.8); } }
      metricPeer(k, id, false);
      confirmShotHit(id, k, r);
    }
    if (bots.length) { creditBots(Array.isArray(p.hb) ? p.hb.slice(0, 16).filter(validHit) : [], false, id); creditBots(Array.isArray(p.ko) ? p.ko.slice(0, 16).filter(validHit) : [], true, id); }
    for (const k of Array.isArray(p.ko) ? p.ko.slice(0, 16).filter(validHit) : []) if (typeof k === "string") reportKill(k, r.name, id);
    for (const k of Array.isArray(p.ko) ? p.ko.slice(0, 16).filter(validHit) : []) if (mine(k) && !credited.has("ko" + id + ":" + k)) {
      credited.add("ko" + id + ":" + k); me.score += 5; floaters.push({ x: r.x, y: r.y - 50, t: 0, txt: "KILL " + r.name, gold: true });
      if (serverRun && !(Array.isArray(p.hb) && p.hb.includes(k))) serverHitShown(id);   // (the killing shot comes as a kill, not a hit: it confirms the hit shown too)
      gainXp(killXp(me.lv, r.lv || 1), performance.now());
      metricPeer(k, id, true);
      killStyle(k, r);
      stats.kills++; stats.streak++; stats.best = Math.max(stats.best, stats.streak);
      myKillAnnounce(performance.now());
    }
    showScore();
  }
  // a pilot's state, from whichever transport (MQTT or the local room): the pilot, then the bots it flies
  function receiveState(id, p) {
    if (p && p.mc) receiveMatchClock(p.mc);
    // a bot's state leaves out the clock and the round: they are its host's (see botWire)
    const own = m => m && typeof m === "object" && !Array.isArray(m) ? { rd: p.rd, ts: p.ts, ...m } : m;
    const fresh = applyRemote(id, p);
    if (!fresh) {
      if (p && p.rd === stats.round && Array.isArray(p.bots)) for (const e of p.bots.slice(0, MAX_BOTS)) {
        if (!Array.isArray(e)) continue;
        const r = remotes.get(e[0]);
        if (r?.host === id && !botById.has(e[0])) applyRemote(e[0], own(e[1]));
      }
      return;
    }
    if (Array.isArray(p.bots)) {
      const ids = [];
      for (const e of p.bots.slice(0, MAX_BOTS)) {
        if (!Array.isArray(e) || typeof e[0] !== "string" || !/^pb[a-z0-9]{1,10}$/.test(e[0]) || botById.has(e[0])) continue;
        const old = remotes.get(e[0]);
        if (old && old.host !== id) continue;   // another host's bot (or a real player) cannot be claimed
        if (applyRemote(e[0], own(e[1]))) { remotes.get(e[0]).host = id; ids.push(e[0]); }
        else if (old) ids.push(e[0]);
      }
      botsOf.set(id, ids);
    }
  }
  const botsOf = new Map();   // host id -> the ids of the bots it flies
  let lobbyBots = null;   // the lobby's bots as the host flies them: { host: id, n, level }
  function removeRemote(id) {
    remotes.delete(id);
    for (const b of botsOf.get(id) || []) if (remotes.get(b)?.host === id) remotes.delete(b);
    botsOf.delete(id);
    // the host left: the pilot with the lowest tag among those still here takes over its bots
    if (lobbyBots && lobbyBots.host === id && playing && !bots.length) {
      const tags = [myTag, ...[...remotes].filter(([rid, r]) => !/^pb/.test(rid) && r.tag).map(([, r]) => r.tag)].sort();
      if (tags[0] === myTag) {
        addBots(lobbyBots.n, lobbyBots.level);
        for (const b of bots) Object.assign(b, spawnPoint(b.tm));
        if (isTeams()) pickTeam(me.tm);
        announce("YOU'RE THE HOST NOW", "the host left: their bots fly for you", "#4fd6c8", 1, true);
      }
      lobbyBots = null;
    }
  }

  function pruneNetwork(now) {
    for (const [id, r] of remotes) if (!botById.has(id) && now - r.seen > 7000) removeRemote(id);
    for (const [id, d] of drops) if (now - d.born > DROP_LIFE) drops.delete(id);
  }

