// Support lists (lojas, contas, categorias, pessoas, produtos...) that feed the
// forms' dropdowns. Each list is read from its tab (default name or the one set
// in Configuração), in whatever layout it has (js/esquema.js interpretarLista).
// A list whose tab is missing or empty is LEARNED from the values already typed
// in the ledger / stock, so any spreadsheet gets usable dropdowns.
//
// Every option carries the exact text the target column stores: the "N - Nome"
// complement when the list has one (or the ledger writes codes), else the name.

const LISTAS_DEFINICAO = [
  { chave: "lojas", campo: "loja", fonte: "lancamentos" },
  { chave: "contas", campo: "conta", fonte: "lancamentos" },
  { chave: "empresas", campo: "empresa", fonte: "lancamentos" },
  { chave: "categorias", campo: "categoria", fonte: "lancamentos" },
  { chave: "pessoas", campo: "pessoa", fonte: "lancamentos" },
  { chave: "produtos", campo: "produto", fonte: "estoque" },
  { chave: "tiposProduto", campo: "tipo", fonte: "estoque" },
  { chave: "marcas", campo: "marca", fonte: "estoque" },
];

async function lerAbaLista(token, chave) {
  try {
    const rows = await fetchSheetValues(CONFIG.SPREADSHEET_ID, intervaloAba(nomeAba(chave), "A1:H"), token, {
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    return interpretarLista(rows);
  } catch (err) {
    // only real connection / session problems stop the load; a tab that does not exist just means "learn from the data"
    if (err && (err.sessionExpired || isNetworkError(err))) throw err;
    return [];
  }
}

// Rows of the ledger / stock tab, read at most once per fetchAllLookups call.
function criarLeitorDeLinhas(token) {
  const memo = {};
  return (papel) => {
    if (!memo[papel]) {
      memo[papel] = fetchSheetValues(CONFIG.SPREADSHEET_ID, intervaloAba(nomeAba(papel), "A1:BZ"), token, {
        valueRenderOption: "UNFORMATTED_VALUE",
      })
        .then((rows) => ({ rows, esquema: detectarEsquema(rows, papel) }))
        .catch((err) => {
          if (err && (err.sessionExpired || isNetworkError(err))) throw err;
          return { rows: [], esquema: null };
        });
    }
    return memo[papel];
  };
}

async function montarLista(token, def, lerLinhas) {
  const itens = await lerAbaLista(token, def.chave);
  const esqLanc = obterEsquema("lancamentos");
  const escreveCodigo = def.fonte === "lancamentos" && esqLanc && esqLanc.codigoNoTexto ? Boolean(esqLanc.codigoNoTexto[def.campo]) : false;
  const ehCategoria = def.chave === "categorias";
  const uteis = itens.filter((item) => (ehCategoria && item.temStatus ? item.ativo : true));

  if (uteis.length > 0) {
    return {
      opcoes: uteis.map((item) => {
        const valor = valorDeItemLista(item, escreveCodigo);
        return { value: valor, label: String(valor) };
      }),
      planas: uteis.map((item) => ({ value: item.nome, label: String(item.nome) })),
    };
  }

  // no usable list tab: learn the options from what is already in the sheet
  const { rows, esquema } = await lerLinhas(def.fonte);
  const col = esquema ? esquema.cols[def.campo] : undefined;
  if (col === undefined) return { opcoes: [], planas: [] };
  const valores = valoresDistintos(rows, col, esquema.linhaCabecalho);
  return {
    opcoes: valores.map((v) => ({ value: v, label: String(v) })),
    planas: valores.map((v) => {
      const nome = tirarCodigo(v) || v;
      return { value: nome, label: nome };
    }),
  };
}

async function fetchAllLookups(token) {
  const lerLinhas = criarLeitorDeLinhas(token);
  const feitas = await Promise.all(LISTAS_DEFINICAO.map((def) => montarLista(token, def, lerLinhas)));
  const por = {};
  LISTAS_DEFINICAO.forEach((def, i) => {
    por[def.chave] = feitas[i];
  });
  return {
    lojas: por.lojas.opcoes,
    lojasPlain: por.lojas.planas,
    contas: por.contas.opcoes,
    empresas: por.empresas.opcoes,
    categorias: por.categorias.opcoes,
    pessoas: por.pessoas.opcoes,
    pessoasPlain: por.pessoas.planas,
    produtos: por.produtos.opcoes,
    tiposProduto: por.tiposProduto.opcoes,
    marcas: por.marcas.opcoes,
  };
}
