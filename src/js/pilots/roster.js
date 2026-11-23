  // ---------- bots (simulated here, broadcast like real pilots) ----------
  const MAX_BOTS = 24;
  const BOT_NAMES = ["Rusty", "Bolt", "Zappy", "Clank", "Nova", "Sprocket", "Dusty", "Orbit", "Razor", "Vex", "Scrap", "Fury", "Nail", "Cinder", "Hex", "Rivet", "Grinder", "Rook", "Torque", "Wraith", "Flint", "Rattle", "Havoc", "Slag"];
  const BOT_LEVELS = { easy: { aim: 0.26, cd: 0.7, speed: 0.75, label: "Easy" }, normal: { aim: 0.13, cd: 0.45, speed: 0.9, label: "Normal" }, hard: { aim: 0.05, cd: 0.3, speed: 1, label: "Hard" } };
  const bots = [], botById = new Map(), botCredited = new Set();
  function addBots(n, level) {
    n = Math.max(0, Math.min(MAX_BOTS - bots.length, Math.floor(Number(n) || 0)));
    if (!BOT_LEVELS[level]) level = "normal";
    const L = BOT_LEVELS[level];
    for (let i = 0; i < n; i++) {
      const id = "pb" + Math.random().toString(36).slice(2, 8);
      const b = { id, tag: "b" + Math.random().toString(36).slice(2, 7), name: BOT_NAMES[(bots.length) % BOT_NAMES.length] + " (bot)", L, level,
        hue: Math.floor(Math.random() * 360), ck: [Math.floor(Math.random() * 7), Math.floor(Math.random() * 6), Math.floor(Math.random() * 5), Math.floor(Math.random() * 5), Math.floor(Math.random() * 6), Math.random() < 0.4 ? 1 + Math.floor(Math.random() * 6) : 0, 0],
        ...spawnPoint(), vx: 0, vy: 0, a: Math.random() * 6.28, lives: LIVES, dead: false, respawnAt: 0, inv: 0, ds: 0,
        fireCd: 1 + Math.random(), side: Math.random() < 0.5 ? 1 : -1, wander: Math.random() * 6.28, seq: 0, q: 0,
        weapon: "fire", shotLog: [], hitBy: [], koBy: [], st: { kills: 0, deaths: 0, shots: 0, hits: 0, streak: 0, best: 0 } };
      bots.push(b); botById.set(id, b);
      if (isTeams()) joinTeam(b);
    }
  }
  // a pilot flown from outside, like a player on the authoritative server: a bot whose stick, aim and triggers
  // come from b.input instead of the AI, judged by exactly the same rules (see server/sim)
  //   input: { mx, my: the stick (-1..1), aim: radians, fire, boost: booleans, dash: a counter, +1 per dash }
  // A full arena makes room by retiring an AI bot; with only players left there is no room (null).
  // look: { ck, hue } the player chose (their screen sends it with the join), so everyone sees the bin they picked
  function addPilot(name, look = {}) {
    if (bots.length >= MAX_BOTS) {
      const ai = bots.findLast(b => !b.input);
      if (!ai) return null;
      removePilot(ai.id);
    }
    const before = bots.length;
    addBots(1, "hard");
    if (bots.length === before) return null;
    const b = bots[bots.length - 1];
    b.name = String(name || "Pilot").slice(0, 14); b.input = { mx: 0, my: 0, aim: b.a, fire: false, alt: false, boost: false, brake: false, dash: 0, w: -1, s: 0 }; b.ackSeq = 0; b.energy = 100; b.dashDone = 0; b.fireCd = 0;   // a bot's opening pause is not for players
    if (Array.isArray(look.ck)) b.ck = cleanCustom(look.ck);
    if (Number.isFinite(look.hue)) b.hue = Math.floor(look.hue) % 360;
    pilotArm(b);
    return b;
  }
  function removePilot(id) {
    const i = bots.findIndex(b => b.id === id);
    if (i >= 0) bots.splice(i, 1);
    botById.delete(id); remotes.delete(id);
  }
  function creditBots(list, ko, victim = "me") {
    for (const k of list) {
      if (typeof k !== "string") continue;
      const key = (ko ? "ko" : "") + victim + ":" + k;
      if (botCredited.has(key) || botCredited.size >= MAX_CREDITS) continue;
      for (const b of bots) if (b.id !== victim && k.startsWith(b.tag + ".")) {
        botCredited.add(key);
        if (ko) { b.st.kills++; b.st.streak++; b.st.best = Math.max(b.st.best, b.st.streak); if (!b.input && Math.random() < 0.3) emote(b, Math.random() < 0.5 ? 0 : 1, performance.now()); } else b.st.hits++;   // (a bot sometimes says GG, or wiggles)
      }
    }
  }
  // past: a player's hitscan shot judged where the bot was when they fired (lag compensation): its invulnerability
  // then was checked there (targetHit); one it gained since (a dash) does not take the hit back
  function botHurt(b, dmg, shotId, now, force, kind = -1, ang = 0, past = false) {
    if (b.dead || (!force && !past && now < b.inv) || !roundLive) return;
    const absorbed = force ? 0 : absorbArmor(b, dmg);
    dmg -= absorbed;
    if (!shotId.startsWith(b.tag + ".")) metricDamage(shotId, absorbed + Math.min(b.lives, dmg), b.lives <= dmg);
    b.lives = Math.round((b.lives - dmg) * 1000) / 1000;
    if (!b.input) spinKick(b, dmg, ang, now);   // (a player's nose is their screen's to throw: it does, from the snapshot)
    if (!b.input && Math.random() < ({ easy: 0.15, normal: 0.35, hard: 0.6 })[b.level]) b.dashReq = true;   // an AI bot dodges when hit (a player dashes when they choose)
    const shown = remotes.get(b.id); if (shown) shown.hitAt = performance.now();
    const byHole = shotId === "x" || shotId === "p";   // the black hole or a planet: nobody gets credit
    if (!byHole) pushCapped(b.hitBy, shotId, 12);
    if (b.lives <= 0) {
      if (b.weapon !== "fire" && !MODES[MODE].only) dropGun(b.x, b.y, b.weapon, b.input ? b.arsenal[b.weapon] : b.ammo);   // its trophy
      b.dead = true; b.respawnAt = now + respawnDelay(); b.fc = -1; b.weapon = "fire"; b.ampUntil = 0;
      if (b.input) pilotArm(b);   // a player starts again with the laser pistol
      b.ds = deathPiecesOf(kind); b.dk = deathStyleOf(kind); b.da = ang;
      b.st.deaths++; b.st.streak = 0;
      if (byHole) feedPush(`<span class="v">${esc(b.name)}</span> ${shotId === "p" ? "crashed into a planet" : "was swallowed by the black hole"}`);
      else pushCapped(b.koBy, shotId, 12);
    }
  }
  // what a bot shoots with: the mode's gun, or a gun from a crate it grabbed (mines are left for players)
  const botWeapon = b => MODES[MODE].only || b.weapon;
  // how far a bot shoots from: most guns within 950; a big bomb only at a target beyond its own blast (so it lives)
  function botInRange(b, td) {
    const w = botWeapon(b);
    if (w === "nuke") return td > 1200 && td < 2600;
    if (w === "holy") return td > 2100 && td < 3200;
    if (w === "void") return td > 1600 && td < 2600;   // (well clear of the hole it opens)
    if (WEAPONS[w]?.sword) return td < 230;   // (a blade: only at arm's length)
    return td < 950;
  }
  // fires once; returns the gun's reload time
  // a bot's second mode, where it is simple and worth it: [nearest, furthest] it is used at (a grenade volley and a
  // flak shell at middle range, explosive rounds and rapid fire close, the Blood Blade's lunge as it closes in, the big
  // bombs' short throw at a near target). Its cooldown, or 0 when it is not the moment
  const ALT_BAND = { fire: [0, 700], minigun: [0, 600], gren: [400, 1100], shard: [500, 1100], saw: [140, 360], holy: [800, 1700], void: [400, 1000] };
  const ALT_CHANCE = { easy: 0.15, normal: 0.35, hard: 0.6 };
  function botAlt(b, now, td) {
    const w = botWeapon(b), band = ALT_BAND[w], pat = WEAPONS[w].alt;
    if (!band || !pat || !pat.shot || td < band[0] || td > band[1] || Math.random() > ALT_CHANCE[b.level]) return 0;
    if (w !== "fire" && w !== "saw" && !MODES[MODE].only && (b.ammo || 0) < (pat.cost || 1)) return 0;
    volley(b, now, pat, muzzleOf(b, w));
    shotSound(pat.shot[0], b.x, b.y, b.id);
    if (w !== "fire" && w !== "saw" && !MODES[MODE].only && (b.ammo -= pat.cost || 1) <= 0) b.weapon = "fire";
    return pat.cd || WEAPONS[w].cd;
  }
  // a bot sets its Demonic Orb off when an enemy is near it (the orb's own alt)
  function botDetonate(b, now) {
    const o = shots.find(s => s.owner === b.id && s.kind === K.GAMMA && s.life > 0 && !s.boom);
    if (!o) return;
    const near = q => q && !q.dead && !mates(q, b) && Math.hypot(q.x - o.x, q.y - o.y) < 190;
    if ((playing && near(me)) || [...remotes].some(([id, r]) => id !== b.id && near(r))) volley(b, now, DETONATOR, { x: o.x, y: o.y });
  }
  function botFire(b, now, mul = 1) {
    const w = botWeapon(b), pat = WEAPONS[w];
    if (w === "gamma" && shots.some(s => s.owner === b.id && s.kind === K.GAMMA && s.life > 0 && !s.boom)) return .3;
    const gun = muzzleOf(b, w), s = volley(b, now, pat, gun, undefined, mul);   // from its gun's tip
    if (w === "orb") b.orb = s;   // a bot can set its orb off with the beam (see updateBots)
    shotSound(pat.shot[0], b.x, b.y, b.id);
    b.vx -= Math.cos(b.a) * 25; b.vy -= Math.sin(b.a) * 25;
    if (!MODES[MODE].only && w !== "fire" && --b.ammo <= 0) b.weapon = "fire";
    return pat.cd;   // twin fireballs reload a little slower
  }
