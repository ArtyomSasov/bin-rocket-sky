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
  // Dedicated sci-fi thrust loop; no rocket-flight loop or oscillators.
  function engineHum(speed, thrust, boost, now, active = true) {
    if (!audio || !sfxBus) return;
    const power = Math.max(0, Math.min(1, thrust)), afterburner = Math.max(0, Math.min(1, boost));
    const on = active && !document.hidden && settings.engine !== "off" && (speed > 4 || power > 0.03);
    packLoop("engine", on && packHas("p_ship_engine") ? "p_ship_engine" : null, 0);
    const loop = packLoops.engine;
    if (!loop) return;
    // A restrained pitch range preserves the identity of the supplied recording.
    const pitch = 0.96 + Math.min(0.08, speed / 9000) + power * 0.04 + afterburner * 0.08;
    const volume = 0.065 + power * 0.36 + afterburner * 0.16;
    loop.src.playbackRate.setTargetAtTime(pitch, audio.currentTime, 0.18);
    loop.g.gain.setTargetAtTime(volume, audio.currentTime, 0.08);
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
    // the one-file game carries its sounds inside (window.BRS_SFX, data: URLs); the page fetches them from sfx/
    for (const n of SFX_NAMES) fetch((window.BRS_SFX && window.BRS_SFX[n]) || "sfx/" + n + (SFX_MP3.has(n) ? ".mp3" : ".wav")).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
      .then(b => audio.decodeAudioData(b)).then(b => { sfxBuf[n] = b; }).catch(() => {});   // missing file: the synth sound stays
    loadPack();
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
    p_user_engine: ["user/engine-working.wav"], p_ship_engine: ["engine/jet-thrust.wav"], p_warp: ["engine/warp-dash.wav"], p_user_demonic_explosion: ["user/demonic-explosions.wav"],
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
  function loadPack() {
    const add = (path, src) => {
      const ev = packEventFor(path);
      if (ev) fetch(src).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status)).then(b => audio.decodeAudioData(b)).then(b => { (packBuf[ev] = packBuf[ev] || []).push(b); }).catch(() => {});
    };
    if (window.BRS_PACK) { for (const [p, d] of Object.entries(window.BRS_PACK)) add(p, d); return; }
    const manifest = window.BRS_PACK_FILES ? Promise.resolve(window.BRS_PACK_FILES) : fetch("sfx/pack/index.json").then(r => r.json());
    manifest.then(list => { for (const p of list) add(p, "sfx/pack/" + p.split("/").map(encodeURIComponent).join("/")); }).catch(() => {});
  }
  const packHas = ev => !!(packBuf[SOUND_OVERRIDE[ev]]?.length || packBuf[ev]?.length);
  function packPlay(ev, vol = 1, x, y) { return ev && packHas(ev) ? sfx(ev, vol, 1, x, y) : false; }
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
  const USER_SOUND_GAIN = { p_user_fire: 0.9, p_user_demonic: 0.85, p_user_autocannon: 0.95, p_user_cannon: 0.75, p_user_explosion: 0.7, p_user_massive: 0.85, p_user_demonic_explosion: 1.15 };
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
    const replacement = SOUND_OVERRIDE[name];
    const pk = packBuf[replacement] || packBuf[name], b = pk && pk.length ? pk[(Math.random() * pk.length) | 0] : sfxBuf[name], tune = pk && pk.length ? null : SFX_TUNE[name];   // a pack's own sound plays as it is
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
  // ---------- the energy blade's voice, made here (no recording): a low buzzing hum, a swing's rising whoosh, a clash ----------
  // a hum while it is wound up (held), lower when barely, rising as the wind-up fills
  let bladeHum = null;
  function bladeHumSet(level) {
    if (!audio || !sfxBus) return;
    if (level <= 0) { if (bladeHum) { const h = bladeHum; bladeHum = null; h.v.gain.setTargetAtTime(0, audio.currentTime, 0.04); setTimeout(() => { try { h.o1.stop(); h.o2.stop(); } catch {} }, 300); } return; }
    if (!bladeHum) {
      const o1 = audio.createOscillator(), o2 = audio.createOscillator(), f = audio.createBiquadFilter(), v = audio.createGain();
      o1.type = "sawtooth"; o2.type = "sawtooth"; o1.frequency.value = 88; o2.frequency.value = 90.5; f.type = "lowpass"; f.frequency.value = 600; v.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(v).connect(sfxBus); o1.start(); o2.start();
      bladeHum = { o1, o2, f, v };
    }
    const t = audio.currentTime;
    bladeHum.v.gain.setTargetAtTime(0.05 + 0.07 * level, t, 0.03); bladeHum.f.frequency.setTargetAtTime(500 + 1400 * level, t, 0.05);
    bladeHum.o1.frequency.setTargetAtTime(88 + 30 * level, t, 0.05); bladeHum.o2.frequency.setTargetAtTime(90.5 + 31 * level, t, 0.05);
  }
  // the swing: a buzzing tone sweeping up and back down with a rush of air, louder for a fuller swing
  function bladeSwing(power = 1, pan = 0) {
    if (!audio || !sfxBus) return;
    const t = audio.currentTime, d = 0.38, o = audio.createOscillator(), o2 = audio.createOscillator(), f = audio.createBiquadFilter(), v = audio.createGain(), p = audio.createStereoPanner ? audio.createStereoPanner() : null;
    o.type = "sawtooth"; o2.type = "square";
    o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(240, t + d * 0.45); o.frequency.exponentialRampToValueAtTime(110, t + d);
    o2.frequency.setValueAtTime(97, t); o2.frequency.exponentialRampToValueAtTime(250, t + d * 0.45); o2.frequency.exponentialRampToValueAtTime(112, t + d);
    f.type = "bandpass"; f.Q.value = 1.2; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(2600, t + d * 0.45); f.frequency.exponentialRampToValueAtTime(700, t + d);
    v.gain.setValueAtTime(0.001, t); v.gain.exponentialRampToValueAtTime(0.16 * (0.5 + power * 0.5), t + d * 0.35); v.gain.exponentialRampToValueAtTime(0.001, t + d);
    const n = audio.createBufferSource(), nb = audio.createBuffer(1, audio.sampleRate * d | 0, audio.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / nd.length);
    n.buffer = nb; const nf = audio.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 1800; nf.Q.value = 0.8; const nv = audio.createGain(); nv.gain.value = 0.12 * power;
    if (p) { p.pan.value = clamp(pan, -1, 1); v.connect(p).connect(sfxBus); nv.connect(p); } else { v.connect(sfxBus); nv.connect(sfxBus); }
    o.connect(f); o2.connect(f); f.connect(v); n.connect(nf).connect(nv);
    o.start(t); o2.start(t); n.start(t); o.stop(t + d); o2.stop(t + d);
  }
  // the clash: the blade biting into something, a sharp crackling burst
  function bladeClash(pan = 0) {
    if (!audio || !sfxBus) return;
    const t = audio.currentTime, d = 0.22, n = audio.createBufferSource(), b = audio.createBuffer(1, audio.sampleRate * d | 0, audio.sampleRate), x = b.getChannelData(0);
    for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 3) * (Math.random() < 0.2 ? 1 : 0.4);
    n.buffer = b; const f = audio.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 1500; const v = audio.createGain(); v.gain.value = 0.3;
    const o = audio.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(620, t); o.frequency.exponentialRampToValueAtTime(180, t + d); const ov = audio.createGain(); ov.gain.setValueAtTime(0.12, t); ov.gain.exponentialRampToValueAtTime(0.001, t + d);
    n.connect(f).connect(v).connect(sfxBus); o.connect(ov).connect(sfxBus); n.start(t); o.start(t); o.stop(t + d);
  }
  function blip(f, dur, type) {
    if (!audio) return;
    const o = audio.createOscillator(), v = audio.createGain(), t = audio.currentTime;
    o.type = type || "triangle";
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.9, t + dur);
    v.gain.setValueAtTime(0.12, t); v.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(v).connect(audio.destination); o.start(t); o.stop(t + dur);
  }

