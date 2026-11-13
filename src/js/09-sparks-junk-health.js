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

  // ---------- space junk (shared via the same clock) ----------
  function rock(i, now) {
    const tt = now / 1000 + hash(i, 9, 9) * ROCK_PERIOD;
    const gen = Math.floor(tt / ROCK_PERIOD), age = tt - gen * ROCK_PERIOD;
    const ang = hash(i, gen, 21) * 6.283, sp = 50 + hash(i, gen, 22) * 90;
    return {
      key: "m" + i + ":" + gen,
      x: bounceIn(hash(i, gen, 23) * W + Math.cos(ang) * sp * age, 40, W - 40),
      y: bounceIn(hash(i, gen, 24) * H + Math.sin(ang) * sp * age, 40, H - 40),
      r: 22 + hash(i, gen, 25) * 18, seed: i * 977 + gen,
      spin: age * (hash(i, gen, 26) - 0.5) * 2, age
    };
  }

  // ---------- hearts ----------
  const heartsEl = document.getElementById("hearts");
  const hpFill = document.getElementById("hpFill"), hpNum = document.getElementById("hpNum");
  const hpPct = b => Math.max(0, Math.ceil(b.lives / maxLivesOf(b.lv || 1) * 100));
  function renderHearts(hit) {
    const pct = me.dead ? 0 : hpPct(me);
    hpFill.style.width = pct + "%"; hpNum.textContent = pct + "%";
    heartsEl.classList.toggle("mid", pct <= 60 && pct > 30);
    heartsEl.classList.toggle("low", pct <= 30);
    heartsEl.setAttribute("aria-label", "Health " + pct + "%");
    if (hit) { heartsEl.classList.remove("hit"); void heartsEl.offsetWidth; heartsEl.classList.add("hit"); }
  }
  renderHearts(false);
  function renderLevel() {
    if (me.shield > 0) renderShield();   // armour shows as a share of max health, which grows with level
    const lo = XP_STEPS[me.lv - 1], hi = XP_STEPS[me.lv];
    document.getElementById("lvNum").textContent = me.lv >= MAX_LV ? "Lv " + me.lv + " MAX" : "Lv " + me.lv;
    document.getElementById("xpFill").style.width = (me.lv >= MAX_LV ? 100 : Math.round((me.xp - lo) / (hi - lo) * 100)) + "%";
  }
  renderLevel();

