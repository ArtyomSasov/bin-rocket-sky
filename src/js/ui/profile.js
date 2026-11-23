  // ---------- the profile: what this browser's pilot has done, over every game ----------
  // Kept in this browser (nothing is sent anywhere). A round played adds its kills, deaths and best streak, and a win
  // when the pilot (or its team) came first. A few looks are earned with it (UNLOCKS); the rest are free from the start
  const profile = (() => { try { const p = JSON.parse(store.get("binrocket.profile")); if (p && typeof p === "object") return p; } catch {} return {}; })();
  for (const k of ["rounds", "wins", "kills", "deaths", "best"]) if (!Number.isSafeInteger(profile[k]) || profile[k] < 0) profile[k] = 0;
  // key -> value -> [what counts, how many]
  const UNLOCKS = { flame: { gold: ["kills", 25] }, sticker: { trophy: ["wins", 5] }, hat: { crown: ["kills", 100] } };
  const lockedBy = (key, val) => { const u = UNLOCKS[key] && UNLOCKS[key][val]; return u && profile[u[0]] < u[1] ? u : null; };
  // a look with nothing locked in it (a locked choice goes back to the original)
  const freeLook = ck => CUSTOM_KEYS.map((key, i) => lockedBy(key, CUSTOM[key].items[ck[i]]?.[1]) ? 0 : ck[i] || 0);
  function recordRound(won) {
    profile.rounds++; profile.kills += stats.kills; profile.deaths += stats.deaths; profile.best = Math.max(profile.best, stats.best);
    if (won) profile.wins++;
    store.set("binrocket.profile", JSON.stringify(profile));
    showProfile();
  }
  function showProfile() {
    const el = document.getElementById("profileLine");
    if (el) el.textContent = profile.rounds ? `${profile.rounds} rounds · ${profile.wins} won · ${profile.kills} kills · best streak ${profile.best}` : "";
    markLocks();
  }
