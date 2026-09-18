function stripCode(value) {
  if (typeof value !== "string") return value;
  return value.replace(/^\s*\d+\s*-\s*/, "").trim();
}

function sheetSerialToDate(serial) {
  if (typeof serial !== "number") return null;
  const utcDays = Math.floor(serial - 25569);
  return new Date(utcDays * 86400 * 1000);
}

// Inverse of sheetSerialToDate: turns an <input type="date"> value ("YYYY-MM-DD")
// into the same serial-number representation the sheet already stores dates in,
// so a new row is written the same way the rest of the column is (not as text).
function dateInputToSheetSerial(value) {
  const [year, month, day] = value.split("-").map(Number);
  const utcMs = Date.UTC(year, month - 1, day);
  const epochMs = Date.UTC(1899, 11, 30);
  return Math.round((utcMs - epochMs) / 86400000);
}

function toNumber(value) {
  return typeof value === "number" ? value : 0;
}

// Columns (A..J): Data, Loja, Conta, Empresa, Categoria, Valor, Tipo, Peso (g), Pessoa, Observação
function parseLancamentoRow(row, linha) {
  return {
    linha,
    data: sheetSerialToDate(row[0]),
    loja: stripCode(row[1]) || null,
    conta: stripCode(row[2]) || null,
    empresa: stripCode(row[3]) || null,
    categoria: stripCode(row[4]) || null,
    valor: toNumber(row[5]),
    tipo: row[6] || null,
    peso: typeof row[7] === "number" ? row[7] : null,
    pessoa: stripCode(row[8]) || null,
    observacao: row[9] || null,
  };
}

// Scans column A (Data) to find the real last row with data, ignoring both
// mid-sheet gaps and the large formatted-but-empty tail the sheet has past
// its actual last entry, then returns the row number right after it.
async function findNextLancamentoRow(token) {
  const rows = await fetchSheetValues(CONFIG.SPREADSHEET_ID, `${CONFIG.SHEET_NAME}!A2:A`, token, {
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  let lastDataOffset = -1;
  rows.forEach((row, index) => {
    if (row[0] !== undefined && row[0] !== null && row[0] !== "") {
      lastDataOffset = index;
    }
  });

  const headerRow = 1;
  const lastDataRow = lastDataOffset === -1 ? headerRow : 2 + lastDataOffset;
  return lastDataRow + 1;
}

async function fetchLancamentos(token) {
  const range = `${CONFIG.SHEET_NAME}!A2:J`;
  const rows = await fetchSheetValues(CONFIG.SPREADSHEET_ID, range, token, {
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const records = [];
  rows.forEach((row, index) => {
    if (row[0] === undefined || row[0] === null || row[0] === "") return;
    records.push(parseLancamentoRow(row, index + 2));
  });
  return records;
}
