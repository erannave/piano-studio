const STATIC_CACHE = "piano-studio-static-v2";
const CATALOG_CACHE = "piano-studio-catalog-v2";
const PAGES_CACHE = "piano-studio-pages-v2";
const ALLOWED_CACHES = new Set([STATIC_CACHE, CATALOG_CACHE, PAGES_CACHE]);
const MAX_STATIC_ENTRIES = 120;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !ALLOWED_CACHES.has(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

async function putBounded(cacheName, request, response, maxEntries) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  if (maxEntries) {
    const keys = await cache.keys();
    if (keys.length > maxEntries) {
      await Promise.all(keys.slice(0, keys.length - maxEntries).map((k) => cache.delete(k)));
    }
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_bun/")) return;

  // 1. Song Catalog API: StaleWhileRevalidate for instant tablet startup + background refresh
  if (url.pathname === "/api/songs") {
    event.respondWith(
      caches.open(CATALOG_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((response) => {
            if (response.ok && response.type === "basic") {
              cache.put(request, response.clone()).catch(() => {});
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkPromise;
      }),
    );
    return;
  }

  // Never cache other API endpoints (profile, calibration)
  if (url.pathname.startsWith("/api/")) return;

  // 2. HTML Navigations: NetworkFirst so users always get the latest shell
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            putBounded(PAGES_CACHE, request, response.clone(), 4).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // 3. Static Assets (JS/CSS chunks, fonts, icons, MIDI files): CacheFirst with bounded size
  const isStaticAsset =
    ["style", "script", "font", "image"].includes(request.destination) ||
    url.pathname.startsWith("/songs/") ||
    url.pathname.startsWith("/icons/");

  if (isStaticAsset) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok && response.type === "basic") {
          putBounded(STATIC_CACHE, request, response.clone(), MAX_STATIC_ENTRIES).catch(() => {});
        }
        return response;
      }),
    );
    return;
  }

  // Fallback: NetworkFirst for any other same-origin GET
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          putBounded(PAGES_CACHE, request, response.clone(), 20).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
