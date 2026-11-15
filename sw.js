// Bin Rocket Sky service worker: keeps the game on the device, so it opens and plays with no internet
// (offline against bots, or a local room over Wi-Fi). Built by tools/build.mjs into ./sw.js with the file
// list and a version filled in; a new build replaces the cache.
const VERSION = "504873218715";
const FILES = ["./","index.html","bin-rocket-sky.html","bot.png","holy.png","manifest.webmanifest","sfx/pack/index.json","sfx/pack/voice/combowhore-quake.mp3","sfx/pack/voice/dominating-quake.mp3","sfx/pack/voice/dominating_sxXRFmU.mp3","sfx/pack/voice/fight.mp3","sfx/pack/voice/flagcap.mp3","sfx/pack/voice/flagtaken_yourteam_2.mp3","sfx/pack/voice/godlike-quake.mp3","sfx/pack/voice/headshot-quake.mp3","sfx/pack/voice/holyshit.mp3","sfx/pack/voice/humiliation.mp3","sfx/pack/voice/impressive-quake-iii-arena-announcer.mp3","sfx/pack/voice/impressive-quake.mp3","sfx/pack/voice/killingspree-quake.mp3","sfx/pack/voice/ludicrouskill-quake.mp3","sfx/pack/voice/monsterkill-quake.mp3","sfx/pack/voice/multikill-quake.mp3","sfx/pack/voice/prepare-quake.mp3","sfx/pack/voice/quake-doublekill.mp3","sfx/pack/voice/quake3quad_ysa9nit5.mp3","sfx/pack/voice/rampage-quake.mp3","sfx/pack/voice/triplekill-quake.mp3","sfx/pack/voice/ultrakill-quake.mp3","sfx/pack/voice/wickedsick-quake.mp3","sfx/pack/weapons/bfg/bfg_fire.wav","sfx/pack/weapons/bfg/bfg_hum.wav","sfx/pack/weapons/chaingun/f1b.wav","sfx/pack/weapons/chaingun/f2b.wav","sfx/pack/weapons/chaingun/f3b.wav","sfx/pack/weapons/chaingun/f4b.wav","sfx/pack/weapons/chaingun/fire.wav","sfx/pack/weapons/chaingun/impd.wav","sfx/pack/weapons/chaingun/impl.wav","sfx/pack/weapons/chaingun/impm.wav","sfx/pack/weapons/chaingun/wind.wav","sfx/pack/weapons/change.wav","sfx/pack/weapons/grenade/grenlf1a.wav","sfx/pack/weapons/grenade/hgrenb1a.wav","sfx/pack/weapons/grenade/hgrenb2a.wav","sfx/pack/weapons/holy/holy-bomb.mp3","sfx/pack/weapons/lightning/lg_fire_loop.wav","sfx/pack/weapons/lightning/lg_fire_start.wav","sfx/pack/weapons/lightning/lg_hit.wav","sfx/pack/weapons/lightning/lg_hit2.wav","sfx/pack/weapons/lightning/lg_hit3.wav","sfx/pack/weapons/lightning/lg_hum.wav","sfx/pack/weapons/machinegun/buletby1.wav","sfx/pack/weapons/machinegun/fire1.wav","sfx/pack/weapons/machinegun/fire2.wav","sfx/pack/weapons/machinegun/fire3.wav","sfx/pack/weapons/machinegun/fire4.wav","sfx/pack/weapons/machinegun/ric1.wav","sfx/pack/weapons/machinegun/ric2.wav","sfx/pack/weapons/machinegun/ric3.wav","sfx/pack/weapons/melee/fstatck.wav","sfx/pack/weapons/melee/fstrun.wav","sfx/pack/weapons/nailgun/wnalfire.wav","sfx/pack/weapons/nailgun/wnalflit.wav","sfx/pack/weapons/nailgun/wnalimpd.wav","sfx/pack/weapons/nailgun/wnalimpl.wav","sfx/pack/weapons/nailgun/wnalimpm.wav","sfx/pack/weapons/noammo.wav","sfx/pack/weapons/plasma/hyprbf1a.wav","sfx/pack/weapons/plasma/lasfly.wav","sfx/pack/weapons/plasma/plasmx1a.wav","sfx/pack/weapons/proxmine/actv.wav","sfx/pack/weapons/proxmine/expl.wav","sfx/pack/weapons/proxmine/fire.wav","sfx/pack/weapons/proxmine/impd.wav","sfx/pack/weapons/proxmine/impl.wav","sfx/pack/weapons/proxmine/impm.wav","sfx/pack/weapons/proxmine/tick.wav","sfx/pack/weapons/railgun/railgf1a.wav","sfx/pack/weapons/railgun/rg_hum.wav","sfx/pack/weapons/rocket/rockfly.wav","sfx/pack/weapons/rocket/rocklf1a.wav","sfx/pack/weapons/rocket/rocklx1a.wav","sfx/pack/weapons/shotgun/sshotf1b.wav","sfx/pack/weapons/weapon_hover.wav","sfx/boom_big.wav","sfx/boom_bin.wav","sfx/boom_low.wav","sfx/boom_small.wav","sfx/chunk.wav","sfx/crash.wav","sfx/dash.wav","sfx/fire.wav","sfx/heal.wav","sfx/hit.wav","sfx/laser.wav","sfx/level_up.wav","sfx/mine_drop.wav","sfx/pump.wav","sfx/rail.mp3","sfx/ram.wav","sfx/rocket.wav","sfx/scatter.wav","sfx/shield_get.wav","sfx/shield_hit.wav","sfx/triple.wav","sfx/v_fight.wav","sfx/v_flawless.wav","sfx/v_levelup.wav","sfx/v_lose.wav","sfx/v_multikill.wav","sfx/v_powerup.wav","sfx/v_prepare.wav","sfx/v_win.wav","sfx/weapon_get.wav"];
// libraries the local room loads (QR codes); the multiplayer library is never cached, so the game can tell it is offline
const LIBS = ["https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js", "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js"];
const CACHE = "brs-" + VERSION;
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(FILES);
    await Promise.all(LIBS.map(u => fetch(u, { mode: "cors" }).then(r => r.ok && c.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("brs-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  const same = url.origin === self.location.origin;
  // the page itself: the newest from the network when there is one, else the saved copy
  if (req.mode === "navigate" || (same && /\/(index\.html)?$/.test(url.pathname))) {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) (await caches.open(CACHE)).put(same ? url.pathname.replace(/[^/]*$/, "") + "index.html" : req, r.clone());
        return r;
      } catch {
        return (await caches.match(req, { ignoreSearch: true })) || (await caches.match(new URL("index.html", self.registration.scope).href)) || Response.error();
      }
    })());
    return;
  }
  // sounds, the sprite, the QR libraries and fonts: the saved copy first
  if (same || LIBS.includes(req.url) || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: same });
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r.ok || r.type === "opaque") (await caches.open(CACHE)).put(req, r.clone());
        return r;
      } catch { return Response.error(); }
    })());
  }
});
