  // ---------- a jet fighter's engine, made here ----------
  // Three layers: the roar (brown noise through a low filter that opens with the throttle), the turbine's whine (two
  // detuned tones gliding up with the throttle, a third of an octave apart) and, on boost, the afterburner (a deep
  // rumble of noise with a crackling top, coming in fast). Lighting the afterburner kicks with a rising whoosh and a
  // low thump (jetIgnite)
  let jet = null;
  function jetBuild() {
    const len = audio.sampleRate * 2, b = audio.createBuffer(1, len, audio.sampleRate), d = b.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }   // brown noise
    const b2 = audio.createBuffer(1, len, audio.sampleRate), d2 = b2.getChannelData(0);
    for (let i = 0; i < len; i++) d2[i] = (Math.random() * 2 - 1) * (Math.random() < 0.03 ? 1 : 0.3);   // crackle
    const src = (buf) => { const s = audio.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
    const out = audio.createGain(); out.gain.value = 0; out.connect(engineBus || sfxBus);
    const roar = src(b), roarF = audio.createBiquadFilter(), roarG = audio.createGain(); roarF.type = "lowpass"; roarF.frequency.value = 300; roarF.Q.value = 0.7; roarG.gain.value = 0.5;
    roar.connect(roarF).connect(roarG).connect(out);
    const w1 = audio.createOscillator(), w2 = audio.createOscillator(), wF = audio.createBiquadFilter(), wG = audio.createGain();
    w1.type = "sawtooth"; w2.type = "triangle"; w1.frequency.value = 420; w2.frequency.value = 530; wF.type = "bandpass"; wF.frequency.value = 1400; wF.Q.value = 2; wG.gain.value = 0.02;
    w1.connect(wF); w2.connect(wF); wF.connect(wG).connect(out); w1.start(); w2.start();
    const ab = src(b), abF = audio.createBiquadFilter(), abG = audio.createGain(); abF.type = "lowpass"; abF.frequency.value = 900; abG.gain.value = 0;
    ab.connect(abF).connect(abG).connect(out);
    const cr = src(b2), crF = audio.createBiquadFilter(), crG = audio.createGain(); crF.type = "bandpass"; crF.frequency.value = 2500; crF.Q.value = 0.9; crG.gain.value = 0;
    cr.connect(crF).connect(crG).connect(out);
    jet = { out, roarF, roarG, w1, w2, wF, wG, abG, abF, crG, lastBoost: 0 };
  }
  function jetIgnite(level = 1) {
    if (!audio || !sfxBus) return;
    const t = audio.currentTime, d = 0.7, n = audio.createBufferSource(), b = audio.createBuffer(1, audio.sampleRate * d | 0, audio.sampleRate), x = b.getChannelData(0);
    for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * Math.min(1, i / (x.length * 0.25))) * Math.pow(1 - i / x.length, 1.5);
    n.buffer = b; const f = audio.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 0.9; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3200, t + d * 0.6);
    const v = audio.createGain(); v.gain.value = 0.35 * level; n.connect(f).connect(v).connect(engineBus || sfxBus); n.start(t);
    const o = audio.createOscillator(), ov = audio.createGain(); o.type = "sine"; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    ov.gain.setValueAtTime(0.4 * level, t); ov.gain.exponentialRampToValueAtTime(0.001, t + 0.4); o.connect(ov).connect(engineBus || sfxBus); o.start(t); o.stop(t + 0.42);
  }
  function engineHum(speed, thrust, boost, now, active = true) {
    if (!audio || !sfxBus) return;
    const on = active && !document.hidden && settings.engine !== "off";
    if (!jet) { if (!on) return; jetBuild(); }
    const power = Math.max(0, Math.min(1, thrust)), ab = Math.max(0, Math.min(1, boost)), t = audio.currentTime, sp = Math.min(1, speed / 1000);
    if (ab > 0.5 && jet.lastBoost <= 0.5) jetIgnite();
    jet.lastBoost = ab;
    const idle = on ? 0.18 : 0, level = on ? Math.max(idle, Math.max(power, sp * 0.4)) : 0;
    jet.out.gain.setTargetAtTime(on ? 0.5 : 0, t, 0.12);
    jet.roarF.frequency.setTargetAtTime(220 + 1500 * level + 1200 * ab, t, 0.15); jet.roarG.gain.setTargetAtTime(0.25 + 0.55 * level, t, 0.12);
    const wf = 380 + 900 * level + 500 * ab;   // the turbine spooling up
    jet.w1.frequency.setTargetAtTime(wf, t, 0.35); jet.w2.frequency.setTargetAtTime(wf * 1.26, t, 0.35); jet.wF.frequency.setTargetAtTime(wf * 2.4, t, 0.35);
    jet.wG.gain.setTargetAtTime(0.012 + 0.03 * level, t, 0.2);
    jet.abG.gain.setTargetAtTime(0.9 * ab, t, ab > 0.5 ? 0.04 : 0.25); jet.abF.frequency.setTargetAtTime(600 + 900 * ab, t, 0.1);
    jet.crG.gain.setTargetAtTime(0.05 * ab, t, 0.06);
    return;
  }
  // the volume settings (0-100 each): all of it, the effects (guns, blasts, hits, the important cues), the engines,
  // the announcer; each scales its bus from the mix's own level, gliding there so a slider drag does not click
  function applyVolumes() {
    if (!soundMix || !audio) return;
    const v = k => Math.max(0, Math.min(100, Number(settings[k]) || 0)) / 100, t = audio.currentTime;
    const set = (node, x) => node.gain.setTargetAtTime(x, t, 0.03);
    set(soundMix.output, 4 * 0.95 * v("vol")); set(soundMix.effects, 0.85 * v("volFx")); set(soundMix.priority, v("volFx"));
    set(soundMix.engine, 0.8 * v("volEngine")); set(soundMix.voice, 0.75 * v("volVoice"));
  }
  function loadSfx() {
    if (!audio || sfxBus) return;
    const buses = soundMix = createSoundMix(audio);
    sfxBus = buses.effects; mixBus = buses.mix; voiceBus = buses.voice;
    engineBus = buses.engine; userBus = buses.presence; priorityBus = buses.priority;
    heavyBus = audio.createGain(); heavyBus.gain.value = 0.75;
    const drive = audio.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(2.6 * x) / Math.tanh(2.6); }
    drive.curve = curve; drive.oversample = "2x";
    const lows = audio.createBiquadFilter(); lows.type = "lowshelf"; lows.frequency.value = 140; lows.gain.value = 7;
    const room = audio.createGain(); room.gain.value = 0.18;
    heavyBus.connect(drive).connect(lows).connect(mixBus);
    lows.connect(room).connect(getHall());
    applyVolumes();
    preloadSounds();   // (already under way since the page opened, unless it couldn't decode before a click)
    audioUp(audio);
  }
