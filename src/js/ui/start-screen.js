  // ---------- the start card: the pilot's name, new game (mode, map, bots, in steps) or a friend's code ----------
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
  const describe = c => MODES[modeOf(c)].name + " · " + mapLabel(c, "name") + " · " + MAP_SIZES[mapOf(c)][1]
    + " · " + TIME_OPTS[timeOf(c)] + " min" + (scoreLimit(c) ? " · first to " + limitText(scoreLimit(c), modeOf(c)) : "");
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
    let themePick = MAPS[store.get("binrocket.theme")] || store.get("binrocket.theme") === ROTATION ? store.get("binrocket.theme") : "c";
    let timePick = TIME_OPTS[store.get("binrocket.time")] ? store.get("binrocket.time") : TIME_DEFAULT;
    let scorePick = SCORE_OPTS[store.get("binrocket.score")] !== undefined ? store.get("binrocket.score") : "";
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
    segButtons(document.getElementById("themePick"), [...Object.entries(MAPS).map(([k, v]) => [k, v.label, v.hint]), [ROTATION, ROTATION_LABEL, "a different map every round"]], themePick, v => { themePick = v; store.set("binrocket.theme", v); newCode(); });
    segButtons(document.getElementById("timePick"), Object.entries(TIME_OPTS).map(([k, v]) => [k, v + " min"]), timePick, v => { timePick = v; store.set("binrocket.time", v); newCode(); });
    const scoreItems = () => [["", "None"], ...Object.entries(SCORE_OPTS).map(([k, i]) => [k, limitText((GOALS[goalOf(modePick)] || KILL_LIMITS)[i], modePick)])];
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
