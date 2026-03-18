const CACHE_NAME = "timecard-v1";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./styles.css",
  "./staff.json",
  "./manifest.json",
  "./jszip.min.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});