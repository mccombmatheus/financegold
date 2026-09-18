async function fetchSheetValues(spreadsheetId, range, token, options = {}) {
  const params = new URLSearchParams();
  if (options.valueRenderOption) {
    params.set("valueRenderOption", options.valueRenderOption);
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}${query}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Falha ao ler a planilha (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return data.values || [];
}

async function getSheetTitles(spreadsheetId, token) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Falha ao ler a estrutura da planilha (${response.status}): ${errorBody}`);
  }
  const data = await response.json();
  return (data.sheets || []).map((sheet) => sheet.properties.title);
}

async function createSheetTab(spreadsheetId, title, token) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Falha ao criar aba "${title}" (${response.status}): ${errorBody}`);
  }
  return response.json();
}

// Writes into a specific, already-known range (e.g. "Lançamento!A1572:J1572"),
// overwriting whatever is there. Used instead of values:append because append's
// "detect the table" heuristic gets confused by this sheet's large formatted-but-
// empty tail and lands new rows far past the real data instead of right after it.
async function updateSheetRow(spreadsheetId, range, rowValues, token) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [rowValues] }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Falha ao gravar na planilha (${response.status}): ${errorBody}`);
  }

  return response.json();
}
