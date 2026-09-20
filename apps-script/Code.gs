/**
 * Finan. gateway — a Google Apps Script web app that sits between the app
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
    "1nZsFn7K2PpMq36jmBr6hjqHZU8gqHzjPUEzG0rFmmUQ": { empresa: "Ipanema Joias", sheetName: "Lançamento", segmento: "joalheria" },
    "1DdJs0mLYiJuMctNVc-xN1rZgs3OEXOgZI5JJjfeU2AA": { empresa: "Carolina Joias", sheetName: "Lançamento", segmento: "joalheria" },
  },

  // May set up a company whose Usuários tab is missing or empty (becoming its
  // first Master). Everyone else must be added by an existing Master.
  // The developer / system account comes first. The personal account stays here
  // only until the new one is confirmed working; then remove it (it would keep
  // seeing the Painel do sistema).
  ADMIN_EMAILS: ["finanponto@gmail.com"],

  // Where people are sent in the e-mails about access requests.
  APP_URL: "https://mccombmatheus.github.io/financegold/",
};

// Shown by the public banner (a GET on the /exec URL) so it is easy to confirm
// which version of this file is really deployed.
const GATEWAY_VERSION = "2026-09-20-cadastro-de-pessoas";

const USUARIOS_TAB = "Usuários";
const LOOKUP_TABS = ["Lojas", "Contas", "Empresas", "Categoria", "Pessoa", "Produto", "Tipo de Produto", "Marcas"];
const MAX_COMPANIES = 200;
const REQUESTS_TAB = "Solicitações";
const REQUEST_HEADERS = ["Data", "E-mail", "Nome", "Empresa", "Tipo", "Mensagem", "Status", "Nota"];
const MAX_PENDING_REQUESTS = 300;
const REQUEST_TYPES = ["nova", "existente"];
const REGISTRY_PROP = "REGISTRY_SPREADSHEET_ID";
const REGISTRY_TITLE = "Finan. — Registro de empresas";

// Structure of every company created from inside the app. A new company starts
// with just enough seed rows in the lists for the forms to be usable; its Master
// edits the lists later (Ajustes → Listas de apoio).
const LOOKUP_HEADERS = ["Código", "Nome", "Complemento"];
function seedRow_(n, nome, extra) {
  const row = [n, nome, n + " - " + nome];
  if (extra) row.push(extra);
  return row;
}
// Business segments. "id" is what travels between the app and this script; the
// brand is only used in titles of the spreadsheets created here. Keep the ids in
// sync with SEGMENTOS in js/segmentos.js.
const SEGMENTO_PADRAO = "joalheria";
const SEGMENTOS = {
  joalheria: { marca: "FinanGold", qtd: "Peso (g)", qtdEstoque: "Peso em grama", esp: "Pureza (k)" },
  petshop: { marca: "FinanPet" },
  comercio: { marca: "FinanShop" },
  servicos: { marca: "FinanServ" },
  alimentacao: { marca: "FinanFood" },
  saude: { marca: "FinanCare" },
  outro: { marca: "Finan." },
};
function segmentoValido_(id) {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(SEGMENTOS, id) ? id : SEGMENTO_PADRAO;
}

// The columns stay the same for every segment (so the app reads them the same
// way); only the header WORDS that name gold-specific things change.
function companyTemplate_(segmento) {
  const seg = SEGMENTOS[segmentoValido_(segmento)];
  const qtd = seg.qtd || "Quantidade";
  const qtdEstoque = seg.qtdEstoque || "Quantidade";
  const esp = seg.esp || "Especificação";
  return [
    { name: "Lançamento", dateCols: [0], headers: ["Data", "Loja", "Conta", "Empresa", "Categoria", "Valor", "Tipo", qtd, "Pessoa", "Observação"], seeds: () => [] },
    { name: "Estoque", dateCols: [9, 10], headers: ["Produto", "Tipo", "Marca", "Condição", "Estado", qtdEstoque, esp, "Valor de Custo", "Valor de venda", "Data de Compra", "Data de Venda", "Comprador", "Vendedor", "Loja", "Vendido?", "Observação"], seeds: () => [] },
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
}
const READ_TABS = ["Estoque", "Lojas", "Contas", "Empresas", "Categoria", "Pessoa", "Produto", "Tipo de Produto", "Marcas"];
const WRITE_TABS = ["Estoque"]; // plus the company's own ledger tab (sheetName)
const ROLE_VISUALIZADOR = "Visualizador";
const ROLE_EDITOR = "Editor";
const ROLE_MASTER = "Master";
const VALID_ROLES = [ROLE_VISUALIZADOR, ROLE_EDITOR, ROLE_MASTER];
const MAX_BODY_CHARS = 200000;
const MAX_CELL_CHARS = 2000;
const MAX_ROW_CELLS = 60;
const USUARIOS_CACHE_SECONDS = 20;

// "Configuração" tab: which tabs of the company's spreadsheet play which role,
// for companies whose tabs are not named like the defaults. Rows: Papel, Aba,
// where Papel is "lancamentos", "estoque" or "lista:<chave>". Everyone in the
// company may read it; only the Master writes it. It only ever ADDS tabs the
// app may use — Usuários and Configuração themselves can never be named in it.
const CONFIG_TAB = "Configuração";
const CONFIG_ROLES = ["lancamentos", "estoque"];
const CONFIG_LIST_KEYS = ["lojas", "contas", "empresas", "categorias", "pessoas", "produtos", "tiposProduto", "marcas"];
const MAX_CONFIG_ROWS = 30;

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
  return ContentService.createTextOutput("Finan. gateway ativo. Versão " + GATEWAY_VERSION);
}

// Run this from the Apps Script editor (it is NOT reachable through the web
// app): prints what has to be moved when the system changes accounts — the
// registry spreadsheet id and every company spreadsheet — with direct links.
function diagnostico_migracao() {
  const cache = CacheService.getScriptCache();
  const link = (id) => "https://docs.google.com/spreadsheets/d/" + id;
  console.log("Versão do servidor: " + GATEWAY_VERSION);
  console.log("Registro de empresas (propriedade " + REGISTRY_PROP + "): " + (PropertiesService.getScriptProperties().getProperty(REGISTRY_PROP) || "(ainda não criado)"));
  Object.keys(GATEWAY_CONFIG.SPREADSHEETS).forEach((id) => {
    console.log("Empresa fixa no servidor: " + GATEWAY_CONFIG.SPREADSHEETS[id].empresa + " -> " + link(id));
  });
  registryDeps_(cache).list().forEach((c) => {
    console.log("Empresa criada pelo app: " + c.empresa + " -> " + link(c.spreadsheetId));
  });
  const registryId = PropertiesService.getScriptProperties().getProperty(REGISTRY_PROP);
  if (registryId) console.log("Planilha do registro (transferir também): " + link(registryId));
}

// Run this from the Apps Script editor (it is NOT reachable through the web app)
// when someone says "my e-mail is authorised but I cannot get in". Put their
// address below, choose this function and press Run: the log shows, for each
// company, every row of the Usuários tab, how each e-mail was understood, whether
// it matches, near-misses (typos) and invisible characters.
const EMAIL_PARA_TESTAR = "mariateste@gmail.com";

function distanciaEdicao_(a, b) {
  if (a === b) return 0;
  let anterior = [];
  for (let j = 0; j <= b.length; j += 1) anterior.push(j);
  for (let i = 1; i <= a.length; i += 1) {
    const atual = [i];
    for (let j = 1; j <= b.length; j += 1) atual.push(Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    anterior = atual;
  }
  return anterior[b.length];
}

function diagnostico_acesso() {
  const deps = realDeps_();
  const alvo = canonEmail_(EMAIL_PARA_TESTAR);
  console.log("E-mail testado: " + EMAIL_PARA_TESTAR + "  (comparado como: " + alvo + ")");
  console.log("Versão do servidor: " + GATEWAY_VERSION);
  const empresas = companyMap_(deps);
  Object.keys(empresas).forEach((id) => {
    console.log("== " + empresas[id].empresa + " (" + id + ")");
    let rows;
    try {
      rows = Sheets.Spreadsheets.Values.get(id, USUARIOS_TAB + "!A2:C", { valueRenderOption: "UNFORMATTED_VALUE" }).values || [];
    } catch (err) {
      console.log("   Não consegui ler a aba Usuários desta planilha: " + err.message);
      return;
    }
    console.log("   " + rows.length + " linha(s) na aba Usuários.");
    let achou = false;
    rows.forEach((row, i) => {
      const cru = row[0];
      const n = i + 2;
      if (typeof cru !== "string" || !cru.trim()) {
        if (cru !== undefined && cru !== "") console.log("   linha " + n + ": a coluna A não é texto: " + JSON.stringify(cru));
        return;
      }
      const chave = canonEmail_(cru);
      const igual = chave === alvo;
      if (igual) achou = true;
      const estranhos = cru.split("").filter((c) => !/[\x21-\x7e]/.test(c)).map((c) => "U+" + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0"));
      let nota = "";
      if (igual) nota += "   <-- É ESTE (libera o acesso)";
      else if (distanciaEdicao_(chave, alvo) <= 2) nota += "   <-- MUITO PARECIDO: confira se há erro de digitação";
      if (estranhos.length) nota += "   [caracteres invisíveis ou fora do comum: " + estranhos.join(" ") + "]";
      console.log("   linha " + n + ": \"" + cru + "\"  perfil=" + (row[2] ? row[2] : "(vazio: vale Visualizador)") + nota);
    });
    console.log("   RESULTADO: " + (achou ? "o e-mail ESTÁ liberado nesta empresa." : "o e-mail NÃO está nesta empresa."));
  });
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
    requests: requestsDeps_(),
    mail: {
      // Plain text only, addressed to fixed recipients or to the requester.
      send: (msg) => MailApp.sendEmail({ to: msg.to, subject: msg.subject, body: msg.body, name: "Finan." }),
    },
    sheets: {
      // Creates the spreadsheet (owned by whoever deployed this script) with
      // every tab, header and seed row of companyTemplate_(segmento). Returns its id.
      createCompanySpreadsheet: (title, empresaNome, segmento) => {
        const template = companyTemplate_(segmento);
        const created = Sheets.Spreadsheets.create({
          properties: { title: title },
          sheets: template.map((t) => ({ properties: { title: t.name } })),
        });
        const id = created.spreadsheetId;
        Sheets.Spreadsheets.Values.batchUpdate(
          {
            valueInputOption: "RAW",
            data: template.map((t) => ({ range: t.name + "!A1", values: [t.headers].concat(t.seeds(empresaNome)) })),
          },
          id
        );
        const requests = [];
        created.sheets.forEach((sheet, i) => {
          (template[i].dateCols || []).forEach((col) => {
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
        const data = Sheets.Spreadsheets.Values.get(id, "Empresas!A2:F", { valueRenderOption: "UNFORMATTED_VALUE" });
        (data.values || []).forEach((row) => {
          if (row[0] && String(row[4] || "Sim") !== "Não") {
            out.push({ spreadsheetId: String(row[0]), empresa: String(row[1] || ""), sheetName: "Lançamento", segmento: segmentoValido_(String(row[5] || "")) });
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
        Sheets.Spreadsheets.Values.update({ values: [["ID da planilha", "Empresa", "Criada em", "Criada por", "Ativa", "Segmento"]] }, id, "Empresas!A1:F1", { valueInputOption: "RAW" });
        props.setProperty(REGISTRY_PROP, id);
      }
      const existing = Sheets.Spreadsheets.Values.get(id, "Empresas!A2:A");
      const next = (existing.values || []).length + 2;
      Sheets.Spreadsheets.Values.update(
        { values: [[entry.spreadsheetId, entry.empresa, new Date().toISOString(), entry.criadaPor, "Sim", segmentoValido_(entry.segmento)]] },
        id,
        "Empresas!A" + next + ":F" + next,
        { valueInputOption: "RAW" }
      );
      cache.remove("reg_list");
    },
  };
}

// Access requests live in the registry spreadsheet, tab "Solicitações"
// (created on first use). Columns: Data, E-mail, Nome, Empresa, Tipo,
// Mensagem, Status (Pendente/Atendida/Recusada), Nota.
function requestsDeps_() {
  const props = PropertiesService.getScriptProperties();

  function registryId_() {
    let id = props.getProperty(REGISTRY_PROP);
    if (!id) {
      const created = Sheets.Spreadsheets.create({ properties: { title: REGISTRY_TITLE }, sheets: [{ properties: { title: "Empresas" } }] });
      id = created.spreadsheetId;
      Sheets.Spreadsheets.Values.update({ values: [["ID da planilha", "Empresa", "Criada em", "Criada por", "Ativa", "Segmento"]] }, id, "Empresas!A1:F1", { valueInputOption: "RAW" });
      props.setProperty(REGISTRY_PROP, id);
    }
    const titles = (Sheets.Spreadsheets.get(id, { fields: "sheets.properties.title" }).sheets || []).map((x) => x.properties.title);
    if (titles.indexOf(REQUESTS_TAB) === -1) {
      Sheets.Spreadsheets.batchUpdate({ requests: [{ addSheet: { properties: { title: REQUESTS_TAB } } }] }, id);
      Sheets.Spreadsheets.Values.update({ values: [REQUEST_HEADERS] }, id, REQUESTS_TAB + "!A1:H1", { valueInputOption: "RAW" });
    }
    return id;
  }

  return {
    list: () => {
      if (!props.getProperty(REGISTRY_PROP)) return [];
      const id = registryId_();
      const data = Sheets.Spreadsheets.Values.get(id, REQUESTS_TAB + "!A2:H", { valueRenderOption: "UNFORMATTED_VALUE" });
      const out = [];
      (data.values || []).forEach((row, index) => {
        if (!row[1]) return;
        out.push({
          linha: index + 2,
          data: String(row[0] || ""),
          email: String(row[1]).trim().toLowerCase(),
          nome: String(row[2] || ""),
          empresa: String(row[3] || ""),
          tipo: String(row[4] || ""),
          mensagem: String(row[5] || ""),
          status: String(row[6] || "Pendente"),
          nota: String(row[7] || ""),
        });
      });
      return out;
    },
    add: (r) => {
      const id = registryId_();
      const existing = Sheets.Spreadsheets.Values.get(id, REQUESTS_TAB + "!A2:A");
      const next = (existing.values || []).length + 2;
      Sheets.Spreadsheets.Values.update(
        { values: [[new Date().toISOString(), r.email, r.nome, r.empresa, r.tipo, r.mensagem, "Pendente", ""]] },
        id,
        REQUESTS_TAB + "!A" + next + ":H" + next,
        { valueInputOption: "RAW" }
      );
    },
    setStatus: (linha, status, nota) => {
      const id = registryId_();
      Sheets.Spreadsheets.Values.update({ values: [[status, nota]] }, id, REQUESTS_TAB + "!G" + linha + ":H" + linha, { valueInputOption: "RAW" });
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
    if (!map[entry.spreadsheetId]) map[entry.spreadsheetId] = { empresa: entry.empresa, sheetName: entry.sheetName || "Lançamento", segmento: segmentoValido_(entry.segmento) };
  });
  return map;
}

function handleRequest(body, deps) {
  if (!body || typeof body !== "object") throw new GatewayError_(400, "Requisição inválida.");
  const email = deps.verifyToken(body.token);
  try {
    return despachar_(body, deps, email);
  } catch (err) {
    if (err instanceof GatewayError_) throw err;
    console.error(err);
    // Only reached AFTER the caller proved who they are: a short, sanitised reason
    // (e.g. "The caller does not have permission") makes real problems diagnosable
    // instead of a blank "internal error".
    throw new GatewayError_(500, "Erro interno no servidor do app. Detalhe: " + detalheSeguro_(err));
  }
}

function detalheSeguro_(err) {
  let texto = String(err && err.message ? err.message : err);
  texto = texto.replace(/[\r\n]+/g, " ").replace(/[A-Za-z0-9_-]{40,}/g, "…").trim();
  return texto.length > 220 ? texto.slice(0, 220) + "…" : texto;
}

function despachar_(body, deps, email) {
  const action = body.action;

  if (action === "me") return actionMe_(deps, email);
  if (action === "createCompany") return actionCreateCompany_(deps, email, body);
  if (action === "requestAccess") return actionRequestAccess_(deps, email, body);
  if (action === "listRequests") return actionListRequests_(deps, email);
  if (action === "resolveRequest") return actionResolveRequest_(deps, email, body);
  if (action === "listCompanies") return actionListCompanies_(deps, email);
  if (action === "forwardRequest") return actionForwardRequest_(deps, email, body);

  // Own keys only: "constructor" / "__proto__" / "toString" must not pass as a company id.
  const map = companyMap_(deps);
  const spreadsheet =
    typeof body.spreadsheetId === "string" && Object.prototype.hasOwnProperty.call(map, body.spreadsheetId) ? map[body.spreadsheetId] : null;
  if (!spreadsheet) throw new GatewayError_(403, "Empresa não permitida.");
  const access = getAccess_(deps, email, body.spreadsheetId);

  switch (action) {
    case "getTitles":
      if (!access.perfil && !access.bootstrapOk) throw denied_();
      return { titles: titlesFor_(deps, access, spreadsheet, body.spreadsheetId) };
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

// Tab names are company information too: everyone but the Master (and the
// first-setup admin) only sees the tabs the app may use for them.
function titlesFor_(deps, access, spreadsheet, spreadsheetId) {
  const all = deps.sheets.getTitles(spreadsheetId);
  if (access.perfil === ROLE_MASTER || access.bootstrapOk) return all;
  const cfg = loadConfigTabs_(deps, spreadsheetId);
  return all.filter(
    (t) =>
      t === USUARIOS_TAB || // its existence is not a secret (the app checks it at every sign-in); its CONTENT stays Master-only
      READ_TABS.indexOf(t) !== -1 ||
      t === spreadsheet.sheetName ||
      t === CONFIG_TAB ||
      t === cfg.lancamentos ||
      t === cfg.estoque ||
      cfg.listas.indexOf(t) !== -1
  );
}

function denied_() {
  return new GatewayError_(403, "Você não tem permissão para esta ação.");
}

// ---------------------------------------------------------------------------
// E-mails. The same person can be typed in the Usuários tab in many ways: capital
// letters, a stray space or invisible character copied from a chat/e-mail,
// "mailto:", "<a@b.com>", or — for Gmail — with dots in other places
// (maria.teste@ = mariateste@ = Maria.Teste@GMAIL.com: Google treats them
// as ONE account, and googlemail.com is the same as gmail.com). Access is decided
// by a canonical key, so a correct-looking entry never locks someone out.
// Only Gmail is folded like that; on any other domain dots stay significant.
// ---------------------------------------------------------------------------

function limparEmail_(valor) {
  if (typeof valor !== "string") return "";
  let v = valor.normalize ? valor.normalize("NFKC") : valor;
  v = v.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").replace(/\u00A0/g, " ").trim().toLowerCase();
  v = v.replace(/^mailto:/, "");
  const entre = v.match(/<([^<>\s]+@[^<>\s]+)>/);
  if (entre) v = entre[1];
  return v.trim();
}

function canonEmail_(valor) {
  const v = limparEmail_(valor);
  const arroba = v.lastIndexOf("@");
  if (arroba < 1) return v;
  let local = v.slice(0, arroba);
  let dominio = v.slice(arroba + 1);
  if (dominio === "gmail.com" || dominio === "googlemail.com") {
    local = local.split("+")[0].replace(/\./g, "");
    dominio = "gmail.com";
  }
  return local + "@" + dominio;
}

function normalizeRole_(value) {
  return VALID_ROLES.indexOf(value) !== -1 ? value : ROLE_VISUALIZADOR;
}

function isAdminEmail_(deps, email) {
  const chave = canonEmail_(email);
  return deps.config.ADMIN_EMAILS.some((a) => canonEmail_(a) === chave);
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
    if (typeof row[0] !== "string" || !limparEmail_(row[0])) return;
    usuarios.push({
      linha: index + 2,
      email: limparEmail_(row[0]),
      chave: canonEmail_(row[0]),
      nome: row[1] ? String(row[1]) : "",
      perfil: normalizeRole_(row[2]),
    });
  });
  deps.cache.put(cacheKey, JSON.stringify(usuarios), USUARIOS_CACHE_SECONDS);
  return usuarios;
}

// Reads the company's Configuração tab (short cache). Always returns a usable
// object: a missing / unreadable / hostile tab means "no configuration".
function loadConfigTabs_(deps, spreadsheetId) {
  const cacheKey = "cfg_" + spreadsheetId;
  const cached = deps.cache.get(cacheKey);
  if (cached) return JSON.parse(cached);
  const out = { lancamentos: null, estoque: null, listas: [] };
  let rows = [];
  try {
    rows = deps.sheets.getValues(spreadsheetId, CONFIG_TAB + "!A2:B" + (MAX_CONFIG_ROWS + 1), "UNFORMATTED_VALUE");
  } catch (err) {
    rows = [];
  }
  rows.slice(0, MAX_CONFIG_ROWS).forEach((row) => {
    const papel = typeof row[0] === "string" ? row[0].trim() : "";
    const aba = typeof row[1] === "string" ? row[1].trim() : "";
    if (!papel || !aba || aba.length > 100 || aba === USUARIOS_TAB || aba === CONFIG_TAB) return;
    if (CONFIG_ROLES.indexOf(papel) !== -1) out[papel] = aba;
    else if (papel.indexOf("lista:") === 0 && CONFIG_LIST_KEYS.indexOf(papel.slice(6)) !== -1) out.listas.push(aba);
  });
  deps.cache.put(cacheKey, JSON.stringify(out), USUARIOS_CACHE_SECONDS);
  return out;
}

function getAccess_(deps, email, spreadsheetId) {
  const usuarios = loadUsuarios_(deps, spreadsheetId);
  const chave = canonEmail_(email);
  const entry = usuarios ? usuarios.filter((u) => (u.chave || canonEmail_(u.email)) === chave)[0] : null;
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
        segmento: segmentoValido_(info.segmento),
        nome: access.entry.nome,
        perfil: access.entry.perfil,
        linha: access.entry.linha,
      });
    } else if (access.bootstrapOk) {
      bootstrap.push({ spreadsheetId: spreadsheetId, empresa: info.empresa, sheetName: info.sheetName, segmento: segmentoValido_(info.segmento) });
    }
  });
  const result = { companies: companies, bootstrap: bootstrap, superAdmin: isAdminEmail_(deps, email) };
  if (result.superAdmin && deps.requests) {
    result.pedidosPendentes = deps.requests.list().filter((r) => r.status === "Pendente").length;
  }
  if (companies.length === 0 && bootstrap.length === 0 && deps.requests) {
    const mine = deps.requests.list().filter((r) => canonEmail_(r.email) === canonEmail_(email));
    const last = mine[mine.length - 1];
    if (last) result.pedido = { status: last.status, empresa: last.empresa, data: last.data };
  }
  return result;
}

// Only the system administrators (ADMIN_EMAILS) can create a company. The new
// spreadsheet is created by this script, so it belongs to the account that
// deployed it; nobody needs it shared in Drive.
function actionCreateCompany_(deps, email, body) {
  if (!isAdminEmail_(deps, email)) throw denied_();
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const ownerEmail = limparEmail_(body.ownerEmail);
  const ownerNome = typeof body.ownerNome === "string" ? body.ownerNome.trim() : "";
  if (body.segmento !== undefined && (typeof body.segmento !== "string" || !Object.prototype.hasOwnProperty.call(SEGMENTOS, body.segmento))) {
    throw new GatewayError_(400, "Segmento inválido.");
  }
  const segmento = segmentoValido_(body.segmento);
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
    const spreadsheetId = deps.sheets.createCompanySpreadsheet(nome + " — " + SEGMENTOS[segmento].marca, nome, segmento);
    const rows = [[ownerEmail, ownerNome, ROLE_MASTER]];
    // Separation of duties: the system administrator only enters a company's
    // data if they explicitly ask for it (support). Default: not a member.
    if (body.incluirMeuAcesso === true && canonEmail_(email) !== canonEmail_(ownerEmail)) rows.push([email, "Administrador do sistema", ROLE_MASTER]);
    rows.forEach((row, i) => {
      deps.sheets.updateValues(spreadsheetId, USUARIOS_TAB + "!A" + (i + 2) + ":C" + (i + 2), [row]);
    });
    deps.registry.add({ spreadsheetId: spreadsheetId, empresa: nome, criadaPor: email, segmento: segmento });
    deps.cache.remove("usr_" + spreadsheetId);
    return { spreadsheetId: spreadsheetId, empresa: nome, sheetName: "Lançamento", segmento: segmento };
  });
}

// Text typed by a stranger ends up in a spreadsheet and in an e-mail: keep it
// plain (no control characters, no line breaks in short fields).
function cleanText_(value, max, allowNewlines) {
  if (typeof value !== "string") return "";
  let v = value.replace(allowNewlines ? /[\u0000-\u0009\u000b\u000c\u000e-\u001f]/g : /[\u0000-\u001f]/g, " ");
  v = v.trim();
  return v.length > max ? v.slice(0, max) : v;
}

// Anyone with a verified Google account may ask for access — that is the whole
// point — so this is deliberately limited: one pending request per e-mail, a
// per-address cool-down, a cap on the pending pile, and short plain-text fields.
function actionRequestAccess_(deps, email, body) {
  if (!deps.requests) throw new GatewayError_(400, "Ação indisponível.");
  const nome = cleanText_(body.nome, 80, false);
  const empresa = cleanText_(body.empresa, 80, false);
  const mensagem = cleanText_(body.mensagem, 500, true);
  const tipo = REQUEST_TYPES.indexOf(body.tipo) !== -1 ? body.tipo : "";
  if (!nome) throw new GatewayError_(400, "Informe o seu nome.");
  if (!empresa) throw new GatewayError_(400, "Informe o nome da empresa.");
  if (!tipo) throw new GatewayError_(400, "Escolha o tipo de pedido.");

  const cooldownKey = "reqcool_" + canonEmail_(email);
  if (deps.cache.get(cooldownKey)) throw new GatewayError_(429, "Aguarde um minuto antes de enviar outro pedido.");

  return deps.lock(() => {
    const all = deps.requests.list();
    if (all.some((r) => canonEmail_(r.email) === canonEmail_(email) && r.status === "Pendente")) return { duplicate: true };
    if (all.filter((r) => r.status === "Pendente").length >= MAX_PENDING_REQUESTS) {
      throw new GatewayError_(503, "Muitos pedidos em análise. Tente mais tarde.");
    }
    deps.requests.add({ email: email, nome: nome, empresa: empresa, tipo: tipo, mensagem: mensagem });
    deps.cache.put(cooldownKey, "1", 60);

    // Best effort: a mail problem must never lose the request (it is saved above).
    try {
      deps.mail.send({
        to: deps.config.ADMIN_EMAILS.join(","),
        subject: "Finan.: pedido de acesso de " + nome,
        body:
          "Novo pedido de acesso ao Finan.\n\n" +
          "Nome: " + nome + "\n" +
          "E-mail: " + email + "\n" +
          "Empresa: " + empresa + "\n" +
          "Tipo: " + (tipo === "nova" ? "quer usar o Finan. na própria empresa" : "trabalha em uma empresa que já usa") + "\n" +
          "Mensagem: " + (mensagem || "(sem mensagem)") + "\n\n" +
          "Para responder, entre em " + deps.config.APP_URL + " e abra o Painel do sistema.",
      });
    } catch (err) {
      console.error(err);
    }
    return { duplicate: false };
  });
}

function actionListRequests_(deps, email) {
  if (!isAdminEmail_(deps, email)) throw denied_();
  const all = deps.requests ? deps.requests.list() : [];
  const pendentes = all.filter((r) => r.status === "Pendente");
  const recentes = all.filter((r) => r.status !== "Pendente").slice(-20);
  return { pendentes: pendentes, recentes: recentes };
}

// The administrator marks a request as handled (approved or declined). The
// actual granting (creating the company / adding the person) uses the existing,
// separately-checked actions; this only records the outcome and, unless told
// not to, e-mails the requester.
function actionResolveRequest_(deps, email, body) {
  if (!isAdminEmail_(deps, email)) throw denied_();
  const linha = Number(body.linha);
  const status = body.status;
  if (!Number.isInteger(linha) || linha < 2) throw new GatewayError_(400, "Pedido inválido.");
  if (status !== "Atendida" && status !== "Recusada") throw new GatewayError_(400, "Situação inválida.");
  const nota = cleanText_(body.nota, 200, false);

  return deps.lock(() => {
    const pedido = deps.requests.list().filter((r) => r.linha === linha)[0];
    if (!pedido) throw new GatewayError_(400, "Pedido não encontrado.");
    if (pedido.status !== "Pendente") throw new GatewayError_(400, "Esse pedido já foi respondido.");
    deps.requests.setStatus(linha, status, nota);
    if (body.avisar !== false) {
      try {
        deps.mail.send({
          to: pedido.email,
          subject: status === "Atendida" ? "Finan.: seu acesso foi liberado" : "Finan.: sobre o seu pedido de acesso",
          body:
            status === "Atendida"
              ? "Olá, " + pedido.nome + ".\n\nSeu acesso ao Finan. foi liberado. Entre com esta mesma conta Google (" + pedido.email + ") em " + deps.config.APP_URL + "\n"
              : "Olá, " + pedido.nome + ".\n\nNão foi possível liberar o seu acesso ao Finan. agora." + (nota ? "\n\n" + nota : "") + "\n",
        });
      } catch (err) {
        console.error(err);
      }
    }
    return { resolved: true };
  });
}

// Administrative overview for the system console: which companies exist, how
// many people each has and who their Master(s) are. No business data (no
// lançamentos, no estoque) is ever returned here.
function actionListCompanies_(deps, email) {
  if (!isAdminEmail_(deps, email)) throw denied_();
  const known = companyMap_(deps);
  const fixed = deps.config.SPREADSHEETS;
  const out = [];
  Object.keys(known).slice(0, MAX_COMPANIES).forEach((spreadsheetId) => {
    let usuarios = null;
    try {
      usuarios = loadUsuarios_(deps, spreadsheetId);
    } catch (err) {
      usuarios = null;
    }
    const list = usuarios || [];
    out.push({
      spreadsheetId: spreadsheetId,
      empresa: known[spreadsheetId].empresa,
      segmento: segmentoValido_(known[spreadsheetId].segmento),
      origem: fixed[spreadsheetId] ? "fixa" : "criada",
      usuarios: list.length,
      masters: list.filter((u) => u.perfil === ROLE_MASTER).map((u) => ({ nome: u.nome, email: u.email })),
    });
  });
  return { empresas: out };
}

// A person who says they work at a company that already uses the app is not
// the system administrator's to approve: the request is e-mailed to that
// company's own Master(s), who register the person in their own Ajustes.
function actionForwardRequest_(deps, email, body) {
  if (!isAdminEmail_(deps, email)) throw denied_();
  const linha = Number(body.linha);
  if (!Number.isInteger(linha) || linha < 2) throw new GatewayError_(400, "Pedido inválido.");
  const company = companyMap_(deps)[body.spreadsheetId];
  if (!company) throw new GatewayError_(400, "Empresa não encontrada.");

  return deps.lock(() => {
    const pedido = deps.requests.list().filter((r) => r.linha === linha)[0];
    if (!pedido) throw new GatewayError_(400, "Pedido não encontrado.");
    if (pedido.status !== "Pendente") throw new GatewayError_(400, "Esse pedido já foi respondido.");
    const masters = (loadUsuarios_(deps, body.spreadsheetId) || []).filter((u) => u.perfil === ROLE_MASTER);
    if (masters.length === 0) throw new GatewayError_(400, "Essa empresa não tem um administrador cadastrado.");

    deps.requests.setStatus(linha, "Encaminhada", "Encaminhado para " + company.empresa);
    try {
      deps.mail.send({
        to: masters.map((m) => m.email).join(","),
        subject: "Finan.: " + pedido.nome + " pediu acesso à " + company.empresa,
        body:
          pedido.nome + " (" + pedido.email + ") pediu acesso ao Finan. como pessoa da empresa " + company.empresa + ".\n\n" +
          "Mensagem: " + (pedido.mensagem || "(sem mensagem)") + "\n\n" +
          "Se você reconhece essa pessoa e quer liberar, entre em " + deps.config.APP_URL +
          " e abra Ajustes > Adicionar usuário, informando este e-mail e o perfil desejado. Se não reconhece, ignore esta mensagem.",
      });
      deps.mail.send({
        to: pedido.email,
        subject: "Finan.: seu pedido foi encaminhado",
        body: "Olá, " + pedido.nome + ".\n\nSeu pedido foi encaminhado ao administrador da empresa " + company.empresa + ", que decide quem tem acesso. Quando ele cadastrar o seu e-mail, é só entrar em " + deps.config.APP_URL + " com esta conta Google.\n",
      });
    } catch (err) {
      console.error(err);
    }
    return { forwarded: true, para: masters.length };
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
    if (!access.perfil) throw denied_();
    const cfg = loadConfigTabs_(deps, body.spreadsheetId);
    const readable =
      READ_TABS.indexOf(parsed.tab) !== -1 ||
      parsed.tab === spreadsheet.sheetName ||
      parsed.tab === CONFIG_TAB ||
      parsed.tab === cfg.lancamentos ||
      parsed.tab === cfg.estoque ||
      cfg.listas.indexOf(parsed.tab) !== -1;
    // The Master may read ANY tab: it is how they connect a sheet whose tabs have other names.
    if (!readable && access.perfil !== ROLE_MASTER) throw denied_();
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
  } else if (parsed.tab === CONFIG_TAB) {
    if (access.perfil !== ROLE_MASTER || !validConfigRow_(parsed, row)) throw denied_();
  } else {
    const cfg = loadConfigTabs_(deps, body.spreadsheetId);
    const isLookup = LOOKUP_TABS.indexOf(parsed.tab) !== -1 || cfg.listas.indexOf(parsed.tab) !== -1;
    const writable =
      WRITE_TABS.indexOf(parsed.tab) !== -1 ||
      parsed.tab === spreadsheet.sheetName ||
      parsed.tab === cfg.lancamentos ||
      parsed.tab === cfg.estoque;
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
    if (parsed.tab === CONFIG_TAB) deps.cache.remove("cfg_" + body.spreadsheetId);
    return { updated: true };
  });
}

// One Configuração row: the header, or "papel, aba" with a known role and a
// tab name that is not one of the protected tabs.
function validConfigRow_(parsed, row) {
  if (!/^A[0-9]{1,3}:B[0-9]{1,3}$/.test(parsed.cells) && !/^A[0-9]{1,3}:C[0-9]{1,3}$/.test(parsed.cells)) return false;
  if (row.length < 2 || row.length > 3) return false;
  if (parsed.cells === "A1:B1" || parsed.cells === "A1:C1") return row[0] === "Papel" && row[1] === "Aba";
  const n = Number(/^A([0-9]+)/.exec(parsed.cells)[1]);
  if (n < 2 || n > MAX_CONFIG_ROWS + 1) return false;
  const papel = row[0];
  const aba = row[1];
  if (papel === "" && aba === "") return true; // clearing a row
  if (typeof papel !== "string" || typeof aba !== "string") return false;
  if (aba.trim() === "" || aba.length > 100 || aba === USUARIOS_TAB || aba === CONFIG_TAB) return false;
  const okPapel = CONFIG_ROLES.indexOf(papel) !== -1 || (papel.indexOf("lista:") === 0 && CONFIG_LIST_KEYS.indexOf(papel.slice(6)) !== -1);
  return okPapel;
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
      canonEmail_(row[0]) === canonEmail_(email) &&
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
  if (body.title !== USUARIOS_TAB && body.title !== CONFIG_TAB) throw denied_();
  if (body.title === CONFIG_TAB) {
    if (access.perfil !== ROLE_MASTER) throw denied_();
  } else if (access.perfil !== ROLE_MASTER && !access.bootstrapOk) {
    throw denied_();
  }
  return deps.lock(() => {
    deps.sheets.addTab(body.spreadsheetId, body.title);
    deps.cache.remove(body.title === USUARIOS_TAB ? "usr_" + body.spreadsheetId : "cfg_" + body.spreadsheetId);
    return { created: true };
  });
}
