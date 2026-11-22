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
    // Offline (?offline in the address, the start screen's "Offline" pick, or no network at all) skips all of it.
    // no network at all (or the library hangs for 6 s): offline and the local room are what's left
    const online = !offlineOnly && navigator.onLine !== false && await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js";
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
      setTimeout(rej, 6000);
    }).then(() => true, () => false);
    if (!online) noNetwork(offlineOnly ? "Offline · you against the bots" : "No connection · offline with bots");

    // the lobby browser: every running lobby says it exists on one shared topic every few seconds, and the start
    // screen lists the ones heard lately (no server of our own: it's the same public broker the game talks through)
    const browse = online ? mqtt.connect(lobbyBroker(), { clientId: "brs_b_" + Math.random().toString(36).slice(2, 10), clean: true, keepalive: 30, reconnectPeriod: 3000 }) : null;
    if (browse) {
    browse.on("connect", () => browse.subscribe(LOBBY_TOPIC, { qos: 0 }));
    browse.on("error", () => {});
    browse.on("message", (topic, payload) => {
      if (payload.length > 300) return;
      let p; try { p = JSON.parse(payload.toString()); } catch { return; }
      if (!p || !noteLobby(p.c, p.n, p.b, false)) return;
      if (!lobbyRenderPending) { lobbyRenderPending = true; setTimeout(() => { lobbyRenderPending = false; renderLobbies(); }, 500); }
    });
    }

    const code = await lobbyChosen;          // picked on the start screen
    if (browse) browse.end(true);
    setMapSize(mapOf(code));
    buildPlanets(code);
    setMode(modeOf(code));
    setMatch(code);
    if (!serverRun && (offlineRun || !online || ((!joining || hosted().includes(code)) && !lan.guest))) startMatch(clockNow());   // the server keeps its own clock
    Object.assign(me, spawnPoint(me.tm));
    for (const b of bots) Object.assign(b, spawnPoint(b.tm));
    const shown = code.toUpperCase();
    if (serverRun) { serverStart(code); return; }   // the authoritative server (net/server-client.js)
    if (localRun) { lanStart(code); return; }   // the local room (net/lan.js): WebRTC to the devices nearby
    if (offlineRun || !online) {
      // nobody else is here: the bots fly in this browser, nothing is sent and the lobby is not announced. Rounds run
      // on the shared clock (so everyone in a lobby is in the same one); alone, the clock is shifted so that a fresh
      // round starts right now instead of joining one already under way
      clockBase = clockOff = clockTarget = 0;
      startMatch(clockNow());
      firstRoundIdx = null;   // so the fresh round is Round 1
      document.getElementById("boardTitle").textContent = "Offline · " + MODES[MODE].label + " · " + MAPS[mapThemeOf(code)].label;
      setStatus(false, "Offline · you and " + bots.length + (bots.length === 1 ? " bot" : " bots"));
      return;
    }
    history.replaceState(null, "", "#" + code);
    document.getElementById("boardTitle").textContent = "Lobby " + shown + " · " + MODES[MODE].label + " · " + MAPS[mapThemeOf(code)].label;
    shareBtn.hidden = false;
    shareBtn.onclick = () => copyText(location.href, shareBtn, "Copy invite link", "Link copied");
    codeBtn.hidden = false;
    codeBtn.textContent = "Code " + shown + " · copy";
    codeBtn.onclick = () => copyText(shown, codeBtn, "Code " + shown + " · copy", "Code copied");

    // Eight state messages/s plus discovery stay below the backup broker's ~10/s budget.
    // Shots ride in state, including on the primary, and q deduplicates the two deliveries.
    const BROKERS = ownBroker() ? [ownBroker()] : [lobbyBroker(), "wss://broker.emqx.io:8084/mqtt"];
    if (ownBroker()) net.hz = 15;   // a broker of your own has no such budget: nearly twice the updates, so flyers move smoother
    const myId = "p" + Math.random().toString(36).slice(2, 10);
    const base = "binrocket-sky/v19/" + code + "/";
    const clients = BROKERS.map(url => {
      const c = mqtt.connect(url, {
        clientId: "brs_" + myId + "_" + Math.random().toString(36).slice(2, 6),
        clean: true, keepalive: 20, reconnectPeriod: 2000, connectTimeout: 10000, queueQoSZero: false
      });
      c.on("connect", () => { c.subscribe([base + "s/+", base + "f/+", base + "c/+", base + "e/" + myId], { qos: 0 }); refresh(); });
      c.on("close", refresh);
      c.on("offline", refresh);
      c.on("error", () => {});
      c.on("message", (topic, payload) => {
        const parts = topic.split("/");
        const kind = parts[parts.length - 2], id = parts[parts.length - 1];
        if (!/^p[a-z0-9]{1,12}$/.test(id)) return;
        if (kind === "e") { if (id === myId && c === pingVia()) { const t = Number(payload.toString()); if (t > 0) gotPing(performance.now() - t); } return; }   // my ping echo
        if (id === myId) return;
        if (kind === "c") {   // chat from a peer: its own name, its text cleaned and shown as text
          if (payload.length > 600 || !remotes.has(id)) return;
          let p; try { p = JSON.parse(payload.toString()); } catch { return; }
          if (p && typeof p.m === "string") chatShow(remotes.get(id).name || "Pilot", p.m, false, id);
          return;
        }
        // A disconnect on one broker is not departure from the room. Expire silent peers instead.
        if ((kind !== "s" && kind !== "f") || payload.length > (kind === "f" ? 2048 : 65536)) return;
        let p; try { p = JSON.parse(payload.toString()); } catch { return; }
        if (kind === "f") {
          if (p && p.rd === stats.round && Array.isArray(p.f) && remotes.has(id)) for (const f of p.f.slice(0, 4)) addRemoteShot(id, f, p.ts);
        } else receiveState(id, p);
      });
      return c;
    });
    function refresh() {
      const up = clients.filter(c => c.connected).length;
      if (up) setStatus(true, "Lobby " + shown + " · online · " + (remotes.size + 1) + " in lobby");
      else setStatus(false, "Lobby " + shown + " · reconnecting…");
    }
    setInterval(refresh, 2000);
    const pingVia = () => clients.find(c => c.connected);
    setInterval(() => { const c = pingVia(); if (c) c.publish(base + "e/" + myId, String(performance.now()), { qos: 0 }); }, 2000);
    // Heavy/isolated shots go out immediately. Bound extra traffic from automatic guns;
    // their intervening rounds still ride the next state, with the same IDs for deduplication.
    let instantShotAt = -Infinity;
    net.shot = d => {
      const now = performance.now();
      if (now - instantShotAt < 125) return;
      instantShotAt = now;
      const payload = JSON.stringify({ rd: stats.round, ts: Date.now(), f: [d] });
      for (const c of clients) if (c.connected) c.publish(base + "f/" + myId, payload, { qos: 0 });
    };
    net.chat = text => { const payload = JSON.stringify({ m: text }); clients.find(c => c.connected)?.publish(base + "c/" + myId, payload, { qos: 0 }); };
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

