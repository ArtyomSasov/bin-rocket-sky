  // ---------- sound ----------
  let noiseBuf = null;   // white noise (the blades' whoosh and crackle)
  // recorded sound effects (CC0, from OpenGameArt: Kenney, rubberduck, zer0sol, bart), loaded after the first click.
  // Only those the sound pack doesn't voice (SOUND_OVERRIDE / its announcer): every event has one sound, never a stand-in
  const SFX_NAMES = ["laser", "rocket", "scatter", "pump", "rail", "mine_drop", "boom_low",
    "hit", "shield_hit", "shield_get", "heal", "weapon_get", "level_up",
    "v_multikill", "v_levelup", "v_powerup"];   // v_*: Kenney's CC0 voice-over packs
  const SFX_MP3 = new Set(["rail"]);   // rail.mp3: made by the game's author
  const sfxBuf = {};
  let soundMix = null;   // the mix's buses, for the volume settings (applyVolumes)
  let sfxBus = null, heavyBus = null, mixBus = null, voiceBus = null, engineBus = null, userBus = null, priorityBus = null, priorityVoices = 0, sfxVoices = 0, tailVoices = 0, blastVoices = 0, hall = null;
  function createSoundMix(ctx) {
    const effects = ctx.createGain(), mix = ctx.createGain(), voice = ctx.createGain(), engine = ctx.createGain(), priority = ctx.createGain();
    effects.gain.value = 0.85; voice.gain.value = 0.75; engine.gain.value = 0.8;
    // Unity response below 0.8: no compressor makeup gain, EQ or transient pumping.
    // Scale into a +/-4 range so the peak guard can handle overlapping explosions.
    const input = ctx.createGain(), guard = ctx.createWaveShaper(), output = ctx.createGain();
    input.gain.value = 0.25; output.gain.value = 4 * 0.95;
    const curve = new Float32Array(65537);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1) * 2 - 1) * 4, a = Math.abs(x);
      curve[i] = Math.sign(x) * (a <= 0.8 ? a : 0.8 + 0.18 * (1 - Math.exp(-(a - 0.8) / 0.18))) / 4;
    }
    guard.curve = curve;
    effects.connect(mix).connect(input);
    engine.connect(input); priority.connect(input); voice.connect(input);
    input.connect(guard).connect(output).connect(ctx.destination);
    return { effects, mix, voice, engine, priority, presence: effects, output };
  }
  // a big room's echo, shared by the announcer sting and the guns
  function getHall() {
    if (!hall) {
      hall = audio.createConvolver();
      const len = audio.sampleRate * 2.6, ir = audio.createBuffer(2, len, audio.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
      hall.buffer = ir;
      const wet = audio.createGain(); wet.gain.value = 0.5; hall.connect(wet).connect(mixBus || audio.destination);
    }
    return hall;
  }
  // heavier, grittier weapons: pitched down, a sub-bass punch under every shot, saturation, boosted lows, a little room
  const SFX_TUNE = {
    fire: [0.8, [110, 0.12, 0.45]], laser: [0.85, null], rocket: [0.75, [70, 0.3, 0.6]],
    scatter: [0.72, [75, 0.28, 1]], mine_drop: [0.9, null],
    boom_small: [0.8, [55, 0.5, 0.9]], boom_bin: [0.8, [45, 0.8, 1]], boom_big: [0.8, [38, 1.2, 1]], boom_low: [0.85, [32, 1.4, 1]],
    chunk: [0.8, [60, 0.4, 0.8]], hit: [0.7, [90, 0.12, 0.6]], crash: [0.75, [70, 0.22, 0.7]], ram: [0.75, [65, 0.25, 0.8]]
  };
