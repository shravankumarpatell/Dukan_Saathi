// Minimal service worker for installability + basic offline fallback.
const CACHE = "dukansaathi-v5";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
);

function isApiRequest(url) {
  // Backend data (products, bills, udhari) must never be served stale from a
  // cache — an old ledger is worse than an honest "server down" message, and
  // the app shows its own retry UI for those failures.
  return /\/api\//.test(url) || /supabase\.co/.test(url);
}

self.addEventListener("fetch", (e) => {
  const url = e.request.url;
  // Never touch non-http(s) requests (blob:, data:, chrome-extension:) — intercepting
  // these breaks generated PDF blob URLs (they must open/render directly).
  if (e.request.method !== "GET" || !url.startsWith("http")) return;
  if (isApiRequest(url)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Only cache real successes: a cached 500/404 would replay the failure offline.
        if (res.ok && res.type !== "opaque") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((res) => res || Response.error()))
  );
});
