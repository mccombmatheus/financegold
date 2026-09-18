const CACHE_NAME = "financegold-shell-v4";
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
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
