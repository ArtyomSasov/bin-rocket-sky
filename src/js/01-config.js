  "use strict";
  // ---------- config: world size, levels, weapons, shots, modes, supplies, rounds ----------
  // walled arena; its size comes from the lobby code's first letter (s/m/l/x), so everyone in a lobby shares it
  const MAP_SIZES = { s: [2600, "Small", 3], m: [4200, "Medium", 5], l: [6000, "Large", 9], x: [8000, "Huge", 14] };
  const mapOf = code => MAP_SIZES[String(code)[0]] ? String(code)[0] : "m";
  // map variants: what fills the arena. A new lobby's code carries it as "0<letter>" after the size (and the mode),
  // e.g. M0Y... or M1C0A...; generated codes never contain 0, and a code without it is Classic.
  // planets / wrecks: counts relative to Classic; pR: planet radius range; kinds: planet looks; moons: chance per
  // planet; moonN: moons per planet; gap: spacing between planets; star: a sun in the middle; wgap: spacing between wrecks; lumpy: planets become ragged asteroids
  const MAPS = {
    c: { name: "Classic", label: "Classic", hint: "planets, moons, wrecks" },
    a: { name: "Asteroid belt", label: "Asteroids", hint: "a field of ragged rocks", planets: 4, pR: [55, 130], kinds: ["rock", "moon", "ice", "rock", "lava"], moons: 0, gap: 170, wrecks: 0.4, lumpy: true },
    y: { name: "Shipyard", label: "Shipyard", hint: "wrecked ships and stations", planets: 0.35, wrecks: 2.6, wgap: 110, wreckTypes: ["hull", "hull", "ring", "ring", "tower", "crates"] },
    r: { name: "Ruined city", label: "Ruins", hint: "floating towers and crates", planets: 0.45, wrecks: 2.2, wgap: 110, wreckTypes: ["tower", "tower", "tower", "crates", "crates", "hull"] },
    s: { name: "Solar system", label: "Solar", hint: "a sun and big planets", planets: 0.8, pR: [190, 320], moons: 1, moonN: 2, wrecks: 0.35, star: true },
    w: { name: "Waste depot", label: "Depot", hint: "skips, refuse trucks, giant bins", planets: 0.3, wrecks: 2.6, wgap: 100, wreckTypes: ["skip", "truck", "wheelie", "truck", "bales", "skip", "truck"] },
    o: { name: "Open space", label: "Open", hint: "nearly empty: duels", planets: 0.25, pR: [110, 170], moons: 0, wrecks: 0.25 }
  };
  // A lobby code: the size letter, then settings as pairs ("1"+letter mode, "0"+letter map, "1"+digit time limit,
  // "0"+digit score limit), then random letters. Random letters never use 0 or 1, so the pairs can't be mistaken.
  const codeOpts = code => {
    const o = {};
    for (const [, a, b] of String(code).slice(1).matchAll(/([01])([a-z0-9])/g)) o[a + (/\d/.test(b) ? "d" : "l")] = b;
    return { mode: o["1l"], map: o["0l"], time: o["1d"], score: o["0d"] };
  };
  const mapThemeOf = code => MAPS[codeOpts(code).map] ? codeOpts(code).map : "c";
  let W = 4200, H = 4200, PLANET_N = 5;
  const BOT = 84;                    // sprite size on screen
  const binR = lv => 14 + 26 * sizeOf(lv || 1);   // a bin's hit circle: the same on the victim's screen and the shooter's
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
  // shot kinds: what flies. The number is what goes over the network; everything per kind lives in SHOTS
  const K = { FIRE: 0, ROCKET: 1, LASER: 2, NUKE: 3, PELLET: 4, RAIL: 5, MINE: 6, ORB: 7, BOLT: 8, SHARD: 9, SLUG: 10, HOLY: 11 };
  const MINE_R = 55, MINE_ARM = 0.7;   // mines go off when a bin comes this close, after arming
  // life: seconds; dmg: in lives (Lv 1 has 3 = 100%; pellets use pelletDmg, the nuke deals its damage in detonate);
  // r: extra hit radius; col: colour; carve: crater radius; shove: push on the bin it hits; sfx: [sound, volume, pitch] of someone else's shot
  const SHOTS = [
    { name: "fireball",  life: 1.1,  dmg: 0.3,  r: 0,      col: "#ffb43c", carve: 16, shove: 0,   sfx: ["fire", 0.6, 1] },
    { name: "rocket",    life: 3.6,  dmg: 1.2,  r: 12,     col: "#ffb43c", carve: 52, shove: 0,   sfx: ["rocket", 0.6, 1] },
    { name: "laser",     life: 0.45, dmg: 0.18, r: 0,      col: "#7df9ff", carve: 9,  shove: 0,   sfx: ["laser", 0.2, 1] },
    { name: "nuke",      life: 3.2,  dmg: 0,    r: 0,      col: "#ffe14d", carve: 0,  shove: 0,   sfx: ["rocket", 0.6, 0.6] },
    { name: "pellet",    life: 0.38, dmg: 0,    r: 0,      col: "#ffd27a", carve: 9,  shove: 150, sfx: ["scatter", 0.6, 1] },
    { name: "rail slug", life: 0.7,  dmg: 3,    r: 0,      col: "#e9c8ff", carve: 14, shove: 650, sfx: ["rail", 0.6, 1] },
    { name: "mine",      life: 25,   dmg: 1.7,  r: MINE_R, col: "#ff6b3c", carve: 50, shove: 0,   sfx: ["mine_drop", 0.6, 1] },
    { name: "plasma",    life: 3.2,  dmg: 1.4,  r: 30,     col: "#6fd8ff", carve: 60, shove: 300, sfx: ["shield_get", 0.6, 1.1] },
    { name: "lightning", life: 0.15, dmg: 0.22, r: 0,      col: "#bfefff", carve: 6,  shove: 0,   sfx: ["laser", 0.2, 1.7] },
    { name: "shard",     life: 0.8,  dmg: 0.32, r: 0,      col: "#ff9a3c", carve: 10, shove: 0,   sfx: ["scatter", 0.6, 1] },
    { name: "slug",      life: 0.6,  dmg: 1,    r: 4,      col: "#ffe7a0", carve: 20, shove: 450, sfx: ["scatter", 0.6, 1] },
    { name: "holy bomb", life: 3.6,  dmg: 0,    r: 0,      col: "#fff3b0", carve: 0,  shove: 0,   sfx: ["mine_drop", 0.8, 0.6] }
  ];
  // weapons: pick-ups swap the fireball for a while. Each gun is described here, and the player and the bots fire it
  // the same way (see volley):
  //   shot: [shot kind, speed]; spread: angles of the shots in one volley; back: fired behind the bin
  //   kick: recoil; feel: [view jolt, screen shake, muzzle flash size]; sfx: [sound, volume, pitch]; fx: extra muzzle effect
  //   alt: the alternate fire (right mouse button / C): the same fields plus cost (ammo) and cd (reload)
  const WEAPONS = {
    fire:    { name: "Fireball", ammo: Infinity, cd: 0.22, shot: [K.FIRE, 1000], kick: 25, feel: [5, 0.05, 40], sfx: ["fire", 0.55] },
    triple:  { name: "Triple shot", ammo: 24, cd: 0.3, col: "#ffb43c", shot: [K.FIRE, 1000], spread: [-0.2, 0, 0.2], kick: 25, feel: [7, 0.07, 50], sfx: ["triple", 0.7],
               alt: { name: "Focus", cost: 1, cd: 0.3, shot: [K.FIRE, 1050], spread: [-0.035, 0, 0.035], kick: 60, feel: [10, 0.13, 80], sfx: ["triple", 0.8, 0.9] } },
    laser:   { name: "Laser", ammo: 90, cd: 0.08, col: "#7df9ff", shot: [K.LASER, 2300], kick: 8, feel: [2, 0.02, 30], sfx: ["laser", 0.45] },
    rocket:  { name: "Homing rockets", ammo: 8, cd: 0.7, col: "#ff5a6e", shot: [K.ROCKET, 260], kick: 90, feel: [12, 0.14, 70], sfx: ["rocket", 0.8],
               alt: { name: "Salvo", cost: 3, cd: 1.6, shot: [K.ROCKET, 300], spread: [-0.24, 0, 0.24], kick: 200, feel: [18, 0.23, 96], sfx: ["rocket", 1, 0.8] } },
    nuke:    { name: "Nuke", ammo: 1, cd: 1.0, col: "#ffe14d", shot: [K.NUKE, 360], kick: 160, feel: [30, 0.5, 120], sfx: ["rocket", 1, 0.6] },
    scatter: { name: "Scatter gun", ammo: 16, cd: 0.7, col: "#ffd27a", shot: [K.PELLET, 1250], kick: 260, feel: [22, 0.3, 90], sfx: ["scatter", 1, 0.85], fx: "blast",
               alt: { name: "Slug", cost: 2, cd: 0.95, shot: [K.SLUG, 1900], kick: 340, feel: [24, 0.3, 108], sfx: ["scatter", 1, 0.65], fx: "slug" } },
    rail:    { name: "Railgun", ammo: 6, cd: 1.15, col: "#d9a8ff", shot: [K.RAIL, 4200], kick: 320, feel: [26, 0.35, 90], sfx: ["rail", 0.9], fx: "rail" },
    mine:    { name: "Mines", ammo: 6, cd: 0.6, col: "#ff6b3c", shot: [K.MINE, 140], back: true, kick: 0, feel: [0, 0, 0], sfx: ["mine_drop", 0.7],
               alt: { name: "Throw", cost: 1, cd: 0.6, shot: [K.MINE, 700], kick: 40, feel: [4, 0.05, 68], sfx: ["mine_drop", 0.8, 0.8] } },
    orb:     { name: "Plasma orb", ammo: 8, cd: 0.85, col: "#6fd8ff", shot: [K.ORB, 400], kick: 140, feel: [16, 0.18, 110], sfx: ["shield_get", 1, 0.9], fx: "plasma" },
    bolt:    { name: "Lightning", ammo: 90, cd: 0.11, col: "#bfefff", shot: [K.BOLT, 5600], kick: 4, feel: [2, 0.03, 35], sfx: ["laser", 0.22, 1.7] },
    holy:    { name: "Holy bomb", ammo: 1, cd: 1.2, col: "#fff3b0", shot: [K.HOLY, 700], kick: 120, feel: [20, 0.3, 110], sfx: ["mine_drop", 1, 0.6] },
    shard:   { name: "Shard cannon", ammo: 14, cd: 0.75, col: "#ff9a3c", shot: [K.SHARD, 1500], kick: 150, feel: [16, 0.2, 80], sfx: ["scatter", 0.85, 1.25], fx: "flash" }
  };
  const PICK_TYPES = ["triple", "laser", "rocket", "scatter", "rail", "mine", "orb", "bolt", "shard"], PICK_PERIOD = 24; let PICKS = 18;
  // blasts that hurt everyone around them (besides whoever took the direct hit): [radius, most damage at the
  // centre, least at the rim (in lives), push]
  const SPLASH = { [K.ROCKET]: [170, 0.6, 0.15, 320], [K.ORB]: [160, 0.6, 0.2, 380] };
  const DMG_UNIT = 0.35;   // one fireball: planets and UFOs count damage in fireballs
  const AMP_PERIOD = 95, AMP_TIME = 20000;                   // Overdrive: a rare pick-up, triple damage for 20 s                        // mines go off when a bin comes this close, after arming
  // Doom-style supplies: medkits give lives back, shields add armour that soaks part of each hit
  const SUPPLIES = {
    med:    { name: "Medkit",      col: "#ff5a6e", heal: 1, icon: "cross" },
    bigmed: { name: "Big medkit",  col: "#ff2d55", heal: 3, icon: "cross", big: true },
    shield: { name: "Shield",      col: "#4fe39a", armor: 0.75, icon: "shield" },
    mega:   { name: "Mega shield", col: "#4fa8ff", armor: 1.5, icon: "shield", big: true }
  };
  // game modes: picked with a new lobby and carried in its code ("<size>1<mode>...", e.g. M1CK7QX); a plain code is deathmatch
  // rules: teams (Red/Blue, no friendly fire); flags (capture the flag); only: the one gun everyone has (no crates,
  // nukes or Overdrive); cdMul: reload multiplier for players, botCd: for bots (x their usual pace); instagib: a hit
  // kills; noSupplies: no medkits or shields
  const MODES = {
    d: { name: "Deathmatch", label: "Deathmatch", hint: "everyone for themselves" },
    t: { name: "Team Deathmatch", label: "Team DM", hint: "Red against Blue", teams: true },
    c: { name: "Capture the Flag", label: "CTF", hint: "steal their flag", teams: true, flags: true },
    n: { name: "Nukes only", label: "Nukes", hint: "unlimited nukes", only: "nuke", cdMul: 2.2, botCd: 6 },
    r: { name: "Railgun instagib", label: "Instagib", hint: "one rail hit kills", only: "rail", botCd: 3, instagib: true, noSupplies: true }
  };
  const modeOf = code => MODES[codeOpts(code).mode] ? codeOpts(code).mode : "d";
  // match settings: round length (minutes) and a score that ends the round early (kills, or flags in CTF)
  const TIME_OPTS = { 2: 3, 3: 5, 4: 8, 5: 10, 6: 15 }, TIME_DEFAULT = "3";
  const SCORE_OPTS = { 2: [10, 3], 3: [20, 5], 4: [30, 10] };   // [kills, flags]
  const timeOf = code => TIME_OPTS[codeOpts(code).time] ? codeOpts(code).time : TIME_DEFAULT;
  const scoreOf = code => SCORE_OPTS[codeOpts(code).score] ? codeOpts(code).score : "";
  const scoreLimit = code => { const s = scoreOf(code); return s ? SCORE_OPTS[s][MODES[modeOf(code)].flags ? 1 : 0] : 0; };
  let MODE = "d";
  const TEAM_NAME = ["Red", "Blue"], TEAM_HEX = ["#ff5a6e", "#4fa8ff"], TEAM_RGB = ["255,90,110", "79,168,255"];
  const WEAPON_KEYS = ["fire", "triple", "laser", "rocket", "nuke", "scatter", "rail", "mine", "orb", "bolt", "shard", "holy"];   // index is what goes over the network
  // rounds on the shared clock: ROUND_PLAY seconds of fighting (the lobby's time limit), then 15 seconds of results
  let ROUND_PLAY = 300, SCORE_LIMIT = 0;
  const ROUND_BREAK = 15;
  let ROUND_LEN = ROUND_PLAY + ROUND_BREAK;
  function setMatch(code) { ROUND_PLAY = TIME_OPTS[timeOf(code)] * 60; ROUND_LEN = ROUND_PLAY + ROUND_BREAK; SCORE_LIMIT = scoreLimit(code); }
  const roundAt = ms => { const t = ms / 1000, idx = Math.floor(t / ROUND_LEN), ph = t - idx * ROUND_LEN; return { idx, ph, live: ph < ROUND_PLAY, left: ROUND_PLAY - ph }; };
  // armour (in lives, like health): it takes only ARMOR_SOAK of each hit, the rest still hurts; at most MAX_SHIELD
  const SUPPLY_PERIOD = 20, MAX_SHIELD = 3, ARMOR_SOAK = 0.6; let SUPPLY_SLOTS = 14;
  // the big bombs: one huge blast each. Inside kill nothing survives; out to R the damage falls from 4 to 1.5 lives.
  // The holy bomb is thrown, bounces, sings a choir sing seconds before its fuse runs out, then outdoes the nuke
  const BOOM_LIFE = 4;
  // big-bomb crates, each on its own cycle: period (s), share of cycles it turns up in, and for how much of the cycle
  const BOMB_CRATES = { nuke: { key: "N", period: 70, seed: 71, chance: 0.65, stay: 0.6 }, holy: { key: "H", period: 50, seed: 74, chance: 0.85, stay: 0.7 } };
  // wave: [reach, seconds to get there, push at the centre] of the blast wave that flings everything outward
  const BOMBS = { [K.NUKE]: { R: 1100, kill: 620, carve: 420, wave: [2100, 1.1, 2400] },
                  [K.HOLY]: { R: 2600, kill: 1800, carve: 700, wave: [4400, 1.6, 3400], sing: 2.1, holy: true, wipe: true } };   // wipe: bodies inside kill are erased whole
  const bombDmg = (bm, d) => d < bm.kill ? 99 : 1.5 + 2.5 * (1 - (d - bm.kill) / (bm.R - bm.kill));
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
    nuke: "M14.10 8.36L17.25 2.91A10.5 10.5 0 0 0 6.75 2.91L9.90 8.36A4.2 4.2 0 0 1 14.10 8.36ZM7.80 12.00L1.50 12.00A10.5 10.5 0 0 0 6.75 21.09L9.90 15.64A4.2 4.2 0 0 1 7.80 12.00ZM14.10 15.64L17.25 21.09A10.5 10.5 0 0 0 22.50 12.00L16.20 12.00A4.2 4.2 0 0 1 14.10 15.64ZM12 9.8a2.2 2.2 0 1 0 0.01 0Z",
    holy: "M12 10a6.5 6.5 0 1 0 0.01 0ZM12 1C6.5 1 3.5 2.4 3.5 4.2S6.5 7.4 12 7.4s8.5-1.4 8.5-3.2S17.5 1 12 1Zm0 1.7c4 0 6.4.8 6.4 1.5S16 5.7 12 5.7 5.6 4.9 5.6 4.2 8 2.7 12 2.7Z"
  };
  const ICON_PATHS = Object.fromEntries(Object.entries(ICONS).map(([k, d]) => [k, new Path2D(d)]));
  const FIRE_KEYS = ["Space", "KeyF", "KeyJ", "Enter"];
  // customization: index 0 of every list is the original look
  const CUSTOM = {
    // a colour is a hue, or [hue, saturation x, lightness x] for the darker and greyer ones (new items go at the end:
    // the index is what goes over the network)
    body:  { label: "Body",  items: [["Teal", null], ["Pink", 330], ["Orange", 22], ["Lime", 95], ["Sky", 205], ["Gold", 46], ["Violet", 268],
                                     ["Recycling green", [135, 1.1, 0.85]], ["Hi-vis", [72, 1.6, 1.2]], ["Charcoal", [225, 0.12, 0.5]], ["Steel", [210, 0.22, 1]]] },
    // the bin lid colours of household collections: recycling, garden, food, general waste, glass
    lid:   { label: "Lid",   items: [["Lavender", null], ["Navy", 222], ["Red", 2], ["Mint", 155], ["Rose", 318], ["Amber", 38],
                                     ["Recycling blue", [212, 1.3, 0.85]], ["Garden green", [120, 1.1, 0.75]], ["Food brown", [28, 0.75, 0.6]], ["General black", [230, 0.1, 0.4]], ["Glass purple", [275, 1, 0.8]]] },
    flame: { label: "Fire",  items: [["By level", null], ["Blue", "blue"], ["Green", "green"], ["Pink", "pink"], ["Rainbow", "rainbow"], ["Toxic", "toxic"]] },
    trail: { label: "Trail", items: [["Sparkle", null], ["Fire", "fire"], ["Ice", "ice"], ["Gold", "gold"], ["Rainbow", "rainbow"], ["Litter", "litter"], ["Eco", "eco"]] },
    hat:   { label: "Hat",   items: [["None", null], ["Party", "party"], ["Top hat", "tophat"], ["Halo", "halo"], ["Bow", "bow"], ["Cap", "cap"],
                                     ["Hard hat", "hardhat"], ["Traffic cone", "cone"], ["Hi-vis beanie", "hivis"], ["Recycling", "recycle"]] }
  };
  const CUSTOM_KEYS = ["body", "lid", "flame", "trail", "hat"];
  const FLAMES = {
    blue:  { outer: [60, 120, 255], mid: [80, 200, 255],  core: [225, 250, 255] },
    green: { outer: [40, 200, 90],  mid: [140, 255, 120], core: [235, 255, 215] },
    pink:  { outer: [255, 60, 160], mid: [255, 140, 210], core: [255, 236, 250] },
    toxic: { outer: [120, 255, 30], mid: [210, 255, 80], core: [245, 255, 210] }
  };
  const TRAILS = {
    fire: ["#fff3b0", "#ffd23f", "#ff9a2e", "#ff5a1f"],
    ice: ["#bff9ff", "#7df9ff", "#ffffff", "#9fd8ff"],
    gold: ["#ffd36b", "#fff1b8", "#ffb43c", "#ffffff"],
    rainbow: ["#ff6b6b", "#ffb43c", "#ffe66b", "#6bff95", "#6bd5ff", "#8c7bff", "#ff7bea"],
    litter: ["#e8e0d0", "#5a8ac8", "#c85a4a", "#6ab06a", "#d8c050"],   // scraps of paper, cans and wrappers
    eco: ["#6bff95", "#3ad06a", "#c8ffb0", "#9ff3c0"]
  };
  const cleanCustom = v => CUSTOM_KEYS.map((k, i) => {
    const n = Array.isArray(v) ? Math.floor(Number(v[i])) : 0;
    return n >= 0 && n < CUSTOM[k].items.length ? n : 0;
  });
  // team modes paint every bin's body and lid in its team's colour (the rest of the look stays the pilot's own)
  const TEAM_SKIN = [{ body: 352, lid: 8 }, { body: 212, lid: 226 }];   // hues: Red, Blue
  const customVal = (ck, key) => ck.team !== undefined && TEAM_SKIN[ck.team][key] !== undefined ? TEAM_SKIN[ck.team][key]
    : CUSTOM[key].items[ck[CUSTOM_KEYS.indexOf(key)]][1];

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
  const COMPACT = matchMedia("(pointer: coarse), (max-width: 700px), (max-height: 500px)");   // the compact HUD (same query as in styles.css)
  const MAX_DPR = COARSE ? 1.5 : 2, MAX_PARTS = COARSE ? 1200 : 2500;
  const cv = document.getElementById("c");
  let g = cv.getContext("2d", { alpha: false });   // swapped briefly to draw the start-screen preview
  const DISPLAY_FONT = getComputedStyle(document.documentElement).getPropertyValue('--display');
  let vw = 0, vh = 0, dpr = 1, zoom = 1, baseZoom = 1, viewZoom = 1;   // zoom = baseZoom (screen size) x viewZoom (pulls back on boost)
  let resScale = 1;   // share of the screen's resolution we draw at: a fixed setting, or lowered by the frame loop when slow
  let TS = 1;   // text scale: undoes the camera zoom so labels stay readable
  function resize() {
    dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1) * resScale;
    baseZoom = Math.max(0.62, Math.min(1, Math.min(innerWidth, innerHeight) / 700));   // runs before the helpers exist
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
    applyView();
  }
  // the camera's zoom, every frame: how much of the world is on screen
  function applyView() {
    zoom = baseZoom * viewZoom;
    TS = 1 / zoom;
    vw = innerWidth / zoom; vh = innerHeight / zoom;   // world units visible on screen
    g.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
  }
  addEventListener("resize", resize); resize();

