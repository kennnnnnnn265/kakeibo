// KAKEIBO Service Worker：画面の部品だけ端末に控えておく（データは保存しない）
const CACHE = "kakeibo-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co") || url.hostname.endsWith("supabase.in")) return;
  if (url.origin !== location.origin && !url.hostname.includes("fonts.g")) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req.mode === "navigate" ? "./" : req, res.clone());
      return res;
    } catch {
      return (await cache.match(req.mode === "navigate" ? "./" : req)) || Response.error();
    }
  })());
});
