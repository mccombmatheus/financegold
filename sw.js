const CACHE_NAME = "financegold-shell-v7";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/config.js",
  "./js/tenants.js",
  "./js/auth.js",
  "./js/sheets.js",
  "./js/lancamentos.js",
  "./js/lookups.js",
  "./js/roles.js",
  "./js/usuarios.js",
  "./js/usuarios-admin.js",
  "./js/dashboard-data.js",
  "./js/charts.js",
  "./js/dashboard.js",
  "./js/lancamento-lista.js",
  "./js/offline.js",
  "./js/form.js",
  "./js/sw-register.js",
  "./js/estoque.js",
  "./js/estoque-ui.js",
  "./js/export.js",
  "./js/command-palette.js",
  "./js/nav.js",
  "./js/app.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

// Only ever intercepts same-origin requests (the app's own files). API calls
// to googleapis.com / accounts.google.com pass straight through to the
// network untouched — they need to be live and authenticated, never cached.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        // A same-origin request with no cache entry (e.g. the browser's
        // automatic /favicon.ico probe) and a failed network fetch used to
        // resolve to `undefined` here, which respondWith() can't turn into a
        // Response and crashes the whole fetch with "Failed to convert value
        // to 'Response'". Always resolve to a real Response.
        .catch(() => cached || new Response("", { status: 504, statusText: "Offline" }));
      return cached || networkFetch;
    })
  );
});
