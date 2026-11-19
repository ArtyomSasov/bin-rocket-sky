  // ---------- sparks (shared via deterministic clock) ----------
  function spark(i, now) {
    const off = hash(i, 7, 7) * PERIOD;
    const gen = Math.floor((now / 1000 + off) / PERIOD);
    const age = (now / 1000 + off) / PERIOD - gen;
    return outside({
      key: i + ":" + gen,
      x: 90 + hash(i, gen, 1) * (W - 180), y: 90 + hash(i, gen, 2) * (H - 180),
      gold: hash(i, gen, 3) < 0.12, age
    });
  }

  // ---------- space junk (shared clock, with persistent collision trajectories) ----------
  const rockMotion = new Map();   // slot -> latest impact; at most ROCKS entries
  let rockMotionCursor = 0;
  const rockGeneration = (i, now) => Math.floor((now / 1000 + hash(i, 9, 9) * ROCK_PERIOD) / ROCK_PERIOD);
  // The derivative of bounceIn: keep velocity pointing inward after crossing an arena edge.
  function rockAxis(x, v, dt, hi) {
    const raw = x + v * dt, phase = mod(raw - 40, 2 * (hi - 40));
    return [bounceIn(raw, 40, hi), phase < hi - 40 ? v : -v];
  }
  function rock(i, now) {
    const tt = now / 1000 + hash(i, 9, 9) * ROCK_PERIOD;
    const gen = Math.floor(tt / ROCK_PERIOD), age = tt - gen * ROCK_PERIOD;
    const ang = hash(i, gen, 21) * 6.283, sp = 50 + hash(i, gen, 22) * 90;
    const motion = rockMotion.get(i);
    if (motion && motion.gen !== gen) rockMotion.delete(i);
    const moved = motion && motion.gen === gen;
    const dt = moved ? Math.max(0, (now - motion.at) / 1000) : age;
    const [x, vx] = rockAxis(moved ? motion.x : hash(i, gen, 23) * W, moved ? motion.vx : Math.cos(ang) * sp, dt, W - 40);
    const [y, vy] = rockAxis(moved ? motion.y : hash(i, gen, 24) * H, moved ? motion.vy : Math.sin(ang) * sp, dt, H - 40);
    return {
      key: "m" + i + ":" + gen, slot: i, gen, x, y, vx, vy,
      r: 22 + hash(i, gen, 25) * 18, seed: i * 977 + gen,
      spin: age * (hash(i, gen, 26) - 0.5) * 2, age
    };
  }
  // Exchange normal momentum with restitution 0.6. Tangential velocity is unchanged.
  function collideRock(pilot, k) {
    const dx = pilot.x - k.x, dy = pilot.y - k.y, d = Math.hypot(dx, dy), R = k.r + 26 * sizeOf(pilot.lv);
    if (d >= R || d <= 0.01) return 0;
    const nx = dx / d, ny = dy / d;
    pilot.x += nx * (R - d); pilot.y += ny * (R - d);
    const vn = (pilot.vx - k.vx) * nx + (pilot.vy - k.vy) * ny;
    if (vn >= 0) return 0;
    const binMass = sizeOf(pilot.lv) ** 2, rockMass = (k.r / 30) ** 2;
    const impulse = -1.6 * vn / (1 / binMass + 1 / rockMass);
    pilot.vx += impulse * nx / binMass; pilot.vy += impulse * ny / binMass;
    if (replaying) return -vn;   // (a replay of my commands bounces my bin only: the rock was bumped the first time)
    k.vx -= impulse * nx / rockMass; k.vy -= impulse * ny / rockMass;
    rockMotion.set(k.slot, { slot: k.slot, gen: k.gen, at: clockNow(), x: k.x, y: k.y, vx: k.vx, vy: k.vy, by: myTag });
    rockMotionCursor = [...rockMotion.keys()].indexOf(k.slot);   // send this impact on the next state
    return -vn;
  }
  function pruneRockMotion(now) {
    for (const [i, m] of rockMotion) if (i >= ROCKS || m.gen !== rockGeneration(i, now)) rockMotion.delete(i);
  }
  function nextRockMotion() {
    pruneRockMotion(clockNow());
    const list = [...rockMotion.values()], out = [];
    for (let n = 0; n < Math.min(4, list.length); n++) {
      const m = list[rockMotionCursor++ % list.length];
      out.push([m.slot, m.gen, m.at, m.x, m.y, m.vx, m.vy, m.by]);
    }
    return out;
  }
  function applyRockMotion(list) {
    const now = clockNow();
    for (const e of list.slice(0, 4)) {
      if (!Array.isArray(e) || e.length !== 8 || !e.slice(0, 7).every(Number.isFinite)) continue;
      const [slot, gen, at, x, y, vx, vy, by] = e;
      if (!Number.isInteger(slot) || slot < 0 || slot >= ROCKS || gen !== rockGeneration(slot, now) ||
          at > now + 1000 || at < now - ROCK_PERIOD * 1000 || x < 40 || x > W - 40 || y < 40 || y > H - 40 ||
          Math.abs(vx) > 4500 || Math.abs(vy) > 4500 || typeof by !== "string" || !/^[a-z0-9]{1,8}$/.test(by)) continue;
      const old = rockMotion.get(slot);
      if (old && old.gen === gen && (old.at > at || (old.at === at && old.by >= by))) continue;
      rockMotion.set(slot, { slot, gen, at, x, y, vx, vy, by });
    }
  }

  // ---------- hearts ----------
  const heartsEl = document.getElementById("hearts");
  const hpFill = document.getElementById("hpFill"), hpNum = document.getElementById("hpNum");
  const hpPct = b => Math.max(0, Math.ceil(b.lives / maxLivesOf(b.lv || 1) * 100));
  function renderHearts(hit) {
    const pct = me.dead ? 0 : hpPct(me);
    hpFill.style.width = Math.min(100, pct) + "%"; hpNum.textContent = pct + " HP";
    heartsEl.classList.toggle("mid", pct <= 60 && pct > 30);
    heartsEl.classList.toggle("low", pct <= 30);
    heartsEl.setAttribute("aria-label", "Health " + pct + "%");
    if (hit) { heartsEl.classList.remove("hit"); void heartsEl.offsetWidth; heartsEl.classList.add("hit"); }
  }
  renderHearts(false);
  function renderLevel() { if (me.shield > 0) renderShield(); }
  renderLevel();


  // Separate UT armor layers; shield is the total replicated to other screens.
  function syncArmor(p) { p.shield = Math.round(((p.beltArmor || 0) + (p.bodyArmor || 0) + (p.padsArmor || 0)) * 1000) / 1000; }
  function clearArmor(p) { p.beltArmor = p.bodyArmor = p.padsArmor = p.shield = 0; }
  function applySupply(p, type) {
    const sp = SUPPLIES[type];
    if (!sp || p.dead) return false;
    if (sp.heal) {
      if (p.lives >= sp.cap) return false;
      p.lives = Math.min(sp.cap, Math.round((p.lives + sp.heal) * 1000) / 1000);
      return true;
    }
    const old = p[sp.layer] || 0;
    const other = (p.beltArmor || 0) + (p.bodyArmor || 0) + (p.padsArmor || 0) - old;
    const next = type === "mega" ? sp.armor : Math.max(old, Math.min(sp.armor, MAX_SHIELD - other));
    if (next <= old) return false;
    if (type === "mega") clearArmor(p);
    p[sp.layer] = next; syncArmor(p); return true;
  }
  function absorbArmor(p, damage) {
    if (!(p.shield > 0)) return 0;
    let left = damage;
    // Older/debug states with only a total are treated as body armor.
    if (!(p.beltArmor || p.bodyArmor || p.padsArmor)) p.bodyArmor = p.shield;
    for (const [key, fraction] of [["beltArmor", 1], ["bodyArmor", .75], ["padsArmor", .5]]) {
      const absorbed = Math.min(p[key] || 0, left * fraction);
      p[key] = Math.max(0, (p[key] || 0) - absorbed); left -= absorbed;
    }
    syncArmor(p); return damage - left;
  }
