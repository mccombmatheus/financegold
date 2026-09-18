if ("serviceWorker" in navigator) {
  // A page controlled by an older service worker may have loaded stale files.
  // When a new worker takes over, reload once so the user lands on the fresh
  // version right away instead of on the next visit. Skipped on the very first
  // install (no previous controller), where there is nothing stale to replace.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.error("Falha ao registrar service worker:", err);
    });
  });
}
