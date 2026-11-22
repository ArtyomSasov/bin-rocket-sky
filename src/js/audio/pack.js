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
    p_nova: ["bfg/nova_fire.wav"],   // the Plasma Nova going off the muzzle (its own: not the pulse gun's fire)
    p_fire_mine: ["proxmine/fire.wav"], p_arm_mine: ["proxmine/actv.wav"], p_boom_mine: ["proxmine/expl.wav"], p_tick_mine: ["proxmine/tick.wav"],
    p_mine_hit: ["proxmine/impd.wav", "proxmine/impl.wav", "proxmine/impm.wav"],
    p_fire_nail: ["nailgun/wnalfire.wav"],
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
  const SOUND_OVERRIDE = { fire: "p_ut_fire", p_fire_fire: "p_ut_fire", crash: "p_metal", ram: "p_metal", dash: "p_warp",
    p_fire_gamma: "p_user_demonic", p_fire_minigun: "p_ut_mini_fire",
    p_fire_rocket: "p_ut_rocket_fire", p_boom_rocket: "p_ut_rocket_boom", p_fly_rocket: "p_ut_rocket_fly", p_change: "p_ut_draw",
    p_fire_laser: "p_ut_pulse_fire", p_loop_laser: "p_ut_pulse_bolt", p_stop_laser: "p_ut_pulse_down",
    p_fire_orb: "p_ut_shock_fire", p_fire_nuke: "p_ut_nuke_fire",
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
    if (["p_hit_bullet", "p_hit_laser"].includes(name) && audio) {
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
    if (["p_hit_bullet", "p_hit_laser"].includes(name)) {
      v.gain.setValueAtTime(vol, audio.currentTime + 0.12);
      v.gain.linearRampToValueAtTime(0, audio.currentTime + 0.22); src.stop(audio.currentTime + 0.23);
    }
    return true;
  }
