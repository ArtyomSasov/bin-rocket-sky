  // Recorded feedback. A short cooldown makes a cluster of pickups or impacts one readable cue.
  const CUES = {
    boost: ["p_boost", 0.4, 0.85, 650], brake: ["p_boost", 0.16, 1.5, 700],
    teleport: ["p_teleport", 0.75, 0.85, 250], respawn: ["p_teleport", 0.45, 1.2, 800],
    ready: ["p_ready", 0.4, 0.9, 800], warning: ["p_warning", 0.5, 0.8, 1800],
    shieldBreak: ["shield_hit", 0.95, 0.55, 600], shieldReady: ["shield_get", 0.45, 0.8, 1500],
    powerDown: ["p_powerdown", 0.5, 0.8, 800], flagReturn: ["p_ready", 0.7, 0.7, 800],
    event: ["p_event", 0.55, 0.75, 2000], ui: ["p_ui", 0.18, 1.1, 120],
    sawCatch: ["p_change", 0.45, 1.1, 200], pickup: ["p_pickup", 0.4, 1, 80]
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

  // Keep the supplied announcer intact: no random pitch, no overlapping speech, no combat voice cap.
  const voiceQueue = [];
  let voiceActive = null, voiceTimer = null;
  function queueVoice(name, volume = 1) {
    if (!audio || document.hidden) return false;
    if (voiceActive?.name === name || voiceQueue.some(v => v.name === name)) return true;
    const priority = /^(v_win|v_lose|v_flawless|v_fight|v_prepare)$/.test(name) ? 3 : /flag/.test(name) ? 2 : 1;
    if (priority === 3) voiceQueue.length = 0;
    voiceQueue.push({ name, volume, priority, expires: performance.now() + 6000 });
    voiceQueue.sort((a, b) => b.priority - a.priority);
    if (voiceQueue.length > 4) voiceQueue.length = 4;
    pumpVoice(); return true;
  }
  function pumpVoice() {
    if (voiceTimer) { clearTimeout(voiceTimer); voiceTimer = null; }
    if (voiceActive || !audio || !voiceBus || document.hidden) return;
    while (voiceQueue.length && voiceQueue[0].expires < performance.now()) voiceQueue.shift();
    if (!voiceQueue.length) return;
    const item = voiceQueue[0], buffer = packBuf[item.name]?.[0] || sfxBuf[item.name];
    if (!buffer) { voiceTimer = setTimeout(pumpVoice, 100); return; }
    voiceQueue.shift();
    const src = audio.createBufferSource(), gain = audio.createGain(); src.buffer = buffer;
    src.playbackRate.value = 1; gain.gain.value = item.volume;
    src.connect(gain).connect(voiceBus);
    voiceActive = { name: item.name, src };
    mixBus.gain.setTargetAtTime(0.55, audio.currentTime, 0.04);
    src.onended = () => {
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
    if (!active) { packLoop("atmosphere", null); packLoop("saw", null); return; }
    const ev = stationMap() ? { cyc: 0, active: false, warn: false } : eventAt(clockNow()), key = ev.cyc + ":" + (ev.warn ? "warn" : ev.active ? "active" : "quiet");
    if (key !== eventAudioKey) { if (ev.warn) audioCue("warning"); else if (ev.active) audioCue("event"); eventAudioKey = key; }
    packLoop("atmosphere", ev.active && ev.type === "blackhole" ? "p_blackhole" : "p_ambient", ev.active && ev.type === "blackhole" ? 0.12 : 0.025);
    packLoop("saw", shots.some(s => s.kind === K.SAW && s.life > 0 && Math.hypot(s.x - me.x, s.y - me.y) < 900) ? "p_saw" : null, 0.09);
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
