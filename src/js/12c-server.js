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
  const srv = { ws: null, id: "", tag: "", sendHz: 15, dashN: 0, lastIn: "", lastInAt: 0, deadSeen: false, joined: false, err: "" };
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
      fire: !!c.fire && !me.dead && playing, boost: !!c.boost, dash: srv.dashN };
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
    if (m.rd === stats.round && Array.isArray(m.f)) for (const f of m.f.slice(0, 24)) addRemoteShot(srv.id, f, m.ts);   // my shots, as fired on the server
    if ("tm" in m) me.tm = m.tm === 0 || m.tm === 1 ? m.tm : undefined;
    if ("fc" in m) me.fc = m.fc === 0 || m.fc === 1 ? m.fc : -1;
    if (Number.isFinite(m.sh) && m.sh !== me.shield) { me.shield = clamp(m.sh, 0, MAX_SHIELD); renderShield(); }
    if (Number.isFinite(m.l) && m.l !== me.lives) { const hit = m.l < me.lives; me.lives = clamp(m.l, 0, LIVES * 1.99); renderHearts(hit); if (hit && !me.dead) { me.hitAt = now; hurtFlash = Math.min(1, hurtFlash + 0.4); } }
    if (Number.isInteger(m.wp)) {
      const w = WEAPON_KEYS[m.wp];
      if (w && WEAPONS[w] && w !== me.weapon) { me.arsenal = { fire: Infinity, gauntlet: Infinity }; if (w !== "fire") me.arsenal[w] = Infinity; me.weapon = w; renderWeapon(); }
    }
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
