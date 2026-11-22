  // ---------- in game: the settings card and the scoreboard ----------
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
