  // ---------- kill feed & announcer ----------
  const feedEl = document.getElementById("feed"), annEl = document.getElementById("announce");
  const feed = [];
  const killNotices = [];
  const killNoticeEl = document.createElement("div");
  killNoticeEl.id = "killNotice"; killNoticeEl.setAttribute("role", "status");
  killNoticeEl.setAttribute("aria-live", "polite"); document.body.appendChild(killNoticeEl);
  function showKillNotice(name) {
    killNotices.push({ name: String(name).slice(0, 40), at: performance.now(), round: stats.round });
    if (killNotices.length > 6) killNotices.shift();
    renderKillNotices();
  }
  function renderKillNotices() {
    const now = performance.now();
    while (killNotices.length && (now - killNotices[0].at > 4500 || killNotices[0].round !== stats.round)) killNotices.shift();
    killNoticeEl.replaceChildren(...killNotices.map(n => {
      const line = document.createElement("div"); line.textContent = "YOU KILLED · " + n.name; return line;
    }));
  }
  function feedPush(html, isMe) { feed.push({ html, at: performance.now(), me: !!isMe }); if (feed.length > 6) feed.shift(); renderFeed(); }
  function renderFeed() {
    renderKillNotices();
    const now = performance.now();
    while (feed.length && now - feed[0].at > 7000) feed.shift();
    feedEl.style.top = "calc(var(--hud-bottom, 150px) + 8px)";
    feedEl.innerHTML = feed.map(e => `<div class="fe${e.me ? " me" : ""}${e.spree ? " spree" : ""}">${e.html}</div>`).join("");
  }
  const tagOwner = tag => {
    if (tag === myTag) return { name: me.name || "You", weapon: me.weapon, me: true };
    for (const b of bots) if (b.tag === tag) return { name: b.name, weapon: botWeapon(b) };
    for (const r of remotes.values()) if (r.tag === tag) return { name: r.name, weapon: r.weapon || "fire" };
    return null;
  };
  const RAM_ICON = "M2 11h11l-3-4 2-1 6 6-6 6-2-1 3-4H2zM19 5h3v14h-3z";
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
    const k = tagOwner(shotId.split(".")[0]), killer = k ? k.name : "Someone", ram = shotId.includes(".ram");
    if (k?.me && victimId !== "me") showKillNotice(victim);
    const icon = ram ? RAM_ICON : ICONS[k ? k.weapon : "fire"];
    feedPush(`<span class="k">${esc(killer)}</span><svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="${icon}"/></svg><span class="v">${esc(victim)}</span>`, k && k.me || victim === (me.name || "You"));
    if (!firstBlood) { firstBlood = true; announce("FIRST BLOOD", killer + " drew first blood", "#ff5a6e"); }
    const n = (streaks.get(killer) || 0) + 1;
    streaks.set(killer, n); streaks.set(victim, 0);
    const sp = spreeOf(n);
    if (sp && !(k && k.me)) { feed.push({ html: `${esc(killer)} ${sp[1]}!`, at: performance.now(), spree: true }); renderFeed(); }
  }
  function meKilled(id) { pushCapped(koBy, id, 12); reportKill(id, me.name || "You", "me"); }
  // my own multi-kills and sprees get the big centre announcement
  let multi = 0, lastKillAt = -1e9;
  function myKillAnnounce(now) {
    multi = now - lastKillAt < 4000 ? multi + 1 : 1;
    lastKillAt = now;
    if (!packPlay("p_kill", 0.55)) [784, 988, 1175].forEach((f, i) => setTimeout(() => blip(f, 0.16, "triangle"), i * 70));
    const m = multi >= 2 ? MULTI[Math.min(multi, MULTI.length - 1)] : "", sp = spreeOf(stats.streak);
    if (m) announce(m, multi + " kills", "#ffd36b", multi);
    if (sp) setTimeout(() => announce(sp[0], stats.streak + " kills without dying", "#c38bff", Math.min(6, stats.streak - 1)), m ? 1500 : 0);
  }
  // Fallback announcer sting when the recorded cue is unavailable: a sub-bass hit, a brass-like chord swelling in a big hall, higher for bigger streaks
  function sting(level) {
    if (packPlay("p_sting", 0.65) || !audio) return;
    const t = audio.currentTime;
    const hall = getHall();
    boomSound(1.4, 260, 0.5);
    const sub = audio.createOscillator(), sv = audio.createGain();
    sub.type = "sine"; sub.frequency.setValueAtTime(90, t); sub.frequency.exponentialRampToValueAtTime(38, t + 0.9);
    sv.gain.setValueAtTime(0.45, t); sv.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    sub.connect(sv).connect(audio.destination); sub.start(t); sub.stop(t + 1.2);
    const root = 98 * Math.pow(2, Math.min(level, 6) * 2 / 12);   // each streak step lifts the chord a whole tone
    for (const [ratio, delay] of [[1, 0], [1.5, 0.05], [2, 0.1], [2.52, 0.15]]) {
      for (const det of [-6, 6]) {
        const o = audio.createOscillator(), f = audio.createBiquadFilter(), v = audio.createGain(), s0 = t + delay;
        o.type = "sawtooth"; o.frequency.value = root * ratio; o.detune.value = det;
        f.type = "lowpass"; f.frequency.setValueAtTime(400, s0); f.frequency.linearRampToValueAtTime(2400, s0 + 0.35); f.frequency.exponentialRampToValueAtTime(500, s0 + 1.8);
        v.gain.setValueAtTime(0.0001, s0); v.gain.exponentialRampToValueAtTime(0.035, s0 + 0.12); v.gain.exponentialRampToValueAtTime(0.0001, s0 + 1.9);
        o.connect(f).connect(v); v.connect(audio.destination); v.connect(hall);
        o.start(s0); o.stop(s0 + 2);
      }
    }
  }
  function announce(text, sub, col, level = 1, silent = false) {
    annEl.innerHTML = `<b>${esc(text)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}`;
    annEl.style.setProperty("--ac", col);
    annEl.classList.remove("show"); void annEl.offsetWidth; annEl.classList.add("show");
    // a sound pack's announcer line comes first: by the words of the line ("DOUBLE KILL" -> a_doublekill), the flag
    // lines and Overdrive by meaning; otherwise a recorded cue with the on-screen title.
    const key = /has the .* flag$|^YOU HAVE THE FLAG$/i.test(text) ? "a_flagtaken" : / team scores!$/i.test(text) ? "a_flagcap"
      : text === "BEYOND GODLIKE" ? "a_holyshit" : "a_" + text.toLowerCase().replace(/[^a-z]/g, "");
    if (!silent && !packHas(key)) sting(level);   // a cue only where the pack has no voice for the line
    const voice = { "ULTRA KILL": "v_multikill", "MULTI KILL": "v_multikill", "RAMPAGE": "v_multikill", "QUAD DAMAGE": "v_powerup" }[text];
    if (!silent || packHas(key)) { if (!packPlay(key, 1) && voice) sfx(voice, 1); }
  }

