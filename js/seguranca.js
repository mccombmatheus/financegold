// Clickjacking guard. A <meta> CSP cannot carry frame-ancestors (and GitHub Pages
// sends no headers), so another site could otherwise show this app in an
// invisible frame and trick someone into clicking. When the page is framed by a
// DIFFERENT origin, it hides itself. Same-origin framing is left alone.
function estaEmquadradoPorOutraOrigem(janela) {
  try {
    if (janela.top === janela.self) return false;
    // reading the parent's origin throws when it is a different origin
    return janela.top.location.origin !== janela.location.origin;
  } catch (err) {
    return true;
  }
}

if (estaEmquadradoPorOutraOrigem(window)) {
  document.documentElement.style.display = "none";
}
