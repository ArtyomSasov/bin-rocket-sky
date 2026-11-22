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
      impacts.push({ x: me.x, y: me.y, t: 0, r: 90, col: "#6fc2ff" });
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
      me.dead = true; me.respawnAt = now + RESPAWN_MS; me.vx = me.vy = 0;
      const trophy = me.weapon !== "fire" ? me.weapon : owned().find(k => k !== "fire");
      if (trophy && !MODES[MODE].only) dropGun(me.x, me.y, trophy, me.arsenal[trophy]);
      baseArsenal(); me.ampUntil = 0; me.fc = -1; renderWeapon();   // its guns are lost with it (and a carried flag goes home)
      renderShield();
      packPlay("p_death", 0.7);
    } else explode(me.x, me.y, 18, 180);
    return true;
  }
  // a trophy: the gun drops where its pilot died (mine, or one of my bots')
  function dropGun(x, y, type, ammo) {
    if (!(ammo > 0) || !Number.isFinite(ammo)) return;
    const id = myTag + "g" + (gunDropSeq++).toString(36), d = [id, Math.round(x), Math.round(y), WEAPON_KEYS.indexOf(type), Math.min(999, Math.ceil(ammo)), Date.now()];
    pushCapped(myGunDrops, d, 6);
    gunDrops.set(id, { x: d[1], y: d[2], type, ammo: d[4], born: performance.now() });
  }
  function respawn(now) {
    forgetKiller(now);
    audioCue("respawn");
    me.dead = false; me.lives = LIVES; me.inv = now + 2000; clearArmor(me); renderShield();
    Object.assign(me, safeSpawn(me)); me.vx = 0; me.vy = -60;
    renderHearts(false);
  }

