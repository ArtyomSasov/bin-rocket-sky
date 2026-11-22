  // ---------- take off, and the page starting up ----------
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
  // the fire and smoke textures (render/particles.js) are made ahead, one at a time while the page is idle, so the first
  // blasts of a game don't stutter making them (the server, which draws nothing, has no need of them)
  if (!window.BRS_BODY_CANVAS) {
    let k = 0;
    const later = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 500 }) : setTimeout(f, 30));
    const warm = () => { if (k === 0) smokeGrain(); if (k < 32) { fireSprite(k >> 2, k & 3); k++; later(warm); } };
    setTimeout(warm, 800);
  }
