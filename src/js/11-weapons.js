  // ---------- fire & damage ----------
  // shots leave from the tip of the gun drawn on the wing (left and right in turn), not from the middle of the bin
  const mountsOf = w => w === "nuke" || w === "bolt" ? [[256, 150]] : [[50, 126], [256, 150]];   // art pixels, shared with drawMounts
  const BARREL = { laser: 60, rocket: 50, triple: 42, nuke: 96, scatter: 42, rail: 86, mine: -10, orb: 40, bolt: 56, shard: 48 };   // tip, in mount units
  let gunSide = 0;
  function muzzleAt(weapon) {
    const ms = mountsOf(weapon), [mx, my] = ms[gunSide++ % ms.length];
    const S = BOT * sizeOf(me.lv), t = BARREL[weapon] * S / 320 * 1.35, R = me.a + Math.PI / 2 - SPRITE_TILT;
    // sprite frame: the mount, then along its tilted barrel; then into the world the way drawBot rotates the bin
    const lx = (mx / 320 - 0.5) * S + Math.sin(SPRITE_TILT) * t, ly = (my / 320 - 0.5) * S - Math.cos(SPRITE_TILT) * t;
    return { x: me.x + lx * Math.cos(R) - ly * Math.sin(R), y: me.y + lx * Math.sin(R) + ly * Math.cos(R) };
  }
  // one scatter record on the wire becomes the same ten pellets everywhere
  function scatterPellets(s) {
    for (let k = 0; k < 10; k++) {
      const da = (k - 4.5) * 0.066, f = 0.86 + ((k * 7) % 10) * 0.028, c = Math.cos(da), sn = Math.sin(da);
      shots.push({ ...s, id: s.id + "p" + k, ox: s.x, oy: s.y, vx: (s.vx * c - s.vy * sn) * f, vy: (s.vx * sn + s.vy * c) * f });
    }
  }
  // a pellet hurts more the closer it was fired from (the classic shotgun falloff); it also shoves what it hits
  const pelletDmg = s => { const d = Math.hypot(s.x - s.ox, s.y - s.oy); return d < 170 ? 0.27 : d < 320 ? 0.18 : 0.09; };
  // how someone else's shot sounds here (quieter with distance)
  const shotSound = (kind, x, y) => { const [name, vol, pitch] = SHOTS[kind].sfx; sfx(name, vol, pitch, x, y); };
  const shotDmg = s => MODES[MODE].instagib && s.kind === K.RAIL ? 99 : (s.kind === K.PELLET ? pelletDmg(s) : SHOTS[s.kind].dmg) * (s.m || 1);
  // team modes: whose side a shot is on (no friendly fire)
  const teamOfShot = s => s.mine ? me.tm : botById.has(s.owner) ? botById.get(s.owner).tm : remotes.has(s.owner) ? remotes.get(s.owner).tm : undefined;
  // in team modes a shot whose shooter's team hasn't come in yet hurts nobody (it would be friendly fire half the time)
  const friendly = (s, tm) => isTeams() && onTeam({ tm }) && (teamOfShot(s) === undefined || teamOfShot(s) === tm);
  // THE rule for whether a shot may hurt someone (id: their key, "me" for me): alive, not the shooter, not on the
  // shooter's team; my own shots never hurt me. Every hit, splash, blast, homing and chain asks this.
  // the shooter's own shot: it only hurts them through a blast (blast = true: rockets, plasma, mines, nukes, combos)
  const ownShot = (s, o, id) => (o === me && s.mine) || id === s.owner;
  const SELF_DMG = 0.6;   // your own blast hurts you a bit less than it hurts others
  const canHurt = (s, o, id, blast = false) => ownShot(s, o, id) ? blast && !o.dead && (o !== me || playing)
    : !o.dead && !friendly(s, o.tm) && (o !== me || (playing && !s.mine));
  // I take damage from shot s: its shooter gets the credit, unless it was my own (then nobody does)
  function hurtMe(s, now, dmg, kind = s.kind, ang = 0, force = false) {
    if (!hurt(now, s.mine ? dmg * SELF_DMG : dmg, force, kind, ang)) return false;
    if (s.mine) { if (me.dead) killer = "your own blast"; return true; }
    pushCapped(hitBy, s.id, 12);
    if (me.dead) { meKilled(s.id); killedBy(s.owner); }
    return true;
  }
  const selfMul = (s, id) => id === s.owner ? SELF_DMG : 1;
  // shard cannon: one record becomes six hot shards that bounce off walls and planets
  function shardSpray(s) {
    for (let k = 0; k < 6; k++) {
      const da = (k - 2.5) * 0.07, f = 0.9 + ((k * 5) % 6) * 0.04, c = Math.cos(da), sn = Math.sin(da);
      shots.push({ ...s, id: s.id + "s" + k, vx: (s.vx * c - s.vy * sn) * f, vy: (s.vx * sn + s.vy * c) * f, bn: 0 });
    }
  }
  // a rail slug (or a laser) through a plasma orb sets it off: a huge blast credited to whoever pulled the trigger
  function comboBlast(o, s, now) {
    o.combo = true; o.life = 0; o.boom = true;
    const big = s.kind === K.RAIL, R = big ? 300 : 190, base = (big ? 2.4 : 1.1) * (s.m || 1), x = o.x, y = o.y;
    const own = s.mine || botById.has(s.owner);
    for (const b of [...bodies]) if (Math.hypot(b.x - x, b.y - y) - b.r < R * 0.5 && (own || b.free)) carveAt(b, x, y, big ? 130 : 80, own);
    rings.push({ x, y, t: 0, r: R * 1.4, col: "160,235,255", warp: true, dur: 0.7, w: big ? 22 : 12 });
    rings.push({ x, y, t: -0.08, r: R * 0.9, col: "255,255,255", dur: 0.45, w: 8 });
    impacts.push({ x, y, t: 0, r: R * 0.7, col: "#9fe8ff" });
    explode(x, y, lowQ ? 50 : 140, big ? 820 : 520);
    for (let k = 0; k < (lowQ ? 20 : 50); k++) { const a = Math.random() * 6.283, v = 200 + Math.random() * 700; puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.5 + Math.random() * 0.5, 2 + Math.random() * 3, k % 2 ? "#6fd8ff" : "#ffffff"); }
    shove(x, y, R * 1.5, big ? 900 : 500);
    const d = Math.hypot(me.x - x, me.y - y);
    if (d < 1600) { shake = Math.max(shake, (big ? 0.7 : 0.35) * (1 - d / 1600)); if (big) flash = Math.max(flash, 0.35 * (1 - d / 1600)); }
    sfx(big ? "boom_big" : "boom_small", 1, big ? 1.25 : 1.4, x, y);
    if (s.mine) floaters.push({ x, y: y - 60, t: 0, txt: "COMBO!", gold: true });
    if (canHurt(s, me, "me", true) && d < R + 26 * sizeOf(me.lv)) {
      me.vx += (me.x - x) / (d || 1) * 700; me.vy += (me.y - y) / (d || 1) * 700;
      hurtMe(s, now, base * Math.max(0.25, 1 - d / R), K.ORB);
    }
    for (const b of bots) {
      if (!canHurt(s, b, b.id, true)) continue;
      const bd = Math.hypot(b.x - x, b.y - y);
      if (bd < R + 26 * sizeOf(b.lv || 1)) { b.vx += (b.x - x) / (bd || 1) * 700; b.vy += (b.y - y) / (bd || 1) * 700; botHurt(b, base * Math.max(0.25, 1 - bd / R) * selfMul(s, b.id), s.id, now, false, K.ORB); }
    }
  }
  // the rail slug goes straight through bins and junk (each one once), only planets and walls stop it
  function railOnce(s, key) { if (!s.hits) s.hits = new Set(); if (s.hits.has(key)) return false; s.hits.add(key); return true; }
  // its beam is drawn at once along the whole path, so the shot reads as instant
  const beams = [];
  const arcs = [];   // lightning jumping from the bin it hit to the next one
  const BEAM_T = 1.1;   // a rail trail lingers: the hot core goes fast, the spiral slowly unwinds
  function railBeam(x, y, vx, vy) {
    const v = Math.hypot(vx, vy) || 1, dx = vx / v, dy = vy / v, max = 4200 * SHOTS[K.RAIL].life;
    let L = 0;
    while (L < max) {
      L += 30;
      const px = x + dx * L, py = y + dy * L;
      if (px < 0 || px > W || py < 0 || py > H) break;   // the slug bores through bodies, only the fence stops it
    }
    beams.push({ x1: x, y1: y, x2: x + dx * L, y2: y + dy * L, t: 0 });
    if (beams.length > 12) beams.shift();
  }
  // lightning locks on: the nearest enemy within ~30° of where you point and within reach gets the bolt
  const BOLT_LOCK_R = 800, BOLT_LOCK_A = 0.55;
  function boltLock(p, from) {
    const ox = from ? from.x : p.x, oy = from ? from.y : p.y;
    let best, score = Infinity;
    for (const [id, r] of remotes) {
      if (r.dead || id === p.id || mates(r, p)) continue;
      const dx = r.x - ox, dy = r.y - oy, d = Math.hypot(dx, dy), da = Math.abs(angD(Math.atan2(dy, dx) - p.a));
      if (d < BOLT_LOCK_R && da < BOLT_LOCK_A && d * (1 + da * 2) < score) { score = d * (1 + da * 2); best = Math.atan2(dy, dx); }
    }
    return best;
  }
  // and it jumps on: up to two more enemies close to the one it hit, each taking a little less
  const CHAIN_R = 340, CHAIN_DMG = 0.14, CHAIN_JUMPS = 2;
  function boltChain(s, hx, hy, hitId, now) {
    if (s.chained) return;
    s.chained = true;
    const done = new Set([hitId]);
    let x = hx, y = hy;
    for (let j = 0; j < CHAIN_JUMPS; j++) {
      let best = null, bd = CHAIN_R;
      const consider = (id, o) => { if (done.has(id) || !canHurt(s, o, id)) return; const d = Math.hypot(o.x - x, o.y - y); if (d < bd) { bd = d; best = { id, o }; } };
      consider("me", me);
      for (const [id, r] of remotes) consider(id, r);
      if (!best) return;
      const t = best.o, a = Math.atan2(t.y - y, t.x - x);
      done.add(best.id);
      arcs.push({ x1: x, y1: y, x2: t.x, y2: t.y, t: 0 });
      impact(t.x, t.y, "#bfefff", 1);
      sfx("laser", 0.35, 2.2, t.x, t.y);
      const dmg = CHAIN_DMG * (1 - j * 0.25) * (s.m || 1), cid = s.id + "c" + j;
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
    const hit = (o, id, rad) => {
      const d = Math.hypot(o.x - s.x, o.y - s.y), R = R0 + rad;
      if (d > R || id === s.direct || !canHurt(s, o, id, true)) return 0;
      o.vx += (o.x - s.x) / (d || 1) * push; o.vy += (o.y - s.y) / (d || 1) * push;
      return (hi * (1 - d / R) + lo) * m;
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
    if (s.kind === K.ORB) {   // plasma: a blue-white flash, a warping shock ring, crackling sparks, a sizzle
      impacts.push({ x, y, t: 0, r: 170, col: "#bff4ff" });
      rings.push({ x, y, t: 0, r: 280, col: "120,220,255", warp: true, dur: 0.55, w: 16 });
      rings.push({ x, y, t: -0.06, r: 170, col: "255,255,255", dur: 0.35, w: 6 });
      for (let k = 0; k < (lowQ ? 18 : 48); k++) { const a = Math.random() * 6.283, v = 150 + Math.random() * 520; puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.35 + Math.random() * 0.5, 1.2 + Math.random() * 1.6, k % 3 ? "#9fe8ff" : "#ffffff", 1, 0.05); }
      for (let k = 0; k < 4; k++) { const a = Math.random() * 6.283; arcs.push({ x1: x, y1: y, x2: x + Math.cos(a) * 140, y2: y + Math.sin(a) * 140, t: 0 }); }
      if (near) { sfx("boom_small", 0.9, 1.35, x, y); sfx("shield_hit", 0.8, 0.6, x, y); shake = Math.max(shake, 0.25 * (1 - Math.hypot(x - me.x, y - me.y) / 1400)); }
    } else {   // rocket: a fat fireball with a warping shock ring and smoke
      explode(x, y, lowQ ? 40 : 80, 420);
      impacts.push({ x, y, t: 0, r: 140, col: "#fff2c0" });
      rings.push({ x, y, t: 0, r: 240, col: "255,200,140", warp: true, dur: 0.5, w: 14 });
      smoke(x, y, lowQ ? 5 : 12, 90, 2);
      if (near) { sfx("boom_small", 1, 0.95, x, y); shake = Math.max(shake, 0.3 * (1 - Math.hypot(x - me.x, y - me.y) / 1400)); }
    }
  }
  let hitTickAt = 0;
  let hitStopUntil = 0;
  function hitConfirm(s, lv, x, y, target) {
    const t0 = performance.now();
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
  function volley(p, now, pat, from, aim) {
    const mine = p === me, [kind, speed] = pat.shot, amp = mine && me.ampUntil > now ? 3 : 1, ride = kind === K.BOLT ? 0 : 0.6;
    const base = (aim ?? p.a) + (pat.back ? Math.PI : 0), sz = sizeOf(p.lv || 1);
    let s;
    for (const da of pat.spread || [0]) {
      const bx = Math.cos(base + da), by = Math.sin(base + da);
      const id = (mine ? myTag : p.tag) + "." + (mine ? shotSeq++ : p.seq++).toString(36);
      const ox = from ? from.x : p.x + bx * 42 * sz, oy = from ? from.y : p.y + by * 42 * sz;
      s = { id, kind, x: ox, y: oy, ox, oy, px: from ? ox : p.x, py: from ? oy : p.y, vx: bx * speed + p.vx * ride, vy: by * speed + p.vy * ride,
            life: SHOTS[kind].life, mine, m: amp, owner: mine ? undefined : p.id };
      if (kind === K.PELLET) scatterPellets(s); else if (kind === K.SHARD) shardSpray(s); else shots.push(s);
      if (kind === K.RAIL) railBeam(s.x, s.y, s.vx, s.vy);
      const d = [id, Math.round(s.x), Math.round(s.y), Math.round(s.vx), Math.round(s.vy), kind];
      if (amp > 1) d.push(amp);
      if (mine) { myShotLog.push({ at: now, d }); stats.shots++; net.shot(d); }
      else { seenShots.set(id, performance.now()); p.shotLog.push({ at: now, d }); p.st.shots++; }
    }
    return s;
  }
  // what every client shows where a shot lands on a bin
  function shotBurst(s) {
    if (s.kind === K.MINE) { s.boom = true; explode(s.x, s.y, 50, 320); rings.push({ x: s.x, y: s.y, t: 0, r: 150, col: "255,140,80", dur: 0.45, w: 10 }); shake = Math.max(shake, 0.25); sfx("boom_small", 1, 0.9, s.x, s.y) || boomSound(0.6, 900, 0.35); return; }
    if (SPLASH[s.kind]) blastFx(s); else sfx("hit", 0.55, 1.1, s.x, s.y);
    if (s.kind === K.RAIL) sparkShower(s.x, s.y, s.vx / 4200, s.vy / 4200, 1.2);
    if (s.kind === K.PELLET) sparkShower(s.x, s.y, s.vx / 1250, s.vy / 1250, 0.5);
    if (s.kind === K.SLUG) { sparkShower(s.x, s.y, s.vx / 1900, s.vy / 1900, 1); shake = Math.max(shake, 0.1); }
    if (s.kind === K.SHARD) sparkShower(s.x, s.y, s.vx / 1300, s.vy / 1300, 0.6);
    impact(s.x, s.y, SHOTS[s.kind].col, s.kind === K.ROCKET || s.kind === K.RAIL ? 2 : 1);
  }
  // extra muzzle effects some guns have, on top of the flash and recoil every gun gets
  const MUZZLE_FX = {
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
    plasma(m) {
      rings.push({ x: m.x, y: m.y, t: 0, r: 90, col: "140,225,255", dur: 0.3, w: 6 });
      for (let k = 0; k < 16; k++) { const a = me.a + (Math.random() - 0.5) * 1.2, v = 150 + Math.random() * 300; puff(m.x, m.y, Math.cos(a) * v + me.vx, Math.sin(a) * v + me.vy, 0.3, 2, k % 2 ? "#9fe8ff" : "#ffffff"); }
    }
  };
  // fire the gun in hand (alt: its alternate fire, which needs its full ammo cost)
  function shoot(now, alt) {
    const k = me.weapon, w = WEAPONS[k], pat = alt ? w.alt : w;
    if (alt && !(pat && me.arsenal[k] >= pat.cost)) return;
    fireCd = alt ? pat.cd : w.cd * (MODES[MODE].cdMul || 1);
    const gun = k === "fire" ? null : muzzleAt(k);
    const muzzle = volley(me, now, pat, gun, k === "bolt" ? boltLock(me, gun) : undefined);
    const [name, vol, pitch] = pat.sfx;
    sfx(name, vol, pitch) || blip(160, 0.1, "sawtooth");
    if (pat.fx) MUZZLE_FX[pat.fx](muzzle);
    shotFeel(k, muzzle, pat.kick, ...pat.feel);
    if (k === "laser") { laserHeat = Math.min(1, laserHeat + LASER_HEAT.perShot); heatAt = now; if (laserHeat >= 1) overheat(); }
    spend(k, alt ? pat.cost : 1);
  }
  // feel, scaled per gun: recoil shoves the bin back, the view jolts, the screen shakes and the muzzle lights up
  function shotFeel(k, muzzle, kick, camK, shk, flashR) {
    const bx = Math.cos(me.a), by = Math.sin(me.a);
    me.vx -= bx * kick; me.vy -= by * kick;
    camKick.x += bx * camK; camKick.y += by * camK; shake = Math.max(shake, shk);
    if (flashR) impacts.push({ x: muzzle.x, y: muzzle.y, t: 0, r: flashR, col: WEAPONS[k].col || "#ffb43c" });
    for (let j = 0; j < 6; j++) puff(muzzle.x, muzzle.y, bx * 200 + (Math.random() - .5) * 160, by * 200 + (Math.random() - .5) * 160, 0.25, 2.5, k === "laser" ? "#bff9ff" : FIRE_COLS[j % 4]);
  }
  function spend(k, n) {
    if (k === "fire") return;
    if ((me.arsenal[k] -= n) > 0) { renderAmmo(k); return; }
    delete me.arsenal[k];
    // out of ammo: fall back to another gun you carry (never auto-pick the nuke), else the fireball
    me.weapon = WEAPON_KEYS.find(w => w !== "fire" && w !== "nuke" && me.arsenal[w]) || "fire";
    renderWeapon();
  }
  // the laser runs hot: about a second and a half of fire overheats it, then it is locked until it has cooled down a lot
  const LASER_HEAT = { perShot: 0.075, cool: 0.55, wait: 0.25, unlock: 0.3 };
  let laserHeat = 0, heatAt = 0, overheated = false, heatBar = null, heatShown = "";
  function overheat() {
    overheated = true;
    sfx("crash", 0.5, 1.6) || blip(300, 0.2, "square");
    floaters.push({ x: me.x, y: me.y - 60, t: 0, txt: "OVERHEAT", hit: true, col: "#ff6b3c" });
    smoke(me.x, me.y, 6, 60, 1);
  }
  function heatTick(dt, now) {
    if (now - heatAt > LASER_HEAT.wait * 1000) laserHeat = Math.max(0, laserHeat - LASER_HEAT.cool * dt);
    if (overheated && laserHeat <= LASER_HEAT.unlock) overheated = false;
    const shown = laserHeat.toFixed(2) + overheated;
    if (heatBar && shown !== heatShown) { heatShown = shown; heatBar.style.setProperty("--f", laserHeat.toFixed(2)); heatBar.classList.toggle("hot", overheated); }
  }
  // quick dodge: a burst forward (or toward where you steer) with a moment of invulnerability
  function dash(now) {
    if (!playing || me.dead || energy < 25 || now < dashReadyAt) return;
    energy -= 25; dashReadyAt = now + 450; energyRegenAt = now + 700;
    me.dashAt = now;
    dashBurst(me);
    const sm = Math.hypot(steer.x, steer.y);
    const a = sm > 0.2 ? Math.atan2(steer.y, steer.x) : me.a;
    me.vx += Math.cos(a) * 900; me.vy += Math.sin(a) * 900;
    me.inv = Math.max(me.inv, now + 280);
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
  const owned = () => WEAPON_KEYS.filter(k => me.arsenal[k]);
  const ammoFill = k => Math.min(1, me.arsenal[k] / WEAPONS[k].ammo);
  const chipText = () => { const n = me.arsenal[me.weapon], alt = WEAPONS[me.weapon].alt;
    return WEAPONS[me.weapon].name + (Number.isFinite(n) ? " · " + n : "") + (alt && !COARSE ? " · right click: " + alt.name : ""); };
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
    const el = document.getElementById("wpn");
    el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${ICONS[me.weapon]}"/></svg>`;
    el.append(chipText());
    el.style.color = w.col || "";
    // the weapon bar: every gun you carry, tap/click or 1-8 / Q / E / mouse wheel to switch
    const list = owned();
    arsenalEl.hidden = !playing || list.length < 2;
    arsenalEl.innerHTML = list.map((k, i) => {
      const n = me.arsenal[k];   // the laser's bar shows heat, filled in by heatTick
      return `<button type="button" class="slot${k === me.weapon ? " on" : ""}" data-w="${k}" style="--c:${WEAPONS[k].col || "#ffb43c"}" aria-label="${WEAPONS[k].name}">`
        + `<i>${i + 1}</i><svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${ICONS[k]}"/></svg><span>${Number.isFinite(n) ? n : "∞"}</span>`
        + (k === "laser" ? `<b class="heat"></b>` : `<b style="--f:${(Number.isFinite(n) ? ammoFill(k) : 1).toFixed(3)}"></b>`) + `</button>`;
    }).join("");
    heatBar = arsenalEl.querySelector('[data-w="laser"] b'); heatShown = "";
    const alt = WEAPONS[me.weapon].alt;
    document.getElementById("altBtn").hidden = !playing || !COARSE || !alt;
    if (alt) document.getElementById("altName").textContent = alt.name.toUpperCase();
  }
  function selectWeapon(k) {
    if (!me.arsenal[k] || k === me.weapon) return;
    me.weapon = k; fireCd = Math.max(fireCd, 0.15);
    blip(520, 0.05, "square");
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
    if (/^Digit[1-8]$/.test(e.code)) { const k = owned()[+e.code.slice(5) - 1]; if (k) selectWeapon(k); }
    else if (e.code === "KeyQ") cycleWeapon(-1);
    else if (e.code === "KeyE") cycleWeapon(1);
  });
  let wheelAt = 0;
  cv.addEventListener("wheel", e => {
    if (!playing) return;
    e.preventDefault();
    const t = performance.now();
    if (t - wheelAt < 120 || !e.deltaY) return;
    wheelAt = t; cycleWeapon(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  function nukeTouches(s) {
    if (!s.mine && playing && !me.dead && segHit(s, me.x, me.y, 20 + 26 * sizeOf(me.lv))) return true;
    for (const [id, r] of remotes) if (!r.dead && id !== s.owner && segHit(s, r.x, r.y, 20 + 26 * sizeOf(r.lv))) return true;
    for (const k of world.rocks) if (!grabbed.has(k.key) && k.age >= 0.6 && segHit(s, k.x, k.y, k.r + 10)) return true;
    return false;
  }
  const booms = [];   // nuke fireballs on screen
  let flash = 0;
  function detonate(s, now) {
    if (s.boom) return;
    s.boom = true; s.life = 0;
    const x = clamp(s.x, 0, W), y = clamp(s.y, 0, H), d = Math.hypot(me.x - x, me.y - y);
    const q = lowQ ? 0.35 : 1;
    shove(x, y, NUKE_R * 1.4, 1600);
    for (const b of [...bodies]) {   // a nuke scoops a huge crater out of anything nearby
      if (Math.hypot(b.x - x, b.y - y) - b.r < NUKE_R * 0.5 && (s.mine || b.free)) carveAt(b, x, y, 420, s.mine);
    }
    booms.push({ x, y, t: 0, seed: Math.random() * 100 });
    // three shock waves: a fast bright one, a heavy one, and a faint far one, all bending the view
    rings.push({ x, y, t: 0, r: NUKE_R * 1.25, col: "255,250,230", warp: true, dur: 0.9, w: 26 });
    rings.push({ x, y, t: -0.12, r: NUKE_R * 0.95, col: "255,190,110", warp: true, dur: 1.2, w: 34 });
    rings.push({ x, y, t: -0.3, r: NUKE_R * 1.8, col: "255,220,180", dur: 1.6, w: 14 });
    explode(x, y, Math.round(140 * q), 1300);
    if (!sfx("boom_big", 1, 0.7, x, y)) boomSound(2.6, 700, 0.6);
    sfx("boom_low", 1, 0.6, x, y);
    for (let k = 0; k < 120 * q; k++) {   // long glowing streaks thrown out with the blast
      const a = Math.random() * 6.28, v = 700 + Math.random() * 1100;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 1.2 + Math.random() * 1.2, 2 + Math.random() * 2, Math.random() < 0.5 ? "#ffb43c" : "#fff2c0", 1, 0.06);
    }
    smoke(x, y, Math.round(60 * q), 560, 6);
    rings.push({ x, y, t: -0.5, r: NUKE_R * 2.4, col: "255,140,80", dur: 2.2, w: 22 });   // the slow heat wave rolling far out
    if (d < 2600) { shake = Math.max(shake, 1.4 * (1 - d / 2600)); flash = Math.max(flash, d < NUKE_R * 1.6 ? 1 : 1 - (d - NUKE_R * 1.6) / (2600 - NUKE_R * 1.6)); }
    blip(30, 2.2, "sawtooth"); blip(55, 1.6, "square"); blip(90, 1.0, "sawtooth");
    if (canHurt(s, me, "me", true) && d < NUKE_R) {   // your own nuke too: get clear of it
      const push = 1500 * (1 - d / NUKE_R) + 400;
      me.vx += (me.x - x) / (d || 1) * push; me.vy += (me.y - y) / (d || 1) * push;
      hurtMe(s, now, nukeDmg(d), K.NUKE, 0, d < NUKE_KILL);
    }
    for (const b of bots) {
      const bd = Math.hypot(b.x - x, b.y - y);
      if (bd > NUKE_R || !canHurt(s, b, b.id, true)) continue;
      b.vx += (b.x - x) / (bd || 1) * 1200; b.vy += (b.y - y) / (bd || 1) * 1200;
      botHurt(b, bd < NUKE_KILL ? 99 : nukeDmg(bd) * selfMul(s, b.id), s.id, now, bd < NUKE_KILL);
    }
    if (!s.mine) return;
    // the shooter wipes out everything in the blast and shares the result
    const take = (key, pts) => { grabbed.add(key); pushCapped(myGrabs, key, 40); me.score += pts; };
    for (const k of world.rocks) if (!grabbed.has(k.key) && Math.hypot(k.x - x, k.y - y) < NUKE_R) take(k.key, 2);
    const ev = eventAt(clockNow());
    if (ev.active && ev.type === "meteors") for (let i = 0; i < 40; i++) {
      const m = meteor(ev, i);
      if (m && !grabbed.has(m.key) && Math.hypot(m.x - x, m.y - y) < NUKE_R) take(m.key, 2);
    }
    if (ev.active && ev.type === "aliens") for (let u = 0; u < UFO_N; u++) {
      const key = "e" + ev.cyc + "u" + u, p = ufoPos(ev, u, ev.et);
      if (!grabbed.has(key) && Math.hypot(p.x - x, p.y - y) < NUKE_R) { take(key, 15); gainXp(5, now); }
    }
    showScore();
  }
  // armour is counted in lives like health, so it shows as a percentage of your full health too
  function renderShield() {
    document.getElementById("shieldChip").hidden = me.shield <= 0;
    document.getElementById("shieldNum").textContent = Math.ceil(me.shield / maxLivesOf(me.lv) * 100) + "%";
  }
  let shieldHitAt = -1e9;
  function hurt(now, dmg = 1, force = false, kind = -1, ang = 0) {   // kind, ang: the shot that hit (picks how the bin dies)
    if (!roundLive) return false;
    if (me.dead || (!force && now < me.inv)) return false;
    // armour soaks the hit first (black hole and the nuke's core ignore it)
    if (!force && me.shield > 0) {
      const absorbed = Math.min(me.shield, dmg);
      me.shield = Math.round((me.shield - absorbed) * 1000) / 1000; dmg = Math.round((dmg - absorbed) * 1000) / 1000;   // no float dust left behind
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
      me.ds = 1 + Math.floor(Math.random() * 4);   // pieces the bin breaks into: 1 = intact dead hulk, 2-4 = shattered
      me.dk = deathStyleOf(kind); me.da = ang;
      deathFx(me, me.ds, me.dk, me.da);
      me.dead = true; me.respawnAt = now + 3000; me.vx = me.vy = 0;
      spillStars(now);
      if (me.lv > 1) floaters.push({ x: me.x, y: me.y - 80, t: 0, txt: "Level reset", gold: false });
      me.xp = 0; me.lv = 1;   // a destroyed bin starts over from level 1
      baseArsenal(); me.ampUntil = 0; me.fc = -1; renderWeapon();   // its guns are lost with it (and a carried flag goes home)
      renderLevel();
      blip(60, 0.6, "sawtooth");
    } else explode(me.x, me.y, 18, 180);
    return true;
  }
  function gainXp(v, now) {
    me.xp += v; me.carry += v;
    const nl = lvOf(me.xp);
    if (nl > me.lv) {
      const oldMax = maxLivesOf(me.lv);
      me.lv = nl;
      me.lives = Math.min(maxLivesOf(nl), me.lives + 1 + maxLivesOf(nl) - oldMax);
      const t = tierOf(nl), col = `rgb(${t.aura || t.mid})`;
      for (let k = 0; k < 90; k++) {
        const a = k / 90 * 6.283, v = 260 + Math.random() * 120;
        puff(me.x, me.y, Math.cos(a) * v, Math.sin(a) * v, 0.9, 2.6, k % 3 ? col : "#ffffff");
      }
      floaters.push({ x: me.x, y: me.y - 70, t: 0, txt: "LEVEL " + nl + "!", gold: true });
      setTimeout(() => sfx("v_levelup", 0.9), 350);
      if (!sfx("level_up", 0.7)) [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.18), i * 90));
      shake = Math.max(shake, 0.15);
      renderHearts(false);
    }
    renderLevel();
  }
  function spillStars(now) {
    const n = Math.min(40, Math.floor(me.carry / 2));
    me.carry = 0;
    if (n <= 0) return;
    const id = myTag + (deaths++).toString(36);
    me.score = Math.max(0, me.score - n);
    showScore();
    floaters.push({ x: me.x, y: me.y - 40, t: 0, txt: "-" + n + " stars", gold: false });
    drops.set(id, { x: me.x, y: me.y, n, born: now });
    myDrops.push([id, Math.round(me.x), Math.round(me.y), n, Date.now()]);
  }
  function dropStar(d, id, j, now) {
    const hs = strHash(id), a = hash(j, hs, 41) * 6.283 + j, r = 50 + hash(j, hs, 42) * 190;
    const k = Math.min(1, (now - d.born) / 600), e = 1 - (1 - k) * (1 - k);
    return { key: "d" + id + "." + j, x: clamp(d.x + Math.cos(a) * r * e, 40, W - 40), y: clamp(d.y + Math.sin(a) * r * e, 40, H - 40), ready: k >= 1 };
  }
  function respawn(now) {
    killer = "";
    me.dead = false; me.lives = maxLivesOf(me.lv); me.inv = now + 2000; me.shield = 0; renderShield();
    Object.assign(me, spawnPoint(me.tm)); me.vx = 0; me.vy = -60;
    renderHearts(false);
  }

