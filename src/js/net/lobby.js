  // ---------- networking ----------
  // State and recent shots travel together; every connected broker receives the same sequence.
  const net = { send() {}, shot() {}, shotsInState: true, hz: 8 };
  const MAX_REMOTES = 128, MAX_SEEN_SHOTS = 4096, MAX_CREDITS = 16384;
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
  // a broker of your own replaces the public ones: ?broker=wss://your.host/mqtt in the page address, or
  // window.BRS_BROKER set before the game loads (see server/ in the repo)
  const ownBroker = () => { const m = /[?&]broker=([^&#]+)/.exec(location.search || ""), b = m ? decodeURIComponent(m[1]) : window.BRS_BROKER || ""; return /^wss:\/\/[a-z0-9.-]+(:\d+)?(\/[\w./-]*)?$/i.test(b) || /^ws:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[\w./-]*)?$/i.test(b) ? b : ""; };   // plain ws only for a broker on this machine (testing); read when connecting
  const lobbyBroker = () => ownBroker() || "wss://broker.hivemq.com:8884/mqtt";
  const LOBBY_TOPIC = "binrocket-sky/v19/lobbies", LOBBY_EVERY = 4000, LOBBY_TTL = 13000;
  // "code" (online lobbies) or "s:code" (game-server rooms) -> { c: code, n: pilots, b: bots, s: on the server, at: when last heard }
  const openLobbies = new Map();
  let lobbyRenderPending = false;
  // one rule for what the lobby list takes in, from the public broker or from the game server
  function noteLobby(c, n, b, onServer) {
    if (typeof c !== "string" || !/^[a-z0-9]{4,16}$/.test(c) || !Number.isInteger(n) || n < 1 || n > 64) return false;
    const key = (onServer ? "s:" : "") + c;
    if (!openLobbies.has(key) && openLobbies.size >= 60) return false;   // both sources are public: keep the list bounded
    openLobbies.set(key, { c, n, b: Number.isInteger(b) ? clamp(b, 0, 64) : 0, s: !!onServer, at: Date.now() });
    return true;
  }
  // set by the start screen: switches online / game server for a listed game (false if that choice is unavailable)
  let chooseWhere = () => false;
  function renderLobbies() {
    const el = document.getElementById("lobbyList"), now = Date.now();
    for (const [c, l] of openLobbies) if (now - l.at > LOBBY_TTL) openLobbies.delete(c);
    const list = [...openLobbies].sort((a, b) => b[1].n - a[1].n).slice(0, 20);
    document.getElementById("tabJoin").textContent = list.length ? `Join a game (${list.length})` : "Join a friend";
    if (!el) return;
    el.replaceChildren(...list.map(([, l]) => {
      const c = l.c;
      const row = document.createElement("button"); row.type = "button"; row.className = "lobby";
      const t = document.createElement("b"); t.textContent = MODES[modeOf(c)].label + " · " + mapLabel(c) + " · " + MAP_SIZES[mapOf(c)][1] + " · " + TIME_OPTS[timeOf(c)] + " min" + (scoreLimit(c) ? " · to " + scoreLimit(c) : "");
      const s = document.createElement("small"); s.textContent = (l.s ? "Game server · " : "") + l.n + (l.n === 1 ? " pilot" : " pilots") + (l.b ? " + " + l.b + " bots" : "") + " · " + c.toUpperCase();
      row.append(t, s);
      if (l.s) row.classList.add("srv");
      row.addEventListener("click", () => {
        // a room on the game server is joined there, an online lobby online (for this game only: the saved
        // default stays the player's own choice); with that way in unavailable, the click does nothing
        if (!chooseWhere(l.s ? "srv" : "on")) return;
        lobbyInput.value = c.toUpperCase(); lobbyInput.dispatchEvent(new Event("input")); document.getElementById("startForm").requestSubmit(); });
      return row;
    }));
    if (!list.length) { const p = document.createElement("p"); p.className = "codeline"; p.textContent = "No open games right now: start a new one, or type a friend's code."; el.append(p); }
    renderServerRooms(list.filter(([, l]) => l.s).map(([, l]) => l));
  }
  // with the game server picked for a new game: the games already going on it, each a click away, above the steps
  // (the server holds few rooms, so joining one is usually the way in), and their count on the server's button
  function renderServerRooms(rooms) {
    const box = document.getElementById("srvRooms"), btn = document.querySelector('#wherePick [data-v="srv"]');
    if (btn) btn.textContent = rooms.length ? `Game server · ${rooms.length} on` : "Game server (beta)";
    if (!box) return;
    box.hidden = !serverRun || !rooms.length;
    if (box.hidden) return;
    const head = document.createElement("span"); head.textContent = rooms.length === 1 ? "A game is on the server now" : rooms.length + " games are on the server now";
    box.replaceChildren(head, ...rooms.map(l => {
      const c = l.c, b = document.createElement("button"); b.type = "button"; b.className = "go srv-join";
      const t = document.createElement("b"); t.textContent = "Join: " + MODES[modeOf(c)].label + " · " + mapLabel(c, "name") + " · " + MAP_SIZES[mapOf(c)][1];
      const s2 = document.createElement("small"); s2.textContent = l.n + (l.n === 1 ? " pilot" : " pilots") + (l.b ? " + " + l.b + " bots" : "") + " · " + c.toUpperCase();
      b.append(t, s2);
      b.addEventListener("click", () => { if (!chooseWhere("srv")) return; lobbyInput.value = c.toUpperCase(); lobbyInput.dispatchEvent(new Event("input")); document.getElementById("startForm").requestSubmit(); });
      return b;
    }));
  }
  // lobby choice (standalone hosting only)
  const standalone = !(window.claude && typeof window.claude.use === "function");
  if (standalone) setInterval(renderLobbies, 3000);   // the lobby browser drops games that went quiet
  let chooseLobby;
  const lobbyChosen = new Promise(r => { chooseLobby = r; });
  const CODE_ABC = "abcdefghjkmnpqrstuvwxyz23456789";
  // offline: just you and the bots in this browser, no broker at all. ?offline in the address skips even loading
  // the multiplayer library (no network needed); the start screen sets offlineRun; noNetwork is filled in there
  const offlineOnly = standalone && /[?&]offline(=1|=true)?(&|#|$)/.test(location.search || "");
  let offlineRun = offlineOnly, localRun = false, noNetwork = () => {};
  const normCode = v => v.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
