// Bin Rocket Sky service worker: keeps the game on the device, so it opens and plays with no internet
// (offline against bots, or a local room over Wi-Fi). Built by tools/build.mjs into ./sw.js with the file
// list and a version filled in; a new build replaces the cache.
const VERSION = "9edb8bd12773";
const FILES = ["./","index.html","bin-rocket-sky.html","bot.png","manifest.webmanifest","sfx/boom_big.wav","sfx/boom_bin.wav","sfx/boom_low.wav","sfx/boom_small.wav","sfx/chunk.wav","sfx/crash.wav","sfx/dash.wav","sfx/fire.wav","sfx/heal.wav","sfx/hit.wav","sfx/laser.wav","sfx/level_up.wav","sfx/mine_drop.wav","sfx/pump.wav","sfx/rail.mp3","sfx/ram.wav","sfx/rocket.wav","sfx/scatter.wav","sfx/shield_get.wav","sfx/shield_hit.wav","sfx/triple.wav","sfx/v_fight.wav","sfx/v_flawless.wav","sfx/v_levelup.wav","sfx/v_lose.wav","sfx/v_multikill.wav","sfx/v_powerup.wav","sfx/v_prepare.wav","sfx/v_win.wav","sfx/weapon_get.wav"];
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
