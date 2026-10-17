/**
 * oobee bets service worker.
 *
 * Deliberately conservative. Picks and stats are money-sensitive and time-
 * sensitive, and every page is someone's own — their feed, their ticks. So:
 *
 *   - pages               -> always the network; offline, the /offline page.
 *                            Never cached: an old copy would show a stale
 *                            board, or on a shared phone the last person's
 *                            feed after they signed out.
 *   - static build assets -> cache-first (they are content-hashed, so safe)
 *   - everything else     -> not touched
 *
 * A new worker waits rather than taking over mid-session: the page offers
 * "Reload" (components/pwa/service-worker.tsx) and the worker steps in when
 * that is pressed — or once every tab has closed.
 *
 * Bump CACHE_VERSION to invalidate everything on the next deploy.
 */

const CACHE_VERSION = "v1";
const STATIC_CACHE = `oobee-static-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      // Everything but the static cache — including the page cache earlier
      // workers kept, which held people's own pages.
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Server actions are POSTs; never touch them.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Content-hashed build output: safe to cache forever.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            // Not a 404 for a chunk an old tab asked for after a deploy.
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Pages: the network, and only when that fails, the offline page.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});

/** The page's "Reload": the waiting worker takes over now. */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
