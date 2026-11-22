// Injected into the browser test only. Render shipped PCM through the production
// audio graph, not mocked gains, and compare against the previous default compressor.
async function checkAudioRender() {
  const measure = (buffer, start = 0, end = buffer.duration) => {
    const data = buffer.getChannelData(0).subarray(Math.floor(start * buffer.sampleRate), Math.floor(end * buffer.sampleRate));
    let peak = 0, sum = 0;
    for (const v of data) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
    return { peak, rms: Math.sqrt(sum / data.length) };
  };
  async function render({ legacy = false, engine = false, duck = false, events = [] }) {
    const ctx = new OfflineAudioContext(2, 48000 * 4, 48000);
    let bus;
    if (legacy) {
      const effects = ctx.createGain(), mix = ctx.createGain(), comp = ctx.createDynamicsCompressor();
      effects.gain.value = 0.7; effects.connect(mix).connect(comp).connect(ctx.destination);
      bus = { effects, mix, presence: effects, engine: effects };
    } else bus = createSoundMix(ctx);
    if (duck) bus.mix.gain.value = 0.55;
    const play = (buffer, gain, output, at = 0, loop = false) => {
      const s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = buffer; s.loop = loop; g.gain.value = gain;
      s.connect(g).connect(output); s.start(at);
    };
    if (engine) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = 70; g.gain.value = 0.3; o.connect(g).connect(bus.engine); o.start(); }   // a steady stand-in for the synthesized jet
    const legacyGain = { p_user_fire: 0.75, p_user_demonic: 0.7, p_user_autocannon: 0.8 };
    for (const [name, at, volume = 1] of events) play(packBuf[name][0], volume * ((legacy && legacyGain[name]) || USER_SOUND_GAIN[name] || 1), name.startsWith('p_user_') ? bus.presence : bus.effects, at);
    return ctx.startRendering();
  }
  const shots = [];
  for (const name of ['p_user_fire', 'p_user_demonic', 'p_user_autocannon']) {
    const events = [[name, 0.2]];
    shots.push({ name, channels: packBuf[name][0].numberOfChannels, current: measure(await render({ events }), 0.2, 0.4), legacy: measure(await render({ events, legacy: true }), 0.2, 0.4) });
  }
  const events = Array.from({ length: 24 }, (_, i) => ['p_burst_minigun', 0.1 + i * 0.1, 0.7]);
  for (let i = 0; i < 4; i++) events.push(['p_user_massive', 0.3 + i * 0.15], ['p_user_autocannon', 0.2 + i * 0.3], ['p_user_demonic_explosion', 0.25 + i * 0.2]);
  // A low-level impulse/alternating waveform must retain both channels and
  // every sample, including its attack; this catches EQ and compressor regressions.
  const ctx = new OfflineAudioContext(2, 4800, 48000), bus = createSoundMix(ctx);
  const signal = ctx.createBuffer(2, 4800, 48000);
  for (let c = 0; c < 2; c++) for (let i = 0; i < 4800; i++) signal.getChannelData(c)[i] = (i % (c + 2) ? -1 : 1) * 0.25;
  const src = ctx.createBufferSource(); src.buffer = signal; src.connect(bus.effects); src.start();
  const clean = await ctx.startRendering(); let fidelityError = 0;
  for (let c = 0; c < 2; c++) for (let i = 0; i < 4800; i++) fidelityError = Math.max(fidelityError, Math.abs(clean.getChannelData(c)[i] - signal.getChannelData(c)[i] * .85 * .95));
  return {
    fidelityError,
    engine: measure(await render({ engine: true }), 0.3, 3.5),
    duckedEngine: measure(await render({ engine: true, duck: true }), 0.3, 3.5),
    shots, battle: measure(await render({ engine: true, events }))
  };
}
async function checkContinuousAudio() {
  const now=performance.now(), ok=(v,msg)=>{if(!v)throw Error(msg);};
  for(const id of firingSounds.keys())stopContinuous(id);
  for (const v of [...priorityActive]) v.src.stop();
  await new Promise(resolve => setTimeout(resolve, 30));
  const original=audio.createBufferSource, started=[];
  audio.createBufferSource=function(){const s=original.call(audio),start=s.start.bind(s);s.start=(...a)=>{started.push(s.buffer);return start(...a);};return s;};
  try {
    const oldWeapon=me.weapon;me.weapon='minigun';
    for(let i=0;i<20;i++)continuousFire('me','minigun',me.x,me.y,now+i*45);
    ok(started.filter(b=>packBuf.p_ut_mini_fire.includes(b)).length===1,'one authored UT loop per shooter');
    ok(!started.includes(packBuf.p_loop_minigun[0]),'no buzzing minigun loop');
    continuousFire('me','minigun',me.x,me.y,now+1000,true);ok(started.includes(packBuf.p_ut_mini_alt[0]),'alternate minigun sound');
    stopContinuous('me');ok(started.includes(packBuf.p_ut_mini_stop[0]),'minigun winddown');ok(!packLoops['fire:me'],'minigun stop');me.weapon=oldWeapon;
    for(const id of ['laserA','laserB']) {remotes.set(id,{x:me.x+100,y:me.y,weapon:'laser'});shotSound(K.LASER,me.x+100,me.y,id);}
    ok(firingSounds.has('laserA')&&firingSounds.has('laserB'),'independent remote laser starts');
    ok(packLoops['fire:laserA'].src.buffer===packBuf.p_ut_pulse_bolt[0],'remote Pulse beam uses supplied loop');
    continuousAudioTick(now+2000);ok(!firingSounds.size,'stale remote beams stop');
    const saved=sfxVoices;sfxVoices=29;const count=started.length;sfx('hit',1);sfx('p_kill',0.5);sfx('p_warning',0.5);sfxVoices=saved;
    ok([sfxBuf.hit,packBuf.p_kill[0],packBuf.p_warning[0]].every(b=>b&&started.slice(count).includes(b)),'damage, kill and warning survive weapon voice exhaustion');
    return ['authored UT minigun loops and winddown', 'independent remote lasers and timeout', 'reserved damage/kill/warning voices'];
  } finally {audio.createBufferSource=original;remotes.delete('laserA');remotes.delete('laserB');for(const id of firingSounds.keys())stopContinuous(id);}
}
