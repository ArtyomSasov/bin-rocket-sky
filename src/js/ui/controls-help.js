  // ---------- controls help, tailored to the device ----------
  const KEY = k => `<kbd>${k}</kbd>`;
  // desktop rows differ only in a few key names
  const desk = (label, shift, enter, mouse) => ({ label, rows: [
    ["Fly", `${KEY("W")}${KEY("A")}${KEY("S")}${KEY("D")} or arrows`],
    ["Aim", "the mouse: the gun follows the cursor (Settings: Mouse \u2192 Steers to fly toward it instead)"],
    ["Fire", `the left mouse button or ${KEY("Space")} (also ${KEY("F")} ${KEY("J")} ${KEY(enter)})`],
    ["Dash", `tap ${KEY(shift)} — a quick dodge forward`],
    ["Boost", `hold ${KEY(shift)} — uses the blue energy bar`],
    ["Weapon", `fixed ${KEY("1")}–${KEY("9")} / ${KEY("0")}; ${KEY("Alt")}+${KEY("1")}–${KEY("6")} for extras; ${KEY("Q")} / ${KEY("E")} or click a gun`],
    ["Alt fire", `right mouse button or ${KEY("C")}: available per weapon — Pulse beam, Flak shell, Shock beam, Demonic zone / manual detonation, loaded rockets (hold/release), Stinger shards, slug, mine detonation, explosive Ripper disc`],
    ["Chat", `${KEY("T")} to type, Enter sends, Esc closes`],
    ["Brake / drift", `hold ${KEY("X")} to brake; ${KEY("X")} + a direction drifts: you slide on while the nose swings round (shoot back)`],
    ["Health & armor", "100 HP on spawn; Health Pack +20 (cap 100), Vial +5 and Big Keg +100 (cap 199). Body Armor absorbs 75%; Shield Belt absorbs all damage until depleted. No levels or XP bonuses."]] });
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
      ["Alt fire", "the small orange button above the fire button (shock beam, rockets, shotgun, mines, saws)"],
      ["Teleporter", "the cyan button: throw the beacon, tap again to jump onto it"],
      ["Health & armor", "100 HP on spawn; Health Pack +20 (cap 100), Vial +5 and Big Keg +100 (cap 199). Body Armor absorbs 75%; Shield Belt absorbs all damage until depleted. No levels or XP bonuses."]] }
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

