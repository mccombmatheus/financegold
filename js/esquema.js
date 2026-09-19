// Adaptive reading of spreadsheets. Companies bring their own sheets: columns in
// any order, extra columns, other words for the same thing ("Receita" instead of
// "Entrada"), dates and money written as text, the header not on row 1. Instead
// of fixed column positions, every tab is analysed when it is loaded: the header
// row is located, each column is matched to a field by name (synonyms, accents,
// small typos) with a look at the values as a fallback, and rows are converted to
// the app's records. Columns nobody recognises are kept as "extras" and shown.
// The sheet itself is never restructured — writes go to the columns found.
//
// Pure functions (no DOM, no network), so they are tested on their own
// (testes/esquema.html).

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const PALAVRAS_VAZIAS = ["de", "do", "da", "dos", "das", "em", "e", "o", "a", "no", "na", "por", "para", "ao"];

function normalizarTexto(valor) {
  return String(valor === null || valor === undefined ? "" : valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// "Data de Compra" -> ["data", "compra"]; one-letter tokens ("g", "k", "r") are units.
function tokensSignificativos(valor) {
  return normalizarTexto(valor)
    .split(" ")
    .filter((t) => t && t.length > 1 && PALAVRAS_VAZIAS.indexOf(t) === -1);
}

function distanciaEdicao(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let anterior = [];
  for (let j = 0; j <= b.length; j += 1) anterior.push(j);
  for (let i = 1; i <= a.length; i += 1) {
    const atual = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual.push(Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + custo));
    }
    anterior = atual;
  }
  return anterior[b.length];
}

// 1 = same word; ~0.8 = same word with a small typo.
function similaridadeToken(a, b) {
  if (a === b) return 1;
  if (a.length < 5 || b.length < 5) return 0;
  const limite = Math.max(a.length, b.length) >= 9 ? 2 : 1;
  return distanciaEdicao(a, b) <= limite ? 0.8 : 0;
}

// ---------------------------------------------------------------------------
// Field catalogues: what each column may be called
// ---------------------------------------------------------------------------

const CAMPOS_LANCAMENTO = {
  data: ["data", "dia", "date", "data lancamento", "data movimento", "data pagamento", "quando"],
  loja: ["loja", "unidade", "filial", "ponto venda", "pdv", "estabelecimento", "local", "store"],
  conta: ["conta", "conta bancaria", "banco", "carteira", "forma pagamento", "meio pagamento", "caixa"],
  empresa: ["empresa", "razao social", "company"],
  categoria: ["categoria", "classificacao", "grupo", "plano contas", "tipo despesa", "category", "centro custo"],
  valor: ["valor", "montante", "quantia", "amount", "total", "valor total", "importe"],
  tipo: ["tipo", "entrada saida", "movimento", "tipo movimento", "operacao", "natureza", "es", "direcao"],
  peso: ["peso", "gramas", "quantidade", "qtd", "qtde", "unidades", "volume"],
  pessoa: ["pessoa", "cliente", "fornecedor", "responsavel", "favorecido", "beneficiario", "contato", "nome", "parte"],
  observacao: ["observacao", "observacoes", "obs", "descricao", "historico", "detalhe", "detalhes", "nota", "comentario", "memo"],
};

const CAMPOS_ESTOQUE = {
  produto: ["produto", "item", "artigo", "mercadoria", "descricao", "nome", "peca"],
  tipo: ["tipo", "tipo produto", "categoria", "grupo", "classe"],
  marca: ["marca", "fabricante", "brand"],
  condicao: ["condicao", "estado conservacao", "conservacao"],
  estado: ["estado", "situacao", "status"],
  pesoGrama: ["peso", "peso grama", "peso gramas", "gramas", "quantidade", "qtd", "qtde", "unidades", "estoque"],
  pureza: ["pureza", "quilate", "quilates", "teor", "especificacao", "modelo", "tamanho", "detalhe"],
  valorCusto: ["valor custo", "custo", "preco custo", "valor compra", "valor pago", "custo unitario"],
  valorVenda: ["valor venda", "preco venda", "preco", "valor vendido", "venda"],
  dataCompra: ["data compra", "compra", "data entrada", "entrada", "adquirido"],
  dataVenda: ["data venda", "vendido em", "data saida", "saida"],
  comprador: ["comprador", "cliente", "adquirente"],
  vendedor: ["vendedor", "responsavel venda", "consignado"],
  loja: ["loja", "unidade", "filial", "local"],
  vendido: ["vendido", "sold", "foi vendido"],
  observacao: ["observacao", "observacoes", "obs", "nota", "comentario"],
};

const CAMPOS_POR_PAPEL = { lancamentos: CAMPOS_LANCAMENTO, estoque: CAMPOS_ESTOQUE };

// Positions used when a tab has no recognisable header (the original layout).
const POSICOES_PADRAO = {
  lancamentos: { data: 0, loja: 1, conta: 2, empresa: 3, categoria: 4, valor: 5, tipo: 6, peso: 7, pessoa: 8, observacao: 9 },
  estoque: {
    produto: 0, tipo: 1, marca: 2, condicao: 3, estado: 4, pesoGrama: 5, pureza: 6, valorCusto: 7,
    valorVenda: 8, dataCompra: 9, dataVenda: 10, comprador: 11, vendedor: 12, loja: 13, vendido: 14, observacao: 15,
  },
};

const NOMES_CAMPOS = {
  data: "Data", loja: "Loja", conta: "Conta", empresa: "Empresa", categoria: "Categoria", valor: "Valor",
  tipo: "Tipo", peso: "Quantidade", pessoa: "Pessoa", observacao: "Observação", produto: "Produto", marca: "Marca",
  condicao: "Condição", estado: "Estado", pesoGrama: "Quantidade", pureza: "Especificação", valorCusto: "Valor de custo",
  valorVenda: "Valor de venda", dataCompra: "Data de compra", dataVenda: "Data de venda", comprador: "Comprador",
  vendedor: "Vendedor", vendido: "Vendido?",
};

// How well does a header match one field? 0..1.
function pontuarCabecalho(textoCabecalho, sinonimos) {
  const tokens = tokensSignificativos(textoCabecalho);
  if (tokens.length === 0) return 0;
  const colado = tokens.join(" ");
  let melhor = 0;
  sinonimos.forEach((sin) => {
    const tokensSin = tokensSignificativos(sin);
    if (tokensSin.join(" ") === colado) {
      melhor = Math.max(melhor, 1);
      return;
    }
    // every word of the synonym present in the header (the header has extra words)
    if (tokensSin.length > 0 && tokensSin.every((t) => tokens.indexOf(t) !== -1)) {
      melhor = Math.max(melhor, 0.9 - 0.04 * (tokens.length - tokensSin.length));
      return;
    }
    // same words, typos allowed
    if (tokensSin.length === tokens.length) {
      const sims = tokensSin.map((t, i) => similaridadeToken(t, tokens[i]));
      if (sims.every((s) => s > 0)) melhor = Math.max(melhor, 0.8);
    }
    // header is a longer phrase that contains the synonym with a typo
    if (tokensSin.length === 1 && tokens.length > 1) {
      if (tokens.some((t) => similaridadeToken(tokensSin[0], t) > 0)) melhor = Math.max(melhor, 0.6);
    }
  });
  return melhor;
}

// ---------------------------------------------------------------------------
// Value conversion
// ---------------------------------------------------------------------------

const MESES = {
  janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, mar: 3, abril: 4, abr: 4, maio: 5, mai: 5, junho: 6, jun: 6,
  julho: 7, jul: 7, agosto: 8, ago: 8, setembro: 9, set: 9, outubro: 10, out: 10, novembro: 11, nov: 11, dezembro: 12, dez: 12,
};

function dataValida(ano, mes, dia) {
  if (ano < 1990 || ano > 2100 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia ? d : null;
}

// Sheet serial, "31/12/2025", "31-12-25", "2025-12-31", "31 de dezembro de 2025" -> Date (UTC midnight) or null.
function converterData(valor) {
  if (typeof valor === "number") {
    if (valor < 25569 || valor > 73415) return null; // 1970..2100
    return new Date(Math.floor(valor - 25569) * 86400000);
  }
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  if (!texto) return null;
  let m = texto.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})(?:\D.*)?$/);
  if (m) {
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return dataValida(ano, Number(m[2]), Number(m[1]));
  }
  m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\D.*)?$/);
  if (m) return dataValida(Number(m[1]), Number(m[2]), Number(m[3]));
  m = normalizarTexto(texto).match(/^(\d{1,2}) (?:de )?([a-z]+) (?:de )?(\d{4})$/);
  if (m && MESES[m[2]]) return dataValida(Number(m[3]), MESES[m[2]], Number(m[1]));
  return null;
}

// 1234.5, "1.234,56", "R$ 1.234,56", "-1234,5", "(100,00)", "12,5 g" -> number; anything else -> null.
function converterNumero(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string") return null;
  let texto = valor.trim();
  if (!texto) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(texto)) {
    negativo = true;
    texto = texto.slice(1, -1);
  }
  texto = texto.replace(/r\$|\$|€|reais|real|kg|g\b|un\b|un\.|und\b|pcs|pç|k\b/gi, "").replace(/\s+/g, "");
  if (/^-/.test(texto)) {
    negativo = !negativo;
    texto = texto.slice(1);
  }
  texto = texto.replace(/^\+/, "");
  if (!/^[0-9.,]+$/.test(texto) || !/[0-9]/.test(texto)) return null;
  const temPonto = texto.indexOf(".") !== -1;
  const temVirgula = texto.indexOf(",") !== -1;
  if (temPonto && temVirgula) {
    if (texto.lastIndexOf(",") > texto.lastIndexOf(".")) texto = texto.replace(/\./g, "").replace(",", ".");
    else texto = texto.replace(/,/g, "");
  } else if (temVirgula) {
    texto = /^\d{1,3}(,\d{3})+$/.test(texto) && texto.split(",").length > 2 ? texto.replace(/,/g, "") : texto.replace(",", ".");
  } else if (temPonto && /^\d{1,3}(\.\d{3})+$/.test(texto)) {
    texto = texto.replace(/\./g, "");
  }
  const numero = Number(texto);
  if (!Number.isFinite(numero)) return null;
  return negativo ? -numero : numero;
}

const ROTULOS_ENTRADA = ["entrada", "entradas", "receita", "receitas", "credito", "recebimento", "recebido", "ganho", "in", "e", "+", "c"];
const ROTULOS_SAIDA = ["saida", "saidas", "despesa", "despesas", "debito", "pagamento", "pago", "gasto", "out", "s", "-", "d"];

// Anything that means money in / money out -> "Entrada" | "Saída" | null.
function tipoCanonico(valor) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim().toLowerCase();
  const n = normalizarTexto(valor);
  const chave = n || texto;
  if (ROTULOS_ENTRADA.indexOf(chave) !== -1 || ROTULOS_ENTRADA.indexOf(texto) !== -1) return "Entrada";
  if (ROTULOS_SAIDA.indexOf(chave) !== -1 || ROTULOS_SAIDA.indexOf(texto) !== -1) return "Saída";
  return null;
}

function converterBooleano(valor) {
  if (valor === true) return true;
  if (valor === false || valor === null || valor === undefined || valor === "") return false;
  if (typeof valor === "number") return valor !== 0;
  const n = normalizarTexto(valor);
  return ["true", "verdadeiro", "sim", "s", "x", "vendido", "yes", "1"].indexOf(n) !== -1;
}

function textoOuNulo(valor) {
  if (valor === null || valor === undefined) return null;
  const t = String(valor).trim();
  return t === "" ? null : t;
}

// "3 - Ipanema" -> "Ipanema" (the lookup tabs' "N - Nome" complement form)
function tirarCodigo(valor) {
  const t = textoOuNulo(valor);
  return t === null ? null : t.replace(/^\s*\d+\s*-\s*/, "").trim() || null;
}

function temPrefixoCodigo(valor) {
  return typeof valor === "string" && /^\s*\d+\s*-\s*\S/.test(valor);
}

function colunaLetra(indice) {
  let n = indice + 1;
  let letra = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

// ---------------------------------------------------------------------------
// Detecting the layout of a tab
// ---------------------------------------------------------------------------

const LIMITE_LINHAS_CABECALHO = 15;
const NOTA_MINIMA = 0.6;
const AMOSTRA_CONTEUDO = 300;

// Best field per column, each field used at most once (highest score first).
function casarColunas(cabecalho, catalogo) {
  const candidatos = [];
  cabecalho.forEach((texto, col) => {
    Object.keys(catalogo).forEach((campo) => {
      const nota = pontuarCabecalho(texto, catalogo[campo]);
      if (nota >= NOTA_MINIMA) candidatos.push({ col, campo, nota });
    });
  });
  candidatos.sort((a, b) => b.nota - a.nota || a.col - b.col);
  const cols = {};
  const colunasUsadas = {};
  candidatos.forEach((c) => {
    if (cols[c.campo] !== undefined || colunasUsadas[c.col]) return;
    cols[c.campo] = c.col;
    colunasUsadas[c.col] = true;
  });
  return cols;
}

function amostraColuna(linhas, col) {
  const out = [];
  for (let i = 0; i < linhas.length && out.length < AMOSTRA_CONTEUDO; i += 1) {
    const v = linhas[i] ? linhas[i][col] : undefined;
    if (v !== undefined && v !== null && String(v).trim() !== "") out.push(v);
  }
  return out;
}

function proporcao(valores, teste) {
  if (valores.length === 0) return 0;
  return valores.filter(teste).length / valores.length;
}

// A column whose values reveal what it is, for tabs whose headers are missing or odd.
function inferirPorConteudo(linhasDados, larguraMax, colsJaMapeadas, papel) {
  const usadas = {};
  Object.keys(colsJaMapeadas).forEach((campo) => {
    usadas[colsJaMapeadas[campo]] = true;
  });
  const achados = {};
  for (let col = 0; col < larguraMax; col += 1) {
    if (usadas[col]) continue;
    const amostra = amostraColuna(linhasDados, col);
    if (amostra.length < 3) continue;
    const ehData = proporcao(amostra, (v) => (typeof v === "string" ? converterData(v) !== null : typeof v === "number" && v >= 36526 && v <= 60000 && Number.isInteger(v)));
    const ehTipo = proporcao(amostra, (v) => typeof v === "string" && tipoCanonico(v) !== null);
    const ehNumero = proporcao(amostra, (v) => converterNumero(v) !== null);
    const temNegativo = amostra.some((v) => converterNumero(v) < 0);
    const ehDataTexto = proporcao(amostra, (v) => typeof v === "string" && converterData(v) !== null);
    if (papel === "lancamentos") {
      if (colsJaMapeadas.data === undefined && achados.data === undefined && (ehDataTexto >= 0.9 || (ehData >= 0.95 && !temNegativo && ehNumero >= 0.95 && colsJaMapeadas.valor !== undefined))) achados.data = col;
      else if (colsJaMapeadas.tipo === undefined && achados.tipo === undefined && ehTipo >= 0.9) achados.tipo = col;
      else if (colsJaMapeadas.valor === undefined && achados.valor === undefined && ehNumero >= 0.9 && (temNegativo || col > 0)) achados.valor = col;
    } else if (papel === "estoque") {
      if (colsJaMapeadas.dataCompra === undefined && achados.dataCompra === undefined && ehDataTexto >= 0.9) achados.dataCompra = col;
    }
  }
  return achados;
}

function larguraDasLinhas(linhas) {
  return linhas.reduce((max, l) => Math.max(max, l ? l.length : 0), 0);
}

function linhaVazia(linha) {
  return !linha || linha.every((c) => c === null || c === undefined || String(c).trim() === "");
}

// Finds the header row (within the first rows) and maps columns to fields.
// rows: everything from row 1 of the tab (UNFORMATTED values). Returns
// { papel, linhaCabecalho (1-based; 0 = no header), cols, largura, cabecalho, extras, reconhecidos, incerto }.
function detectarEsquema(rows, papel) {
  const catalogo = CAMPOS_POR_PAPEL[papel];
  let melhorLinha = -1;
  let melhorCols = {};
  let melhorPontos = 0;
  for (let i = 0; i < Math.min(rows.length, LIMITE_LINHAS_CABECALHO); i += 1) {
    const linha = rows[i];
    if (linhaVazia(linha)) continue;
    const textos = linha.map((c) => (typeof c === "string" ? c : c === null || c === undefined ? "" : String(c)));
    const cols = casarColunas(textos, catalogo);
    const reconhecidos = Object.keys(cols).length;
    const naoVazias = textos.filter((t) => t.trim() !== "").length;
    // a header is mostly words: reject a data row that happens to hit a synonym
    const soTexto = linha.filter((c) => typeof c === "number").length <= Math.floor(naoVazias / 3);
    // a data row can contain header words by accident ("1 - Caixa", "Loja Centro"): codes like "3 - Nome" or a low share of recognised cells say it is data
    const pareceDado = linha.some((c) => temPrefixoCodigo(c));
    const proporcaoReconhecida = reconhecidos / Math.max(1, naoVazias);
    const pontos = reconhecidos * 10 + proporcaoReconhecida * 5;
    if (reconhecidos >= 2 && soTexto && !pareceDado && proporcaoReconhecida >= 0.3 && pontos > melhorPontos) {
      melhorPontos = pontos;
      melhorLinha = i;
      melhorCols = cols;
    }
  }

  const temCabecalho = melhorLinha !== -1;
  const primeiraLinhaDados = temCabecalho ? melhorLinha + 1 : 0;
  const dados = rows.slice(primeiraLinhaDados).filter((l) => !linhaVazia(l));
  const largura = Math.max(larguraDasLinhas(rows.slice(0, primeiraLinhaDados + 50)), temCabecalho ? rows[melhorLinha].length : 0);
  let cols;
  let incerto = false;

  if (temCabecalho) {
    cols = melhorCols;
    const extraCols = inferirPorConteudo(dados, largura, cols, papel);
    Object.keys(extraCols).forEach((campo) => {
      cols[campo] = extraCols[campo];
    });
  } else {
    // no header: keep the original positions but only if the values fit
    cols = Object.assign({}, POSICOES_PADRAO[papel]);
    incerto = true;
  }

  const cabecalho = [];
  for (let c = 0; c < largura; c += 1) {
    const t = temCabecalho && rows[melhorLinha] ? rows[melhorLinha][c] : undefined;
    cabecalho.push(textoOuNulo(t) || "");
  }
  const usadas = {};
  Object.keys(cols).forEach((campo) => {
    usadas[cols[campo]] = true;
  });
  const extras = [];
  for (let c = 0; c < largura; c += 1) {
    if (!usadas[c] && (cabecalho[c] || !temCabecalho)) extras.push({ col: c, nome: cabecalho[c] || `Coluna ${colunaLetra(c)}` });
  }

  const esquema = {
    papel: papel,
    linhaCabecalho: temCabecalho ? melhorLinha + 1 : 0,
    cols: cols,
    largura: largura,
    cabecalho: cabecalho,
    extras: extras,
    reconhecidos: Object.keys(cols).map((campo) => ({ campo: campo, col: cols[campo], titulo: cabecalho[cols[campo]] || "" })),
    incerto: incerto,
  };
  if (papel === "lancamentos") aprenderConvencoesLancamento(esquema, dados);
  return esquema;
}

// The way THIS sheet writes money in/out, so new rows look like the old ones.
function aprenderConvencoesLancamento(esquema, dados) {
  const rotulos = { Entrada: {}, "Saída": {} };
  let saidasPositivas = 0;
  let saidasNegativas = 0;
  let comCodigo = { loja: 0, conta: 0, empresa: 0, categoria: 0, pessoa: 0 };
  let contados = { loja: 0, conta: 0, empresa: 0, categoria: 0, pessoa: 0 };
  dados.slice(0, AMOSTRA_CONTEUDO * 3).forEach((linha) => {
    const cT = esquema.cols.tipo;
    if (cT !== undefined) {
      const canon = tipoCanonico(linha[cT]);
      const bruto = textoOuNulo(linha[cT]);
      if (canon && bruto) rotulos[canon][bruto] = (rotulos[canon][bruto] || 0) + 1;
      if (canon === "Saída" && esquema.cols.valor !== undefined) {
        const v = converterNumero(linha[esquema.cols.valor]);
        if (v > 0) saidasPositivas += 1;
        else if (v < 0) saidasNegativas += 1;
      }
    }
    Object.keys(comCodigo).forEach((campo) => {
      const c = esquema.cols[campo];
      if (c === undefined) return;
      const v = linha[c];
      if (v === undefined || v === null || v === "") return;
      contados[campo] += 1;
      if (temPrefixoCodigo(v)) comCodigo[campo] += 1;
    });
  });
  const maisFrequente = (obj, padrao) => {
    const chaves = Object.keys(obj);
    if (!chaves.length) return padrao;
    return chaves.sort((a, b) => obj[b] - obj[a])[0];
  };
  esquema.rotuloEntrada = maisFrequente(rotulos.Entrada, "Entrada");
  esquema.rotuloSaida = maisFrequente(rotulos["Saída"], "Saída");
  esquema.saidaNegativa = !(saidasPositivas > saidasNegativas);
  esquema.codigoNoTexto = {};
  Object.keys(comCodigo).forEach((campo) => {
    esquema.codigoNoTexto[campo] = contados[campo] > 0 && comCodigo[campo] / contados[campo] >= 0.5;
  });
}

// ---------------------------------------------------------------------------
// Rows -> records
// ---------------------------------------------------------------------------

function celula(linha, esquema, campo) {
  const c = esquema.cols[campo];
  return c === undefined || !linha ? undefined : linha[c];
}

function extrasDaLinha(linha, esquema) {
  const out = [];
  esquema.extras.forEach((e) => {
    const v = linha[e.col];
    const t = textoOuNulo(v);
    if (t !== null) out.push({ nome: e.nome, valor: typeof v === "number" ? v : t });
  });
  return out;
}

// -> { registros, ignoradas } for the ledger. Each record has the app's shape
// (valor negative for money out), plus .extras.
function interpretarLancamentos(rows, esquema) {
  const registros = [];
  let ignoradas = 0;
  const inicio = esquema.linhaCabecalho; // index of the first row after the header
  for (let i = inicio; i < rows.length; i += 1) {
    const linha = rows[i];
    if (linhaVazia(linha)) continue;
    const data = converterData(celula(linha, esquema, "data"));
    if (data === null) {
      ignoradas += 1;
      continue;
    }
    // a dated row with no readable amount still counts (as zero), like before
    let valor = converterNumero(celula(linha, esquema, "valor"));
    if (valor === null) valor = 0;
    let tipo = tipoCanonico(celula(linha, esquema, "tipo"));
    if (tipo === null) tipo = valor < 0 ? "Saída" : "Entrada";
    if (tipo === "Saída" && valor > 0) valor = -valor;
    const pesoBruto = celula(linha, esquema, "peso");
    const peso = converterNumero(pesoBruto);
    registros.push({
      linha: i + 1,
      data: data,
      loja: tirarCodigo(celula(linha, esquema, "loja")),
      conta: tirarCodigo(celula(linha, esquema, "conta")),
      empresa: tirarCodigo(celula(linha, esquema, "empresa")),
      categoria: tirarCodigo(celula(linha, esquema, "categoria")),
      valor: valor,
      tipo: tipo,
      peso: peso,
      pessoa: tirarCodigo(celula(linha, esquema, "pessoa")),
      observacao: textoOuNulo(celula(linha, esquema, "observacao")),
      extras: extrasDaLinha(linha, esquema),
    });
  }
  return { registros, ignoradas };
}

function interpretarEstoque(rows, esquema) {
  const itens = [];
  let ignoradas = 0;
  for (let i = esquema.linhaCabecalho; i < rows.length; i += 1) {
    const linha = rows[i];
    if (linhaVazia(linha)) continue;
    const produto = celula(linha, esquema, "produto");
    if (produto === undefined || produto === null || String(produto).trim() === "") {
      ignoradas += 1;
      continue;
    }
    const cru = [];
    for (let c = 0; c < esquema.largura; c += 1) cru.push(linha[c] === undefined ? "" : linha[c]);
    const dataVenda = converterData(celula(linha, esquema, "dataVenda"));
    const valorVenda = converterNumero(celula(linha, esquema, "valorVenda"));
    const marcadorVendido = celula(linha, esquema, "vendido");
    const vendido = esquema.cols.vendido !== undefined ? converterBooleano(marcadorVendido) : dataVenda !== null;
    const esp = celula(linha, esquema, "pureza");
    itens.push({
      linha: i + 1,
      produto: textoOuNulo(produto),
      tipo: textoOuNulo(celula(linha, esquema, "tipo")),
      marca: textoOuNulo(celula(linha, esquema, "marca")),
      condicao: textoOuNulo(celula(linha, esquema, "condicao")),
      estado: textoOuNulo(celula(linha, esquema, "estado")),
      pesoGrama: converterNumero(celula(linha, esquema, "pesoGrama")),
      pureza: typeof esp === "number" ? esp : textoOuNulo(esp),
      valorCusto: converterNumero(celula(linha, esquema, "valorCusto")),
      valorVenda: valorVenda,
      dataCompra: converterData(celula(linha, esquema, "dataCompra")),
      dataVenda: dataVenda,
      comprador: textoOuNulo(celula(linha, esquema, "comprador")),
      vendedor: textoOuNulo(celula(linha, esquema, "vendedor")),
      loja: textoOuNulo(celula(linha, esquema, "loja")),
      vendido: vendido,
      observacao: textoOuNulo(celula(linha, esquema, "observacao")) || "",
      raw: cru,
      extras: extrasDaLinha(linha, esquema),
    });
  }
  return { itens, ignoradas };
}

// ---------------------------------------------------------------------------
// Records -> rows (writes always follow the columns found in the sheet)
// ---------------------------------------------------------------------------

function novaLinhaVazia(esquema) {
  const linha = [];
  for (let c = 0; c < esquema.largura; c += 1) linha.push("");
  return linha;
}

// Puts values into the columns of the sheet. campos: { campo: valor }. Fields the
// sheet has no column for are simply not written (never invent columns).
function preencherLinha(linha, esquema, campos) {
  const ausentes = [];
  Object.keys(campos).forEach((campo) => {
    const c = esquema.cols[campo];
    if (c === undefined) {
      ausentes.push(campo);
      return;
    }
    while (linha.length <= c) linha.push("");
    linha[c] = campos[campo];
  });
  return ausentes;
}

function preencherExtras(linha, esquema, valoresExtras) {
  (valoresExtras || []).forEach((e) => {
    const alvo = esquema.extras.filter((x) => x.col === e.col)[0];
    if (!alvo || e.valor === "" || e.valor === null || e.valor === undefined) return;
    while (linha.length <= e.col) linha.push("");
    linha[e.col] = e.valor;
  });
}

// { campo: valor } (+ extra columns) -> { coluna: valor } for the columns the sheet
// really has. Only these cells are ever written: everything else in the row
// (formulas, notes, columns nobody recognised) is left exactly as it is.
function colunasParaEscrever(esquema, campos, valoresExtras) {
  const porColuna = {};
  const ausentes = [];
  Object.keys(campos).forEach((campo) => {
    const c = esquema.cols[campo];
    if (c === undefined) ausentes.push(campo);
    else porColuna[c] = campos[campo];
  });
  (valoresExtras || []).forEach((e) => {
    const alvo = esquema.extras.filter((x) => x.col === e.col)[0];
    if (alvo && e.valor !== "" && e.valor !== null && e.valor !== undefined) porColuna[e.col] = e.valor;
  });
  return { porColuna: porColuna, ausentes: ausentes };
}

// Money as THIS sheet writes it: sign convention and the words used for in/out.
function valorParaPlanilha(esquema, tipo, valorPositivo) {
  const abs = Math.abs(valorPositivo);
  if (tipo === "Saída") return esquema.saidaNegativa === false ? abs : -abs;
  return abs;
}

function rotuloTipoParaPlanilha(esquema, tipo) {
  return tipo === "Saída" ? esquema.rotuloSaida || "Saída" : esquema.rotuloEntrada || "Entrada";
}

// ---------------------------------------------------------------------------
// What a tab looks like (used to connect a sheet whose tabs have other names)
// ---------------------------------------------------------------------------

function contarReconhecidos(rows, papel) {
  const es = detectarEsquema(rows, papel);
  return es.linhaCabecalho > 0 ? es.reconhecidos.length : 0;
}

// Guesses what a tab is from its name and header. -> { papel, nota, esquema }.
const NOMES_ABA = {
  lancamentos: ["lancamento", "lancamentos", "fluxo caixa", "caixa", "movimentacao", "movimentacoes", "financeiro", "transacoes", "livro caixa"],
  estoque: ["estoque", "produtos", "itens", "inventario", "mercadorias", "acervo", "pecas"],
};

function classificarAba(nomeAba, rows) {
  const nome = normalizarTexto(nomeAba);
  const notas = {};
  ["lancamentos", "estoque"].forEach((papel) => {
    const reconhecidos = contarReconhecidos(rows, papel);
    const porNome = NOMES_ABA[papel].some((n) => nome === n || nome.indexOf(n) !== -1) ? 1 : 0;
    // ledger: needs a date and a value; stock: needs a product
    const es = detectarEsquema(rows, papel);
    const essenciais = papel === "lancamentos" ? es.cols.data !== undefined && es.cols.valor !== undefined : es.cols.produto !== undefined;
    notas[papel] = essenciais && es.linhaCabecalho > 0 ? reconhecidos + porNome * 2 : porNome * 0.5;
  });
  if (notas.lancamentos >= notas.estoque && notas.lancamentos >= 3) return { papel: "lancamentos", nota: notas.lancamentos };
  if (notas.estoque > notas.lancamentos && notas.estoque >= 3) return { papel: "estoque", nota: notas.estoque };
  return { papel: "outra", nota: 0 };
}

// ---------------------------------------------------------------------------
// Support lists (lojas, contas, categorias...)
// ---------------------------------------------------------------------------

const NOMES_ABA_LISTA = {
  lojas: ["loja", "lojas", "filial", "filiais", "unidade", "unidades"],
  contas: ["conta", "contas", "banco", "bancos", "forma pagamento", "formas pagamento"],
  empresas: ["empresa", "empresas"],
  categorias: ["categoria", "categorias"],
  pessoas: ["pessoa", "pessoas", "cliente", "clientes", "fornecedor", "fornecedores", "contatos", "funcionarios"],
  tiposProduto: ["tipo produto", "tipos produto", "tipos"],
  marcas: ["marca", "marcas"],
  produtos: ["produto"],
};

// Which support list a tab looks like, judging by its NAME only ("" = none).
function adivinharLista(nomeAba) {
  const nome = normalizarTexto(nomeAba);
  const chaves = Object.keys(NOMES_ABA_LISTA);
  for (let i = 0; i < chaves.length; i += 1) {
    if (NOMES_ABA_LISTA[chaves[i]].indexOf(nome) !== -1) return chaves[i];
  }
  return "";
}

const CAMPOS_LISTA = {
  codigo: ["codigo", "cod", "id", "numero", "n"],
  nome: ["nome", "descricao", "titulo", "item"],
  complemento: ["complemento", "codigo nome", "descricao completa"],
  status: ["status", "situacao", "ativo"],
};

// Reads a list tab: header optional; a single column of names also works.
// -> [{ codigo, nome, complemento, ativo }] (blank rows skipped).
function interpretarLista(rows) {
  if (!rows || rows.length === 0) return [];
  const primeira = (rows[0] || []).map((c) => (typeof c === "string" ? c : ""));
  const cols = casarColunas(primeira, CAMPOS_LISTA);
  const temCabecalho = Object.keys(cols).length >= 1 && (cols.nome !== undefined || cols.complemento !== undefined || cols.codigo !== undefined);
  let inicio = temCabecalho ? 1 : 0;
  if (!temCabecalho) {
    // unlabelled: "code, name, complement" when col A is numeric, otherwise names in column A
    const numerica = proporcao(amostraColuna(rows, 0), (v) => typeof v === "number");
    const largura = larguraDasLinhas(rows);
    if (numerica >= 0.8 && largura >= 2) {
      cols.codigo = 0;
      cols.nome = 1;
      if (largura >= 3) cols.complemento = 2;
      if (largura >= 4) cols.status = 3;
    } else {
      cols.nome = 0;
    }
  } else if (cols.nome === undefined && cols.complemento === undefined) {
    return [];
  }
  const itens = [];
  for (let i = inicio; i < rows.length; i += 1) {
    const linha = rows[i] || [];
    const nome = textoOuNulo(cols.nome !== undefined ? linha[cols.nome] : undefined);
    const complemento = textoOuNulo(cols.complemento !== undefined ? linha[cols.complemento] : undefined);
    const codigo = cols.codigo !== undefined ? linha[cols.codigo] : undefined;
    if (nome === null && complemento === null) continue;
    let status = null;
    if (cols.status !== undefined) status = textoOuNulo(linha[cols.status]);
    itens.push({
      codigo: codigo === undefined || codigo === "" ? null : codigo,
      nome: nome !== null ? nome : tirarCodigo(complemento),
      complemento: complemento,
      // with a status column, only items explicitly marked active count (blank = not active)
      ativo: cols.status === undefined ? true : status !== null && ["ativo", "sim", "s", "1", "true", "x", "ativa"].indexOf(normalizarTexto(status)) !== -1,
      temStatus: cols.status !== undefined,
    });
  }
  return itens;
}

// The text the LEDGER stores for a list item, following the sheet's habit:
// the "N - Nome" complement when the tab has one (or the ledger writes codes),
// otherwise the plain name.
function valorDeItemLista(item, escreveCodigo) {
  if (item.complemento) return item.complemento;
  if (escreveCodigo && item.codigo !== null && item.codigo !== undefined && item.nome) return `${item.codigo} - ${item.nome}`;
  return item.nome;
}

// Distinct values already written in a column: the fallback "list" when a sheet
// has no list tab at all (the options are learned from what people typed).
function valoresDistintos(rows, col, inicio, limite) {
  const vistos = {};
  const out = [];
  for (let i = inicio; i < rows.length && out.length < (limite || 300); i += 1) {
    const v = textoOuNulo(rows[i] ? rows[i][col] : undefined);
    if (v === null) continue;
    const chave = normalizarTexto(v);
    if (vistos[chave]) continue;
    vistos[chave] = true;
    out.push(v);
  }
  return out.sort((a, b) => a.localeCompare(b, "pt-BR"));
}
