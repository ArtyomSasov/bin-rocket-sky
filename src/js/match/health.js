  // ---------- hearts ----------
  const heartsEl = document.getElementById("hearts");
  const hpFill = document.getElementById("hpFill"), hpNum = document.getElementById("hpNum");
  const hpPct = b => Math.max(0, Math.ceil(b.lives / LIVES * 100));
  function renderHearts(hit) {
    const pct = me.dead ? 0 : hpPct(me);
    hpFill.style.width = Math.min(100, pct) + "%"; hpNum.textContent = pct + " HP";
    heartsEl.classList.toggle("mid", pct <= 60 && pct > 30);
    heartsEl.classList.toggle("low", pct <= 30);
    heartsEl.setAttribute("aria-label", "Health " + pct + "%");
    if (hit) { heartsEl.classList.remove("hit"); void heartsEl.offsetWidth; heartsEl.classList.add("hit"); }
  }
  renderHearts(false);


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
