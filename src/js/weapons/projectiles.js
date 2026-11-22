  function volley(p, now, pat, from, aim, mul = 1) {
    metricVolley(p, pat);
    const mine = p === me, [kind, speed] = pat.shot, amp = (ampLeft(p, now) > 0 ? QUAD : 1) * mul, ride = kind === K.GREN || kind === K.HOLY || kind === K.MINE ? .6 : 0;
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
      if (kind === K.PELLET) scatterPellets(s); else if (kind === K.SHARD) shardSpray(s); else shots.push(s);
      if (kind === K.RAIL) railBeam(s);
      if ((kind === K.MELEE || kind === K.SWORD) && mine) { myMelee.add(id); if (myMelee.size > 64) myMelee.delete(myMelee.values().next().value); }   // for Humiliation (only the recent ones: a kill is reported within seconds)
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
  // a grenade hits rock or the fence: it clinks and rolls off
  function grenBounce(s) {
    if (Math.hypot(s.vx, s.vy) > 80 && performance.now() - (s.clinkAt || 0) > 90) { s.clinkAt = performance.now(); packPlay("p_bounce_gren", 0.7, s.x, s.y); }
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
    packPlay("p_boom_shard", 0.8, s.x, s.y);
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
    packPlay("p_ric", 0.5, s.x, s.y);
  }
  // what every client shows where a shot lands on a bin
  function shotBurst(s) {
    if (s.kind === K.PULSE_BOLT) {   // a bolt bursts: a splash of green plasma, a ring, a spray of hot motes
      if (!s.impactSound) { s.impactSound = true; packPlay("p_ut_pulse_explode", .6, s.x, s.y); }
      impacts.push({ x: s.x, y: s.y, t: 0, r: 46, col: "#d8ff9a", dur: 0.14 });
      impacts.push({ x: s.x, y: s.y, t: 0, r: 120, col: "130,255,90", dur: 0.3, soft: 0.45 });
      rings.push({ x: s.x, y: s.y, t: 0, r: 70, col: "170,255,110", dur: 0.22, w: 4 });
      for (let k = 0; k < (lowQ ? 4 : 11); k++) { const a = Math.random() * 6.283, v = 120 + Math.random() * 380; puff(s.x, s.y, Math.cos(a) * v, Math.sin(a) * v, 0.2 + Math.random() * 0.3, 1.2 + Math.random() * 1.4, k % 3 ? "#9dff5a" : "#f2ffd0", k % 2 ? 1 : 5, 0.04, 0, 0.92); }
      return;
    }
    if (s.kind === K.FLAK) { flakBurst(s); return; }
    if (s.kind === K.MINE) { blastFx(s); return; }
    if (SPLASH[s.kind]) blastFx(s);
    else {
      const ev = s.kind === K.SHARD ? "p_ric" : s.kind === K.BULLET ? "p_hit_bullet" : s.kind === K.RAIL ? "p_boom_orb" : "";
      if (ev) packPlay(ev, 0.6, s.x, s.y); else sfx("hit", 0.55, 1.1, s.x, s.y);
    }
    if (s.kind === K.RAIL) sparkShower(s.x, s.y, s.vx / 4200, s.vy / 4200, 1.2);
    if (s.kind === K.PELLET) sparkShower(s.x, s.y, s.vx / 1250, s.vy / 1250, 0.5);
    if (s.kind === K.SHARD) { sparkShower(s.x, s.y, s.vx / 1300, s.vy / 1300, 1.1); shake = Math.max(shake, 0.08); }
    if (s.kind === K.SWORD || s.kind === K.MELEE) {   // a blade bites: the cut of light, the glint, the warp, the spray, its clash
      const heavy = s.kind === K.SWORD, own = s.mine || (serverRun && s.owner === srv.id) ? me : botById.get(s.owner) || remotes.get(s.owner);
      // the stroke's way at the hit: across the line from its bin, the way the swing goes
      const ra = own ? Math.atan2(s.y - own.y, s.x - own.x) : Math.atan2(s.vy, s.vx), a = ra + (own?.swingSide || -1) * Math.PI / 2;
      let victim = null, vd = 90;
      for (const o of [me, ...remotes.values()]) if (o !== own && !o.dead && Math.hypot(o.x - s.x, o.y - s.y) < vd) { vd = Math.hypot(o.x - s.x, o.y - s.y); victim = o; }
      bladeClash(clamp((s.x - me.x) / 900, -1, 1));
      bladeHitFx(s.x, s.y, a, heavy, victim);
      oilSplash(s.x, s.y, heavy ? 12 : 6, 380, Math.cos(a) * 220, Math.sin(a) * 220);
      const near = Math.hypot(s.x - me.x, s.y - me.y) < 700;
      if (near) { shake = Math.max(shake, heavy ? 0.26 : 0.16); hitStopUntil = Math.max(hitStopUntil, performance.now() + (heavy ? 85 : 55)); }
      return;
    }
    // a slug on a bin's metal: sparks thrown back off it, white-hot flecks, a spit of oil; energy on it: embers of its
    // colour scattering off the hull
    const sp = Math.hypot(s.vx, s.vy) || 1, ux = s.vx / sp, uy = s.vy / sp;
    if (s.kind === K.BULLET || s.kind === K.BULLET_ALT || s.kind === K.PELLET) {
      sparkShower(s.x, s.y, -ux, -uy, 0.8);
      for (let k = 0, m = lowQ ? 3 : 7; k < m; k++) { const a = Math.atan2(-uy, -ux) + (Math.random() - 0.5) * 2.2, v = 350 + Math.random() * 550; puff(s.x, s.y, Math.cos(a) * v, Math.sin(a) * v, 0.12 + Math.random() * 0.2, 0.8 + Math.random() * 0.8, k % 3 ? "#fff1b8" : "#ffb04a", 1, 0.05, 0, 0.92); }
      oilSplash(s.x, s.y, 3, 200, ux * 120, uy * 120);
    } else if (s.kind === K.PISTOL || s.kind === K.PULSE_BOLT || s.kind === K.SHOCK) {
      for (let k = 0, m = lowQ ? 3 : 8; k < m; k++) { const a = Math.random() * 6.283, v = 120 + Math.random() * 300; puff(s.x, s.y, Math.cos(a) * v, Math.sin(a) * v, 0.25 + Math.random() * 0.35, 1.2 + Math.random() * 1.2, k % 2 ? SHOTS[s.kind].col : "#ffffff", 5, 0, 0, 0.93); }
    }
    impact(s.x, s.y, SHOTS[s.kind].col, s.kind === K.ROCKET || s.kind === K.RAIL ? 2 : 1);
  }
  // extra muzzle effects some guns have, on top of the flash and recoil every gun gets
  const MUZZLE_FX = {
    pulse(m) {   // the Pulse Gun: a green flash at the emitter with each bolt, a ring and a few motes of plasma
      const a = me.a;
      impacts.push({ x: m.x + Math.cos(a) * 8, y: m.y + Math.sin(a) * 8, t: 0, r: 26 + Math.random() * 10, col: "#c8ff7a", dur: 0.09 });
      for (let k = 0; k < (lowQ ? 2 : 5); k++) { const b = a + (Math.random() - 0.5) * 0.9, v = 200 + Math.random() * 300; puff(m.x, m.y, Math.cos(b) * v, Math.sin(b) * v, 0.15 + Math.random() * 0.15, 1.2 + Math.random(), k % 2 ? "#e8ffc0" : "#7dff4a", 5, 0, 0, 0.9); }
    },
    mini(m) {   // the minigun: a tongue of flame from the barrels with each round, and now and then a spark
      const a = me.a, ca = Math.cos(a), sa = Math.sin(a);
      impacts.push({ x: m.x + ca * 6, y: m.y + sa * 6, t: 0, r: 12 + Math.random() * 9, col: Math.random() < 0.5 ? "#ffcf6a" : "#ff9a3c" });
      for (let k = 0; k < (lowQ ? 2 : 4); k++) { const b = a + (Math.random() - 0.5) * 0.5, v = 300 + Math.random() * 380; puff(m.x, m.y, Math.cos(b) * v + me.vx, Math.sin(b) * v + me.vy, 0.06 + Math.random() * 0.08, 3 + Math.random() * 3, k % 2 ? "#ffd27a" : "#ff8a2a", 0); }
      if (Math.random() < 0.25) sparkShower(m.x, m.y, ca, sa, 0.4);
      miniHeat = Math.min(1, miniHeat + 0.05);
    },
    blast(m) {   // scatter gun: flash, a cone of fire and smoke, then the pump racking
      setTimeout(() => sfx("pump", 0.6), 260);
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
    pulse(m) {   // the laser's pulse: a spray of cyan sparks out of the gun (no ring: it read as circles round the bin)
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
  // the pack's sound for each alt fire (the rest keep their own)
  const ALT_SOUND = { fire: "", nuke: "p_ut_nuke_fire", mine: "p_fire_mine", scatter: "p_fire_nail", rocket: "p_fire_rocket", orb: "p_hit_laser", laser: "p_nova", gren: "p_fire_gren", rail: "p_fire_rail", shard: "p_ut_flak_alt" };
