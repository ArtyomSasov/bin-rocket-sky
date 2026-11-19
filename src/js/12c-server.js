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
  const srv = { ws: null, id: "", tag: "", sendHz: 30, dashN: 0, teleN: 0, lastIn: "", lastInAt: 0, deadSeen: false, joined: false, err: "", pred: [], pseq: 0,
    seq: 0, sent: new Map(), hist: [], cx: 0, cy: 0, vox: 0, voy: 0, seqOff: 0, cmds: [], cs: 0, sentCs: 0, acc: 0,   // my flight commands (pilotMove)   // seqOff: the server's shot numbers less mine (for the spread)
    jit: 0, interp: 70, hits: [],
    lastSnapAt: 0, stalls: [], maxGap: 0, report: { stalls: 0, maxGap: 0 } };   // how the snapshots arrive (the network indicator)   // arrival jitter and the delay others are shown at (ms); my hits shown before the server's word   // my numbered controls, my flight as predicted here, and the correction still to ease in
  // the pilot the server flies for me: its own shots are mine, never a threat to me
  const mySrvShot = s => serverRun && !!srv.id && s.owner === srv.id;
  function serverStart(code) {
    net.send = () => {}; net.shot = () => {};   // nothing of mine goes anywhere but my controls
    document.getElementById("boardTitle").textContent = "Server · " + MODES[MODE].label + " · " + MAPS[mapThemeOf(code)].label;
    setStatus(false, "Server · connecting…");
    if (!SERVER_URL) { setStatus(false, "Server · no valid address"); return; }
    const ws = new WebSocket(SERVER_URL);
    srv.ws = ws;
    ws.binaryType = "arraybuffer";
    srv.snaps = new Map(); srv.snapQ = 0; srv.placed = false;
    ws.onopen = () => ws.send(JSON.stringify({ t: "join", code, name: me.name, bots: botChoice.n, level: botChoice.level, pub: !joining, bin: 1, rtc: window.RTCPeerConnection ? 1 : 0 }));   // a new game is listed, as online lobbies are; a room opened by typing a code is not
    ws.onmessage = e => {
      if (e.data instanceof ArrayBuffer) { receiveDelta(new Uint8Array(e.data)); return; }
      if (typeof e.data !== "string" || e.data.length > 262144) return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (!m || typeof m !== "object") return;
      if (m.t === "snap") receiveServer(m);
      else if (m.t === "pong") { if (Number.isFinite(m.c)) gotPing(performance.now() - m.c); }
      else if (m.t === "rtc" && typeof m.sdp === "string" && m.sdp.length < 16384) answerRtc(ws, m.sdp).catch(() => {});
      else if (m.t === "welcome" && typeof m.id === "string") {
        srv.id = m.id; srv.joined = true; srv.sendHz = clamp(num(m.sendHz, 15), 1, 60);
        setStatus(true, "Server · " + code.toUpperCase() + " · online");
      } else if (m.t === "error") { srv.err = String(m.reason || "").slice(0, 40); announce("SERVER", srv.err, "#ff8a8a", 2, true); }
    };
    ws.onclose = () => { srv.joined = false; try { srv.pc?.close(); } catch {} srv.dc = null; setStatus(false, "Server · disconnected" + (srv.err ? " · " + srv.err : "")); };
    setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ t: "ping", c: performance.now() })); }, 1000);
    // every 10 s the server hears how the connection is doing here (numbers only), for its own summary of the network
    setInterval(() => {
      if (ws.readyState !== 1 || !srv.joined) return;
      ws.send(JSON.stringify({ t: "net", p: Math.round(myPing || 0), j: Math.round(srv.jit), s: srv.report.stalls, g: Math.round(srv.report.maxGap), f: Math.round(1 / (frameAvg || 1 / 60)) }));
      srv.report = { stalls: 0, maxGap: 0 };
    }, 10000);
    setInterval(sendControls, 1000 / 30);
  }
  // my controls, as they are now: sent from the frame that uses them (so the server flies them as early as it can),
  // when they change and at least four times a second. Each message is numbered: the server says which number its
  // state has reached (ak) and how long it has flown it (ag), and serverSelf compares that with my own flight then
  function sendControls() {
    const ws = srv.ws;
    if (!ws || ws.readyState !== 1 || !srv.joined) return;
    const c = me.ctl || {}, i = { t: "in", mx: +num(c.mx, 0).toFixed(3), my: +num(c.my, 0).toFixed(3), aim: +me.a.toFixed(3),
      fire: !!c.fire && !me.dead && playing, alt: !!c.alt && !me.dead && playing, boost: !!c.boost, brake: !!c.brake && !me.dead, dash: srv.dashN, tele: srv.teleN,
      w: WEAPON_KEYS.indexOf(me.weapon), ld: Math.round(srv.interp / 5) * 5,
      gx: +num(srv.gx, 0).toFixed(3), gy: +num(srv.gy, 0).toFixed(3), gb: srv.gb || 0 };   // a guided nuke's stick and blow-ups   // ld: how far in the past I see the others (for lag compensation)
    const sig = JSON.stringify(i), t = performance.now(), fresh = srv.cs > srv.sentCs;   // fresh: flight commands not sent yet
    if (!fresh && (sig === srv.lastIn ? t - srv.lastInAt < 250 : t - srv.lastInAt < 14)) return;   // at most one a frame (the server allows 90 a second)
    srv.lastIn = sig; srv.lastInAt = t;
    // every flight command the server has not confirmed yet (up to 16), as Quake 3 sends them: whatever was lost or
    // came late on the way goes again in the next message (srv.cmds holds only the unconfirmed: reconcile drops the rest)
    const now0 = Math.round(clockNow());   // (each command's moment goes as how long before this one it was made)
    const vb = Math.round(Date.now() + (srv.off || 0));   // (and the moment of the others it showed, before this one in the snapshots' time)
    if (srv.cmds.length) { i.c = srv.cmds.slice(-16).map(c => [c.s, Math.round(c.mx * 1000), Math.round(c.my * 1000), Math.round(c.aim * 1000), (c.boost ? 1 : 0) | (c.brake ? 2 : 0) | (c.fire ? 4 : 0) | (c.alt ? 8 : 0), c.dash, Math.max(0, Math.min(5000, now0 - c.ct)), Math.max(0, Math.min(5000, vb - (c.vt || vb)))]); i.cb = now0; i.vb = vb; srv.sentCs = srv.cs; }
    i.s = ++srv.seq; srv.sent.set(i.s, t); i.sa = srv.snapQ;   // sa: the newest snapshot I hold (the next delta builds on it)
    if (srv.sent.size > 240) for (const [k, at] of srv.sent) { if (t - at < 3000) break; srv.sent.delete(k); }
    toServer(i);
  }
  // to the server: by the data channel while it works (a lost message holds nothing up), else by the WebSocket
  function toServer(m) {
    const dc = srv.dc, t = performance.now();
    if (dc && dc.readyState === "open" && t - srv.dcHeard < 1500) { try { dc.send(JSON.stringify(m)); return; } catch {} }
    if (srv.ws && srv.ws.readyState === 1) srv.ws.send(JSON.stringify(m));
  }
  // the server offers a data channel (WebRTC: unordered, never resent) for its snapshots and my controls. Nothing
  // goes to anyone else: no STUN, the server's own address is in its offer, and the WebSocket stays as the fallback
  async function answerRtc(ws, sdp) {
    if (!window.RTCPeerConnection || srv.pc) return;
    const pc = srv.pc = new RTCPeerConnection({ iceServers: [] });
    pc.ondatachannel = e => {
      const dc = e.channel; dc.binaryType = "arraybuffer";
      dc.onopen = () => { srv.dc = dc; srv.dcHeard = performance.now(); };
      dc.onmessage = ev => { srv.dcHeard = performance.now(); if (ev.data instanceof ArrayBuffer) receiveDelta(new Uint8Array(ev.data)); };
      dc.onclose = () => { if (srv.dc === dc) srv.dc = null; };
    };
    await pc.setRemoteDescription({ type: "offer", sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await new Promise(r => { if (pc.iceGatheringState === "complete") r(); pc.addEventListener("icegatheringstatechange", () => pc.iceGatheringState === "complete" && r()); setTimeout(r, 1500); });
    if (ws.readyState === 1) ws.send(JSON.stringify({ t: "rtc", sdp: pc.localDescription.sdp }));
  }
  // Reconciliation with commands, as Quake 3 and Overwatch do it: the server says where my pilot is after my command
  // ak; from there my commands it has not flown yet are flown again here, on a copy. Where that ends is where I should
  // be now. Speed, energy and the rest are taken as they are; the place is eased in (serverTrack), never jumped.
  const validMv = v => Array.isArray(v) && v.length === MOVE_STATE.length + 3 && v.every(Number.isFinite);
  function reconcile(m) {
    const ak = Number.isSafeInteger(m.ak) ? m.ak : 0;
    while (srv.cmds.length && srv.cmds[0].s <= ak) srv.cmds.shift();   // flown on the server: done with
    const o = { lv: me.lv, inv: 0, pinnedUntil: me.pinnedUntil }; setMoveState(o, m.mv);
    replaying = true;
    try { for (const c of srv.cmds) { o.vx += c.kx || 0; o.vy += c.ky || 0; pilotMove(o, c); } } finally { replaying = false; }   // (recoil first, as it went)
    // the flight takes the corrected state exactly (so the next bounce off a wall is the server's bounce too); only
    // the picture glides there: the gap is drawn as an offset that fades (vox, voy), as Overwatch and Rocket League do
    const ex = o.x - me.x, ey = o.y - me.y;
    srv.lastErr = Math.hypot(ex, ey); srv.errN = (srv.errN || 0) + 1;
    if (srv.lastErr > 300) srv.vox = srv.voy = 0;   // a teleport or a respawn: at once
    else { srv.vox -= ex; srv.voy -= ey; }
    srv.cx = srv.cy = 0;
    for (const k of MOVE_STATE) me[k] = o[k];
    me.stick = o.stick; me.boostOn = me.boosting = o.boostOn; energy = me.energy;
  }
  // each frame, after my flight: ease in what is left of the last correction, and remember where I was
  function serverTrack(dt, now) {
    if (me.dead || !srv.joined) { srv.hist.length = 0; srv.cx = srv.cy = srv.vox = srv.voy = 0; return; }
    const k = 1 - Math.exp(-15 * dt);
    srv.vox -= srv.vox * k; srv.voy -= srv.voy * k;
    me.x += srv.cx * k; me.y += srv.cy * k; srv.cx -= srv.cx * k; srv.cy -= srv.cy * k;
    srv.hist.push({ t: now, x: me.x + srv.cx, y: me.y + srv.cy, vx: me.vx, vy: me.vy });
    while (srv.hist.length > 2 && now - srv.hist[0].t > 1500) srv.hist.shift();
  }
  // where my flight was predicted to be at time t (between two frames)
  function histAt(t) {
    const h = srv.hist;
    if (!h.length || t < h[0].t) return null;
    for (let i = h.length - 1; i >= 0; i--) if (h[i].t <= t) {
      const a = h[i], b = h[i + 1];
      if (!b) return { i, ...a };
      const f = (t - a.t) / (b.t - a.t || 1);
      return { i, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, vx: a.vx + (b.vx - a.vx) * f, vy: a.vy + (b.vy - a.vy) * f };
    }
    return null;
  }
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
    // my shots, as fired on the server: the ones this screen already showed (predictShot) are not shown twice
    if (m.rd === stats.round && Array.isArray(m.f)) for (const f of m.f.slice(0, 24)) {
      if (Array.isArray(f) && typeof f[0] === "string" && !seenShots.has(f[0]) && claimPrediction(f[5], now, f[0])) { seenShots.set(f[0], performance.now()); noteShotKind(f[0], f[5]); continue; }
      addRemoteShot(srv.id, f, m.ts);
    }
    if (Array.isArray(m.ar)) serverArsenal(m.ar, m.wp);
    if (Number.isInteger(m.tn) && m.tn !== me.teleN) { me.teleN = clamp(m.tn, 0, 6); renderTele(); }
    if ("tm" in m) me.tm = m.tm === 0 || m.tm === 1 ? m.tm : undefined;
    if ("fc" in m) me.fc = m.fc === 0 || m.fc === 1 ? m.fc : -1;
    if (Array.isArray(m.al) && m.al.length === 3 && m.al.every(Number.isFinite)) { me.beltArmor = clamp(m.al[0], 0, MAX_SHIELD); me.bodyArmor = clamp(m.al[1], 0, MAX_SHIELD); me.padsArmor = clamp(m.al[2], 0, MAX_SHIELD); }
    if (Number.isInteger(m.am)) {   // Quad damage, as the server has it: taken there, its seconds counted there
      const left = me.ampUntil > now ? (me.ampUntil - now) / 1000 : 0;
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
      const k = Array.isArray(e) ? WEAPON_KEYS[e[0]] : null;
      if (k && WEAPONS[k]) ar[k] = e[1] === -1 ? Infinity : clamp(num(e[1], 0), 0, 9999);
    }
    const keys = Object.keys(ar).join(), was = Object.keys(me.arsenal).join(), old = me.arsenal;
    // a gun the server gave me (a crate or a trophy I flew through): said and heard as when picked up offline
    if (!me.dead) for (const k in ar) if (Number.isFinite(ar[k]) && ar[k] > (Number.isFinite(old[k]) ? old[k] : 0)) {
      if (performance.now() - (gunFx.get(k) ?? -1e9) < 3000) { gunFx.delete(k); continue; }   // shown at once when I flew through it
      const had = k in old, key = COARSE ? "" : " · press " + weaponKey(k);
      floaters.push({ x: me.x, y: me.y - 60, t: 0, txt: had ? "+AMMO " + WEAPONS[k].name.toUpperCase() : WEAPONS[k].name.toUpperCase() + key, gold: true });
      if (!(k === "nuke" ? packPlay("p_ut_nuke_pick", .9) : sfx("weapon_get", 0.8))) blip(660, 0.1, "square");
    }
    me.arsenal = ar;
    if (!(me.weapon in ar)) { const w = WEAPON_KEYS[wp]; me.weapon = w in ar ? w : Object.keys(ar)[0] || "fire"; }
    else if (keys === was) { renderAmmo(me.weapon); return; }
    renderWeapon();
  }
  // Shot prediction: my trigger runs the same shoot() as anywhere (every gun, both fires, rockets loaded, the
  // cutter and the charge cannon released), but each shot volley() makes is only shown here, at once, from my
  // nose, as the server will fire it from my controls. When the server's copy comes back it is not shown again
  // (claimPrediction). It is a picture only: what it hits, and the ammo it takes, are the server's word.
  const myShot = s => s.mine || mySrvShot(s);
  function predictShot(s) {
    const d = [srv.tag + ".p" + (srv.pseq++).toString(36), Math.round(s.x), Math.round(s.y), Math.round(s.vx), Math.round(s.vy), s.kind, +s.m.toFixed(2), 0, s.cut || 0, Date.now()];
    // lock-on shots (lightning, the plasma beam) are shown at once too, at the target this screen locks on (the server
    // locks on in its own view of the same moment, so it is nearly always the same one).
    // A prediction this screen refused (too many shots alive) is not recorded, so the server's copy still shows.
    if (addRemoteShot(srv.id, d, Date.now(), true) === true) srv.pred.push({ kind: s.kind, at: performance.now(), n: srv.pseq - 1 }); if (srv.pred.length > 48) srv.pred.shift();
    stats.shots++;
    return { ...s, mine: false, owner: srv.id, id: d[0] };   // for the caller: where it left from, whose it is (a saw recall), its id here
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
    srv.hits.push({ rid, at: now, dmg: shotDmg(s) });
    if (srv.hits.length > 64) srv.hits.shift();
  }
  // the server confirms a hit of mine on rid: true if it was shown already (its effects then stay quiet)
  function serverHitShown(rid) {
    const now = performance.now(), keep = 400 + (myPing || 100) * 2;
    while (srv.hits.length && now - srv.hits[0].at > keep) srv.hits.shift();
    const i = srv.hits.findIndex(h => h.rid === rid);
    if (i < 0) return false;
    srv.hits.splice(i, 1);
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
      if (type === "tele") floaters.push({ x, y: y - 20, t: 0, txt: "TELEPORTER" + (COARSE ? "" : " · press T"), gold: true });
      else floaters.push({ x, y: y - 20, t: 0, txt: trophy ? "TROPHY · " + w.name.toUpperCase() : me.arsenal[type] ? "+AMMO " + w.name.toUpperCase() : w.name.toUpperCase() + (COARSE ? "" : " · press " + weaponKey(type)), gold: true });
      burst(x, y, w.col);
      if (!(type === "nuke" ? packPlay("p_ut_nuke_pick", .9) : sfx("weapon_get", 0.8))) blip(660, 0.1, "square");
    };
    if (!MODES[MODE].only) {
      for (const c of world.picks) {
        if (grabbed.has(c.key) || c.age < 0.05 || WEAPONS[c.type]?.disabled || !near(c.x, c.y, 56)) continue;
        take(c.key, c.type); gunGot(c.type, c.x, c.y, false);
      }
      for (const [id, d] of gunDrops) {
        const key = "W" + id;
        if (grabbed.has(key) || WEAPONS[d.type]?.disabled || now - d.born < 650 || !near(d.x, d.y, 56)) continue;
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
      if (!sfx(sp.heal ? "heal" : "shield_get", 0.8)) blip(784, 0.14, "triangle");
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
  // ---------- the network indicator ----------
  // A snapshot is due every 1/sendHz s; one that comes three gaps late is a stall (on TCP, usually a lost packet
  // being sent again, which holds up everything behind it). The chip by the status shows the round trip and a dot:
  // green, yellow or red by the round trip and the stalls of the last 10 s; several stalls bring up a warning
  function snapArrived(t) {
    if (srv.lastSnapAt) {
      const gap = t - srv.lastSnapAt;
      if (gap > 3000 / srv.sendHz) { srv.stalls.push(t); srv.report.stalls++; }
      srv.report.maxGap = Math.max(srv.report.maxGap, gap);
    }
    srv.lastSnapAt = t;
  }
  const netQEl = document.getElementById("netQ"), netWarnEl = document.getElementById("netWarn");
  function netIndicator() {
    const show = (serverRun && srv.joined) || (playing && !offlineRun && !localRun && myPing > 0);
    netQEl.hidden = !show;
    if (!show) { netWarnEl.hidden = true; return; }
    const now = performance.now();
    while (srv.stalls.length && now - srv.stalls[0] > 10000) srv.stalls.shift();
    const ping = Math.round(myPing || 0), stalls = srv.stalls.length, quiet = serverRun && srv.lastSnapAt && now - srv.lastSnapAt > 1000;
    const q = quiet || ping > 180 || stalls > 5 ? "bad" : ping > 90 || stalls > 1 || srv.jit > 25 ? "ok" : "good";
    netQEl.className = "netq " + q;
    netQEl.textContent = ping + " ms";
    netQEl.title = `round trip ${ping} ms · jitter ${Math.round(srv.jit)} ms · stalls in the last 10 s: ${stalls}` + (serverRun ? ` · others shown ${Math.round(srv.interp)} ms back` : "");
    netWarnEl.hidden = !(playing && (quiet || stalls > 5 || ping > 250));
  }
  setInterval(netIndicator, 500);
  // the game server's open rooms, in the lobby browser next to the online lobbies (while the start screen shows)
  const ROOMS_URL = SERVER_URL ? SERVER_URL.replace(/^ws/, "http").replace(/\/?$/, "/rooms") : "";
  async function pollServerRooms() {
    if (!ROOMS_URL || playing || offlineOnly || document.hidden) return;
    let list;
    try { const r = await fetch(ROOMS_URL, { cache: "no-store" }); if (!r.ok) return; list = await r.json(); } catch { return; }
    if (!Array.isArray(list)) return;
    for (const e of list.slice(0, 20)) if (e) noteLobby(e.c, e.n, e.b, true);
    renderLobbies();
  }
  if (standalone && ROOMS_URL) { setTimeout(pollServerRooms, 500); setInterval(pollServerRooms, 4000); }
