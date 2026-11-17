  // ---------- the authoritative server (server/ in the repository) ----------
  // In this mode the browser only flies and shows: it sends its controls, moves its own bin at once (prediction)
  // and eases it toward where the server says it is; everyone else, their shots, the pick-ups taken and the craters
  // come from the server's snapshots, read by the same code as a lobby host's state. Hits, damage, deaths,
  // respawns and pick-ups are the server's word; this browser never decides them.
  // Only our own server: a link must not be able to send players to someone else's (who would learn their names and
  // addresses and decide what they see). ?server= is honoured only for a server on this machine, for development;
  // a page that hosts the game elsewhere names its server in window.BRS_SERVER.
  const DEFAULT_SERVER = "wss://134-122-60-131.sslip.io:8443";
  const SERVER_URL = (() => {
    const m = /[?&]server=([^&#]+)/.exec(location.search || ""), local = m ? decodeURIComponent(m[1]) : "";
    if (/^wss?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(local)) return local;
    const u = window.BRS_SERVER || DEFAULT_SERVER;
    return /^wss:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(u) ? u : "";
  })();
  let serverRun = false;
  const srv = { ws: null, id: "", tag: "", sendHz: 15, dashN: 0, teleN: 0, lastIn: "", lastInAt: 0, deadSeen: false, joined: false, err: "", pred: [], pseq: 0 };
  // the pilot the server flies for me: its own shots are mine, never a threat to me
  const mySrvShot = s => serverRun && !!srv.id && s.owner === srv.id;
  function serverStart(code) {
    net.send = () => {}; net.shot = () => {};   // nothing of mine goes anywhere but my controls
    document.getElementById("boardTitle").textContent = "Server · " + MODES[MODE].label + " · " + MAPS[mapThemeOf(code)].label;
    setStatus(false, "Server · connecting…");
    if (!SERVER_URL) { setStatus(false, "Server · no valid address"); return; }
    const ws = new WebSocket(SERVER_URL);
    srv.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: "join", code, name: me.name, bots: botChoice.n, level: botChoice.level }));
    ws.onmessage = e => {
      if (typeof e.data !== "string" || e.data.length > 262144) return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (!m || typeof m !== "object") return;
      if (m.t === "snap") receiveServer(m);
      else if (m.t === "pong") { if (Number.isFinite(m.c)) gotPing(performance.now() - m.c); }
      else if (m.t === "welcome" && typeof m.id === "string") {
        srv.id = m.id; srv.joined = true; srv.sendHz = clamp(num(m.sendHz, 15), 1, 60);
        setStatus(true, "Server · " + code.toUpperCase() + " · online");
      } else if (m.t === "error") { srv.err = String(m.reason || "").slice(0, 40); announce("SERVER", srv.err, "#ff8a8a", 2, true); }
    };
    ws.onclose = () => { srv.joined = false; setStatus(false, "Server · disconnected" + (srv.err ? " · " + srv.err : "")); };
    setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ t: "ping", c: performance.now() })); }, 2000);
    setInterval(sendControls, 1000 / 30);
  }
  // my controls, as they are now: sent when they change, and at least four times a second
  function sendControls() {
    const ws = srv.ws;
    if (!ws || ws.readyState !== 1 || !srv.joined) return;
    const c = me.ctl || {}, i = { t: "in", mx: +num(c.mx, 0).toFixed(3), my: +num(c.my, 0).toFixed(3), aim: +me.a.toFixed(3),
      fire: !!c.fire && !me.dead && playing, alt: !!c.alt && !me.dead && playing, boost: !!c.boost, dash: srv.dashN, tele: srv.teleN,
      w: WEAPON_KEYS.indexOf(me.weapon) };
    const sig = JSON.stringify(i), t = performance.now();
    if (sig === srv.lastIn && t - srv.lastInAt < 250) return;
    srv.lastIn = sig; srv.lastInAt = t;
    ws.send(sig);
  }
  // a snapshot: the round clock, every pilot (mine among them) and the world
  function receiveServer(p) {
    if (p.mc) receiveMatchClock(p.mc);
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
    if (p.rd === stats.round) applyWorld("server", p);
    showScore();
  }
  // what the server says about me: corrections to my predicted flight, and everything I may not decide myself
  function serverSelf(m) {
    const now = performance.now();
    if (typeof m.tg === "string" && /^[a-z0-9]{1,8}$/.test(m.tg)) { srv.tag = m.tg; myTag = m.tg; }   // my shots' ids: kills reported on them are mine
    if (Number.isFinite(m.ts)) { const o = clamp(m.ts - Date.now(), -120000, 120000); srv.off = Number.isFinite(srv.off) ? srv.off + (o - srv.off) * 0.1 : o; srv.lastTs = Math.max(srv.lastTs || m.ts, m.ts); }
    srv.ping = myPing;
    // my shots, as fired on the server: the ones this screen already showed (predictFire) are not shown twice
    if (m.rd === stats.round && Array.isArray(m.f)) for (const f of m.f.slice(0, 24)) {
      if (Array.isArray(f) && typeof f[0] === "string" && !seenShots.has(f[0]) && claimPrediction(f[5], now)) { seenShots.set(f[0], performance.now()); continue; }
      addRemoteShot(srv.id, f, m.ts);
    }
    if (Array.isArray(m.ar)) serverArsenal(m.ar, m.wp);
    if (Number.isInteger(m.tn) && m.tn !== me.teleN) { me.teleN = clamp(m.tn, 0, 6); renderTele(); }
    if ("tm" in m) me.tm = m.tm === 0 || m.tm === 1 ? m.tm : undefined;
    if ("fc" in m) me.fc = m.fc === 0 || m.fc === 1 ? m.fc : -1;
    if (Number.isFinite(m.sh) && m.sh !== me.shield) { me.shield = clamp(m.sh, 0, MAX_SHIELD); renderShield(); }
    if (Number.isFinite(m.l) && m.l !== me.lives) { const hit = m.l < me.lives; me.lives = clamp(m.l, 0, LIVES * 1.99); renderHearts(hit); if (hit && !me.dead) { me.hitAt = now; hurtFlash = Math.min(1, hurtFlash + 0.4); } }
    if (m.d === 1 && !me.dead) {   // the server's verdict: I died
      me.dead = true; me.respawnAt = now + 3000; me.vx = me.vy = 0;
      me.ds = clamp(Math.floor(num(m.ds, 2)), 0, 4); me.dk = clamp(Math.floor(num(m.dk, 0)), 0, DEATH_KINDS); me.da = num(m.da, 0);
      deathFx(me, me.ds, me.dk, me.da);
      stats.deaths++; stats.streak = 0;
      const k = Array.isArray(m.ko) ? m.ko.at(-1) : "", tag = typeof k === "string" ? k.split(".")[0] : "";
      const by = [...remotes.values()].find(r => r.tag === tag);
      killer = by ? by.name : "";
      packPlay("p_death", 0.7);
    } else if (m.d === 0 && me.dead) {   // ...and back, where the server put me
      me.dead = false; me.inv = now + 2000; me.vx = me.vy = 0;
      if (Number.isFinite(m.x)) { me.x = m.x; me.y = m.y; }
      audioCue("respawn"); renderHearts(false);
    }
    if (me.dead || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
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
      const k = Array.isArray(e) ? WEAPON_KEYS[e[0]] : null;
      if (k && WEAPONS[k]) ar[k] = e[1] === -1 ? Infinity : clamp(num(e[1], 0), 0, 9999);
    }
    const keys = Object.keys(ar).join(), was = Object.keys(me.arsenal).join();
    me.arsenal = ar;
    if (!(me.weapon in ar)) { const w = WEAPON_KEYS[wp]; me.weapon = w in ar ? w : Object.keys(ar)[0] || "fire"; }
    else if (keys === was) { renderAmmo(me.weapon); return; }
    renderWeapon();
  }
  // Shot prediction: a plain shot is shown the moment I fire, from my muzzle, instead of a round trip later when
  // the server's copy comes back (that copy is then not shown again). It is only a picture: what it hits is still
  // the server's word. Guns whose shots depend on more than the trigger (spin-up, charging, lock-on, melee, the
  // specials of alt fire) are left to the server.
  function predictFire(now, held, altHeld) {
    if (!playing || !roundLive || me.dead || fireCd > 0 || !srv.joined || guided) return;
    const k = MODES[MODE].only || me.weapon, w = WEAPONS[k];
    if (!w || k === "bolt" || k === "gamma" || k === "tele") return;
    const a = w.alt, useAlt = altHeld && a && !(a.load || a.charge || a.recall || a.lunge || a.minedet || a.detonate || a.heat || a.guided) && !(k === "laser");
    const pat = useAlt ? a : held && !altHeld && !w.charge && !w.melee ? w : null;
    if (!pat || !pat.shot) return;
    const ammo = me.arsenal[k] || 0;
    if (useAlt ? ammo < pat.cost : !(ammo > 0)) return;
    const cdMul = MODES[MODE].cdMul || 1;
    fireCd = useAlt ? pat.cd : w.spin ? (w.spin[0] + (w.spin[1] - w.spin[0]) * spin) * cdMul : w.cd * cdMul;
    // the same muzzle, direction and speed the server's volley() gives a pilot
    const [kind, speed] = pat.shot, ride = kind === K.GREN || kind === K.HOLY || kind === K.MINE ? .6 : 0, sz = sizeOf(me.lv || 1);
    let muzzle = null;
    for (const da of pat.spread || [0]) {
      const ja = pat.jitter ? (Math.random() - 0.5) * 2 * pat.jitter : 0, bx = Math.cos(me.a + da + ja), by = Math.sin(me.a + da + ja);
      const ox = me.x + bx * 42 * sz, oy = me.y + by * 42 * sz, fwd = speed > 0 ? Math.max(0, me.vx * bx + me.vy * by) * ride : 0;
      const vx = bx * (speed + fwd) + (speed > 0 ? 0 : me.vx * ride), vy = by * (speed + fwd) + (speed > 0 ? 0 : me.vy * ride);
      addRemoteShot(srv.id, [srv.tag + ".p" + (srv.pseq++).toString(36), Math.round(ox), Math.round(oy), Math.round(vx), Math.round(vy), kind, 1, 0, pat.cut || 0, Date.now()], Date.now(), true);
      srv.pred.push({ kind, at: now }); if (srv.pred.length > 48) srv.pred.shift();
      muzzle = muzzle || { x: ox, y: oy };
      stats.shots++;
    }
    if (useAlt && pat.fx) MUZZLE_FX[pat.fx](muzzle);
    shotFeel(k, muzzle, pat.kick, ...pat.feel);   // recoil too: the server gives my pilot the same kick (ammo is its count)
  }
  // a shot of mine from the server that this screen already showed: the oldest shown one of its kind, if recent
  function claimPrediction(kind, now) {
    const keep = 600 + (myPing || 100) * 2;
    while (srv.pred.length && now - srv.pred[0].at > keep) srv.pred.shift();
    const i = srv.pred.findIndex(p => p.kind === kind);
    if (i < 0) return false;
    srv.pred.splice(i, 1);
    return true;
  }
