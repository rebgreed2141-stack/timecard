const CACHE_NAME = "timecard-v3";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./styles.css",
  "./staff_m.json",
  "./staff_y.json",
  "./manifest.json",
  "./version.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-1024.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;

  if (!isSameOrigin) return;

  if (requestUrl.pathname.endsWith("/version.json")) {
    event.respondWith(fetchVersionJson(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const clonedResponse = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clonedResponse));
        }
        return networkResponse;
      });
    })
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (data.type === "GET_VERSION") {
    event.waitUntil(
      getCachedVersion().then((version) => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ version });
        }
      })
    );
  }
});

async function fetchVersionJson(request) {
  try {
    const networkResponse = await fetch(request, { cache: "no-store" });

    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put("./version.json", networkResponse.clone());
      return networkResponse;
    }
  } catch (error) {
  }

  const cachedResponse = await caches.match("./version.json");
  if (cachedResponse) return cachedResponse;

  return new Response('{"version":""}', {
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

async function getCachedVersion() {
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match("./version.json");
  if (!response) return "";

  try {
    const data = await response.json();
    return String(data && data.version ? data.version : "").trim();
  } catch (error) {
    return "";
  }
}
