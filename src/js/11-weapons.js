  // ---------- fire & damage ----------
  // shots leave from the tip of the gun drawn on the wing (left and right in turn), not from the middle of the bin
  const mountsOf = w => w === "fire" ? [[256, 150]] : w === "laser" || w === "gauntlet" ? [[160, 96]] : ["nuke", "holy", "bolt", "gamma", "tele", "gauss", "gauntlet"].includes(w) ? [[256, 150]] : [[50, 126], [256, 150]];   // the laser: one emitter, on the nose   // art pixels, shared with drawMounts
  const BARREL = { fire: 44, laser: 60, rocket: 50, triple: 42, nuke: 96, holy: 30, saw: 40, gamma: 44, tele: 28, minigun: 58, gauss: 80, scatter: 42, rail: 86, mine: -10, orb: 40, bolt: 56, shard: 48, nail: 54, gren: 44, gauntlet: 34 };   // tip, in mount units
  // the tip of a pilot's gun (any pilot: me, a bot, a player's pilot on the server, which fires from the same tips),
  // the wing guns taking turns (p.gunSide)
  function muzzleOf(p, weapon) {
    const ms = mountsOf(weapon), [mx, my] = ms[(p.gunSide = (p.gunSide || 0) + 1) % ms.length];
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
    return Array.from({ length: 11 }, () => ({ da: (rnd() + rnd() - 1) * 0.3, f: 0.78 + rnd() * 0.36, life: 0.85 + rnd() * 0.15 }));
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
  const KIND_GUN = { [K.PULSE_BOLT]: "laser", [K.PISTOL]: "fire", [K.SAW]: "saw", [K.SAW_ALT]: "saw", [K.NUKE]: "nuke", [K.BULLET]: "minigun", [K.PELLET]: "scatter", [K.SLUG]: "scatter", [K.ROCKET]: "rocket", [K.ORB]: "orb", [K.RAIL]: "rail",
    [K.LASER]: "laser", [K.GAMMA]: "gamma", [K.MINE]: "mine", [K.NAIL]: "nail", [K.SPIKE]: "nail", [K.GREN]: "gren", [K.HROCKET]: "rocket", [K.GAUSS]: "rail", [K.SHARD]: "shard", [K.FLAK]: "shard" };
  const shotSound = (kind, x, y, owner = "unknown") => {
    if (kind === K.PULSE_BOLT || kind === K.LASER || kind === K.BULLET || kind === K.BULLET_ALT) { if (continuousFire(owner, kind === K.LASER || kind === K.PULSE_BOLT ? "laser" : "minigun", x, y, performance.now(), kind === K.BULLET_ALT || kind === K.LASER)) return; }
    if (kind !== K.PULSE_BOLT && kind !== K.LASER && kind !== K.BULLET && kind !== K.BULLET_ALT) stopContinuous(owner);
    if (kind === K.SAW_ALT || kind === K.FLAK) { packPlay(kind === K.SAW_ALT ? "p_ut_saw_alt" : "p_ut_flak_alt", .8, x, y); return; }
    if (kind === K.SHOCK) { audioCue("shockBeam", x, y); return; }
    if (kind === K.PULSE) { audioCue("laserPulse", x, y); return; }
    if (kind === K.MELEE && packPlay("p_melee_hit", 0.9, x, y)) return;
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
  const STRAIGHT = new Set([K.BULLET_ALT, K.PULSE_BOLT, K.SAW_ALT, K.BULLET, K.NAIL, K.SPIKE, K.PELLET, K.SLUG, K.FIRE, K.ROCKET, K.FLAK, K.ORB, K.GAMMA]);
  // dash, respawn and lunge protection: a protected bin is not there for a shot, which flies on through it instead
  // of stopping on it (my bots and I keep the time it ends, the others send a flag)
  const shielded = o => typeof o.inv === "number" ? performance.now() < o.inv : !!o.inv;
  function recordHitPose(o, now) {
    let h = o.hitHistory || (o.hitHistory = []), prev = h[h.length - 1];
    // (a death or a jump starts it again; a dash's invulnerability does not: each pose keeps its own, so a shot judged in
    // the past meets the target as it was then, before it dashed out of it)
    if (prev && (prev.dead !== !!o.dead || Math.hypot(o.x - prev.x, o.y - prev.y) > 180)) h.length = 0;
    if (h.length && now - h[h.length - 1].at < 8) return;
    h.push({ at: now, x: o.x, y: o.y, lv: o.lv, inv: o.inv, dead: !!o.dead });
    while (h.length > 48 || (h.length > 1 && now - h[0].at > 600)) h.shift();
  }
  function hitPose(s, o) {
    if (!s.hitTime || !HITSCAN[s.kind] || s.mine || (botById.has(s.owner) && !botById.get(s.owner).input)) return o;   // a bot's aim is now; a player's, their screen's
    const h = o.hitHistory;
    if (!h || !h.length || s.hitTime < h[0].at) return o;
    for (let i = h.length - 1; i >= 0; i--) if (h[i].at <= s.hitTime) {
      const a = h[i], b = h[i + 1] || a, t = b.at === a.at ? 0 : clamp((s.hitTime - a.at) / (b.at - a.at), 0, 1);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, lv: a.lv, dead: a.dead, inv: a.inv };
    }
    return o;
  }
  // A flying round sweeps against the target's recorded motion during its step. A hitscan round (now also bullets,
  // and the laser pistol) is one instant: its whole line meets the target where it was when it was fired.
  const sweeps = s => !HITSCAN[s.kind] && straightShot(s.kind) && Number.isFinite(s.stepFrom) && s.stepTo > s.stepFrom;
  function targetHit(s, o) {
    if (sweeps(s)) return projectileContact(s, o) <= 1;
    const p = hitPose(s, o);
    if (p.dead || (HITSCAN[s.kind] && s.hitTime && p.inv > s.hitTime)) return false;
    if (p === o && shielded(o)) return false;
    return segHit(s, p.x, p.y, binR(p.lv) + shotRadius(s));
  }
  const shotRadius = s => s.cut || SHOTS[s.kind].r;
  // Earliest contact between a shot and a moving circle. Work in relative coordinates
  // so a target crossing the path between frames is not treated as a stationary point.
  function circleContact(x, y, dx, dy, r) {
    const c = x * x + y * y - r * r;
    if (c <= 0) return 0;
    const a = dx * dx + dy * dy, b = x * dx + y * dy, disc = b * b - a * c;
    if (a < 1e-12 || disc < 0) return Infinity;
    const t = (-b - Math.sqrt(disc)) / a;
    return t >= 0 && t <= 1 ? t : Infinity;
  }
  function projectileContact(s, o) {
    const start = s.stepFrom, end = s.stepTo, duration = end - start, h = o.hitHistory;
    const dx = s.x - s.px, dy = s.y - s.py, radius = shotRadius(s);
    // nowhere near: no bin flies faster than ~1.6 px/ms, so its recorded path can't reach the shot's either
    const far = Math.hypot(dx, dy) + binR(o.lv) + radius + 60 + 1.6 * Math.max(0, duration);
    if ((o.x - s.px) ** 2 + (o.y - s.py) ** 2 > far * far) return Infinity;
    if (!h?.length || duration <= 0) return shielded(o) ? Infinity : circleContact(s.px - o.x, s.py - o.y, dx, dy, binR(o.lv) + radius);
    let best = Infinity;
    // Do not extrapolate across a teleport/respawn or back before available history.
    for (let i = 0; i < h.length; i++) {
      const a = h[i], b = h[i + 1] || { ...o, at: end };
      const lo = Math.max(start, a.at), hi = Math.min(end, b.at);
      if (hi <= lo || a.dead || b.dead || a.inv !== b.inv) continue;
      const from = Math.max(lo, Number.isFinite(a.inv) ? a.inv : lo);
      if (from >= hi) continue;
      const span = b.at - a.at, t0 = (from - a.at) / span, t1 = (hi - a.at) / span;
      const ax = a.x + (b.x - a.x) * t0, ay = a.y + (b.y - a.y) * t0;
      const bx = a.x + (b.x - a.x) * t1, by = a.y + (b.y - a.y) * t1;
      const f0 = (from - start) / duration, f1 = (hi - start) / duration;
      const hit = circleContact(s.px + dx * f0 - ax, s.py + dy * f0 - ay,
        dx * (f1 - f0) - (bx - ax), dy * (f1 - f0) - (by - ay), binR(a.lv) + radius);
      if (Number.isFinite(hit)) best = Math.min(best, f0 + hit * (f1 - f0));
    }
    return best;
  }
  // First circle along a ray, independent of Map insertion order. Used by both visible
  // beams and collision segments, with the same radius and (for incoming hitscan) rewind.
  function firstBinAlong(s, range) {
    const v = Math.hypot(s.vx, s.vy) || 1, ux = s.vx / v, uy = s.vy / v;
    let first = range, found = false;
    const test = (o, id) => {
      if (!canHurt(s, o, id) || shielded(o)) return;
      if (sweeps(s)) {
        const hit = projectileContact(s, o);
        if (hit * range < first) { first = hit * range; found = true; }
        return;
      }
      const p = hitPose(s, o), dx = p.x - s.px, dy = p.y - s.py, along = dx * ux + dy * uy;
      const rr = binR(p.lv) + shotRadius(s), side2 = dx * dx + dy * dy - along * along;
      if (side2 > rr * rr || along + rr < 0) return;
      const entry = Math.max(0, along - Math.sqrt(Math.max(0, rr * rr - side2)));
      if (entry < first) { first = entry; found = true; }
    };
    if (playing) test(me, "me");
    for (const b of bots) test(b, b.id);
    for (const [id, r] of remotes) if (!botById.has(id)) test(r, id);
    return found ? Math.min(range, first + 0.5) : range;
  }
  const pierces = s => SHOTS[s.kind].pierce || !!s.pc;   // rail-like shots, and fireballs from Lv 7
  // Piercing shots hit each target once per pass; a recalled saw gets one new return pass.
  function railOnce(s, key) { if (!s.hits) s.hits = new Set(); if (s.hits.has(key)) return false; s.hits.add(key); return true; }
  // its beam is drawn at once along the whole path, so the shot reads as instant
  const beams = [];
  const arcs = [];   // lightning jumping from the bin it hit to the next one
  const BEAM_T = 1.1;   // a rail trail lingers: the hot core goes fast, the spiral slowly unwinds
  function beamReach(s) {
    const v = Math.hypot(s.vx, s.vy) || 1, dx = s.vx / v, dy = s.vy / v;
    let reach = Math.max(0, Math.min(s.cut ? 1100 : v * SHOTS[s.kind].life,
      dx > 0 ? (W - s.x) / dx : dx < 0 ? -s.x / dx : Infinity,
      dy > 0 ? (H - s.y) / dy : dy < 0 ? -s.y / dy : Infinity));
    // The station shell blocks even penetrating weapons; old maps keep their terrain cutting.
    // An inner wall stops it too, where it is still standing, unless the beam is heavy enough to break it (it cuts
    // its way through: carveBeam)
    const heavy = (s.cut || SHOTS[s.kind].carve) >= WALL_CARVE;
    for (const b of bodies) if (b.fixed || (b.wall && !b.dead && !b.free && !heavy)) {
      let near = 0, far = reach;
      for (const [p, d, lo, hi] of [[s.x, dx, b.x - b.hw, b.x + b.hw], [s.y, dy, b.y - b.hh, b.y + b.hh]]) {
        if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { far = -1; break; } }
        else { const a = (lo - p) / d, z = (hi - p) / d; near = Math.max(near, Math.min(a, z)); far = Math.min(far, Math.max(a, z)); }
      }
      if (far < near) continue;
      if (b.fixed) { reach = Math.min(reach, near); continue; }
      for (let t = Math.max(0, near); t <= Math.min(far, reach); t += b.cs * 0.5) if (solidAt(b, s.x + dx * t, s.y + dy * t)) { reach = Math.min(reach, t); break; }
    }
    return reach;
  }
  function railBeam(s) {
    const {x, y, vx, vy} = s, v = Math.hypot(vx, vy) || 1, dx = vx / v, dy = vy / v, L = beamReach(s), big = s.kind === K.GAUSS;
    beams.push({ x1: x, y1: y, x2: x + dx * L, y2: y + dy * L, t: 0, big, cut: s.cut || 0 });
    if (beams.length > 12) beams.shift();
  }
  // the laser's look: each pulse lays a short-lived beam from the gun to where it stops; at 12 a second they
  // overlap into one shimmering beam, flaring and melting where it lands
  const lasers = [];
  const LASER_T = 0.26;
  function laserBeam(s, owner) {
    const v = Math.hypot(s.vx, s.vy) || 1, dx = s.vx / v, dy = s.vy / v;
    const e = { x: s.x, y: s.y, hit: s.beamHit };
    lasers.push({ x1: s.px, y1: s.py, x2: e.x, y2: e.y, t: 0, hit: e.hit, seed: Math.random() * 100, shock: s.kind === K.SHOCK, who: (s.mine ? "me" : owner || "?") + (s.kind === K.SHOCK ? "s" + s.id : "") });
    if (lasers.length > 40) lasers.shift();
    if (e.hit && e.hit !== "wall" && onScreen(sx(e.x), sy(e.y), 60)) {
      for (let k = 0; k < (lowQ ? 1 : 3); k++) { const a = Math.atan2(-dy, -dx) + (Math.random() - 0.5) * 2.2, sp = 80 + Math.random() * 260; puff(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 0.25 + Math.random() * 0.25, 1.4 + Math.random() * 1.4, s.kind === K.SHOCK ? "#e4d2ff" : k % 2 ? "#bff9ff" : "#ffffff", 1, 0.05); }
      if (e.hit === "body" && Math.random() < 0.5) puff(e.x, e.y, (Math.random() - 0.5) * 30, -20 - Math.random() * 30, 0.6, 3 + Math.random() * 3, "rgb(255,140,60)", 1);   // the rock glows and melts
    }
  }
  // lightning locks on: the nearest visible enemy within ~13° of where you point and within reach gets the bolt
  const BOLT_LOCK_R = 700, BOLT_LOCK_A = 0.22;
  function boltLock(p, from) {
    const ox = from ? from.x : p.x, oy = from ? from.y : p.y;
    let best, score = Infinity;
    for (const [id, r] of remotes) {
      if (r.dead || id === p.id || mates(r, p)) continue;
      const dx = r.x - ox, dy = r.y - oy, d = Math.hypot(dx, dy), da = Math.abs(angD(Math.atan2(dy, dx) - p.a));
      if (d < BOLT_LOCK_R && da < BOLT_LOCK_A && clearAim(ox, oy, r.x, r.y) && d * (1 + da * 2) < score) { score = d * (1 + da * 2); best = Math.atan2(dy, dx); }
    }
    return best;
  }
  // and it jumps on: up to two more enemies close to the one it hit, each taking a little less
  const CHAIN_R = 340, CHAIN_DMG = 0.14, CHAIN_JUMPS = 2;   // the laser: one jump, shorter and weaker
  function boltChain(s, hx, hy, hitId, now) {
    if (s.chained || s.kind === K.LASER) return; // Laser keeps tracking and Pulse; chaining belongs to Lightning.
    s.chained = true;
    const done = new Set([hitId]), laser = s.kind === K.LASER;
    let x = hx, y = hy;
    for (let j = 0; j < (laser ? 1 : CHAIN_JUMPS); j++) {
      let best = null, bd = laser ? 260 : CHAIN_R;
      const consider = (id, o) => { if (done.has(id) || !canHurt(s, o, id) || fixedCover(x, y, o.x, o.y)) return; const d = Math.hypot(o.x - x, o.y - y); if (d < bd) { bd = d; best = { id, o }; } };
      consider("me", me);
      for (const [id, r] of remotes) consider(id, r);
      if (!best) return;
      const t = best.o, a = Math.atan2(t.y - y, t.x - x);
      done.add(best.id);
      arcs.push({ x1: x, y1: y, x2: t.x, y2: t.y, t: 0 });
      impact(t.x, t.y, "#bfefff", 1);
      packPlay("p_hit_laser", 0.5, t.x, t.y) || sfx("laser", 0.35, 2.2, t.x, t.y);
      const dmg = (laser ? 0.1 : CHAIN_DMG * (1 - j * 0.25)) * (s.m || 1), cid = s.id + "c" + j;
      metricChild(s.id, cid);
      if (best.id === "me") { if (hurt(now, dmg, false, K.BOLT, a)) { pushCapped(hitBy, cid, 12); if (me.dead) { meKilled(cid); killedBy(s.owner); } } }
      else if (botById.has(best.id)) botHurt(botById.get(best.id), dmg, cid, now, false, K.BOLT, a);
      else if (s.mine) hitConfirm({ ...s, kind: K.BOLT }, t.lv, t.x, t.y, t);
      x = t.x; y = t.y;
    }
  }
  // homing: turns gently toward the nearest enemy ahead of it, never faster than a bin flies, so boost or a dash escapes it
  function steerRocket(s, dt) {
    const cur = Math.atan2(s.vy, s.vx);
    let best = null, bd = 1100;
    const consider = (o, x, y) => {
      const d = Math.hypot(x - s.x, y - s.y);
      if (d < bd && Math.abs(angD(Math.atan2(y - s.y, x - s.x) - cur)) < 1.25) { bd = d; best = { x, y }; }
    };
    if (canHurt(s, me, "me")) consider(me, me.x, me.y);
    for (const [id, r] of remotes) if (!botById.has(id) && canHurt(s, r, id)) consider(r, r.x, r.y);   // my bots: from bots below
    for (const b of bots) if (canHurt(s, b, b.id) && !(s.mine && botById.has(b.id))) consider(b, b.x, b.y);
    const na = best ? cur + clamp(angD(Math.atan2(best.y - s.y, best.x - s.x) - cur), -2.3 * dt, 2.3 * dt) : cur;
    const sp = Math.min(560, Math.hypot(s.vx, s.vy) + 380 * dt);
    s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
  }
  // the blast of a rocket or a plasma orb, wherever it ends: everyone sees it, and it hurts me and my bots nearby
  // (whoever took the direct hit, s.direct, already got its damage)
  function splash(s, now) {
    blastFx(s);
    if (s.splashed) return;
    s.splashed = true;
    const [R0, hi, lo, push] = SPLASH[s.kind], m = s.m || 1;
    // blasts dig: grenades, mines and homing rockets that go off near rock bite craters out of it
    const dig = { [K.GREN]: 62, [K.MINE]: 58, [K.HROCKET]: 46 }[s.kind], own = s.mine || botById.has(s.owner);
    if (dig) for (const b of [...bodies]) if (Math.hypot(b.x - s.x, b.y - s.y) - b.r < dig && (own || b.free)) carveAt(b, s.x, s.y, dig, own);
    const hit = (o, id, rad) => {
      const d = Math.hypot(o.x - s.x, o.y - s.y), R = R0 + rad;
      if (d > R || id === s.direct || !canHurt(s, o, id, true) || fixedCover(s.x, s.y, o.x, o.y)) return 0;
      const jump = ownShot(s, o, id) ? 2.6 : 1;   // a rocket jump: your own blast flings you
      o.vx += (o.x - s.x) / (d || 1) * push * jump; o.vy += (o.y - s.y) / (d || 1) * push * jump;
      return (lo + (hi - lo) * (1 - d / R)) * m;
    };
    const dm = hit(me, "me", 26 * sizeOf(me.lv));
    if (dm) hurtMe(s, now, dm);
    for (const b of bots) { const db = hit(b, b.id, 26 * sizeOf(b.lv || 1)); if (db) botHurt(b, db * selfMul(s, b.id), s.id, now, false, s.kind); }
  }
  // the look of a rocket or plasma blast, once per shot
  function blastFx(s) {
    if (s.fxDone) return;
    s.fxDone = true; s.boom = true;
    const x = s.x, y = s.y, near = Math.hypot(x - me.x, y - me.y) < 1400;
    if (s.kind === K.MINE) {   // a mine: a hard orange blast and a shock ring
      explode(x, y, 60, 340);
      if (near) { packPlay("p_boom_mine", 1, x, y) || sfx("boom_small", 1, 0.9, x, y); shake = Math.max(shake, 0.28 * (1 - Math.hypot(x - me.x, y - me.y) / 1400)); }
      return;
    }
    if (s.kind === K.GAMMA) {
      impacts.push({ x, y, t: 0, r: 155, col: "#b8ff91" });
      rings.push({ x, y, t: 0, r: 270, col: "75,255,110", warp: true, dur: 0.6, w: 14 });
      for (let k = 0; k < (lowQ ? 20 : 48); k++) { const a = Math.random() * 6.283, v = 140 + Math.random() * 500; puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.45 + Math.random() * 0.6, 2 + Math.random() * 3, k % 3 ? "#58f77a" : "#d4ffad"); }
      // The orb travels beyond the old 1400px gate; let the sound mixer handle distance.
      packPlay("p_boom_gamma", 1, x, y) || sfx("boom_small", 1, 0.8, x, y);
      if (near) shake = Math.max(shake, 0.3 * (1 - Math.hypot(x - me.x, y - me.y) / 1400));
      return;
    }
    if (s.kind === K.ORB) {   // plasma: a blue-white ball of energy, a warping shock ring, crackling sparks, a sizzle
      explode(x, y, 45, 300, "plasma");
      impacts.push({ x, y, t: 0, r: 170, col: "#bff4ff" });
      rings.push({ x, y, t: 0, r: 280, col: "120,220,255", warp: true, dur: 0.55, w: 16 });
      rings.push({ x, y, t: -0.06, r: 170, col: "255,255,255", dur: 0.35, w: 6 });
      for (let k = 0; k < (lowQ ? 18 : 48); k++) { const a = Math.random() * 6.283, v = 150 + Math.random() * 520; puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.35 + Math.random() * 0.5, 1.2 + Math.random() * 1.6, k % 3 ? "#9fe8ff" : "#ffffff", 1, 0.05); }
      for (let k = 0; k < 4; k++) { const a = Math.random() * 6.283; arcs.push({ x1: x, y1: y, x2: x + Math.cos(a) * 140, y2: y + Math.sin(a) * 140, t: 0 }); }
      if (near && !packPlay("p_boom_orb", 1, x, y)) { sfx("boom_small", 0.9, 1.35, x, y); sfx("shield_hit", 0.8, 0.6, x, y); }
      if (near) { shake = Math.max(shake, 0.25 * (1 - Math.hypot(x - me.x, y - me.y) / 1400)); }
    } else {   // rocket: a fat fireball with a warping shock ring and smoke
      explode(x, y, 80, 420);
      if (near) { packPlay(s.kind === K.GREN ? "p_quake_grenade_boom" : "p_boom_rocket", 1, x, y) || sfx("boom_small", 1, 0.95, x, y); shake = Math.max(shake, 0.3 * (1 - Math.hypot(x - me.x, y - me.y) / 1400)); }
    }
  }
  let hitTickAt = 0;
  let hitStopUntil = 0;
  // Quake's medals: Impressive for two rail hits in a row; Humiliation for a ram kill; Headshot for a scoped rail kill from afar
  let railRun = 0, railLast = null;
  const railHits = new Set();   // my rail shots that hit (by id)
  // a new rail shot of mine: if the one before it hit nothing, the run of hits is over
  function railFired(id) { if (railLast && !railHits.has(railLast)) railRun = 0; railLast = id; if (railHits.size > 64) railHits.clear(); }
  const myRails = new Map(), myMelee = new Set();
  const pendingHitFx = new Map();
  function predictHit(s, id, r) {
    pendingHitFx.set(id + ":" + s.id, { s, at: performance.now(), lv: r.lv });
    if (pendingHitFx.size > 256) pendingHitFx.delete(pendingHitFx.keys().next().value);
  }
  function confirmShotHit(id, shotId, r) {
    const key = id + ":" + shotId, pending = pendingHitFx.get(key);
    if (!pending) return;
    pendingHitFx.delete(key);
    if (performance.now() - pending.at < 2000) hitConfirm(pending.s, pending.lv, r.x, r.y, r);
  }
  function killStyle(k, victim) {
    if (k.includes(".ram") || myMelee.has(k)) { setTimeout(() => announce("HUMILIATION", "rammed " + victim.name, "#ff8a5a", 3), 1400); return; }
    const r = myRails.get(k);
    if (r && r.charged && Math.hypot(victim.x - r.x, victim.y - r.y) > (r.cut ? 800 : 1200)) setTimeout(() => announce("HEADSHOT", "a charged rail kill from afar", "#d9a8ff", 3), 1400);
  }
  function hitConfirm(s, lv, x, y, target) {
    const t0 = performance.now();
    // Impressive, as Quake 3 gives it: two rail hits in a row, a miss in between starting the count again (a shot that
    // pierces two pilots counts once). On the server the shot is the one shown here (its id), offline my own
    if (s.mine && s.kind === K.RAIL && !railHits.has(s.id)) { railHits.add(s.id); if (++railRun >= 2) announce("IMPRESSIVE", railRun + " rail hits in a row", "#d9a8ff", 2); }
    if (target) target.hitAt = t0;
    if (s.mine && shotDmg(s) >= 0.9) hitStopUntil = Math.max(hitStopUntil, t0 + (s.kind === K.RAIL ? 70 : 45));   // a heavy hit lands: the world stops for a beat
    if (!s.mine) return;
    const pct = Math.max(1, Math.round(shotDmg(s) / maxLivesOf(lv || 1) * 100));
    floaters.push({ x: x + (Math.random() - 0.5) * 30, y: y - 40, t: 0, txt: "-" + pct + "%", hit: true, col: SHOTS[s.kind].col, big: pct >= 40 });
    const t = performance.now();
    if (t - hitTickAt > 60) { hitTickAt = t; sfx("hit", 0.4, 1.8); }
  }
  function pelletShove(o, s, f = 150) { const v = Math.hypot(s.vx, s.vy) || 1; o.vx += s.vx / v * f; o.vy += s.vy / v * f; }
  // one volley from any pilot, me or a bot: the shots go out, get logged for the network, and the last one is returned
  // (muzzle effects start from it). pat: a weapon or its alt (shot, spread, back); from: the gun's muzzle, if known
  // mul: extra damage (the charge cannon's charge), sent along with Overdrive's
  const FIRE_TWIN = { ...WEAPONS.fire, spread: [-0.05, 0.05] };
  // a gun's random spread follows from whose shot it is and its number, not from Math.random: the server's copy of a
  // player's shot then flies exactly where that player's screen showed it (12c-server.js learns the server's numbers)
  const tagSeed = t => { let h = 7; for (let i = 0; i < t.length; i++) h = Math.imul(h, 31) + t.charCodeAt(i) | 0; return h; };
  const shotJitter = (tag, n, j) => (hash(tagSeed(String(tag || "")), n, 991) - 0.5) * 2 * j;
  function volley(p, now, pat, from, aim, mul = 1) {
    metricVolley(p, pat);
    const mine = p === me, [kind, speed] = pat.shot, amp = ((mine ? me.ampUntil : p.ampUntil || 0) > now ? QUAD : 1) * mul, ride = kind === K.GREN || kind === K.HOLY || kind === K.MINE ? .6 : 0;
    const base = (aim ?? p.a) + (pat.back ? Math.PI : 0), sz = sizeOf(p.lv || 1);
    let s, vi = 0;
    // the spread's number: a player's shot fired by a flight command is numbered by that command (jk) and its place in
    // the volley, which the screen and the server both know exactly; any other by the shot count
    const jk = mine ? (serverRun ? srv.jk : undefined) : p.jk;
    for (const da of pat.spread || [0]) {
      const n = Number.isSafeInteger(jk) ? jk * 16 + (vi++ & 15) : mine ? (serverRun ? srv.pseq + srv.seqOff : shotSeq) : p.seq, tag = mine ? (serverRun ? srv.tag : myTag) : p.tag;
      const ja = pat.jitter ? shotJitter(tag, n, pat.jitter) : 0, bx = Math.cos(base + da + ja), by = Math.sin(base + da + ja);
      const id = (mine ? myTag : p.tag) + "." + (mine ? shotSeq++ : p.seq++).toString(36);
      const ox = from ? from.x : p.x + bx * 42 * sz, oy = from ? from.y : p.y + by * 42 * sz;
      // a shot keeps only the part of the bin's speed along its own line: it flies exactly where the gun points
      // (sideways drift no longer bends it off the crosshair), and firing ahead while flying fast still adds reach
      const fwd = speed > 0 ? Math.max(0, p.vx * bx + p.vy * by) * ride : 0;
      s = { id, kind, x: ox, y: oy, ox, oy, px: from ? ox : p.x, py: from ? oy : p.y, vx: bx * (speed + fwd) + (speed > 0 ? 0 : p.vx * ride), vy: by * (speed + fwd) + (speed > 0 ? 0 : p.vy * ride),
            life: SHOTS[kind].life, cut: pat.cut || 0, mine, m: amp, owner: mine ? undefined : p.id, bn: 0, pc: false };   // pc: pierces (fireballs from Lv 7)
      if (mine && serverRun) { s = predictShot(s); if (kind === K.RAIL) railFired(s.id); continue; }   // on the authoritative server my shot is only shown here
      noteShotKind(id, kind);
      metricShot(s, p, pat);
      pilotLag(s, p, now);
      if (kind === K.PELLET) scatterPellets(s); else if (kind === K.SHARD) shardSpray(s); else if (kind === K.NAIL) nailSpray(s); else shots.push(s);
      if (kind === K.RAIL || kind === K.GAUSS) railBeam(s);
      if (kind === K.GAUSS && mine) { myRails.set(id, { x: s.x, y: s.y, charged: true, cut: !!s.cut }); if (myRails.size > 20) myRails.delete(myRails.keys().next().value); }
      if (kind === K.MELEE && mine) myMelee.add(id);   // for Humiliation
      if ((kind === K.BULLET || kind === K.BULLET_ALT || kind === K.PISTOL) && onScreen(sx(p.x), sy(p.y), 200) && Math.random() < 0.7) {   // a spent casing spins off the side
        const sd = Math.random() < 0.5 ? 1 : -1, cx = -by * sd, cy = bx * sd, v = 140 + Math.random() * 120;
        puff(ox, oy, cx * v - bx * 60 + p.vx * 0.8, cy * v - by * 60 + p.vy * 0.8, 0.5 + Math.random() * 0.3, 1.8, "#e8c060");
      }
      if (kind === K.RAIL && mine) {   // for Impressive (a miss breaks the run) and Headshot
        railFired(id);
        myRails.set(id, { x: s.x, y: s.y, charged: false }); if (myRails.size > 20) myRails.delete(myRails.keys().next().value);
      }
      const d = [id, Math.round(s.x), Math.round(s.y), Math.round(s.vx), Math.round(s.vy), kind, +amp.toFixed(2), s.pc ? 1 : 0, s.cut || 0, Date.now()];
      if (mine) { myShotLog.push({ at: now, d }); stats.shots++; net.shot(d); }
      else { seenShots.set(id, performance.now()); p.shotLog.push({ at: now, d }); p.st.shots++; }
    }
    return s;
  }
  // Blades make one outbound pass and one return pass. Recall never resets a return hit list.
  function returnSaw(s) {
    if (s.returning) return;
    if (s.mine) audioCue("sawReturn", s.x, s.y);
    s.returning = true; s.hits = new Set();
  }
  function recallSaws(signal) {
    if (signal.recalled) return;
    signal.recalled = true;
    for (const s of shots) if (s.kind === K.SAW && s.life > 0 && (signal.mine ? s.mine : !s.mine && s.owner === signal.owner)) returnSaw(s);
  }
  function steerSaw(s, dt) {
    s.age = (s.age || 0) + dt;
    if (s.age >= 0.55) returnSaw(s);
    if (!s.returning) return;
    const owner = s.mine ? me : botById.get(s.owner) || remotes.get(s.owner);
    if (!owner || owner.dead) return; // keeps flying until its bounded lifetime expires
    const dx = owner.x - s.x, dy = owner.y - s.y, d = Math.hypot(dx, dy), speed = 1750;
    if (d < binR(owner.lv || 1) + 18) { s.life = 0; if (s.mine) audioCue("sawCatch"); return; }
    // A short ricochet grace lets the blade escape a wall before homing resumes.
    s.ricTime = Math.max(0, (s.ricTime || 0) - dt);
    if (!s.ricTime) { const v = Math.min(speed, d / Math.max(dt, 0.001)); s.vx = dx / d * v; s.vy = dy / d * v; }
  }
  // the nailgun: one record becomes the same fan of seven nails everywhere
  function nailSpray(s) {
    for (let k = 0; k < 7; k++) {
      const da = (k - 3) * 0.035 + (((k * 37) % 7) - 3) * 0.006, f = 0.95 + ((k * 3) % 5) * 0.025, c = Math.cos(da), sn = Math.sin(da);
      metricChild(s.id, s.id + "n" + k);
      shots.push({ ...s, id: s.id + "n" + k, vx: (s.vx * c - s.vy * sn) * f, vy: (s.vx * sn + s.vy * c) * f });
    }
  }
  // nails left sticking out of rock (for 8 s, at most 150), riding along with it
  const stuckNails = [];
  function stickNail(b, x, y, a, spike) {
    const [lx, ly] = toLocal(b, x, y);
    stuckNails.push({ b, lx, ly, a: a - b.a, spike, at: performance.now() });
    if (stuckNails.length > 150) stuckNails.shift();
  }
  // a grenade hits rock or the fence: it clinks and rolls off
  function grenBounce(s) {
    if (Math.hypot(s.vx, s.vy) > 80 && performance.now() - (s.clinkAt || 0) > 90) { s.clinkAt = performance.now(); packPlay("p_bounce_gren", 0.7, s.x, s.y) || sfx("mine_drop", 0.5, 1.3, s.x, s.y); }
  }
  // a flak shell bursts: five shards all round, the same on every screen (their ids follow from the shell's)
  function flakBurst(s) {
    if (s.burst) return;
    s.burst = true; s.boom = true;
    splash(s, performance.now());
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * 6.283 + 0.2, v = 2200;
      metricChild(s.id, s.id + "f" + k);
      shots.push({ ...s, id: s.id + "f" + k, kind: K.SHARD, ox: s.x, oy: s.y, px: s.x, py: s.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: SHOTS[K.SHARD].life * 0.6, bn: 0, burst: false, boom: false, hits: undefined, expireAfterStep: false, traced: false, catchup: 0, direct: undefined, splashed: false, fxDone: false, impactSound: false });
    }
    if (onScreen(sx(s.x), sy(s.y), 300)) {
      explode(s.x, s.y, 45, 380);
    }
    packPlay("p_boom_shard", 0.8, s.x, s.y) || sfx("boom_small", 0.8, 1.3, s.x, s.y);
  }
  // a mine detonator: every armed mine of that pilot goes off now
  function detonateMines(d) {
    if (d.done) return;
    d.done = true;
    const t = performance.now();
    for (const o of shots) if (o.kind === K.MINE && o.life > 0 && (d.mine ? o.mine : o.owner === d.owner)) {
      // A delayed peer must retain the command until its copy finishes arming.
      o.trigAt = Math.min(o.trigAt || Infinity, t + Math.max(0, MINE_ARM - (SHOTS[K.MINE].life - o.life)) * 1000);
    }
  }
  // a prox mine stuck to rock rides along with it; if the rock is gone it floats free
  function mineStick(s) {
    const st = s.stuck;
    if (st.b) { if (st.b.dead || !bodies.includes(st.b)) { s.stuck = null; return; } [s.x, s.y] = toWorld(st.b, st.lx, st.ly); }
    s.px = s.x; s.py = s.y; s.vx = s.vy = 0;
  }
  // the gamma orb's detonator: the shooter's nearest gamma orb goes off right here
  function detonateOrb(d) {
    if (d.done) return;
    d.done = true;
    let best = null, bd = 500;
    for (const o of shots) if (o.kind === K.GAMMA && o.life > 0 && (d.mine ? o.mine : o.owner === d.owner)) { const dd = Math.hypot(o.x - d.x, o.y - d.y); if (dd < bd) { bd = dd; best = o; } }
    if (best) { best.x = d.x; best.y = d.y; best.life = 0; }
  }
  // a shard ricochets: sparks fly, it rings, and it glows hotter (it hits harder now, see shotDmg)
  function shardRicochet(s) {
    if (!onScreen(sx(s.x), sy(s.y), 200)) return;
    sparkShower(s.x, s.y, s.vx / 1300, s.vy / 1300, 0.5 + s.bn * 0.15);
    impacts.push({ x: s.x, y: s.y, t: 0, r: 30 + s.bn * 10, col: "#ffd27a" });
    packPlay("p_ric", 0.5, s.x, s.y) || sfx("hit", 0.35, 2 + s.bn * 0.2, s.x, s.y);
  }
  // what every client shows where a shot lands on a bin
  function shotBurst(s) {
    if (s.kind === K.PULSE_BOLT) { if (!s.impactSound) { s.impactSound = true; packPlay("p_ut_pulse_explode", .6, s.x, s.y); } return; }
    if (s.kind === K.FLAK) { flakBurst(s); return; }
    if (s.kind === K.MINE) { blastFx(s); return; }
    if (SPLASH[s.kind]) blastFx(s);
    else packPlay(s.kind === K.SHARD ? "p_ric" : s.kind === K.BULLET ? "p_hit_bullet" : s.kind === K.LASER || s.kind === K.BOLT ? "p_hit_laser" : s.kind === K.NAIL || s.kind === K.SPIKE ? "p_hit_nail" : s.kind === K.RAIL ? "p_boom_orb" : "", 0.6, s.x, s.y) || sfx("hit", 0.55, 1.1, s.x, s.y);
    if (s.kind === K.RAIL) sparkShower(s.x, s.y, s.vx / 4200, s.vy / 4200, 1.2);
    if (s.kind === K.PELLET) sparkShower(s.x, s.y, s.vx / 1250, s.vy / 1250, 0.5);
    if (s.kind === K.SLUG) { sparkShower(s.x, s.y, s.vx / 1900, s.vy / 1900, 1); shake = Math.max(shake, 0.1); }
    if (s.kind === K.SHARD) { sparkShower(s.x, s.y, s.vx / 1300, s.vy / 1300, 1.1); shake = Math.max(shake, 0.08); }
    impact(s.x, s.y, SHOTS[s.kind].col, s.kind === K.ROCKET || s.kind === K.RAIL ? 2 : 1);
  }
  // extra muzzle effects some guns have, on top of the flash and recoil every gun gets
  const MUZZLE_FX = {
    mini(m) {   // the minigun: a tongue of flame from the barrels with each round, and now and then a spark
      const a = me.a, ca = Math.cos(a), sa = Math.sin(a);
      impacts.push({ x: m.x + ca * 6, y: m.y + sa * 6, t: 0, r: 12 + Math.random() * 9, col: Math.random() < 0.5 ? "#ffcf6a" : "#ff9a3c" });
      for (let k = 0; k < (lowQ ? 2 : 4); k++) { const b = a + (Math.random() - 0.5) * 0.5, v = 300 + Math.random() * 380; puff(m.x, m.y, Math.cos(b) * v + me.vx, Math.sin(b) * v + me.vy, 0.06 + Math.random() * 0.08, 3 + Math.random() * 3, k % 2 ? "#ffd27a" : "#ff8a2a", 0); }
      if (Math.random() < 0.25) sparkShower(m.x, m.y, ca, sa, 0.4);
      miniHeat = Math.min(1, miniHeat + 0.05);
    },
    blast(m) {   // scatter gun: flash, a cone of fire and smoke, then the pump racking
      setTimeout(() => { if (!sfx("pump", 0.6)) { blip(420, 0.05, "square"); setTimeout(() => blip(300, 0.06, "square"), 90); } }, 260);
      impacts.push({ x: m.x, y: m.y, t: 0, r: 70, col: "#ffd27a" });
      for (let k = 0; k < 22; k++) { const a = me.a + (Math.random() - 0.5) * 0.7, v = 250 + Math.random() * 500; puff(m.x, m.y, Math.cos(a) * v + me.vx, Math.sin(a) * v + me.vy, 0.2 + Math.random() * 0.25, 2 + Math.random() * 2.5, FIRE_COLS[k % 4]); }
      smoke(m.x, m.y, 8, 120, 1.2);
    },
    slug(m) {    // a tighter cone for the slug
      setTimeout(() => sfx("pump", 0.6, 0.9), 300);
      for (let k = 0; k < 14; k++) { const a = me.a + (Math.random() - 0.5) * 0.3, v = 300 + Math.random() * 500; puff(m.x, m.y, Math.cos(a) * v + me.vx, Math.sin(a) * v + me.vy, 0.25, 2.5, FIRE_COLS[k % 4]); }
    },
    rail(m) { flash = Math.max(flash, 0.12); rings.push({ x: m.x, y: m.y, t: 0, r: 70, col: "233,200,255", dur: 0.35, w: 6 }); },
    flash(m) { impacts.push({ x: m.x, y: m.y, t: 0, r: 50, col: "#ff9a3c" }); },
    shard(m) {   // the shard cannon: a big hot flash, a cone of sparks and smoke, a deep thump and the breech racking
      impacts.push({ x: m.x, y: m.y, t: 0, r: 110, col: "#ff9a3c" });
      rings.push({ x: m.x, y: m.y, t: 0, r: 110, col: "255,170,90", dur: 0.25, w: 8 });
      for (let k = 0; k < (lowQ ? 14 : 34); k++) { const a = me.a + (Math.random() - 0.5) * 0.6, v = 300 + Math.random() * 700; puff(m.x, m.y, Math.cos(a) * v + me.vx, Math.sin(a) * v + me.vy, 0.15 + Math.random() * 0.25, 1.5 + Math.random() * 2.5, k % 3 ? "#ffc070" : "#fff4e0", 1, 0.04); }
      smoke(m.x, m.y, lowQ ? 5 : 11, 150, 1.4);
      // The supplied cannon shot has its own body; an extra bass blast masks its attack.
      setTimeout(() => sfx("pump", 0.6, 1.25), 330);
    },
    pulse(m) {   // the laser's pulse: a wide cyan wave rolls out of the gun
      rings.push({ x: m.x, y: m.y, t: 0, r: 140, col: "125,249,255", warp: true, dur: 0.3, w: 10 });
      for (let k = 0; k < 24; k++) { const a = me.a + (Math.random() - 0.5) * 1.3, v = 300 + Math.random() * 600; puff(m.x, m.y, Math.cos(a) * v + me.vx, Math.sin(a) * v + me.vy, 0.25, 2, k % 2 ? "#bff9ff" : "#ffffff"); }
    },
    shock(m) { rings.push({ x: m.x, y: m.y, t: 0, r: 60, col: "200,160,255", dur: 0.25, w: 5 }); impacts.push({ x: m.x, y: m.y, t: 0, r: 45, col: "#c9a4ff" }); },
    gamma(m) {   // a green shock ring and a spray of motes
      rings.push({ x: m.x, y: m.y, t: 0, r: 120, col: "125,255,138", dur: 0.35, w: 8 });
      for (let k = 0; k < 20; k++) { const a = me.a + (Math.random() - 0.5) * 1.4, v = 150 + Math.random() * 320; puff(m.x, m.y, Math.cos(a) * v + me.vx, Math.sin(a) * v + me.vy, 0.35, 2.4, k % 2 ? "#7dff8a" : "#e9ffe0"); }
    },
    plasma(m) {
      rings.push({ x: m.x, y: m.y, t: 0, r: 90, col: "140,225,255", dur: 0.3, w: 6 });
      for (let k = 0; k < 16; k++) { const a = me.a + (Math.random() - 0.5) * 1.2, v = 150 + Math.random() * 300; puff(m.x, m.y, Math.cos(a) * v + me.vx, Math.sin(a) * v + me.vy, 0.3, 2, k % 2 ? "#9fe8ff" : "#ffffff"); }
    }
  };
  const DETONATOR = { shot: [K.DET, 0] }, MINE_DETONATOR = { shot: [K.MDET, 0] };
  let lungeReady = 0;
  // the pack's sound for each alt fire (the rest keep their own)
  const ALT_SOUND = { fire: "p_ut_pulse_fire", saw: "p_ut_saw_alt", nuke: "p_ut_nuke_fire", mine: "p_fire_mine", scatter: "p_fire_scatter", rocket: "p_fire_rocket", orb: "p_hit_laser", laser: "p_fire_laser", gren: "p_fire_gren", nail: "p_fire_nail", rail: "p_fire_rail", shard: "p_ut_flak_alt" };
  // fire the gun in hand (alt: its alternate fire, which needs its full ammo cost)
  // mul: the charge cannon's charge (0.25..1)
  function shoot(now, alt, mul = 1, loadedRockets = 0) {
    const k = me.weapon, w = WEAPONS[k];
    let pat = alt ? w.alt : w;
    if (alt && !pat) { rejectFire("PRIMARY FIRE ONLY", now); return; }
    if (!alt && k === "gamma" && controlledShots("gamma").length) { rejectFire("ALT · DETONATE ACTIVE ORB", now); return; }
    if (alt && pat.load) {
      if (!loadedRockets) return;
      const count = Math.min(3, loadedRockets, me.arsenal.rocket || 0);
      if (!count) return;
      pat = { ...pat, cost: count, spread: Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * .14) };
    }
    if (!alt && !(me.arsenal[k] > 0)) { rejectFire("NO AMMO · use alternate command", now); return; }
    if (alt && (me.arsenal[k] || 0) < pat.cost) { rejectFire("NEED " + pat.cost + " AMMO", now); return; }
    if (alt && pat.cutter) pat = { ...pat, cut: Math.round(24 + 48 * railCharge) };
    if (alt && pat.recall) {
      if (!shots.some(s => myShot(s) && s.kind === K.SAW && !s.returning && s.life > 0)) { rejectFire(controlledShots("saw").length ? "BLADES ALREADY RETURNING" : "NO ACTIVE BLADES", now); return; }
      const signal = volley(me, now, pat, { x: me.x, y: me.y }); recallSaws(signal); fireCd = pat.cd; sfx(...pat.sfx); return;
    }
    if (k === "tele" && myBeacon()) { teleport(now); return; }   // the second shot jumps you to the beacon
    if (w.melee && !alt) {   // the gauntlet: a blow only lands on a bin within reach ahead (the blade spins anyway)
      const reach = binR(me.lv) + 60, nx = me.x + Math.cos(me.a) * (binR(me.lv) + 14), ny = me.y + Math.sin(me.a) * (binR(me.lv) + 14);
      let target = null;
      for (const [rid, r] of remotes) if (!r.dead && !mates(r, me) && Math.hypot(r.x - nx, r.y - ny) < reach + binR(r.lv || 1) - 20) { target = r; break; }
      if (!target) { fireCd = 0.05; return; }
      fireCd = w.cd;
      volley(me, now, w, { x: nx, y: ny });
      packPlay("p_melee_hit", 1) || sfx(...w.sfx);
      shotFeel("gauntlet", { x: nx, y: ny }, 0, ...w.feel);
      sparkShower(nx, ny, Math.cos(me.a), Math.sin(me.a), 2.2); sparkShower(nx, ny, -Math.sin(me.a), Math.cos(me.a), 1.2); sparkShower(nx, ny, Math.sin(me.a), -Math.cos(me.a), 1.2);
      impacts.push({ x: nx, y: ny, t: 0, r: 60, col: "#ffcf5a" });
      return;
    }
    if (alt && pat.lunge) {   // lunge: a burst forward with the blade out
      if (now < lungeReady) { rejectFire("LUNGE RECHARGING", now); return; }
      lungeReady = now + 1200; me.lungeUntil = now + 450;
      me.vx += Math.cos(me.a) * 950; me.vy += Math.sin(me.a) * 950; me.inv = Math.max(me.inv, now + 200);
      dashBurst(me); packPlay("p_melee_run", 0.8) || sfx(...pat.sfx);
      return;
    }
    if (alt && pat.minedet) {   // set off every mine of mine, on every screen
      if (!shots.some(s => myShot(s) && s.kind === K.MINE && s.life > 0)) { rejectFire("NO ACTIVE MINES", now); return; }
      if (!controlledShots("mine").some(s => SHOTS[K.MINE].life - s.life >= MINE_ARM)) { rejectFire("MINES ARMING", now); return; }
      volley(me, now, MINE_DETONATOR, { x: me.x, y: me.y }); fireCd = pat.cd; sfx(...pat.sfx);
      return;
    }
    if (alt && pat.detonate) {   // the gamma orb's alt: a detonator at my orb, which sets it off on every screen
      const o = shots.filter(s => myShot(s) && s.kind === K.GAMMA && s.life > 0).pop();
      if (!o) { rejectFire("NO ACTIVE DEMONIC ORB", now); return; }
      volley(me, now, DETONATOR, { x: o.x, y: o.y }); fireCd = pat.cd; sfx(...pat.sfx);
      return;
    }
    if (alt && pat.heat) {   // the minigun's burst heats the barrels; overheated, it must cool before it fires again
      if (me.overheat) return;
      me.heat = (me.heat || 0) + pat.heat;
      if (me.heat >= 1) { me.overheat = true; floaters.push({ x: me.x, y: me.y - 60, t: 0, txt: "OVERHEAT", gold: false }); sfx("shield_hit", 0.7, 0.6); }
    }
    const cdMul = MODES[MODE].cdMul || 1;
    fireCd = alt ? pat.cd : w.spin ? (w.spin[0] + (w.spin[1] - w.spin[0]) * spin) * cdMul : w.charge ? 0.3 : w.cd * cdMul;
    const gun = muzzleAt(k);   // (the server fires a player's pilot from the same gun tips)
    const muzzle = volley(me, now, pat, gun, (k === "bolt" && !alt || k === "laser" && alt) ? boltLock(me, gun) : undefined, mul);
    const [name, vol, pitch] = pat.sfx;
    const packed = alt && k === "orb" ? audioCue("shockBeam") : k === "minigun" ? continuousFire("me", "minigun", me.x, me.y, now, !!alt)
      : k === "laser" ? continuousFire("me", "laser", me.x, me.y, now, !!alt)
      : packPlay(alt ? ALT_SOUND[k] || "" : k === "holy" ? "p_fire_gren" : "p_fire_" + k, 0.9);
    if (!packed) sfx(name, vol, w.charge ? pitch * (1.3 - 0.4 * mul) : pitch) || blip(160, 0.1, "sawtooth");   // a fuller charge sounds deeper
    if (pat.fx) MUZZLE_FX[pat.fx](muzzle);
    shotFeel(k, muzzle, pat.kick * (w.charge ? mul : 1), ...pat.feel);
    if (pat.guided && !serverRun) startGuide(muzzle);
    else if (pat.guided) {   // on the server: the copy shown here (predictShot) is steered, and the server steers its own alike
      const g = shots.filter(o => o.owner === srv.id && o.kind === K.NUKE && !o.boom).pop();
      if (g) startGuide(g);
    }
    if (k !== "tele" && !serverRun) spend(k, alt ? pat.cost : 1);   // on the server, ammo is its count   // the teleporter spends a charge on the jump, not on the throw
  }
  // ---- the minigun spins up while the trigger is held; the charge cannon charges while held and fires on release
  let spin = 0, charge = 0, railCharge = 0;   // railCharge: the railgun's alt, held
  let miniHeat = 0;   // how hot the minigun's barrels are: they smoke for a while after it stops
  const MINI_SMOKE = ["rgb(150,152,165)", "rgb(170,170,182)", "rgb(130,132,148)"];
  function triggerTick(dt, now, ready, held) {
    const w = WEAPONS[me.weapon];
    if (miniHeat > 0) {   // hot barrels smoke once the firing stops, thinning as they cool
      const firing = held && me.weapon === "minigun" && playing && !me.dead;
      if (!firing && me.weapon === "minigun" && !me.dead && Math.random() < miniHeat * dt * (lowQ ? 20 : 55)) {
        const R = 46 * sizeOf(me.lv), nx = me.x + Math.cos(me.a) * R, ny = me.y + Math.sin(me.a) * R;
        puff(nx, ny, me.vx * 0.8 + (Math.random() - 0.5) * 30, me.vy * 0.8 - 25 - Math.random() * 30, 1.1 + Math.random() * 0.9, 7 + Math.random() * 7, MINI_SMOKE[Math.random() * 3 | 0], 2);
      }
      miniHeat = Math.max(0, miniHeat - dt * (firing ? 0 : 0.3));
    }
    if (w.spin && held && spin === 0 && playing && !me.dead) packPlay("p_spin_minigun", 0.7);   // the barrels wind up
    spin = w.spin && held && playing && !me.dead ? Math.min(1, spin + dt / w.spin[2]) : Math.max(0, spin - dt * 1.5);
    // a sound pack's loops: the hum of the gun in your hands, and the laser's beam while the trigger is held
    const alive = playing && !me.dead;
    const altAutomatic = (me.weapon === "minigun" || me.weapon === "laser") && (altFiring || keys.has("KeyC"));
    packLoop("hum", alive ? { rail: "p_hum_rail", gamma: "p_hum_gamma" }[me.weapon] || null : null, 0.22);
    const beam = alive && (held || altAutomatic) && roundLive && me.weapon === "laser" && me.arsenal.laser > 0;
    if (!beam && me.weapon === "laser" && firingSounds.has("me")) stopContinuous("me");
    if (((!held && !altAutomatic) || !alive || !roundLive) && firingSounds.has("me")) stopContinuous("me");
    me.gauntOn = alive && me.weapon === "gauntlet" && (held || now < (me.lungeUntil || 0));
    if (me.gauntOn) {   // the blade grinds whatever rock it touches: sparks fly and it bites in
      const nx = me.x + Math.cos(me.a) * (binR(me.lv) + 14), ny = me.y + Math.sin(me.a) * (binR(me.lv) + 14), b = solidAny(nx, ny);
      if (b) {
        if (Math.random() < 0.8) sparkShower(nx, ny, -Math.cos(me.a) + (Math.random() - 0.5), -Math.sin(me.a) + (Math.random() - 0.5), 0.9);
        if (now - (me.grindAt || 0) > 140) { me.grindAt = now; carveAt(b, nx, ny, 12, true); packPlay("p_melee_hit", 0.5, nx, ny); }
      }
    }
    packLoop("melee", me.gauntOn ? "p_melee_run" : null, 0.55);
    if (!w.charge) { charge = 0; return held && ready; }
    if (held && playing && !me.dead) {
      const was = charge;
      charge = Math.min(1, charge + dt / w.charge);
      if (Math.floor(was * 6) !== Math.floor(charge * 6)) sfx("p_charge", 0.3, 0.8 + charge * 0.5) || blip(300 + charge * 500, 0.06, "sine");   // a rising whine
      if (charge === 1 && was < 1) impacts.push({ x: me.x, y: me.y, t: 0, r: 60, col: w.col });
      return false;
    }
    if (charge > 0 && ready) shoot(now, false, Math.max(0.25, charge));
    charge = 0;
    return false;
  }
  // ---- the teleporter: the first shot throws a beacon, the next one jumps you onto it; anyone sitting there is
  // telefragged (a stationary shot that kills whatever bin it overlaps, judged by the victim like any other hit)
  const TELEFRAG = { shot: [K.TFRAG, 0] };
  const myBeacon = () => shots.find(s => s.mine && s.kind === K.BEACON && s.life > 0);
  function teleport(now) {
    const b = myBeacon();
    b.life = 0;
    for (const [x, y] of [[me.x, me.y], [b.x, b.y]]) {
      rings.push({ x, y, t: 0, r: 160, col: "143,240,255", warp: true, dur: 0.4, w: 12 });
      for (let k = 0; k < 24; k++) { const a = Math.random() * 6.283, v = 100 + Math.random() * 300; puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.5, 2.5, k % 2 ? "#8ff0ff" : "#ffffff"); }
    }
    me.x = b.x; me.y = b.y; me.vx = me.vy = 0;
    volley(me, now, TELEFRAG, { x: b.x, y: b.y });
    me.vx = b.vx * 0.5; me.vy = b.vy * 0.5;
    audioCue("teleport");
    flash = Math.max(flash, 0.15);
    me.teleN = Math.max(0, (me.teleN || 0) - 1); renderTele();
  }
  // the teleporter is a tool, not a gun: T (or its button) throws the beacon, then jumps you onto it. A pick-up
  // gives three jumps; the gun in your hands stays where it is
  let teleCdUntil = 0;
  function useTele(now) {
    if (serverRun) {   // the server throws the beacon and makes the jump; my controls carry the press
      if (playing && !me.dead && now >= teleCdUntil && (me.teleN > 0 || shots.some(s => mySrvShot(s) && s.kind === K.BEACON && s.life > 0))) { srv.teleN++; teleCdUntil = now + 350; }
      return;
    }
    if (!playing || me.dead || guided || now < teleCdUntil) return;
    if (myBeacon()) { teleport(now); teleCdUntil = now + 350; return; }
    if (!(me.teleN > 0)) return;
    const w = WEAPONS.tele, muzzle = volley(me, now, w, muzzleAt("tele"));
    sfx(...w.sfx);
    shotFeel("tele", muzzle, w.kick, ...w.feel);
    teleCdUntil = now + 350;
  }
  function renderTele() {
    const n = me.teleN || 0, teleChip = document.getElementById("teleChip"), teleBtn = document.getElementById("teleBtn");
    teleChip.hidden = teleBtn.hidden = !playing || !n;
    teleChip.textContent = "TELEPORT ×" + n + (COARSE ? "" : " · T");
    teleBtn.lastChild.nodeValue = "×" + n;
  }
  document.getElementById("teleBtn").addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); useTele(performance.now()); });
  addEventListener("keydown", e => { if (e.code === "KeyT" && !e.repeat && e.target.tagName !== "INPUT") useTele(performance.now()); });
  // ---- the guided nuke (the nuke's alt fire): you steer it, the view rides along, firing again sets it off.
  // Its course goes out with my state (gw) so everyone sees the same flight
  let guided = null, guideArmed = false, guideOut = null, guideOutUntil = 0, camBackUntil = 0;
  function startGuide(s) {
    guided = s; guideArmed = false; s.life = SHOTS[K.NUKE].life;
    announce("GUIDED NUKE", COARSE ? "steer it · tap fire to blow it" : "steer it · fire again to blow it", "#ffe14d");
  }
  // steering input (ix, iy) goes to the missile while it flies; returns true while guiding
  function guideTick(dt, now, ix, iy, held) {
    if (!guided) return false;
    if (guided.life <= 0 || guided.boom || me.dead || !shots.includes(guided)) { endGuide(now, false); return false; }
    if (!held) guideArmed = true;
    else if (guideArmed) { endGuide(now, true); return false; }
    const v = Math.hypot(guided.vx, guided.vy) || 1;
    let a = Math.atan2(guided.vy, guided.vx);
    if (Math.hypot(ix, iy) > 0.15) a = lerpAng(a, Math.atan2(iy, ix), Math.min(1, 3.2 * dt));
    guided.vx = Math.cos(a) * v; guided.vy = Math.sin(a) * v;
    guideOut = [guided.id, Math.round(guided.x), Math.round(guided.y), Math.round(guided.vx), Math.round(guided.vy), 0];
    if (serverRun) { srv.gx = ix; srv.gy = iy; }   // (sent with my controls: the server turns its nuke the same way)
    return true;
  }
  function endGuide(now, boom) {
    const s = guided;
    guided = null; camBackUntil = now + 700;
    if (serverRun) { srv.gx = srv.gy = 0; if (boom) srv.gb = (srv.gb || 0) + 1; }
    guideOut = [s.id, Math.round(s.x), Math.round(s.y), 0, 0, boom || s.boom ? 1 : 0]; guideOutUntil = now + 600;
    if (boom) detonate(s, now);
  }
  // someone else's guided nuke: follow their reported course, and blow it where they did
  function guideRemote(owner, gw) {
    const s = shots.find(o => o.id === gw[0] && o.owner === owner && o.kind === K.NUKE);
    if (!s || s.boom) return;
    s.x = s.px = clamp(gw[1], 0, W); s.y = s.py = clamp(gw[2], 0, H);
    if (gw[5] === 1) { detonate(s, performance.now()); return; }
    s.vx = clamp(gw[3], -900, 900); s.vy = clamp(gw[4], -900, 900); s.life = Math.max(s.life, 1);
  }
  // ---- the gamma orb zaps every enemy near it as it flies (each victim judges its own zaps, like any hit)
  function gammaZap(s, dt, now) {
    s.zap = (s.zap || 0) - dt;
    if (s.zap > 0) return;
    s.zap = GAMMA_ZAP.every;
    const near = o => Math.hypot(o.x - s.x, o.y - s.y) < GAMMA_ZAP.r && !fixedCover(s.x, s.y, o.x, o.y), zap = o => arcs.push({ x1: s.x, y1: s.y, x2: o.x, y2: o.y, t: 0, col: "125,255,138" });
    let any = false;
    if (playing && !me.dead && canHurt(s, me, "me") && near(me)) { zap(me); any = true; hurtMe(s, now, GAMMA_ZAP.dmg * s.m, K.GAMMA); }
    for (const b of bots) if (!b.dead && canHurt(s, b, b.id) && near(b)) { zap(b); any = true; botHurt(b, GAMMA_ZAP.dmg * s.m, s.id, now, false, K.GAMMA); }
    for (const [rid, r] of remotes) if (!botById.has(rid) && !r.dead && canHurt(s, r, rid) && near(r)) { zap(r); any = true; }   // they judge their own
    if (any) audioCue("demonicZap", s.x, s.y);
  }
  // feel, scaled per gun: recoil shoves the bin back, the view jolts, the screen shakes and the muzzle lights up
  function shotFeel(k, muzzle, kick, camK, shk, flashR) {
    const bx = Math.cos(me.a), by = Math.sin(me.a);
    me.vx -= bx * kick; me.vy -= by * kick;
    if (serverRun) { srv.kx = (srv.kx || 0) - bx * kick; srv.ky = (srv.ky || 0) - by * kick; }   // (goes with my next command: a replay of it recoils too)
    camKick.x += bx * camK; camKick.y += by * camK; shake = Math.max(shake, shk);
    if (flashR) impacts.push({ x: muzzle.x, y: muzzle.y, t: 0, r: flashR, col: WEAPONS[k].col || "#ffb43c" });
    for (let j = 0; j < 6; j++) puff(muzzle.x, muzzle.y, bx * 200 + (Math.random() - .5) * 160, by * 200 + (Math.random() - .5) * 160, 0.25, 2.5, k === "laser" ? "#bff9ff" : FIRE_COLS[j % 4]);
  }
  function spend(k, n) {
    if (k === "fire") return;
    const before = me.arsenal[k];
    me.arsenal[k] = Math.max(0, before - n);
    const low = Math.max(1, Math.ceil(WEAPONS[k].ammo * 0.15));
    if (before > low && me.arsenal[k] <= low) audioCue("lowAmmo");
    if (me.arsenal[k] > 0 || controlledShots(k).length) { renderAmmo(k); return; }
    delete me.arsenal[k];
    packPlay("p_noammo", 0.8);   // the empty click
    // out of ammo: fall back to another gun you carry (never auto-pick the nuke), else the fireball
    me.weapon = WEAPON_KEYS.find(w => w !== "fire" && w !== "nuke" && w !== "holy" && w !== "tele" && w !== "gauntlet" && me.arsenal[w]) || "fire";
    renderWeapon();
  }
  // quick dodge: a burst forward (or toward where you steer) with a moment of invulnerability
  function dash(now) {
    me.dashTimes = (me.dashTimes || []).filter(t => now - t < 450);
    if (!playing || me.dead || energy < 25 || now < dashReadyAt || me.dashTimes.length >= 1) return;
    me.dashTimes.push(now);
    const cmd = serverRun && srv.joined;   // a command flight: the dash goes in my next command (pilotMove), here and on the server
    if (serverRun) srv.dashN++;
    if (!cmd) { energy -= 25; energyRegenAt = now + 700; }
    dashReadyAt = now + 150;
    me.dashAt = now;
    const sm = Math.hypot(steer.x, steer.y);
    const a = sm > 0.2 ? Math.atan2(steer.y, steer.x) : me.a;
    me.tdir = a; dashBurst(me);
    if (!cmd) { me.vx += Math.cos(a) * 900; me.vy += Math.sin(a) * 900; me.inv = Math.max(me.inv, now + 280); }
    for (let k = 0; k < 22; k++) {
      const b = a + Math.PI + (Math.random() - 0.5) * 1.2, v = 120 + Math.random() * 220;
      puff(me.x, me.y, Math.cos(b) * v, Math.sin(b) * v, 0.45, 2.4, k % 2 ? "#bff9ff" : "#ffffff");
    }
    sfx("dash", 0.8) || blip(520, 0.12, "triangle");
  }
  let killer = "";
  function killedBy(owner) {
    const r = remotes.get(owner);
    if (r) killer = r.name;
  }
  const arsenalEl = document.getElementById("arsenal");
  const owned = () => WEAPON_SLOTS.filter(hasWeapon);
  const ammoFill = k => Number.isFinite(me.arsenal[k]) ? Math.min(1, (me.arsenal[k] || 0) / WEAPONS[k].ammo) : 1;
  const chipText = () => { const n = me.arsenal[me.weapon] || 0, alt = WEAPONS[me.weapon].alt, count = controlledShots(me.weapon).length;
    const armed = me.weapon === "mine" ? controlledShots("mine").filter(s => SHOTS[K.MINE].life - s.life >= MINE_ARM).length : 0;
    return WEAPONS[me.weapon].name + (Number.isFinite(n) ? " · " + n : "") + (me.overheat && alt && alt.heat ? " · OVERHEATED" : "") + (count ? " · ACTIVE " + count : "") + (me.weapon === "mine" && count ? " · ARMED " + armed : "")
      + (Number.isFinite(n) && n <= Math.max(1, Math.ceil(WEAPONS[me.weapon].ammo * 0.15)) ? " · LOW AMMO" : "")
      + (me.weapon === "gauntlet" ? (performance.now() >= lungeReady ? " · LUNGE READY" : " · LUNGE " + Math.ceil((lungeReady - performance.now()) / 100) / 10 + "s") : "")
      + (alt ? " · " + (COARSE ? "ALT: " : "right click: ") + alt.name + " [" + (alt.load ? "1–3" : alt.cost) + " ammo]" : "")
      + (me.weapon === "rocket" ? " · LOADED " + rocketLoad + "/3 · release ALT to fire" : ""); };
  // after a shot: just the numbers of that gun
  function renderAmmo(k) {
    const n = me.arsenal[k], slot = arsenalEl.querySelector(`[data-w="${k}"]`);
    if (k === me.weapon) document.getElementById("wpn").lastChild.nodeValue = chipText();
    if (!slot) return;
    slot.querySelector("span").textContent = Number.isFinite(n) ? n : "∞";
    if (k !== "laser") slot.querySelector("b").style.setProperty("--f", ammoFill(k).toFixed(3));
  }
  function renderWeapon() {
    const w = WEAPONS[me.weapon];
    document.getElementById("weaponHint").textContent = weaponHint(me.weapon);
    const el = document.getElementById("wpn");
    el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${ICONS[me.weapon]}"/></svg>`;
    el.append(chipText());
    el.style.color = w.col || "";
    // the weapon bar: every gun you carry, tap/click, fixed numeric slots or Q/E to switch
    const list = owned();
    arsenalEl.hidden = !playing || list.length < 2;
    arsenalEl.innerHTML = list.map((k, i) => {
      const n = me.arsenal[k];
      return `<button type="button" class="slot${k === me.weapon ? " on" : ""}" data-w="${k}" style="--c:${WEAPONS[k].col || "#ffb43c"}" aria-label="${WEAPONS[k].name}">`
        + `<i>${weaponKey(k)}</i><svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${ICONS[k]}"/></svg><span>${Number.isFinite(n) ? n : "∞"}</span>`
        + `<b style="--f:${(Number.isFinite(n) ? ammoFill(k) : 1).toFixed(3)}"></b></button>`;
    }).join("");
    const alt = WEAPONS[me.weapon].alt;
    document.getElementById("altBtn").hidden = !playing || !COARSE || !alt;
    if (alt) document.getElementById("altName").textContent = (COMPACT.matches ? alt.name : alt.name + " · " + (alt.load ? "1–3" : alt.cost) + " AMMO").toUpperCase();   // a phone: just the name
  }
  function selectWeapon(k) {
    if (!hasWeapon(k) || k === me.weapon) return;
    if (railCharge > 0) { railCharge = 0; audioCue("chargeCancel"); }
    cancelRocketLoad(); stopContinuous("me");
    me.weapon = k; fireCd = Math.max(fireCd, 0.15);
    packPlay("p_change", 0.6) || blip(520, 0.05, "square");
    renderWeapon();
  }
  function cycleWeapon(dir) {
    const list = owned(), i = list.indexOf(me.weapon);
    if (list.length > 1) selectWeapon(list[(i + dir + list.length) % list.length]);
  }
  arsenalEl.addEventListener("pointerdown", e => {
    const b = e.target.closest(".slot");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    selectWeapon(b.dataset.w);
  });
  addEventListener("keydown", e => {
    if (!playing || e.target.tagName === "INPUT" || e.repeat) return;
    if (/^Digit[0-9]$/.test(e.code)) { const k = WEAPON_SLOTS[(+e.code.slice(5) || 10) - 1 + (e.altKey ? 10 : 0)]; e.preventDefault(); if (k) selectWeapon(k); }   // 1-9, then 0 for the 10th
    else if (e.code === "KeyQ") cycleWeapon(-1);
    else if (e.code === "KeyE") cycleWeapon(1);
  });
  // the mouse wheel does not switch guns: on a touch-surface mouse (Magic Mouse) a resting finger scrolls all
  // the time. It is only kept from scrolling the page
  cv.addEventListener("wheel", e => { if (playing) e.preventDefault(); }, { passive: false });
  function nukeTouches(s) {
    // (my own nuke never sets itself off on me: on the game server the one shown here is the server's, not "mine")
    if (!s.mine && !mySrvShot(s) && playing && !me.dead && segHit(s, me.x, me.y, 20 + 26 * sizeOf(me.lv))) return true;
    for (const [id, r] of remotes) if (!r.dead && id !== s.owner && segHit(s, r.x, r.y, 20 + 26 * sizeOf(r.lv))) return true;
    // and the pilots flown here: my bots, or on the server every pilot (players included), which are not "remotes" there
    for (const b of bots) if (!b.dead && b.id !== s.owner && !(s.mine && b === me) && segHit(s, b.x, b.y, 20 + 26 * sizeOf(b.lv || 1))) return true;
    for (const k of world.rocks) if (!grabbed.has(k.key) && k.age >= 0.6 && segHit(s, k.x, k.y, k.r + 10)) return true;
    return false;
  }
  const booms = [];   // big-bomb fireballs on screen
  let flash = 0;
  // the holy bomb in flight: it slows down, bounces off the fence and bodies, glows brighter as the fuse runs out
  // and sings its choir once, a couple of seconds before it goes off
  function bounceFlight(s, dt, damp) {   // slows down, bounces off the fence and bodies (holy bomb, beacon)
    const k = Math.exp(-damp * dt); s.vx *= k; s.vy *= k;
    if (s.x < 0 || s.x > W) { s.vx = -s.vx * 0.6; s.x = clamp(s.x, 0, W); }
    if (s.y < 0 || s.y > H) { s.vy = -s.vy * 0.6; s.y = clamp(s.y, 0, H); }
    if (solidAny(s.x, s.y)) { s.x = s.px; s.y = s.py; s.vx *= -0.5; s.vy *= -0.5; if (Math.hypot(s.vx, s.vy) > 60) packPlay("p_bounce_gren", 0.7, s.x, s.y); }
  }
  function holyFlight(s, dt) {
    bounceFlight(s, dt, 1.4);
    s.rot = (s.rot || 0) + dt * (0.6 + Math.hypot(s.vx, s.vy) / 90);   // it tumbles as it flies, slowly as it settles
    if (!s.sang && s.life < BOMBS[K.HOLY].sing) {   // its sound, heard map-wide (quieter far away), ending with the blast
      s.sang = true;
      if (!packPlay("p_holy", 1 - Math.min(0.7, Math.hypot(s.x - me.x, s.y - me.y) / 6000))) choir(s.x, s.y);
    }
    if (Math.random() < dt * (s.sang ? 60 : 25)) {
      const a = Math.random() * 6.28, v = 40 + Math.random() * 120;
      puff(s.x, s.y, Math.cos(a) * v, Math.sin(a) * v, 0.8, 2 + Math.random() * 2, Math.random() < 0.5 ? "#fff3b0" : "#ffffff");
    }
  }
  // the blast wave: a ring racing out from a big bomb (eased like its drawn ring), flinging whatever it sweeps over
  // outward as it passes: pilots, bots, rubble, wreckage, sparks, shots; the bomber's browser also shares the push on
  // the junk rocks. You feel it (shake, thump) when it reaches you, not at the flash
  const waves = [];
  function waveTick(dt) {
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i], r0 = w.r;
      w.t += dt;
      const k = Math.min(1, w.t / w.dur);
      w.r = w.max * (1 - (1 - k) * (1 - k));
      const swept = (o, id = o) => {   // each thing is pushed once, even if it flies out ahead of the front and gets caught again
        if (w.hit.has(id)) return -1;
        const d = Math.hypot(o.x - w.x, o.y - w.y);
        if (d < r0 || d >= w.r || fixedCover(w.x, w.y, o.x, o.y)) return -1;
        w.hit.add(id); return d;
      };
      const push = (o, d, mass) => { const f = w.power * Math.pow(1 - d / w.max, 0.6) / mass; o.vx += (o.x - w.x) / (d || 1) * f; o.vy += (o.y - w.y) / (d || 1) * f; };
      let d;
      if (playing && !me.dead && (d = swept(me)) >= 0) {
        push(me, d, 1);
        const near = 1 - d / w.max;
        shake = Math.max(shake, 0.3 + 1.3 * near);
        camKick.x += (me.x - w.x) / (d || 1) * 40 * near; camKick.y += (me.y - w.y) / (d || 1) * 40 * near;
        sfx("boom_low", 0.3 + 0.7 * near, w.holy ? 0.9 : 1.2) || boomSound(1.2, 300, 0.4 * near + 0.1);
      }
      for (const b of bots) if (!b.dead && (d = swept(b)) >= 0) push(b, d, 1);
      for (const b of rubble) if ((d = swept(b)) >= 0) push(b, d, Math.max(1, Math.sqrt(b.mass / 200)));
      for (const list of [hulks, frags, debris]) for (const o of list) if ((d = swept(o)) >= 0) push(o, d, 1);
      for (const o of parts) if ((d = swept(o)) >= 0) push(o, d, 2.5);
      for (const o of shots) if (!BOMBS[o.kind] && (d = swept(o)) >= 0) push(o, d, 3);
      if (w.mine) for (const r of world.rocks) if (!grabbed.has(r.key) && (d = swept(r, r.key)) >= 0) {
        push(r, d, Math.max(1, (r.r / 30) ** 2));
        r.vx = clamp(r.vx, -4000, 4000); r.vy = clamp(r.vy, -4000, 4000);
        rockMotion.set(r.slot, { slot: r.slot, gen: r.gen, at: clockNow(), x: r.x, y: r.y, vx: r.vx, vy: r.vy, by: myTag });
      }
      // a wall of dust riding the front
      for (let j = 0, n = (lowQ ? 5 : 14) * (1 - k); j < n; j++) {
        const a = Math.random() * 6.283, px = w.x + Math.cos(a) * w.r, py = w.y + Math.sin(a) * w.r, v = w.max / w.dur * 0.5 * (1 - k);
        if (px > -100 && px < W + 100 && py > -100 && py < H + 100) puff(px, py, Math.cos(a) * v, Math.sin(a) * v, 0.6, 5 + Math.random() * 6, w.holy ? "#fff3c8" : "#ffc68a", 1);
      }
      if (k >= 1) waves.splice(i, 1);
    }
  }
  function detonate(s, now) {
    if (s.boom) return;
    s.boom = true; s.life = 0;
    const bm = BOMBS[s.kind], R = bm.R, holy = !!bm.holy;
    const x = clamp(s.x, 0, W), y = clamp(s.y, 0, H), d = Math.hypot(me.x - x, me.y - y);
    const q = lowQ ? 0.35 : 1, far = R * 2.4;
    const [wr, wdur, wpow] = bm.wave;
    waves.push({ x, y, t: 0, r: 0, max: wr, dur: wdur, power: wpow, mine: s.mine, holy, hit: new Set() });   // hit: what it has pushed (objects, or keys for the junk rocks, rebuilt every frame)
    for (const b of [...bodies]) {   // a big bomb scoops a huge crater out of anything nearby (the holy one erases it)
      if (!s.mine && !b.free) continue;
      const bd = Math.hypot(b.x - x, b.y - y);
      if (bm.wipe && bd - b.r < bm.kill) carveAt(b, b.x, b.y, bm.carve, s.mine);
      else if (bd - b.r < R * 0.5) carveAt(b, x, y, bm.carve, s.mine);
    }
    booms.push({ x, y, t: 0, seed: Math.random() * 100, R, holy });
    // three shock waves: a fast bright one, a heavy one, and a faint far one, all bending the view
    rings.push({ x, y, t: 0, r: wr, col: "255,250,230", warp: true, dur: wdur, w: 46 });   // the blast wave itself
    rings.push({ x, y, t: -0.12, r: R * 0.95, col: holy ? "255,236,160" : "255,190,110", warp: true, dur: 1.2, w: 34 });
    rings.push({ x, y, t: -0.3, r: R * 1.8, col: "255,220,180", dur: 1.6, w: 14 });
    explode(x, y, Math.round(140 * q), 1300);
    const customBomb = packPlay(holy ? "p_boom_holy" : "p_boom_nuke", 1, x, y);
    if (!customBomb) {
      if (!sfx("boom_big", 1, holy ? 0.8 : 1, x, y)) boomSound(2.6, 700, 0.6);
      sfx("boom_low", 1, holy ? 0.5 : 0.6, x, y);
    }
    for (let k = 0; k < (holy ? 200 : 120) * q; k++) {   // long glowing streaks thrown out with the blast
      const a = Math.random() * 6.28, v = 700 + Math.random() * (holy ? 1600 : 1100);
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 1.2 + Math.random() * 1.2, 2 + Math.random() * 2, Math.random() < 0.5 ? (holy ? "#ffe9a0" : "#ffb43c") : "#fff2c0", 1, 0.06);
    }
    smoke(x, y, Math.round(60 * q), 560, 6);
    rings.push({ x, y, t: -0.5, r: far, col: holy ? "255,240,190" : "255,140,80", dur: 2.2, w: 22 });   // the slow heat wave rolling far out
    if (d < far) { shake = Math.max(shake, (holy ? 1.8 : 1.4) * (1 - d / far)); flash = Math.max(flash, d < R * 1.6 ? 1 : 1 - (d - R * 1.6) / (far - R * 1.6)); }
    if (!customBomb) packPlay("p_death", 1) || boomSound(2.2, 120, 0.8);
    if (canHurt(s, me, "me", true) && d < bombReach(bm) && !fixedCover(x, y, me.x, me.y)) {   // your own bomb too: get clear of it
      hurtMe(s, now, bombDmg(bm, d), s.kind, 0, d < bm.kill);
    }
    for (const b of bots) {
      const bd = Math.hypot(b.x - x, b.y - y);
      if (bd > bombReach(bm) || !canHurt(s, b, b.id, true) || fixedCover(x, y, b.x, b.y)) continue;
      botHurt(b, bd < bm.kill ? 99 : bombDmg(bm, bd) * selfMul(s, b.id), s.id, now, bd < bm.kill, s.kind);
    }
    if (!s.mine) return;
    // the shooter wipes out everything in the blast and shares the result
    const take = (key, pts) => { grabbed.add(key); pushCapped(myGrabs, key, 40); me.score += pts; };
    for (const k of world.rocks) if (!grabbed.has(k.key) && Math.hypot(k.x - x, k.y - y) < R) take(k.key, 2);
    const ev = eventAt(clockNow());
    if (ev.active && ev.type === "meteors") for (let i = 0; i < 40; i++) {
      const m = meteor(ev, i);
      if (m && !grabbed.has(m.key) && Math.hypot(m.x - x, m.y - y) < R) take(m.key, 2);
    }
    if (ev.active && ev.type === "aliens") for (let u = 0; u < UFO_N; u++) {
      const key = "e" + ev.cyc + "u" + u, p = ufoPos(ev, u, ev.et);
      if (!grabbed.has(key) && Math.hypot(p.x - x, p.y - y) < R) { take(key, 15); gainXp(5, now); }
    }
    showScore();
  }
  // armour is counted in lives like health, so it shows as a percentage of your full health too
  function renderShield() {
    document.getElementById("shieldChip").hidden = me.shield <= 0;
    document.getElementById("shieldNum").textContent = Math.ceil(me.shield / .03) + " ARMOR";
  }
  let shieldHitAt = -1e9;
  function hurt(now, dmg = 1, force = false, kind = -1, ang = 0) {   // kind, ang: the shot that hit (picks how the bin dies)
    if (!roundLive || serverRun) return false;   // on the authoritative server only its snapshots change my health
    if (me.dead || (!force && now < me.inv)) return false;
    // armour soaks part of the hit first (black hole and the nuke's core ignore it)
    if (!force && me.shield > 0) {
      const absorbed = absorbArmor(me, dmg);   // armour soaks part of the hit, the rest gets through
      dmg = Math.round((dmg - absorbed) * 1000) / 1000;   // no float dust left behind
      shieldHitAt = now; renderShield();
      impacts.push({ x: me.x, y: me.y, t: 0, r: 90 * sizeOf(me.lv), col: "#6fc2ff" });
      sfx("shield_hit", 0.8) || blip(640, 0.12, "triangle");
      if (dmg <= 0) { me.hazardAt = now + 600; shake = Math.max(shake, 0.15); return true; }
    }
    me.lives = Math.max(0, Math.round((me.lives - dmg) * 1000) / 1000);
    me.hitAt = now;
    hurtFlash = Math.min(1, hurtFlash + 0.35 + dmg * 0.4);
    me.hazardAt = now + 600; shake = Math.max(shake, 0.12 + Math.min(0.3, dmg * 0.2));
    renderHearts(true);
    sfx("hit", 1, 0.85) || blip(110, 0.3, "square");
    if (me.lives <= 0) {
      stats.deaths++; stats.streak = 0;
      me.ds = deathPiecesOf(kind);   // pieces the bin breaks into: 1 = intact dead hulk, 2-4 = shattered (always pieces for a blast)
      me.dk = deathStyleOf(kind); me.da = ang;
      deathFx(me, me.ds, me.dk, me.da);
      me.dead = true; me.respawnAt = now + 3000; me.vx = me.vy = 0;
      spillStars(now);
      const trophy = me.weapon !== "fire" && me.weapon !== "tele" ? me.weapon : owned().find(k => k !== "fire" && k !== "tele");
      if (trophy && !MODES[MODE].only) dropGun(me.x, me.y, trophy, me.arsenal[trophy]);
      me.lv = levelAfterDeath(me.lv); me.xp = XP_STEPS[me.lv - 1];   // no progression penalty
      baseArsenal(); me.ampUntil = 0; me.fc = -1; renderWeapon();   // its guns are lost with it (and a carried flag goes home)
      renderLevel();
      packPlay("p_death", 0.7) || blip(60, 0.6, "sawtooth");
    } else explode(me.x, me.y, 18, 180);
    return true;
  }
  function gainXp(v) { me.carry += v; } // salvage still belongs to its game mode; no combat progression
  // a trophy: the gun drops where its pilot died (mine, or one of my bots')
  function dropGun(x, y, type, ammo) {
    if (!(ammo > 0) || !Number.isFinite(ammo)) return;
    const id = myTag + "g" + (gunDropSeq++).toString(36), d = [id, Math.round(x), Math.round(y), WEAPON_KEYS.indexOf(type), Math.min(999, Math.ceil(ammo)), Date.now()];
    myGunDrops.push(d); if (myGunDrops.length > 6) myGunDrops.shift();
    gunDrops.set(id, { x: d[1], y: d[2], type, ammo: d[4], born: performance.now() });
  }
  function spillStars() { me.carry = 0; }   // stars are gone from the game: nothing is spilled
  function dropStar(d, id, j, now) {
    const hs = strHash(id), a = hash(j, hs, 41) * 6.283 + j, r = 50 + hash(j, hs, 42) * 190;
    const k = Math.min(1, (now - d.born) / 600), e = 1 - (1 - k) * (1 - k);
    return { key: "d" + id + "." + j, x: clamp(d.x + Math.cos(a) * r * e, 40, W - 40), y: clamp(d.y + Math.sin(a) * r * e, 40, H - 40), ready: k >= 1 };
  }
  function respawn(now) {
    killer = "";
    audioCue("respawn");
    me.dead = false; me.lives = maxLivesOf(me.lv); me.inv = now + 2000; clearArmor(me); renderShield();
    Object.assign(me, spawnPoint(me.tm)); me.vx = 0; me.vy = -60;
    renderHearts(false);
  }

