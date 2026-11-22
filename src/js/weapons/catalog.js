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
    holy:    { name: "Holy bomb", ammo: 1, cd: 1.2, col: "#fff3b0", shot: [K.HOLY, 700], kick: 120, feel: [20, 0.3, 110], sfx: ["mine_drop", 1, 0.6] },
    // the Blood Blade: a red energy sword; each press a swing through the arc ahead, cutting whoever is in it
    // (charge: hold to wind it up, let go to strike; a full wind-up, 0.45 s, strikes at full strength)
    saw:     { name: "Blood Blade", ammo: Infinity, cd: 0.75, charge: 0.45, col: "#ff2a3c", shot: [K.SWORD, 300], sword: true, kick: -160, feel: [10, 0.14, 0], sfx: ["dash", 0.7, 1.6] },
    // alt: set your gamma orb off where it is now
    gamma:   { name: "Demonic Orb", ammo: 2, cd: 1.6, col: "#7dff8a", shot: [K.GAMMA, 420], kick: 220, feel: [24, 0.35, 130], sfx: ["shield_get", 1, 0.5], fx: "gamma",
               alt: { name: "Detonate", detonate: true, cost: 0, cd: 0.3, sfx: ["hit", 0.6, 0.6] } },
    // UT-style accurate primary and faster, less accurate alternative.
    // spin: [time between shots at a standstill, at full speed, seconds to spin up]: it winds up while the trigger is held
    minigun: { name: "Minigun", ammo: 100, cd: 0.09, spin: [0.17, 0.065, 0.85], jitter: 0.025, col: "#ffe08a", shot: [K.BULLET, 2600], kick: 22, feel: [4, 0.05, 42], sfx: ["p_ut_mini_fire", 0.65, 1], fx: "mini",
               alt: { name: "Rapid stream", cost: 1, cd: 0.045, jitter: 0.09, shot: [K.BULLET_ALT, 2600], kick: 16, feel: [3, 0.04, 36], sfx: ["p_ut_mini_alt", .65, 1], fx: "mini" } },
    // Flak Cannon: eight fragments lose energy after each ricochet.
    // alt: a flak shell that bursts into eight shards all round after a short flight (or on impact)
    // the grenade launcher: grenades bounce off rock and go off after 2.5 s or on a bin; alt three at once
    gren:    { name: "Grenade launcher", ammo: 8, cd: 0.8, col: "#8fd06a", shot: [K.GREN, 900], kick: 140, feel: [14, 0.18, 80], sfx: ["mine_drop", 0.9, 0.7],
               alt: { name: "Volley", cost: 3, cd: 1.5, shot: [K.GREN, 850], spread: [-0.25, 0, 0.25], kick: 260, feel: [20, 0.28, 100], sfx: ["mine_drop", 1, 0.6] } },
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
  balanceShot(K.SHARD, { dmg: HP(16), life: 1.15 });
  balanceShot(K.FLAK, { dmg: HP(70), life: .8 });
  balanceShot(K.ORB, { dmg: HP(55), life: 4, r: 16 });
  balanceShot(K.SHOCK, { dmg: HP(40) });
  balanceShot(K.GAMMA, { life: 4.8 });
  WEAPONS.gamma.shot = [K.GAMMA, 340];
  balanceShot(K.BULLET, { dmg: HP(14), life: .5 });
  balanceShot(K.BULLET_ALT, { name: "explosive round", dmg: HP(16), life: 0.9, r: 6, col: "#ff7a2a", carve: 14, shove: 60 });   // bursts where it lands: SPLASH
  balanceShot(K.PELLET, { dmg: HP(12), life: 0.62 });   // real pellets in flight (not hitscan): ~1100 px of reach
  balanceShot(K.GREN, { dmg: HP(100) });
  balanceShot(K.MELEE, { name: "blade touch", dmg: HP(6) });   // the Blood Blade touching a bin when it isn't swung (bladeTouch)
  balanceShot(K.MINE, { dmg: HP(100) });
  Object.assign(WEAPONS.fire, { cd: .4 }); Object.assign(WEAPONS.fire.alt, { cd: .2 });
  Object.assign(WEAPONS.laser, { cd: .16, shot: [K.PULSE_BOLT, 2400] });
  const LINK_MIN = 0.6, LINK_HEAT = 1.8;   // how hot a beam is drawn (render: its colour runs from cool to hot over this range of its strength)
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
  WEAPONS.mine.cd = .8;
  WEAPONS.nuke.shot = [K.NUKE, 840]; WEAPONS.nuke.alt.shot = [K.NUKE, 840];
  // Retired guns (triple, bolt, tele, gauss, nail, gauntlet) are gone from WEAPONS: only their names stay, in
  // WEAPON_KEYS (their numbers on the wire), so WEAPONS[k] alone says whether k is a gun of the game
  // the shot kinds a peer may send: what the guns fire (either mode), the Blood Blade's touch and the two detonators.
  // Anything else (a retired gun's shots, kinds no gun makes any more) is refused on arrival
  const WIRE_SHOTS = new Set([K.MELEE, K.DET, K.MDET, ...Object.values(WEAPONS).flatMap(w => [w.shot, w.alt?.shot]).filter(Boolean).map(s => s[0])]);
  let PICKS = 0;   // weapon spots on this arena (see 01b-arenas.js)
  // blasts that hurt everyone around them (besides whoever took the direct hit): [radius, most damage at the
  // centre, least at the rim (in lives), push]
  const SPLASH = { [K.BULLET_ALT]: [100, HP(24), 0, 170], [K.FLAK]: [210, HP(70), 0, 400], [K.MINE]: [262, HP(100), 0, 450], [K.GREN]: [262, HP(100), 0, 420], [K.ROCKET]: [308, HP(75), 0, 320], [K.ORB]: [98, HP(55), 0, 380], [K.GAMMA]: [330, HP(140), HP(25), 800], [K.NOVA]: [300, HP(150), 0, 900] };   // (Plasma Nova: a full one kills a bin at its heart)
  const GAMMA_ZAP = { r: 280, every: 0.45, dmg: HP(6) };
  const NOVA_ZAP = { r: 260, every: 0.12, dmg: HP(12) };   // the nova lashes every enemy this close to its path, by its charge   // the gamma orb zaps every enemy this close as it flies
  const DMG_UNIT = 0.35;   // one fireball: planets and UFOs count damage in fireballs
  // a station's inner wall gives only to heavy weapons (a crater of WALL_CARVE or more: rockets, grenades, mines, the
  // orbs, the charged rail and gauss), and then WALL_GIVE times more than rock does; the hull never
  const WALL_CARVE = 24, WALL_GIVE = 1.5, RAIL_DRILL = 60;   // RAIL_DRILL: how far a rail slug bores into a wall per shot
  const BOOST_PADS = false;   // the speed pads on the maps: taken off (their spots stay, kept clear, should they come back)
  const AMP_PERIOD = 95, AMP_TIME = 20000, QUAD = 4;         // Quad damage: a rare pick-up, four times the damage for 20 s                        // mines go off when a bin comes this close, after arming
