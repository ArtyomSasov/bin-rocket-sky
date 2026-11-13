  "use strict";
  // ---------- config: world size, levels, weapons, shots, modes, supplies, rounds ----------
  // walled arena; its size comes from the lobby code's first letter (s/m/l/x), so everyone in a lobby shares it
  const MAP_SIZES = { s: [2600, "Small", 3], m: [4200, "Medium", 5], l: [6000, "Large", 9], x: [8000, "Huge", 14] };
  const mapOf = code => MAP_SIZES[String(code)[0]] ? String(code)[0] : "m";
  let W = 4200, H = 4200, PLANET_N = 5;
  const BOT = 84;                    // sprite size on screen
  let SLOTS = 100; const PERIOD = 16;     // spark slots, seconds per respawn cycle
  const SPRITE_TILT = 0.24;          // the art leans right a little (its engine points down-left)
  const NOZZLE = [140 / 320 - 0.5, 186 / 320 - 0.5];   // engine opening in the art, as a fraction of size
  const LIVES = 3, ROCK_PERIOD = 22; let ROCKS = 36;
  // levels: sparks are XP; each level makes the bin bigger, adds lives and changes the fire
  const XP_STEPS = [0, 6, 15, 28, 45, 66, 92, 124, 162, 210];   // total XP to reach Lv 1..10
  const MAX_LV = XP_STEPS.length;
  const lvOf = xp => { let l = 1; while (l < MAX_LV && xp >= XP_STEPS[l]) l++; return l; };
  const sizeOf = lv => 1 + (lv - 1) * 0.09;                       // Lv 10 is about 1.8x
  const maxLivesOf = lv => LIVES + Math.floor((lv - 1) * 2 / 3);  // 3 hearts at Lv 1, 9 at Lv 10
  const TIERS = [
    { from: 1,  outer: [255, 70, 20],  mid: [255, 150, 40], core: [255, 240, 170], aura: null },
    { from: 4,  outer: [255, 60, 150], mid: [255, 140, 70], core: [255, 245, 210], aura: [255, 120, 200] },
    { from: 7,  outer: [150, 80, 255], mid: [80, 170, 255], core: [225, 250, 255], aura: [140, 200, 255] },
    { from: 10, outer: [255, 80, 200], mid: [255, 210, 80], core: [255, 255, 255], aura: [255, 220, 120] }
  ];
  const tierOf = lv => TIERS.filter(t => lv >= t.from).pop();
  // weapons: pick-ups swap the fireball for a while
  const WEAPONS = {
    fire:   { name: "Fireball",    ammo: Infinity, cd: 0.22 },
    triple: { name: "Triple shot", ammo: 24, cd: 0.3, col: "#ffb43c" },
    laser:  { name: "Laser",       ammo: 90, cd: 0.08, col: "#7df9ff" },   // also limited by heat (see LASER_HEAT)
    rocket: { name: "Homing rockets", ammo: 8, cd: 0.7, col: "#ff5a6e" },
    nuke:   { name: "Nuke",        ammo: 1,  cd: 1.0,  col: "#ffe14d" },
    scatter: { name: "Scatter gun", ammo: 16, cd: 0.7,  col: "#ffd27a" },
    rail:   { name: "Railgun",     ammo: 6,  cd: 1.15, col: "#d9a8ff" },
    mine:   { name: "Mines",       ammo: 6,  cd: 0.6,  col: "#ff6b3c" },
    orb:    { name: "Plasma orb",  ammo: 12, cd: 0.55, col: "#6fd8ff" },
    bolt:   { name: "Lightning",   ammo: 90, cd: 0.11, col: "#bfefff" },
    shard:  { name: "Shard cannon", ammo: 14, cd: 0.75, col: "#ff9a3c" }
  };
  const PICK_TYPES = ["triple", "laser", "rocket", "scatter", "rail", "mine", "orb", "bolt", "shard"], PICK_PERIOD = 24; let PICKS = 18;
  // by shot kind: 0 fireball, 1 rocket, 2 laser, 3 nuke, 4 scatter pellet, 5 rail slug, 6 mine, 7 plasma orb, 8 lightning, 9 shard, 10 shotgun slug
  const SHOT_LIFE = [1.1, 3.6, 0.45, 3.2, 0.38, 0.7, 25, 2.4, 0.15, 0.9, 0.6];
  const SHOT_DMG  = [0.3, 1.2, 0.18, 0, 0, 2, 1.5, 0.9, 0.2, 0.3, 1];      // pellets use pelletDmg(); in lives (Lv 1 has 3 = 100%)
  const DMG_UNIT = 0.35;   // one fireball: planets and UFOs count damage in fireballs                 // the nuke deals its damage through detonate()
  const SHOT_COL  = ["#ffb43c", "#ffb43c", "#7df9ff", "#ffe14d", "#ffd27a", "#e9c8ff", "#ff6b3c", "#6fd8ff", "#bfefff", "#ff9a3c", "#ffe7a0"];
  const MINE_R = 55, MINE_ARM = 0.7;
  const SHOT_R = [0, 10, 0, 0, 0, 0, MINE_R, 16, 0, 0, 4];      // extra hit radius by kind (mines go off near you, orbs are big)
  const AMP_PERIOD = 95, AMP_TIME = 20000;                   // Overdrive: a rare pick-up, triple damage for 20 s                        // mines go off when a bin comes this close, after arming
  // nuke: everything inside NUKE_KILL dies outright, the rest of the blast (out to NUKE_R) takes heavy damage
  // Doom-style supplies: medkits give lives back, shields add armour that soaks damage before lives
  const SUPPLIES = {
    med:    { name: "Medkit",      col: "#ff5a6e", heal: 1, icon: "cross" },
    bigmed: { name: "Big medkit",  col: "#ff2d55", heal: 3, icon: "cross", big: true },
    shield: { name: "Shield",      col: "#4fe39a", armor: 2, icon: "shield" },
    mega:   { name: "Mega shield", col: "#4fa8ff", armor: 4, icon: "shield", big: true }
  };
  // game modes: picked with a new lobby and carried in its code ("<size>1<mode>...", e.g. M1CK7QX); a plain code is deathmatch
  const MODES = {
    d: { name: "Deathmatch", label: "Deathmatch" },
    t: { name: "Team Deathmatch", label: "Team DM", teams: true },
    c: { name: "Capture the Flag", label: "CTF", teams: true, flags: true },
    n: { name: "Nukes only", label: "Nukes", only: "nuke" },
    r: { name: "Railgun instagib", label: "Instagib", only: "rail" }
  };
  const modeOf = code => { const c = String(code); return c[1] === "1" && MODES[c[2]] ? c[2] : "d"; };
  let MODE = "d";
  const TEAM_NAME = ["Red", "Blue"], TEAM_HEX = ["#ff5a6e", "#4fa8ff"], TEAM_RGB = ["255,90,110", "79,168,255"];
  const WEAPON_KEYS = ["fire", "triple", "laser", "rocket", "nuke", "scatter", "rail", "mine", "orb", "bolt", "shard"];   // index is what goes over the network
  // deathmatch rounds on the shared clock: 5 minutes of fighting, then 15 seconds of results
  const ROUND_PLAY = 300, ROUND_BREAK = 15, ROUND_LEN = ROUND_PLAY + ROUND_BREAK;
  const roundAt = ms => { const t = ms / 1000, idx = Math.floor(t / ROUND_LEN), ph = t - idx * ROUND_LEN; return { idx, ph, live: ph < ROUND_PLAY, left: ROUND_PLAY - ph }; };
  const SUPPLY_PERIOD = 20, MAX_SHIELD = 6; let SUPPLY_SLOTS = 14;
  const NUKE_R = 900, NUKE_KILL = 480, NUKE_DMG = 3, NUKE_PERIOD = 70, BOOM_LIFE = 3.2;
  // weapon icons (24x24 SVG path data, even-odd fill): used on crates (canvas) and in the HUD (SVG)
  const ICONS = {
    fire: "M12 0c1 5 7 8 7 15a7 7 0 0 1-14 0c0-3 1.5-5 3-6.5C8 11 9.5 12 10.5 12 9 8 10 3 12 0z",
    triple: "M3 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0ZM8.6 7.5a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0-6.8 0ZM15 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0ZM5.2 13.6L9.6 10.4L10.4 11.2L6.4 14.6ZM18.8 13.6L14.4 10.4L13.6 11.2L17.6 14.6Z",
    laser: "M13.5 1L4 13.5h6.5L9 23l10-13h-6.5z",
    rocket: "M12 1c3.5 2.5 5 6.5 5 10.5V16l2.5 3v2.5L16 20h-8l-3.5 1.5V19L7 16v-4.5C7 7.5 8.5 3.5 12 1zM12 7a2 2 0 1 0 0.01 0Z",
    scatter: "M8 7a4 4 0 0 1 8 0v9H8zM6.5 17h11v5h-11zM2 2l3 3-1 1-3-3zM22 2l-3 3 1 1 3-3z",
    rail: "M11 1h2v3h-2zM11 6h2v4h-2zM11 12h2v4h-2zM11 18h2v5h-2zM5 4h14v2H5zM6 10h12v2H6zM7 16h10v2H7z",
    mine: "M12 6a6 6 0 1 0 0.01 0ZM12 10a2 2 0 1 0 0.01 0ZM11 1h2v4h-2zM11 19h2v4h-2zM1 11h4v2H1zM19 11h4v2h-4zM4.2 5.6l1.4-1.4 2.4 2.4-1.4 1.4zM16 17.4l1.4-1.4 2.4 2.4-1.4 1.4zM18.4 4.2l1.4 1.4-2.4 2.4-1.4-1.4zM4.2 18.4l2.4-2.4 1.4 1.4-2.4 2.4z",
    cross: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
    orb: "M12 3a9 9 0 1 0 0.01 0ZM12 7a5 5 0 1 0 0.01 0ZM12 10a2 2 0 1 0 0.01 0Z",
    bolt: "M9 1h7l-4 7h5l-3 5h4L7 23l3-8H6l2-5H4z",
    shard: "M12 1l3 9-3 2-3-2zM2 13l8-2 1 3-6 6zM22 13l-8-2-1 3 6 6z",
    amp: "M12 1l3 8 8 3-8 3-3 8-3-8-8-3 8-3z",
    shield: "M12 2l8 3v6c0 5.2-3.4 9.4-8 11-4.6-1.6-8-5.8-8-11V5z",
    nuke: "M14.10 8.36L17.25 2.91A10.5 10.5 0 0 0 6.75 2.91L9.90 8.36A4.2 4.2 0 0 1 14.10 8.36ZM7.80 12.00L1.50 12.00A10.5 10.5 0 0 0 6.75 21.09L9.90 15.64A4.2 4.2 0 0 1 7.80 12.00ZM14.10 15.64L17.25 21.09A10.5 10.5 0 0 0 22.50 12.00L16.20 12.00A4.2 4.2 0 0 1 14.10 15.64ZM12 9.8a2.2 2.2 0 1 0 0.01 0Z"
  };
  const ICON_PATHS = Object.fromEntries(Object.entries(ICONS).map(([k, d]) => [k, new Path2D(d)]));
  const FIRE_KEYS = ["Space", "KeyF", "KeyJ", "Enter"];
  // customization: index 0 of every list is the original look
  const CUSTOM = {
    body:  { label: "Body",  items: [["Teal", null], ["Pink", 330], ["Orange", 22], ["Lime", 95], ["Sky", 205], ["Gold", 46], ["Violet", 268]] },
    lid:   { label: "Lid",   items: [["Lavender", null], ["Navy", 222], ["Red", 2], ["Mint", 155], ["Rose", 318], ["Amber", 38]] },
    flame: { label: "Fire",  items: [["By level", null], ["Blue", "blue"], ["Green", "green"], ["Pink", "pink"], ["Rainbow", "rainbow"]] },
    trail: { label: "Trail", items: [["Sparkle", null], ["Fire", "fire"], ["Ice", "ice"], ["Gold", "gold"], ["Rainbow", "rainbow"]] },
    hat:   { label: "Hat",   items: [["None", null], ["Party", "party"], ["Top hat", "tophat"], ["Halo", "halo"], ["Bow", "bow"], ["Cap", "cap"]] }
  };
  const CUSTOM_KEYS = ["body", "lid", "flame", "trail", "hat"];
  const FLAMES = {
    blue:  { outer: [60, 120, 255], mid: [80, 200, 255],  core: [225, 250, 255] },
    green: { outer: [40, 200, 90],  mid: [140, 255, 120], core: [235, 255, 215] },
    pink:  { outer: [255, 60, 160], mid: [255, 140, 210], core: [255, 236, 250] }
  };
  const TRAILS = {
    fire: ["#fff3b0", "#ffd23f", "#ff9a2e", "#ff5a1f"],
    ice: ["#bff9ff", "#7df9ff", "#ffffff", "#9fd8ff"],
    gold: ["#ffd36b", "#fff1b8", "#ffb43c", "#ffffff"],
    rainbow: ["#ff6b6b", "#ffb43c", "#ffe66b", "#6bff95", "#6bd5ff", "#8c7bff", "#ff7bea"]
  };
  const cleanCustom = v => CUSTOM_KEYS.map((k, i) => {
    const n = Array.isArray(v) ? Math.floor(Number(v[i])) : 0;
    return n >= 0 && n < CUSTOM[k].items.length ? n : 0;
  });
  const customVal = (ck, key) => CUSTOM[key].items[ck[CUSTOM_KEYS.indexOf(key)]][1];

  const img = new Image(); img.src = "bot.png";
  // the art with its painted flame removed: our animated fire is drawn behind it from the nozzle
  let body = null;
  img.onload = () => {
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const cx2 = c.getContext("2d"); cx2.drawImage(img, 0, 0);
    const d = cx2.getImageData(0, 0, c.width, c.height), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], gg = px[i + 1], b = px[i + 2];
      if (r > 150 && r - b > 70 && r >= gg) px[i + 3] = 0;
    }
    cx2.putImageData(d, 0, 0);
    body = c;
  };
  const COARSE = matchMedia("(pointer: coarse)").matches;
  const MAX_DPR = COARSE ? 1.5 : 2, MAX_PARTS = COARSE ? 1200 : 2500;
  const cv = document.getElementById("c");
  let g = cv.getContext("2d", { alpha: false });   // swapped briefly to draw the start-screen preview
  const DISPLAY_FONT = getComputedStyle(document.documentElement).getPropertyValue('--display');
  let vw = 0, vh = 0, dpr = 1, zoom = 1;
  let TS = 1;   // text scale: undoes the camera zoom so labels stay readable
  function resize() {
    dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    zoom = Math.max(0.62, Math.min(1, Math.min(innerWidth, innerHeight) / 700));   // runs before the helpers exist
    TS = 1 / zoom;
    vw = innerWidth / zoom; vh = innerHeight / zoom;   // world units visible on screen
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
    g.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
  }
  addEventListener("resize", resize); resize();

