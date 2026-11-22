  // ---------- world events (same for everyone: computed from the shared clock) ----------
  const EV_INFO = {
    blackhole: { warn: "A black hole is forming", on: "BLACK HOLE · boost away from it!", col: "#c38bff" },
    meteors:   { warn: "Meteor shower incoming",  on: "METEOR SHOWER · dodge or shoot them", col: "#ff9a2e" },
    aliens:    { warn: "Alien ships detected",    on: "ALIEN ATTACK · 6 hits downs a saucer (+15)", col: "#7dffb0" },
    goldrain:  { warn: "Gold rain is coming",     on: "GOLD RAIN · grab the gold sparks!", col: "#ffd36b" }
  };
  let holeBite = 0;
  function meteor(ev, i) {
    const t0 = hash(ev.cyc, i, 81) * 21, age = ev.et - t0;
    if (age < 0 || age > 4.5) return null;
    const dir = hash(ev.cyc, 82, 1) * 6.283, dx = Math.cos(dir), dy = Math.sin(dir);
    const off = (hash(ev.cyc, i, 83) - 0.5) * 2600, sp = 650 + hash(ev.cyc, i, 84) * 400;
    const x = W / 2 - dx * 1500 - dy * off + dx * sp * age, y = H / 2 - dy * 1500 + dx * off + dy * sp * age;
    if (x < -200 || x > W + 200 || y < -200 || y > H + 200) return null;
    return { key: "e" + ev.cyc + "m" + i, x, y, vx: dx * sp, vy: dy * sp, r: 14 + hash(ev.cyc, i, 85) * 14 };
  }
  const UFO_N = 3, UFO_HP = 6, ORB_RING = 10, BURST = 1.8, ORB_LIFE = 3.2, ORB_SPEED = 240;
  function ufoPos(ev, u, et) {
    const cx = 450 + hash(ev.cyc, 90 + u, 1) * (W - 900), cy = 450 + hash(ev.cyc, 90 + u, 2) * (H - 900);
    return { x: cx + Math.sin(et * 0.5 + u * 2) * 360, y: cy + Math.sin(et * 0.73 + u) * 260 };
  }
  function* ufoOrbs(ev, u) {
    const last = Math.floor((ev.et - 2) / BURST);
    for (let b = Math.max(0, last - 1); b <= last; b++) {
      const t0 = 2 + b * BURST, age = ev.et - t0;
      if (age < 0 || age > ORB_LIFE || t0 > EV_LEN - 1) continue;
      const o = ufoPos(ev, u, t0);
      for (let j = 0; j < ORB_RING; j++) {
        const a = j * 6.283 / ORB_RING + b * 0.31 + u;
        yield { x: o.x + Math.cos(a) * ORB_SPEED * age, y: o.y + Math.sin(a) * ORB_SPEED * age, age };
      }
    }
  }
  let GOLD_N = 140;
  function goldDrop(ev, i) {
    const t0 = hash(ev.cyc, i, 95) * 20, age = ev.et - t0;
    if (age < 0 || age > 7) return null;
    return outside({ key: "e" + ev.cyc + "g" + i, x: 120 + hash(ev.cyc, i, 96) * (W - 240), y: 120 + hash(ev.cyc, i, 97) * (H - 240), age });
  }
  const ufoHits = new Map();
  const bannerEl = document.getElementById("eventBanner");
  let bannerAcc = 0;

  // every black hole open (the event's, a void bomb's) acts on the world, on any map: it bends and swallows shots,
  // drags in everything loose, and bites away what stands near it
  function holesTick(dt, now) {
    for (const bh of holesNow()) {
      // shots bend toward the hole and vanish at the horizon
      for (const s of shots) {
        const dx = bh.x - s.x, dy = bh.y - s.y, d = Math.hypot(dx, dy) || 1;
        if (d < 60 * bh.k) { s.life = 0; continue; }
        if (d < holeReach(bh)) { const acc = holeAcc(bh, d); s.vx += dx / d * acc * dt; s.vy += dy / d * acc * dt; }
      }
      // loose rubble and flying wreckage fall in the same way, and whatever reaches the horizon is gone for good
      const eat = HOLE_EAT * bh.k * (bh.v ? 2.2 : 1), reach = holeReach(bh);
      // (and all the small stuff: smoke, sparks, chunks, cases, drops, spiralling in)
      for (const list of [parts, chunks, casings, oilDrops]) for (const o of list) {
        const dx = bh.x - o.x, dy = bh.y - o.y, d = Math.hypot(dx, dy) || 1;
        if (d > reach + 100) continue;
        const acc = holeAcc(bh, d) * 0.7; o.vx += (dx / d + dy / d * 0.6) * acc * dt; o.vy += (dy / d - dx / d * 0.6) * acc * dt;
        if (d < eat && list === parts) o.life = Math.min(o.life, 0.05);
      }
      for (const list of [rubble, hulks, frags, debris]) for (let i = list.length - 1; i >= 0; i--) {
        const o = list[i], dx = bh.x - o.x, dy = bh.y - o.y, d = Math.hypot(dx, dy) || 1;
        if (d < reach) { const acc = holeAcc(bh, d) * (bh.v ? 1.2 : 0.45); if (acc > 150) o.rest = null; o.vx += (dx / d + dy / d * 0.35) * acc * dt; o.vy += (dy / d - dx / d * 0.35) * acc * dt; }
        if (d < eat + 20) {
          swallowFx(o.x, o.y, bh, list === rubble ? bodyCol(o) : "#c38bff");
          if (list === rubble) { o.dead = true; rebuildBodies(); } else list.splice(i, 1);
        }
      }
      // the horizon eats planets and wrecks: big bites out of whatever crosses it, and what is dragged right in goes whole
      holeBite += dt;
      if (holeBite > 0.1) {
        holeBite = 0;
        for (const b of [...bodies]) {
          if (b.dead) continue;
          const d = Math.hypot(b.x - bh.x, b.y - bh.y);
          if (d - b.r >= eat * 1.6) continue;
          if (d < eat + b.r * 0.55) {   // swallowed whole
            carveAt(b, b.x, b.y, b.r + 12, false);
            for (let k = 0; k < 6; k++) swallowFx(b.x + (Math.random() - 0.5) * b.r, b.y + (Math.random() - 0.5) * b.r, bh, bodyCol(b));
            if (b.planet && !b.star) feedPush("The black hole swallowed a planet!");
          } else {
            carveAt(b, bh.x, bh.y, eat * 1.6 + 40, false);
            swallowFx(bh.x + (b.x - bh.x) / d * (eat * 1.6), bh.y + (b.y - bh.y) / d * (eat * 1.6), bh, bodyCol(b));
          }
        }
      }
    }
  }
  function updateEvents(dt, now) {
    holesTick(dt, now);
    if (playing && !me.dead && roundLive) for (const bh of holesNow()) if (bh.v) holeOnMe(bh, dt, now);   // a void bomb's hole: on every map, a station's too
    if (stationMap()) { bannerEl.hidden = true; return; }
    const ev = eventAt(clockNow());
    bannerAcc += dt;
    if (bannerAcc > 0.25) {
      bannerAcc = 0;
      const info = EV_INFO[ev.type];
      if (ev.warn || ev.active) {
        bannerEl.hidden = false;
        bannerEl.style.setProperty("--ev", info.col);
        bannerEl.textContent = ev.warn ? info.warn + " · " + Math.ceil(EV_START - ev.ph) + "…" : info.on + " · " + Math.ceil(EV_LEN - ev.et) + "s";
        bannerEl.classList.toggle("warn", ev.warn);
      } else bannerEl.hidden = true;
    }

    if (!ev.active || !playing || me.dead || !roundLive) return;   // events leave you alone during the results break
    const mr = 30 * sizeOf(me.lv);

    if (ev.type === "blackhole") holeOnMe(blackHole(ev), dt, now);

    if (ev.type === "meteors") {
      for (let i = 0; i < 40; i++) {
        const m = meteor(ev, i);
        if (!m || grabbed.has(m.key)) continue;
        for (const s of shots) {
          if (!s.mine || s.life <= 0 || SHOTS[s.kind].inert || !segHit(s, m.x, m.y, m.r + 12)) continue;
          s.life = 0; grabbed.add(m.key); pushCapped(myGrabs, m.key, 40);
          impact(s.x, s.y, "#ffb43c", 1.5);
          me.score += 2; showScore();
          floaters.push({ x: m.x, y: m.y, t: 0, txt: "+2", gold: false });
          explode(m.x, m.y, 26, 240); sfx("chunk", 0.5, 1.2, m.x, m.y);
          break;
        }
        if (grabbed.has(m.key)) continue;
        if (Math.hypot(m.x - me.x, m.y - me.y) < m.r + mr && now >= me.inv && now >= (me.hazardAt || 0)) {
          grabbed.add(m.key); pushCapped(myGrabs, m.key, 40);
          explode(m.x, m.y, 30, 260); impact(me.x, me.y, "#ffb43c", 1.5); hurt(now, 0.8);
        }
      }
    }

    if (ev.type === "aliens") {
      for (let u = 0; u < UFO_N; u++) {
        const key = "e" + ev.cyc + "u" + u;
        if (grabbed.has(key)) continue;
        const p = ufoPos(ev, u, ev.et);
        for (const s of shots) {
          if (!s.mine || s.life <= 0 || SHOTS[s.kind].inert || !segHit(s, p.x, p.y, 48)) continue;
          s.life = 0;
          const h = (ufoHits.get(key) || 0) + shotDmg(s) / DMG_UNIT; ufoHits.set(key, h);
          impact(s.x, s.y, "#7dffb0", 1); packPlay("p_hit_bullet", 0.5, s.x, s.y);
          if (h >= UFO_HP) {
            grabbed.add(key); pushCapped(myGrabs, key, 40);
            me.score += 15; showScore();
            floaters.push({ x: p.x, y: p.y, t: 0, txt: "UFO +15", gold: true });
            explode(p.x, p.y, 80, 340); sfx("boom_bin", 1, 1.1, p.x, p.y);
            gainXp(5, now);
            break;
          }
        }
        if (grabbed.has(key) || now < me.inv || now < (me.hazardAt || 0)) continue;
        for (const o of ufoOrbs(ev, u)) {
          if (Math.hypot(o.x - me.x, o.y - me.y) < 10 + mr * 0.8) { hurt(now, 0.6); break; }
        }
      }
    }

    if (ev.type === "goldrain") {
      for (let i = 0; i < GOLD_N; i++) {
        const gd = goldDrop(ev, i);
        if (!gd || grabbed.has(gd.key) || gd.age < 0.3) continue;
        if (Math.hypot(gd.x - me.x, gd.y - me.y) < 22 + 30 * sizeOf(me.lv)) {
          grabbed.add(gd.key); pushCapped(myGrabs, gd.key, 40);
          me.score += 5; showScore();
          floaters.push({ x: gd.x, y: gd.y, t: 0, txt: "+5", gold: true });
          for (let k = 0; k < 24; k++) { const a = Math.random() * 6.28, v = 80 + Math.random() * 200; puff(gd.x, gd.y, Math.cos(a) * v, Math.sin(a) * v, 0.7, 2.2, "#ffd36b"); }
          audioCue("pickup");
          gainXp(5, now);
        }
      }
    }
  }

