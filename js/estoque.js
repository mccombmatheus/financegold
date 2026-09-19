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


// Stock tab, read by header name (see js/esquema.js). Each item carries .linha
// (its sheet row) and .raw (the whole row, padded to the sheet's width): writes
// start from a copy of .raw and patch only the columns found, so a partial
// update can never blank an unrelated column — whatever the layout.
async function fetchEstoque(token) {
  const rows = await lerLinhasDaAba("estoque", token);
  const esquema = detectarEsquema(rows, "estoque");
  guardarEsquema("estoque", esquema);
  const { itens, ignoradas } = interpretarEstoque(rows, esquema);
  ultimoResumoLeitura.estoque = ignoradas;
  return itens;
}

// Same reasoning as findNextLancamentoRow: values:append's table-detection
// heuristic is unreliable, so the target row is computed and written directly.
async function findNextEstoqueRow(token) {
  return acharProximaLinha("estoque", "produto", token);
}

// Changes only the given fields of an item, in the sheet's own columns; every
// other cell of the row is left alone. Fields the sheet has no column for are
// skipped; if NONE could be written the action fails loudly instead of
// pretending it worked.
async function gravarCamposEstoque(item, campos, token) {
  const esquema = await garantirEsquema("estoque", token);
  const { porColuna, ausentes } = colunasParaEscrever(esquema, campos, []);
  if (Object.keys(porColuna).length === 0 || ausentes.length === Object.keys(campos).length) {
    throw new Error("A planilha não tem as colunas necessárias para esta ação.");
  }
  await escreverColunas("estoque", item.linha, porColuna, esquema.cols.produto, token);
}

async function markEstoqueCustody(item, pessoaNome, token) {
  await gravarCamposEstoque(item, { observacao: appendObservacao(item.observacao, `Com vendedor: ${pessoaNome}`) }, token);
}

async function returnEstoqueToStore(item, token) {
  await gravarCamposEstoque(item, { observacao: appendObservacao(item.observacao, "Retornou à loja") }, token);
}

async function markEstoqueVendido(item, { comprador, vendedor, valorVenda, dataVenda }, token) {
  await gravarCamposEstoque(
    item,
    {
      valorVenda: valorVenda,
      dataVenda: dateInputToSheetSerial(dataVenda),
      comprador: comprador,
      vendedor: vendedor || "",
      vendido: true,
    },
    token
  );
}

async function createEstoqueItem(values, token) {
  const esquema = await garantirEsquema("estoque", token);
  if (esquema.cols.produto === undefined) throw new Error("Não encontrei a coluna de Produto na planilha.");
  const { porColuna } = colunasParaEscrever(esquema, {
    produto: values.produto,
    tipo: values.tipo,
    marca: values.marca,
    condicao: values.condicao || "",
    estado: values.estado || "",
    pesoGrama: values.pesoGrama,
    pureza: values.pureza || "",
    valorCusto: values.valorCusto,
    dataCompra: dateInputToSheetSerial(values.dataCompra),
    loja: values.loja,
    vendido: false,
    observacao: values.observacao || "",
  }, values.extras);
  const targetRow = await findNextEstoqueRow(token);
  await escreverColunas("estoque", targetRow, porColuna, esquema.cols.produto, token);
  return targetRow;
}
