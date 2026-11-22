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
    // out of ammo: fall back to another gun you carry (NO_AUTO_PICK aside), else the pistol
    me.weapon = WEAPON_KEYS.find(w => !NO_AUTO_PICK.includes(w) && me.arsenal[w]) || "fire";
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
    sfx("dash", 0.8);
  }
  // who killed me: their name for the words on the screen, their id for the camera, which goes over to them while I
  // wait to come back (the kill seen from their side: where they are, how hurt they are)
  let killer = "", killerId = null;
  function killedBy(owner) {
    const r = remotes.get(owner);
    if (r) { killer = r.name; killerId = owner; }
  }
  const forgetKiller = now => { killer = ""; killerId = null; camBackUntil = now + 600; };   // (and the camera eases back to me)
  const arsenalEl = document.getElementById("arsenal");
  const owned = () => WEAPON_SLOTS.filter(hasWeapon);
  const ammoFill = k => Number.isFinite(me.arsenal[k]) ? Math.min(1, (me.arsenal[k] || 0) / WEAPONS[k].ammo) : 1;
  const chipText = () => { const n = me.arsenal[me.weapon] || 0, alt = WEAPONS[me.weapon].alt, count = controlledShots(me.weapon).length;
    const armed = me.weapon === "mine" ? controlledShots("mine").filter(s => SHOTS[K.MINE].life - s.life >= MINE_ARM).length : 0;
    return WEAPONS[me.weapon].name + (Number.isFinite(n) ? " · " + n : "") + (count ? " · ACTIVE " + count : "") + (me.weapon === "mine" && count ? " · ARMED " + armed : "")
      + (Number.isFinite(n) && n <= Math.max(1, Math.ceil(WEAPONS[me.weapon].ammo * 0.15)) ? " · LOW AMMO" : "")
      + (alt ? " · " + (COARSE ? "ALT: " : "RMB: ") + alt.name + (alt.cost || alt.load ? " [" + (alt.load ? "1–3" : alt.cost) + " ammo]" : "") : "")
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
    if (alt) document.getElementById("altName").textContent = (COMPACT.matches || !(alt.cost || alt.load) ? alt.name : alt.name + " · " + (alt.load ? "1–3" : alt.cost) + " AMMO").toUpperCase();   // a phone: just the name
  }
  function selectWeapon(k) {
    if (!hasWeapon(k) || k === me.weapon) return;
    if (altCharge > 0) { altCharge = 0; audioCue("chargeCancel"); }
    cancelRocketLoad(); stopContinuous("me");
    me.weapon = k; fireCd = Math.max(fireCd, 0.15);
    packPlay("p_change", 0.6);
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
