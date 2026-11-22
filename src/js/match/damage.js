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
      sfx("shield_hit", 0.8);
      if (dmg <= 0) { me.hazardAt = now + 600; shake = Math.max(shake, 0.15); return true; }
    }
    me.lives = Math.max(0, Math.round((me.lives - dmg) * 1000) / 1000);
    me.hitAt = now;
    hurtFlash = Math.min(1, hurtFlash + 0.35 + dmg * 0.4);
    me.hazardAt = now + 600; shake = Math.max(shake, 0.12 + Math.min(0.3, dmg * 0.2));
    renderHearts(true);
    sfx("hit", 1, 0.85);
    if (me.lives <= 0) {
      stats.deaths++; stats.streak = 0;
      me.ds = deathPiecesOf(kind);   // pieces the bin breaks into: 1 = intact dead hulk, 2-4 = shattered (always pieces for a blast)
      me.dk = deathStyleOf(kind); me.da = ang;
      deathFx(me, me.ds, me.dk, me.da);
      me.dead = true; me.respawnAt = now + 3000; me.vx = me.vy = 0;
      spillStars(now);
      const trophy = me.weapon !== "fire" ? me.weapon : owned().find(k => k !== "fire");
      if (trophy && !MODES[MODE].only) dropGun(me.x, me.y, trophy, me.arsenal[trophy]);
      me.lv = levelAfterDeath(me.lv); me.xp = XP_STEPS[me.lv - 1];   // no progression penalty
      baseArsenal(); me.ampUntil = 0; me.fc = -1; renderWeapon();   // its guns are lost with it (and a carried flag goes home)
      renderLevel();
      packPlay("p_death", 0.7);
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

