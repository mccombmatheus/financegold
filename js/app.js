const loginScreen = document.getElementById("login-screen");
const companyPickerScreen = document.getElementById("company-picker-screen");
const cadastroScreen = document.getElementById("cadastro-screen");
const acessoNegadoScreen = document.getElementById("acesso-negado-screen");
const solicitarAcessoScreen = document.getElementById("solicitar-acesso-screen");
const sistemaScreen = document.getElementById("sistema-screen");
const appShell = document.getElementById("app-shell");
const loginButton = document.getElementById("btn-login");
const logoutButton = document.getElementById("btn-logout");
const pickerLogoutButton = document.getElementById("btn-picker-logout");
const acessoNegadoLogoutButton = document.getElementById("btn-acesso-negado-sair");
const userStatus = document.getElementById("user-status");
const userAvatar = document.getElementById("user-avatar");
const loginStatus = document.getElementById("login-status");
const statusMessage = document.getElementById("status-message");
const sidebarEmpresa = document.getElementById("sidebar-empresa");
const topbarEmpresa = document.getElementById("topbar-empresa");

let currentEmail = null;
let currentIsSuperAdmin = false;
let currentCompanies = [];
let currentPedidosPendentes = 0;
let currentPedido = null;
let currentUserLinha = null;
let ajustesHandlersReady = false;

function setUserIdentity(nome) {
  userStatus.textContent = nome;
  const initials = nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  userAvatar.textContent = initials || "?";
}

function setActiveCompanyLabel(name) {
  sidebarEmpresa.textContent = name;
  topbarEmpresa.textContent = name;
}

function hideAllScreens() {
  loginScreen.hidden = true;
  companyPickerScreen.hidden = true;
  cadastroScreen.hidden = true;
  acessoNegadoScreen.hidden = true;
  solicitarAcessoScreen.hidden = true;
  sistemaScreen.hidden = true;
  appShell.hidden = true;
}

function showApp() {
  hideAllScreens();
  appShell.hidden = false;
}

function showLogin() {
  hideAllScreens();
  loginScreen.hidden = false;
  loginStatus.textContent = "";
  setActiveCompanyLabel("");
}

let sessionExpiredHandled = false;

// Called by gatewayCall (js/sheets.js) when the server says the Google token
// is no longer valid. The remembered company/screen are kept on purpose, so
// signing in again lands the person back where they were.
function handleSessionExpired() {
  if (sessionExpiredHandled) return;
  sessionExpiredHandled = true;
  clearTokenSession();
  showLogin();
  loginStatus.textContent = "Sua sessão expirou. Entre novamente para continuar de onde parou.";
}

function showCompanyPicker(companies, token, email) {
  const list = document.getElementById("company-picker-list");
  list.innerHTML = "";
  if (CONFIG.GATEWAY_URL && currentIsSuperAdmin) {
    // The system console is not a company: it sits above them, apart from any company data.
    const sistemaBtn = document.createElement("button");
    sistemaBtn.type = "button";
    sistemaBtn.className = "company-picker-btn company-picker-sistema";
    sistemaBtn.textContent = currentPedidosPendentes > 0 ? `Painel do sistema (${currentPedidosPendentes} pedido(s))` : "Painel do sistema";
    sistemaBtn.addEventListener("click", showSistemaScreen);
    list.appendChild(sistemaBtn);
  }
  companies.forEach((tenant) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "company-picker-btn";
    btn.textContent = tenant.empresa;
    btn.addEventListener("click", () => resolveProfileAndEnter(tenant, token, email));
    list.appendChild(btn);
  });
  hideAllScreens();
  companyPickerScreen.hidden = false;
}

function showCadastroScreen(email, token) {
  hideAllScreens();
  cadastroScreen.hidden = false;

  document.getElementById("cadastro-email").textContent = email;
  const form = document.getElementById("cadastro-form");
  const nameInput = document.getElementById("cadastro-nome");
  const statusEl = document.getElementById("cadastro-status");
  nameInput.value = "";
  statusEl.textContent = "";

  form.onsubmit = async (event) => {
    event.preventDefault();
    const nome = nameInput.value.trim();
    if (!nome) {
      statusEl.textContent = "Digite um nome.";
      return;
    }
    statusEl.textContent = "Salvando...";
    try {
      const { perfil, linha } = await registerUsuario(email, nome, token);
      startApp(token, nome, perfil, linha);
    } catch (err) {
      console.error(err);
      statusEl.textContent = `Erro ao salvar: ${err.message}`;
    }
  };
}

function showAcessoNegadoScreen(email, empresa, extra) {
  hideAllScreens();
  acessoNegadoScreen.hidden = false;
  const base = `O e-mail ${email} ainda não tem acesso liberado a ${empresa}. Peça para o administrador te cadastrar.`;
  document.getElementById("acesso-negado-mensagem").textContent = extra ? `${base} (${extra})` : base;
}

async function refreshLancamentosAndDashboard() {
  const records = await fetchLancamentos(accessToken);
  updateLancamentos(records);
  renderLancamentoListaTable();
}

// Only the Master decides who gets in — there is no open self-registration.
// The one exception is a brand-new company with nobody registered yet: that
// first person necessarily has to be the one setting it up (see
// registerUsuario's bootstrap rule in js/usuarios.js).
async function resolveProfileAndEnter(tenant, token, email) {
  CONFIG.SPREADSHEET_ID = tenant.spreadsheetId;
  if (tenant.sheetName) CONFIG.SHEET_NAME = tenant.sheetName;
  setActiveCompanyLabel(tenant.empresa);
  rememberCompany(tenant.spreadsheetId);

  try {
    await ensureUsuariosSheet(token);
    const usuario = await fetchUsuario(email, token);
    if (usuario) {
      startApp(token, usuario.nome, usuario.perfil, usuario.linha);
      return;
    }

    const todos = await fetchAllUsuarios(token);
    if (todos.length === 0) {
      showCadastroScreen(email, token);
    } else {
      showAcessoNegadoScreen(email, tenant.empresa);
    }
  } catch (err) {
    console.error(err);
    // Fail closed: an error checking access must never silently let someone in.
    showAcessoNegadoScreen(email, tenant.empresa, `erro ao verificar acesso: ${err.message}`);
  }
}

async function refreshAllData() {
  const btn = document.getElementById("btn-refresh-dashboard");
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Atualizando…";
  statusMessage.textContent = "Atualizando...";
  const errors = [];

  try {
    await refreshLancamentosAndDashboard();
  } catch (err) {
    console.error(err);
    errors.push(`Lançamentos: ${err.message}`);
  }

  try {
    const lookups = await fetchAllLookups(accessToken);
    populateLookupSelects(lookups);
    populateEstoqueFormSelects(lookups);
    estoqueLookups = lookups; // keep the estoque list's cached lookups (custody/sold pickers) in sync
  } catch (err) {
    console.error(err);
    errors.push(`Listas de apoio: ${err.message}`);
  }

  try {
    await refreshEstoque();
  } catch (err) {
    console.error(err);
    errors.push(`Estoque: ${err.message}`);
  }

  if (isMaster(currentUserRole)) {
    try {
      await refreshUsuariosAdmin();
    } catch (err) {
      console.error(err);
      errors.push(`Usuários: ${err.message}`);
    }
  }

  statusMessage.textContent =
    errors.length > 0 ? `Atualizado com erros — ${errors.join(" | ")}` : "Dados atualizados.";
  btn.disabled = false;
  btn.textContent = originalLabel;
}

function setupEditarPerfilForm() {
  const btn = document.getElementById("btn-editar-perfil");
  const form = document.getElementById("editar-perfil-form");
  const nomeInput = document.getElementById("editar-perfil-nome");
  const tipoSelect = document.getElementById("editar-perfil-tipo");
  const hint = document.getElementById("editar-perfil-hint");
  const statusEl = document.getElementById("editar-perfil-status");

  function closeForm() {
    form.hidden = true;
    btn.hidden = false;
    statusEl.textContent = "";
  }

  btn.addEventListener("click", () => {
    nomeInput.value = userStatus.textContent;
    tipoSelect.value = currentUserRole;
    // The role field is always shown, but only Master can actually change it —
    // for everyone else it's visible and disabled, not hidden.
    tipoSelect.disabled = !isMaster(currentUserRole);
    hint.textContent = isMaster(currentUserRole) ? "" : "Só o Master pode alterar o tipo de perfil.";
    statusEl.textContent = "";
    form.hidden = false;
    btn.hidden = true;
  });

  document.getElementById("btn-cancelar-perfil").addEventListener("click", closeForm);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const novoNome = nomeInput.value.trim();
    if (!novoNome) {
      statusEl.textContent = "Digite um nome.";
      return;
    }

    statusEl.textContent = "Salvando...";
    try {
      await updateUsuarioNome(currentUserLinha, novoNome, accessToken);

      // Defense in depth: even if the disabled attribute were bypassed, a
      // perfil change here is only ever written for Master.
      if (isMaster(currentUserRole) && tipoSelect.value !== currentUserRole) {
        await updateUsuarioPerfil(currentUserLinha, tipoSelect.value, accessToken);
        currentUserRole = tipoSelect.value;
        applyRoleVisibility(currentUserRole);
        document.getElementById("ajustes-usuarios-section").hidden = !isMaster(currentUserRole);
      }

      setUserIdentity(novoNome);
      document.getElementById("ajustes-conta-nome").textContent = novoNome;
      statusEl.textContent = "Perfil atualizado.";
      closeForm();
    } catch (err) {
      console.error(err);
      statusEl.textContent = describeSaveError(err);
    }
  });
}

function setupAjustesHandlers() {
  if (ajustesHandlersReady) return;
  ajustesHandlersReady = true;

  document.getElementById("btn-trocar-empresa").addEventListener("click", () => {
    showCompanyPicker(currentCompanies, accessToken, currentEmail);
  });

  document.getElementById("btn-ir-sistema").addEventListener("click", showSistemaScreen);

  document.getElementById("btn-refresh-dashboard").addEventListener("click", refreshAllData);

  setupEditarPerfilForm();
}

const LAST_SESSION_KEY = "financegold_last_session";
const REMEMBERED_COMPANY_KEY = "financegold_company";

// Per-tab (sessionStorage): a page reload should land back in the company the
// user was working in, not on the company picker again. Cleared on logout.
function rememberCompany(spreadsheetId) {
  try {
    sessionStorage.setItem(REMEMBERED_COMPANY_KEY, spreadsheetId);
  } catch (err) {
    // convenience only
  }
}

function loadRememberedCompany() {
  try {
    return sessionStorage.getItem(REMEMBERED_COMPANY_KEY);
  } catch (err) {
    return null;
  }
}

function forgetSessionPlace() {
  try {
    sessionStorage.removeItem(REMEMBERED_COMPANY_KEY);
    sessionStorage.removeItem(LAST_VIEW_KEY);
  } catch (err) {
    // convenience only
  }
}

function saveLastSession(info) {
  try {
    localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(info));
  } catch (err) {
    // best effort — only affects the offline-resume fallback, not core function
  }
}

function loadLastSession() {
  try {
    const raw = localStorage.getItem(LAST_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

// Reached only when a sessionStorage token exists but we're offline, so the
// normal scope/identity checks (both need network) can't run. Trusts the
// last successful login's identity instead of re-verifying it.
async function enterOfflineFromLastSession(token) {
  const last = loadLastSession();
  if (!last) {
    loginStatus.textContent =
      "Sem internet, e nenhuma sessão anterior salva neste navegador. Conecte-se para entrar pela primeira vez.";
    return;
  }
  currentEmail = last.email;
  currentCompanies = lookupTenants(last.email) || [
    { empresa: last.empresa, spreadsheetId: last.spreadsheetId, sheetName: last.sheetName },
  ];
  CONFIG.SPREADSHEET_ID = last.spreadsheetId;
  CONFIG.SHEET_NAME = last.sheetName;
  setActiveCompanyLabel(last.empresa);
  await startApp(token, last.nome, last.perfil, last.linha);
}

async function startApp(token, nome, perfil, linha) {
  currentUserRole = perfil;
  currentUserLinha = linha;
  setUserIdentity(nome);
  saveLastSession({
    email: currentEmail,
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    sheetName: CONFIG.SHEET_NAME,
    empresa: sidebarEmpresa.textContent,
    nome,
    perfil,
    linha,
  });
  showApp();
  setupNavigation();
  applyRoleVisibility(perfil);
  setupAjustesHandlers();
  restoreLastViewOnce();

  document.getElementById("ajustes-conta-nome").textContent = nome;
  document.getElementById("ajustes-conta-email").textContent = currentEmail || "";
  document.getElementById("ajustes-conta-empresa").textContent = sidebarEmpresa.textContent;
  document.getElementById("ajustes-trocar-empresa-card").hidden = currentCompanies.length <= 1;
  document.getElementById("ajustes-usuarios-section").hidden = !isMaster(perfil);
  // Creating companies and editing the lists need the gateway (direct mode has
  // no registry); the company's Master edits lists, only system admins create companies.
  const gatewayMode = Boolean(CONFIG.GATEWAY_URL);
  document.getElementById("ajustes-listas-section").hidden = !(gatewayMode && isMaster(perfil));
  document.getElementById("ajustes-sistema-card").hidden = !(gatewayMode && currentIsSuperAdmin);

  statusMessage.textContent = "Carregando dados...";

  const [lancResult, lookupsResult, estoqueResult] = await Promise.allSettled([
    fetchWithOfflineFallback(() => fetchLancamentos(token), "lancamentos", serializeLancamentos, deserializeLancamentos),
    fetchWithOfflineFallback(() => fetchAllLookups(token), "lookups", null, null),
    fetchWithOfflineFallback(() => fetchEstoque(token), "estoque", serializeEstoque, deserializeEstoque),
  ]);

  const errors = [];
  let anyFromCache = false;

  if (lancResult.status === "fulfilled") {
    initDashboard(lancResult.value.data);
    initLancamentoLista(lancResult.value.data);
    if (lancResult.value.fromCache) anyFromCache = true;
  } else {
    console.error(lancResult.reason);
    errors.push(`Lançamentos: ${lancResult.reason.message}`);
  }

  if (lookupsResult.status === "fulfilled") {
    populateLookupSelects(lookupsResult.value.data);
    setupLancamentoForm();
    populateEstoqueFormSelects(lookupsResult.value.data);
    if (lookupsResult.value.fromCache) anyFromCache = true;
  } else {
    console.error(lookupsResult.reason);
    errors.push(`Listas de apoio: ${lookupsResult.reason.message}`);
  }

  if (estoqueResult.status === "fulfilled" && lookupsResult.status === "fulfilled") {
    setupEstoqueForm();
    initEstoqueList(estoqueResult.value.data, lookupsResult.value.data);
    if (estoqueResult.value.fromCache) anyFromCache = true;
  } else if (estoqueResult.status === "rejected") {
    console.error(estoqueResult.reason);
    errors.push(`Estoque: ${estoqueResult.reason.message}`);
  }

  if (gatewayMode && isMaster(perfil)) initListasAdmin();

  if (isMaster(perfil)) {
    try {
      initUsuariosAdmin(await fetchAllUsuarios(token));
    } catch (err) {
      console.error(err);
      if (!isNetworkError(err)) errors.push(`Usuários: ${err.message}`);
    }
  }

  updateOfflineBanner();
  if (!anyFromCache && getQueue().length > 0) {
    flushQueue();
  }

  if (errors.length > 0) {
    statusMessage.textContent = `Carregado com erros — ${errors.join(" | ")}`;
  } else if (anyFromCache) {
    // Offline is deliberately silent: just keep showing the cached data.
    statusMessage.textContent = "";
  } else {
    statusMessage.textContent = `${lancResult.value.data.length} lançamentos e ${estoqueResult.value.data.length} peças carregados.`;
  }
}

// Companies for a signed-in email = the ones pinned to it in js/tenants.js
// (the owner's own routing) plus every other known company whose "Usuários" tab
// lists it. The second half is what makes "Master adds someone in Ajustes"
// enough on its own. Drive sharing is still the real gate: without access to a
// spreadsheet the Sheets API refuses the read and that company is skipped.
function companiesFromMe(me) {
  return me.companies.concat(me.bootstrap).map((c) => ({
    empresa: c.empresa,
    spreadsheetId: c.spreadsheetId,
    sheetName: c.sheetName,
  }));
}

// Re-reads the support lists (lojas, contas...) after Ajustes → Listas de apoio
// changed them, so the dropdowns in the forms show the new items right away.
async function refreshLookupsOnly() {
  const lookups = await fetchAllLookups(accessToken);
  populateLookupSelects(lookups);
  populateEstoqueFormSelects(lookups);
  estoqueLookups = lookups;
}

async function resolveCompaniesForEmail(email, token) {
  if (CONFIG.GATEWAY_URL) {
    // The gateway is the source of truth: it returns the companies whose
    // Usuários tab lists this email, plus any it may set up for the first time.
    const me = await gatewayCall("me", {}, token);
    currentIsSuperAdmin = Boolean(me.superAdmin);
    currentPedido = me.pedido || null;
    currentPedidosPendentes = me.pedidosPendentes || 0;
    return companiesFromMe(me);
  }
  const found = (lookupTenants(email) || []).slice();
  const knownIds = new Set(found.map((c) => c.spreadsheetId));
  const candidates = allKnownCompanies().filter((c) => !knownIds.has(c.spreadsheetId));

  const results = await Promise.allSettled(
    candidates.map((c) => isEmailListedInCompany(c.spreadsheetId, email, token))
  );
  results.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value) found.push(candidates[index]);
  });
  return found;
}

// A resumed sessionStorage token still needs an online round-trip to verify
// scopes and identity — without this fallback, reloading the page while
// offline (e.g. during a power/internet outage) would hang forever on
// "Verificando conta..." with no way to reach the cached data underneath,
// defeating the entire point of the offline cache.
async function handleSignedIn(token) {
  sessionExpiredHandled = false;
  loginStatus.textContent = "Verificando conta...";

  let grantedScopes;
  try {
    grantedScopes = await getTokenScopes(token);
  } catch (err) {
    if (isNetworkError(err)) return enterOfflineFromLastSession(token);
    console.error(err);
    clearTokenSession();
    loginStatus.textContent = "Não foi possível verificar sua conta Google. Tente novamente.";
    return;
  }

  if (!grantedScopes || !hasAllScopes(grantedScopes, CONFIG.SCOPES)) {
    clearTokenSession();
    loginStatus.textContent =
      "Sua conta não concedeu todas as permissões necessárias (acesso ao Google Sheets). Clique em \"Entrar com Google\" novamente e aceite todas as permissões pedidas.";
    return;
  }

  let email;
  try {
    email = await fetchUserEmail(token);
  } catch (err) {
    if (isNetworkError(err)) return enterOfflineFromLastSession(token);
    console.error(err);
    clearTokenSession();
    loginStatus.textContent = "Não foi possível verificar sua conta Google. Tente novamente.";
    return;
  }

  let companies;
  try {
    companies = await resolveCompaniesForEmail(email, token);
  } catch (err) {
    if (isNetworkError(err)) return enterOfflineFromLastSession(token);
    if (err.sessionExpired) return; // handleSessionExpired already showed the login screen
    console.error(err);
    clearTokenSession();
    loginStatus.textContent = `Não foi possível verificar seu acesso: ${err.message}`;
    return;
  }
  // The system administrator (developer) lands in the Painel do sistema, never
  // in a company by default; if they also belong to companies they choose.
  if (CONFIG.GATEWAY_URL && currentIsSuperAdmin) {
    currentEmail = email;
    currentCompanies = companies;
    if (companies.length === 0 || loadRememberedCompany() === SISTEMA_KEY) {
      showSistemaScreen();
    } else {
      showCompanyPicker(companies, token, email);
    }
    return;
  }

  if (companies.length === 0) {
    currentEmail = email;
    if (CONFIG.GATEWAY_URL) {
      // Keep the session: the person can ask for access from here.
      showSolicitarAcessoScreen(email, currentPedido);
      return;
    }
    clearTokenSession();
    loginStatus.textContent = `O e-mail ${email} ainda não tem acesso a nenhuma empresa. Peça a quem administra para cadastrar este e-mail em Ajustes.`;
    return;
  }

  currentEmail = email;
  currentCompanies = companies;

  const remembered = loadRememberedCompany();
  const rememberedTenant = companies.length > 1 && remembered
    ? companies.find((c) => c.spreadsheetId === remembered)
    : null;

  if (companies.length === 1) {
    await resolveProfileAndEnter(companies[0], token, email);
  } else if (rememberedTenant) {
    await resolveProfileAndEnter(rememberedTenant, token, email);
  } else {
    showCompanyPicker(companies, token, email);
  }
}

const authReady = initAuth(handleSignedIn).catch((err) => {
  console.error(err);
  loginStatus.textContent = "Erro ao carregar o login do Google. Recarregue a página.";
});

loginButton.addEventListener("click", async () => {
  loginButton.disabled = true;
  loginStatus.textContent = "";
  try {
    await authReady;
    requestAccessToken();
  } finally {
    loginButton.disabled = false;
  }
});

logoutButton.addEventListener("click", () => {
  forgetSessionPlace();
  signOut();
  showLogin();
});

pickerLogoutButton.addEventListener("click", () => {
  forgetSessionPlace();
  signOut();
  showLogin();
});

document.getElementById("btn-solicitar-sair").addEventListener("click", () => {
  forgetSessionPlace();
  signOut();
  showLogin();
});

acessoNegadoLogoutButton.addEventListener("click", () => {
  forgetSessionPlace();
  signOut();
  showLogin();
});

// Resume a session already active in this tab (survives reloads, not tab close).
(async () => {
  const existingToken = loadValidTokenFromSession();
  if (existingToken) {
    await handleSignedIn(existingToken);
  }
})();
