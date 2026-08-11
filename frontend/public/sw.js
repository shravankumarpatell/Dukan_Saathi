// Minimal service worker for installability + basic offline fallback.
const CACHE = "dukansaathi-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const url = e.request.url;
  // Never touch non-http(s) requests (blob:, data:, chrome-extension:) — intercepting
  // these breaks generated PDF blob URLs (they must open/render directly).
  if (e.request.method !== "GET" || !url.startsWith("http")) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((res) => res || Response.error()))
    );
});
