  // ---------- the energy blades' voice, made here (no recording): a lightsaber's ----------
  // The hum: a projector-motor drone (two saws a hair apart, beating, over a sub an octave down) with a TV-tube buzz on
  // top, slightly wavering. The swing: that hum Doppler-bent up and back as the blade cuts past, swelling and opening
  // with a breath of air. The clash: a white crack, a spitting electric crackle and the hum shrieking up and dying back
  const bladeNoise = () => { if (!noiseBuf) { noiseBuf = audio.createBuffer(1, audio.sampleRate * 2.5, audio.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } return noiseBuf; };
  let buzzCurve = null;
  const bladeBuzz = () => { if (!buzzCurve) { buzzCurve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; buzzCurve[i] = Math.tanh(x * 3.2) * 0.9 + 0.1 * Math.sign(x) * Math.pow(Math.abs(x), 0.3); } } const w = audio.createWaveShaper(); w.curve = buzzCurve; return w; };
  function bladeOut(pan) {   // a voice's way out, panned where it is
    const p = audio.createStereoPanner ? audio.createStereoPanner() : null;
    if (!p) return sfxBus;
    p.pan.value = clamp(pan || 0, -1, 1); p.connect(sfxBus); return p;
  }
  // a hum voice: base pitch f; returns its oscillators and the filter and gain to shape it
  function humVoice(f, out) {
    const o1 = audio.createOscillator(), o2 = audio.createOscillator(), o3 = audio.createOscillator(), mix = audio.createGain(), sh = bladeBuzz(), lp = audio.createBiquadFilter(), pk = audio.createBiquadFilter(), v = audio.createGain();
    o1.type = "sawtooth"; o2.type = "sawtooth"; o3.type = "square";
    o1.frequency.value = f; o2.frequency.value = f * 1.014; o3.frequency.value = f / 2;
    const g3 = audio.createGain(); g3.gain.value = 0.35;
    o1.connect(mix); o2.connect(mix); o3.connect(g3).connect(mix); mix.gain.value = 0.55;
    pk.type = "peaking"; pk.frequency.value = 240; pk.Q.value = 1.4; pk.gain.value = 9;
    lp.type = "lowpass"; lp.frequency.value = 1100; lp.Q.value = 0.9; v.gain.value = 0;
    mix.connect(sh).connect(pk).connect(lp).connect(v).connect(out);
    const lfo = audio.createOscillator(), lg = audio.createGain(); lfo.frequency.value = 0.7 + Math.random() * 0.6; lg.gain.value = f * 0.012;   // the waver
    lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
    return { os: [o1, o2, o3, lfo], o1, o2, o3, lp, v };
  }
  // the hum while a blade is out (level 0..1: barely lit .. wound up full); 0 puts it away
  let bladeHum = null;
  function bladeHumSet(level) {
    if (!audio || !sfxBus) return;
    if (level <= 0) { if (bladeHum) { const h = bladeHum; bladeHum = null; h.v.gain.setTargetAtTime(0, audio.currentTime, 0.05); setTimeout(() => { try { h.os.forEach(o => o.stop()); } catch {} }, 400); } return; }
    const t = audio.currentTime;
    if (!bladeHum) { bladeHum = humVoice(90, sfxBus); bladeHum.os.forEach(o => o.start(t)); }
    bladeHum.v.gain.setTargetAtTime(0.045 + 0.06 * level, t, 0.04); bladeHum.lp.frequency.setTargetAtTime(900 + 1600 * level, t, 0.06);
    const f = 90 + 26 * level; bladeHum.o1.frequency.setTargetAtTime(f, t, 0.06); bladeHum.o2.frequency.setTargetAtTime(f * 1.014, t, 0.06); bladeHum.o3.frequency.setTargetAtTime(f / 2, t, 0.06);
  }
  // the swing: "vwhoom", the hum Doppler-bent up as the blade sweeps past and down after it, louder for a fuller swing
  function bladeSwing(power = 1, pan = 0) {
    if (!audio || !sfxBus) return;
    const t = audio.currentTime, d = 0.5, pk = d * 0.42, out = bladeOut(pan), h = humVoice(78, out), up = 1.9;
    for (const [o, m] of [[h.o1, 1], [h.o2, 1.014], [h.o3, 0.5]]) { const f0 = 78 * m; o.frequency.cancelScheduledValues(t); o.frequency.setValueAtTime(f0 * 0.92, t); o.frequency.exponentialRampToValueAtTime(f0 * up, t + pk); o.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + d); }
    h.lp.frequency.setValueAtTime(700, t); h.lp.frequency.exponentialRampToValueAtTime(4200, t + pk); h.lp.frequency.exponentialRampToValueAtTime(600, t + d);
    const vol = 0.24 * (0.45 + 0.55 * power);
    h.v.gain.setValueAtTime(0.0001, t); h.v.gain.exponentialRampToValueAtTime(vol, t + pk); h.v.gain.exponentialRampToValueAtTime(0.0001, t + d);
    h.os.forEach(o => { o.start(t); o.stop(t + d + 0.02); });
    const n = audio.createBufferSource(), bf = audio.createBiquadFilter(), nv = audio.createGain();   // the air it cuts
    n.buffer = bladeNoise(); bf.type = "bandpass"; bf.Q.value = 1.6; bf.frequency.setValueAtTime(500, t); bf.frequency.exponentialRampToValueAtTime(2400, t + pk); bf.frequency.exponentialRampToValueAtTime(700, t + d);
    nv.gain.setValueAtTime(0.0001, t); nv.gain.exponentialRampToValueAtTime(0.09 * power, t + pk); nv.gain.exponentialRampToValueAtTime(0.0001, t + d);
    n.connect(bf).connect(nv).connect(out); n.start(t, Math.random() * 2); n.stop(t + d);
  }
  // the clash: the blade striking a pilot or biting rock and steel. A white crack, the crackle of spitting energy, and
  // the hum shrieking up and dropping back with a gritty ring; burn: the quieter sizzle of it cutting through something
  function bladeClash(pan = 0, burn = false) {
    if (!audio || !sfxBus) return;
    const t = audio.currentTime, out = bladeOut(pan), k = burn ? 0.45 : 1, d = burn ? 0.22 : 0.42;
    // the crack
    const n = audio.createBufferSource(), hp = audio.createBiquadFilter(), nv = audio.createGain();
    n.buffer = bladeNoise(); hp.type = "highpass"; hp.frequency.value = 900; nv.gain.setValueAtTime(0.42 * k, t); nv.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    n.connect(hp).connect(nv).connect(out); n.start(t, Math.random() * 2); n.stop(t + 0.08);
    // the crackle: noise chopped into spits by a fast random square gate
    const len = audio.sampleRate * d | 0, cb = audio.createBuffer(1, len, audio.sampleRate), x = cb.getChannelData(0);
    for (let i = 0, on = 0; i < len; i++) { if (i % 90 === 0) on = Math.random() < 0.45 - 0.3 * i / len ? 1 : 0.08; x[i] = (Math.random() * 2 - 1) * on * Math.pow(1 - i / len, 1.6); }
    const c = audio.createBufferSource(), bp = audio.createBiquadFilter(), cv = audio.createGain();
    c.buffer = cb; bp.type = "bandpass"; bp.frequency.value = 2600; bp.Q.value = 0.7; cv.gain.value = 0.5 * k;
    c.connect(bp).connect(cv).connect(out); c.start(t);
    // the hum shrieking: up a fifth and more at the hit, gritty with a ring modulator, falling back
    const h = humVoice(burn ? 120 : 110, out), rm = audio.createGain(), ro = audio.createOscillator();
    ro.type = "square"; ro.frequency.value = 31 + Math.random() * 12; rm.gain.value = 0.65; const rg = audio.createGain(); rg.gain.value = 0.35; ro.connect(rg).connect(rm.gain);
    h.v.disconnect(); h.v.connect(rm).connect(out);
    for (const [o, m] of [[h.o1, 1], [h.o2, 1.014], [h.o3, 0.5]]) { const f0 = (burn ? 120 : 110) * m; o.frequency.setValueAtTime(f0 * 2.1, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.85, t + d); }
    h.lp.frequency.setValueAtTime(5200, t); h.lp.frequency.exponentialRampToValueAtTime(800, t + d);
    h.v.gain.setValueAtTime(0.32 * k, t); h.v.gain.exponentialRampToValueAtTime(0.0001, t + d);
    h.os.forEach(o => { o.start(t); o.stop(t + d + 0.02); }); ro.start(t); ro.stop(t + d + 0.02);
    if (!burn) for (const [f, a] of [[1870, 0.05], [2730, 0.035], [3960, 0.025]]) {   // a brief metallic ring on a solid hit
      const o = audio.createOscillator(), v = audio.createGain(); o.frequency.value = f * (0.97 + Math.random() * 0.06);
      v.gain.setValueAtTime(a, t); v.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.connect(v).connect(out); o.start(t); o.stop(t + 0.31);
    }
  }

