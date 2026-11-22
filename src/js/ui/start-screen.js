  // ---------- start ----------
  const pv = document.getElementById("preview"), pctx = pv.getContext("2d");
  function drawPreview(now) {
    const main = g, mainTS = TS; g = pctx; TS = 1;
    try {
    const k = pv.width / 150;
    pctx.setTransform(1, 0, 0, 1, 0, 0); pctx.clearRect(0, 0, pv.width, pv.height);
    pctx.setTransform(k * 1.25, 0, 0, k * 1.25, 0, 0);
    drawBot({ ...me, name: "", blink: false, thrust: 0.9, a: -Math.PI / 2 + Math.sin(now / 900) * 0.25 }, 60, 66, now, true);   // low enough for a hat or halo
    } finally { g = main; TS = mainTS; }
  }
  me.ck = cleanCustom((() => { try { return JSON.parse(store.get("binrocket.custom")); } catch { return null; } })());
  const optsEl = document.getElementById("customOpts");
  const swatchBg = (key, val) => key === "body" ? (val === null ? "#4fd6c8" : toneCss(val, 65, 55))
    : key === "lid" ? (val === null ? "#9d8fc8" : toneCss(val, 45, 60))
    : key === "flame" ? (val === null ? "linear-gradient(#ffe08a,#ff5a1f)" : val === "rainbow" ? "linear-gradient(90deg,#ff6b6b,#ffe66b,#6bff95,#6bd5ff,#ff7bea)" : `rgb(${FLAMES[val].mid})`)
    : null;
  const lookPanels = [];
  function setLook(ck) {
    me.ck = ck;
    store.set("binrocket.custom", JSON.stringify(me.ck));
    for (const p of lookPanels) for (const o of p.querySelectorAll(".sw")) {
      o.setAttribute("aria-pressed", String(+o.dataset.i === me.ck[CUSTOM_KEYS.indexOf(o.dataset.key)]));
    }
  }
  function lookPicker(el) {
  lookPanels.push(el);
  for (const key of CUSTOM_KEYS) {
    const row = document.createElement("div"); row.className = "opt-row";
    const lab = document.createElement("span"); lab.textContent = CUSTOM[key].label;
    const sws = document.createElement("div"); sws.className = "sws";
    CUSTOM[key].items.forEach(([name, val], i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "sw"; b.title = name; b.setAttribute("aria-label", CUSTOM[key].label + ": " + name);
      const bg = swatchBg(key, val);
      if (bg) b.style.setProperty("--c", bg); else { b.classList.add("txt"); b.textContent = name; }
      b.dataset.key = key; b.dataset.i = i;
      b.setAttribute("aria-pressed", String(me.ck[CUSTOM_KEYS.indexOf(key)] === i));
      b.addEventListener("click", () => {
        const ck = me.ck.slice(); ck[CUSTOM_KEYS.indexOf(key)] = i;
        setLook(ck);   // others see it with my next state
      });
      sws.appendChild(b);
    });
    row.append(lab, sws); el.appendChild(row);
  }
  }
  lookPicker(optsEl);
  lookPicker(document.getElementById("menuLook"));
  document.getElementById("randomLook").addEventListener("click", () => {
    setLook(CUSTOM_KEYS.map(key => Math.floor(Math.random() * CUSTOM[key].items.length)));
  });
  const nameInput = document.getElementById("nameInput");
  nameInput.value = store.get("binrocket.name") || "Bin-" + Math.floor(10 + Math.random() * 89);
  const lobbyInput = document.getElementById("lobbyInput"), goBtn = document.getElementById("goBtn");
  // the lobbies this browser created: its owner is their host (the one whose bots fly there), even after a reload
  const hosted = () => { try { return JSON.parse(store.get("binrocket.hosted")) || []; } catch { return []; } };
  const remember = c => store.set("binrocket.hosted", JSON.stringify([c, ...hosted().filter(x => x !== c)].slice(0, 12)));
  // New game: the picks make the lobby code (size, then "1"+mode, "0"+map, then random letters); Join: a friend's code
  let joining = false, newGameCode = "";
  const lobbyCode = () => joining ? normCode(lobbyInput.value) : newGameCode;
  const codeOk = () => lobbyCode().length >= 4;
  const describe = c => MODES[modeOf(c)].name + " · " + MAPS[mapThemeOf(c)].name + " · " + MAP_SIZES[mapOf(c)][1]
    + " · " + TIME_OPTS[timeOf(c)] + " min" + (scoreLimit(c) ? " · first to " + scoreLimit(c) + (MODES[modeOf(c)].flags ? " flags" : " kills") : "");
  const syncGo = () => {
    if (!standalone) { goBtn.textContent = "Take off"; return; }
    goBtn.disabled = !codeOk();
    goBtn.textContent = joining ? (codeOk() ? "Join " + lobbyInput.value.toUpperCase() : "Type your friend's code") : "Take off";
    document.getElementById("joinLine").textContent = codeOk() ? describe(lobbyCode()) : "The code brings its own mode and map.";
    if (!joining) document.getElementById("codeLine").innerHTML = serverRun
      ? `${describe(newGameCode)} · on the game server: it judges every hit · code <b>${newGameCode.toUpperCase()}</b>`
      : localRun
      ? `${describe(newGameCode)} · local room: you host, players nearby join with your QR code`
      : offlineRun
      ? `${describe(newGameCode)} · offline: ${botChoice.n ? "you and " + botChoice.n + " " + botChoice.level + " bots" : "just you"} in this browser`
      : `${describe(newGameCode)} · code <b>${newGameCode.toUpperCase()}</b> (share it to play together)`;
  };
  const setTab = join => {
    joining = join;
    document.getElementById("tabNew").setAttribute("aria-selected", String(!join));
    document.getElementById("tabJoin").setAttribute("aria-selected", String(join));
    document.getElementById("paneNew").hidden = join; document.getElementById("paneJoin").hidden = !join;
    document.getElementById("botsPick").hidden = join && !hosted().includes(normCode(lobbyInput.value));   // a guest doesn't bring bots
    showStep(step);
    syncGo();
  };
  // a new game is set up in steps: mode, then map, then bots, then the pilot and take off. Joining a friend is one
  // page (the code brings the rest). The bots and the pilot panels move to whichever page is showing.
  const stepEls = [...document.querySelectorAll("#paneNew .step")], stepBtns = [...document.querySelectorAll("#stepper button")];
  const STEP_NAMES = ["Mode", "Map", "Bots", "Play"];
  let step = 0;
  function showStep(n) {
    step = Math.max(0, Math.min(stepEls.length - 1, n));
    const solo = !standalone;   // the Claude room: no lobby, just the pilot, the bots and take off
    stepEls.forEach((el, i) => el.hidden = i !== step);
    stepBtns.forEach((b, i) => { b.setAttribute("aria-current", i === step ? "step" : "false"); b.classList.toggle("done", i < step); });
    const home = joining || solo ? document.getElementById(solo ? "startForm" : "paneJoin") : null;
    const botsEl = document.getElementById("botsPick"), pilotEl = document.getElementById("pilotBox"), nav = document.getElementById("stepNav");
    if (home) { if (pilotEl.parentNode !== home || botsEl.parentNode !== home) { home.insertBefore(botsEl, solo ? nav : null); home.insertBefore(pilotEl, solo ? nav : null); } }
    else { document.getElementById("botsStep").appendChild(botsEl); document.getElementById("playStep").appendChild(pilotEl); }
    const wizard = !joining && !solo;
    document.getElementById("stepBack").hidden = !wizard || step === 0;
    document.getElementById("stepNext").hidden = !wizard || step === stepEls.length - 1;
    document.getElementById("stepNext").textContent = wizard && step < stepEls.length - 1 ? "Next: " + STEP_NAMES[step + 1] : "Next";
    goBtn.hidden = wizard && step < stepEls.length - 1;
  }
  stepBtns.forEach((b, i) => b.addEventListener("click", () => showStep(i)));
  document.getElementById("stepBack").addEventListener("click", () => showStep(step - 1));
  document.getElementById("stepNext").addEventListener("click", () => showStep(step + 1));
  // bots: none, or some (how many and how good)
  const botsOnEl = document.getElementById("botsOn"), botMore = document.getElementById("botMore");
  const setBotsOn = on => {
    botMore.hidden = !on; botSlider.min = on ? 1 : 0;
    if (on !== botChoice.n > 0) { botChoice.n = on ? 4 : 0; botSlider.value = botChoice.n; showBotCount(); store.set("binrocket.bots", JSON.stringify(botChoice)); }
    syncGo();
  };
  segButtons(botsOnEl, [[false, "No bots"], [true, "With bots"]], botChoice.n > 0, setBotsOn);
  botMore.hidden = !(botChoice.n > 0); botSlider.min = botChoice.n > 0 ? 1 : 0;
  botSlider.addEventListener("input", () => { if (botChoice.n > 0 && botsOnEl.children[1].getAttribute("aria-pressed") !== "true") for (const [i, o] of [...botsOnEl.children].entries()) o.setAttribute("aria-pressed", String(i === 1)); botMore.hidden = false; });
  if (standalone) {
    document.getElementById("lobbyBox").hidden = false;
    let mapPick = MAP_SIZES[store.get("binrocket.map")] ? store.get("binrocket.map") : "m";
    let modePick = MODES[store.get("binrocket.mode")] ? store.get("binrocket.mode") : "d";
    let themePick = MAPS[store.get("binrocket.theme")] ? store.get("binrocket.theme") : "c";
    let timePick = TIME_OPTS[store.get("binrocket.time")] ? store.get("binrocket.time") : TIME_DEFAULT;
    let scorePick = SCORE_OPTS[store.get("binrocket.score")] ? store.get("binrocket.score") : "";
    const newCode = () => {
      let c = mapPick + (modePick === "d" ? "" : "1" + modePick) + (themePick === "c" ? "" : "0" + themePick)
        + (timePick === TIME_DEFAULT ? "" : "1" + timePick) + (scorePick ? "0" + scorePick : "");
      for (let i = 0; i < 4; i++) c += CODE_ABC[(Math.random() * CODE_ABC.length) | 0];
      newGameCode = c; syncGo();
      remember(c);
    };
    // online lobby or offline against the bots (remembered; forced offline when the network is out)
    const whereEl = document.getElementById("wherePick");
    const pickWhere = v => {
      offlineRun = v === "off"; localRun = v === "lan"; serverRun = v === "srv";
      for (const o of whereEl.children) o.setAttribute("aria-pressed", String(o.dataset.v === v));
      document.getElementById("lanStartBox").hidden = !localRun;
      renderLobbies();   // (the server's running games show above the steps when the server is picked)
      syncGo();
    };
    segButtons(whereEl, [["on", "Online lobby"], ["srv", "Game server (beta)"], ["lan", "Local room"], ["off", "Offline with bots"]], offlineRun ? "off" : "on", v => { if (!offlineOnly) store.set("binrocket.where", v); pickWhere(v); });
    [...whereEl.children].forEach((b, i) => b.dataset.v = ["on", "srv", "lan", "off"][i]);
    chooseWhere = v => { const b = whereEl.querySelector(`[data-v="${v}"]`); if (!b || b.disabled) return false; pickWhere(v); return true; };
    if (!SERVER_URL) whereEl.children[1].disabled = true;
    if (!offlineOnly && ["off", "lan", "srv"].includes(store.get("binrocket.where"))) pickWhere(store.get("binrocket.where"));
    noNetwork = msg => {
      if (!localRun) pickWhere("off");
      whereEl.children[0].disabled = true; whereEl.children[1].disabled = true; whereEl.children[0].title = "No connection to the multiplayer servers";
      setTab(false); document.getElementById("tabJoin").disabled = true;
      setStatus(false, msg);
    };
    if (offlineOnly) noNetwork("Offline · you against the bots");
    for (const el of [document.getElementById("botCount"), document.getElementById("botLevel")]) el.addEventListener(el.id === "botCount" ? "input" : "click", () => syncGo());
    segButtons(document.getElementById("modePick"), Object.entries(MODES).map(([k, v]) => [k, v.label, v.hint]), modePick, v => { modePick = v; store.set("binrocket.mode", v); drawScores(); newCode(); });
    segButtons(document.getElementById("themePick"), Object.entries(MAPS).map(([k, v]) => [k, v.label, v.hint]), themePick, v => { themePick = v; store.set("binrocket.theme", v); newCode(); });
    segButtons(document.getElementById("timePick"), Object.entries(TIME_OPTS).map(([k, v]) => [k, v + " min"]), timePick, v => { timePick = v; store.set("binrocket.time", v); newCode(); });
    const scoreItems = () => [["", "None"], ...Object.entries(SCORE_OPTS).map(([k, v]) => [k, MODES[modePick].flags ? v[1] + " flags" : v[0] + " kills"])];
    const scoreEl = document.getElementById("scorePick");
    const drawScores = () => { scoreEl.replaceChildren(); segButtons(scoreEl, scoreItems(), scorePick, v => { scorePick = v; store.set("binrocket.score", v); newCode(); }); };
    drawScores();
    segButtons(document.getElementById("mapSize"), Object.entries(MAP_SIZES).map(([k, v]) => [k, v[1]]), mapPick, v => { mapPick = v; store.set("binrocket.map", v); newCode(); });
    document.getElementById("tabNew").addEventListener("click", () => setTab(false));
    document.getElementById("tabJoin").addEventListener("click", () => { setTab(true); lobbyInput.focus(); });
    lobbyInput.addEventListener("input", () => { lobbyInput.value = lobbyInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); setTab(true); });
    newCode();
    showStep(store.get("binrocket.mode") ? stepEls.length - 1 : 0);   // back again: straight to take off, the picks remembered
    const fromLink = normCode((location.hash.match(/^#([A-Za-z0-9]{1,16})$/) || [])[1] || "");
    if (fromLink.length >= 4) { lobbyInput.value = fromLink.toUpperCase(); setTab(true); }   // an invite link opens on Join
  }
  showStep(step);
  syncGo();
  const hud = document.querySelector(".match-hud");
  const measureHud = () => document.documentElement.style.setProperty("--hud-bottom", Math.ceil(hud.getBoundingClientRect().bottom) + "px");
  new ResizeObserver(measureHud).observe(hud);
  addEventListener("resize", measureHud);
  // graphics settings: the gear on the scoreboard, or the button on the start card
  const setEl = document.getElementById("settings");
  const pickRes = v => { settings.res = v; saveSettings(); resScale = v === "auto" ? 1 : v; resize(); };
  segButtons(document.getElementById("setRes"), [["auto", "Auto"], [1, "100%"], [0.75, "75%"], [0.5, "50%"]], settings.res, pickRes);
  segButtons(document.getElementById("setFx"), [["high", "Full"], ["low", "Light"]], settings.fx, v => { settings.fx = v; saveSettings(); if (v === "high") lowQ = false; });
  segButtons(document.getElementById("setPost"), [["auto", "Auto"], ["on", "On"], ["off", "Off"]], settings.post, v => { settings.post = v; saveSettings(); });
  {   // its parts, each on or off by itself
    const el = document.getElementById("setParts");
    for (const [k, label] of [["light", "Light & shadows"], ["smoke", "Smoke"], ["glow", "Glow"]]) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = label;
      b.setAttribute("aria-pressed", String(settings[k] !== "off"));
      b.addEventListener("click", () => { settings[k] = settings[k] === "off" ? "on" : "off"; b.setAttribute("aria-pressed", String(settings[k] !== "off")); saveSettings(); });
      el.appendChild(b);
    }
  }
  document.getElementById("postPick").hidden = !post;   // (no WebGL here: nothing to choose)
  segButtons(document.getElementById("setMouse"), [["aim", "Aims"], ["steer", "Steers"]], settings.mouse, v => { settings.mouse = v; saveSettings(); if (v === "steer" && aimLocked()) document.exitPointerLock(); });
  document.getElementById("mousePick").hidden = COARSE;
  for (const el of document.querySelectorAll("#volPick input[data-vol]")) {   // the volume sliders: heard as they move
    const k = el.dataset.vol; el.value = settings[k];
    el.addEventListener("input", () => { settings[k] = +el.value; saveSettings(); if (typeof applyVolumes === "function") applyVolumes(); });
  }
  segButtons(document.getElementById("setEngine"), [["on", "On"], ["off", "Off"]], settings.engine, v => { settings.engine = v; saveSettings(); });
  segButtons(document.getElementById("setAim"), [["off", "Off"], ["small", "Small"], ["big", "Big"]], settings.aim, v => { settings.aim = v; saveSettings(); });
  segButtons(document.getElementById("setAimCol"), [["gun", "Gun colour"], ["white", "White"], ["green", "Green"], ["red", "Red"]], settings.aimCol, v => { settings.aimCol = v; saveSettings(); });
  if (settings.res !== "auto") { resScale = settings.res; resize(); }
  const openSettings = e => { e && e.stopPropagation(); if (document.exitPointerLock && aimLocked()) document.exitPointerLock(); setEl.classList.toggle("ingame", playing); document.getElementById("setTitle").textContent = playing ? "Menu" : "Graphics"; document.getElementById("setDone").textContent = playing ? "Back to the game" : "Done"; setEl.hidden = false; };
  document.getElementById("gearBtn").addEventListener("click", openSettings);
  document.getElementById("startGear").addEventListener("click", openSettings);
  document.getElementById("setDone").addEventListener("click", () => { setEl.hidden = true; cv.focus(); lockAim(); });
  setEl.addEventListener("click", e => { if (e.target === setEl) { setEl.hidden = true; lockAim(); } });
  addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (!setEl.hidden) { setEl.hidden = true; cv.focus(); lockAim(); } else if (playing) openSettings();
  });
  document.getElementById("setLeave").addEventListener("click", () => { location.href = location.pathname + location.search; });   // back to the start screen
  const boardBox = document.querySelector(".board"), scoreBtn = document.getElementById("scoreBtn");
  let scorePinned = false;
  const showBoard = show => { boardBox.hidden = !show; scoreBtn.setAttribute("aria-expanded", String(show)); if (show) renderBoard(); };
  scoreBtn.addEventListener("click", e => { e.stopPropagation(); scorePinned = !scorePinned; showBoard(scorePinned); });
  addEventListener("keydown", e => { if (e.code === "Tab" && playing && setEl.hidden && !/INPUT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); showBoard(true); } });
  addEventListener("keyup", e => { if (e.code === "Tab") { e.preventDefault(); showBoard(scorePinned); } });
  addEventListener("blur", () => { scorePinned = false; showBoard(false); });
  addEventListener("wheel", e => { if (!boardBox.hidden) { e.preventDefault(); boardBox.scrollTop += e.deltaY; } }, { passive: false });
  document.getElementById("startForm").addEventListener("submit", e => {
    e.preventDefault();
    if (lan.guest) { joining = false; offlineRun = false; localRun = true; }   // a guest in a local room plays the host's game
    else if (standalone && !codeOk()) { lobbyInput.focus(); return; }
    if (joining) { offlineRun = false; localRun = false; }   // a friend's code is always online (on the game server, if that is picked)
    // bots: in a lobby only its host adds them (everyone else sees the host's); in the Claude room they stay local anyway;
    // offline there is nobody else, so there are always some
    const host = !lan.guest && (!standalone || !joining || hosted().includes(lobbyCode()));
    if (serverRun) {}   // the server brings the bots (asked for when this browser opens the room)
    else if (offlineRun && !bots.length) addBots(botChoice.n, botChoice.level);
    else if (host && !bots.length && botChoice.n > 0) addBots(botChoice.n, botChoice.level);
    if (standalone) chooseLobby(lan.guest ? lan.code : lobbyCode());
    me.name = nameInput.value.trim().slice(0, 14) || "Bin";
    store.set("binrocket.name", me.name);
    wakeAudio();
    loadSfx();
    // The lobby mode is selected asynchronously by initNet; let it finish before the spoken introduction.
    setTimeout(() => queueVoice("v_fight"), 100);
    document.getElementById("start").hidden = true;
    document.body.classList.add("playing");   // the compact phone HUD applies from here on
    fireBtn.hidden = false; boostBtn.hidden = false; mm.hidden = false; joyEl.hidden = false;
    me.inv = performance.now() + 2000;
    playing = true;
    cv.focus();
    lockAim();   // the take-off click captures the mouse: the crosshair is the cursor from now on
    renderBoard();
  });

  if (!offlineOnly) setStatus(false, standalone ? "Pick a lobby and take off" : "Connecting…");
  initNet().catch(() => {});
  if (window.BRS_FILE) document.getElementById("dlGame").hidden = true;   // already the one-file game
  // keep the game on this device (sw.js): it opens again with no internet, for offline play or a local room
  if (standalone && "serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  // the fire and smoke textures (10-effects.js) are made ahead, one at a time while the page is idle, so the first
  // blasts of a game don't stutter making them (the server, which draws nothing, has no need of them)
  if (!window.BRS_BODY_CANVAS) {
    let k = 0;
    const later = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 500 }) : setTimeout(f, 30));
    const warm = () => { if (k === 0) smokeGrain(); if (k < 32) { fireSprite(k >> 2, k & 3); k++; later(warm); } };
    setTimeout(warm, 800);
  }

