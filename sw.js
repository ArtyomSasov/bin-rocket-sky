// Bin Rocket Sky service worker: keeps the game on the device, so it opens and plays with no internet
// (offline against bots, or a local room over Wi-Fi). Built by tools/build.mjs into ./sw.js with the file
// list and a version filled in; a new build replaces the cache.
const VERSION = "f650284f8922";
const FILES = ["./","index.html","bin-rocket-sky.html","bot.png","holy.png","manifest.webmanifest","vendor/qrcode.min.js","vendor/jsQR.min.js","sfx/pack/index.json","sfx/pack/derived/laser-stop.wav","sfx/pack/derived/minigun-loop.wav","sfx/pack/derived/minigun-start.wav","sfx/pack/derived/minigun-stop.wav","sfx/pack/engine/jet-thrust.wav","sfx/pack/engine/warp-dash.wav","sfx/pack/physical/bang_04.ogg","sfx/pack/physical/bang_05.ogg","sfx/pack/physical/cannon_01.ogg","sfx/pack/physical/cannon_02.ogg","sfx/pack/physical/metal_1.wav","sfx/pack/physical/metal_10.wav","sfx/pack/physical/metal_20.wav","sfx/pack/supplemental/beep_01.ogg","sfx/pack/supplemental/beep_03.ogg","sfx/pack/supplemental/explosion_01.ogg","sfx/pack/supplemental/explosion_02.ogg","sfx/pack/supplemental/loop_ambient_01.ogg","sfx/pack/supplemental/loop_ambient_weird.ogg","sfx/pack/supplemental/loop_machine_01.ogg","sfx/pack/supplemental/loop_machine_02.ogg","sfx/pack/supplemental/rocket_01.ogg","sfx/pack/supplemental/teleport_01.ogg","sfx/pack/supplemental/teleport_02.ogg","sfx/pack/supplemental/terminal_01.ogg","sfx/pack/supplemental/terminal_02.ogg","sfx/pack/supplemental/terminal_03.ogg","sfx/pack/supplemental/terminal_05.ogg","sfx/pack/supplemental/terminal_06.ogg","sfx/pack/user/autocannon.wav","sfx/pack/user/demonic-explosions.wav","sfx/pack/user/demonic-shot-short.wav","sfx/pack/user/demonic-shot.wav","sfx/pack/user/engine-working.wav","sfx/pack/user/explosion-rumb.wav","sfx/pack/user/explosive-canon.wav","sfx/pack/user/explosive-nuke-or-holybomb.wav","sfx/pack/user/massive-explosion.wav","sfx/pack/ut/default-weapon-fire.wav","sfx/pack/ut/draw-all-weapon-sound.wav","sfx/pack/ut/fly-nuke.wav","sfx/pack/ut/minigun-altfire.wav","sfx/pack/ut/minigun-regfire.wav","sfx/pack/ut/minigun-winddown.wav","sfx/pack/ut/nuke-explode.wav","sfx/pack/ut/nuke-shot.wav","sfx/pack/ut/pick-nuke.wav","sfx/pack/ut/pulse-gun-bolt.wav","sfx/pack/ut/pulse-gun-down.wav","sfx/pack/ut/pulse-gun-explode.wav","sfx/pack/ut/pulse-gun-fire.wav","sfx/pack/ut/rocket-launcher-fire.wav","sfx/pack/ut/rocket-launcher-load.wav","sfx/pack/ut/rocket_explode.wav","sfx/pack/ut/rocket_fly.wav","sfx/pack/ut/saw-alt-fire.wav","sfx/pack/ut/saw-blade-ric.wav","sfx/pack/ut/saw-blade-travel.wav","sfx/pack/ut/saw-fire.wav","sfx/pack/ut/shard-cannon-alt-fire.wav","sfx/pack/ut/shard-cannon-fire.wav","sfx/pack/ut/shard-canon-alt-explode.wav","sfx/pack/ut/shock-orb-alt-fire.wav","sfx/pack/ut/shock-orb-combo-explode.wav","sfx/pack/ut/shock-orb-fire.wav","sfx/pack/voice/announcer_1stblood_01.mp3","sfx/pack/voice/combowhore-quake.mp3","sfx/pack/voice/dominating-quake.mp3","sfx/pack/voice/dominating_sxXRFmU.mp3","sfx/pack/voice/fight.mp3","sfx/pack/voice/flagcap.mp3","sfx/pack/voice/flagtaken_yourteam_2.mp3","sfx/pack/voice/flawless-victory-mk-x.mp3","sfx/pack/voice/godlike-quake.mp3","sfx/pack/voice/headshot-quake.mp3","sfx/pack/voice/holyshit.mp3","sfx/pack/voice/humiliation.mp3","sfx/pack/voice/impressive-quake-iii-arena-announcer.mp3","sfx/pack/voice/impressive-quake.mp3","sfx/pack/voice/killingspree-quake.mp3","sfx/pack/voice/ludicrouskill-quake.mp3","sfx/pack/voice/monsterkill-quake.mp3","sfx/pack/voice/multikill-quake.mp3","sfx/pack/voice/prepare-quake.mp3","sfx/pack/voice/quake-doublekill.mp3","sfx/pack/voice/quake3quad_ysa9nit5.mp3","sfx/pack/voice/rampage-quake.mp3","sfx/pack/voice/triplekill-quake.mp3","sfx/pack/voice/ultrakill-quake.mp3","sfx/pack/voice/warlord/capture_the_flag.wav","sfx/pack/voice/warlord/deathmatch.wav","sfx/pack/voice/warlord/mission_failed.wav","sfx/pack/voice/warlord/round_winner.wav","sfx/pack/voice/warlord/team_deathmatch.wav","sfx/pack/voice/warlord/unstoppable.wav","sfx/pack/voice/wickedsick-quake.mp3","sfx/pack/weapons/bfg/bfg_fire.wav","sfx/pack/weapons/bfg/bfg_hum.wav","sfx/pack/weapons/chaingun/f1b.wav","sfx/pack/weapons/chaingun/f2b.wav","sfx/pack/weapons/chaingun/f3b.wav","sfx/pack/weapons/chaingun/f4b.wav","sfx/pack/weapons/chaingun/fire.wav","sfx/pack/weapons/chaingun/impd.wav","sfx/pack/weapons/chaingun/impl.wav","sfx/pack/weapons/chaingun/impm.wav","sfx/pack/weapons/chaingun/wind.wav","sfx/pack/weapons/change.wav","sfx/pack/weapons/grenade/grenlf1a.wav","sfx/pack/weapons/grenade/hgrenb1a.wav","sfx/pack/weapons/grenade/hgrenb2a.wav","sfx/pack/weapons/holy/holy-bomb.mp3","sfx/pack/weapons/lightning/lg_fire_loop.wav","sfx/pack/weapons/lightning/lg_fire_start.wav","sfx/pack/weapons/lightning/lg_hit.wav","sfx/pack/weapons/lightning/lg_hit2.wav","sfx/pack/weapons/lightning/lg_hit3.wav","sfx/pack/weapons/lightning/lg_hum.wav","sfx/pack/weapons/machinegun/buletby1.wav","sfx/pack/weapons/machinegun/fire1.wav","sfx/pack/weapons/machinegun/fire2.wav","sfx/pack/weapons/machinegun/fire3.wav","sfx/pack/weapons/machinegun/fire4.wav","sfx/pack/weapons/machinegun/ric1.wav","sfx/pack/weapons/machinegun/ric2.wav","sfx/pack/weapons/machinegun/ric3.wav","sfx/pack/weapons/melee/fstatck.wav","sfx/pack/weapons/melee/fstrun.wav","sfx/pack/weapons/nailgun/wnalfire.wav","sfx/pack/weapons/nailgun/wnalflit.wav","sfx/pack/weapons/nailgun/wnalimpd.wav","sfx/pack/weapons/nailgun/wnalimpl.wav","sfx/pack/weapons/nailgun/wnalimpm.wav","sfx/pack/weapons/noammo.wav","sfx/pack/weapons/plasma/hyprbf1a.wav","sfx/pack/weapons/plasma/lasfly.wav","sfx/pack/weapons/plasma/plasmx1a.wav","sfx/pack/weapons/proxmine/actv.wav","sfx/pack/weapons/proxmine/expl.wav","sfx/pack/weapons/proxmine/fire.wav","sfx/pack/weapons/proxmine/impd.wav","sfx/pack/weapons/proxmine/impl.wav","sfx/pack/weapons/proxmine/impm.wav","sfx/pack/weapons/proxmine/tick.wav","sfx/pack/weapons/railgun/railgf1a.wav","sfx/pack/weapons/railgun/rg_hum.wav","sfx/pack/weapons/rocket/rockfly.wav","sfx/pack/weapons/rocket/rocklf1a.wav","sfx/pack/weapons/rocket/rocklx1a.wav","sfx/pack/weapons/shotgun/sshotf1b.wav","sfx/pack/weapons/weapon_hover.wav","sfx/boom_big.wav","sfx/boom_bin.wav","sfx/boom_low.wav","sfx/boom_small.wav","sfx/chunk.wav","sfx/crash.wav","sfx/dash.wav","sfx/fire.wav","sfx/heal.wav","sfx/hit.wav","sfx/laser.wav","sfx/level_up.wav","sfx/mine_drop.wav","sfx/pump.wav","sfx/rail.mp3","sfx/ram.wav","sfx/rocket.wav","sfx/scatter.wav","sfx/shield_get.wav","sfx/shield_hit.wav","sfx/triple.wav","sfx/v_fight.wav","sfx/v_flawless.wav","sfx/v_levelup.wav","sfx/v_lose.wav","sfx/v_multikill.wav","sfx/v_powerup.wav","sfx/v_prepare.wav","sfx/v_win.wav","sfx/weapon_get.wav"];
// Keep caches separate from other games hosted on the same GitHub Pages origin.
const PREFIX = "brs-" + self.registration.scope + "-";
const CACHE = PREFIX + VERSION;
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(FILES);
    self.skipWaiting();
  })());
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  const same = url.origin === self.location.origin;
  const cacheKey = same ? url.origin + url.pathname : req;
  const isGamePage = same && (url.href.split("?")[0] === self.registration.scope || url.pathname === new URL("index.html", self.registration.scope).pathname);
  // the page itself: the newest from the network when there is one, else the saved copy
  if (req.mode === "navigate" || (same && /\/(index\.html)?$/.test(url.pathname))) {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) await (await caches.open(CACHE)).put(cacheKey, r.clone());
        return r;
      } catch {
        const c = await caches.open(CACHE);
        return (await c.match(cacheKey)) || (isGamePage && await c.match(new URL("index.html", self.registration.scope).href)) || Response.error();
      }
    })());
    return;
  }
  // sounds, the sprite, the QR libraries and fonts: the saved copy first
  if (same || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(cacheKey);
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r.ok || r.type === "opaque") await c.put(cacheKey, r.clone());
        return r;
      } catch { return Response.error(); }
    })());
  }
});
