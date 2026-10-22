const CACHE_NAME = "__MMF_CACHE_NAME__";
const PRECACHE_URLS = [];
const CACHE_PREFIX = "mmf-studio-shell-";
const ASSETS = new Set(PRECACHE_URLS.filter((url) => url !== "/"));

async function prepareOffline() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(
    PRECACHE_URLS.map((url) => new Request(url, { cache: "reload", credentials: "same-origin" })),
  );
}

async function isReady() {
  const cache = await caches.open(CACHE_NAME);
  const responses = await Promise.all(PRECACHE_URLS.map((url) => cache.match(url)));
  return responses.length > 0 && responses.every(Boolean);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const existing = (await caches.keys()).includes(CACHE_NAME);
      try {
        await prepareOffline();
      } catch (error) {
        if (!existing) await caches.delete(CACHE_NAME);
        throw error;
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const versions = (await caches.keys()).filter(
        (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME,
      );
      // Retain the preceding shell for deferred chunks in another still-open tab.
      await Promise.all(versions.slice(0, -1).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (!event.source || new URL(event.source.url).origin !== self.location.origin) return;
  const message = event.data;
  if (message?.type === "ACTIVATE_UPDATE") {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (message?.type !== "OFFLINE_STATUS" && message?.type !== "PREPARE_OFFLINE") return;
  event.waitUntil(
    (async () => {
      try {
        if (message.type === "PREPARE_OFFLINE") await prepareOffline();
        event.ports[0]?.postMessage({ ready: await isReady(), version: CACHE_NAME });
      } catch {
        event.ports[0]?.postMessage({ ready: false, version: CACHE_NAME });
      }
    })(),
  );
});

async function cachedAsset(request) {
  const pathname = new URL(request.url).pathname;
  const current = await caches.open(CACHE_NAME);
  const hit = await current.match(pathname);
  if (hit) return hit;
  if (pathname.startsWith("/_next/static/")) {
    const versions = (await caches.keys()).filter(
      (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME,
    );
    for (const version of versions.reverse()) {
      const previous = await (await caches.open(version)).match(pathname);
      if (previous) return previous;
    }
  }
  return fetch(request);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate" && url.pathname === "/") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) return response;
        } catch {
          // The immutable cached shell is only replaced by a complete new worker install.
        }
        const cache = await caches.open(CACHE_NAME);
        return (
          (await cache.match(PRECACHE_URLS[0])) ??
          new Response(
            "MMF Studio is not ready offline. Connect and reopen the app to finish setup.",
            {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            },
          )
        );
      })(),
    );
  } else if (ASSETS.has(url.pathname) || url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cachedAsset(request));
  }
});
