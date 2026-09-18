const VIEW_TITLES = {
  dashboard: "Dashboard financeiro",
  "lancamento-lista": "Fluxo de Caixa",
  "lancamento-form": "Novo lançamento",
  "estoque-lista": "Estoque",
  "estoque-form": "Nova peça",
  ajustes: "Ajustes",
};

const VIEW_GROUPS = {
  "lancamento-lista": "lancamento",
  "lancamento-form": "lancamento",
  "estoque-lista": "estoque",
  "estoque-form": "estoque",
};

const SIDEBAR_COLLAPSED_KEY = "financegold_sidebar_collapsed";

function setActiveView(view) {
  document.querySelectorAll(".nav-item[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  document.querySelectorAll(".nav-group-toggle").forEach((btn) => {
    btn.classList.toggle("active", VIEW_GROUPS[view] === btn.dataset.group);
  });
  document.querySelectorAll(".view-section").forEach((section) => {
    section.hidden = section.dataset.view !== view;
  });
  const topbarTitle = document.querySelector(".app-topbar h2");
  if (topbarTitle) topbarTitle.textContent = VIEW_TITLES[view] || "";

  const group = VIEW_GROUPS[view];
  if (group) openSubmenu(group);
}

function openSubmenu(group) {
  const submenu = document.getElementById(`submenu-${group}`);
  if (submenu) submenu.hidden = false;
  const toggle = document.querySelector(`.nav-group-toggle[data-group="${group}"]`);
  if (toggle) toggle.classList.add("expanded");
}

function toggleSubmenu(group) {
  const submenu = document.getElementById(`submenu-${group}`);
  const toggle = document.querySelector(`.nav-group-toggle[data-group="${group}"]`);
  const willOpen = submenu.hidden;
  submenu.hidden = !willOpen;
  if (toggle) toggle.classList.toggle("expanded", willOpen);
}

function loadSidebarCollapsedPref() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch (err) {
    return false;
  }
}

function saveSidebarCollapsedPref(collapsed) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch (err) {
    // per-browser convenience only — ignore if storage is unavailable
  }
}

function applySidebarCollapsed(collapsed) {
  const sidebar = document.getElementById("sidebar");
  const btn = document.getElementById("sidebar-collapse-btn");
  sidebar.classList.toggle("collapsed", collapsed);
  btn.textContent = collapsed ? "›" : "‹";
  btn.title = collapsed ? "Expandir menu" : "Minimizar menu";
  btn.setAttribute("aria-label", btn.title);
}

// Off-canvas drawer on mobile (see the @media (max-width: 860px) block in
// css/style.css) — toggled by #sidebar-mobile-toggle, closed by tapping the
// backdrop or picking a nav item. Toggling ".mobile-open" has no effect
// outside that breakpoint, so this is safe to call unconditionally.
function setSidebarMobileOpen(open) {
  document.getElementById("sidebar").classList.toggle("mobile-open", open);
  document.getElementById("sidebar-backdrop").hidden = !open;
}

function setupSidebarMobileDrawer() {
  document.getElementById("sidebar-mobile-toggle").addEventListener("click", () => {
    setSidebarMobileOpen(true);
  });
  document.getElementById("sidebar-backdrop").addEventListener("click", () => {
    setSidebarMobileOpen(false);
  });
}

function setupSidebarCollapse() {
  applySidebarCollapsed(loadSidebarCollapsedPref());

  document.getElementById("sidebar-collapse-btn").addEventListener("click", () => {
    const sidebar = document.getElementById("sidebar");
    const collapsed = !sidebar.classList.contains("collapsed");
    applySidebarCollapsed(collapsed);
    saveSidebarCollapsedPref(collapsed);
  });
}

// Purely a UI convenience — hides screens a role shouldn't casually use.
// Not a security boundary (see js/roles.js).
function applyRoleVisibility(role) {
  const editable = canEdit(role);
  const lancForm = document.querySelector('.nav-subitem[data-view="lancamento-form"]');
  const estoqueForm = document.querySelector('.nav-subitem[data-view="estoque-form"]');
  if (lancForm) lancForm.hidden = !editable;
  if (estoqueForm) estoqueForm.hidden = !editable;
}

let navigationInitialized = false;

function setupNavigation() {
  if (navigationInitialized) return;
  navigationInitialized = true;

  document.querySelectorAll(".nav-item[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveView(btn.dataset.view);
      setSidebarMobileOpen(false);
    });
  });
  document.querySelectorAll(".nav-group-toggle").forEach((btn) => {
    btn.addEventListener("click", () => toggleSubmenu(btn.dataset.group));
  });

  setupSidebarCollapse();
  setupSidebarMobileDrawer();
  setupCommandPalette();
}
