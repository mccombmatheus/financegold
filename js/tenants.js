// Maps a logged-in Google account to the compan(ies) it manages. Each email
// maps to an ARRAY of company profiles: one entry = go straight into the app;
// more than one = the user picks which company to work in after login (see
// showCompanyPicker in js/app.js).
//
// This routing is a convenience, not the real access control: a user can only
// actually read/write a spreadsheet if that Google account also has Drive
// sharing access to it. To onboard a new company for someone: share its
// spreadsheet with their Google account in Drive, then add/extend their entry
// here. The new spreadsheet must follow the same tab/column layout as the
// existing one (Lançamento, Estoque, Lojas, Contas, Empresas, Categoria,
// Pessoa, Produto, "Tipo de Produto", Marcas) — the app's code assumes it.
const TENANTS = {
  "mccomb.matheus@gmail.com": [
    {
      empresa: "Ipanema Joias",
      spreadsheetId: "1nZsFn7K2PpMq36jmBr6hjqHZU8gqHzjPUEzG0rFmmUQ",
      sheetName: "Lançamento",
    },
    {
      empresa: "Carolina Joias",
      spreadsheetId: "1DdJs0mLYiJuMctNVc-xN1rZgs3OEXOgZI5JJjfeU2AA",
      sheetName: "Lançamento",
    },
  ],
};

// Google account emails aren't guaranteed to come back in exactly the casing
// stored here — normalize both sides so a legitimate user is never denied
// access over a casing mismatch (matches the normalization already used in
// js/usuarios.js's fetchUsuario).
function lookupTenants(email) {
  const normalized = (email || "").trim().toLowerCase();
  const match = Object.keys(TENANTS).find((key) => key.toLowerCase() === normalized);
  return match ? TENANTS[match] : undefined;
}

// Every company this app knows about, deduplicated across all TENANTS entries.
// Used at sign-in to look for the signed-in email in each company's own
// "Usuários" tab, so a Master adding someone in Ajustes is enough to route them
// there — no per-person entry (and no code push) needed in TENANTS above.
function allKnownCompanies() {
  const byId = new Map();
  Object.values(TENANTS).forEach((list) => {
    list.forEach((company) => {
      if (!byId.has(company.spreadsheetId)) byId.set(company.spreadsheetId, company);
    });
  });
  return Array.from(byId.values());
}
