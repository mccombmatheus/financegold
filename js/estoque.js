// Columns (A..P): Produto, Tipo, Marca, Condição, Estado, Peso em grama, Pureza (k),
// Valor de Custo, Valor de venda, Data de Compra, Data de Venda, Comprador, Vendedor,
// Loja, Vendido?, Observação
function parseEstoqueRow(row, linha) {
  return {
    linha,
    produto: row[0] || null,
    tipo: row[1] || null,
    marca: row[2] || null,
    condicao: row[3] || null,
    estado: row[4] || null,
    pesoGrama: typeof row[5] === "number" ? row[5] : null,
    pureza: typeof row[6] === "number" ? row[6] : null,
    valorCusto: typeof row[7] === "number" ? row[7] : null,
    valorVenda: typeof row[8] === "number" ? row[8] : null,
    dataCompra: sheetSerialToDate(row[9]),
    dataVenda: sheetSerialToDate(row[10]),
    comprador: row[11] || null,
    vendedor: row[12] || null,
    loja: row[13] || null,
    vendido: row[14] === true,
    observacao: row[15] || "",
    raw: row.slice(0, 16),
  };
}

async function fetchEstoque(token) {
  const rows = await fetchSheetValues(CONFIG.SPREADSHEET_ID, "Estoque!A2:P", token, {
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const items = [];
  rows.forEach((row, index) => {
    if (row[0] === undefined || row[0] === null || row[0] === "") return;
    items.push(parseEstoqueRow(row, index + 2));
  });
  return items;
}

// Same reasoning as findNextLancamentoRow: values:append's table-detection
// heuristic is unreliable on this workbook, so we compute the target row
// ourselves and write directly to it.
async function findNextEstoqueRow(token) {
  const rows = await fetchSheetValues(CONFIG.SPREADSHEET_ID, "Estoque!A2:A", token, {
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  let lastDataOffset = -1;
  rows.forEach((row, index) => {
    if (row[0] !== undefined && row[0] !== null && row[0] !== "") lastDataOffset = index;
  });
  const lastDataRow = lastDataOffset === -1 ? 1 : 2 + lastDataOffset;
  return lastDataRow + 1;
}

// Notes are appended to Observação separated by " / ", never overwriting what's there.
function appendObservacao(existing, note) {
  const trimmed = (existing || "").trim();
  return trimmed ? `${trimmed} / ${note}` : note;
}

// The custody marker is always the LAST " / "-separated segment, since notes are
// only ever appended at the end — so the most recent note is also the rightmost one.
function parseCustodyFromObservacao(observacao) {
  if (!observacao) return null;
  const segments = observacao.split(" / ");
  const last = segments[segments.length - 1].trim();
  const match = last.match(/^Com vendedor:\s*(.+)$/i);
  return match ? match[1].trim() : null;
}

function computeEstoqueStatus(item) {
  if (item.vendido) return "vendido";
  if (parseCustodyFromObservacao(item.observacao)) return "com-vendedor";
  return "em-estoque";
}

async function writeEstoqueRow(item, patchedRaw, token) {
  const range = `Estoque!A${item.linha}:P${item.linha}`;
  await updateSheetRow(CONFIG.SPREADSHEET_ID, range, patchedRaw, token);
}

async function markEstoqueCustody(item, pessoaNome, token) {
  const raw = item.raw.slice();
  raw[15] = appendObservacao(item.observacao, `Com vendedor: ${pessoaNome}`);
  await writeEstoqueRow(item, raw, token);
}

async function returnEstoqueToStore(item, token) {
  const raw = item.raw.slice();
  raw[15] = appendObservacao(item.observacao, "Retornou à loja");
  await writeEstoqueRow(item, raw, token);
}

async function markEstoqueVendido(item, { comprador, vendedor, valorVenda, dataVenda }, token) {
  const raw = item.raw.slice();
  raw[8] = valorVenda;
  raw[10] = dateInputToSheetSerial(dataVenda);
  raw[11] = comprador;
  raw[12] = vendedor || "";
  raw[14] = true;
  await writeEstoqueRow(item, raw, token);
}

async function createEstoqueItem(values, token) {
  const targetRow = await findNextEstoqueRow(token);
  const raw = [
    values.produto,
    values.tipo,
    values.marca,
    values.condicao || "",
    values.estado || "",
    values.pesoGrama,
    values.pureza || "",
    values.valorCusto,
    "",
    dateInputToSheetSerial(values.dataCompra),
    "",
    "",
    "",
    values.loja,
    false,
    values.observacao || "",
  ];
  const range = `Estoque!A${targetRow}:P${targetRow}`;
  await updateSheetRow(CONFIG.SPREADSHEET_ID, range, raw, token);
  return targetRow;
}
