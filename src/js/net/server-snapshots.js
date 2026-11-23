  // a snapshot: the round clock, every pilot (mine among them) and the world
  // a binary snapshot: the difference from one I hold, rebuilt into the whole and kept for the next one to build on
  // (the kept copies are never handed out, so nothing the game does to a snapshot can change them)
  function receiveDelta(bytes) {
    if (bytes.length > 262144) return;
    let f, full;
    try {
      f = SNAP_DELTA.unframe(bytes);
      if (f.base && !srv.snaps.has(f.base)) return;   // built on one I no longer have: the next will be from my newer word
      full = f.base ? SNAP_DELTA.patch(srv.snaps.get(f.base), f.d) : f.d;
    } catch { return; }
    if (!full || typeof full !== "object" || f.q <= srv.snapQ) return;
    srv.snaps.set(f.q, full);
    for (const q of srv.snaps.keys()) { if (q > f.q - 64) break; srv.snaps.delete(q); }
    srv.snapQ = f.q;
    const ws = srv.ws, t = performance.now();
    if (ws && ws.readyState === 1 && t - srv.lastInAt > 100 && t - (srv.lastAckAt || 0) > 100) { srv.lastAckAt = t; toServer({ t: "sa", q: f.q }); }   // no controls going out: say so on its own
    receiveServer(structuredClone(full));
  }
  function receiveServer(p) {
    if (p.mc) receiveMatchClock(p.mc);
    serverClock(p.ts);
    snapArrived(performance.now());
    const seen = new Set();
    for (const e of Array.isArray(p.bots) ? p.bots.slice(0, MAX_BOTS) : []) {
      if (!Array.isArray(e) || typeof e[0] !== "string" || !/^pb[a-z0-9]{1,10}$/.test(e[0]) || !e[1] || typeof e[1] !== "object") continue;
      const m = { rd: p.rd, ts: p.ts, ...e[1] };
      if (e[0] === srv.id) { serverSelf(m); continue; }
      seen.add(e[0]);
      applyRemote(e[0], m);
      const r = remotes.get(e[0]); if (r) r.host = "server";
    }
    for (const [id, r] of remotes) if (r.host === "server" && !seen.has(id)) remotes.delete(id);   // they left
    if (p.rd === stats.round) { applyWorld("server", p); applyRubble(p.rb, clamp((myPing || 60) / 2000, 0, 0.2)); settleGrabs(p.g, performance.now()); }
    showScore();
  }
  // what the server says about me: corrections to my predicted flight, and everything I may not decide myself
  function serverSelf(m) {
    const now = performance.now();
    if (typeof m.tg === "string" && /^[a-z0-9]{1,8}$/.test(m.tg)) { srv.tag = m.tg; myTag = m.tg; }   // my shots' ids: kills reported on them are mine
    if (Number.isFinite(m.ts)) srv.lastTs = Math.max(srv.lastTs || m.ts, m.ts);
    srv.ping = myPing;
    if (Array.isArray(m.cp) && m.cp[0] === stats.round && Number.isInteger(m.cp[1])) me.caps = clamp(m.cp[1], 0, 99);   // my flags or holds, as the server counts them
    // my shots, as fired on the server: the ones this screen already showed (predictShot) are not shown twice
    if (m.rd === stats.round && Array.isArray(m.f)) for (const f of m.f.slice(0, 24)) {
      if (Array.isArray(f) && typeof f[0] === "string" && !seenShots.has(f[0]) && claimPrediction(f[5], now, f[0])) { seenShots.set(f[0], performance.now()); noteShotKind(f[0], f[5]); continue; }
      addRemoteShot(srv.id, f, m.ts);
    }
    if (Array.isArray(m.ar)) serverArsenal(m.ar, m.wp);
    if ("tm" in m) me.tm = m.tm === 0 || m.tm === 1 ? m.tm : undefined;
    if ("fc" in m) me.fc = m.fc === 0 || m.fc === 1 ? m.fc : -1;
    if (Array.isArray(m.al) && m.al.length === 3 && m.al.every(Number.isFinite)) { me.beltArmor = clamp(m.al[0], 0, MAX_SHIELD); me.bodyArmor = clamp(m.al[1], 0, MAX_SHIELD); me.padsArmor = clamp(m.al[2], 0, MAX_SHIELD); }
    if (Number.isInteger(m.am)) {   // Quad damage, as the server has it: taken there, its seconds counted there
      const left = ampLeft(me, now);
      if (m.am > 0 && !left) {
        announce("QUAD DAMAGE", "four times the damage for 20 seconds", "#6fa8ff", 4);
        const c = world.amp || me;
        for (let k = 0; k < 50; k++) { const a = Math.random() * 6.28, v = 100 + Math.random() * 300; puff(c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, 0.8, 2.5, k % 2 ? "#5b9bff" : "#ffffff"); }
        rings.push({ x: c.x, y: c.y, t: 0, r: 260, col: "91,155,255", warp: true, dur: 0.6, w: 14 });
      }
      if (!m.am) me.ampUntil = 0; else if (Math.abs(left - m.am) > 1.2) me.ampUntil = now + m.am * 1000;
    }
    if (Number.isFinite(m.sh) && m.sh !== me.shield) { me.shield = clamp(m.sh, 0, MAX_SHIELD); renderShield(); }
    if (Number.isFinite(m.l) && m.l !== me.lives) { const hit = m.l < me.lives; me.lives = clamp(m.l, 0, LIVES * 1.99); renderHearts(hit); if (hit && !me.dead) { me.hitAt = now; hurtFlash = Math.min(1, hurtFlash + 0.4); } }
    if (m.d === 1 && !me.dead) {   // the server's verdict: I died
      me.dead = true; me.diedAt = now; me.respawnAt = now + respawnDelay(); me.vx = me.vy = 0;
      me.ds = clamp(Math.floor(num(m.ds, 2)), 0, 4); me.dk = clamp(Math.floor(num(m.dk, 0)), 0, DEATH_KINDS); me.da = num(m.da, 0);
      deathFx(me, me.ds, me.dk, me.da);
      stats.deaths++; stats.streak = 0;
      const k = Array.isArray(m.ko) ? m.ko.at(-1) : "", tag = typeof k === "string" ? k.split(".")[0] : "";
      const by = [...remotes].find(([, r]) => r.tag === tag);
      killer = by ? by[1].name : ""; killerId = by ? by[0] : null;
      packPlay("p_death", 0.7);
    } else if (m.d === 0 && me.dead) {   // ...and back, where the server put me
      me.dead = false; me.inv = now + 2000; me.vx = me.vy = 0; forgetKiller(now);
      if (Number.isFinite(m.x)) { me.x = m.x; me.y = m.y; }
      audioCue("respawn"); renderHearts(false);
      srv.hist.length = 0; srv.cx = srv.cy = 0;
    }
    if (me.dead || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
    // where the server put me, at the start of a game or a round: taken as it is (until then my bin waits, unseen,
    // instead of flying from a spawn point of its own and being thrown across the map a moment later)
    if (!srv.placed) {
      if (m.rd !== stats.round) return;
      if (validMv(m.mv)) setMoveState(me, m.mv);
      else { me.x = m.x; me.y = m.y; me.vx = num(m.vx, 0); me.vy = num(m.vy, 0); }
      srv.cmds.length = 0; srv.vox = srv.voy = srv.cx = srv.cy = 0; srv.hist.length = 0;
      cam.x = me.x + cam.lx; cam.y = me.y + cam.ly;
      srv.placed = true;
      return;
    }
    if (validMv(m.mv)) { reconcile(m); return; }
    if (Number.isFinite(m.en) && Math.abs(m.en - energy) > 15) energy = clamp(m.en, 0, 100);
    // Reconciliation, as Quake and Source do it: the server's state holds my controls up to number ak, flown for ag
    // ms. My own flight had flown the same controls exactly that long at (when I sent ak) + ag: what differs between
    // the two is a real error (a hit's shove, a bump into someone, a rounding), and only that is corrected, eased in
    // over a few frames. The flight I have predicted since is kept, so a fast turn is never pulled back.
    const sentAt = srv.sent.get(m.ak);
    if (sentAt !== undefined && Number.isFinite(m.ag)) {
      const h = histAt(sentAt + clamp(m.ag, 0, 1000) - 1000 / 60);   // (a frame: my controls fly from the end of the frame that sent them)
      if (!h) return;
      const ex = m.x - h.x, ey = m.y - h.y, evx = num(m.vx, h.vx) - h.vx, evy = num(m.vy, h.vy) - h.vy;
      if (Math.hypot(ex, ey) > 300) { me.x += ex + srv.cx; me.y += ey + srv.cy; srv.cx = srv.cy = 0; }   // a teleport or a jump: at once
      else if (Math.hypot(ex, ey) > 1.5) { srv.cx += ex; srv.cy += ey; }   // (the server rounds to whole pixels)
      if (Math.hypot(evx, evy) > 4) { me.vx += evx; me.vy += evy; }
      // what I remember since then moves with the correction, so the next state is not corrected twice
      const vx = Math.hypot(evx, evy) > 4 ? evx : 0, vy = Math.hypot(evx, evy) > 4 ? evy : 0, px = Math.hypot(ex, ey) > 1.5 ? ex : 0, py = Math.hypot(ex, ey) > 1.5 ? ey : 0;
      for (let i = h.i + 1; i < srv.hist.length; i++) { const e = srv.hist[i]; e.x += px; e.y += py; e.vx += vx; e.vy += vy; }
      return;
    }
    // (before the server has applied any controls of mine: the old way, its position carried forward half a round trip)
    // my flight is predicted here; the server's position is about half a round trip old, so compare it carried
    // forward that far, and close the gap gently (a large one, like a hit's shove or a teleport, at once)
    const lead = clamp((myPing || 60) / 2000, 0, 0.2), tx = clamp(m.x + num(m.vx, 0) * lead, 0, W), ty = clamp(m.y + num(m.vy, 0) * lead, 0, H);
    const ex = tx - me.x, ey = ty - me.y, err = Math.hypot(ex, ey);
    if (err > 260) { me.x = tx; me.y = ty; me.vx = num(m.vx, me.vx); me.vy = num(m.vy, me.vy); }
    else { me.x += ex * 0.2; me.y += ey * 0.2; me.vx += (num(m.vx, me.vx) - me.vx) * 0.1; me.vy += (num(m.vy, me.vy) - me.vy) * 0.1; }
  }
  // the guns the server says I carry. The one in my hands is my choice (it goes out with my controls), unless
  // the server no longer has it for me (out of ammo, or I died): then it is the server's
  function serverArsenal(list, wp) {
    const ar = {};
    for (const e of list.slice(0, 32)) {
      const k = Array.isArray(e) && WEAPONS[WEAPON_KEYS[e[0]]] ? WEAPON_KEYS[e[0]] : null;
      if (k && WEAPONS[k]) ar[k] = e[1] === -1 ? Infinity : clamp(num(e[1], 0), 0, 9999);
    }
    const keys = Object.keys(ar).join(), was = Object.keys(me.arsenal).join(), old = me.arsenal;
    // a gun the server gave me (a crate or a trophy I flew through): said and heard as when picked up offline
    if (!me.dead) for (const k in ar) if (Number.isFinite(ar[k]) && ar[k] > (Number.isFinite(old[k]) ? old[k] : 0)) {
      if (performance.now() - (gunFx.get(k) ?? -1e9) < 3000) { gunFx.delete(k); continue; }   // shown at once when I flew through it
      const had = k in old, key = COARSE ? "" : " · press " + weaponKey(k);
      floaters.push({ x: me.x, y: me.y - 60, t: 0, txt: had ? "+AMMO " + WEAPONS[k].name.toUpperCase() : WEAPONS[k].name.toUpperCase() + key, gold: true });
      if (k === "nuke") packPlay("p_ut_nuke_pick", .9); else sfx("weapon_get", 0.8);
    }
    me.arsenal = ar;
    if (!(me.weapon in ar)) { const w = WEAPON_KEYS[wp]; me.weapon = w in ar ? w : Object.keys(ar)[0] || "fire"; }
    else if (keys === was) { renderAmmo(me.weapon); return; }
    renderWeapon();
  }
  // Shot prediction: my trigger runs the same shoot() as anywhere (every gun, both fires, rockets loaded, the
  // the Plasma Nova released), but each shot volley() makes is only shown here, at once, from my
  // nose, as the server will fire it from my controls. When the server's copy comes back it is not shown again
  // (claimPrediction). It is a picture only: what it hits, and the ammo it takes, are the server's word.
  const myShot = s => s.mine || mySrvShot(s);
  function predictShot(s) {
    const d = [srv.tag + ".p" + (srv.pseq++).toString(36), Math.round(s.x), Math.round(s.y), Math.round(s.vx), Math.round(s.vy), s.kind, +s.m.toFixed(2), 0, 0, Date.now()];
    // lock-on shots are shown at once too, at the target this screen locks on (the server
    // locks on in its own view of the same moment, so it is nearly always the same one).
    // A prediction this screen refused (too many shots alive) is not recorded, so the server's copy still shows.
    if (addRemoteShot(srv.id, d, Date.now(), true) === true) pushCapped(srv.pred, { kind: s.kind, at: performance.now(), n: srv.pseq - 1 }, 48);
    stats.shots++;
    return { ...s, mine: false, owner: srv.id, id: d[0] };   // for the caller: where it left from, whose it is, its id here
  }
  // a shot of mine from the server that this screen already showed: the oldest shown one of its kind, if recent
  // (id: the server's id for it, which ends in the server's number for the shot: from it, how the numbering of my
  // predictions and the server's differ, so the next shots get the server's spread)
  function claimPrediction(kind, now, id) {
    const keep = 600 + (myPing || 100) * 2;
    while (srv.pred.length && now - srv.pred[0].at > keep) srv.pred.shift();
    const i = srv.pred.findIndex(p => p.kind === kind);
    if (i < 0) return false;
    const [p] = srv.pred.splice(i, 1), n = typeof id === "string" ? parseInt(id.slice(id.lastIndexOf(".") + 1), 36) : NaN;
    if (Number.isSafeInteger(n) && Number.isSafeInteger(p.n)) srv.seqOff = n - p.n;
    return true;
  }
