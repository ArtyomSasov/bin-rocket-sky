  // ---------- controls help, tailored to the device ----------
  const KEY = k => `<kbd>${k}</kbd>`;
  // desktop rows differ only in a few key names
  const desk = (label, shift, enter, mouse) => ({ label, rows: [
    ["Fly", `${KEY("W")}${KEY("A")}${KEY("S")}${KEY("D")} or arrows · or hold ${mouse} and point`],
    ["Fire", `${KEY("Space")} (also ${KEY("F")} ${KEY("J")} ${KEY(enter)})`],
    ["Dash", `tap ${KEY(shift)} — a quick dodge forward`],
    ["Boost", `hold ${KEY(shift)} — uses the blue energy bar`],
    ["Weapon", `${KEY("1")}–${KEY("8")}, ${KEY("Q")} / ${KEY("E")} or the mouse wheel; or click a gun in the bar`],
    ["Alt fire", `right mouse button or ${KEY("C")}: rocket salvo, shotgun slug, focused triple, thrown mine`],
    ["Brake", `hold ${KEY("X")} (or push the other way)`]] });
  const CONTROLS = {
    mac: desk("Mac", "⇧ Shift", "Return", "the trackpad / mouse button"),
    windows: desk("Windows", "Shift", "Enter", "the left mouse button"),
    linux: desk("Linux", "Shift", "Enter", "the left mouse button"),
    phone: { label: "Phone", rows: [
      ["Fly", "put your thumb anywhere on the left side: a joystick appears under it, push it where you want to go"],
      ["Fire", "orange flame button (bottom right)"],
      ["Dash", "tap the teal button — a quick dodge forward"],
      ["Boost", "hold the teal button"],
      ["Weapon", "tap a gun in the bar above the fire button"],
      ["Alt fire", "the small orange button above the fire button (rockets, shotgun, triple shot, mines)"]] }
  };
  function detectDevice() {
    const ua = navigator.userAgent, plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
    if (COARSE || /Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return "phone";
    if (/Mac/i.test(plat) || /Mac OS/i.test(ua)) return "mac";
    if (/Win/i.test(plat) || /Windows/i.test(ua)) return "windows";
    if (/Linux|X11|CrOS/i.test(plat + ua)) return "linux";
    return "windows";
  }
  // only the controls for the device you are on
  const myDevice = detectDevice();
  document.getElementById("ctrlTitle").textContent = "Controls · " + CONTROLS[myDevice].label;
  document.getElementById("clist").innerHTML = CONTROLS[myDevice].rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");

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
  const describe = c => MODES[modeOf(c)].name + " · " + MAPS[mapThemeOf(c)].name + " · " + MAP_SIZES[mapOf(c)][1];
  const syncGo = () => {
    if (!standalone) { goBtn.textContent = "Take off"; return; }
    goBtn.disabled = !codeOk();
    goBtn.textContent = joining ? (codeOk() ? "Join " + lobbyInput.value.toUpperCase() : "Type your friend's code") : "Take off";
    document.getElementById("joinLine").textContent = codeOk() ? describe(lobbyCode()) : "The code brings its own mode and map.";
    if (!joining) document.getElementById("codeLine").innerHTML = `${describe(newGameCode)} · code <b>${newGameCode.toUpperCase()}</b> (share it to play together)`;
  };
  const setTab = join => {
    joining = join;
    document.getElementById("tabNew").setAttribute("aria-selected", String(!join));
    document.getElementById("tabJoin").setAttribute("aria-selected", String(join));
    document.getElementById("paneNew").hidden = join; document.getElementById("paneJoin").hidden = !join;
    document.getElementById("botsPick").hidden = join && !hosted().includes(normCode(lobbyInput.value));   // a guest doesn't bring bots
    syncGo();
  };
  if (standalone) {
    document.getElementById("lobbyBox").hidden = false;
    let mapPick = MAP_SIZES[store.get("binrocket.map")] ? store.get("binrocket.map") : "m";
    let modePick = MODES[store.get("binrocket.mode")] ? store.get("binrocket.mode") : "d";
    let themePick = MAPS[store.get("binrocket.theme")] ? store.get("binrocket.theme") : "c";
    const newCode = () => {
      let c = mapPick + (modePick === "d" ? "" : "1" + modePick) + (themePick === "c" ? "" : "0" + themePick);
      for (let i = 0; i < 4; i++) c += CODE_ABC[(Math.random() * CODE_ABC.length) | 0];
      newGameCode = c; syncGo();
      remember(c);
    };
    segButtons(document.getElementById("modePick"), Object.entries(MODES).map(([k, v]) => [k, v.label, v.hint]), modePick, v => { modePick = v; store.set("binrocket.mode", v); newCode(); });
    segButtons(document.getElementById("themePick"), Object.entries(MAPS).map(([k, v]) => [k, v.label, v.hint]), themePick, v => { themePick = v; store.set("binrocket.theme", v); newCode(); });
    segButtons(document.getElementById("mapSize"), Object.entries(MAP_SIZES).map(([k, v]) => [k, v[1]]), mapPick, v => { mapPick = v; store.set("binrocket.map", v); newCode(); });
    document.getElementById("tabNew").addEventListener("click", () => setTab(false));
    document.getElementById("tabJoin").addEventListener("click", () => { setTab(true); lobbyInput.focus(); });
    lobbyInput.addEventListener("input", () => { lobbyInput.value = lobbyInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); setTab(true); });
    newCode();
    const fromLink = normCode((location.hash.match(/^#([A-Za-z0-9]{1,16})$/) || [])[1] || "");
    if (fromLink.length >= 4) { lobbyInput.value = fromLink.toUpperCase(); setTab(true); }   // an invite link opens on Join
  }
  syncGo();
  // graphics settings: the gear on the scoreboard, or the button on the start card
  const setEl = document.getElementById("settings");
  const pickRes = v => { settings.res = v; saveSettings(); resScale = v === "auto" ? 1 : v; resize(); };
  segButtons(document.getElementById("setRes"), [["auto", "Auto"], [1, "100%"], [0.75, "75%"], [0.5, "50%"]], settings.res, pickRes);
  segButtons(document.getElementById("setFx"), [["high", "Full"], ["low", "Light"]], settings.fx, v => { settings.fx = v; saveSettings(); if (v === "high") lowQ = false; });
  segButtons(document.getElementById("setAim"), [["off", "Off"], ["small", "Small"], ["big", "Big"]], settings.aim, v => { settings.aim = v; saveSettings(); });
  segButtons(document.getElementById("setAimCol"), [["gun", "Gun colour"], ["white", "White"], ["green", "Green"], ["red", "Red"]], settings.aimCol, v => { settings.aimCol = v; saveSettings(); });
  if (settings.res !== "auto") { resScale = settings.res; resize(); }
  const openSettings = e => { e && e.stopPropagation(); setEl.classList.toggle("ingame", playing); document.getElementById("setTitle").textContent = playing ? "Menu" : "Graphics"; document.getElementById("setDone").textContent = playing ? "Back to the game" : "Done"; setEl.hidden = false; };
  document.getElementById("gearBtn").addEventListener("click", openSettings);
  document.getElementById("startGear").addEventListener("click", openSettings);
  document.getElementById("setDone").addEventListener("click", () => { setEl.hidden = true; cv.focus(); });
  setEl.addEventListener("click", e => { if (e.target === setEl) setEl.hidden = true; });
  addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (!setEl.hidden) { setEl.hidden = true; cv.focus(); } else if (playing) openSettings();
  });
  document.getElementById("setLeave").addEventListener("click", () => { location.href = location.pathname + location.search; });   // back to the start screen
  // on a small screen the scoreboard shows only you (and the teams); a tap opens the whole table
  document.querySelector(".board").addEventListener("click", e => e.currentTarget.classList.toggle("open"));
  document.getElementById("startForm").addEventListener("submit", e => {
    e.preventDefault();
    if (standalone) { if (!codeOk()) { lobbyInput.focus(); return; } chooseLobby(lobbyCode()); }
    // bots: in a lobby only its host adds them (everyone else sees the host's); in the Claude room they stay local anyway
    const host = !standalone || !joining || hosted().includes(lobbyCode());
    if (host && !bots.length && botChoice.n > 0) addBots(botChoice.n, botChoice.level);
    me.name = nameInput.value.trim().slice(0, 14) || "Bin";
    store.set("binrocket.name", me.name);
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { audio = null; }
    loadSfx();
    document.getElementById("start").hidden = true;
    document.body.classList.add("playing");   // the compact phone HUD applies from here on
    fireBtn.hidden = false; boostBtn.hidden = false; mm.hidden = false; joyEl.hidden = false;
    me.inv = performance.now() + 2000;
    playing = true;
    cv.focus();
    renderBoard();
  });

  setStatus(false, standalone ? "Pick a lobby and take off" : "Connecting…");
  initNet().catch(() => {});
