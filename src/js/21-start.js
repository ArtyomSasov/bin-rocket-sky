  // ---------- controls help, tailored to the device ----------
  const KEY = k => `<kbd>${k}</kbd>`;
  const CONTROLS = {
    mac: { label: "Mac", rows: [
      ["Fly", `${KEY("W")}${KEY("A")}${KEY("S")}${KEY("D")} or arrows · or hold the trackpad / mouse button and point`],
      ["Fire", `${KEY("Space")} (also ${KEY("F")} ${KEY("J")} ${KEY("Return")})`],
      ["Dash", `tap ${KEY("⇧ Shift")} — a quick dodge forward`],
      ["Boost", `hold ${KEY("⇧ Shift")} — uses the blue energy bar`],
      ["Weapon", `${KEY("1")}–${KEY("8")}, ${KEY("Q")} / ${KEY("E")} or the mouse wheel; or click a gun in the bar`],
      ["Alt fire", `right mouse button or ${KEY("C")}: rocket salvo, shotgun slug, focused triple, thrown mine`],
      ["Brake", `hold ${KEY("X")} (or push the other way)`]] },
    windows: { label: "Windows", rows: [
      ["Fly", `${KEY("W")}${KEY("A")}${KEY("S")}${KEY("D")} or arrows · or hold the left mouse button and point`],
      ["Fire", `${KEY("Space")} (also ${KEY("F")} ${KEY("J")} ${KEY("Enter")})`],
      ["Dash", `tap ${KEY("Shift")} — a quick dodge forward`],
      ["Boost", `hold ${KEY("Shift")} — uses the blue energy bar`],
      ["Weapon", `${KEY("1")}–${KEY("8")}, ${KEY("Q")} / ${KEY("E")} or the mouse wheel; or click a gun in the bar`],
      ["Alt fire", `right mouse button or ${KEY("C")}: rocket salvo, shotgun slug, focused triple, thrown mine`],
      ["Brake", `hold ${KEY("X")} (or push the other way)`]] },
    linux: { label: "Linux", rows: [
      ["Fly", `${KEY("W")}${KEY("A")}${KEY("S")}${KEY("D")} or arrows · or hold the left mouse button and point`],
      ["Fire", `${KEY("Space")} (also ${KEY("F")} ${KEY("J")} ${KEY("Enter")})`],
      ["Dash", `tap ${KEY("Shift")} — a quick dodge forward`],
      ["Boost", `hold ${KEY("Shift")} — uses the blue energy bar`],
      ["Weapon", `${KEY("1")}–${KEY("8")}, ${KEY("Q")} / ${KEY("E")} or the mouse wheel; or click a gun in the bar`],
      ["Alt fire", `right mouse button or ${KEY("C")}: rocket salvo, shotgun slug, focused triple, thrown mine`],
      ["Brake", `hold ${KEY("X")} (or push the other way)`]] },
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
  const ctabs = document.getElementById("ctabs"), clist = document.getElementById("clist");
  function showControls(dev) {
    for (const b of ctabs.children) b.setAttribute("aria-selected", String(b.dataset.dev === dev));
    clist.innerHTML = CONTROLS[dev].rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  }
  const myDevice = detectDevice();
  for (const dev of Object.keys(CONTROLS)) {
    const b = document.createElement("button");
    b.type = "button"; b.role = "tab"; b.dataset.dev = dev;
    b.textContent = CONTROLS[dev].label + (dev === myDevice ? " ✓" : "");
    b.addEventListener("click", () => showControls(dev));
    ctabs.appendChild(b);
  }
  showControls(myDevice);

  // ---------- start ----------
  const pv = document.getElementById("preview"), pctx = pv.getContext("2d");
  function drawPreview(now) {
    const main = g, mainTS = TS; g = pctx; TS = 1;
    try {
    const k = pv.width / 150;
    pctx.setTransform(1, 0, 0, 1, 0, 0); pctx.clearRect(0, 0, pv.width, pv.height);
    pctx.setTransform(k * 1.25, 0, 0, k * 1.25, 0, 0);
    drawBot({ ...me, name: "", blink: false, thrust: 0.9, a: -Math.PI / 2 + Math.sin(now / 900) * 0.25 }, 60, 50, now, true);
    } finally { g = main; TS = mainTS; }
  }
  me.ck = cleanCustom((() => { try { return JSON.parse(store.get("binrocket.custom")); } catch { return null; } })());
  const optsEl = document.getElementById("customOpts");
  const swatchBg = (key, val) => key === "body" ? (val === null ? "#4fd6c8" : `hsl(${val} 65% 55%)`)
    : key === "lid" ? (val === null ? "#9d8fc8" : `hsl(${val} 45% 60%)`)
    : key === "flame" ? (val === null ? "linear-gradient(#ffe08a,#ff5a1f)" : val === "rainbow" ? "linear-gradient(90deg,#ff6b6b,#ffe66b,#6bff95,#6bd5ff,#ff7bea)" : `rgb(${FLAMES[val].mid})`)
    : null;
  for (const key of CUSTOM_KEYS) {
    const row = document.createElement("div"); row.className = "opt-row";
    const lab = document.createElement("span"); lab.textContent = CUSTOM[key].label;
    const sws = document.createElement("div"); sws.className = "sws";
    CUSTOM[key].items.forEach(([name, val], i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "sw"; b.title = name; b.setAttribute("aria-label", CUSTOM[key].label + ": " + name);
      const bg = swatchBg(key, val);
      if (bg) b.style.setProperty("--c", bg); else { b.classList.add("txt"); b.textContent = name; }
      b.setAttribute("aria-pressed", String(me.ck[CUSTOM_KEYS.indexOf(key)] === i));
      b.addEventListener("click", () => {
        me.ck = me.ck.slice(); me.ck[CUSTOM_KEYS.indexOf(key)] = i;
        store.set("binrocket.custom", JSON.stringify(me.ck));
        for (const o of sws.children) o.setAttribute("aria-pressed", String(o === b));
      });
      sws.appendChild(b);
    });
    row.append(lab, sws); optsEl.appendChild(row);
  }
  const nameInput = document.getElementById("nameInput");
  nameInput.value = store.get("binrocket.name") || "Bin-" + Math.floor(10 + Math.random() * 89);
  const lobbyInput = document.getElementById("lobbyInput"), goBtn = document.getElementById("goBtn");
  const codeOk = () => normCode(lobbyInput.value).length >= 4;
  const syncGo = () => {
    if (!standalone) { goBtn.textContent = "Take off"; return; }
    goBtn.disabled = !codeOk();
    const c = normCode(lobbyInput.value);
    goBtn.textContent = codeOk() ? "Join " + lobbyInput.value.toUpperCase() + " · " + MODES[modeOf(c)].name + " · " + MAP_SIZES[mapOf(c)][1] + " map" : "Enter a code (4+ characters) or create one";
  };
  if (standalone) {
    document.getElementById("lobbyBox").hidden = false;
    const fromLink = normCode((location.hash.match(/^#([A-Za-z0-9]{1,16})$/) || [])[1] || "");
    if (fromLink.length >= 4) lobbyInput.value = fromLink.toUpperCase();
    lobbyInput.addEventListener("input", () => { lobbyInput.value = lobbyInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); syncGo(); });
    let mapPick = MAP_SIZES[store.get("binrocket.map")] ? store.get("binrocket.map") : "m";
    let modePick = MODES[store.get("binrocket.mode")] ? store.get("binrocket.mode") : "d";
    const newCode = () => { let c = mapPick + (modePick === "d" ? "" : "1" + modePick); for (let i = 0; i < 4; i++) c += CODE_ABC[(Math.random() * CODE_ABC.length) | 0]; lobbyInput.value = c.toUpperCase(); syncGo(); };
    segButtons(document.getElementById("modePick"), Object.entries(MODES).map(([k, v]) => [k, v.label]), modePick, v => {
      modePick = v; store.set("binrocket.mode", v);
      if (createdCode) newCode();
    });
    segButtons(document.getElementById("mapSize"), Object.entries(MAP_SIZES).map(([k, v]) => [k, v[1]]), mapPick, v => {
      mapPick = v; store.set("binrocket.map", v);
      if (createdCode) newCode();   // a code you just made follows the size you pick
    });
    let createdCode = false;
    lobbyInput.addEventListener("input", () => { createdCode = false; });
    document.getElementById("createBtn").addEventListener("click", () => { createdCode = true; newCode(); goBtn.focus(); });
  }
  syncGo();
  document.getElementById("startForm").addEventListener("submit", e => {
    e.preventDefault();
    if (standalone) { if (!codeOk()) { lobbyInput.focus(); return; } chooseLobby(normCode(lobbyInput.value)); }
    if (!bots.length && botChoice.n > 0) addBots(botChoice.n, botChoice.level);
    me.name = nameInput.value.trim().slice(0, 14) || "Bin";
    store.set("binrocket.name", me.name);
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { audio = null; }
    loadSfx();
    document.getElementById("start").hidden = true;
    fireBtn.hidden = false; boostBtn.hidden = false; mm.hidden = false; joyEl.hidden = false;
    me.inv = performance.now() + 2000;
    playing = true;
    cv.focus();
    renderBoard();
  });

  setStatus(false, standalone ? "Pick a lobby and take off" : "Connecting…");
  initNet().catch(() => {});
