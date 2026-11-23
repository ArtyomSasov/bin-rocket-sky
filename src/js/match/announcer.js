  // ---------- kill feed & announcer ----------
  const feedEl = document.getElementById("feed"), annEl = document.getElementById("announce");
  const killNotices = [];
  const killNoticeEl = document.createElement("div");
  killNoticeEl.id = "killNotice"; killNoticeEl.setAttribute("role", "status");
  killNoticeEl.setAttribute("aria-live", "polite"); document.body.appendChild(killNoticeEl);
  function showKillNotice(name) {
    // one line in the middle, the latest (as UT says "You killed ..."); the feed on the right keeps the rest
    killNotices.length = 0;
    killNotices.push({ name: String(name).slice(0, 40), at: performance.now(), round: stats.round });
    renderKillNotices();
  }
  function renderKillNotices() {
    const now = performance.now();
    while (killNotices.length && (now - killNotices[0].at > 2500 || killNotices[0].round !== stats.round)) killNotices.shift();
    killNoticeEl.replaceChildren(...killNotices.map(n => {
      const line = document.createElement("div"); line.textContent = "YOU KILLED · " + n.name; return line;
    }));
  }
  // the kill feed, top right: who killed whom and with what. A line stays 5 s, then fades out over 3 s (CSS); each
  // line is its own element, so a new one never restarts the others' fade. A phone keeps fewer lines
  const FEED_MAX = COARSE ? 3 : 6, FEED_LIFE = 8200;
  function feedPush(html, isMe, spree) {
    const el = document.createElement("div");
    el.className = "fe" + (isMe ? " me" : "") + (spree ? " spree" : "");
    el.innerHTML = html;   // (names in it are escaped by the callers)
    feedEl.appendChild(el);
    while (feedEl.children.length > FEED_MAX) feedEl.firstElementChild.remove();
    setTimeout(() => el.remove(), FEED_LIFE);
  }
  function renderFeed() { renderKillNotices(); }
  const tagOwner = tag => {
    if (tag === myTag) return { name: me.name || "You", weapon: me.weapon, me: true };
    for (const b of bots) if (b.tag === tag) return { name: b.name, weapon: botWeapon(b) };
    for (const r of remotes.values()) if (r.tag === tag) return { name: r.name, weapon: r.weapon || "fire" };
    return null;
  };
  const RAM_ICON = "M2 11h11l-3-4 2-1 6 6-6 6-2-1 3-4H2zM19 5h3v14h-3z";
  // what each recent shot was (by its id), so a kill shows the gun it was fired from, not the one in hand now
  const shotKinds = new Map();
  function noteShotKind(id, kind) { if (typeof id !== "string" || !Number.isInteger(kind)) return; shotKinds.set(id, kind); if (shotKinds.size > 3000) shotKinds.delete(shotKinds.keys().next().value); }
  const KIND_WEAPON = (() => {   // the gun a kind of shot comes from (the first that fires it, main fire before alt)
    const m = new Map();
    for (const [w, v] of Object.entries(WEAPONS)) for (const p of [v, v.alt]) if (p && p.shot && !m.has(p.shot[0])) m.set(p.shot[0], w);
    for (const [kind, w] of [[K.SHARD, "shard"], [K.PELLET, "scatter"]]) if (WEAPONS[w] && !m.has(kind)) m.set(kind, w);
    return m;
  })();
  // a kill's shot: by its id, or a pellet's, shard's or nail's by the shot it split from (id + letter + index)
  const killWeapon = shotId => { const kind = shotKinds.get(shotId) ?? shotKinds.get(shotId.replace(/[pnsf]\d+$/, "")); return kind === undefined ? null : KIND_WEAPON.get(kind) || null; };
  const killSeen = new Set(), streaks = new Map();
  let firstBlood = false;
  // Dota-style ladder: kills in a row without dying, one step per kill, then "beyond godlike" every other kill
  const SPREE_LADDER = { 3: ["KILLING SPREE", "is on a killing spree"], 5: ["RAMPAGE", "is on a rampage"], 7: ["DOMINATING", "is dominating"],
    9: ["UNSTOPPABLE", "is unstoppable"], 11: ["GODLIKE", "is godlike"], 13: ["WICKED SICK", "is wicked sick"] };
  const spreeOf = n => SPREE_LADDER[n] || (n >= 15 && n % 2 === 1 ? ["BEYOND GODLIKE", "is beyond godlike. Somebody kill them!"] : null);
  // kills within 4 s of each other
  const MULTI = ["", "", "DOUBLE KILL", "TRIPLE KILL", "MULTI KILL", "ULTRA KILL", "MONSTER KILL", "LUDICROUS KILL", "HOLY SHIT"];
  // someone (anyone) killed someone: one line in the feed, first blood, other pilots' sprees
  function reportKill(shotId, victim, victimId = victim) {
    const key = victimId + ":" + shotId;
    if (killSeen.has(key) || killSeen.size >= MAX_CREDITS || !roundLive) return;
    killSeen.add(key);
    const k = tagOwner(shotId.split(".")[0]), killer = k ? k.name : shotId.startsWith("drum.") ? "A drum" : "Someone", ram = shotId.includes(".ram");
    if (k?.me && victimId !== "me") showKillNotice(victim);
    const icon = ram ? RAM_ICON : ICONS[killWeapon(shotId) || (k ? k.weapon : "fire")] || ICONS.fire;
    feedPush(`<span class="k">${esc(killer)}</span><svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="${icon}"/></svg><span class="v">${esc(victim)}</span>`, k && k.me || victim === (me.name || "You"));
    if (!firstBlood) { firstBlood = true; announce("FIRST BLOOD", killer + " drew first blood", "#ff5a6e"); }
    const n = (streaks.get(killer) || 0) + 1;
    streaks.set(killer, n); streaks.set(victim, 0);
    const sp = spreeOf(n);
    if (sp && !(k && k.me)) feedPush(`${esc(killer)} ${sp[1]}!`, false, true);
  }
  function meKilled(id) { pushCapped(koBy, id, 12); reportKill(id, me.name || "You", "me"); }
  // my own multi-kills and sprees get the big centre announcement
  let multi = 0, lastKillAt = -1e9;
  function myKillAnnounce(now) {
    multi = now - lastKillAt < 4000 ? multi + 1 : 1;
    lastKillAt = now;
    packPlay("p_kill", 0.55);
    const m = multi >= 2 ? MULTI[Math.min(multi, MULTI.length - 1)] : "", sp = spreeOf(stats.streak);
    if (m) announce(m, multi + " kills", "#ffd36b", multi);
    if (sp) setTimeout(() => announce(sp[0], stats.streak + " kills without dying", "#c38bff", Math.min(6, stats.streak - 1)), m ? 1500 : 0);
  }
  function announce(text, sub, col, level = 1, silent = false) {
    annEl.innerHTML = `<b>${esc(text)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}`;
    annEl.style.setProperty("--ac", col);
    annEl.classList.remove("show"); void annEl.offsetWidth; annEl.classList.add("show");
    // a sound pack's announcer line comes first: by the words of the line ("DOUBLE KILL" -> a_doublekill), the flag
    // lines and Overdrive by meaning; otherwise a recorded cue with the on-screen title.
    const key = /has the .* flag$|^YOU HAVE THE FLAG$/i.test(text) ? "a_flagtaken" : / team scores!$/i.test(text) ? "a_flagcap"
      : text === "BEYOND GODLIKE" ? "a_holyshit" : "a_" + text.toLowerCase().replace(/[^a-z]/g, "");
    if (!silent && !packKnows(key)) packPlay("p_sting", 0.65);   // a cue only where the pack has no voice for the line
    const voice = { "ULTRA KILL": "v_multikill", "MULTI KILL": "v_multikill", "RAMPAGE": "v_multikill", "QUAD DAMAGE": "v_powerup" }[text];
    if (!silent || packKnows(key)) { if (!packPlay(key, 1) && voice) sfx(voice, 1); }
  }

