  // ---------- fire & damage ----------
  // shots leave from the tip of the gun drawn on the wing (left and right in turn), not from the middle of the bin
  const mountsOf = w => w === "laser" ? [[160, 96]] : ["nuke", "holy", "void", "gamma", "saw"].includes(w) ? [[256, 150]] : [[50, 126], [256, 150]];   // (the pistols: one in each hand, fired in turn)   // the laser: one emitter, on the nose   // art pixels, shared with drawMounts
  const BARREL = { fire: 44, laser: 60, rocket: 50, nuke: 96, holy: 30, saw: 40, gamma: 44, minigun: 58, scatter: 42, rail: 86, mine: -10, orb: 40, shard: 48, gren: 44 };   // tip, in mount units
  // the tip of a pilot's gun (any pilot: me, a bot, a player's pilot on the server, which fires from the same tips),
  // the wing guns taking turns (p.gunSide). A player's shot fired by a flight command takes its hand from that
  // command's number (jk) and the gun's cooldown, which the screen and the server both know: counted shot by shot,
  // one shot fired on one side only (a refused trigger, a round's start) swapped the hands for good, and the server
  // then missed what the screen showed hitting with the other hand's edge
  function muzzleOf(p, weapon) {
    const jk = p === me ? (serverRun ? srv.jk : undefined) : p.jk, cd = p === me ? fireCd : p.fireCd;
    const side = Number.isSafeInteger(jk) && cd > 0 ? Math.floor(jk / Math.max(1, Math.round(cd / CMD_DT))) : (p.gunSide = (p.gunSide || 0) + 1);
    const ms = mountsOf(weapon), [mx, my] = ms[side % ms.length];
    const S = BOT * sizeOf(p.lv || 1), t = (BARREL[weapon] ?? 44) * S / 320 * 1.35, R = p.a + Math.PI / 2 - SPRITE_TILT;
    // sprite frame: the mount, then along its tilted barrel; then into the world the way drawBot rotates the bin
    const lx = (mx / 320 - 0.5) * S + Math.sin(SPRITE_TILT) * t, ly = (my / 320 - 0.5) * S - Math.cos(SPRITE_TILT) * t;
    return { x: p.x + lx * Math.cos(R) - ly * Math.sin(R), y: p.y + lx * Math.sin(R) + ly * Math.cos(R) };
  }
  const muzzleAt = weapon => muzzleOf(me, weapon);
  // one scatter record on the wire becomes the same pellets everywhere: a loose, uneven cloud of shot, some pellets
  // wide, some lagging, some ahead. The cloud is fixed (not drawn per shot) so a shot shown at once on my screen and
  // the server's copy of it, which has another id, throw exactly the same pellets.
  const PELLET_CLOUD = (() => {
    let h = 0x9e3779b9;
    const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
    // denser in the middle: the mean of two draws, over a cone of about +-17 degrees
    return Array.from({ length: 11 }, () => ({ da: (rnd() + rnd() - 1) * 0.22, f: 0.78 + rnd() * 0.36, life: 0.85 + rnd() * 0.15 }));
  })();
  function scatterPellets(s) {
    PELLET_CLOUD.forEach(({ da, f, life }, k) => {
      const c = Math.cos(da), sn = Math.sin(da);
      metricChild(s.id, s.id + "p" + k);
      shots.push({ ...s, id: s.id + "p" + k, ox: s.x, oy: s.y, life: s.life * life, vx: (s.vx * c - s.vy * sn) * f, vy: (s.vx * sn + s.vy * c) * f });
    });
  }
  // a pellet hurts more the closer it was fired from (the classic shotgun falloff); it also shoves what it hits
  const pelletDmg = () => SHOTS[K.PELLET].dmg; // Q3: spread, not damage falloff

  // how someone else's shot sounds here (quieter with distance)
  // which gun a shot kind comes from, for a sound pack's gun sounds
  const KIND_GUN = { [K.SWORD]: "saw", [K.PULSE_BOLT]: "laser", [K.PISTOL]: "fire", [K.NUKE]: "nuke", [K.BULLET]: "minigun", [K.PELLET]: "scatter", [K.SLUG]: "scatter", [K.ROCKET]: "rocket", [K.ORB]: "orb", [K.RAIL]: "rail",
    [K.LASER]: "laser", [K.GAMMA]: "gamma", [K.MINE]: "mine", [K.GREN]: "gren", [K.HROCKET]: "rocket", [K.SHARD]: "shard", [K.FLAK]: "shard" };
  const shotSound = (kind, x, y, owner = "unknown") => {
    if (kind === K.BULLET_ALT) { stopContinuous(owner); packPlay("p_user_autocannon", 0.5, x, y); return; }   // an explosive round: each one a heavy thump
    if (kind === K.PULSE_BOLT || kind === K.LASER || kind === K.BULLET) { if (continuousFire(owner, kind === K.LASER || kind === K.PULSE_BOLT ? "laser" : "minigun", x, y, performance.now(), kind === K.BULLET_ALT || kind === K.LASER)) return; }
    if (kind !== K.PULSE_BOLT && kind !== K.LASER && kind !== K.BULLET) stopContinuous(owner);
    if (kind === K.NOVA) { packPlay("p_nova", 0.8, x, y); return; }
    if (kind === K.FLAK) { packPlay("p_ut_flak_alt", .8, x, y); return; }
    if (kind === K.SHOCK) { audioCue("shockBeam", x, y); return; }
    if (kind === K.PULSE) { audioCue("laserPulse", x, y); return; }
    if (kind === K.MELEE || kind === K.SWORD) return;   // a blade's swing sounds as its bin swings it (swingStart)
    if (KIND_GUN[kind] && packPlay("p_fire_" + KIND_GUN[kind], 0.75, x, y)) return;
    const [name, vol, pitch] = SHOTS[kind].sfx; sfx(name, vol, pitch, x, y);
  };
  // Flak fragments lose energy on each ricochet.
  const shotDmg = s => MODES[MODE].instagib && s.kind === K.RAIL ? 99 : (s.kind === K.PELLET ? pelletDmg(s) : SHOTS[s.kind].dmg * (s.kind === K.SHARD ? Math.pow(.8, s.bn || 0) : 1)) * (s.m || 1);
  // team modes: whose side a shot is on (no friendly fire)
  const teamOfShot = s => s.mine ? me.tm : botById.has(s.owner) ? botById.get(s.owner).tm : remotes.has(s.owner) ? remotes.get(s.owner).tm : undefined;
  // in team modes a shot whose shooter's team hasn't come in yet hurts nobody (it would be friendly fire half the time)
  const friendly = (s, tm) => isTeams() && onTeam({ tm }) && (teamOfShot(s) === undefined || teamOfShot(s) === tm);
  // THE rule for whether a shot may hurt someone (id: their key, "me" for me): alive, not the shooter, not on the
  // shooter's team; my own shots never hurt me. Every hit, splash, blast, homing and chain asks this.
  // the shooter's own shot: it only hurts them through a blast (blast = true: rockets, plasma, mines, nukes, combos)
  const ownShot = (s, o, id) => (o === me && (s.mine || mySrvShot(s))) || id === s.owner;
  const SELF_DMG = 0.3;   // rocket jumps, as in Quake: your own blast hurts you little and throws you hard (see splash)
  const canHurt = (s, o, id, blast = false) => ownShot(s, o, id) ? blast && !o.dead && (o !== me || playing)
    : !o.dead && !friendly(s, o.tm) && (o !== me || (playing && !s.mine));
  // I take damage from shot s: its shooter gets the credit, unless it was my own (then nobody does)
  function hurtMe(s, now, dmg, kind = s.kind, ang = 0, force = false) {
    const before = me.lives + me.shield;
    if (!hurt(now, s.mine ? dmg * SELF_DMG : dmg, force, kind, ang)) return false;
    if (!s.mine) metricDamage(s.id, before - me.lives - me.shield, me.dead);
    if (s.mine) { if (me.dead) killer = "your own blast"; return true; }
    pushCapped(hitBy, s.id, 12);
    if (me.dead) { meKilled(s.id); killedBy(s.owner); }
    return true;
  }
  const selfMul = (s, id) => id === s.owner ? SELF_DMG : 1;
  // Flak Cannon: one network record becomes eight deterministic fragments.
  function shardSpray(s) {
    for (let k = 0; k < 8; k++) {
      const da = (k - 3.5) * 0.075, f = 0.82 + ((k * 3) % 8) * 0.035, c = Math.cos(da), sn = Math.sin(da);
      metricChild(s.id, s.id + "s" + k);
      shots.push({ ...s, id: s.id + "s" + k, vx: (s.vx * c - s.vy * sn) * f, vy: (s.vx * sn + s.vy * c) * f, bn: 0 });
    }
  }
  // a rail slug or a shock beam through a shock orb sets it off: a huge blast credited to whoever pulled the trigger
  function comboBlast(o, s, now) {
    o.combo = true; o.life = 0; o.boom = true;
    const big = true, R = 350, base = HP(165) * (s.m || 1), x = o.x, y = o.y;
    const own = s.mine || botById.has(s.owner);
    for (const b of [...bodies]) if (Math.hypot(b.x - x, b.y - y) - b.r < R * 0.5 && (own || b.free)) carveAt(b, x, y, big ? 130 : 80, own);
    rings.push({ x, y, t: 0, r: R * 1.4, col: "160,235,255", warp: true, dur: 0.7, w: big ? 22 : 12 });
    rings.push({ x, y, t: -0.08, r: R * 0.9, col: "255,255,255", dur: 0.45, w: 8 });
    impacts.push({ x, y, t: 0, r: R * 0.7, col: "#9fe8ff" });
    explode(x, y, 120, big ? 640 : 460, "plasma");   // energy, not fire
    shove(x, y, R * 1.5, big ? 900 : 500);
    const d = Math.hypot(me.x - x, me.y - y);
    if (d < 1600) { shake = Math.max(shake, (big ? 0.7 : 0.35) * (1 - d / 1600)); if (big) flash = Math.max(flash, 0.35 * (1 - d / 1600)); }
    audioCue("shockCombo", x, y);
    if (s.mine) { floaters.push({ x, y: y - 60, t: 0, txt: s.kind === K.SHOCK ? "SHOCK COMBO!" : "COMBO!", gold: true }); if (s.kind === K.SHOCK) announce("SHOCK COMBO", "", "#c9a4ff", 1.5); }
    if (s.kind === K.SHOCK) for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; arcs.push({ x1: x, y1: y, x2: x + Math.cos(a) * R, y2: y + Math.sin(a) * R, t: 0, col: "190,150,255" }); }
    if (canHurt(s, me, "me", true) && !fixedCover(x, y, me.x, me.y) && d < R + 26 * sizeOf(me.lv)) {
      me.vx += (me.x - x) / (d || 1) * 700; me.vy += (me.y - y) / (d || 1) * 700;
      hurtMe(s, now, base * Math.max(0.25, 1 - d / R), K.ORB);
    }
    for (const b of bots) {
      if (!canHurt(s, b, b.id, true) || fixedCover(x, y, b.x, b.y)) continue;
      const bd = Math.hypot(b.x - x, b.y - y);
      if (bd < R + 26 * sizeOf(b.lv || 1)) { b.vx += (b.x - x) / (bd || 1) * 700; b.vy += (b.y - y) / (bd || 1) * 700; botHurt(b, base * Math.max(0.25, 1 - bd / R) * selfMul(s, b.id), s.id, now, false, K.ORB); }
    }
  }
  const REWIND_MS = 250;
  // Rounds that fly straight for their first quarter second can catch up with the network delay as one swept
  // segment: without it a fireball or a rocket arrives on the victim's screen 150-250 px behind where its shooter
  // saw it. Homing, bouncing and sticking shots keep their own flight and start late instead.
  const straightShot = kind => STRAIGHT.has(kind);
  const STRAIGHT = new Set([K.BULLET_ALT, K.PULSE_BOLT, K.BULLET, K.PELLET, K.SLUG, K.ROCKET, K.FLAK, K.ORB, K.GAMMA]);
  // dash and respawn protection: a protected bin is not there for a shot, which flies on through it instead
  // of stopping on it (my bots and I keep the time it ends, the others send a flag)
  const shielded = o => typeof o.inv === "number" ? performance.now() < o.inv : !!o.inv;
