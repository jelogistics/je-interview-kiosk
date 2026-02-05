/* JE Interview Kiosk - Service Worker
 * - Cache-first for app shell (offline ready)
 * - Network-first for GAS content (fresh data), fallback to cache
 */

const CACHE_VERSION = "je-kiosk-v1";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// App shell files to cache for offline install/launch
const APP_SHELL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/hero.mp4",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL_CACHE);
    await cache.addAll(APP_SHELL_FILES);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => {
        if (!k.startsWith(CACHE_VERSION)) return caches.delete(k);
      })
    );
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET
  if (req.method !== "GET") return;

  // If request is to Apps Script (content API), use network-first
  // (GAS is cross-origin; caching still works for same-origin? We'll cache as runtime when possible.)
  if (isAppsScript_(url)) {
    event.respondWith(networkFirst_(req));
    return;
  }

  // For same-origin app assets, use cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst_(req));
    return;
  }

  // Default: try network, fallback to cache
  event.respondWith(networkFirst_(req));
});

function isAppsScript_(url) {
  // Your GAS URL is like https://script.google.com/macros/s/.../exec
  return url.hostname === "script.google.com" || url.hostname.endsWith(".googleusercontent.com");
}

async function cacheFirst_(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const res = await fetch(request);
  const cache = await caches.open(RUNTIME_CACHE);
  cache.put(request, res.clone());
  return res;
}

async function networkFirst_(request) {
  try {
    const res = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, res.clone());
    return res;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // If navigation fails and no cache, show the cached index if possible
    if (request.mode === "navigate") {
      const fallback = await caches.match("./index.html");
      if (fallback) return fallback;
    }
    throw e;
  }
}
