  // ---------- kill feed & announcer ----------
  const feedEl = document.getElementById("feed"), annEl = document.getElementById("announce");
  const feed = [];
  function feedPush(html, isMe) { feed.push({ html, at: performance.now(), me: !!isMe }); if (feed.length > 6) feed.shift(); renderFeed(); }
  function renderFeed() {
    const now = performance.now();
    while (feed.length && now - feed[0].at > 7000) feed.shift();
    feedEl.style.top = (document.querySelector(".board").getBoundingClientRect().bottom + 8) + "px";
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
  const SPREE_LADDER = { 3: ["KILLING SPREE", "is on a killing spree"], 4: ["DOMINATING", "is dominating"], 5: ["MEGA KILL", "has a mega kill"],
    6: ["UNSTOPPABLE", "is unstoppable"], 7: ["WICKED SICK", "is wicked sick"], 8: ["MONSTER KILL", "has a monster kill"], 9: ["GODLIKE", "is godlike"] };
  const spreeOf = n => SPREE_LADDER[n] || (n >= 10 && n % 2 === 0 ? ["BEYOND GODLIKE", "is beyond godlike. Somebody kill them!"] : null);
  const MULTI = ["", "", "DOUBLE KILL", "TRIPLE KILL", "ULTRA KILL", "RAMPAGE"];
  // someone (anyone) killed someone: one line in the feed, first blood, other pilots' sprees
  function reportKill(shotId, victim) {
    if (killSeen.has(shotId) || !roundLive) return;
    killSeen.add(shotId);
    const k = tagOwner(shotId.split(".")[0]), killer = k ? k.name : "Someone", ram = shotId.includes(".ram");
    const icon = ram ? RAM_ICON : ICONS[k ? k.weapon : "fire"];
    feedPush(`<span class="k">${esc(killer)}</span><svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="${icon}"/></svg><span class="v">${esc(victim)}</span>`, k && k.me || victim === (me.name || "You"));
    if (!firstBlood) { firstBlood = true; announce("FIRST BLOOD", killer + " drew first blood", "#ff5a6e"); }
    const n = (streaks.get(killer) || 0) + 1;
    streaks.set(killer, n); streaks.set(victim, 0);
    const sp = spreeOf(n);
    if (sp && !(k && k.me)) { feed.push({ html: `${esc(killer)} ${sp[1]}!`, at: performance.now(), spree: true }); renderFeed(); }
  }
  function meKilled(id) { pushCapped(koBy, id, 12); reportKill(id, me.name || "You"); }
  // my own multi-kills and sprees get the big centre announcement
  let multi = 0, lastKillAt = -1e9;
  function myKillAnnounce(now) {
    multi = now - lastKillAt < 4000 ? multi + 1 : 1;
    lastKillAt = now;
    [784, 988, 1175].forEach((f, i) => setTimeout(() => blip(f, 0.16, "triangle"), i * 70));
    const m = multi >= 2 ? MULTI[Math.min(multi, MULTI.length - 1)] : "", sp = spreeOf(stats.streak);
    if (m) announce(m, multi + " kills", "#ffd36b", multi);
    if (sp) setTimeout(() => announce(sp[0], stats.streak + " kills without dying", "#c38bff", Math.min(6, stats.streak - 1)), m ? 1500 : 0);
  }
  let voice = null;
  function speak(text) {
    if (!audio || !window.speechSynthesis) return;
    if (!voice) voice = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)).sort((a, b) => (/male|daniel|alex|fred|uk/i.test(b.name) ? 1 : 0) - (/male|daniel|alex|fred|uk/i.test(a.name) ? 1 : 0))[0] || null;
    const u = new SpeechSynthesisUtterance(text.toLowerCase());
    if (voice) u.voice = voice;
    u.lang = "en-US"; u.rate = 0.78; u.pitch = 0.3; u.volume = 1;   // slow and deep, like an arena announcer
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
  // announcer sting (all synthesized): a sub-bass hit, a brass-like chord swelling in a big hall, higher for bigger streaks
  function sting(level) {
    if (!audio) return;
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
    sting(level);
    const voice = { "ULTRA KILL": "v_multikill", "RAMPAGE": "v_multikill", "OVERDRIVE": "v_powerup" }[text];
    if (!silent) setTimeout(() => { if (!(voice && sfx(voice, 1))) speak(text); }, 180);
  }

