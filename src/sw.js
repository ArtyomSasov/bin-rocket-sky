// Bin Rocket Sky service worker: keeps the game on the device, so it opens and plays with no internet
// (offline against bots, or a local room over Wi-Fi). Built by tools/build.mjs into ./sw.js with the file
// list and a version filled in; a new build replaces the cache.
const VERSION = "__VERSION__";
const FILES = __FILES__;
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
