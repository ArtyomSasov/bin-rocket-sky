  // Local, bounded measurements. Never sent to an analytics service. Damage can
  // only be validated for this client and its bots; peer confirmations are separate.
  const weaponMetrics = new Map(), metricShots = new Map(), metricConfirmations = new Set();
  const metricRow = (weapon, pilot, alt = false) => {
    const info = { round: stats.round, map: mapThemeOf(worldCode), size: mapKey, mode: MODE,
      actor: pilot === me ? "player" : "bot", level: pilot.lv || 1, weapon, fireMode: alt ? "alt" : "primary" };
    const key = JSON.stringify(info);
    if (!weaponMetrics.has(key)) {
      if (weaponMetrics.size >= 512) weaponMetrics.delete(weaponMetrics.keys().next().value);
      weaponMetrics.set(key, { ...info, volleys: 0, shotRecords: 0, ammoCost: 0, heldSeconds: 0,
        damageEvents: 0, damageValidated: 0, killsValidated: 0, peerHits: 0, peerKills: 0 });
    }
    return weaponMetrics.get(key);
  };
  function metricShot(s, pilot, pattern) {
    const weapon = pilot === me ? me.weapon : botWeapon(pilot);
    const alt = pattern !== WEAPONS[weapon] && pattern !== FIRE_TWIN;
    const row = metricRow(weapon, pilot, alt);
    row.shotRecords++;
    if (!metricShots.has(s.id)) metricShots.set(s.id, row);
    if (metricShots.size > 4096) metricShots.delete(metricShots.keys().next().value);
  }
  function metricVolley(pilot, pattern) {
    const weapon = pilot === me ? me.weapon : botWeapon(pilot), alt = pattern !== WEAPONS[weapon] && pattern !== FIRE_TWIN;
    const row = metricRow(weapon, pilot, alt); row.volleys++; row.ammoCost += alt ? pattern.cost || 0 : weapon === "fire" || weapon === "gauntlet" ? 0 : 1;
  }
  function metricForShot(id) {
    if (typeof id !== "string") return null;
    // Children have p/s/n/c + index appended to the base36 shot sequence.
    // Exact IDs win; map child IDs explicitly when expanding a volley.
    return metricShots.get(id) || null;
  }
  function metricChild(parent, child) { const row = metricForShot(parent); if (row) { metricShots.set(child, row); if (metricShots.size > 4096) metricShots.delete(metricShots.keys().next().value); } }
  function metricDamage(id, amount, killed) {
    const row = metricForShot(id); if (!row) return;
    row.damageEvents++; row.damageValidated += Math.max(0, amount); if (killed) row.killsValidated++;
  }
  function metricPeer(id, victim, killed) {
    const row = metricForShot(id), key = id + ":" + victim + ":" + killed;
    if (!row || metricConfirmations.has(key)) return;
    if (metricConfirmations.size >= 8192) metricConfirmations.delete(metricConfirmations.values().next().value);
    metricConfirmations.add(key); row[killed ? "peerKills" : "peerHits"]++;
  }
  function metricTick(dt) {
    if (!playing || !roundLive) return;
    if (!me.dead) metricRow(me.weapon, me).heldSeconds += dt;
    for (const bot of bots) if (!bot.dead) metricRow(botWeapon(bot), bot).heldSeconds += dt;
  }
  function metricsReport() {
    return { schema: 1, created: new Date().toISOString(), scope: "This browser's player and hosted bots; no remote damage estimates",
      limitations: "Bots do not reproduce most player alt-fire, shields or minigun spin-up. Damage is HP plus absorbed shield, capped at remaining health. Peer hits/kills are separate confirmations; do not add them to validated events.",
      rows: [...weaponMetrics.values()].map(r => ({ ...r, damageValidated: +r.damageValidated.toFixed(3), heldSeconds: +r.heldSeconds.toFixed(2) })) };
  }
  document.getElementById("exportWeapons").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(metricsReport(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "bin-rocket-weapon-metrics.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
