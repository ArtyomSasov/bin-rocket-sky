  "use strict";
  // ---------- config: world size, levels, weapons, shots, modes, supplies, rounds ----------
  // walled arena; its size comes from the lobby code's first letter (s/m/l/x), so everyone in a lobby shares it
  const MAP_SIZES = { s: [2600, "Small", 3], m: [4200, "Medium", 5], l: [6000, "Large", 9], x: [8000, "Huge", 14] };
  const mapOf = code => MAP_SIZES[String(code)[0]] ? String(code)[0] : "m";
  // map variants: what fills the arena. A new lobby's code carries it as "0<letter>" after the size (and the mode),
  // e.g. M0Y... or M1C0A...; generated codes never contain 0, and a code without it is Classic.
  // The layout of each map is in 01b-arenas.js. star: a sun in the middle; lumpy: planets become ragged asteroids
  const MAPS = {
    f: { name: "Foundry", label: "Foundry · NEW", hint: "industrial corridors, three routes", station: true },
    c: { name: "Twin Worlds", label: "Twin Worlds", hint: "two giants, an open centre" },
    a: { name: "The Ring", label: "The Ring", hint: "a ring of asteroids, four gates", lumpy: true },
    y: { name: "Drydocks", label: "Drydocks", hint: "rows of moored hulls" },
    r: { name: "Downtown", label: "Downtown", hint: "tower blocks, a main street" },
    s: { name: "Orrery", label: "Orrery", hint: "a sun and its planets", star: true },
    w: { name: "The Tip", label: "The Tip", hint: "trucks, skips, a landfill hill" },
    o: { name: "Duel", label: "Duel", hint: "nearly empty: duels" }
  };

  // A lobby code: the size letter, then settings as pairs ("1"+letter mode, "0"+letter map, "1"+digit time limit,
  // "0"+digit score limit), then random letters. Random letters never use 0 or 1, so the pairs can't be mistaken.
  const codeOpts = code => {
    const o = {};
    for (const [, a, b] of String(code).slice(1).matchAll(/([01])([a-z0-9])/g)) o[a + (/\d/.test(b) ? "d" : "l")] = b;
    return { mode: o["1l"], map: o["0l"], time: o["1d"], score: o["0d"] };
  };
  const mapThemeOf = code => MAPS[codeOpts(code).map] ? codeOpts(code).map : "c";
  let W = 4200, H = 4200;
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
  const sizeOf = lv => 1 + (lv - 1) * 0.04;                       // Lv 10 is about 1.36x
  const maxLivesOf = lv => LIVES + Math.floor((lv - 1) / 4);      // 3 lives at Lv 1-4, 4 at 5-8, 5 at 9-10
  // levels: XP comes from kills (10, more for a higher-level victim), sparks and stars, planets and flags. Every
  // level adds a perk (they stack); dying costs two levels. The same rules for players and bots
  const PERKS = { 2: "faster energy", 3: "double dash", 4: "twin fireballs", 5: "magnet: pick-ups from afar", 6: "shield regenerates",
    7: "fireballs pierce", 8: "a teleport jump on every respawn", 9: "more health", 10: "THE CROWN: +25% damage, everyone sees you" };
  const killXp = (myLv, victimLv) => 10 + Math.max(0, victimLv - myLv) * 3 + (victimLv >= MAX_LV ? 20 : 0);
  const levelAfterDeath = lv => Math.max(1, lv - 2);
  const TIERS = [
    { from: 1,  outer: [255, 70, 20],  mid: [255, 150, 40], core: [255, 240, 170], aura: null },
    { from: 4,  outer: [255, 60, 150], mid: [255, 140, 70], core: [255, 245, 210], aura: [255, 120, 200] },
    { from: 7,  outer: [150, 80, 255], mid: [80, 170, 255], core: [225, 250, 255], aura: [140, 200, 255] },
    { from: 10, outer: [255, 80, 200], mid: [255, 210, 80], core: [255, 255, 255], aura: [255, 220, 120] }
  ];
  const tierOf = lv => TIERS.filter(t => lv >= t.from).pop();
  // shot kinds: what flies. The number is what goes over the network; everything per kind lives in SHOTS
  const K = { FIRE: 0, ROCKET: 1, LASER: 2, NUKE: 3, PELLET: 4, RAIL: 5, MINE: 6, ORB: 7, BOLT: 8, SHARD: 9, SLUG: 10, HOLY: 11, SAW: 12, GAMMA: 13, BEACON: 14, TFRAG: 15, BULLET: 16, GAUSS: 17, SHOCK: 18, PULSE: 19, FLAK: 20, DET: 21, NAIL: 22, GREN: 23, MELEE: 24, SPIKE: 25, MDET: 26, HROCKET: 27, RECALL: 28 };
  const MINE_R = 55, MINE_ARM = 0.7;   // mines go off when a bin comes this close, after arming
  // life: seconds; dmg: in lives (Lv 1 has 3 = 100%; pellets use pelletDmg, the nuke deals its damage in detonate);
  // r: extra hit radius; col: colour; carve: crater radius; shove: push on the bin it hits; sfx: [sound, volume, pitch] of someone else's shot;
  // pierce: passes through bins (each one hit once); bounce: ricochets off the fence and bodies this many times;
  // inert: never hits anything itself (the big bombs blow up their own way, the teleporter's beacon just sits there)
  const SHOTS = [
    { name: "fireball",  life: 1.1,  dmg: 0.3,  r: 0,      col: "#ffb43c", carve: 16, shove: 0,   sfx: ["fire", 0.6, 1] },
    { name: "rocket",    life: 2.4,  dmg: 1.4,  r: 8,      col: "#ffb43c", carve: 52, shove: 0,   sfx: ["rocket", 0.6, 1] },
    { name: "laser",     life: 0.125, dmg: 0.19, r: 0,     col: "#7df9ff", carve: 10, shove: 0,   sfx: ["laser", 0.2, 1] },
    { name: "nuke",      life: 6,    dmg: 0,    r: 0,      col: "#ffe14d", carve: 0,  shove: 0,   sfx: ["rocket", 0.6, 0.6], inert: true },
    { name: "pellet",    life: 0.64, dmg: 0,    r: 0,      col: "#ffd27a", carve: 9,  shove: 150, sfx: ["scatter", 0.6, 1] },
    { name: "rail slug", life: 0.7,  dmg: 3,    r: 0,      col: "#e9c8ff", carve: 14, shove: 650, sfx: ["rail", 0.6, 1], pierce: true },
    { name: "mine",      life: 30,   dmg: 1.7,  r: MINE_R, col: "#ff6b3c", carve: 50, shove: 0,   sfx: ["mine_drop", 0.6, 1] },
    { name: "plasma",    life: 4.2,  dmg: 1.4,  r: 30,     col: "#6fd8ff", carve: 60, shove: 300, sfx: ["shield_get", 0.6, 1.1] },
    { name: "lightning", life: 0.15, dmg: 0.22, r: 0,      col: "#bfefff", carve: 6,  shove: 0,   sfx: ["laser", 0.2, 1.7] },
    { name: "shard",     life: 1.1,  dmg: 0.4,  r: 4,      col: "#ff9a3c", carve: 14, shove: 220, sfx: ["scatter", 0.9, 0.75], bounce: 4 },
    { name: "slug",      life: 0.6,  dmg: 1,    r: 4,      col: "#ffe7a0", carve: 20, shove: 450, sfx: ["scatter", 0.6, 1] },
    { name: "holy bomb", life: 3.6,  dmg: 0,    r: 0,      col: "#fff3b0", carve: 0,  shove: 0,   sfx: ["mine_drop", 0.8, 0.6], inert: true },
    { name: "saw blade", life: 3.2,  dmg: 0.85,  r: 8,      col: "#d6dde8", carve: 12, shove: 180, sfx: ["scatter", 0.5, 1.7], pierce: true, bounce: 6 },
    { name: "demonic skull", life: 4,    dmg: 1.35, r: 34,     col: "#7dff8a", carve: 90, shove: 500, sfx: ["shield_get", 0.8, 0.55] },
    { name: "beacon",    life: 15,   dmg: 0,    r: 0,      col: "#8ff0ff", carve: 0,  shove: 0,   sfx: ["mine_drop", 0.5, 1.5], inert: true },
    { name: "telefrag",  life: 0.12, dmg: 99,   r: 40,     col: "#8ff0ff", carve: 0,  shove: 900, sfx: ["rail", 0.6, 1.6] },
    { name: "bullet",    life: 0.5,  dmg: 0.1, r: 0,      col: "#ffe08a", carve: 6,  shove: 30,  sfx: ["fire", 0.3, 1.8] },
    { name: "gauss slug", life: 0.6, dmg: 3,    r: 4,      col: "#7fb8ff", carve: 26, shove: 700, sfx: ["rail", 0.7, 0.8], pierce: true },
    { name: "shock beam", life: 0.25, dmg: 0.75, r: 0,      col: "#c9a4ff", carve: 10, shove: 220, sfx: ["laser", 0.6, 0.55] },
    { name: "laser pulse", life: 0.12, dmg: 0.45, r: 60,    col: "#7df9ff", carve: 12, shove: 950, sfx: ["laser", 0.9, 0.5], pierce: true },
    { name: "flak shell", life: 0.42, dmg: 0.6,  r: 6,      col: "#ff9a3c", carve: 22, shove: 200, sfx: ["scatter", 0.9, 0.6] },
    { name: "detonator",  life: 0.05, dmg: 0,    r: 0,      col: "#7dff8a", carve: 0,  shove: 0,   sfx: ["hit", 0.5, 0.6], inert: true },
    { name: "nail",       life: 1.1,  dmg: 0.13, r: 0,      col: "#cfd6e2", carve: 0,  shove: 60,  sfx: ["fire", 0.4, 2.2] },
    { name: "grenade",    life: 2.5,  dmg: 0.9,  r: 10,     col: "#8fd06a", carve: 46, shove: 300, sfx: ["mine_drop", 0.8, 0.7], bounce: 99 },
    { name: "gauntlet",   life: 0.06, dmg: 0.7, r: 46,     col: "#ffcf5a", carve: 0,  shove: 650, sfx: ["hit", 0.7, 0.7] },
    { name: "spike",      life: 0.9,  dmg: 0.6,  r: 2,      col: "#e8eef8", carve: 0, shove: 400, sfx: ["rail", 0.5, 1.6], pierce: true },
    { name: "mine detonator", life: 0.05, dmg: 0, r: 0,      col: "#ff6b3c", carve: 0,  shove: 0,   sfx: ["hit", 0.5, 0.6], inert: true },
    { name: "homing rocket", life: 3.6, dmg: 1.0,  r: 12,     col: "#ffb43c", carve: 52, shove: 0,   sfx: ["rocket", 0.6, 1] },
    { name: "saw recall", life: 0.05, dmg: 0, r: 0, col: "#6fffe0", carve: 0, shove: 0, sfx: ["dash", 0.5, 1.4], inert: true }
  ];
  // weapons: pick-ups swap the fireball for a while. Each gun is described here, and the player and the bots fire it
  // the same way (see volley):
  //   shot: [shot kind, speed]; spread: angles of the shots in one volley; back: fired behind the bin
  //   kick: recoil; feel: [view jolt, screen shake, muzzle flash size]; sfx: [sound, volume, pitch]; fx: extra muzzle effect
  //   alt: the alternate fire (right mouse button / C): the same fields plus cost (ammo) and cd (reload)
  //   guided (alt): you steer the shot; spin: [slowest reload, fastest, seconds to spin up] while the trigger is held;
  //   jitter: random spread (rad); charge: seconds to charge fully while held, it fires on release
  const WEAPONS = {
    fire:    { name: "Fireball", ammo: Infinity, cd: 0.22, shot: [K.FIRE, 1000], kick: 25, feel: [5, 0.05, 40], sfx: ["fire", 0.55] },
    triple:  { name: "Triple shot", ammo: 24, cd: 0.3, col: "#ffb43c", shot: [K.FIRE, 1000], spread: [-0.2, 0, 0.2], kick: 25, feel: [7, 0.07, 50], sfx: ["triple", 0.7],
               alt: { name: "Focus", cost: 1, cd: 0.3, shot: [K.FIRE, 1050], spread: [-0.035, 0, 0.035], kick: 60, feel: [10, 0.13, 80], sfx: ["triple", 0.8, 0.9] } },
    // the laser: a beam of ~700 px that locks onto the nearest enemy you point at and arcs on to one more close by
    // alt: a wide pulse that shoves everything in front of you away (12 charges)
    laser:   { name: "Laser", ammo: 120, cd: 0.08, col: "#7df9ff", shot: [K.LASER, 5600], kick: 6, feel: [2, 0.02, 30], sfx: ["laser", 0.4],
               alt: { name: "Pulse", cost: 12, cd: 1.0, shot: [K.PULSE, 3000], kick: 160, feel: [14, 0.22, 90], sfx: ["laser", 1, 0.5], fx: "pulse" } },
    // rockets as in Quake: straight and fast (about 2.4x a bin's speed), dodgeable by reading them; alt three slow homing ones
    rocket:  { name: "Rocket launcher", ammo: 10, cd: 0.8, col: "#ff5a6e", shot: [K.ROCKET, 1350], kick: 120, feel: [12, 0.16, 70], sfx: ["rocket", 0.8],
               alt: { name: "Homing salvo", cost: 3, cd: 1.6, shot: [K.HROCKET, 520], spread: [-0.3, 0, 0.3], kick: 200, feel: [18, 0.23, 96], sfx: ["rocket", 1, 0.8] } },
    nuke:    { name: "Nuke", ammo: 1, cd: 1.0, col: "#ffe14d", shot: [K.NUKE, 360], kick: 160, feel: [30, 0.5, 120], sfx: ["rocket", 1, 0.6],
               alt: { name: "Guided", cost: 1, cd: 1.0, shot: [K.NUKE, 420], kick: 160, feel: [30, 0.5, 120], sfx: ["rocket", 1, 0.5], guided: true } },
    scatter: { name: "Scatter gun", ammo: 16, cd: 0.7, col: "#ffd27a", shot: [K.PELLET, 1250], kick: 260, feel: [22, 0.3, 90], sfx: ["scatter", 1, 0.85], fx: "blast",
               alt: { name: "Slug", cost: 2, cd: 0.95, shot: [K.SLUG, 1900], kick: 340, feel: [24, 0.3, 108], sfx: ["scatter", 1, 0.65], fx: "slug" } },
    // alt: charge the width of a short-range cutter, then release; fixed damage, a traversable tunnel (2 ammo)
    rail:    { name: "Railgun", ammo: 6, cd: 1.15, col: "#d9a8ff", shot: [K.RAIL, 4200], kick: 320, feel: [26, 0.35, 90], sfx: ["rail", 0.9], fx: "rail",
               alt: { name: "Breach cutter", cutter: true, charge: 1.1, cost: 2, cd: 1.3, shot: [K.GAUSS, 4200], kick: 460, feel: [34, 0.5, 130], sfx: ["rail", 1, 0.75], fx: "rail" } },
    // the prox launcher (Quake Team Arena): a mine flies like a grenade, sticks to the first rock or wall it meets,
    // arms, and goes off a beat after an enemy comes near; alt sets off all your mines at once
    mine:    { name: "Prox mines", ammo: 8, cd: 0.7, col: "#ff6b3c", shot: [K.MINE, 760], kick: 60, feel: [6, 0.08, 60], sfx: ["mine_drop", 0.8],
               alt: { name: "Detonate", minedet: true, cost: 0, cd: 0.5, sfx: ["hit", 0.6, 0.6] } },
    // the shock orb: a slow ball that stops and hangs in the air; its alt fire is a beam, and the beam through a ball sets off a combo
    orb:     { name: "Shock orb", ammo: 12, cd: 0.85, col: "#6fd8ff", shot: [K.ORB, 420], kick: 140, feel: [16, 0.18, 110], sfx: ["shield_get", 1, 0.9], fx: "plasma",
               alt: { name: "Beam", cost: 1, cd: 0.6, shot: [K.SHOCK, 6400], kick: 70, feel: [8, 0.08, 60], sfx: ["laser", 0.8, 0.55], fx: "shock" } },
    bolt:    { name: "Lightning", ammo: 90, cd: 0.11, col: "#bfefff", shot: [K.BOLT, 5600], kick: 4, feel: [2, 0.03, 35], sfx: ["laser", 0.22, 1.7] },
    holy:    { name: "Holy bomb", ammo: 1, cd: 1.2, col: "#fff3b0", shot: [K.HOLY, 700], kick: 120, feel: [20, 0.3, 110], sfx: ["mine_drop", 1, 0.6] },
    saw:     { name: "Buzzsaw", ammo: 20, cd: 0.42, col: "#d6dde8", shot: [K.SAW, 1500], kick: 60, feel: [8, 0.08, 50], sfx: ["scatter", 0.55, 1.7],
               alt: { name: "Recall blades", recall: true, cost: 0, cd: 0.3, shot: [K.RECALL, 0], sfx: ["dash", 0.6, 1.4] } },
    // alt: set your gamma orb off where it is now
    gamma:   { name: "Demonic Skull", ammo: 3, cd: 1.6, col: "#7dff8a", shot: [K.GAMMA, 420], kick: 220, feel: [24, 0.35, 130], sfx: ["shield_get", 1, 0.5], fx: "gamma",
               alt: { name: "Detonate", detonate: true, cost: 0, cd: 0.3, sfx: ["hit", 0.6, 0.6] } },
    tele:    { name: "Teleporter", ammo: 3, cd: 0.35, col: "#8ff0ff", shot: [K.BEACON, 1250], kick: 0, feel: [3, 0.02, 30], sfx: ["mine_drop", 0.7, 1.5] },
    // One primary mode with spin-up; its sound is the original Quake chaingun burst.
    minigun: { name: "Minigun", ammo: 160, cd: 0.09, spin: [0.16, 0.045, 1.2], jitter: 0.05, col: "#ffe08a", shot: [K.BULLET, 2600], kick: 10, feel: [2, 0.03, 30], sfx: ["fire", 0.35, 1.8] },
    gauss:   { name: "Charge cannon", ammo: 8, cd: 1.4, charge: 1.1, col: "#7fb8ff", shot: [K.GAUSS, 3600], kick: 300, feel: [24, 0.35, 100], sfx: ["rail", 0.9, 0.75], fx: "rail" },
    // the shard cannon: four heavy shards that ricochet four times, each bounce making them hit harder
    // alt: a flak shell that bursts into eight shards all round after a short flight (or on impact)
    // Quake's three: a nailgun (a fan of nails that fly far, alt a piercing spike), a grenade launcher (grenades
    // bounce off rock and go off after 2.5 s or on a bin, alt three at once), and the gauntlet everyone carries
    // (hold fire: the blade spins and tears into a bin it touches; alt: a lunge forward with it)
    nail:    { name: "Nailgun", ammo: 30, cd: 0.55, col: "#cfd6e2", shot: [K.NAIL, 1700], kick: 90, feel: [10, 0.12, 60], sfx: ["fire", 0.6, 1.6],
               alt: { name: "Spike", cost: 4, cd: 1.0, shot: [K.SPIKE, 2600], kick: 200, feel: [16, 0.22, 80], sfx: ["rail", 0.6, 1.6] } },
    gren:    { name: "Grenade launcher", ammo: 10, cd: 0.8, col: "#8fd06a", shot: [K.GREN, 900], kick: 140, feel: [14, 0.18, 80], sfx: ["mine_drop", 0.9, 0.7],
               alt: { name: "Volley", cost: 3, cd: 1.5, shot: [K.GREN, 850], spread: [-0.25, 0, 0.25], kick: 260, feel: [20, 0.28, 100], sfx: ["mine_drop", 1, 0.6] } },
    gauntlet: { name: "Gauntlet", ammo: Infinity, cd: 0.4, col: "#ffcf5a", shot: [K.MELEE, 0], melee: true, kick: 0, feel: [6, 0.1, 0], sfx: ["hit", 0.7, 0.7],
               alt: { name: "Lunge", cost: 0, cd: 0, lunge: true, sfx: ["dash", 0.8] } },
    shard:   { name: "Shard cannon", ammo: 14, cd: 0.8, col: "#ff9a3c", shot: [K.SHARD, 1500], kick: 340, feel: [28, 0.42, 130], sfx: ["scatter", 1, 0.7], fx: "shard",
               alt: { name: "Flak", cost: 2, cd: 0.95, shot: [K.FLAK, 1100], kick: 220, feel: [20, 0.28, 110], sfx: ["scatter", 1, 0.55], fx: "shard" } }
  };
  let PICKS = 0;   // weapon spots on this arena (see 01b-arenas.js)
  // blasts that hurt everyone around them (besides whoever took the direct hit): [radius, most damage at the
  // centre, least at the rim (in lives), push]
  const SPLASH = { [K.MINE]: [170, 1.2, 0.3, 450], [K.HROCKET]: [170, 0.6, 0.15, 320], [K.GREN]: [190, 0.9, 0.2, 420], [K.ROCKET]: [170, 0.6, 0.15, 320], [K.ORB]: [160, 0.6, 0.2, 380], [K.GAMMA]: [260, 1, 0.3, 600] };
  const GAMMA_ZAP = { r: 480, every: 0.3, dmg: 0.15 };   // the gamma orb zaps every enemy this close as it flies
  const DMG_UNIT = 0.35;   // one fireball: planets and UFOs count damage in fireballs
  const AMP_PERIOD = 95, AMP_TIME = 20000, QUAD = 4;         // Quad damage: a rare pick-up, four times the damage for 20 s                        // mines go off when a bin comes this close, after arming
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
    r: { name: "Railgun instagib", label: "Instagib", hint: "one rail hit kills", only: "rail", botCd: 3, instagib: true, noSupplies: true },
    // the test range: every gun at once with endless ammo (and the teleporter), to try them all out
    x: { name: "Test range", label: "Test range", hint: "every gun, endless ammo", sandbox: true }
  };
  // the guns the test range hands out (the retired ones stay out), in gun-bar order
  const SANDBOX_GUNS = ["fire", "gauntlet", "nail", "minigun", "scatter", "shard", "gren", "rocket", "laser", "orb", "rail", "saw", "mine", "gamma", "nuke", "holy"];
  const modeOf = code => MODES[codeOpts(code).mode] ? codeOpts(code).mode : "d";
  // match settings: round length (minutes) and a score that ends the round early (kills, or flags in CTF)
  const TIME_OPTS = { 2: 3, 3: 5, 4: 8, 5: 10, 6: 15 }, TIME_DEFAULT = "3";
  const SCORE_OPTS = { 2: [10, 3], 3: [20, 5], 4: [30, 10] };   // [kills, flags]
  const timeOf = code => TIME_OPTS[codeOpts(code).time] ? codeOpts(code).time : TIME_DEFAULT;
  const scoreOf = code => SCORE_OPTS[codeOpts(code).score] ? codeOpts(code).score : "";
  const scoreLimit = code => { const s = scoreOf(code); return s ? SCORE_OPTS[s][MODES[modeOf(code)].flags ? 1 : 0] : 0; };
  let MODE = "d";
  const TEAM_NAME = ["Red", "Blue"], TEAM_HEX = ["#ff5a6e", "#4fa8ff"], TEAM_RGB = ["255,90,110", "79,168,255"];
  const WEAPON_KEYS = ["fire", "triple", "laser", "rocket", "nuke", "scatter", "rail", "mine", "orb", "bolt", "shard", "holy", "saw", "gamma", "tele", "minigun", "gauss", "nail", "gren", "gauntlet"];
  // the gun bar's order: the fireball and the gauntlet first, like Quake's 1 and 2
  const GUN_ORDER = ["fire", "gauntlet", ...WEAPON_KEYS.filter(k => k !== "fire" && k !== "gauntlet")];   // index is what goes over the network
  // rounds on the shared clock: ROUND_PLAY seconds of fighting (the lobby's time limit), then 15 seconds of results
  let ROUND_PLAY = 300, SCORE_LIMIT = 0;
  const ROUND_BREAK = 15;
  let ROUND_LEN = ROUND_PLAY + ROUND_BREAK;
  function setMatch(code) { ROUND_PLAY = TIME_OPTS[timeOf(code)] * 60; ROUND_LEN = ROUND_PLAY + ROUND_BREAK; SCORE_LIMIT = scoreLimit(code); }
  let matchStart = 0, matchRound = 0, matchEnd = 0, matchReady = false;
  function startMatch(ms) { matchStart = ms; matchRound = 0; matchEnd = 0; matchReady = true; }
  function roundAt(ms) {
    // Each lobby starts a full round when created, independent of the wall-clock minute.
    if (!matchReady) return { idx: -1, ph: 0, live: false, left: ROUND_PLAY, next: 0 };
    let end = matchEnd || matchStart + ROUND_PLAY * 1000;
    if (ms >= end + ROUND_BREAK * 1000) {
      matchStart = end + ROUND_BREAK * 1000; matchRound++; matchEnd = 0;
      const skipped = Math.floor(Math.max(0, ms - matchStart) / (ROUND_LEN * 1000));
      matchStart += skipped * ROUND_LEN * 1000; matchRound += skipped;
      end = matchStart + ROUND_PLAY * 1000;
    }
    return { idx: matchRound, ph: Math.max(0, ms - matchStart) / 1000, live: ms < end,
      left: Math.max(0, end - ms) / 1000, next: Math.max(0, end + ROUND_BREAK * 1000 - ms) / 1000 };
  }
  function receiveMatchClock(value) {
    if (!Array.isArray(value) || value.length !== 3) return;
    const [round, start, end] = value;
    if (!Number.isSafeInteger(round) || round < 0 || !Number.isFinite(start) || start <= 0 || Math.abs(start - clockNow()) > 86400000
      || !Number.isFinite(end) || (end !== 0 && (end < start || end > start + ROUND_PLAY * 1000))) return;
    if (!matchReady || round > matchRound) {
      matchRound = round; matchStart = start; matchEnd = end; matchReady = true;
    } else if (round === matchRound && Math.abs(start - matchStart) < 1 && end && (!matchEnd || end < matchEnd)) matchEnd = end;
  }
  // armour (in lives, like health): it takes only ARMOR_SOAK of each hit, the rest still hurts; at most MAX_SHIELD
  const SUPPLY_PERIOD = 20, MAX_SHIELD = 3, ARMOR_SOAK = 0.6; let SUPPLY_SLOTS = 0;
  // the big bombs: one huge blast each. Inside kill nothing survives; out to R the damage falls from 4 to 1.5 lives.
  // The holy bomb is thrown, bounces, sings a choir sing seconds before its fuse runs out, then outdoes the nuke
  const BOOM_LIFE = 4;
  // big-bomb crates, each on its own spot: once taken, it comes back at the start of its next cycle (s)
  const BOMB_CRATES = { nuke: { key: "N", period: 70 }, holy: { key: "H", period: 60 } };
  // wave: [reach, seconds to get there, push at the centre] of the blast wave that flings everything outward
  const BOMBS = { [K.NUKE]: { R: 1100, kill: 620, carve: 420, wave: [2100, 1.1, 2400] },
                  [K.HOLY]: { R: 2000, kill: 1300, carve: 700, wave: [3600, 1.5, 3000], sing: 2.55, holy: true, wipe: true } };   // sing: the holy bomb's sound (2.53 s) starts so it ends with the blast   // wipe: bodies inside kill are erased whole
  const bombDmg = (bm, d) => d < bm.kill ? 99 : 1.5 + 2.5 * (1 - (d - bm.kill) / (bm.R - bm.kill));
  // weapon icons (24x24 SVG path data, even-odd fill): used on crates (canvas) and in the HUD (SVG)
  const ICONS = {
    fire: "M12 0c1 5 7 8 7 15a7 7 0 0 1-14 0c0-3 1.5-5 3-6.5C8 11 9.5 12 10.5 12 9 8 10 3 12 0z",
    triple: "M3 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0ZM8.6 7.5a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0-6.8 0ZM15 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0ZM5.2 13.6L9.6 10.4L10.4 11.2L6.4 14.6ZM18.8 13.6L14.4 10.4L13.6 11.2L17.6 14.6Z",
    laser: "M2 10h9v6H2ZM5 16h3v4H5ZM11 9h6v2.5h-6ZM11 13.5h6v2.5h-6ZM18 9.5l4 3-4 3 1-3Z",
    rocket: "M2 9h15v6H2ZM6 15h3v4H6ZM8 7h4v2H8ZM17 9.5h2l3 2.5-3 2.5h-2Z",
    scatter: "M8 7.5h14V10H8ZM8 11h14v2.5H8ZM2 9l6-1.5V15l-6 1.5ZM11 14h6v3h-6Z",
    rail: "M2 10h7v5H2ZM4 15h3v4H4ZM9 11.25h13v1.5H9ZM11 9h2v2.25h-2ZM11 12.75h2V15h-2ZM15 9h2v2.25h-2ZM15 12.75h2V15h-2ZM19 9h2v2.25h-2ZM19 12.75h2V15h-2Z",
    mine: "M12 6a6 6 0 1 0 0.01 0ZM12 10a2 2 0 1 0 0.01 0ZM11 1h2v4h-2zM11 19h2v4h-2zM1 11h4v2H1zM19 11h4v2h-4zM4.2 5.6l1.4-1.4 2.4 2.4-1.4 1.4zM16 17.4l1.4-1.4 2.4 2.4-1.4 1.4zM18.4 4.2l1.4 1.4-2.4 2.4-1.4-1.4zM4.2 18.4l2.4-2.4 1.4 1.4-2.4 2.4z",
    cross: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
    orb: "M2 10h8v6H2ZM5 16h3v4H5ZM10 11.5h8v3h-8ZM18 10.5h4v5h-4ZM14 4.5a3 3 0 1 0 0.01 0Z",
    bolt: "M9 1h7l-4 7h5l-3 5h4L7 23l3-8H6l2-5H4z",
    shard: "M2 9h11v7H2ZM5 16h3v4H5ZM13 8h4v9h-4ZM17 9l5-2v3l-5 1ZM17 12h5v1.5h-5ZM17 14.5l5 1v3l-5-2Z",
    amp: "M12 1l9 7-9 15-9-15ZM10 6.5h1.8v4h2.4v-4h1.8V16h-1.8v-3.8H10Z",
    shield: "M12 2l8 3v6c0 5.2-3.4 9.4-8 11-4.6-1.6-8-5.8-8-11V5z",
    nuke: "M14.10 8.36L17.25 2.91A10.5 10.5 0 0 0 6.75 2.91L9.90 8.36A4.2 4.2 0 0 1 14.10 8.36ZM7.80 12.00L1.50 12.00A10.5 10.5 0 0 0 6.75 21.09L9.90 15.64A4.2 4.2 0 0 1 7.80 12.00ZM14.10 15.64L17.25 21.09A10.5 10.5 0 0 0 22.50 12.00L16.20 12.00A4.2 4.2 0 0 1 14.10 15.64ZM12 9.8a2.2 2.2 0 1 0 0.01 0Z",
    holy: "M12 10a6.5 6.5 0 1 0 0.01 0ZM12 1C6.5 1 3.5 2.4 3.5 4.2S6.5 7.4 12 7.4s8.5-1.4 8.5-3.2S17.5 1 12 1Zm0 1.7c4 0 6.4.8 6.4 1.5S16 5.7 12 5.7 5.6 4.9 5.6 4.2 8 2.7 12 2.7Z",
    saw: "M23 12L19.67 14.27L21.53 17.5L17.51 17.8L17.5 21.53L13.87 19.78L12 23L9.73 19.67L6.5 21.53L6.2 17.51L2.47 17.5L4.22 13.87L1 12L4.33 9.73L2.47 6.5L6.49 6.2L6.5 2.47L10.13 4.22L12 1L14.27 4.33L17.5 2.47L17.8 6.49L21.53 6.5L19.78 10.13ZM12 9a3 3 0 1 0 0.01 0Z",
    gamma: "M4 8L1 1l7 4Q12 2 16 5l7-4-3 7q3 8-4 10v5H8v-5Q1 16 4 8ZM6 10l4 2-1 3-4-2ZM18 10l1 3-4 2-1-3ZM12 14l-2 4h4Z",
    tele: "M12 2a10 10 0 1 0 0.01 0ZM12 5a7 7 0 1 0 0.01 0ZM12 9.4a2.6 2.6 0 1 0 0.01 0Z",
    minigun: "M2 9h7v7H2ZM4 16h3v4H4ZM9 10h1v5H9ZM10 8.5h12v2H10ZM10 11.5h12v2H10ZM10 14.5h12v2H10Z",
    gauss: "M2 10.5h4v3H2ZM8.5 10.5h2v3h-2ZM13 10.5h2v3h-2ZM17.5 10.5H22v3h-4.5ZM6 7h2.5v10H6ZM10.5 7H13v10h-2.5ZM15 7h2.5v10H15Z",
    nail: "M2 9h10v7H2ZM5 16h3v4H5ZM6 4h4v5H6ZM12 10.5h6v4h-6ZM18 12h3l1.5.5-1.5.5h-3Z",
    gren: "M2 10h7v6H2ZM4 16h3v4H4ZM13.5 7.5a4.5 4.5 0 1 0 0.01 0ZM18 10.5h4v3h-4Z",
    gauntlet: "M12 1l2.2 4.2L19 4l-1.2 4.8L22 11l-4.2 2.2L19 18l-4.8-1.2L12 21l-2.2-4.2L5 18l1.2-4.8L2 11l4.2-2.2L5 4l4.8 1.2ZM12 8a3 3 0 1 0 0.01 0Z"
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

  const img = new Image(); img.src = window.BRS_SPRITE || "bot.png";   // the one-file game carries the sprite inside
  const holyImg = new Image(); holyImg.src = window.BRS_HOLY || "holy.png";   // the holy bomb's skin
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

