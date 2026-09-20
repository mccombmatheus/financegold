// Gateway mode (CONFIG.GATEWAY_URL set): the four functions below call the
// Apps Script gateway instead of the Sheets API. It is a POST with a
// text/plain body on purpose — that is a "simple" request, so the browser sends
// no CORS preflight (Apps Script web apps can't answer one). The Google access
// token travels in the body, over HTTPS, for the gateway to verify.
async function gatewayCall(action, params, token) {
  const response = await fetch(CONFIG.GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(Object.assign({ action, token }, params)),
  });
  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    throw new Error("Resposta inválida do servidor do app. Tente novamente em instantes.");
  }
  if (payload && payload.ok !== true && payload.status === 401) {
    // Google access tokens last ~1 hour. Send the person back to the login
    // screen with a clear message instead of leaving a stray error on screen.
    const expired = new Error(payload.error || "Sessão expirada. Entre novamente.");
    expired.sessionExpired = true;
    if (typeof handleSessionExpired === "function") handleSessionExpired();
    throw expired;
  }
  if (!payload || payload.ok !== true) {
    const falha = new Error(traduzirErroDoServidor((payload && payload.error) || "Erro no servidor do app."));
    falha.status = payload && payload.status;
    throw falha;
  }
  return payload.data;
}

// The server appends a short technical reason to unexpected failures; the most
// common ones are turned into something a person can act on.
function traduzirErroDoServidor(mensagem) {
  const m = String(mensagem);
  if (/does not have permission|PERMISSION_DENIED|caller does not have/i.test(m)) {
    return "O servidor do app não tem permissão de edição nesta planilha. Quem é dono da planilha precisa compartilhá-la, como Editor, com a conta do sistema (" + (CONFIG.CONTA_DO_SISTEMA || "a conta que publicou o servidor") + "). " + m;
  }
  if (/exceeds grid limits|Range \(.*\) exceeds/i.test(m)) {
    return "A aba da planilha chegou ao limite de linhas. Adicione mais linhas na planilha e tente de novo. " + m;
  }
  if (/Unable to parse range|not found|Requested entity was not found/i.test(m)) {
    return "O servidor não encontrou a planilha ou a aba pedida. Confira se ela ainda existe. " + m;
  }
  return m;
}

async function fetchSheetValues(spreadsheetId, range, token, options = {}) {
  if (CONFIG.GATEWAY_URL) {
    const data = await gatewayCall(
      "getValues",
      { spreadsheetId, range, valueRenderOption: options.valueRenderOption },
      token
    );
    return data.values || [];
  }
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
  if (CONFIG.GATEWAY_URL) {
    return (await gatewayCall("getTitles", { spreadsheetId }, token)).titles;
  }
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
  if (CONFIG.GATEWAY_URL) {
    return gatewayCall("addTab", { spreadsheetId, title }, token);
  }
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
  if (CONFIG.GATEWAY_URL) {
    return gatewayCall("updateValues", { spreadsheetId, range, values: [rowValues] }, token);
  }
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
