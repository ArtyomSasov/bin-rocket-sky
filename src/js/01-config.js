  "use strict";
  // ---------- config: world size, levels, weapons, shots, modes, supplies, rounds ----------
  // walled arena; its size comes from the lobby code's first letter (s/m/l/x), so everyone in a lobby shares it
  const MAP_SIZES = { s: [2600, "Small", 3], m: [4200, "Medium", 5], l: [6000, "Large", 9], x: [8000, "Huge", 14] };
  const mapOf = code => MAP_SIZES[String(code)[0]] ? String(code)[0] : "m";
  // map variants: what fills the arena. A new lobby's code carries it as "0<letter>" after the size (and the mode),
  // e.g. M0Y... or M1C0A...; generated codes never contain 0, and a code without it is Classic.
  // The layout of each map is in 01b-arenas.js. star: a sun in the middle; lumpy: planets become ragged asteroids
  const MAPS = {
    f: { name: "Foundry", label: "Foundry", hint: "industrial corridors, three routes", station: true },
    k: { name: "Cargo Deck", label: "Cargo Deck", hint: "a ring corridor round a cargo hall, crates to smash", station: true },
    h: { name: "Hangar", label: "Hangar · NEW", hint: "one huge hangar bay, corridors all round", station: true },
    v: { name: "Vault", label: "Vault · NEW", hint: "nine rooms and narrow doors, the vault in the middle", station: true },
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
  // Fixed arena stats. Legacy level fields stay at one on the wire.
  const XP_STEPS = [0], MAX_LV = 10;
  const lvOf = () => 1, sizeOf = () => 1, maxLivesOf = () => LIVES;
  const PERKS = {}, killXp = () => 0, levelAfterDeath = () => 1;
  const TIERS = [
    { from: 1,  outer: [255, 70, 20],  mid: [255, 150, 40], core: [255, 240, 170], aura: null },
    { from: 4,  outer: [255, 60, 150], mid: [255, 140, 70], core: [255, 245, 210], aura: [255, 120, 200] },
    { from: 7,  outer: [150, 80, 255], mid: [80, 170, 255], core: [225, 250, 255], aura: [140, 200, 255] },
    { from: 10, outer: [255, 80, 200], mid: [255, 210, 80], core: [255, 255, 255], aura: [255, 220, 120] }
  ];
  const tierOf = lv => TIERS.filter(t => lv >= t.from).pop();
  // shot kinds: what flies. The number is what goes over the network; everything per kind lives in SHOTS
  const K = { FIRE: 0, ROCKET: 1, LASER: 2, NUKE: 3, PELLET: 4, RAIL: 5, MINE: 6, ORB: 7, BOLT: 8, SHARD: 9, SLUG: 10, HOLY: 11, SAW: 12, GAMMA: 13, BEACON: 14, TFRAG: 15, BULLET: 16, GAUSS: 17, SHOCK: 18, PULSE: 19, FLAK: 20, DET: 21, NAIL: 22, GREN: 23, MELEE: 24, SPIKE: 25, MDET: 26, HROCKET: 27, RECALL: 28, PISTOL: 29, SAW_ALT: 30, BULLET_ALT: 31, PULSE_BOLT: 32, SWORD: 33, VOID: 34, HOOK: 35, NOVA: 36 };
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
    { name: "rail slug", life: 0.7,  dmg: 3,    r: 0,      col: "#ffd6a8", carve: 14, shove: 650, sfx: ["rail", 0.6, 1], pierce: true },
    { name: "mine",      life: 30,   dmg: 1.7,  r: MINE_R, col: "#ff6b3c", carve: 50, shove: 0,   sfx: ["mine_drop", 0.6, 1] },
    { name: "plasma",    life: 4.2,  dmg: 1.4,  r: 30,     col: "#6fd8ff", carve: 60, shove: 300, sfx: ["shield_get", 0.6, 1.1] },
    { name: "lightning", life: 0.15, dmg: 0.22, r: 0,      col: "#bfefff", carve: 6,  shove: 0,   sfx: ["laser", 0.2, 1.7] },
    { name: "shard",     life: 0.85, dmg: 0.26,  r: 4,      col: "#ff9a3c", carve: 14, shove: 220, sfx: ["scatter", 0.9, 0.75], bounce: 2 },
    { name: "slug",      life: 0.6,  dmg: 1,    r: 4,      col: "#ffe7a0", carve: 20, shove: 450, sfx: ["scatter", 0.6, 1] },
    { name: "holy bomb", life: 3.6,  dmg: 0,    r: 0,      col: "#fff3b0", carve: 0,  shove: 0,   sfx: ["mine_drop", 0.8, 0.6], inert: true },
    { name: "saw blade", life: 3.2,  dmg: 0.85,  r: 8,      col: "#d6dde8", carve: 12, shove: 180, sfx: ["p_ut_saw_fire", 0.8, 1], bounce: 6 },
    { name: "demonic orb", life: 4,    dmg: 1.35, r: 34,     col: "#7dff8a", carve: 90, shove: 500, sfx: ["shield_get", 0.8, 0.55] },
    { name: "beacon",    life: 15,   dmg: 0,    r: 0,      col: "#8ff0ff", carve: 0,  shove: 0,   sfx: ["mine_drop", 0.5, 1.5], inert: true },
    { name: "telefrag",  life: 0.12, dmg: 99,   r: 40,     col: "#8ff0ff", carve: 0,  shove: 900, sfx: ["rail", 0.6, 1.6] },
    { name: "bullet",    life: 0.5,  dmg: 0.1, r: 0,      col: "#ffe08a", carve: 6,  shove: 30,  sfx: ["fire", 0.3, 1.8] },
    { name: "gauss slug", life: 0.6, dmg: 3,    r: 4,      col: "#7fb8ff", carve: 26, shove: 700, sfx: ["rail", 0.7, 0.8], pierce: true },
    { name: "shock beam", life: 0.25, dmg: 0.75, r: 0,      col: "#c9a4ff", carve: 10, shove: 220, sfx: ["laser", 0.6, 0.55] },
    { name: "laser pulse", life: 0.12, dmg: 0.45, r: 60,    col: "#7df9ff", carve: 12, shove: 950, sfx: ["laser", 0.9, 0.5], pierce: true },
    { name: "flak shell", life: 0.75, dmg: 0.6,  r: 6,      col: "#ff9a3c", carve: 22, shove: 200, sfx: ["scatter", 0.9, 0.6] },
    { name: "detonator",  life: 0.05, dmg: 0,    r: 0,      col: "#7dff8a", carve: 0,  shove: 0,   sfx: ["hit", 0.5, 0.6], inert: true },
    { name: "nail",       life: 1.1,  dmg: 0.13, r: 0,      col: "#cfd6e2", carve: 0,  shove: 60,  sfx: ["fire", 0.4, 2.2] },
    { name: "grenade",    life: 2.5,  dmg: 0.9,  r: 10,     col: "#8fd06a", carve: 46, shove: 300, sfx: ["mine_drop", 0.8, 0.7], bounce: 99 },
    { name: "gauntlet",   life: 0.06, dmg: 0.7, r: 46,     col: "#ffcf5a", carve: 0,  shove: 650, sfx: ["hit", 0.7, 0.7] },
    { name: "spike",      life: 0.9,  dmg: 0.6,  r: 2,      col: "#e8eef8", carve: 0, shove: 400, sfx: ["rail", 0.5, 1.6], pierce: true },
    { name: "mine detonator", life: 0.05, dmg: 0, r: 0,      col: "#ff6b3c", carve: 0,  shove: 0,   sfx: ["hit", 0.5, 0.6], inert: true },
    { name: "homing rocket", life: 3.6, dmg: 1.0,  r: 12,     col: "#ffb43c", carve: 52, shove: 0,   sfx: ["rocket", 0.6, 1] },
    { name: "saw recall", life: 0.05, dmg: 0, r: 0, col: "#6fffe0", carve: 0, shove: 0, sfx: ["dash", 0.5, 1.4], inert: true }
  ];
  // New protocol kinds are appended; existing IDs stay stable.
  SHOTS.push(
    { name: "pistol round", life: 0.3, dmg: 0.3, r: 0, col: "#ffe8a8", carve: 4, shove: 20, sfx: ["p_ut_fire", .7, 1] },
    { name: "explosive disc", life: 1.5, dmg: .75, r: 8, col: "#ff9c50", carve: 30, shove: 250, sfx: ["p_ut_saw_alt", .8, 1] },
    { ...SHOTS[K.BULLET], name: "rapid minigun round", dmg: .08 },
    { name: "pulse plasma", life: 1.05, dmg: .22, r: 7, col: "#a8ff55", carve: 9, shove: 45, sfx: ["p_ut_pulse_fire", .65, 1] },
    // the Blood Blade's swing: everything in the arc ahead of it, each once (pierce), for a moment
    // (the swing lasts its life; the blade, a line from the bin out to its tip, sweeps the arc and cuts what it passes through)
    { name: "blood blade", life: 0.35, dmg: 1.8, r: 20, col: "#ff2a3c", carve: 0, shove: 900, pierce: true, sfx: ["p_melee_hit", 0.9, 0.8] },
    // the void bomb: a slow dark orb that opens a black hole where it bursts
    { name: "void bomb", life: 1.4, dmg: 0, r: 14, col: "#b06bff", carve: 0, shove: 0, sfx: ["rocket", 1, 0.4] },
    // the scatter gun's hook on a chain: it flies, bites into a wall or a bin and hauls its pilot there (hookStep)
    { name: "hook", life: 0.42, dmg: 0, r: 0, col: "#c9d2de", carve: 0, shove: 0, sfx: ["p_metal", 0.6, 1.2], inert: true },
    // the Pulse Gun's Plasma Nova: a charged ball of plasma that lashes everyone near its path with lightning and
    // bursts in a nova where it strikes (its size and bite by its charge: s.m)
    { name: "plasma nova", life: 2.4, dmg: 0, r: 18, col: "#a8ff55", carve: 34, shove: 0, sfx: ["p_nova", 0.8, 1] }
  );
  // weapons: pick-ups swap the fireball for a while. Each gun is described here, and the player and the bots fire it
  // the same way (see volley):
  //   shot: [shot kind, speed]; spread: angles of the shots in one volley; back: fired behind the bin
  //   kick: recoil; feel: [view jolt, screen shake, muzzle flash size]; sfx: [sound, volume, pitch]; fx: extra muzzle effect
  //   alt: the alternate fire (right mouse button / C): the same fields plus cost (ammo) and cd (reload)
  //   guided (alt): you steer the shot; spin: [slowest reload, fastest, seconds to spin up] while the trigger is held;
  //   jitter: random spread (rad); charge: seconds to charge fully while held, it fires on release
  const WEAPONS = {
    // the starting gun: a laser pistol (the Enforcer's damage and pace, a red beam and the pulse gun's sound, pitched up)
    fire:    { name: "Laser pistol", ammo: Infinity, cd: 0.28, col: "#ff3b4e", shot: [K.PISTOL, 6000], jitter: 0.01, kick: 25, feel: [5, 0.05, 40], sfx: ["p_ut_fire", 0.75, 1],
               alt: { name: "Rapid fire", cost: 0, cd: 0.16, mul: 0.6, shot: [K.PISTOL, 6000], jitter: 0.085, kick: 35, feel: [6, 0.06, 45], sfx: ["p_ut_fire", 0.7, 1.4] } },   // (mul: each rapid shot is weaker: a spray up close, not the better gun)
    triple:  { name: "Triple shot", ammo: 20, cd: 0.3, col: "#ffb43c", shot: [K.FIRE, 1000], spread: [-0.2, 0, 0.2], kick: 25, feel: [7, 0.07, 50], sfx: ["triple", 0.7],
               alt: { name: "Focus", cost: 1, cd: 0.3, shot: [K.FIRE, 1050], spread: [-0.035, 0, 0.035], kick: 60, feel: [10, 0.13, 80], sfx: ["triple", 0.8, 0.9] } },
    // Pulse Gun: fast plasma spheres; alt: hold to charge a Plasma Nova, let go to throw it
    laser:   { name: "Pulse Gun", ammo: 80, cd: 0.12, col: "#a8ff55", shot: [K.PULSE_BOLT, 1500], kick: 6, feel: [3, 0.03, 30], sfx: ["p_ut_pulse_fire", .75, 1], fx: "pulse",
               alt: { name: "Plasma Nova", charge: 0.6, nova: true, cost: 5, cd: 0.6, shot: [K.NOVA, 1400], kick: 260, feel: [22, 0.3, 50], sfx: ["p_nova", 1, 1] } },
    // rockets as in Quake: straight and fast (about 2.4x a bin's speed), dodgeable by reading them; alt three slow homing ones
    rocket:  { name: "Rocket launcher", ammo: 8, cd: 0.8, col: "#ff5a6e", shot: [K.ROCKET, 1350], kick: 120, feel: [12, 0.16, 70], sfx: ["rocket", 0.8],
               alt: { name: "Load rockets", load: true, cost: 1, cd: 0.9, shot: [K.ROCKET, 1350], kick: 200, feel: [18, 0.23, 96], sfx: ["rocket", 1, 0.8] } },
    // the void bomb: where it bursts (on whatever it touches, or at the end of its flight) a black hole opens for six
    // seconds, dragging in bins, shots, wrecks, rock and smoke, and eating what reaches it
    void:    { name: "Void Bomb", ammo: 1, cd: 1.2, col: "#b06bff", shot: [K.VOID, 1000], kick: 140, feel: [26, 0.4, 110], sfx: ["rocket", 1, 0.4] },
    nuke:    { name: "Nuke", ammo: 1, cd: 1.0, col: "#ffe14d", shot: [K.NUKE, 360], kick: 160, feel: [30, 0.5, 120], sfx: ["rocket", 1, 0.6],
               alt: { name: "Guided", cost: 1, cd: 1.0, shot: [K.NUKE, 420], kick: 160, feel: [30, 0.5, 120], sfx: ["rocket", 1, 0.5], guided: true } },
    scatter: { name: "Scatter gun", ammo: 12, cd: 0.7, col: "#ffd27a", shot: [K.PELLET, 1250], kick: 260, feel: [22, 0.3, 90], sfx: ["scatter", 1, 0.85], fx: "blast",
               quickAlt: true,   // (the hook has its own cooldown: the gun fires as soon as it lands)
               alt: { name: "Hook", cost: 0, cd: 2.5, shot: [K.HOOK, 2600], kick: 0, feel: [6, 0.1, 0], sfx: ["p_metal", 0.6, 1.3] } },
    // Precision single-shot weapon, with no alternate mode.
    rail: { name: "Railgun", ammo: 5, cd: 1.8, col: "#d9a8ff", shot: [K.RAIL, 4200], kick: 320, feel: [26, 0.35, 90], sfx: ["rail", .9], fx: "rail" },
    // the prox launcher (Quake Team Arena): a mine flies like a grenade, sticks to the first rock or wall it meets,
    // arms, and goes off a beat after an enemy comes near; alt sets off all your mines at once
    mine:    { name: "Prox mines", ammo: 6, cd: 0.7, col: "#ff6b3c", shot: [K.MINE, 760], kick: 60, feel: [6, 0.08, 60], sfx: ["mine_drop", 0.8],
               alt: { name: "Detonate", minedet: true, cost: 0, cd: 0.5, sfx: ["hit", 0.6, 0.6] } },
    // the shock orb: a continuously travelling ball; its alt fire is a beam, and the beam through a ball sets off a combo
    orb:     { name: "Shock orb", ammo: 9, cd: 0.85, col: "#6fd8ff", shot: [K.ORB, 420], kick: 140, feel: [16, 0.18, 110], sfx: ["shield_get", 1, 0.9], fx: "plasma",
               quickAlt: true,   // (its beam has its own cooldown: it fires at once after an orb, to set the orb off)
               alt: { name: "Beam", cost: 1, cd: 0.6, shot: [K.SHOCK, 6400], kick: 70, feel: [8, 0.08, 60], sfx: ["laser", 0.8, 0.55], fx: "shock" } },
    bolt:    { name: "Lightning", ammo: 60, cd: 0.11, col: "#bfefff", shot: [K.BOLT, 5600], kick: 4, feel: [2, 0.03, 35], sfx: ["laser", 0.22, 1.7] },
    holy:    { name: "Holy bomb", ammo: 1, cd: 1.2, col: "#fff3b0", shot: [K.HOLY, 700], kick: 120, feel: [20, 0.3, 110], sfx: ["mine_drop", 1, 0.6] },
    // the Blood Blade: a red energy sword; each press a swing through the arc ahead, cutting whoever is in it
    // (charge: hold to wind it up, let go to strike; a full wind-up, 0.45 s, strikes at full strength)
    saw:     { name: "Blood Blade", ammo: Infinity, cd: 0.75, charge: 0.45, col: "#ff2a3c", shot: [K.SWORD, 300], sword: true, kick: -160, feel: [10, 0.14, 0], sfx: ["dash", 0.7, 1.6] },
    // alt: set your gamma orb off where it is now
    gamma:   { name: "Demonic Orb", ammo: 2, cd: 1.6, col: "#7dff8a", shot: [K.GAMMA, 420], kick: 220, feel: [24, 0.35, 130], sfx: ["shield_get", 1, 0.5], fx: "gamma",
               alt: { name: "Detonate", detonate: true, cost: 0, cd: 0.3, sfx: ["hit", 0.6, 0.6] } },
    tele:    { name: "Teleporter", ammo: 3, cd: 0.35, col: "#8ff0ff", shot: [K.BEACON, 1250], kick: 0, feel: [3, 0.02, 30], sfx: ["mine_drop", 0.7, 1.5] },
    // UT-style accurate primary and faster, less accurate alternative.
    // spin: [time between shots at a standstill, at full speed, seconds to spin up]: it winds up while the trigger is held
    minigun: { name: "Minigun", ammo: 100, cd: 0.09, spin: [0.17, 0.065, 0.85], jitter: 0.025, col: "#ffe08a", shot: [K.BULLET, 2600], kick: 22, feel: [4, 0.05, 42], sfx: ["p_ut_mini_fire", 0.65, 1], fx: "mini",
               alt: { name: "Rapid stream", cost: 1, cd: 0.045, jitter: 0.09, shot: [K.BULLET_ALT, 2600], kick: 16, feel: [3, 0.04, 36], sfx: ["p_ut_mini_alt", .65, 1], fx: "mini" } },
    gauss:   { name: "Charge cannon", ammo: 6, cd: 1.4, charge: 1.1, col: "#7fb8ff", shot: [K.GAUSS, 3600], kick: 300, feel: [24, 0.35, 100], sfx: ["rail", 0.9, 0.75], fx: "rail" },
    // Flak Cannon: eight fragments lose energy after each ricochet.
    // alt: a flak shell that bursts into eight shards all round after a short flight (or on impact)
    // Quake's three: a nailgun (a fan of nails that fly far, alt a piercing spike), a grenade launcher (grenades
    // bounce off rock and go off after 2.5 s or on a bin, alt three at once), and the gauntlet everyone carries
    // (hold fire: the blade spins and tears into a bin it touches; alt: a lunge forward with it)
    nail:    { name: "Nailgun", ammo: 24, cd: 0.55, col: "#cfd6e2", shot: [K.NAIL, 1700], kick: 90, feel: [10, 0.12, 60], sfx: ["fire", 0.6, 1.6],
               alt: { name: "Spike", cost: 2, cd: 1.0, shot: [K.SPIKE, 2600], kick: 200, feel: [16, 0.22, 80], sfx: ["rail", 0.6, 1.6] } },
    gren:    { name: "Grenade launcher", ammo: 8, cd: 0.8, col: "#8fd06a", shot: [K.GREN, 900], kick: 140, feel: [14, 0.18, 80], sfx: ["mine_drop", 0.9, 0.7],
               alt: { name: "Volley", cost: 3, cd: 1.5, shot: [K.GREN, 850], spread: [-0.25, 0, 0.25], kick: 260, feel: [20, 0.28, 100], sfx: ["mine_drop", 1, 0.6] } },
    gauntlet: { name: "Saber", ammo: Infinity, cd: 0.4, col: "#ffcf5a", shot: [K.MELEE, 0], melee: true, kick: 0, feel: [6, 0.1, 0], sfx: ["hit", 0.7, 0.7],
               alt: { name: "Lunge", cost: 0, cd: 0, lunge: true, sfx: ["dash", 0.8] } },
    shard:   { name: "Flak Cannon", ammo: 10, cd: 0.8, col: "#ff9a3c", shot: [K.SHARD, 1500], kick: 340, feel: [28, 0.42, 130], sfx: ["scatter", 1, 0.7], fx: "shard",
               alt: { name: "Flak shell", cost: 1, cd: 0.95, shot: [K.FLAK, 1100], kick: 220, feel: [20, 0.28, 110], sfx: ["scatter", 1, 0.55], fx: "shard" } }
  };
  // Source-based baseline; 100 HP = 3 internal lives. See WEAPON-BALANCE.md.
  const HP = n => n * .03;
  const balanceShot = (kind, props) => Object.assign(SHOTS[kind], props);
  // the rocket launcher's alt, as in UT: the first rocket loads the moment you press, another every ROCKET_LOAD
  // seconds; at three the salvo goes by itself, and letting go fires what is loaded
  const ROCKET_LOAD = 0.7, ROCKET_MAX = 3;
  const rocketsLoaded = (t, carried) => Math.min(ROCKET_MAX, carried, 1 + Math.floor((t + 1e-8) / ROCKET_LOAD));
  balanceShot(K.PISTOL, { dmg: HP(17), col: "#ff3b4e" });
  balanceShot(K.NOVA, { dmg: HP(60) });   // the Plasma Nova's direct hit, by its charge (its burst: SPLASH)   // the laser pistol: red sparks where it lands
  balanceShot(K.ROCKET, { dmg: HP(75) });
  balanceShot(K.PULSE_BOLT, { dmg: HP(24) });
  balanceShot(K.LASER, { dmg: HP(72 * .24 * 1.8) }); // the Pulse Gun's beam, a link beam: half again UT99's, and it heats up held on (LINK_HEAT)
  balanceShot(K.SHARD, { dmg: HP(16), life: 1.15 });
  balanceShot(K.FLAK, { dmg: HP(70), life: .8 });
  balanceShot(K.ORB, { dmg: HP(55), life: 4, r: 16 });
  balanceShot(K.SHOCK, { dmg: HP(40) });
  balanceShot(K.GAMMA, { life: 4.8 });
  WEAPONS.gamma.shot = [K.GAMMA, 340];
  balanceShot(K.SAW, { dmg: HP(30) });
  balanceShot(K.SAW_ALT, { dmg: HP(34) });
  balanceShot(K.BULLET, { dmg: HP(14), life: .5 });
  balanceShot(K.BULLET_ALT, { name: "explosive round", dmg: HP(16), life: 0.9, r: 6, col: "#ff7a2a", carve: 14, shove: 60 });   // bursts where it lands: SPLASH
  balanceShot(K.PELLET, { dmg: HP(12), life: 0.62 });   // real pellets in flight (not hitscan): ~1100 px of reach
  balanceShot(K.SLUG, { dmg: HP(60), life: 1.4 });
  balanceShot(K.GREN, { dmg: HP(100) });
  balanceShot(K.MELEE, { name: "blade touch", dmg: HP(6) });   // the Blood Blade touching a bin when it isn't swung (bladeTouch)
  balanceShot(K.MINE, { dmg: HP(100) });
  Object.assign(WEAPONS.fire, { cd: .4 }); Object.assign(WEAPONS.fire.alt, { cd: .2 });
  Object.assign(WEAPONS.laser, { cd: .16, shot: [K.PULSE_BOLT, 2400] });
  // the link beam heats as it is held on: its damage climbs to LINK_HEAT times over a second of steady fire, and falls
  // back the moment it lets go
  // (now: from LINK_MIN at the first tick up to LINK_HEAT over LINK_RAMP s; the gun overheats after about 3 s of it)
  const LINK_MIN = 0.6, LINK_HEAT = 1.8, LINK_RAMP = 2.5, linkHeatOf = held => LINK_MIN + (LINK_HEAT - LINK_MIN) * Math.min(1, held / LINK_RAMP);
  Object.assign(WEAPONS.rocket, { shot: [K.ROCKET, 1260] }); WEAPONS.rocket.alt.shot = [K.ROCKET, 1260];
  Object.assign(WEAPONS.orb, { shot: [K.ORB, 650] });
  Object.assign(WEAPONS.shard, { shot: [K.SHARD, 3500] }); WEAPONS.shard.alt.shot = [K.FLAK, 1050];
  // (the saw's slot is the Blood Blade now: its swing is set where it is defined)
  // its pace is set by spin: slow at first, winding up over 2.2 s of held fire to a roar (the sound rises with it)
  Object.assign(WEAPONS.minigun, { cd: .1, jitter: .03375, shot: [K.BULLET, 6000], spin: [0.2, 0.05, 2.2] });
  // alt: explosive incendiary rounds, slower and heavier, each bursting into a small blast of fire where it lands
  Object.assign(WEAPONS.minigun.alt, { name: "Explosive rounds", cost: 2, cd: .22, jitter: .02, kick: 40, feel: [6, 0.06, 60], shot: [K.BULLET_ALT, 2200] });
  Object.assign(WEAPONS.scatter, { cd: 0.85, shot: [K.PELLET, 1800] });
  balanceShot(K.RAIL, { dmg: HP(100) });   // Quake 3's railgun: 100
  WEAPONS.rail.cd = 1.8; WEAPONS.gren.shot = [K.GREN, 1225];
  WEAPONS.gauntlet.cd = .4; WEAPONS.mine.cd = .8;
  WEAPONS.nuke.shot = [K.NUKE, 840]; WEAPONS.nuke.alt.shot = [K.NUKE, 840];
  WEAPONS.nail.disabled = true; // keep wire IDs and other weapons' number keys stable
  WEAPONS.tele.disabled = true; // the teleporter is retired (nobody used it); its wire number stays
  let PICKS = 0;   // weapon spots on this arena (see 01b-arenas.js)
  // blasts that hurt everyone around them (besides whoever took the direct hit): [radius, most damage at the
  // centre, least at the rim (in lives), push]
  const SPLASH = { [K.BULLET_ALT]: [100, HP(24), 0, 170], [K.FLAK]: [210, HP(70), 0, 400], [K.SAW_ALT]: [252, HP(34), 0, 350], [K.MINE]: [262, HP(100), 0, 450], [K.HROCKET]: [308, HP(75), 0, 320], [K.GREN]: [262, HP(100), 0, 420], [K.ROCKET]: [308, HP(75), 0, 320], [K.ORB]: [98, HP(55), 0, 380], [K.GAMMA]: [330, HP(140), HP(25), 800], [K.NOVA]: [300, HP(150), 0, 900] };   // (Plasma Nova: a full one kills a bin at its heart)
  const GAMMA_ZAP = { r: 280, every: 0.45, dmg: HP(6) };
  const NOVA_ZAP = { r: 260, every: 0.12, dmg: HP(12) };   // the nova lashes every enemy this close to its path, by its charge   // the gamma orb zaps every enemy this close as it flies
  const DMG_UNIT = 0.35;   // one fireball: planets and UFOs count damage in fireballs
  // a station's inner wall gives only to heavy weapons (a crater of WALL_CARVE or more: rockets, grenades, mines, the
  // orbs, the charged rail and gauss), and then WALL_GIVE times more than rock does; the hull never
  const WALL_CARVE = 24, WALL_GIVE = 1.5, RAIL_DRILL = 60;   // RAIL_DRILL: how far a rail slug bores into a wall per shot
  const BOOST_PADS = false;   // the speed pads on the maps: taken off (their spots stay, kept clear, should they come back)
  const AMP_PERIOD = 95, AMP_TIME = 20000, QUAD = 4;         // Quad damage: a rare pick-up, four times the damage for 20 s                        // mines go off when a bin comes this close, after arming
  // UT99 pickups: ordinary health caps at 100; super health at 199.
  const SUPPLIES = {
    med: { name: "Health Pack +20", col: "#ff5a6e", heal: HP(20), cap: HP(100), period: 20, icon: "cross" },
    vial: { name: "Health Vial +5", col: "#6ddcff", heal: HP(5), cap: HP(199), period: 30, icon: "cross" },
    bigmed: { name: "Big Keg +100", col: "#ff2d55", heal: HP(100), cap: HP(199), period: 100, icon: "cross", big: true },
    pads: { name: "Thigh Pads · 50", col: "#8fc6ff", armor: HP(50), layer: "padsArmor", period: 30, icon: "shield" },
    shield: { name: "Body Armor · 100", col: "#4fe39a", armor: HP(100), layer: "bodyArmor", period: 30, icon: "shield" },
    mega: { name: "Shield Belt · 150", col: "#ffd85e", armor: HP(150), layer: "beltArmor", period: 60, icon: "shield", big: true }
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
  const SANDBOX_GUNS = ["fire", "minigun", "scatter", "shard", "gren", "rocket", "laser", "orb", "rail", "saw", "mine", "gamma", "nuke", "holy", "void"];   // (saw: the Blood Blade)
  const modeOf = code => MODES[codeOpts(code).mode] ? codeOpts(code).mode : "d";
  // match settings: round length (minutes) and a score that ends the round early (kills, or flags in CTF)
  const TIME_OPTS = { 2: 3, 3: 5, 4: 8, 5: 10, 6: 15 }, TIME_DEFAULT = "3";
  const SCORE_OPTS = { 2: [10, 3], 3: [20, 5], 4: [30, 10] };   // [kills, flags]
  const timeOf = code => TIME_OPTS[codeOpts(code).time] ? codeOpts(code).time : TIME_DEFAULT;
  const scoreOf = code => SCORE_OPTS[codeOpts(code).score] ? codeOpts(code).score : "";
  const scoreLimit = code => { const s = scoreOf(code); return s ? SCORE_OPTS[s][MODES[modeOf(code)].flags ? 1 : 0] : 0; };
  let MODE = "d";
  const TEAM_NAME = ["Red", "Blue"], TEAM_HEX = ["#ff5a6e", "#4fa8ff"], TEAM_RGB = ["255,90,110", "79,168,255"];
  const WEAPON_KEYS = ["fire", "triple", "laser", "rocket", "nuke", "scatter", "rail", "mine", "orb", "bolt", "shard", "holy", "saw", "gamma", "tele", "minigun", "gauss", "nail", "gren", "gauntlet", "void"];
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
  const SUPPLY_PERIOD = 20, MAX_SHIELD = 4.5, ARMOR_SOAK = 0.75; let SUPPLY_SLOTS = 0;
  // the big bombs: one huge blast each. Inside kill nothing survives; out to R the damage falls from 4 to 1.5 lives.
  // The holy bomb is thrown, bounces, sings a choir sing seconds before its fuse runs out, then outdoes the nuke
  const BOOM_LIFE = 4;
  // big-bomb crates, each on its own spot: once taken, it comes back at the start of its next cycle (s)
  const BOMB_CRATES = { nuke: { key: "N", period: 70 }, holy: { key: "H", period: 60 }, void: { key: "V", period: 80 } };
  // wave: [reach, seconds to get there, push at the centre] of the blast wave that flings everything outward
  // edge: past R, out to where its shock wave ends (wave[0]), the nuke still hurts, from this much down to nothing:
  // what is seen inside the blast is felt
  const BOMBS = { [K.VOID]: { R: 320, kill: 0, damage: HP(40), carve: 120, wave: [700, 0.6, -900], void: true }, [K.NUKE]: { R: 1100, kill: 0, damage: HP(1000), edge: HP(45), carve: 420, wave: [2800, 1.3, 4200] },
                  [K.HOLY]: { R: 2000, kill: 1300, carve: 700, wave: [3600, 1.5, 3000], sing: 2.55, holy: true, wipe: true } };   // sing: the holy bomb's sound (2.53 s) starts so it ends with the blast   // wipe: bodies inside kill are erased whole
  const bombReach = bm => bm.edge ? bm.wave[0] : bm.R;
  const bombDmg = (bm, d) => bm.damage ? (d <= bm.R ? Math.max(bm.damage * (1 - d / bm.R), bm.edge || 0) : bm.edge ? bm.edge * Math.max(0, 1 - (d - bm.R) / (bm.wave[0] - bm.R)) : 0)
    : d < bm.kill ? 99 : 1.5 + 2.5 * (1 - (d - bm.kill) / (bm.R - bm.kill));
  // weapon icons (24x24 SVG path data, even-odd fill): used on crates (canvas) and in the HUD (SVG)
  const ICONS = {
    fire: "M2 6h19v6h-9v3H9l-2 6H2l3-9H2ZM13 12v2h-2v-2Z",
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
    amp: "M12 0l2 3.3a8.8 8.8 0 0 1 6.7 6.7L24 12l-3.3 2a8.8 8.8 0 0 1-6.7 6.7L12 24l-2-3.3A8.8 8.8 0 0 1 3.3 14L0 12l3.3-2A8.8 8.8 0 0 1 10 3.3ZM13.4 7.5h-1.9L8 13v1.7h4.1V17h1.8v-2.3h1.4v-1.6h-1.4ZM12.1 10v3.1H10Z",   // Quad damage: a spiked sphere with a 4
    shield: "M12 2l8 3v6c0 5.2-3.4 9.4-8 11-4.6-1.6-8-5.8-8-11V5z",
    nuke: "M14.10 8.36L17.25 2.91A10.5 10.5 0 0 0 6.75 2.91L9.90 8.36A4.2 4.2 0 0 1 14.10 8.36ZM7.80 12.00L1.50 12.00A10.5 10.5 0 0 0 6.75 21.09L9.90 15.64A4.2 4.2 0 0 1 7.80 12.00ZM14.10 15.64L17.25 21.09A10.5 10.5 0 0 0 22.50 12.00L16.20 12.00A4.2 4.2 0 0 1 14.10 15.64ZM12 9.8a2.2 2.2 0 1 0 0.01 0Z",
    holy: "M12 10a6.5 6.5 0 1 0 0.01 0ZM12 1C6.5 1 3.5 2.4 3.5 4.2S6.5 7.4 12 7.4s8.5-1.4 8.5-3.2S17.5 1 12 1Zm0 1.7c4 0 6.4.8 6.4 1.5S16 5.7 12 5.7 5.6 4.9 5.6 4.2 8 2.7 12 2.7Z",
    void: "M12 2a10 10 0 1 0 .01 0ZM12 6a6 6 0 1 1-.01 0ZM12 9a3 3 0 1 0 .01 0Z",
    saw: "M20.5 1.5l2 2-11 12.5-3.5.5.5-3.5ZM7.5 14l2.5 2.5-1.5 1.5 3 3-1.5 1.5-3-3-2 2-1.5-1.5 2-2-3-3L4 13.5l3 3Z",   // the Blood Blade (the saw's old slot)
    gamma: "M12 2a10 10 0 1 0 .01 0ZM12 5l-3 5 3 2-4 6 8-6-3-2 3-5Z",
    tele: "M12 2a10 10 0 1 0 0.01 0ZM12 5a7 7 0 1 0 0.01 0ZM12 9.4a2.6 2.6 0 1 0 0.01 0Z",
    minigun: "M2 9h7v7H2ZM4 16h3v4H4ZM9 10h1v5H9ZM10 8.5h12v2H10ZM10 11.5h12v2H10ZM10 14.5h12v2H10Z",
    gauss: "M2 10.5h4v3H2ZM8.5 10.5h2v3h-2ZM13 10.5h2v3h-2ZM17.5 10.5H22v3h-4.5ZM6 7h2.5v10H6ZM10.5 7H13v10h-2.5ZM15 7h2.5v10H15Z",
    nail: "M2 9h10v7H2ZM5 16h3v4H5ZM6 4h4v5H6ZM12 10.5h6v4h-6ZM18 12h3l1.5.5-1.5.5h-3Z",
    gren: "M2 10h7v6H2ZM4 16h3v4H4ZM13.5 7.5a4.5 4.5 0 1 0 0.01 0ZM18 10.5h4v3h-4Z",
    gauntlet: "M20 2.5l1.5 1.5-11.2 11.2-1.5-1.5ZM8.3 14.7l1.5 1.5-1.6 1.6 1 1-1.4 1.4-1-1-2.6 2.6-1.4-1.4 2.6-2.6-1-1 1.4-1.4 1 1Z"   // the Saber
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
  // the bin's hull, detailed: drawn once onto the art in the hull's own colours (darker and lighter teal), so the
  // look's recolouring still finds and tints it. In the art's pixels (320 x 320, the bin seen three-quarter on)
  function detailBin(q) {
    const face = (ox, oy, ux, uy, vx, vy) => q.setTransform(ux, uy, vx, vy, ox, oy);   // a face of the hull: (0,0)-(1,1) across it
    const dark = a => `rgba(8,72,74,${a})`, lite = a => `rgba(190,255,246,${a})`;
    q.save();
    // the front: corner ribs pressed in down both edges, a band under the lid with two hinge knuckles, bolts
    face(80, 77, 138, 19, -15, 73);
    q.lineCap = "round";
    for (const u of [0.07, 0.13, 0.87, 0.93]) {
      q.lineWidth = 0.022; q.strokeStyle = dark(0.45); q.beginPath(); q.moveTo(u, 0.16); q.lineTo(u, 0.9); q.stroke();
      q.lineWidth = 0.012; q.strokeStyle = lite(0.35); q.beginPath(); q.moveTo(u + 0.016, 0.17); q.lineTo(u + 0.016, 0.9); q.stroke();
    }
    q.fillStyle = dark(0.38); q.fillRect(0.02, 0.0, 0.96, 0.075);
    q.fillStyle = lite(0.3); q.fillRect(0.02, 0.075, 0.96, 0.018);
    for (const u of [0.22, 0.72]) {
      q.fillStyle = dark(0.55); q.beginPath(); q.roundRect(u, -0.01, 0.07, 0.1, 0.02); q.fill();
      q.fillStyle = lite(0.45); q.beginPath(); q.roundRect(u + 0.008, 0.0, 0.054, 0.025, 0.01); q.fill();
    }
    for (const [u, v] of [[0.035, 0.14], [0.965, 0.14], [0.035, 0.93], [0.965, 0.93]]) {
      q.fillStyle = dark(0.6); q.beginPath(); q.arc(u, v, 0.022, 0, 6.283); q.fill();
      q.fillStyle = lite(0.6); q.beginPath(); q.arc(u - 0.006, v - 0.008, 0.009, 0, 6.283); q.fill();
    }
    // the right side: three vent slits
    face(220, 92, 26, -6, -3, 66);
    for (const v of [0.3, 0.45, 0.6]) {
      q.fillStyle = dark(0.6); q.beginPath(); q.roundRect(0.18, v, 0.64, 0.07, 0.03); q.fill();
      q.fillStyle = lite(0.35); q.fillRect(0.2, v + 0.07, 0.6, 0.02);
    }
    // the rim round the nozzle, front: a plate with the recycling arrows embossed
    face(64, 150, 152, 16, -1, 22);
    q.fillStyle = dark(0.3); q.beginPath(); q.roundRect(0.38, 0.12, 0.24, 0.76, 0.07); q.fill();
    q.translate(0.5, 0.5); q.scale(1, 152 / 22 * 0.13); q.lineWidth = 0.026; q.strokeStyle = lite(0.8);
    for (let k = 0; k < 3; k++) {   // three chasing arrows
      const a0 = k * 2.094 - 1.4, a1 = a0 + 1.5, r = 0.075;
      q.beginPath(); q.arc(0, 0, r, a0, a1); q.stroke();
      const ex = Math.cos(a1) * r, ey = Math.sin(a1) * r, tx = -Math.sin(a1), ty = Math.cos(a1);
      q.fillStyle = lite(0.75); q.beginPath(); q.moveTo(ex + tx * 0.025, ey + ty * 0.025); q.lineTo(ex - ty * 0.02, ey + tx * 0.02); q.lineTo(ex + ty * 0.02, ey - tx * 0.02); q.fill();
    }
    q.restore();
  }
  // the art with its painted flame removed: our animated fire is drawn behind it from the nozzle
  let body = null;
  img.onload = () => {
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const cx2 = c.getContext("2d", { willReadFrequently: true }); cx2.drawImage(img, 0, 0);
    const d = cx2.getImageData(0, 0, c.width, c.height), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], gg = px[i + 1], b = px[i + 2];
      if (r > 150 && r - b > 70 && r >= gg) px[i + 3] = 0;
    }
    cx2.putImageData(d, 0, 0);
    const k = document.createElement("canvas"); k.width = c.width; k.height = c.height;   // the hull's detail, laid only where the hull is
    try { detailBin(k.getContext("2d")); cx2.globalCompositeOperation = "source-atop"; cx2.drawImage(k, 0, 0); cx2.globalCompositeOperation = "source-over"; } catch {}   // (an old browser: the plain art)
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

