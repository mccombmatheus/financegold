/**
 * FinanGold gateway — a Google Apps Script web app that sits between the app
 * (browser) and the spreadsheets.
 *
 * Why it exists: without it, every person using the app needs the company's
 * spreadsheet shared with their own Google account in Drive. With it, the
 * script runs as the spreadsheet OWNER; people only prove who they are (Google
 * sign-in, email scope only) and the script decides — from the "Usuários" tab
 * of each spreadsheet — what they may read or write. The spreadsheets no
 * longer need to be shared with anyone but the owner.
 *
 * SECURITY: this file IS the access-control boundary now. Anything the browser
 * sends is untrusted. Every request: (1) verifies the Google access token and
 * that it was issued to THIS app's client id, (2) looks the email up in the
 * target spreadsheet's Usuários tab, (3) checks the role against the action.
 * Roles are enforced here, not just in the UI.
 *
 * Setup steps are in apps-script/LEIA-ME.md.
 */

const GATEWAY_CONFIG = {
  // Must match CONFIG.CLIENT_ID in js/config.js. Tokens issued to any other
  // OAuth client are refused (prevents another app replaying a user's token).
  CLIENT_ID: "421144448289-jfiiagc3pij4qoaoq0m2dhnjuda4ua8t.apps.googleusercontent.com",

  // The ONLY spreadsheets this gateway will ever touch.
  SPREADSHEETS: {
    "1nZsFn7K2PpMq36jmBr6hjqHZU8gqHzjPUEzG0rFmmUQ": { empresa: "Ipanema Joias", sheetName: "Lançamento" },
    "1DdJs0mLYiJuMctNVc-xN1rZgs3OEXOgZI5JJjfeU2AA": { empresa: "Carolina Joias", sheetName: "Lançamento" },
  },

  // May set up a company whose Usuários tab is missing or empty (becoming its
  // first Master). Everyone else must be added by an existing Master.
  ADMIN_EMAILS: ["mccomb.matheus@gmail.com"],
};

const USUARIOS_TAB = "Usuários";
const LOOKUP_TABS = ["Lojas", "Contas", "Empresas", "Categoria", "Pessoa", "Produto", "Tipo de Produto", "Marcas"];
const MAX_COMPANIES = 200;
const REGISTRY_PROP = "REGISTRY_SPREADSHEET_ID";
const REGISTRY_TITLE = "FinanGold — Registro de empresas";

// Structure of every company created from inside the app. A new company starts
// with just enough seed rows in the lists for the forms to be usable; its Master
// edits the lists later (Ajustes → Listas de apoio).
const LOOKUP_HEADERS = ["Código", "Nome", "Complemento"];
function seedRow_(n, nome, extra) {
  const row = [n, nome, n + " - " + nome];
  if (extra) row.push(extra);
  return row;
}
const COMPANY_TEMPLATE = [
  { name: "Lançamento", dateCols: [0], headers: ["Data", "Loja", "Conta", "Empresa", "Categoria", "Valor", "Tipo", "Peso (g)", "Pessoa", "Observação"], seeds: () => [] },
  { name: "Estoque", dateCols: [9, 10], headers: ["Produto", "Tipo", "Marca", "Condição", "Estado", "Peso em grama", "Pureza (k)", "Valor de Custo", "Valor de venda", "Data de Compra", "Data de Venda", "Comprador", "Vendedor", "Loja", "Vendido?", "Observação"], seeds: () => [] },
  { name: "Lojas", headers: LOOKUP_HEADERS, seeds: () => [seedRow_(1, "Loja principal")] },
  { name: "Contas", headers: LOOKUP_HEADERS, seeds: () => [seedRow_(1, "Caixa"), seedRow_(2, "Banco")] },
  { name: "Empresas", headers: LOOKUP_HEADERS, seeds: (empresa) => [seedRow_(1, empresa)] },
  { name: "Categoria", headers: LOOKUP_HEADERS.concat(["Status"]), seeds: () => ["Vendas", "Compras", "Despesas fixas", "Salários", "Impostos", "Outros"].map((n, i) => seedRow_(i + 1, n, "Ativo")) },
  { name: "Pessoa", headers: LOOKUP_HEADERS, seeds: () => [seedRow_(1, "Geral")] },
  { name: "Produto", headers: LOOKUP_HEADERS, seeds: () => [seedRow_(1, "Produto geral")] },
  { name: "Tipo de Produto", headers: LOOKUP_HEADERS, seeds: () => [seedRow_(1, "Geral")] },
  { name: "Marcas", headers: LOOKUP_HEADERS, seeds: () => [seedRow_(1, "Sem marca")] },
  { name: "Usuários", headers: ["Email", "Nome", "Perfil"], seeds: () => [] },
];
const READ_TABS = ["Estoque", "Lojas", "Contas", "Empresas", "Categoria", "Pessoa", "Produto", "Tipo de Produto", "Marcas"];
const WRITE_TABS = ["Estoque"]; // plus the company's own ledger tab (sheetName)
const ROLE_VISUALIZADOR = "Visualizador";
const ROLE_EDITOR = "Editor";
const ROLE_MASTER = "Master";
const VALID_ROLES = [ROLE_VISUALIZADOR, ROLE_EDITOR, ROLE_MASTER];
const MAX_BODY_CHARS = 200000;
const MAX_CELL_CHARS = 2000;
const MAX_ROW_CELLS = 20;
const USUARIOS_CACHE_SECONDS = 20;

function GatewayError_(status, message) {
  this.status = status;
  this.message = message;
}

// ---------------------------------------------------------------------------
// Web app entry point (the only code that touches Apps Script services)
// ---------------------------------------------------------------------------

function doPost(e) {
  let result;
  try {
    const raw = e && e.postData ? e.postData.contents : "";
    if (!raw || raw.length > MAX_BODY_CHARS) throw new GatewayError_(400, "Requisição inválida.");
    let body;
    try {
      body = JSON.parse(raw);
    } catch (err) {
      throw new GatewayError_(400, "Requisição inválida.");
    }
    result = { ok: true, data: handleRequest(body, realDeps_()) };
  } catch (err) {
    if (err instanceof GatewayError_) {
      result = { ok: false, status: err.status, error: err.message };
    } else {
      console.error(err);
      result = { ok: false, status: 500, error: "Erro interno no servidor do app." };
    }
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput("FinanGold gateway ativo.");
}

function realDeps_() {
  const cache = CacheService.getScriptCache();
  return {
    config: GATEWAY_CONFIG,
    verifyToken: verifyGoogleToken_,
    cache: {
      get: (k) => cache.get(k),
      put: (k, v, s) => cache.put(k, v, s),
      remove: (k) => cache.remove(k),
    },
    lock: (fn) => {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(15000)) throw new GatewayError_(503, "Servidor ocupado. Tente novamente.");
      try {
        return fn();
      } finally {
        lock.releaseLock();
      }
    },
    registry: registryDeps_(cache),
    sheets: {
      // Creates the spreadsheet (owned by whoever deployed this script) with
      // every tab, header and seed row of COMPANY_TEMPLATE. Returns its id.
      createCompanySpreadsheet: (title, empresaNome) => {
        const created = Sheets.Spreadsheets.create({
          properties: { title: title },
          sheets: COMPANY_TEMPLATE.map((t) => ({ properties: { title: t.name } })),
        });
        const id = created.spreadsheetId;
        Sheets.Spreadsheets.Values.batchUpdate(
          {
            valueInputOption: "RAW",
            data: COMPANY_TEMPLATE.map((t) => ({ range: t.name + "!A1", values: [t.headers].concat(t.seeds(empresaNome)) })),
          },
          id
        );
        const requests = [];
        created.sheets.forEach((sheet, i) => {
          (COMPANY_TEMPLATE[i].dateCols || []).forEach((col) => {
            requests.push({
              repeatCell: {
                range: { sheetId: sheet.properties.sheetId, startRowIndex: 1, startColumnIndex: col, endColumnIndex: col + 1 },
                cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "dd/MM/yyyy" } } },
                fields: "userEnteredFormat.numberFormat",
              },
            });
          });
        });
        if (requests.length) Sheets.Spreadsheets.batchUpdate({ requests: requests }, id);
        return id;
      },
      getTitles: (id) => {
        const data = Sheets.Spreadsheets.get(id, { fields: "sheets.properties.title" });
        return (data.sheets || []).map((s) => s.properties.title);
      },
      getValues: (id, range, valueRenderOption) => {
        const opts = valueRenderOption ? { valueRenderOption: valueRenderOption } : {};
        const data = Sheets.Spreadsheets.Values.get(id, range, opts);
        return data.values || [];
      },
      // RAW on purpose: a value starting with "=" must stay literal text
      // (formula injection), and dates are written as serial numbers.
      updateValues: (id, range, values) => {
        Sheets.Spreadsheets.Values.update({ values: values }, id, range, { valueInputOption: "RAW" });
      },
      addTab: (id, title) => {
        Sheets.Spreadsheets.batchUpdate({ requests: [{ addSheet: { properties: { title: title } } }] }, id);
      },
    },
  };
}

// Companies created from inside the app live in a small registry spreadsheet
// (its id is kept in the script's properties, created on first use).
function registryDeps_(cache) {
  const props = PropertiesService.getScriptProperties();
  return {
    list: () => {
      const cached = cache.get("reg_list");
      if (cached) return JSON.parse(cached);
      const id = props.getProperty(REGISTRY_PROP);
      const out = [];
      if (id) {
        const data = Sheets.Spreadsheets.Values.get(id, "Empresas!A2:E", { valueRenderOption: "UNFORMATTED_VALUE" });
        (data.values || []).forEach((row) => {
          if (row[0] && String(row[4] || "Sim") !== "Não") {
            out.push({ spreadsheetId: String(row[0]), empresa: String(row[1] || ""), sheetName: "Lançamento" });
          }
        });
      }
      cache.put("reg_list", JSON.stringify(out), 60);
      return out;
    },
    add: (entry) => {
      let id = props.getProperty(REGISTRY_PROP);
      if (!id) {
        const created = Sheets.Spreadsheets.create({ properties: { title: REGISTRY_TITLE }, sheets: [{ properties: { title: "Empresas" } }] });
        id = created.spreadsheetId;
        Sheets.Spreadsheets.Values.update({ values: [["ID da planilha", "Empresa", "Criada em", "Criada por", "Ativa"]] }, id, "Empresas!A1:E1", { valueInputOption: "RAW" });
        props.setProperty(REGISTRY_PROP, id);
      }
      const existing = Sheets.Spreadsheets.Values.get(id, "Empresas!A2:A");
      const next = (existing.values || []).length + 2;
      Sheets.Spreadsheets.Values.update(
        { values: [[entry.spreadsheetId, entry.empresa, new Date().toISOString(), entry.criadaPor, "Sim"]] },
        id,
        "Empresas!A" + next + ":E" + next,
        { valueInputOption: "RAW" }
      );
      cache.remove("reg_list");
    },
  };
}

function sha256Hex_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes
    .map((b) => ("0" + (b & 0xff).toString(16)).slice(-2))
    .join("");
}

// Returns the verified, lower-cased email for a Google access token, or throws
// 401. Uses Google's tokeninfo endpoint, and checks the token was issued to
// this app's OAuth client.
function verifyGoogleToken_(token) {
  if (!token || typeof token !== "string" || token.length > 4096) {
    throw new GatewayError_(401, "Sessão inválida. Entre novamente.");
  }
  const cache = CacheService.getScriptCache();
  const cacheKey = "tok_" + sha256Hex_(token);
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const response = UrlFetchApp.fetch(
    "https://oauth2.googleapis.com/tokeninfo?access_token=" + encodeURIComponent(token),
    { muteHttpExceptions: true }
  );
  if (response.getResponseCode() !== 200) throw new GatewayError_(401, "Sessão expirada. Entre novamente.");

  const info = JSON.parse(response.getContentText());
  const audience = info.aud || info.azp;
  if (audience !== GATEWAY_CONFIG.CLIENT_ID) throw new GatewayError_(401, "Sessão inválida.");
  if (!info.email || String(info.email_verified) !== "true") throw new GatewayError_(401, "E-mail não verificado.");

  const email = String(info.email).trim().toLowerCase();
  const ttl = Math.min(300, Number(info.expires_in) || 0);
  if (ttl > 10) cache.put(cacheKey, email, ttl);
  return email;
}

// ---------------------------------------------------------------------------
// Request handling — pure logic over injected dependencies (unit-testable)
// ---------------------------------------------------------------------------

// Every company the gateway knows: the ones fixed in GATEWAY_CONFIG plus the
// ones created from inside the app (registry).
function companyMap_(deps) {
  const map = {};
  Object.keys(deps.config.SPREADSHEETS).forEach((id) => {
    map[id] = deps.config.SPREADSHEETS[id];
  });
  const registered = deps.registry ? deps.registry.list() : [];
  registered.forEach((entry) => {
    if (!map[entry.spreadsheetId]) map[entry.spreadsheetId] = { empresa: entry.empresa, sheetName: entry.sheetName || "Lançamento" };
  });
  return map;
}

function handleRequest(body, deps) {
  if (!body || typeof body !== "object") throw new GatewayError_(400, "Requisição inválida.");
  const email = deps.verifyToken(body.token);
  const action = body.action;

  if (action === "me") return actionMe_(deps, email);
  if (action === "createCompany") return actionCreateCompany_(deps, email, body);

  const spreadsheet = companyMap_(deps)[body.spreadsheetId];
  if (!spreadsheet) throw new GatewayError_(403, "Empresa não permitida.");
  const access = getAccess_(deps, email, body.spreadsheetId);

  switch (action) {
    case "getTitles":
      if (!access.perfil && !access.bootstrapOk) throw denied_();
      return { titles: deps.sheets.getTitles(body.spreadsheetId) };
    case "getValues":
      return actionGetValues_(deps, access, spreadsheet, body);
    case "updateValues":
      return actionUpdateValues_(deps, email, access, spreadsheet, body);
    case "addTab":
      return actionAddTab_(deps, access, body);
    default:
      throw new GatewayError_(400, "Ação desconhecida.");
  }
}

function denied_() {
  return new GatewayError_(403, "Você não tem permissão para esta ação.");
}

function normalizeRole_(value) {
  return VALID_ROLES.indexOf(value) !== -1 ? value : ROLE_VISUALIZADOR;
}

function isAdminEmail_(deps, email) {
  return deps.config.ADMIN_EMAILS.some((a) => String(a).trim().toLowerCase() === email);
}

// Reads a company's Usuários tab (short cache). null = the tab doesn't exist.
// A single read: asking for a tab that isn't there makes the Sheets API fail,
// which is exactly the "missing" answer (this runs once per company on every
// sign-in, so the extra "list the tabs" call it replaced was costly).
function loadUsuarios_(deps, spreadsheetId) {
  const cacheKey = "usr_" + spreadsheetId;
  const cached = deps.cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  let rows;
  try {
    rows = deps.sheets.getValues(spreadsheetId, USUARIOS_TAB + "!A2:C", "UNFORMATTED_VALUE");
  } catch (err) {
    return null;
  }
  const usuarios = [];
  rows.forEach((row, index) => {
    if (typeof row[0] !== "string" || !row[0].trim()) return;
    usuarios.push({
      linha: index + 2,
      email: row[0].trim().toLowerCase(),
      nome: row[1] ? String(row[1]) : "",
      perfil: normalizeRole_(row[2]),
    });
  });
  deps.cache.put(cacheKey, JSON.stringify(usuarios), USUARIOS_CACHE_SECONDS);
  return usuarios;
}

function getAccess_(deps, email, spreadsheetId) {
  const usuarios = loadUsuarios_(deps, spreadsheetId);
  const entry = usuarios ? usuarios.filter((u) => u.email === email)[0] : null;
  const empty = usuarios === null || usuarios.length === 0;
  return {
    entry: entry || null,
    perfil: entry ? entry.perfil : null,
    usuarios: usuarios || [],
    bootstrapOk: empty && isAdminEmail_(deps, email),
  };
}

function actionMe_(deps, email) {
  const companies = [];
  const bootstrap = [];
  const known = companyMap_(deps);
  Object.keys(known).forEach((spreadsheetId) => {
    const info = known[spreadsheetId];
    let access;
    try {
      access = getAccess_(deps, email, spreadsheetId);
    } catch (err) {
      return; // an unreadable company simply isn't offered
    }
    if (access.entry) {
      companies.push({
        spreadsheetId: spreadsheetId,
        empresa: info.empresa,
        sheetName: info.sheetName,
        nome: access.entry.nome,
        perfil: access.entry.perfil,
        linha: access.entry.linha,
      });
    } else if (access.bootstrapOk) {
      bootstrap.push({ spreadsheetId: spreadsheetId, empresa: info.empresa, sheetName: info.sheetName });
    }
  });
  return { companies: companies, bootstrap: bootstrap, superAdmin: isAdminEmail_(deps, email) };
}

// Only the system administrators (ADMIN_EMAILS) can create a company. The new
// spreadsheet is created by this script, so it belongs to the account that
// deployed it; nobody needs it shared in Drive.
function actionCreateCompany_(deps, email, body) {
  if (!isAdminEmail_(deps, email)) throw denied_();
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const ownerEmail = typeof body.ownerEmail === "string" ? body.ownerEmail.trim().toLowerCase() : "";
  const ownerNome = typeof body.ownerNome === "string" ? body.ownerNome.trim() : "";
  if (!nome || nome.length > 80) throw new GatewayError_(400, "Informe o nome da empresa (até 80 letras).");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) || ownerEmail.length > 120) throw new GatewayError_(400, "Informe um e-mail válido para o administrador da empresa.");
  if (!ownerNome || ownerNome.length > 80) throw new GatewayError_(400, "Informe o nome do administrador da empresa.");

  const known = companyMap_(deps);
  const ids = Object.keys(known);
  if (ids.length >= MAX_COMPANIES) throw new GatewayError_(400, "Limite de empresas atingido.");
  if (ids.some((id) => String(known[id].empresa).trim().toLowerCase() === nome.toLowerCase())) {
    throw new GatewayError_(400, "Já existe uma empresa com esse nome.");
  }

  return deps.lock(() => {
    const spreadsheetId = deps.sheets.createCompanySpreadsheet(nome + " — FinanGold", nome);
    const rows = [[ownerEmail, ownerNome, ROLE_MASTER]];
    if (body.incluirMeuAcesso !== false && email !== ownerEmail) rows.push([email, "Administrador do sistema", ROLE_MASTER]);
    rows.forEach((row, i) => {
      deps.sheets.updateValues(spreadsheetId, USUARIOS_TAB + "!A" + (i + 2) + ":C" + (i + 2), [row]);
    });
    deps.registry.add({ spreadsheetId: spreadsheetId, empresa: nome, criadaPor: email });
    deps.cache.remove("usr_" + spreadsheetId);
    return { spreadsheetId: spreadsheetId, empresa: nome, sheetName: "Lançamento" };
  });
}

// "Tab!A2:J" or "'Tipo de Produto'!A2:D" -> { tab, cells }. Anything else is refused.
function parseRange_(range) {
  if (typeof range !== "string" || range.length > 100) throw new GatewayError_(400, "Intervalo inválido.");
  const match = range.match(/^(?:'((?:[^']|'')+)'|([^'!]+))!([A-Za-z]{1,3}[0-9]{0,6}(?::[A-Za-z]{1,3}[0-9]{0,6})?)$/);
  if (!match) throw new GatewayError_(400, "Intervalo inválido.");
  const tab = match[1] ? match[1].replace(/''/g, "'") : match[2];
  return { tab: tab, cells: match[3].toUpperCase() };
}

function actionGetValues_(deps, access, spreadsheet, body) {
  const parsed = parseRange_(body.range);
  if (parsed.tab === USUARIOS_TAB) {
    // The full user list is admin data (the app reads the caller's own row via "me").
    if (access.perfil !== ROLE_MASTER && !access.bootstrapOk) throw denied_();
  } else {
    const readable = READ_TABS.indexOf(parsed.tab) !== -1 || parsed.tab === spreadsheet.sheetName;
    if (!readable || !access.perfil) throw denied_();
  }
  const option = body.valueRenderOption === "UNFORMATTED_VALUE" ? "UNFORMATTED_VALUE" : null;
  return { values: deps.sheets.getValues(body.spreadsheetId, body.range, option) };
}

function validateRow_(values) {
  if (!Array.isArray(values) || values.length !== 1 || !Array.isArray(values[0])) {
    throw new GatewayError_(400, "Dados inválidos.");
  }
  const row = values[0];
  if (row.length > MAX_ROW_CELLS) throw new GatewayError_(400, "Dados inválidos.");
  row.forEach((cell) => {
    const type = typeof cell;
    if (cell === null || type === "number" || type === "boolean") return;
    if (type === "string" && cell.length <= MAX_CELL_CHARS) return;
    throw new GatewayError_(400, "Dados inválidos.");
  });
  return row;
}

function actionUpdateValues_(deps, email, access, spreadsheet, body) {
  const parsed = parseRange_(body.range);
  const row = validateRow_(body.values);
  const canEdit = access.perfil === ROLE_EDITOR || access.perfil === ROLE_MASTER;

  if (parsed.tab === USUARIOS_TAB) {
    if (!canWriteUsuarios_(access, email, parsed, row)) throw denied_();
  } else {
    const isLookup = LOOKUP_TABS.indexOf(parsed.tab) !== -1;
    const writable = WRITE_TABS.indexOf(parsed.tab) !== -1 || parsed.tab === spreadsheet.sheetName;
    // The support lists (lojas, contas, categorias...) are edited by the company's Master only.
    if (isLookup) {
      if (access.perfil !== ROLE_MASTER) throw denied_();
    } else if (!writable || !canEdit) {
      throw denied_();
    }
  }

  return deps.lock(() => {
    deps.sheets.updateValues(body.spreadsheetId, body.range, [row]);
    if (parsed.tab === USUARIOS_TAB) deps.cache.remove("usr_" + body.spreadsheetId);
    return { updated: true };
  });
}

// Usuários writes: a Master may write anywhere on the tab; the very first
// setup of a company (empty tab, admin email) may only write its own Master
// row + the header; anyone else may only rename THEMSELVES (their own Nome cell).
function canWriteUsuarios_(access, email, parsed, row) {
  if (access.perfil === ROLE_MASTER) return true;

  if (access.bootstrapOk) {
    if (/^A1:C1$/.test(parsed.cells)) {
      return row.length === 3 && row[0] === "Email" && row[1] === "Nome" && row[2] === "Perfil";
    }
    return (
      /^A[0-9]+:C[0-9]+$/.test(parsed.cells) &&
      row.length === 3 &&
      String(row[0]).trim().toLowerCase() === email &&
      row[2] === ROLE_MASTER
    );
  }

  const own = /^B([0-9]+):B\1$/.exec(parsed.cells);
  if (own && access.entry && row.length === 1 && typeof row[0] === "string") {
    return Number(own[1]) === access.entry.linha;
  }
  return false;
}

function actionAddTab_(deps, access, body) {
  if (body.title !== USUARIOS_TAB) throw denied_();
  if (access.perfil !== ROLE_MASTER && !access.bootstrapOk) throw denied_();
  return deps.lock(() => {
    deps.sheets.addTab(body.spreadsheetId, USUARIOS_TAB);
    deps.cache.remove("usr_" + body.spreadsheetId);
    return { created: true };
  });
}
