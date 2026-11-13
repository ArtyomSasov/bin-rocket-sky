  // ---------- world events (same for everyone: computed from the shared clock) ----------
  const EV_CYCLE = 45, EV_START = 10, EV_LEN = 25;
  const EV_TYPES = ["blackhole", "meteors", "aliens", "goldrain"];
  const EV_INFO = {
    blackhole: { warn: "A black hole is forming", on: "BLACK HOLE · boost away from it!", col: "#c38bff" },
    meteors:   { warn: "Meteor shower incoming",  on: "METEOR SHOWER · dodge or shoot them", col: "#ff9a2e" },
    aliens:    { warn: "Alien ships detected",    on: "ALIEN ATTACK · 6 hits downs a saucer (+15)", col: "#7dffb0" },
    goldrain:  { warn: "Gold rain is coming",     on: "GOLD RAIN · grab the gold sparks!", col: "#ffd36b" }
  };
  function eventAt(ms) {
    const t = ms / 1000, cyc = Math.floor(t / EV_CYCLE), ph = t - cyc * EV_CYCLE;
    return {
      cyc, ph, et: ph - EV_START,
      type: EV_TYPES[Math.floor(hash(cyc, 77, 1) * EV_TYPES.length)],
      active: ph >= EV_START && ph < EV_START + EV_LEN,
      warn: ph >= EV_START - 5 && ph < EV_START
    };
  }
  const ramp = ev => Math.max(0, Math.min(1, ev.et / 2, (EV_LEN - ev.et) / 2));
  const blackHole = ev => ({ x: 500 + hash(ev.cyc, 78, 1) * (W - 1000), y: 500 + hash(ev.cyc, 78, 2) * (H - 1000), k: ramp(ev) });
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

  function updateEvents(dt, now) {
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
    if (ev.active && ev.type === "blackhole") {
      // shots bend toward the hole and vanish at the horizon
      const bh = blackHole(ev);
      for (const s of shots) {
        const dx = bh.x - s.x, dy = bh.y - s.y, d = Math.hypot(dx, dy) || 1;
        if (d < 60 * bh.k) { s.life = 0; continue; }
        if (d < 1500) { const acc = bh.k * 9e7 / (d * d + 1.5e4); s.vx += dx / d * acc * dt; s.vy += dy / d * acc * dt; }
      }
    }
    if (!ev.active || !playing || me.dead || !roundLive) return;   // events leave you alone during the results break
    const mr = 30 * sizeOf(me.lv);

    if (ev.type === "blackhole") {
      const bh = blackHole(ev), dx = bh.x - me.x, dy = bh.y - me.y, d = Math.hypot(dx, dy) || 1;
      // pull ~ 1/d^2: drifting is fine far out, under ~200 px only a boost gets you out, under ~140 px nothing does
      if (d < 1500) {
        const acc = bh.k * 9e7 / (d * d + 1.5e4);
        me.vx += dx / d * acc * dt; me.vy += dy / d * acc * dt;
      }
      if (d < 60 * bh.k) {
        floaters.push({ x: me.x, y: me.y - 60, t: 0, txt: "Swallowed!", gold: false });
        for (let k = 0; k < 60; k++) { const b = Math.random() * 6.28; puff(me.x, me.y, Math.cos(b) * 300, Math.sin(b) * 300, 0.9, 2.6, k % 2 ? "#c38bff" : "#ffffff"); }
        hurt(now, 99, true);   // the horizon ignores dash invulnerability
        feedPush(`<span class="v">${esc(me.name || "You")}</span> was swallowed by the black hole`, true);
      }
    }

    if (ev.type === "meteors") {
      for (let i = 0; i < 40; i++) {
        const m = meteor(ev, i);
        if (!m || grabbed.has(m.key)) continue;
        for (const s of shots) {
          if (!s.mine || s.life <= 0 || s.kind === K.NUKE || !segHit(s, m.x, m.y, m.r + 12)) continue;
          s.life = 0; grabbed.add(m.key); pushCapped(myGrabs, m.key, 40);
          impact(s.x, s.y, "#ffb43c", 1.5);
          me.score += 2; showScore();
          floaters.push({ x: m.x, y: m.y, t: 0, txt: "+2", gold: false });
          explode(m.x, m.y, 26, 240); sfx("chunk", 0.5, 1.2, m.x, m.y) || blip(320, 0.15, "square");
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
          if (!s.mine || s.life <= 0 || s.kind === K.NUKE || !segHit(s, p.x, p.y, 48)) continue;
          s.life = 0;
          const h = (ufoHits.get(key) || 0) + shotDmg(s) / DMG_UNIT; ufoHits.set(key, h);
          impact(s.x, s.y, "#7dffb0", 1); blip(260, 0.08, "square");
          if (h >= UFO_HP) {
            grabbed.add(key); pushCapped(myGrabs, key, 40);
            me.score += 15; showScore();
            floaters.push({ x: p.x, y: p.y, t: 0, txt: "UFO +15", gold: true });
            explode(p.x, p.y, 80, 340); sfx("boom_bin", 1, 1.1, p.x, p.y) || blip(90, 0.5, "sawtooth");
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
          blip(700, 0.25);
          gainXp(5, now);
        }
      }
    }
  }

  function drawEvents(now) {
    const ev = eventAt(clockNow());
    if (!ev.active) return;
    const t = now / 1000;

    if (ev.type === "meteors") {
      for (let i = 0; i < 40; i++) {
        const m = meteor(ev, i);
        if (!m || grabbed.has(m.key)) continue;
        const x = sx(m.x), y = sy(m.y);
        if (!onScreen(x, y, 200)) continue;
        g.save(); g.translate(x, y); g.rotate(Math.atan2(m.vy, m.vx));
        g.globalCompositeOperation = "lighter";
        const tl = m.r * 9;
        const tg = g.createLinearGradient(-tl, 0, 0, 0);
        tg.addColorStop(0, "rgba(255,60,20,0)"); tg.addColorStop(0.7, "rgba(255,130,40,0.6)"); tg.addColorStop(1, "rgba(255,230,150,0.9)");
        g.fillStyle = tg; g.beginPath(); g.moveTo(0, -m.r * 0.9);
        g.quadraticCurveTo(-tl * 0.5, -m.r * 0.5 + Math.sin(t * 20 + i) * 3, -tl, 0);
        g.quadraticCurveTo(-tl * 0.5, m.r * 0.5, 0, m.r * 0.9); g.fill();
        g.globalCompositeOperation = "source-over";
        const rg = g.createRadialGradient(-m.r * 0.3, -m.r * 0.3, 1, 0, 0, m.r);
        rg.addColorStop(0, "#ffd9a0"); rg.addColorStop(0.5, "#c0582a"); rg.addColorStop(1, "#5a2418");
        g.fillStyle = rg; g.beginPath(); g.arc(0, 0, m.r, 0, 6.29); g.fill();
        g.restore();
      }
    }

    if (ev.type === "aliens") {
      for (let u = 0; u < UFO_N; u++) {
        const key = "e" + ev.cyc + "u" + u;
        if (grabbed.has(key)) continue;
        g.globalCompositeOperation = "lighter";
        for (const o of ufoOrbs(ev, u)) {
          const x = sx(o.x), y = sy(o.y);
          if (!onScreen(x, y, 20)) continue;
          const og = g.createRadialGradient(x, y, 0, x, y, 14);
          og.addColorStop(0, "rgba(220,255,230,1)"); og.addColorStop(0.4, "rgba(90,255,150,0.8)"); og.addColorStop(1, "rgba(40,255,120,0)");
          g.fillStyle = og; g.beginPath(); g.arc(x, y, 14, 0, 6.29); g.fill();
        }
        g.globalCompositeOperation = "source-over";
        const p = ufoPos(ev, u, ev.et), x = sx(p.x), y = sy(p.y + Math.sin(t * 3 + u) * 6);
        if (!onScreen(x, y, 60)) { drawEdgeArrow(x, y, "#7dffb0"); continue; }
        const sc = Math.min(1, ev.et / 1.2);
        g.save(); g.translate(x, y); g.scale(sc, sc);
        const beam = g.createLinearGradient(0, 0, 0, 90);
        beam.addColorStop(0, "rgba(125,255,176,0.35)"); beam.addColorStop(1, "rgba(125,255,176,0)");
        g.fillStyle = beam; g.beginPath(); g.moveTo(-14, 6); g.lineTo(14, 6); g.lineTo(34, 90); g.lineTo(-34, 90); g.fill();
        const dome = g.createRadialGradient(-6, -18, 2, 0, -10, 22);
        dome.addColorStop(0, "#e9fffb"); dome.addColorStop(1, "rgba(79,214,200,0.55)");
        g.fillStyle = dome; g.beginPath(); g.ellipse(0, -8, 20, 18, 0, Math.PI, 0); g.fill();
        const hull = g.createLinearGradient(0, -12, 0, 14);
        hull.addColorStop(0, "#d9d2ee"); hull.addColorStop(1, "#5f557f");
        g.fillStyle = hull; g.beginPath(); g.ellipse(0, 0, 46, 13, 0, 0, 6.29); g.fill();
        for (let l = 0; l < 7; l++) {
          const on = Math.floor(t * 6 + l) % 3 === 0;
          g.fillStyle = on ? "#7dffb0" : "#3a3355";
          g.beginPath(); g.arc(-33 + l * 11, 2, 3, 0, 6.29); g.fill();
        }
        const hp = UFO_HP - (ufoHits.get(key) || 0);
        g.fillStyle = "rgba(20,12,40,0.6)"; g.fillRect(-24, -38, 48, 5);
        g.fillStyle = "#7dffb0"; g.fillRect(-24, -38, 48 * hp / UFO_HP, 5);
        g.restore();
      }
    }

    if (ev.type === "goldrain") {
      for (let i = 0; i < GOLD_N; i++) {
        const gd = goldDrop(ev, i);
        if (!gd || grabbed.has(gd.key)) continue;
        const x = sx(gd.x), y = sy(gd.y);
        if (!onScreen(x, y, 40)) continue;
        const fade = Math.min(1, (7 - gd.age) / 1);
        g.globalAlpha = fade;
        drawSpark(x, y, 15, true, now, gd.age / 4);
        g.globalAlpha = 1;
      }
    }
  }

  // black hole: gravitational lens over everything behind it, then the accretion disk and the horizon
  const lensCv = document.createElement("canvas"), lctx = lensCv.getContext("2d");
  // shock-wave refraction: copy the band around a blast ring and paint it back slightly magnified,
  // so everything behind the expanding wave wobbles like hot air
  const warpCv = document.createElement("canvas"), wctx = warpCv.getContext("2d");
  function refractRing(x, y, r, w, strength) {
    const R = r + w, sc = dpr * zoom, size = Math.ceil(2 * R * sc);
    if (size < 8 || size > 2600) return;
    if (warpCv.width < size) { warpCv.width = warpCv.height = size; } else wctx.clearRect(0, 0, size, size);
    const px = Math.round((x - R) * sc), py = Math.round((y - R) * sc);
    const ax = Math.max(0, px), ay = Math.max(0, py), bx = Math.min(cv.width, px + size), by = Math.min(cv.height, py + size);
    if (bx <= ax || by <= ay) return;
    wctx.drawImage(cv, ax, ay, bx - ax, by - ay, ax - px, ay - py, bx - ax, by - ay);
    g.save();
    g.beginPath(); g.arc(x, y, R, 0, 6.29); g.arc(x, y, Math.max(0, r - w), 0, 6.29, true); g.clip("evenodd");
    const m = 1 + 0.07 * strength;
    g.translate(x, y); g.scale(m, m);
    g.drawImage(warpCv, 0, 0, size, size, -R, -R, 2 * R, 2 * R);
    g.restore();
  }
  function drawBlackHole(now) {
    const ev = eventAt(clockNow());
    if (!ev.active || ev.type !== "blackhole") return;
    const bh = blackHole(ev), x = sx(bh.x), y = sy(bh.y), k = bh.k, t = now / 1000;
    const R = 360 * k;
    if (!onScreen(x, y, R)) { if (playing) drawEdgeArrow(x, y, "#c38bff"); return; }
    if (!lowQ && R > 30) {
      // copy what is already drawn around the hole, then repaint it in rings that are
      // magnified and twisted more and more toward the centre
      const sc = dpr * zoom, size = Math.ceil(2 * R * sc);
      if (lensCv.width !== size) { lensCv.width = lensCv.height = size; } else lctx.clearRect(0, 0, size, size);
      const px = Math.round((x - R) * sc), py = Math.round((y - R) * sc);
      const ax = Math.max(0, px), ay = Math.max(0, py), bx = Math.min(cv.width, px + size), by = Math.min(cv.height, py + size);
      if (bx > ax && by > ay) lctx.drawImage(cv, ax, ay, bx - ax, by - ay, ax - px, ay - py, bx - ax, by - ay);
      const N = 24;   // more rings = softer steps between them
      for (let i = N; i >= 1; i--) {
        const f = 1 - (i - 0.5) / N;
        const mag = 1 + f * f * 2.0 * k, rot = (f * f * 2.2 + Math.sin(t * 0.8) * 0.12 * f) * k;
        g.save(); g.beginPath(); g.arc(x, y, R * i / N, 0, 6.29); g.clip();
        g.translate(x, y); g.rotate(rot); g.scale(mag, mag);
        g.drawImage(lensCv, -R, -R, 2 * R, 2 * R);
        g.restore();
      }
    }
    // Interstellar-style look: a thin, almost edge-on hot disk crossing in front, the far side of the
    // disk bent up over the top and down under the bottom by gravity (the halo), a hair-thin photon
    // ring around a pure black shadow, and the approaching (left) side brighter than the receding one.
    const r0 = 58 * k;                     // shadow radius (= kill radius)
    const DISK_IN = 1.55, DISK_OUT = 3.6, FLAT = 0.11;
    // warm glow
    g.globalCompositeOperation = "lighter";
    const glow = g.createRadialGradient(x, y, r0, x, y, r0 * 4.2);
    glow.addColorStop(0, "rgba(255,200,130,0.32)"); glow.addColorStop(0.4, "rgba(255,150,80,0.12)"); glow.addColorStop(1, "rgba(255,120,60,0)");
    g.fillStyle = glow; g.beginPath(); g.arc(x, y, r0 * 4.2, 0, 6.29); g.fill();
    // lensed far side of the disk: one smooth glowing ring, a little taller than wide, brighter on the left
    g.save(); g.translate(x - r0 * 0.08, y); g.scale(1, 1.14);
    const hg = g.createRadialGradient(0, 0, r0 * 0.98, 0, 0, r0 * 2.05);
    hg.addColorStop(0, `rgba(255,250,235,${0.95 * k})`); hg.addColorStop(0.18, `rgba(255,225,165,${0.75 * k})`);
    hg.addColorStop(0.5, `rgba(255,170,90,${0.28 * k})`); hg.addColorStop(1, "rgba(255,130,60,0)");
    g.fillStyle = hg; g.beginPath(); g.arc(0, 0, r0 * 2.05, 0, 6.29); g.fill();
    g.restore();
    // disk bands; back half (upper) first
    // the disk itself: a flattened ring filled with a smooth hot gradient; the left half gets a second,
    // additive pass so the side moving toward us is brighter
    const band = (front) => {
      g.save(); g.beginPath();
      if (front) g.rect(x - r0 * 5, y, r0 * 10, r0 * 3); else g.rect(x - r0 * 5, y - r0 * 3, r0 * 10, r0 * 3);
      g.clip();
      g.translate(x, y); g.scale(1, FLAT);
      const dg = g.createRadialGradient(0, 0, r0 * DISK_IN * 0.92, 0, 0, r0 * DISK_OUT);
      dg.addColorStop(0, "rgba(255,240,210,0)"); dg.addColorStop(0.04, `rgba(255,252,240,${0.95 * k})`);
      dg.addColorStop(0.3, `rgba(255,220,160,${0.7 * k})`); dg.addColorStop(0.7, `rgba(255,160,80,${0.3 * k})`); dg.addColorStop(1, "rgba(255,120,50,0)");
      g.fillStyle = dg;
      g.beginPath(); g.arc(0, 0, r0 * DISK_OUT, 0, 6.29); g.arc(0, 0, r0 * DISK_IN * 0.92, 0, 6.29, true); g.fill("evenodd");
      g.beginPath(); g.rect(-r0 * DISK_OUT, -r0 * DISK_OUT, r0 * DISK_OUT, r0 * DISK_OUT * 2); g.clip();
      g.globalAlpha = 0.45 + 0.1 * Math.sin(t * 2);
      g.beginPath(); g.arc(0, 0, r0 * DISK_OUT, 0, 6.29); g.arc(0, 0, r0 * DISK_IN * 0.92, 0, 6.29, true); g.fill("evenodd");
      g.restore();
      g.globalAlpha = 1;
    };
    band(false);
    // hot clumps orbiting in the disk (back ones now, front ones after the shadow)
    const clumps = front => {
      const n = lowQ ? 14 : 34;
      for (let i = 0; i < n; i++) {
        const rr = r0 * (DISK_IN + (DISK_OUT - DISK_IN) * ((i * 0.618) % 1));
        const th = i * 2.4 + t * (2.4 / Math.sqrt(rr / r0));
        if ((Math.sin(th) > 0) !== front) continue;
        const px = x + Math.cos(th) * rr, py = y + Math.sin(th) * rr * FLAT;
        const dop = 0.5 + 0.5 * -Math.cos(th);   // left side brighter
        g.globalAlpha = (0.25 + 0.6 * dop) * k;
        g.fillStyle = "#fff4dc";
        g.beginPath(); g.ellipse(px, py, 3 + dop * 5, 1.1, 0, 0, 6.29); g.fill();
      }
    };
    clumps(false);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    // the shadow, with a soft edge
    const sh = g.createRadialGradient(x, y, r0 * 0.9, x, y, r0 * 1.08);
    sh.addColorStop(0, "#000000"); sh.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = sh; g.beginPath(); g.arc(x, y, r0 * 1.08, 0, 6.29); g.fill();
    g.fillStyle = "#000000"; g.beginPath(); g.arc(x, y, r0 * 0.92, 0, 6.29); g.fill();
    // photon ring
    g.globalCompositeOperation = "lighter";
    g.strokeStyle = `rgba(255,244,220,${0.85 * k})`; g.lineWidth = 1.6;
    g.beginPath(); g.arc(x, y, r0 * 1.02, 0, 6.29); g.stroke();
    // front half of the disk crosses in front of the shadow
    band(true);
    clumps(true);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }

  function drawEdgeArrow(x, y, col) {
    const cx = vw / 2, cy = vh / 2, dx = x - cx, dy = y - cy;
    const m = 40, t = Math.min((cx - m) / Math.abs(dx || 1e-6), (cy - m) / Math.abs(dy || 1e-6));
    g.save(); g.translate(cx + dx * t, cy + dy * t); g.rotate(Math.atan2(dy, dx));
    g.fillStyle = col; g.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 150);
    g.beginPath(); g.moveTo(16, 0); g.lineTo(-10, -11); g.lineTo(-4, 0); g.lineTo(-10, 11); g.closePath(); g.fill();
    g.restore(); g.globalAlpha = 1;
  }

  // space junk (behind the planets)
  function drawJunk(now) {
    for (let i = 0; i < ROCKS; i++) {
      const k = world.rocks[i];
      if (grabbed.has(k.key)) continue;
      const x = sx(k.x), y = sy(k.y);
      if (onScreen(x, y, 50)) drawRock(k, x, y);
    }
  }
  // spilled stars, weapon crates, medkits and shields, Overdrive, the nuke, sparks
  function drawPickups(now) {
    for (const [id, d] of drops) {
      const age = now - d.born, fade = age > DROP_LIFE - 3000 && Math.floor(now / 120) % 2 ? 0.35 : 1;
      g.globalAlpha = fade;
      for (let j = 0; j < d.n; j++) {
        const st = dropStar(d, id, j, now);
        if (grabbed.has(st.key)) continue;
        const x = sx(st.x), y = sy(st.y);
        if (onScreen(x, y, 30)) drawSpark(x, y, 8, false, now, 1);
      }
      g.globalAlpha = 1;
    }
    for (let i = 0; i < world.picks.length; i++) {
      const c = world.picks[i];
      if (grabbed.has(c.key)) continue;
      const x = sx(c.x), y = sy(c.y) + Math.sin(now / 400 + i) * 6;
      if (onScreen(x, y, 50)) drawCrate(c, x, y, now);
    }
    for (const c of world.supplies) {
      if (grabbed.has(c.key)) continue;
      const x = sx(c.x), y = sy(c.y) + Math.sin(now / 450 + c.x) * 5;
      if (onScreen(x, y, 60)) drawSupply(c, x, y, now);
    }
    if (world.amp && !grabbed.has(world.amp.key)) {
      const x = sx(world.amp.x), y = sy(world.amp.y);
      if (onScreen(x, y, 80)) drawAmpCrate(world.amp, x, y, now); else if (playing) drawEdgeArrow(x, y, "#c38bff");
    }
    if (world.nuke && !grabbed.has(world.nuke.key)) {
      const x = sx(world.nuke.x), y = sy(world.nuke.y);
      if (onScreen(x, y, 90)) drawNukeCrate(world.nuke, x, y, now); else if (playing) drawEdgeArrow(x, y, "#ffe14d");
    }
    // sparks
    for (let i = 0; i < SLOTS; i++) {
      const s = world.sparks[i];
      if (grabbed.has(s.key)) continue;
      const x = sx(s.x), y = sy(s.y);
      if (onScreen(x, y, 40)) drawSpark(x, y, s.gold ? 15 : 9, s.gold, now, s.age);
    }
  }
  // dead bins: hulks, fragments, melting bins, debris
  function drawWreckage(now) {
    for (const h of hulks) {
      const x = sx(h.x), y = sy(h.y), s = BOT * sizeOf(h.lv);
      if (!onScreen(x, y, s)) continue;
      g.globalAlpha = Math.min(1, h.life / 2);
      g.save(); g.translate(x, y); g.rotate(h.a + Math.PI / 2 - SPRITE_TILT);
      drawWings(h.lv, s);
      if (body) g.drawImage(darkBody(h.ck || [0, 0, 0, 0, 0], h.zap ? 0.8 : 0.58), -s / 2, -s / 2, s, s);
      drawDamage(1, s, now, h.x);
      const zk = h.zap ? 1 - (now - h.born) / 2800 : 0;
      if (zk > 0) {   // fried: blue arcs crawl over the shell and it flickers
        g.globalCompositeOperation = "lighter";
        if (Math.random() < 0.5) { g.globalAlpha = 0.35 * zk; g.drawImage(dotSprite("#7fd8ff"), -s * 0.6, -s * 0.6, s * 1.2, s * 1.2); }
        g.lineJoin = "round"; g.lineCap = "round";
        for (let k = 0; k < 3; k++) {
          let a = Math.random() * 6.28, r = s * (0.15 + Math.random() * 0.3), px = Math.cos(a) * r, py = Math.sin(a) * r;
          const pts = [[px, py]];
          for (let n = 0; n < 5; n++) { a += (Math.random() - 0.5) * 1.6; r = clamp(r + (Math.random() - 0.5) * s * 0.2, s * 0.08, s * 0.48); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
          for (const [w, c] of [[6, "rgba(120,200,255,0.35)"], [2, "rgba(200,240,255,0.95)"]]) {
            g.globalAlpha = zk; g.strokeStyle = c; g.lineWidth = w; g.beginPath(); pts.forEach(([x2, y2], i) => i ? g.lineTo(x2, y2) : g.moveTo(x2, y2)); g.stroke();
          }
        }
        g.globalCompositeOperation = "source-over";
      }
      g.restore();
      g.globalAlpha = 1;
    }
    for (const f of frags) {
      const x = sx(f.x), y = sy(f.y), s = f.s;
      if (!onScreen(x, y, s)) continue;
      const fade = 1, hot = 1 - (now - f.born) / 5000;
      g.save(); g.translate(x, y); g.rotate(f.a);
      g.translate(-(f.cx / 320 - 0.5) * s, -(f.cy / 320 - 0.5) * s);   // the piece turns around its own middle
      g.globalAlpha = fade; g.drawImage(f.img, -s / 2, -s / 2, s, s);
      if (hot > 0) { g.globalAlpha = fade * hot; g.drawImage(f.glow, -s / 2, -s / 2, s, s); }
      g.restore();
      g.globalAlpha = 1;
    }
    drawMelts(now);
    // wreckage: jagged pieces in the bin's colours with a scorched edge, fading out at the end
    for (const d of debris) {
      const x = sx(d.x), y = sy(d.y);
      if (!onScreen(x, y, 30)) continue;
      g.globalAlpha = Math.min(1, d.life / 2);
      g.save(); g.translate(x, y); g.rotate(d.rot);
      g.beginPath();
      d.shape.forEach((f, j) => { const a = j / d.shape.length * 6.283; g.lineTo(Math.cos(a) * d.size * f * 1.3, Math.sin(a) * d.size * f); });
      g.closePath();
      g.fillStyle = d.col; g.fill();
      g.strokeStyle = "rgba(25,18,32,0.7)"; g.lineWidth = 1.5; g.stroke();
      const dAge = (now - d.born) / 1000;
      if (dAge < 2.5) {   // still glowing hot
        g.strokeStyle = `rgba(255,150,60,${0.8 * (1 - dAge / 2.5)})`; g.lineWidth = 1.2; g.stroke();
      }
      g.restore();
    }
  }
  // additive layer: glowing particles and spark streaks, then the shots
  function drawGlow(now) {
    // glow dots and spark streaks (additive)
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    for (const p of parts) {
      if (p.k >= 2) continue;
      const x = sx(p.x), y = sy(p.y);
      if (!onScreen(x, y, 30)) continue;
      g.globalAlpha = Math.max(0, p.life / p.max) * 0.9;
      if (p.k === 1) {
        g.strokeStyle = p.col; g.lineWidth = p.size;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - p.vx * p.len, y - p.vy * p.len); g.stroke();
      } else {
        const d = p.size * 2.6;
        g.drawImage(dotSprite(p.col), x - d / 2, y - d / 2, d, d);
      }
    }
    g.globalAlpha = 1;
    for (const s of shots) {
      const x = sx(s.x), y = sy(s.y);
      if (onScreen(x, y, 60)) drawShot(s, x, y, now);
    }
    g.globalCompositeOperation = "source-over";
  }
  // the other pilots, then me
  function drawPilots(now) {
    // bots
    for (const r of remotes.values()) {
      if (r.dead) continue;
      const x = sx(r.x), y = sy(r.y);
      if (onScreen(x, y, BOT * 2)) drawBot({ ...r, blink: r.inv }, x, y, now, false);
      else drawPointer(r, x, y);
    }
    if (!me.dead) drawBot({ ...me, name: playing && !COMPACT.matches ? me.name : "", blink: now < me.inv }, sx(me.x), sy(me.y), now, true);   // on a small screen your own label goes
    else {
      g.textAlign = "center"; g.fillStyle = "#ffffff";
      g.font = `700 ${30 * TS}px ` + DISPLAY_FONT;
      g.fillText((killer ? "Killed by " + killer + " · " : "Boom! ") + "back in " + Math.max(1, Math.ceil((me.respawnAt - now) / 1000)) + "…", vw / 2, vh / 2);
    }
  }
  // smoke over the bins, impact flashes, rail trails, chain lightning, shock rings, nuke blasts
  function drawBlastFx(now) {
    // smoke on top of the bins, so a damaged bin visibly smokes
    for (const p of parts) {
      if (p.k !== 2) continue;
      const x = sx(p.x), y = sy(p.y), f = Math.max(0, p.life / p.max);
      if (!onScreen(x, y, 40)) continue;
      g.globalAlpha = f * 0.6;
      const d = p.size * (2.4 + (1 - f) * 3.5);
      g.drawImage(dotSprite(p.col), x - d / 2, y - d / 2, d, d);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "lighter";
    for (const m of impacts) {
      if (m.t < 0) continue;   // delayed flash
      const x = sx(m.x), y = sy(m.y), k = m.t / 0.22, r = m.r * (0.5 + k);
      if (!onScreen(x, y, r)) continue;
      const fg = g.createRadialGradient(x, y, 0, x, y, r);
      fg.addColorStop(0, `rgba(255,255,240,${0.95 * (1 - k)})`); fg.addColorStop(0.35, m.col); fg.addColorStop(1, "rgba(255,120,40,0)");
      g.globalAlpha = 1 - k; g.fillStyle = fg; g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill();
    }
    g.globalAlpha = 1;
    for (const b of beams) {   // rail trails: a white-hot core in a violet glow that goes quickly, and a double spiral that lingers and unwinds
      const k = 1 - b.t / BEAM_T, kc = Math.max(0, 1 - b.t / 0.4), x1 = sx(b.x1), y1 = sy(b.y1), x2 = sx(b.x2), y2 = sy(b.y2);
      g.lineCap = "round"; g.lineJoin = "round";
      if (kc > 0) {
        g.strokeStyle = `rgba(190,120,255,${0.35 * kc})`; g.lineWidth = 26 * kc + 4;
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        g.strokeStyle = `rgba(233,200,255,${0.8 * kc})`; g.lineWidth = 8 * kc + 1;
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        g.strokeStyle = `rgba(255,255,255,${kc})`; g.lineWidth = 2.5 * kc + 0.5;
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      }
      // only the part on screen is traced, so a long trail stays cheap
      const L = Math.hypot(x2 - x1, y2 - y1), nx = (x2 - x1) / (L || 1), ny = (y2 - y1) / (L || 1), r = 8 + b.t * 26;
      const proj = (px, py) => (px - x1) * nx + (py - y1) * ny, ds = [proj(0, 0), proj(vw, 0), proj(0, vh), proj(vw, vh)];
      const d0 = Math.max(0, Math.min(...ds) - 40), d1 = Math.min(L, Math.max(...ds) + 40), step = lowQ ? 10 : 5;
      const side = (px, py) => (px - x1) * -ny + (py - y1) * nx, ss = [side(0, 0), side(vw, 0), side(0, vh), side(vw, vh)];
      if (Math.min(...ss) > r + 40 || Math.max(...ss) < -r - 40) continue;   // the whole screen is off to one side of the trail
      for (const [ph, col] of [[0, "217,168,255"], [Math.PI, "255,230,255"]]) {
        g.strokeStyle = `rgba(${col},${0.75 * k})`; g.lineWidth = 2 * k + 0.6;
        g.beginPath();
        for (let d = d0; d <= d1; d += step) {
          const a = d / 22 + ph + b.t * 4, o = Math.sin(a) * r;
          const px = x1 + nx * d - ny * o, py = y1 + ny * d + nx * o;
          d === d0 ? g.moveTo(px, py) : g.lineTo(px, py);
        }
        g.stroke();
      }
    }
    for (const q of arcs) {   // chain lightning
      const k = 1 - q.t / 0.3, x1 = sx(q.x1), y1 = sy(q.y1), x2 = sx(q.x2), y2 = sy(q.y2), L = Math.hypot(x2 - x1, y2 - y1) || 1, nx = (x2 - x1) / L, ny = (y2 - y1) / L;
      const pts = [[x1, y1]];
      for (let s2 = 1; s2 < 8; s2++) { const t = s2 / 8, o = (Math.random() - 0.5) * 30; pts.push([x1 + (x2 - x1) * t - ny * o, y1 + (y2 - y1) * t + nx * o]); }
      pts.push([x2, y2]);
      for (const [w, c] of [[8, `rgba(120,200,255,${0.35 * k})`], [2.5, `rgba(220,248,255,${k})`]]) {
        g.strokeStyle = c; g.lineWidth = w; g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.stroke();
      }
    }
    for (const q of rings) {
      if (q.t < 0) continue;
      const x = sx(q.x), y = sy(q.y), k = q.t / (q.dur || 0.6), e = 1 - (1 - k) * (1 - k);
      if (q.warp && !lowQ && k < 0.9 && onScreen(x, y, q.r)) {
        g.globalCompositeOperation = "source-over"; refractRing(x, y, q.r * e, 24, 1 - k); g.globalCompositeOperation = "lighter";
      }
      g.strokeStyle = `rgba(${q.col},${0.7 * (1 - k)})`; g.lineWidth = (q.w || 10) * (1 - k) + 1.5;
      g.beginPath(); g.arc(x, y, q.r * e, 0, 6.29); g.stroke();
    }
    g.globalCompositeOperation = "source-over";
    for (const b of booms) {
      const x = sx(b.x), y = sy(b.y), T = b.t;
      if (!onScreen(x, y, NUKE_R)) continue;
      const grow = Math.min(1, T / 0.8), e = 1 - Math.pow(1 - grow, 3);
      const fr = NUKE_R * 0.8 * e * (T > 1.6 ? 1 - (T - 1.6) / (BOOM_LIFE - 1.6) * 0.3 : 1);
      const heat = T < 0.3 ? 1 : Math.max(0, 1 - (T - 0.3) / (BOOM_LIFE - 0.3));
      const cool = Math.min(1, T / 1.5);   // white -> orange -> deep red as it cools
      g.globalCompositeOperation = "lighter";
      // churning edge: blobs around the rim, drifting
      for (let j = 0; j < (lowQ ? 6 : 14); j++) {
        const a = j * 0.4488 + b.seed + T * 0.35 * (j % 2 ? 1 : -1);
        const rr = fr * (0.62 + 0.22 * Math.sin(j * 3.1 + T * 3 + b.seed));
        const bx = x + Math.cos(a) * rr, by = y + Math.sin(a) * rr, br = fr * (0.38 + 0.08 * Math.sin(T * 5 + j));
        const bg = g.createRadialGradient(bx, by, 0, bx, by, br);
        bg.addColorStop(0, `rgba(255,${Math.round(200 - cool * 90)},${Math.round(110 - cool * 70)},${0.55 * heat})`); bg.addColorStop(1, "rgba(255,60,20,0)");
        g.fillStyle = bg; g.beginPath(); g.arc(bx, by, br, 0, 6.29); g.fill();
      }
      // the core
      const cg = g.createRadialGradient(x, y, 0, x, y, fr);
      cg.addColorStop(0, `rgba(255,255,245,${heat})`);
      cg.addColorStop(0.3, `rgba(255,${Math.round(240 - cool * 80)},${Math.round(180 - cool * 120)},${0.9 * heat})`);
      cg.addColorStop(0.7, `rgba(255,${Math.round(140 - cool * 60)},40,${0.55 * heat})`);
      cg.addColorStop(1, "rgba(200,40,20,0)");
      g.fillStyle = cg; g.beginPath(); g.arc(x, y, fr, 0, 6.29); g.fill();
      // blinding first instant
      if (T < 0.4) {
        const fl = g.createRadialGradient(x, y, 0, x, y, NUKE_R * 1.8);
        fl.addColorStop(0, `rgba(255,255,255,${1 - T / 0.4})`); fl.addColorStop(0.4, `rgba(255,245,220,${0.6 * (1 - T / 0.4)})`); fl.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = fl; g.beginPath(); g.arc(x, y, NUKE_R * 1.8, 0, 6.29); g.fill();
      }
      if (T < 1.4) {   // a white-hot shock shell racing out ahead of the fireball
        const k = T / 1.4, rr = NUKE_R * (0.2 + 1.1 * (1 - Math.pow(1 - k, 2)));
        const sg = g.createRadialGradient(x, y, rr * 0.82, x, y, rr);
        sg.addColorStop(0, "rgba(255,255,255,0)"); sg.addColorStop(0.7, `rgba(255,240,200,${0.5 * (1 - k)})`); sg.addColorStop(1, "rgba(255,200,140,0)");
        g.fillStyle = sg; g.beginPath(); g.arc(x, y, rr, 0, 6.29); g.fill();
      }
      g.globalCompositeOperation = "source-over";
    }
  }
  // floating score text
  function drawFloaters(now) {
    // floating score text
    g.textAlign = "center";
    for (const f of floaters) {
      g.globalAlpha = 1 - f.t;
      g.font = `700 ${(f.gold ? 26 : f.big ? 30 : f.hit ? 20 : 18) * TS}px ` + DISPLAY_FONT;
      g.fillStyle = f.gold ? "#ffd36b" : f.col || (f.hit ? "#ff6b6b" : "#ffffff");
      g.fillText(f.txt, sx(f.x), sy(f.y) - f.t * 50);
    }
    g.globalAlpha = 1;
  }
  // whole-screen flashes: a blast's white-out, the red edge when hurt
  function drawScreenFx(now) {
    if (flash > 0) { g.fillStyle = `rgba(255,252,235,${flash})`; g.fillRect(0, 0, vw, vh); }
    if (hurtFlash > 0) {   // taking damage: the edges of the screen flush red
      const vg = g.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
      vg.addColorStop(0, "rgba(255,30,40,0)"); vg.addColorStop(1, `rgba(255,30,40,${0.55 * hurtFlash})`);
      g.fillStyle = vg; g.fillRect(0, 0, vw, vh);
    }
  }
  // one frame, back to front. Everything inside the save/restore moves with the camera shake
  function draw(now) {
    // every frame starts from a clean canvas state: if some effect throws mid-frame, that frame is lost,
    // not the look of every frame after it (a left-over "lighter" mode once washed the whole screen white)
    applyView(); g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.setLineDash([]);
    g.save();
    try { drawWorld(now); g.restore(); }
    catch (e) { if (g.reset) g.reset(); else g.restore(); applyView(); throw e; }   // a frame that failed half-way leaves nothing behind
    drawScreenFx(now);
  }
  function drawWorld(now) {
    if (shake > 0) g.translate((Math.random() - .5) * shake * 40, (Math.random() - .5) * shake * 40);
    g.translate(-camKick.x, -camKick.y);
    drawSky(now);
    drawWalls(now);
    drawJunk(now);
    drawBodies(now);   // after the junk: drifting rocks pass behind planets
    drawEvents(now);
    drawPickups(now);
    drawWreckage(now);
    drawGlow(now);
    drawBlackHole(now);   // lenses the world behind it; bots and text are drawn on top, undistorted
    drawPilots(now);
    drawAim(now);
    drawFlags(now);
    drawBlastFx(now);
    drawFloaters(now);
  }

  // edge arrow toward an off-screen flyer
  function drawPointer(r, x, y) {
    const cx = vw / 2, cy = vh / 2, dx = x - cx, dy = y - cy;
    const m = 28, t = Math.min((cx - m) / Math.abs(dx || 1e-6), (cy - m) / Math.abs(dy || 1e-6));
    const px = cx + dx * t, py = cy + dy * t, a = Math.atan2(dy, dx);
    g.save(); g.translate(px, py); g.rotate(a);
    g.fillStyle = `hsl(${r.hue} 90% 75%)`; g.globalAlpha = 0.85;
    g.beginPath(); g.moveTo(10, 0); g.lineTo(-7, -7); g.lineTo(-7, 7); g.closePath(); g.fill();
    g.restore(); g.globalAlpha = 1;
  }

