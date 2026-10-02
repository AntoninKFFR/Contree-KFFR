/* Network-only application. The sole cache entry is a public, data-free offline screen. */
const OFFLINE_CACHE = "kffr-offline-v1-4d484406e35f9206";
const OFFLINE_DOCUMENT = "/pwa-offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const response = await fetch(OFFLINE_DOCUMENT, { cache: "reload", credentials: "omit" });
    if (!response.ok) throw new Error("Offline screen unavailable");
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.put(OFFLINE_DOCUMENT, response);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("kffr-offline-") && key !== OFFLINE_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // API, auth XHR, Supabase, RSC, assets and all writes bypass the worker entirely.
  if (request.method !== "GET" || request.mode !== "navigate" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith((async () => {
    try {
      return await fetch(request); // No application response is ever put in a cache.
    } catch {
      const fallback = await caches.match(OFFLINE_DOCUMENT, { cacheName: OFFLINE_CACHE });
      return fallback ?? new Response("Connexion nécessaire", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});
