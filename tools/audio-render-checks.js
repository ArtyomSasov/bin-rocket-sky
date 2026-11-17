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
    const ctx = new OfflineAudioContext(1, 48000 * 4, 48000);
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
    if (engine) play(packBuf.p_ship_engine[0], 0.425, bus.engine, 0, true);
    const legacyGain = { p_user_fire: 0.75, p_user_demonic: 0.7, p_user_autocannon: 0.8 };
    for (const [name, at, volume = 1] of events) play(packBuf[name][0], volume * ((legacy && legacyGain[name]) || USER_SOUND_GAIN[name] || 1), name.startsWith('p_user_') ? bus.presence : bus.effects, at);
    return ctx.startRendering();
  }
  const shots = [];
  for (const name of ['p_user_fire', 'p_user_demonic', 'p_user_autocannon']) {
    const events = [[name, 0.2]];
    shots.push({ name, current: measure(await render({ events }), 0.2, 0.4), legacy: measure(await render({ events, legacy: true }), 0.2, 0.4) });
  }
  const events = Array.from({ length: 24 }, (_, i) => ['p_burst_minigun', 0.1 + i * 0.1, 0.7]);
  for (let i = 0; i < 4; i++) events.push(['p_user_massive', 0.3 + i * 0.15], ['p_user_autocannon', 0.2 + i * 0.3], ['p_user_demonic_explosion', 0.25 + i * 0.2]);
  return {
    engine: measure(await render({ engine: true }), 0.3, 3.5),
    duckedEngine: measure(await render({ engine: true, duck: true }), 0.3, 3.5),
    shots, battle: measure(await render({ engine: true, events }))
  };
}
