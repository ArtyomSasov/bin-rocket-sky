  // ---------- sound ----------
  // filtered noise bursts for explosions
  let noiseBuf = null;
  function boomSound(dur, freq, vol) {
    if (!audio) return;
    if (!noiseBuf) {
      noiseBuf = audio.createBuffer(1, audio.sampleRate * 2.5, audio.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = audio.createBufferSource(), f = audio.createBiquadFilter(), v = audio.createGain(), t = audio.currentTime;
    src.buffer = noiseBuf; f.type = "lowpass"; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(60, t + dur);
    v.gain.setValueAtTime(vol, t); v.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(v).connect(audio.destination); src.start(t); src.stop(t + dur);
  }
  // recorded sound effects (CC0, from OpenGameArt: Kenney, rubberduck, zer0sol, bart), loaded after the first click.
  // sfx() returns false while a sound isn't loaded, so the caller can play its synthesized stand-in instead
  const SFX_NAMES = ["fire", "triple", "laser", "rocket", "scatter", "pump", "rail", "mine_drop", "boom_small", "boom_bin", "boom_big", "boom_low",
    "chunk", "hit", "crash", "ram", "shield_hit", "shield_get", "heal", "weapon_get", "dash", "level_up",
    "v_fight", "v_prepare", "v_multikill", "v_flawless", "v_win", "v_lose", "v_levelup", "v_powerup"];   // v_*: Kenney's CC0 voice-over packs
  const SFX_MP3 = new Set(["rail"]);   // rail.mp3: made by the game's author
  const sfxBuf = {};
  let sfxBus = null, heavyBus = null, sfxVoices = 0, hall = null;
  // a big room's echo, shared by the announcer sting and the guns
  function getHall() {
    if (!hall) {
      hall = audio.createConvolver();
      const len = audio.sampleRate * 2.6, ir = audio.createBuffer(2, len, audio.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
      hall.buffer = ir;
      const wet = audio.createGain(); wet.gain.value = 0.5; hall.connect(wet).connect(audio.destination);
    }
    return hall;
  }
  // heavier, grittier weapons: pitched down, a sub-bass punch under every shot, saturation, boosted lows, a little room
  const SFX_TUNE = {
    fire: [0.8, [110, 0.12, 0.45]], triple: [0.8, [100, 0.12, 0.4]], laser: [0.85, null], rocket: [0.75, [70, 0.3, 0.6]],
    scatter: [0.72, [75, 0.28, 1]], mine_drop: [0.9, null],
    boom_small: [0.8, [55, 0.5, 0.9]], boom_bin: [0.8, [45, 0.8, 1]], boom_big: [0.8, [38, 1.2, 1]], boom_low: [0.85, [32, 1.4, 1]],
    chunk: [0.8, [60, 0.4, 0.8]], hit: [0.7, [90, 0.12, 0.6]], crash: [0.75, [70, 0.22, 0.7]], ram: [0.75, [65, 0.25, 0.8]]
  };
  function loadSfx() {
    if (!audio) return;
    sfxBus = audio.createGain(); sfxBus.gain.value = 0.7;
    const comp = audio.createDynamicsCompressor();   // keeps a pile-up of explosions from clipping
    sfxBus.connect(comp).connect(audio.destination);
    heavyBus = audio.createGain(); heavyBus.gain.value = 0.75;
    const drive = audio.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(2.6 * x) / Math.tanh(2.6); }
    drive.curve = curve; drive.oversample = "2x";
    const lows = audio.createBiquadFilter(); lows.type = "lowshelf"; lows.frequency.value = 140; lows.gain.value = 7;
    const room = audio.createGain(); room.gain.value = 0.18;
    heavyBus.connect(drive).connect(lows).connect(comp);
    lows.connect(room).connect(getHall());
    for (const n of SFX_NAMES) fetch("sfx/" + n + (SFX_MP3.has(n) ? ".mp3" : ".wav")).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
      .then(b => audio.decodeAudioData(b)).then(b => { sfxBuf[n] = b; }).catch(() => {});   // missing file: the synth sound stays
  }
  // x, y: where it happens (quieter with distance, silent past ~2200); rate: pitch, with a little random spread
  function sfx(name, vol = 1, rate = 1, x, y) {
    const b = sfxBuf[name], tune = SFX_TUNE[name];
    if (!audio || !b) return false;
    if (x !== undefined) {
      const d = Math.hypot(x - me.x, y - me.y);
      if (d > 2200) return true;
      vol *= 1 - d / 2200;
    }
    if (sfxVoices > 28) return true;   // too many at once: skip quietly
    const src = audio.createBufferSource(), v = audio.createGain(), out = tune ? heavyBus : sfxBus;
    src.buffer = b; src.playbackRate.value = rate * (tune ? tune[0] : 1) * (0.94 + Math.random() * 0.12);
    v.gain.value = vol;
    src.connect(v).connect(out);
    if (tune && tune[1]) {   // the punch: a falling sine you feel more than hear
      const [f, dur, tv] = tune[1], o = audio.createOscillator(), og = audio.createGain(), t = audio.currentTime;
      o.type = "sine"; o.frequency.setValueAtTime(f * 1.8, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + dur);
      og.gain.setValueAtTime(vol * tv * 0.8, t); og.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(og).connect(heavyBus); o.start(t); o.stop(t + dur + 0.02);
    }
    sfxVoices++; src.onended = () => { sfxVoices--; };
    src.start();
    return true;
  }
  // the holy bomb's choir, synthesized: four sung syllables "Hal-le-lu-jah", each a D-major-ish chord of detuned
  // saw voices through two vowel formant filters (a, e, u, a), with vibrato and the hall's echo. Heard map-wide,
  // quieter far away
  const CHOIR = [   // [seconds, chord in Hz, formants of the vowel]
    [0.55, [146.8, 293.7, 370, 440], [800, 1150]],
    [0.3, [146.8, 293.7, 370, 440], [450, 1900]],
    [0.25, [196, 293.7, 392, 493.9], [350, 650]],
    [1.3, [220, 293.7, 370, 587.3], [800, 1150]]
  ];
  let choirUntil = 0;   // one choir at a time
  function choir(x, y) {
    if (!audio || audio.currentTime < choirUntil) return;
    const vol = 0.22 * (1 - Math.min(0.7, Math.hypot(x - me.x, y - me.y) / 6000));
    const out = audio.createGain(); out.gain.value = vol;
    out.connect(audio.destination); out.connect(getHall());
    let t = audio.currentTime + 0.05;
    for (const [dur, chord, [f1, f2]] of CHOIR) {
      const syl = audio.createGain(), end = t + dur;
      syl.gain.setValueAtTime(0.0001, t); syl.gain.exponentialRampToValueAtTime(1, t + 0.07);
      syl.gain.setValueAtTime(1, end - 0.08); syl.gain.exponentialRampToValueAtTime(0.0001, end + 0.12);
      for (const f of [f1, f2]) { const bp = audio.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 6; syl.connect(bp).connect(out); }
      const lfo = audio.createOscillator(), depth = audio.createGain();
      lfo.frequency.value = 5.2; depth.gain.value = 4;
      lfo.connect(depth); lfo.start(t); lfo.stop(end + 0.15);
      for (const f of chord) for (const det of [-7, 6]) {
        const o = audio.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = det;
        depth.connect(o.detune); o.connect(syl); o.start(t); o.stop(end + 0.15);
      }
      t = end;
    }
    choirUntil = t;
  }
  function blip(f, dur, type) {
    if (!audio) return;
    const o = audio.createOscillator(), v = audio.createGain(), t = audio.currentTime;
    o.type = type || "triangle";
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.9, t + dur);
    v.gain.setValueAtTime(0.12, t); v.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(v).connect(audio.destination); o.start(t); o.stop(t + dur);
  }

