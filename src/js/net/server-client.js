  // ---------- the authoritative server (server/ in the repository) ----------
  // In this mode the browser only flies and shows: it sends its controls, moves its own bin at once (prediction)
  // and eases it toward where the server says it is; everyone else, their shots, the pick-ups taken and the craters
  // come from the server's snapshots, read by the same code as a lobby host's state. Hits, damage, deaths,
  // respawns and pick-ups are the server's word; this browser never decides them.
  // Only our own server: a link must not be able to send players to someone else's (who would learn their names and
  // addresses and decide what they see). ?server= is honoured only for a server on this machine, for development;
  // a page that hosts the game elsewhere names its server in window.BRS_SERVER.
  const DEFAULT_SERVER = "wss://134-122-60-131.sslip.io:8443";
  // search: the page's query string; configured: the page's own window.BRS_SERVER. "" when no valid address
  function chooseServer(search, configured) {
    const m = /[?&]server=([^&#]+)/.exec(search || ""), local = m ? decodeURIComponent(m[1]) : "";
    if (/^wss?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(local)) return local;
    const u = configured || DEFAULT_SERVER;
    return /^wss:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(u) ? u : "";
  }
  const SERVER_URL = chooseServer(location.search, window.BRS_SERVER);
  let serverRun = false;
  const srv = { ws: null, id: "", tag: "", sendHz: 30, dashN: 0, lastIn: "", lastInAt: 0, deadSeen: false, joined: false, err: "", pred: [], pseq: 0,
    seq: 0, sent: new Map(), hist: [], cx: 0, cy: 0, vox: 0, voy: 0, seqOff: 0, cmds: [], cs: 0, sentCs: 0, acc: 0,   // my flight commands (pilotMove)   // seqOff: the server's shot numbers less mine (for the spread)
    jit: 0, interp: 70, hits: [],
    lastSnapAt: 0, stalls: [], maxGap: 0, report: { stalls: 0, maxGap: 0, hs: 0, hc: 0, hn: 0 } };   // how the snapshots arrive (the network indicator)   // arrival jitter and the delay others are shown at (ms); my hits shown before the server's word   // my numbered controls, my flight as predicted here, and the correction still to ease in
  // the pilot the server flies for me: its own shots are mine, never a threat to me
  const mySrvShot = s => serverRun && !!srv.id && s.owner === srv.id;
  function serverStart(code) {
    net.send = () => {}; net.shot = () => {};   // nothing of mine goes anywhere but my controls
    document.getElementById("boardTitle").textContent = "Server · " + MODES[MODE].label + " · " + MAPS[mapThemeOf(code)].label;
    setStatus(false, "Server · connecting…");
    if (!SERVER_URL) { setStatus(false, "Server · no valid address"); return; }
    srv.code = code;
    serverConnect();
    setInterval(() => { const ws = srv.ws; if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: "ping", c: performance.now() })); }, 1000);
    // every 10 s the server hears how the connection is doing here (numbers only), for its own summary of the network
    setInterval(() => {
      const ws = srv.ws;
      if (!ws || ws.readyState !== 1 || !srv.joined) return;
      ws.send(JSON.stringify({ t: "net", p: Math.round(myPing || 0), j: Math.round(srv.jit), s: srv.report.stalls, g: Math.round(srv.report.maxGap), f: Math.round(1 / (frameAvg || 1 / 60)), h: [srv.report.hs, srv.report.hc, srv.report.hn] }));
      srv.report = { stalls: 0, maxGap: 0, hs: 0, hc: 0, hn: 0 };
    }, 10000);
    setInterval(sendControls, 1000 / 30);
    // leaving the page: the server lets my pilot go at once (a connection that only dropped keeps it for me a while)
    addEventListener("pagehide", () => { srv.leaving = true; const ws = srv.ws; if (ws && ws.readyState === 1) try { ws.send(JSON.stringify({ t: "bye" })); } catch {} });
  }
  // what the server says when it will not have me: no use trying again
  const SERVER_FATAL = /^(bad code|server full|room full|you already have a room|idle)$/;
  // a connection to the server (again after it dropped: with my pilot's key, rk, the server gives me back my own
  // pilot, score and guns, if I am back within its 20 s; tried again after 0.5, 1, 2, 4 and then every 8 s, a minute in all)
  function serverConnect() {
    const ws = new WebSocket(SERVER_URL), code = srv.code;
    srv.ws = ws;
    ws.binaryType = "arraybuffer";
    srv.snaps = new Map(); srv.snapQ = 0;
    if (!srv.rk) srv.placed = false;
    ws.onopen = () => ws.send(JSON.stringify({ t: "join", code, name: me.name, bots: botChoice.n, level: botChoice.level, pub: !joining, bin: 1, rtc: window.RTCPeerConnection ? 1 : 0, rk: srv.rk || undefined }));   // a new game is listed, as online lobbies are; a room opened by typing a code is not
    ws.onmessage = e => {
      if (srv.ws !== ws) return;
      if (e.data instanceof ArrayBuffer) { receiveDelta(new Uint8Array(e.data)); return; }
      if (typeof e.data !== "string" || e.data.length > 262144) return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (!m || typeof m !== "object") return;
      if (m.t === "snap") receiveServer(m);
      else if (m.t === "pong") { if (Number.isFinite(m.c)) gotPing(performance.now() - m.c); }
      else if (m.t === "chat" && typeof m.m === "string") chatShow(String(m.n || "Pilot"), m.m, m.id === srv.id, String(m.id || ""));
      else if (m.t === "rtc" && typeof m.sdp === "string" && m.sdp.length < 16384) answerRtc(ws, m.sdp).catch(() => {});
      else if (m.t === "welcome" && typeof m.id === "string") {
        if (srv.id && m.id !== srv.id) srv.placed = false;   // came back too late: a new pilot, placed by the server
        if (srv.tries && m.resumed) announce("RECONNECTED", "back in the game", "#8fffb0", 2, true);
        srv.id = m.id; srv.rk = typeof m.rk === "string" ? m.rk : ""; srv.joined = true; srv.tries = 0; srv.err = ""; srv.sendHz = clamp(num(m.sendHz, 15), 1, 60);
        setStatus(true, "Server · " + code.toUpperCase() + " · online");
      } else if (m.t === "error") { srv.err = String(m.reason || "").slice(0, 40); announce("SERVER", srv.err, "#ff8a8a", 2, true); }
    };
    ws.onclose = () => {
      if (srv.ws !== ws) return;
      srv.joined = false; try { srv.pc?.close(); } catch {} srv.pc = null; srv.dc = null;
      if (!srv.leaving && !SERVER_FATAL.test(srv.err) && (srv.tries || 0) < 10) {
        const wait = Math.min(8000, 500 * 2 ** (srv.tries || 0)); srv.tries = (srv.tries || 0) + 1;
        setStatus(false, "Server · reconnecting…");
        setTimeout(serverConnect, wait);
        return;
      }
      setStatus(false, "Server · disconnected" + (srv.err ? " · " + srv.err : ""));
    };
  }
  // my controls, as they are now: sent from the frame that uses them (so the server flies them as early as it can),
  // when they change and at least four times a second. Each message is numbered: the server says which number its
  // state has reached (ak) and how long it has flown it (ag), and serverSelf compares that with my own flight then
  function sendControls() {
    const ws = srv.ws;
    if (!ws || ws.readyState !== 1 || !srv.joined) return;
    const c = me.ctl || {}, i = { t: "in", mx: +num(c.mx, 0).toFixed(3), my: +num(c.my, 0).toFixed(3), aim: +me.a.toFixed(3),
      fire: !!c.fire && !me.dead && playing, alt: !!c.alt && !me.dead && playing, boost: !!c.boost, brake: !!c.brake && !me.dead, dash: srv.dashN,
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
