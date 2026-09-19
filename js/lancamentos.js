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

// The ledger is read by header name, not by fixed column position (see
// js/esquema.js): columns may come in any order, with extras, other words, dates
// as text. `ultimoResumoLeitura` says how many lines could not be read.
let ultimoResumoLeitura = { lancamentos: 0, estoque: 0 };

async function fetchLancamentos(token) {
  const rows = await lerLinhasDaAba("lancamentos", token);
  const esquema = detectarEsquema(rows, "lancamentos");
  guardarEsquema("lancamentos", esquema);
  const { registros, ignoradas } = interpretarLancamentos(rows, esquema);
  ultimoResumoLeitura.lancamentos = ignoradas;
  return registros;
}

// Next empty row below the data (never values:append — see the note in CLAUDE.md).
async function findNextLancamentoRow(token) {
  return acharProximaLinha("lancamentos", "data", token);
}
