  // Recorded feedback. A short cooldown makes a cluster of pickups or impacts one readable cue.
  const CUES = {
    boost: ["p_warp", 0.65, 1, 650], brake: ["p_boost", 0.16, 1.5, 700],
    teleport: ["p_teleport", 0.75, 0.85, 250], respawn: ["p_teleport", 0.45, 1.2, 800],
    ready: ["p_ready", 0.4, 0.9, 800], warning: ["p_warning", 0.5, 0.8, 1800],
    shieldBreak: ["shield_hit", 0.95, 0.55, 600], shieldReady: ["shield_get", 0.45, 0.8, 1500],
    powerDown: ["p_powerdown", 0.5, 0.8, 800], flagReturn: ["p_ready", 0.7, 0.7, 800],
    event: ["p_event", 0.55, 0.75, 2000], ui: ["p_ui", 0.18, 1.1, 120],
    refuse: ["p_noammo", 0.65, 1, 700], lowAmmo: ["p_warning", 0.35, 1.4, 1000],
    chargeFull: ["p_ready", 0.65, 1.4, 500],
    chargeCancel: ["p_powerdown", 0.35, 1.2, 200],
    shockCombo: ["p_ut_shock_combo", 1, 1, 120], shockBeam: ["p_ut_shock_alt", 0.9, 1, 100],
    laserPulse: ["p_boom_orb", 0.75, 1.4, 150], demonicZap: ["p_hit_laser", 0.4, 0.6, 100],
    pickup: ["p_pickup", 0.4, 1, 80]
  };
  const cueTimes = new Map();
  function audioCue(name, x, y) {
    const cue = CUES[name]; if (!cue || !audio || document.hidden) return false;
    const now = performance.now();
    if (now - (cueTimes.get(name) ?? -Infinity) < cue[3]) return true;
    const ok = sfx(cue[0], cue[1], cue[2], x, y);
    if (ok) cueTimes.set(name, now);
    return ok;
  }

  // The announcer, as UT plays it: a kill call (first blood, double kill, a spree: the a_* lines) is said the moment
  // it happens, never kept waiting behind another (UT99's ClientPlaySound starts it on a free slot at once); a newer
  // kill call cuts the one still speaking with a quick fade (as UT2004 does), so they never talk over each other.
  // Round calls (prepare, fight, win, lose) and flag calls keep their turn: a kill call does not cut them, it waits.
  // No random pitch, and no combat voice cap.
  const voiceQueue = [];
  let voiceActive = null, voiceTimer = null;
  const voicePriority = name => /^(v_win|v_lose|v_flawless|v_fight|v_prepare)$/.test(name) ? 3 : /flag/.test(name) ? 2 : 1;
  const killCall = name => /^a_/.test(name) && voicePriority(name) === 1;   // (flag calls keep their turn)
  function queueVoice(name, volume = 1) {
    if (!audio || document.hidden) return false;
    if (voiceActive?.name === name || voiceQueue.some(v => v.name === name)) return true;
    const priority = voicePriority(name);
    if (priority === 3) voiceQueue.length = 0;
    const item = { name, volume, priority, expires: performance.now() + (name === "v_fight" ? 30000 : 6000) };
    if (killCall(name) && (!voiceActive || voiceActive.priority < 2)) {   // now: cut whatever kill call is speaking
      for (let i = voiceQueue.length - 1; i >= 0; i--) if (killCall(voiceQueue[i].name)) voiceQueue.splice(i, 1);
      if (voiceActive) cutVoice();
      voiceQueue.unshift(item);
      pumpVoice(); return true;
    }
    voiceQueue.push(item);
    voiceQueue.sort((a, b) => b.priority - a.priority);
    if (voiceQueue.length > 4) voiceQueue.length = 4;
    pumpVoice(); return true;
  }
  // the voice speaking now stops with a 40 ms fade (no click), and the next one may start at once
  function cutVoice() {
    const v = voiceActive; voiceActive = null;
    if (!v) return;
    v.src.onended = null;
    try { v.gain.gain.setTargetAtTime(0, audio.currentTime, 0.012); v.src.stop(audio.currentTime + 0.05); } catch {}
  }
  function pumpVoice() {
    if (voiceTimer) { clearTimeout(voiceTimer); voiceTimer = null; }
    if (voiceActive || !audio || !voiceBus || document.hidden) return;
    while (voiceQueue.length && voiceQueue[0].expires < performance.now()) voiceQueue.shift();
    if (!voiceQueue.length) return;
    const item = voiceQueue[0], buffer = packKnows(item.name) ? packBuf[item.name]?.[0] : sfxBuf[item.name];
    if (!buffer) { voiceTimer = setTimeout(pumpVoice, 100); return; }
    voiceQueue.shift();
    const src = audio.createBufferSource(), gain = audio.createGain(); src.buffer = buffer;
    src.playbackRate.value = 1; gain.gain.value = item.volume;
    src.connect(gain).connect(voiceBus);
    const v = voiceActive = { name: item.name, src, gain, priority: item.priority };
    mixBus.gain.setTargetAtTime(0.55, audio.currentTime, 0.04);
    src.onended = () => {
      if (voiceActive !== v) return;
      voiceActive = null;
      mixBus.gain.setTargetAtTime(1, audio.currentTime, 0.18);
      voiceTimer = setTimeout(pumpVoice, 100);
    };
    src.start();
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    voiceQueue.length = 0;
    if (voiceTimer) clearTimeout(voiceTimer);
    voiceTimer = null;
    if (voiceActive) voiceActive.src.stop();
  });

  let eventAudioKey = "", lastShield = 0, lowHealthWarned = false, lastPower = false, lastBraking = false;
  function audioTick(now) {
    const active = playing && !me.dead && roundLive && !document.hidden;
    if (!active) { packLoop("atmosphere", null); for (const slot of Object.keys(packLoops)) if (slot.startsWith("flight:")) packLoop(slot, null); return; }
    const ev = stationMap() ? { cyc: 0, active: false, warn: false } : eventAt(clockNow()), key = ev.cyc + ":" + (ev.warn ? "warn" : ev.active ? "active" : "quiet");
    if (key !== eventAudioKey) { if (ev.warn) audioCue("warning"); else if (ev.active) audioCue("event"); eventAudioKey = key; }
    packLoop("atmosphere", ev.active && ev.type === "blackhole" ? "p_blackhole" : "p_ambient", ev.active && ev.type === "blackhole" ? 0.12 : 0.025);
    const nearby = shots.filter(s => s.life > 0 && !s.boom && [K.NUKE,K.ROCKET,K.HROCKET].includes(s.kind))
      .map(s => ({ s, d: Math.hypot(s.x-me.x,s.y-me.y) })).filter(o => o.d < 1200).sort((a,b)=>a.d-b.d).slice(0,6);
    const wanted = new Set();
    for (const {s,d} of nearby) {
      const slot = "flight:" + s.id; wanted.add(slot);
      packLoop(slot, s.kind === K.NUKE ? "p_ut_nuke_fly" : "p_fly_rocket", 0);
      const loop = packLoops[slot];
      if (loop) { loop.g.gain.setTargetAtTime((s.kind === K.NUKE ? .22 : .12) * (1-d/1200), audio.currentTime, .04); if(loop.pan)loop.pan.pan.value=clamp((s.x-me.x)/1000,-.85,.85); }
    }
    for (const slot of Object.keys(packLoops)) if (slot.startsWith("flight:") && !wanted.has(slot)) packLoop(slot,null);
    if (lastShield > 0 && me.shield === 0) audioCue("shieldBreak");
    if (lastShield < 0.6 && me.shield >= 0.6) audioCue("shieldReady");
    lastShield = me.shield;
    const low = me.lives <= maxLivesOf(me.lv) * 0.25;
    if (low && !lowHealthWarned) audioCue("warning");
    lowHealthWarned = low;
    const power = now < me.ampUntil;
    if (lastPower && !power) audioCue("powerDown");
    lastPower = power;
    const braking = keys.has("KeyX") && Math.hypot(me.vx, me.vy) > 120;
    if (braking && !lastBraking) audioCue("brake");
    lastBraking = braking;
  }
