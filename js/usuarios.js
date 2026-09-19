const USUARIOS_SHEET_NAME = "Usuários";

// Creates the "Usuários" tab (Email, Nome, Perfil) in the current company's
// spreadsheet the first time it's needed, and upgrades a pre-existing
// 2-column version (from before roles existed) in place.
async function ensureUsuariosSheet(token) {
  if (CONFIG.GATEWAY_URL) {
    // Gateway mode: the role migration below reads the whole Usuários tab,
    // which only a Master may do — and every company already went through it
    // in direct mode. Just make sure the tab exists (allowed for a Master or
    // the admin setting up a brand-new company; a no-op for everyone else).
    const existing = await getSheetTitles(CONFIG.SPREADSHEET_ID, token);
    if (!existing.includes(USUARIOS_SHEET_NAME)) {
      await createSheetTab(CONFIG.SPREADSHEET_ID, USUARIOS_SHEET_NAME, token);
      await updateSheetRow(CONFIG.SPREADSHEET_ID, `${USUARIOS_SHEET_NAME}!A1:C1`, ["Email", "Nome", "Perfil"], token);
    }
    return;
  }
  const titles = await getSheetTitles(CONFIG.SPREADSHEET_ID, token);
  if (!titles.includes(USUARIOS_SHEET_NAME)) {
    await createSheetTab(CONFIG.SPREADSHEET_ID, USUARIOS_SHEET_NAME, token);
    await updateSheetRow(CONFIG.SPREADSHEET_ID, `${USUARIOS_SHEET_NAME}!A1:C1`, ["Email", "Nome", "Perfil"], token);
    return;
  }
  await migrateUsuariosPerfilColumn(token);
}

// Rows written before the Perfil column existed had full access already —
// grandfather them in as Master rather than silently locking them out.
async function migrateUsuariosPerfilColumn(token) {
  const header = await fetchSheetValues(CONFIG.SPREADSHEET_ID, `${USUARIOS_SHEET_NAME}!A1:C1`, token, {
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const headerRow = header[0] || [];
  if (headerRow[2] !== "Perfil") {
    await updateSheetRow(CONFIG.SPREADSHEET_ID, `${USUARIOS_SHEET_NAME}!C1:C1`, ["Perfil"], token);
  }

  const rows = await fetchSheetValues(CONFIG.SPREADSHEET_ID, `${USUARIOS_SHEET_NAME}!A2:C`, token, {
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const writes = [];
  rows.forEach((row, index) => {
    if (!row[0]) return;
    if (!row[2]) {
      const linha = index + 2;
      writes.push(
        updateSheetRow(CONFIG.SPREADSHEET_ID, `${USUARIOS_SHEET_NAME}!C${linha}:C${linha}`, [ROLE_MASTER], token)
      );
    }
  });
  await Promise.all(writes);
}

async function fetchUsuario(email, token) {
  if (CONFIG.GATEWAY_URL) {
    // The gateway answers "who am I in this company" without exposing the list.
    const me = await gatewayCall("me", {}, token);
    const mine = me.companies.find((c) => c.spreadsheetId === CONFIG.SPREADSHEET_ID);
    return mine ? { linha: mine.linha, nome: mine.nome, perfil: mine.perfil } : null;
  }
  const rows = await fetchSheetValues(CONFIG.SPREADSHEET_ID, `${USUARIOS_SHEET_NAME}!A2:C`, token, {
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const normalized = email.trim().toLowerCase();
  let found = null;
  rows.forEach((row, index) => {
    if (typeof row[0] === "string" && row[0].trim().toLowerCase() === normalized) {
      found = {
        linha: index + 2,
        nome: row[1] ? String(row[1]) : "",
        perfil: row[2] || ROLE_VISUALIZADOR,
      };
    }
  });
  return found;
}

// Read-only check against a specific company's "Usuários" tab (not the
// currently-selected one): is this email listed there? Used at sign-in to
// discover which companies a person has been authorized for. It never creates
// or edits anything, and a person without Drive access to that spreadsheet just
// gets an API error, which the caller treats as "not listed".
async function isEmailListedInCompany(spreadsheetId, email, token) {
  const rows = await fetchSheetValues(spreadsheetId, `${USUARIOS_SHEET_NAME}!A2:A`, token, {
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const normalized = email.trim().toLowerCase();
  return rows.some((row) => typeof row[0] === "string" && row[0].trim().toLowerCase() === normalized);
}

async function fetchAllUsuarios(token) {
  const rows = await fetchSheetValues(CONFIG.SPREADSHEET_ID, `${USUARIOS_SHEET_NAME}!A2:C`, token, {
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const usuarios = [];
  rows.forEach((row, index) => {
    if (!row[0]) return;
    usuarios.push({
      linha: index + 2,
      email: String(row[0]),
      nome: row[1] ? String(row[1]) : "",
      perfil: row[2] || ROLE_VISUALIZADOR,
    });
  });
  return usuarios;
}

async function findNextUsuarioRow(token) {
  const rows = await fetchSheetValues(CONFIG.SPREADSHEET_ID, `${USUARIOS_SHEET_NAME}!A2:A`, token, {
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  let lastDataOffset = -1;
  rows.forEach((row, index) => {
    if (row[0] !== undefined && row[0] !== null && row[0] !== "") lastDataOffset = index;
  });
  const lastDataRow = lastDataOffset === -1 ? 1 : 2 + lastDataOffset;
  return lastDataRow + 1;
}

// Bootstrap-only self-registration: the FIRST person to reach a company with
// no one in its Usuários tab yet becomes Master (there's no admin yet to have
// added them). Returns the assigned perfil.
async function registerUsuario(email, nome, token) {
  const existing = await fetchAllUsuarios(token);
  const perfil = existing.length === 0 ? ROLE_MASTER : ROLE_VISUALIZADOR;
  const targetRow = await findNextUsuarioRow(token);
  await updateSheetRow(CONFIG.SPREADSHEET_ID, `${USUARIOS_SHEET_NAME}!A${targetRow}:C${targetRow}`, [email, nome, perfil], token);
  return { perfil, linha: targetRow };
}

async function updateUsuarioNome(linha, nome, token) {
  await updateSheetRow(CONFIG.SPREADSHEET_ID, `${USUARIOS_SHEET_NAME}!B${linha}:B${linha}`, [nome], token);
}

// Master-driven addition, with an explicit chosen role (used by the "Gerenciar
// usuários" screen — this is the normal way people get access from now on).
async function addUsuario(email, nome, perfil, token) {
  const targetRow = await findNextUsuarioRow(token);
  await updateSheetRow(CONFIG.SPREADSHEET_ID, `${USUARIOS_SHEET_NAME}!A${targetRow}:C${targetRow}`, [email, nome, perfil], token);
}

async function updateUsuarioPerfil(linha, perfil, token) {
  await updateSheetRow(CONFIG.SPREADSHEET_ID, `${USUARIOS_SHEET_NAME}!C${linha}:C${linha}`, [perfil], token);
}
