  // ---------- sound ----------
  let noiseBuf = null;   // white noise (the blades' whoosh and crackle)
  // recorded sound effects (CC0, from OpenGameArt: Kenney, rubberduck, zer0sol, bart), loaded after the first click.
  // Only those the sound pack doesn't voice (SOUND_OVERRIDE / its announcer): every event has one sound, never a stand-in
  const SFX_NAMES = ["laser", "rocket", "scatter", "pump", "rail", "mine_drop", "boom_low",
    "hit", "shield_hit", "shield_get", "heal", "weapon_get", "level_up",
    "v_multikill", "v_levelup", "v_powerup"];   // v_*: Kenney's CC0 voice-over packs
  const SFX_MP3 = new Set(["rail"]);   // rail.mp3: made by the game's author
  const sfxBuf = {};
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
    fire: [0.8, [110, 0.12, 0.45]], triple: [0.8, [100, 0.12, 0.4]], laser: [0.85, null], rocket: [0.75, [70, 0.3, 0.6]],
    scatter: [0.72, [75, 0.28, 1]], mine_drop: [0.9, null],
    boom_small: [0.8, [55, 0.5, 0.9]], boom_bin: [0.8, [45, 0.8, 1]], boom_big: [0.8, [38, 1.2, 1]], boom_low: [0.85, [32, 1.4, 1]],
    chunk: [0.8, [60, 0.4, 0.8]], hit: [0.7, [90, 0.12, 0.6]], crash: [0.75, [70, 0.22, 0.7]], ram: [0.75, [65, 0.25, 0.8]]
  };
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
  function loadSfx() {
    if (!audio || sfxBus) return;
    const buses = createSoundMix(audio);
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
    preloadSounds();   // (already under way since the page opened, unless it couldn't decode before a click)
    audioUp(audio);
  }
  // ---- the game's sound pack (sfx/pack: the author's weapon sounds and announcer voice). Each file is matched to a game
  // event by its path (a Quake III-style weapons tree) or, for the announcer, by a word in its name; where the pack has
  // a sound it plays instead of the built-in or synthesized one. sfx/pack/index.json (written by the build) lists them;
  // the one-file game carries them inside (window.BRS_PACK)
  const PACK_PATHS = {
    p_ut_pulse_fire: ["ut/pulse-gun-fire.wav"],
    p_ut_pulse_bolt: ["ut/pulse-gun-bolt.wav"],
    p_ut_pulse_down: ["ut/pulse-gun-down.wav"],
    p_ut_pulse_explode: ["ut/pulse-gun-explode.wav"],

    v_fight: ["voice/fight.mp3"],
    p_ut_fire: ["ut/default-weapon-fire.wav"],
    p_ut_rocket_fire: ["ut/rocket-launcher-fire.wav"],
    p_ut_rocket_load: ["ut/rocket-launcher-load.wav"],
    p_ut_rocket_boom: ["ut/rocket_explode.wav"],
    p_ut_rocket_fly: ["ut/rocket_fly.wav"],
    p_ut_saw_travel: ["ut/saw-blade-travel.wav"],
    p_ut_saw_ric: ["ut/saw-blade-ric.wav"],
    p_ut_saw_alt: ["ut/saw-alt-fire.wav"],
    p_ut_saw_fire: ["ut/saw-fire.wav"],
    p_ut_nuke_boom: ["ut/nuke-explode.wav"],
    p_ut_nuke_fly: ["ut/fly-nuke.wav"],
    p_ut_nuke_pick: ["ut/pick-nuke.wav"],
    p_ut_nuke_fire: ["ut/nuke-shot.wav"],
    p_ut_mini_alt: ["ut/minigun-altfire.wav"],
    p_ut_mini_fire: ["ut/minigun-regfire.wav"],
    p_ut_mini_stop: ["ut/minigun-winddown.wav"],
    p_ut_flak_boom: ["ut/shard-canon-alt-explode.wav"],
    p_ut_flak_alt: ["ut/shard-cannon-alt-fire.wav"],
    p_ut_flak_fire: ["ut/shard-cannon-fire.wav"],
    p_ut_draw: ["ut/draw-all-weapon-sound.wav"],
    p_ut_shock_combo: ["ut/shock-orb-combo-explode.wav"],
    p_ut_shock_alt: ["ut/shock-orb-alt-fire.wav"],
    p_ut_shock_fire: ["ut/shock-orb-fire.wav"],

    p_start_minigun: ["derived/minigun-start.wav"], p_loop_minigun: ["derived/minigun-loop.wav"],
    p_stop_minigun: ["derived/minigun-stop.wav"], p_stop_laser: ["derived/laser-stop.wav"],
    p_user_demonic: ["user/demonic-shot.wav"], p_user_fire: ["user/demonic-shot-short.wav"],
    p_user_cannon: ["user/explosive-canon.wav"], p_user_autocannon: ["user/autocannon.wav"],
    p_user_explosion: ["user/explosion-rumb.wav"], p_user_massive: ["user/massive-explosion.wav", "user/explosive-nuke-or-holybomb.wav"],
    p_warp: ["engine/warp-dash.wav"], p_user_demonic_explosion: ["user/demonic-explosions.wav"],
    p_metal: ["physical/metal_1.wav", "physical/metal_10.wav", "physical/metal_20.wav"],
    p_blast: ["physical/bang_04.ogg", "physical/bang_05.ogg"],
    p_blast_heavy: ["physical/cannon_01.ogg", "physical/cannon_02.ogg"],
    a_unstoppable: ["voice/warlord/unstoppable.wav"], a_deathmatch: ["voice/warlord/deathmatch.wav"],
    a_teamdeathmatch: ["voice/warlord/team_deathmatch.wav"], a_capturetheflag: ["voice/warlord/capture_the_flag.wav"],
    v_win: ["voice/warlord/round_winner.wav"], v_lose: ["voice/warlord/mission_failed.wav"],
    p_teleport: ["supplemental/teleport_02.ogg"], p_boost: ["supplemental/rocket_01.ogg"],
    p_ambient: ["supplemental/loop_ambient_01.ogg"], p_blackhole: ["supplemental/loop_ambient_weird.ogg"],
    p_saw: ["supplemental/loop_machine_02.ogg"], p_warning: ["supplemental/beep_03.ogg"],
    p_ready: ["supplemental/terminal_01.ogg"], p_powerdown: ["supplemental/terminal_03.ogg"],
    p_ui: ["supplemental/terminal_06.ogg"], p_event: ["supplemental/explosion_01.ogg"],
    p_pickup: ["supplemental/beep_01.ogg"], p_kill: ["supplemental/terminal_05.ogg"],
    p_charge: ["supplemental/terminal_02.ogg"], p_sting: ["supplemental/teleport_01.ogg"],
    p_death: ["supplemental/explosion_02.ogg"], p_engine: ["supplemental/loop_machine_01.ogg"],
    p_fire_minigun: ["machinegun/fire1.wav", "machinegun/fire2.wav", "machinegun/fire3.wav", "machinegun/fire4.wav"],
    p_burst_minigun: ["chaingun/f1b.wav", "chaingun/f2b.wav", "chaingun/f3b.wav", "chaingun/f4b.wav"],
    p_legacy_minigun: ["chaingun/fire.wav"], p_spin_minigun: ["chaingun/wind.wav"], p_hit_bullet: ["chaingun/impd.wav", "chaingun/impl.wav", "chaingun/impm.wav"],
    p_ric: ["machinegun/ric1.wav", "machinegun/ric2.wav", "machinegun/ric3.wav"], p_whiz: ["machinegun/buletby1.wav"],
    p_fire_scatter: ["shotgun/sshotf1b.wav"],
    p_fire_rocket: ["rocket/rocklf1a.wav"], p_quake_grenade_boom: ["rocket/rocklx1a.wav"], p_fly_rocket: ["rocket/rockfly.wav"],
    p_fire_orb: ["plasma/hyprbf1a.wav"], p_boom_orb: ["plasma/plasmx1a.wav"], p_fly_orb: ["plasma/lasfly.wav"],
    p_fire_rail: ["railgun/railgf1a.wav"], p_hum_rail: ["railgun/rg_hum.wav"],
    p_fire_laser: ["lightning/lg_fire_start.wav"], p_loop_laser: ["lightning/lg_fire_loop.wav"], p_hum_laser: ["lightning/lg_hum.wav"],
    p_hit_laser: ["lightning/lg_hit.wav", "lightning/lg_hit2.wav", "lightning/lg_hit3.wav"],
    p_fire_gamma: ["bfg/bfg_fire.wav"], p_hum_gamma: ["bfg/bfg_hum.wav"],
    p_fire_mine: ["proxmine/fire.wav"], p_arm_mine: ["proxmine/actv.wav"], p_boom_mine: ["proxmine/expl.wav"], p_tick_mine: ["proxmine/tick.wav"],
    p_mine_hit: ["proxmine/impd.wav", "proxmine/impl.wav", "proxmine/impm.wav"],
    p_fire_nail: ["nailgun/wnalfire.wav"], p_hit_nail: ["nailgun/wnalimpd.wav", "nailgun/wnalimpl.wav", "nailgun/wnalimpm.wav"], p_whiz_nail: ["nailgun/wnalflit.wav"],
    p_fire_gren: ["grenade/grenlf1a.wav"], p_bounce_gren: ["grenade/hgrenb1a.wav", "grenade/hgrenb2a.wav"],
    p_melee_hit: ["melee/fstatck.wav"], p_melee_run: ["melee/fstrun.wav"],
    p_change: ["change.wav"], p_noammo: ["noammo.wav"], p_spot: ["weapon_hover.wav"], p_holy: ["holy/holy-bomb.mp3"]
  };
  // the announcer: a word in the file's name -> the line it voices (longest words first)
  const PACK_VOICES = [["firstblood", "a_firstblood"], ["flawlessvictory", "v_flawless"], ["ludicrouskill", "a_ludicrouskill"], ["monsterkill", "a_monsterkill"], ["doublekill", "a_doublekill"], ["triplekill", "a_triplekill"],
    ["ultrakill", "a_ultrakill"], ["multikill", "a_multikill"], ["holyshit", "a_holyshit"], ["killingspree", "a_killingspree"], ["wickedsick", "a_wickedsick"],
    ["dominating", "a_dominating"], ["rampage", "a_rampage"], ["godlike", "a_godlike"], ["impressive", "a_impressive"], ["humiliation", "a_humiliation"],
    ["headshot", "a_headshot"], ["combowhore", "a_shockcombo"], ["flagtaken", "a_flagtaken"], ["flagcap", "a_flagcap"], ["quad", "a_quaddamage"],
    ["prepare", "v_prepare"], ["fight", "v_fight"]];
  function packEventFor(path) {
    const p = path.toLowerCase().replace(/\\/g, "/"), word = p.split("/").pop().replace(/\.[a-z0-9]+$/, "").replace(/1st/g, "first").replace(/[^a-z]/g, "");
    for (const [ev, list] of Object.entries(PACK_PATHS)) if (list.some(e => p === e || p.endsWith("/" + e))) return ev;
    for (const [kw, ev] of PACK_VOICES) if (word.includes(kw)) return ev;
    return null;
  }
  const packBuf = {};   // event -> its decoded variants (one is picked at random)
  // ---- loading: every sound is fetched and decoded as soon as the page opens. An offline context decodes without
  // waiting for the first click (browsers keep a real one silent until then) and its buffers play in the real one.
  // loadState counts the files for the start screen's progress bar (loadWatch: called on every step)
  const loadState = { total: 0, done: 0, failed: 0 }, loadWatchers = [];
  const loadTick = () => { for (const f of loadWatchers) f(loadState); };
  const loadWatch = f => { loadWatchers.push(f); f(loadState); };
  let audioUp, decoder = null, preloading = false;
  const audioReady = new Promise(r => { audioUp = r; });
  const decodeWith = bytes => decoder ? decoder.decodeAudioData(bytes) : audioReady.then(a => a.decodeAudioData(bytes));
  function loadTrack(src, store) {
    loadState.total++; loadTick();
    return fetch(src).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status)).then(decodeWith).then(store)
      .catch(() => { loadState.failed++; }).finally(() => { loadState.done++; loadTick(); });
  }
  function preloadSounds() {
    if (preloading || typeof fetch !== "function") return;
    preloading = true;
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    try { if (Offline) decoder = new Offline(2, 1, 48000); } catch {}
    // the one-file game carries its sounds inside (window.BRS_SFX, data: URLs); the page fetches them from sfx/
    for (const n of SFX_NAMES) loadTrack((window.BRS_SFX && window.BRS_SFX[n]) || "sfx/" + n + (SFX_MP3.has(n) ? ".mp3" : ".wav"), b => { sfxBuf[n] = b; });
    loadPack();
  }
  function loadPack() {
    const add = (path, src) => {
      const ev = packEventFor(path);
      if (!ev) return;
      packListed.add(ev);
      loadTrack(src, b => { (packBuf[ev] = packBuf[ev] || []).push(b); });
    };
    if (window.BRS_PACK) { for (const [p, d] of Object.entries(window.BRS_PACK)) add(p, d); return; }
    loadState.total++;   // (the list itself)
    const manifest = window.BRS_PACK_FILES ? Promise.resolve(window.BRS_PACK_FILES) : fetch("sfx/pack/index.json").then(r => r.json());
    manifest.then(list => { for (const p of list) add(p, "sfx/pack/" + p.split("/").map(encodeURIComponent).join("/")); })
      .catch(() => { loadState.failed++; }).finally(() => { loadState.done++; loadTick(); });
  }
  const packListed = new Set();   // events the pack has a file for (known from its list, before anything is decoded)
  const packKnows = ev => packListed.has(SOUND_OVERRIDE[ev]) || packListed.has(ev);
  const packHas = ev => !!(packBuf[SOUND_OVERRIDE[ev]]?.length || packBuf[ev]?.length);
  // plays the pack's sound for the event; true when the pack has one (even if it is still loading: then it stays silent
  // rather than sound like something else), false when the event isn't the pack's, so the caller plays its own
  function packPlay(ev, vol = 1, x, y) { if (!ev || !packKnows(ev)) return false; sfx(ev, vol, 1, x, y); return true; }
  // looping pack sounds in two slots: "hum" (the gun in your hands) and "beam" (the laser while it fires)
  const packLoops = {};
  function packLoop(slot, ev, vol = 0.3) {
    if (document.hidden) ev = null;
    const cur = packLoops[slot];
    if (cur && cur.ev === ev) return;
    if (cur) { try { cur.g.gain.setTargetAtTime(0, audio.currentTime, 0.04); cur.src.stop(audio.currentTime + 0.25); } catch {} delete packLoops[slot]; }
    if (!ev || !audio || !sfxBus || !packHas(ev)) return;
    const src = audio.createBufferSource(), g = audio.createGain();
    src.buffer = (packBuf[SOUND_OVERRIDE[ev]] || packBuf[ev])[0]; src.loop = true; g.gain.value = vol; src.connect(g);
    const pan = (slot.startsWith("fire:") || slot.startsWith("flight:")) && audio.createStereoPanner ? audio.createStereoPanner() : null;
    (pan ? g.connect(pan) : g).connect(slot === "engine" ? engineBus : sfxBus); src.start();
    packLoops[slot] = { ev, src, g, pan };
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) { for (const slot of Object.keys(packLoops)) packLoop(slot, null); } });
  // x, y: where it happens (quieter with distance, silent past ~2200); rate: pitch, with a little random spread
  const SOUND_OVERRIDE = { fire: "p_ut_fire", p_fire_fire: "p_ut_fire", triple: "p_user_fire", crash: "p_metal", ram: "p_metal", dash: "p_warp",
    p_fire_gamma: "p_user_demonic", p_fire_minigun: "p_ut_mini_fire",
    p_fire_rocket: "p_ut_rocket_fire", p_boom_rocket: "p_ut_rocket_boom", p_fly_rocket: "p_ut_rocket_fly", p_change: "p_ut_draw",
    p_fire_laser: "p_ut_pulse_fire", p_loop_laser: "p_ut_pulse_bolt", p_stop_laser: "p_ut_pulse_down",
    p_fire_saw: "p_ut_saw_fire", p_saw: "p_ut_saw_travel", p_fire_orb: "p_ut_shock_fire", p_fire_nuke: "p_ut_nuke_fire",
    p_fire_shard: "p_ut_flak_fire", p_boom_shard: "p_ut_flak_boom", p_boom_nuke: "p_ut_nuke_boom", p_boom_holy: "p_user_massive",
    p_boom_gamma: "p_user_demonic_explosion",
    p_death: "p_user_explosion", boom_small: "p_blast", boom_bin: "p_user_explosion", boom_big: "p_blast_heavy", chunk: "p_metal" };
  const USER_SOUND_GAIN = { p_user_fire: 0.9, p_user_demonic: 1.3, p_user_autocannon: 0.95, p_user_cannon: 0.75, p_user_explosion: 0.7, p_user_massive: 0.85, p_user_demonic_explosion: 1.7 };   // (the demonic orb: loud, it should be dreaded)
  const prioritySounds = new Set(["hit", "shield_hit", "p_kill", "p_warning", "p_noammo", "p_ready"]);
  const priorityActive = [];
  const soundPriority = name => name === "hit" || name === "shield_hit" || name === "p_kill" ? 3 : name === "p_warning" ? 2 : 1;
  const impactTimes = new Map();
  let collisionSoundAt = -Infinity;
  function sfx(name, vol = 1, rate = 1, x, y) {
    if (/^(a_|v_)/.test(name)) return queueVoice(name, vol);
    if ((name === "crash" || name === "ram") && audio) {
      if (audio.currentTime - collisionSoundAt < 0.1) return true;
      collisionSoundAt = audio.currentTime;
      rate *= name === "ram" ? 0.7 : 0.9;
    }
    const priority = prioritySounds.has(name) && x === undefined;
    if (["p_hit_bullet", "p_hit_nail", "p_hit_laser"].includes(name) && audio) {
      if (audio.currentTime - (impactTimes.get(name) ?? -Infinity) < 0.065) return true;
      impactTimes.set(name, audio.currentTime);
    }
    const replacement = packListed.has(SOUND_OVERRIDE[name]) ? SOUND_OVERRIDE[name] : undefined;
    const pk = packKnows(name) ? packBuf[replacement || name] : null, b = pk ? pk.length && pk[(Math.random() * pk.length) | 0] : sfxBuf[name], tune = pk ? null : SFX_TUNE[name];   // a pack's own sound plays as it is
    if (!audio || !b) return false;
    const userSound = packBuf[replacement]?.length && USER_SOUND_GAIN[replacement];
    if (userSound) vol *= userSound;
    const majorBlast = name === "p_boom_gamma" || name === "p_boom_nuke" || name === "p_boom_holy";
    if (x !== undefined) {
      const d = Math.hypot(x - me.x, y - me.y);
      const reach = majorBlast ? 3200 : 2200;
      if (d > reach) return true;
      vol *= majorBlast ? Math.sqrt(1 - d / reach) : 1 - d / reach;
    }
    const tail = name === "p_ut_mini_stop" || name === "p_stop_laser";
    if (priority && priorityVoices >= 8) {
      const oldest = priorityActive.slice().sort((a,b)=>soundPriority(a.name)-soundPriority(b.name))[0];
      if (!oldest || soundPriority(oldest.name) > soundPriority(name)) return true;
      oldest.retired = true; priorityActive.splice(priorityActive.indexOf(oldest),1); priorityVoices--;
      oldest.g.gain.setTargetAtTime(0,audio.currentTime,.005); oldest.src.stop(audio.currentTime+.025);
    }
    if (tail ? tailVoices >= 8 : priority ? priorityVoices >= 8 : majorBlast ? blastVoices >= 4 : sfxVoices > 28) return true;   // reserve blast voices so automatic fire cannot swallow them
    const src = audio.createBufferSource(), v = audio.createGain(), out = priority ? priorityBus : name === "p_warp" || name === "dash" ? engineBus : tune ? heavyBus : userSound ? userBus : sfxBus;
    src.buffer = b; src.playbackRate.value = rate * (tune ? tune[0] : 1) * (majorBlast || userSound || name.startsWith("p_ut_") || replacement?.startsWith("p_ut_") || name === "dash" || name === "p_warp" ? 1 : 0.94 + Math.random() * 0.12);
    v.gain.value = vol;
    src.connect(v);
    if (x !== undefined && audio.createStereoPanner) {
      const pan = audio.createStereoPanner(); pan.pan.value = Math.max(-0.85, Math.min(0.85, (x - me.x) / 1000)); v.connect(pan).connect(out);
    } else v.connect(out);
    if (tune && tune[1] && sfxBuf.boom_low && name !== "boom_low") {
      // A recorded low impact replaces the old falling sine-wave punch.
      const sub = audio.createBufferSource(), subGain = audio.createGain();
      sub.buffer = sfxBuf.boom_low; sub.playbackRate.value = 0.8;
      subGain.gain.value = vol * tune[1][2] * 0.18;
      sub.connect(subGain).connect(heavyBus); sub.start(); sub.stop(audio.currentTime + Math.min(0.5, tune[1][1]));
    }
    if (!userSound && ["boom_bin", "boom_big", "p_death"].includes(name)) {
      // Material detail trails the blast; bounded by the normal voice budget and distance attenuation.
      sfx("boom_low", vol * 0.24, 0.75, x, y);
      setTimeout(() => { if (!document.hidden) sfx("p_metal", vol * 0.22, 0.65, x, y); }, 65);
    }
    if (tail) tailVoices++; else if (priority) priorityVoices++; else if (majorBlast) blastVoices++; else sfxVoices++;
    const reserved = priority ? { name, src, g: v, retired: false } : null;
    if (reserved) priorityActive.push(reserved);
    src.onended = () => {
      if (tail) tailVoices--;
      else if (priority) { if (!reserved.retired) { priorityVoices--; priorityActive.splice(priorityActive.indexOf(reserved),1); } }
      else if (majorBlast) blastVoices--; else sfxVoices--;
    };
    src.start();
    if (["p_hit_bullet", "p_hit_nail", "p_hit_laser"].includes(name)) {
      v.gain.setValueAtTime(vol, audio.currentTime + 0.12);
      v.gain.linearRampToValueAtTime(0, audio.currentTime + 0.22); src.stop(audio.currentTime + 0.23);
    }
    return true;
  }
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
  function bladeSwing(power = 1, pan = 0, heavy = false) {
    if (!audio || !sfxBus) return;
    const t = audio.currentTime, d = heavy ? 0.5 : 0.36, pk = d * 0.42, out = bladeOut(pan), h = humVoice(heavy ? 78 : 96, out), up = heavy ? 1.9 : 1.75;
    for (const [o, m] of [[h.o1, 1], [h.o2, 1.014], [h.o3, 0.5]]) { const f0 = (heavy ? 78 : 96) * m; o.frequency.cancelScheduledValues(t); o.frequency.setValueAtTime(f0 * 0.92, t); o.frequency.exponentialRampToValueAtTime(f0 * up, t + pk); o.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + d); }
    h.lp.frequency.setValueAtTime(700, t); h.lp.frequency.exponentialRampToValueAtTime(4200, t + pk); h.lp.frequency.exponentialRampToValueAtTime(600, t + d);
    const vol = (heavy ? 0.24 : 0.19) * (0.45 + 0.55 * power);
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

