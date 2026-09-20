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
