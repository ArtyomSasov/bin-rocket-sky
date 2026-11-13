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
  const shotDmg = s => MODE === "r" && s.kind === K.RAIL ? 99 : (s.kind === K.PELLET ? pelletDmg(s) : SHOTS[s.kind].dmg) * (s.m || 1);
  // team modes: whose side a shot is on (no friendly fire)
  const teamOfShot = s => s.mine ? me.tm : botById.has(s.owner) ? botById.get(s.owner).tm : remotes.has(s.owner) ? remotes.get(s.owner).tm : undefined;
  const friendly = (s, tm) => mates({ tm }, { tm: teamOfShot(s) });
  // THE rule for whether a shot may hurt someone (id: their key, "me" for me): alive, not the shooter, not on the
  // shooter's team; my own shots never hurt me. Every hit, splash, blast, homing and chain asks this.
  const canHurt = (s, o, id) => !o.dead && id !== s.owner && !friendly(s, o.tm) && (o !== me || (playing && !s.mine));
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
    if (canHurt(s, me, "me") && d < R + 26 * sizeOf(me.lv)) {
      me.vx += (me.x - x) / (d || 1) * 700; me.vy += (me.y - y) / (d || 1) * 700;
      if (hurt(now, base * Math.max(0.25, 1 - d / R), false, K.ORB)) { pushCapped(hitBy, s.id, 12); if (me.dead) { meKilled(s.id); killedBy(s.owner); } }
    }
    for (const b of bots) {
      if (!canHurt(s, b, b.id)) continue;
      const bd = Math.hypot(b.x - x, b.y - y);
      if (bd < R + 40) { b.vx += (b.x - x) / (bd || 1) * 700; b.vy += (b.y - y) / (bd || 1) * 700; botHurt(b, base * Math.max(0.25, 1 - bd / R), s.id, now, false, K.ORB); }
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
  const CHAIN_R = 320, CHAIN_DMG = 0.12;
  function boltChain(s, hx, hy, hitId, now) {
    if (s.chained) return;
    s.chained = true;
    let best = null, bd = CHAIN_R;
    const consider = (id, o) => { if (id === hitId || !canHurt(s, o, id)) return; const d = Math.hypot(o.x - hx, o.y - hy); if (d < bd) { bd = d; best = { id, o }; } };
    consider("me", me);
    for (const [id, r] of remotes) consider(id, r);
    if (!best) return;
    const t = best.o, a = Math.atan2(t.y - hy, t.x - hx);
    arcs.push({ x1: hx, y1: hy, x2: t.x, y2: t.y, t: 0 });
    impact(t.x, t.y, "#bfefff", 0.8);
    sfx("laser", 0.3, 2.2, t.x, t.y);
    const dmg = CHAIN_DMG * (s.m || 1), cid = s.id + "c";
    if (best.id === "me") { if (hurt(now, dmg, false, K.BOLT, a)) { pushCapped(hitBy, cid, 12); if (me.dead) { meKilled(cid); killedBy(s.owner); } } }
    else if (botById.has(best.id)) botHurt(botById.get(best.id), dmg, cid, now, false, K.BOLT, a);
    else if (s.mine) hitConfirm({ ...s, kind: K.BOLT }, t.lv, t.x, t.y);
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
    for (const [id, r] of remotes) if (canHurt(s, r, id)) consider(r, r.x, r.y);
    for (const b of bots) if (canHurt(s, b, b.id) && !(s.mine && botById.has(b.id))) consider(b, b.x, b.y);
    const na = best ? cur + clamp(angD(Math.atan2(best.y - s.y, best.x - s.x) - cur), -2.3 * dt, 2.3 * dt) : cur;
    const sp = Math.min(560, Math.hypot(s.vx, s.vy) + 380 * dt);
    s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
  }
  function rocketSplash(s, now) {
    if (s.splashed || !canHurt(s, me, "me")) return;
    s.splashed = true;
    const d = Math.hypot(me.x - s.x, me.y - s.y), R = 140 + 26 * sizeOf(me.lv);
    if (d > R) return;
    me.vx += (me.x - s.x) / (d || 1) * 300; me.vy += (me.y - s.y) / (d || 1) * 300;
    if (hurt(now, (0.6 * (1 - d / R) + 0.15) * (s.m || 1))) { pushCapped(hitBy, s.id, 12); if (me.dead) { meKilled(s.id); killedBy(s.owner); } }
  }
  let hitTickAt = 0;
  function hitConfirm(s, lv, x, y) {
    if (!s.mine) return;
    const pct = Math.max(1, Math.round(shotDmg(s) / maxLivesOf(lv || 1) * 100));
    floaters.push({ x: x + (Math.random() - 0.5) * 30, y: y - 40, t: 0, txt: "-" + pct + "%", hit: true, col: SHOTS[s.kind].col, big: pct >= 40 });
    const t = performance.now();
    if (t - hitTickAt > 60) { hitTickAt = t; sfx("hit", 0.4, 1.8); }
  }
  function pelletShove(o, s, f = 150) { const v = Math.hypot(s.vx, s.vy) || 1; o.vx += s.vx / v * f; o.vy += s.vy / v * f; }
  function fireOne(now, ang, kind, speed, from) {
    const bx = Math.cos(ang), by = Math.sin(ang), sz = sizeOf(me.lv);
    const id = myTag + "." + (shotSeq++).toString(36);
    const ox = from ? from.x : me.x + bx * 42 * sz, oy = from ? from.y : me.y + by * 42 * sz;
    const amp = me.ampUntil > now ? 3 : 1;
    const s = { id, kind, x: ox, y: oy, ox, oy, px: from ? ox : me.x, py: from ? oy : me.y, vx: bx * speed + me.vx * (kind === K.BOLT ? 0 : 0.6), vy: by * speed + me.vy * (kind === K.BOLT ? 0 : 0.6), life: SHOTS[kind].life, mine: true, m: amp };
    if (kind === K.PELLET) scatterPellets(s); else if (kind === K.SHARD) shardSpray(s); else shots.push(s);
    const d = [id, Math.round(s.x), Math.round(s.y), Math.round(s.vx), Math.round(s.vy), kind];
    if (amp > 1) d.push(amp);
    myShotLog.push({ at: now, d });
    stats.shots++;
    net.shot(d);
    return s;
  }
  // what every client shows where a shot lands on a bin
  function shotBurst(s) {
    if (s.kind === K.MINE) { s.boom = true; explode(s.x, s.y, 50, 320); rings.push({ x: s.x, y: s.y, t: 0, r: 150, col: "255,140,80", dur: 0.45, w: 10 }); shake = Math.max(shake, 0.25); sfx("boom_small", 1, 0.9, s.x, s.y) || boomSound(0.6, 900, 0.35); return; }
    if (s.kind === K.ROCKET) { explode(s.x, s.y, 40, 260); sfx("boom_small", 0.8, 1.15, s.x, s.y); } else sfx("hit", 0.55, 1.1, s.x, s.y);
    if (s.kind === K.RAIL) sparkShower(s.x, s.y, s.vx / 4200, s.vy / 4200, 1.2);
    if (s.kind === K.PELLET) sparkShower(s.x, s.y, s.vx / 1250, s.vy / 1250, 0.5);
    if (s.kind === K.SLUG) { sparkShower(s.x, s.y, s.vx / 1900, s.vy / 1900, 1); shake = Math.max(shake, 0.1); }
    if (s.kind === K.ORB) { s.boom = true; explode(s.x, s.y, 50, 360); rings.push({ x: s.x, y: s.y, t: 0, r: 110, col: "160,235,255", dur: 0.4, w: 8 }); }
    if (s.kind === K.SHARD) sparkShower(s.x, s.y, s.vx / 1300, s.vy / 1300, 0.6);
    impact(s.x, s.y, SHOTS[s.kind].col, s.kind === K.ROCKET || s.kind === K.RAIL ? 2 : 1);
  }
  function shoot(now) {
    const w = WEAPONS[me.weapon], [kind, sp] = w.shot;
    fireCd = w.cd * (MODE === "n" ? 2.2 : 1);
    let muzzle;
    const gun = me.weapon === "fire" ? null : muzzleAt(me.weapon);
    if (me.weapon === "triple") { for (const da of [-0.2, 0, 0.2]) muzzle = fireOne(now, me.a + da, kind, sp, gun); sfx("triple", 0.7) || blip(170, 0.12, "sawtooth"); }
    else if (me.weapon === "laser") { muzzle = fireOne(now, me.a, kind, sp, gun); sfx("laser", 0.45) || blip(1200, 0.06, "square"); }
    else if (me.weapon === "rocket") { muzzle = fireOne(now, me.a, kind, sp, gun); sfx("rocket", 0.8) || blip(90, 0.25, "sawtooth"); }
    else if (me.weapon === "scatter") {
      muzzle = fireOne(now, me.a, kind, sp, gun);
      // a heavy blast: flash, a cone of fire and smoke, a thump, then the pump racking
      if (!sfx("scatter", 1, 0.85)) { boomSound(0.35, 1400, 0.5); blip(55, 0.25, "square"); }
      setTimeout(() => { if (!sfx("pump", 0.6)) { blip(420, 0.05, "square"); setTimeout(() => blip(300, 0.06, "square"), 90); } }, 260);
      impacts.push({ x: muzzle.x, y: muzzle.y, t: 0, r: 70, col: "#ffd27a" });
      for (let k = 0; k < 22; k++) {
        const a = me.a + (Math.random() - 0.5) * 0.7, v = 250 + Math.random() * 500;
        puff(muzzle.x, muzzle.y, Math.cos(a) * v + me.vx, Math.sin(a) * v + me.vy, 0.2 + Math.random() * 0.25, 2 + Math.random() * 2.5, FIRE_COLS[k % 4]);
      }
      smoke(muzzle.x, muzzle.y, 8, 120, 1.2);
      shake = Math.max(shake, 0.3);
    }
    else if (me.weapon === "rail") {
      muzzle = fireOne(now, me.a, kind, sp, gun);
      railBeam(muzzle.x, muzzle.y, muzzle.vx, muzzle.vy);
      shake = Math.max(shake, 0.35); flash = Math.max(flash, 0.12);
      if (!sfx("rail", 0.9)) { blip(1800, 0.05, "sine"); blip(140, 0.4, "sawtooth"); }
      rings.push({ x: muzzle.x, y: muzzle.y, t: 0, r: 70, col: "233,200,255", dur: 0.35, w: 6 });
    }
    else if (me.weapon === "mine") { muzzle = fireOne(now, me.a + Math.PI, kind, sp, gun); sfx("mine_drop", 0.7) || blip(260, 0.1, "triangle"); }
    else if (me.weapon === "orb") { muzzle = fireOne(now, me.a, kind, sp, gun); sfx("shield_get", 0.8, 1.4) || blip(300, 0.2, "sine"); }
    else if (me.weapon === "bolt") { muzzle = fireOne(now, me.a, kind, sp, gun); sfx("laser", 0.22, 1.7) || blip(1600, 0.03, "sawtooth"); }
    else if (me.weapon === "shard") {
      muzzle = fireOne(now, me.a, kind, sp, gun);
      if (!sfx("scatter", 0.85, 1.25)) boomSound(0.3, 2000, 0.4);
      impacts.push({ x: muzzle.x, y: muzzle.y, t: 0, r: 50, col: "#ff9a3c" });
    }
    else if (me.weapon === "nuke") { muzzle = fireOne(now, me.a, kind, sp, gun); sfx("rocket", 1, 0.6) || blip(55, 0.7, "sawtooth"); }
    else { muzzle = fireOne(now, me.a, kind, sp); sfx("fire", 0.55) || blip(150, 0.12, "sawtooth"); }
    const kick = { nuke: 160, rail: 320, scatter: 260, rocket: 90, laser: 8, mine: 0, orb: 40, bolt: 4, shard: 150 }[me.weapon] ?? 25;
    const [camK, shk, flashR] = { fire: [5, 0.05, 40], triple: [7, 0.07, 50], laser: [2, 0.02, 30], rocket: [12, 0.14, 70], scatter: [22, 0.3, 90],
      rail: [26, 0.35, 90], mine: [0, 0, 0], orb: [10, 0.1, 70], bolt: [2, 0.03, 35], shard: [16, 0.2, 80], nuke: [30, 0.5, 120] }[me.weapon] || [5, 0.05, 40];
    shotFeel(me.weapon, muzzle, kick, camK, shk, flashR);
    if (me.weapon === "laser") { laserHeat = Math.min(1, laserHeat + LASER_HEAT.perShot); heatAt = now; if (laserHeat >= 1) overheat(); }
    spend(me.weapon, 1);
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
  // alternate fire (right mouse button or C; on phones the small button by the fire button)
  const ALT = {   // kick: recoil, camK: how hard the view jolts
    rocket:  { name: "Salvo", cost: 3, cd: 1.6,  kick: 200, camK: 18 },   // three rockets at once
    scatter: { name: "Slug",  cost: 2, cd: 0.95, kick: 340, camK: 24 },   // one heavy slug that flies far, instead of the spread
    triple:  { name: "Focus", cost: 1, cd: 0.3,  kick: 60,  camK: 10 },   // all three balls nearly straight
    mine:    { name: "Throw", cost: 1, cd: 0.6,  kick: 40,  camK: 4 }     // lob a mine ahead instead of dropping it behind
  };
  function shootAlt(now) {
    const k = me.weapon, alt = ALT[k];
    if (!alt || !(me.arsenal[k] >= alt.cost)) return;   // a salvo needs three rockets, a slug two shells
    fireCd = alt.cd;
    const gun = muzzleAt(k);
    let muzzle;
    if (k === "rocket") { for (const da of [-0.24, 0, 0.24]) muzzle = fireOne(now, me.a + da, 1, 300, gun); sfx("rocket", 1, 0.8); }
    else if (k === "scatter") {
      muzzle = fireOne(now, me.a, 10, 1900, gun);
      if (!sfx("scatter", 1, 0.65)) boomSound(0.4, 900, 0.5);
      setTimeout(() => sfx("pump", 0.6, 0.9), 300);
      for (let j = 0; j < 14; j++) { const a = me.a + (Math.random() - 0.5) * 0.3, v = 300 + Math.random() * 500; puff(muzzle.x, muzzle.y, Math.cos(a) * v + me.vx, Math.sin(a) * v + me.vy, 0.25, 2.5, FIRE_COLS[j % 4]); }
    }
    else if (k === "triple") { for (const da of [-0.035, 0, 0.035]) muzzle = fireOne(now, me.a + da, 0, 1050, gun); sfx("triple", 0.8, 0.9); }
    else { muzzle = fireOne(now, me.a, 6, 700, gun); sfx("mine_drop", 0.8, 0.8); }
    shotFeel(k, muzzle, alt.kick, alt.camK, alt.camK / 80, 60 + alt.camK * 2);
    spend(k, alt.cost);
  }
  // quick dodge: a burst forward (or toward where you steer) with a moment of invulnerability
  function dash(now) {
    if (!playing || me.dead || energy < 25 || now < dashReadyAt) return;
    energy -= 25; dashReadyAt = now + 450; energyRegenAt = now + 700;
    me.dashAt = now;
    dashBurst(me);
    const sm = Math.hypot(steer.x, steer.y);
    const a = sm > 0.2 ? Math.atan2(steer.y, steer.x) : me.a;
    me.vx += Math.cos(a) * 720; me.vy += Math.sin(a) * 720;
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
  const chipText = () => { const n = me.arsenal[me.weapon], alt = ALT[me.weapon];
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
    const alt = ALT[me.weapon];
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
  const aftershocks = [];
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
    explode(x, y, Math.round(260 * q), 1150);
    if (!sfx("boom_big", 1, 0.7, x, y)) boomSound(2.6, 700, 0.6);
    sfx("boom_low", 1, 0.6, x, y);
    for (let k = 0; k < 160 * q; k++) {   // embers flung far out
      const a = Math.random() * 6.28, v = 500 + Math.random() * 900;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 1.6 + Math.random() * 1.6, 1 + Math.random() * 1.6, Math.random() < 0.5 ? "#ffb43c" : "#ffe08a");
    }
    smoke(x, y, Math.round(70 * q), 460, 5.5);
    for (let k = 0; k < 9; k++) {   // aftershocks across the blast zone
      const a = Math.random() * 6.28, r = NUKE_R * (0.25 + Math.random() * 0.6);
      aftershocks.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, at: now + 150 + Math.random() * 1100 });
    }
    if (d < 2600) { shake = Math.max(shake, 1.4 * (1 - d / 2600)); flash = Math.max(flash, d < NUKE_R * 1.6 ? 1 : 1 - (d - NUKE_R * 1.6) / (2600 - NUKE_R * 1.6)); }
    blip(30, 2.2, "sawtooth"); blip(55, 1.6, "square"); blip(90, 1.0, "sawtooth");
    if (canHurt(s, me, "me") && d < NUKE_R) {
      const push = 1500 * (1 - d / NUKE_R) + 400;
      me.vx += (me.x - x) / (d || 1) * push; me.vy += (me.y - y) / (d || 1) * push;
      const wasHit = d < NUKE_KILL ? hurt(now, 99, true) : hurt(now, NUKE_DMG);
      if (wasHit) { pushCapped(hitBy, s.id, 12); if (me.dead) { meKilled(s.id); killedBy(s.owner); } }
    }
    for (const b of bots) {
      const bd = Math.hypot(b.x - x, b.y - y);
      if (bd > NUKE_R || !canHurt(s, b, b.id)) continue;
      b.vx += (b.x - x) / (bd || 1) * 1200; b.vy += (b.y - y) / (bd || 1) * 1200;
      botHurt(b, bd < NUKE_KILL ? 99 : NUKE_DMG, s.id, now, bd < NUKE_KILL);
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

