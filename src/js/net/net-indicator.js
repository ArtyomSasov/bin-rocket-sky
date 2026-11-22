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
