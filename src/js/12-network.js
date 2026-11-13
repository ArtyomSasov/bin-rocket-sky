  // ---------- networking ----------
  // State and recent shots travel together; every connected broker receives the same sequence.
  const net = { send() {}, shot() {}, shotsInState: true, hz: 8 };
  const MAX_REMOTES = 128, MAX_DROPS = 256, MAX_SEEN_SHOTS = 4096, MAX_CREDITS = 16384;
  const netDot = document.getElementById("netDot"), netText = document.getElementById("netText");
  const shareBtn = document.getElementById("shareBtn"), codeBtn = document.getElementById("codeBtn");
  function copyText(text, btn, label, done) {
    const ok = () => { btn.textContent = done; setTimeout(() => btn.textContent = label, 1600); };
    const legacy = () => {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      const copied = document.execCommand("copy"); ta.remove();
      if (copied) ok(); else btn.textContent = text;
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, legacy);
    else legacy();
  }
  // the lobby browser (standalone hosting only)
  const LOBBY_BROKER = "wss://broker.hivemq.com:8884/mqtt", LOBBY_TOPIC = "binrocket-sky/v2/lobbies", LOBBY_EVERY = 4000, LOBBY_TTL = 13000;
  const openLobbies = new Map();   // code -> { n: pilots, b: bots, at: when last heard }
  let lobbyRenderPending = false;
  function renderLobbies() {
    const el = document.getElementById("lobbyList"), now = Date.now();
    for (const [c, l] of openLobbies) if (now - l.at > LOBBY_TTL) openLobbies.delete(c);
    const list = [...openLobbies].sort((a, b) => b[1].n - a[1].n).slice(0, 20);
    document.getElementById("tabJoin").textContent = list.length ? `Join a game (${list.length})` : "Join a friend";
    if (!el) return;
    el.replaceChildren(...list.map(([c, l]) => {
      const row = document.createElement("button"); row.type = "button"; row.className = "lobby";
      const t = document.createElement("b"); t.textContent = MODES[modeOf(c)].label + " · " + MAPS[mapThemeOf(c)].label + " · " + MAP_SIZES[mapOf(c)][1];
      const s = document.createElement("small"); s.textContent = l.n + (l.n === 1 ? " pilot" : " pilots") + (l.b ? " + " + l.b + " bots" : "") + " · " + c.toUpperCase();
      row.append(t, s);
      row.addEventListener("click", () => { lobbyInput.value = c.toUpperCase(); lobbyInput.dispatchEvent(new Event("input")); document.getElementById("startForm").requestSubmit(); });
      return row;
    }));
    if (!list.length) { const p = document.createElement("p"); p.className = "codeline"; p.textContent = "No open games right now: start a new one, or type a friend's code."; el.append(p); }
  }
  // lobby choice (standalone hosting only)
  const standalone = !(window.claude && typeof window.claude.use === "function");
  if (standalone) setInterval(renderLobbies, 3000);   // the lobby browser drops games that went quiet
  let chooseLobby;
  const lobbyChosen = new Promise(r => { chooseLobby = r; });
  const CODE_ABC = "abcdefghjkmnpqrstuvwxyz23456789";
  const normCode = v => v.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  function setStatus(on, text) { netDot.classList.toggle("on", on); netText.textContent = text; }

  // how far ahead (s) to place a flyer from its last report: roughly the network delay we measured (~85-100 ms)
  const LEAD = 0.09;
  function addRemoteShot(owner, f) {
    if (!Array.isArray(f) || typeof f[0] !== "string" || f[0].length > 20 || seenShots.has(f[0])) return;
    if (!remotes.has(owner) || seenShots.size >= MAX_SEEN_SHOTS) return;
    const kind = Number.isInteger(f[5]) && f[5] >= 0 && f[5] < SHOTS.length ? f[5] : 0, m = f[6] === 3 ? 3 : 1;
    const x = clamp(num(f[1], 0), 0, W), y = clamp(num(f[2], 0), 0, H);
    const sh = {
      id: f[0], kind, x, y, px: x, py: y, ox: x, oy: y, m,
      vx: clamp(num(f[3], 0), -4500, 4500), vy: clamp(num(f[4], 0), -4500, 4500),
      life: Math.max(SHOTS[kind].life * 0.7, SHOTS[kind].life - 0.1), mine: false, owner   // a bit shorter: it was fired a moment ago
    };
    // a peer can send anything: cap what one owner (and everyone together) can keep alive here
    let own = 0, ownMines = 0;
    for (const o of shots) if (o.owner === owner) { own++; if (o.kind === K.MINE) ownMines++; }
    if (shots.length > 900 || own > 80 || (kind === K.MINE && ownMines >= 12)) return;
    seenShots.set(f[0], performance.now());
    if (kind === K.PELLET) scatterPellets(sh); else if (kind === K.SHARD) shardSpray(sh); else shots.push(sh);
    if (kind === K.RAIL) railBeam(x, y, sh.vx, sh.vy);
    shotSound(kind, x, y);
    if (seenShots.size > 400) { const t = performance.now(); for (const [k, at] of seenShots) if (t - at > 5000) seenShots.delete(k); }
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
    if (p.q <= r.q) return false;
    r.seen = performance.now();
    if (Number.isFinite(p.ts)) {
      const o = clamp(p.ts - Date.now(), -120000, 120000);
      r.off = Number.isFinite(r.off) ? r.off + (o - r.off) * 0.1 : o;
    }
    // Apply all fields only from states newer than what we have (two brokers / reordering).
    r.q = p.q;
    if (hasPos) {
      r.vx = clamp(num(p.vx, 0), -1200, 1200); r.vy = clamp(num(p.vy, 0), -1200, 1200);
      r.tx = clamp(p.x + r.vx * LEAD, 0, W); r.ty = clamp(p.y + r.vy * LEAD, 0, H);
      if (Math.hypot(r.tx - r.x, r.ty - r.y) > 300) { r.x = r.tx; r.y = r.ty; }   // teleport (respawn, black hole)
      if (Number.isFinite(p.a)) r.ta = p.a;
      r.thrust = p.t ? 1 : 0;
      const bf = p.b === 1 || p.b === 2 ? p.b : 0;
      if (bf === 2 && r.boost !== 2) dashBurst(r);   // they just dashed
      r.boost = bf;
      const dead = p.d === 1;
      if (dead && !r.dead) deathFx(r, p.ds, Number.isInteger(p.dk) && p.dk >= 0 && p.dk <= 3 ? p.dk : 0, num(p.da, 0));
      r.dead = dead; r.inv = p.i === 1;
    }
    if (typeof p.tg === "string" && /^[a-z0-9]{1,8}$/.test(p.tg)) r.tag = p.tg;
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
    if (Number.isFinite(p.lv)) r.lv = clamp(Math.floor(p.lv), 1, MAX_LV);
    if (Array.isArray(p.st) && p.st.length === 6 && p.st.every(Number.isInteger)) r.st = p.st;   // [round, kills, deaths, shots, hits, best]
    if (Array.isArray(p.cv)) applyRemoteCarves(id, p.cv);
    if (Number.isInteger(p.wp)) r.weapon = WEAPON_KEYS[p.wp] || "fire";
    if (Number.isFinite(p.sh)) r.shield = clamp(p.sh, 0, MAX_SHIELD);
    if ("am" in p) r.amp = p.am === 1;
    if (Number.isFinite(p.l)) r.lives = clamp(p.l, 0, maxLivesOf(r.lv));
    if (Array.isArray(p.g)) for (const k of p.g.slice(0, 48)) if (typeof k === "string" && k.length < 16 && (grabbed.has(k) || grabbed.size < 16384)) grabbed.add(k);
    if (p.rd === stats.round && Array.isArray(p.f)) for (const f of p.f.slice(0, 10)) addRemoteShot(id, f);
    if (Array.isArray(p.dr)) for (const d of p.dr.slice(0, 3)) {
      if (drops.size >= MAX_DROPS) break;
      if (!Array.isArray(d) || typeof d[0] !== "string" || d[0].length > 10 || drops.has(d[0])) continue;
      drops.set(d[0], { x: clamp(num(d[1], 0), 0, W), y: clamp(num(d[2], 0), 0, H), n: clamp(Math.floor(num(d[3], 0)), 0, 40), born: performance.now() });
    }
    if (Array.isArray(p.terrain)) applyTerrain(p.terrain);
    // Event IDs belong to one round; old reports must not survive a round reset.
    if (p.rd !== stats.round) { showScore(); return true; }
    if (Array.isArray(p.rk)) applyRockMotion(p.rk);
    // credit for my fireballs that they report
    const validHit = k => typeof k === "string" && k.length <= 48;
    const mine = k => validHit(k) && k.startsWith(myTag + ".") && credited.size < MAX_CREDITS;
    for (const k of Array.isArray(p.hb) ? p.hb.slice(0, 16).filter(validHit) : []) if (mine(k) && !credited.has(k)) {
      credited.add(k); me.score += 1; stats.hits++; floaters.push({ x: r.x, y: r.y - 30, t: 0, txt: "Hit +1", gold: false });
    }
    if (bots.length) { creditBots(Array.isArray(p.hb) ? p.hb.slice(0, 16).filter(validHit) : [], false); creditBots(Array.isArray(p.ko) ? p.ko.slice(0, 16).filter(validHit) : [], true); }
    for (const k of Array.isArray(p.ko) ? p.ko.slice(0, 16).filter(validHit) : []) if (typeof k === "string") reportKill(k, r.name);
    for (const k of Array.isArray(p.ko) ? p.ko.slice(0, 16).filter(validHit) : []) if (mine(k) && !credited.has("ko" + k)) {
      credited.add("ko" + k); me.score += 5; floaters.push({ x: r.x, y: r.y - 50, t: 0, txt: "KILL " + r.name, gold: true });
      stats.kills++; stats.streak++; stats.best = Math.max(stats.best, stats.streak);
      myKillAnnounce(performance.now());
      blip(520, 0.35);
    }
    showScore();
    return true;
  }
  const botsOf = new Map();   // host id -> the ids of the bots it flies
  function removeRemote(id) {
    remotes.delete(id);
    for (const b of botsOf.get(id) || []) if (remotes.get(b)?.host === id) remotes.delete(b);
    botsOf.delete(id);
  }

  function pruneNetwork(now) {
    for (const [id, r] of remotes) if (!botById.has(id) && now - r.seen > 7000) removeRemote(id);
    for (const [id, d] of drops) if (now - d.born > DROP_LIFE) drops.delete(id);
  }

  async function initNet() {
    if (window.claude && typeof window.claude.use === "function") {
      const room = await window.claude.use("room");
      if (!room) { setStatus(false, "Solo flight · multiplayer needs a signed-in invite to this page"); return; }
      net.send = p => room.presence(p).catch(() => {});
      net.shotsInState = true;   // presence is the only channel every viewer may write
      room.onPeers(ch => {
        for (const p of ch.joined.concat(ch.updated)) if (!p.sameTab) applyRemote(p.peer, p.presence);
        for (const p of ch.left) removeRemote(p.peer);
      });
      room.onConnection(c => setStatus(c, c ? "Live · everyone with this page open flies here" : "Reconnecting…"),
        () => setStatus(false, "Solo flight"));
      return;
    }
    // Standalone hosting: every player talks to public MQTT brokers over secure WebSocket.
    // No direct browser-to-browser links, so office NATs and mobile networks don't matter.
    // Both brokers carry the same state, so a peer with access to only one can still see everyone.
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js";
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    }).catch(() => { setStatus(false, "Solo flight · could not load the multiplayer library"); throw new Error("mqtt"); });

    // the lobby browser: every running lobby says it exists on one shared topic every few seconds, and the start
    // screen lists the ones heard lately (no server of our own: it's the same public broker the game talks through)
    const browse = mqtt.connect(LOBBY_BROKER, { clientId: "brs_b_" + Math.random().toString(36).slice(2, 10), clean: true, keepalive: 30, reconnectPeriod: 3000 });
    browse.on("connect", () => browse.subscribe(LOBBY_TOPIC, { qos: 0 }));
    browse.on("error", () => {});
    browse.on("message", (topic, payload) => {
      if (payload.length > 300) return;
      let p; try { p = JSON.parse(payload.toString()); } catch { return; }
      if (!p || typeof p.c !== "string" || !/^[a-z0-9]{4,10}$/.test(p.c) || !Number.isInteger(p.n) || p.n < 1 || p.n > 64) return;
      if (!openLobbies.has(p.c) && openLobbies.size >= 60) return;   // the topic is public: keep the list bounded
      openLobbies.set(p.c, { n: p.n, b: Number.isInteger(p.b) ? clamp(p.b, 0, 64) : 0, at: Date.now() });
      if (!lobbyRenderPending) { lobbyRenderPending = true; setTimeout(() => { lobbyRenderPending = false; renderLobbies(); }, 500); }
    });

    const code = await lobbyChosen;          // picked on the start screen
    browse.end(true);
    setMapSize(mapOf(code));
    buildPlanets(code);
    setMode(modeOf(code));
    Object.assign(me, spawnPoint(me.tm));
    for (const b of bots) Object.assign(b, spawnPoint(b.tm));
    history.replaceState(null, "", "#" + code);
    const shown = code.toUpperCase();
    document.getElementById("boardTitle").textContent = "Lobby " + shown + " · " + MODES[MODE].label + " · " + MAPS[mapThemeOf(code)].label;
    shareBtn.hidden = false;
    shareBtn.onclick = () => copyText(location.href, shareBtn, "Copy invite link", "Link copied");
    codeBtn.hidden = false;
    codeBtn.textContent = "Code " + shown + " · copy";
    codeBtn.onclick = () => copyText(shown, codeBtn, "Code " + shown + " · copy", "Code copied");

    // Eight state messages/s plus discovery stay below the backup broker's ~10/s budget.
    // Shots ride in state, including on the primary, and q deduplicates the two deliveries.
    const BROKERS = [LOBBY_BROKER, "wss://broker.emqx.io:8084/mqtt"];
    const myId = "p" + Math.random().toString(36).slice(2, 10);
    const base = "binrocket-sky/v2/" + code + "/";
    const clients = BROKERS.map(url => {
      const c = mqtt.connect(url, {
        clientId: "brs_" + myId + "_" + Math.random().toString(36).slice(2, 6),
        clean: true, keepalive: 20, reconnectPeriod: 2000, connectTimeout: 10000, queueQoSZero: false
      });
      c.on("connect", () => { c.subscribe([base + "s/+"], { qos: 0 }); refresh(); });
      c.on("close", refresh);
      c.on("offline", refresh);
      c.on("error", () => {});
      c.on("message", (topic, payload) => {
        const parts = topic.split("/");
        const kind = parts[parts.length - 2], id = parts[parts.length - 1];
        if (id === myId || !/^p[a-z0-9]{1,12}$/.test(id)) return;
        // A disconnect on one broker is not departure from the room. Expire silent peers instead.
        if (kind !== "s" || payload.length > 16384) return;
        let p; try { p = JSON.parse(payload.toString()); } catch { return; }
        if (!applyRemote(id, p)) return;
        if (Array.isArray(p.bots)) {
          const ids = [];
          for (const e of p.bots.slice(0, 8)) {
            if (!Array.isArray(e) || typeof e[0] !== "string" || !/^pb[a-z0-9]{1,10}$/.test(e[0]) || botById.has(e[0])) continue;
            const old = remotes.get(e[0]);
            if (old && old.host !== id) continue;   // another host's bot (or a real player) cannot be claimed
            if (applyRemote(e[0], e[1])) { remotes.get(e[0]).host = id; ids.push(e[0]); }
            else if (old) ids.push(e[0]);
          }
          botsOf.set(id, ids);
        }
      });
      return c;
    });
    function refresh() {
      const up = clients.filter(c => c.connected).length;
      if (up) setStatus(true, "Lobby " + shown + " · online · " + (remotes.size + 1) + " in lobby");
      else setStatus(false, "Lobby " + shown + " · reconnecting…");
    }
    setInterval(refresh, 2000);
    net.send = p => {
      const payload = JSON.stringify(p);
      for (const c of clients) if (c.connected) c.publish(base + "s/" + myId, payload, { qos: 0 });
    };
    // Discovery listens on HiveMQ; announce there even when other peers use EMQX.
    setInterval(() => {
      if (!clients[0].connected || !playing) return;
      let n = 1, b = 0;
      for (const id of remotes.keys()) if (/^pb/.test(id)) b++; else n++;
      clients[0].publish(LOBBY_TOPIC, JSON.stringify({ c: code, n, b }), { qos: 0 });
    }, LOBBY_EVERY);
    addEventListener("pageshow", e => { if (e.persisted) location.reload(); });
    addEventListener("pagehide", () => {
      for (const c of clients) c.end(true);
    });
    // a tab coming back after sleep reconnects at once instead of waiting for the next retry
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) for (const c of clients) if (!c.connected) c.reconnect();
    });
    addEventListener("online", () => { for (const c of clients) if (!c.connected) c.reconnect(); });
  }

