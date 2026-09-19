// Which tab of the company's spreadsheet plays which role, and what layout each
// one was found to have. Defaults are the original names ("Lançamento",
// "Estoque", "Lojas"...); a company whose tabs are named differently is
// "connected" once by its Master (Ajustes → Conectar planilha), which writes a
// small "Configuração" tab. Layouts (column positions) are NOT configured: they
// are detected on every load (js/esquema.js) and remembered here only so the
// forms still know where to write while offline.

const ABA_CONFIG = "Configuração";
const ABAS_LISTAS_PADRAO = {
  lojas: "Lojas",
  contas: "Contas",
  empresas: "Empresas",
  categorias: "Categoria",
  pessoas: "Pessoa",
  produtos: "Produto",
  tiposProduto: "Tipo de Produto",
  marcas: "Marcas",
};

let abasConfiguradas = {};
let esquemasEmMemoria = {};

function chaveArmazenamento(nome) {
  return `financegold_${nome}_${CONFIG.SPREADSHEET_ID}`;
}

function nomeAba(papel) {
  if (papel === "lancamentos") return abasConfiguradas.lancamentos || CONFIG.SHEET_NAME || "Lançamento";
  if (papel === "estoque") return abasConfiguradas.estoque || "Estoque";
  return abasConfiguradas[`lista:${papel}`] || ABAS_LISTAS_PADRAO[papel];
}

// 'Tipo de Produto'!A2:D — always quoted, so any tab name works.
function intervaloAba(nome, celulas) {
  return `'${String(nome).replace(/'/g, "''")}'!${celulas}`;
}

function resetarAbasDaEmpresa() {
  abasConfiguradas = {};
  esquemasEmMemoria = {};
}

// Reads the "Configuração" tab (papel, aba). A company without it uses the
// default names. Only a real connection problem is passed on; a missing tab is
// simply "no configuration".
async function carregarConfiguracaoAbas(token) {
  const chave = chaveArmazenamento("abas");
  try {
    const rows = await fetchSheetValues(CONFIG.SPREADSHEET_ID, intervaloAba(ABA_CONFIG, "A2:C"), token, {
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const config = {};
    rows.forEach((row) => {
      const papel = typeof row[0] === "string" ? row[0].trim() : "";
      const aba = typeof row[1] === "string" ? row[1].trim() : "";
      if (papel && aba) config[papel] = aba;
    });
    abasConfiguradas = config;
    try {
      localStorage.setItem(chave, JSON.stringify(config));
    } catch (err) {
      // best effort
    }
  } catch (err) {
    if (err && err.sessionExpired) throw err;
    if (isNetworkError(err)) {
      try {
        abasConfiguradas = JSON.parse(localStorage.getItem(chave) || "{}");
      } catch (e) {
        abasConfiguradas = {};
      }
      return abasConfiguradas;
    }
    abasConfiguradas = {}; // no Configuração tab (or not readable): defaults
  }
  return abasConfiguradas;
}

// The tab's rows, or a plain-language error when the tab does not exist.
async function lerLinhasDaAba(papel, token) {
  const aba = nomeAba(papel);
  try {
    return await fetchSheetValues(CONFIG.SPREADSHEET_ID, intervaloAba(aba, "A1:BZ"), token, {
      valueRenderOption: "UNFORMATTED_VALUE",
    });
  } catch (err) {
    if (err && (err.sessionExpired || isNetworkError(err))) throw err;
    let titulos = null;
    try {
      titulos = await getSheetTitles(CONFIG.SPREADSHEET_ID, token);
    } catch (e) {
      titulos = null;
    }
    if (titulos && titulos.indexOf(aba) === -1) {
      const oque = papel === "lancamentos" ? "o fluxo de caixa" : "o estoque";
      const dica = isMaster(currentUserRole)
        ? `Abra Ajustes → Conectar planilha e escolha qual aba é ${oque}.`
        : "Peça ao administrador da empresa para conectar a planilha (Ajustes → Conectar planilha).";
      throw new Error(`A aba "${aba}" não existe nesta planilha. ${dica}`);
    }
    throw err;
  }
}

function temListasConectadas() {
  return Object.keys(abasConfiguradas).some((k) => k.indexOf("lista:") === 0);
}

// --- layouts ---------------------------------------------------------------

function guardarEsquema(papel, esquema) {
  esquemasEmMemoria[`${CONFIG.SPREADSHEET_ID}:${papel}`] = esquema;
  try {
    localStorage.setItem(chaveArmazenamento(`esquema_${papel}`), JSON.stringify(esquema));
  } catch (err) {
    // best effort
  }
}

function obterEsquema(papel) {
  const memoria = esquemasEmMemoria[`${CONFIG.SPREADSHEET_ID}:${papel}`];
  if (memoria) return memoria;
  try {
    const bruto = localStorage.getItem(chaveArmazenamento(`esquema_${papel}`));
    if (bruto) return JSON.parse(bruto);
  } catch (err) {
    // fall through
  }
  return null;
}

// The layout used before adaptive reading existed (original columns).
function esquemaPadrao(papel) {
  const cols = Object.assign({}, POSICOES_PADRAO[papel]);
  return {
    papel: papel,
    linhaCabecalho: 1,
    cols: cols,
    largura: papel === "lancamentos" ? 10 : 16,
    cabecalho: [],
    extras: [],
    reconhecidos: [],
    incerto: false,
    rotuloEntrada: "Entrada",
    rotuloSaida: "Saída",
    saidaNegativa: true,
    codigoNoTexto: {},
  };
}

// The layout of the current company's tab: from this session, from the last
// load, or read now (first rows only) — used by writes.
async function garantirEsquema(papel, token) {
  const existente = obterEsquema(papel);
  if (existente) return existente;
  const rows = await fetchSheetValues(CONFIG.SPREADSHEET_ID, intervaloAba(nomeAba(papel), "A1:BZ60"), token, {
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const esquema = detectarEsquema(rows, papel);
  guardarEsquema(papel, esquema);
  return esquema;
}

// The first empty row below the data. The column that always has a value (Data
// / Produto) gives the first candidate; then the rows from there are checked so
// nothing that is written in a recognised column (a "Total" line, a note) is
// ever overwritten. Unrecognised columns (a formula filled down the sheet) are
// ignored on purpose, or the new row would land below the whole formula area.
async function acharProximaLinha(papel, campoChave, token) {
  const esquema = await garantirEsquema(papel, token);
  const col = esquema.cols[campoChave];
  if (col === undefined) throw new Error(`Não encontrei a coluna "${NOMES_CAMPOS[campoChave]}" na planilha.`);
  const letra = colunaLetra(col);
  const primeira = esquema.linhaCabecalho + 1;
  const aba = nomeAba(papel);
  const colunaChave = await fetchSheetValues(CONFIG.SPREADSHEET_ID, intervaloAba(aba, `${letra}${primeira}:${letra}`), token, {
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  let ultimo = -1;
  colunaChave.forEach((row, i) => {
    if (row[0] !== undefined && row[0] !== null && String(row[0]).trim() !== "") ultimo = i;
  });
  const candidata = ultimo === -1 ? primeira : primeira + ultimo + 1;

  const janela = 200;
  const abaixo = await fetchSheetValues(CONFIG.SPREADSHEET_ID, intervaloAba(aba, `A${candidata}:BZ${candidata + janela - 1}`), token, {
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const colunasDosCampos = Object.keys(esquema.cols).map((campo) => esquema.cols[campo]);
  for (let k = 0; k < janela; k += 1) {
    const linha = abaixo[k] || [];
    const ocupada = colunasDosCampos.some((c) => linha[c] !== undefined && linha[c] !== null && String(linha[c]).trim() !== "");
    if (!ocupada) return candidata + k;
  }
  return candidata + janela;
}

// Writes { coluna: valor } into one row, one contiguous block of columns at a
// time, so cells the app does not fill (a formula column, an unrecognised
// column) are never touched. The block holding the key column (Data /
// Produto) goes LAST: if the connection drops half-way, the row still looks
// empty to the app and the retry reuses it instead of leaving an orphan.
async function escreverColunas(papel, linha, valoresPorColuna, colunaChave, token) {
  const cols = Object.keys(valoresPorColuna).map(Number).sort((a, b) => a - b);
  const blocos = [];
  cols.forEach((c) => {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo[ultimo.length - 1] === c - 1) ultimo.push(c);
    else blocos.push([c]);
  });
  blocos.sort((a, b) => (b.indexOf(colunaChave) !== -1 ? -1 : 0) - (a.indexOf(colunaChave) !== -1 ? -1 : 0));
  for (let i = 0; i < blocos.length; i += 1) {
    const bloco = blocos[i];
    const range = intervaloAba(nomeAba(papel), `${colunaLetra(bloco[0])}${linha}:${colunaLetra(bloco[bloco.length - 1])}${linha}`);
    await updateSheetRow(CONFIG.SPREADSHEET_ID, range, bloco.map((c) => valoresPorColuna[c]), token);
  }
}
