// Runs in <head>, before anything is drawn. When this tab already has a valid
// session (a page reload), the login screen must not flash while the app checks
// the account and loads: <html> gets the class "retomando", which shows a quiet
// loading screen instead (css/style.css). js/app.js removes the class the moment
// a real screen is shown (hideAllScreens). The keys are the ones js/auth.js uses.
function deveRetomarSessao(armazenamento, agora) {
  try {
    const token = armazenamento.getItem("ipanema_gis_access_token");
    const expira = Number(armazenamento.getItem("ipanema_gis_token_expires_at") || 0);
    return Boolean(token) && expira > agora + 30000;
  } catch (err) {
    return false;
  }
}

(function () {
  let armazenamento = null;
  try {
    armazenamento = window.sessionStorage;
  } catch (err) {
    armazenamento = null;
  }
  if (armazenamento && deveRetomarSessao(armazenamento, Date.now())) {
    document.documentElement.classList.add("retomando");
    // Safety net: if the app never gets to draw a screen (a script failed), do not
    // leave the person on a blank loading screen.
    setTimeout(() => document.documentElement.classList.remove("retomando"), 25000);
  }
})();

// Light/dark toggle (js/nav.js has the button + the rest of the logic; this
// tiny bit is duplicated here, not imported, because it has to run before the
// rest of the app's scripts even parse). Read directly from localStorage
// (device-wide, like the sidebar-collapsed preference) and set the attribute
// immediately, so #app-shell never flashes dark-then-light on its first paint
// — css/style.css's [data-theme="light"] block re-pins the auth screens to
// dark regardless, so setting this before login is decided is harmless.
(function () {
  try {
    if (window.localStorage.getItem("financegold_theme") === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    }
  } catch (err) {
    // convenience only
  }
})();
