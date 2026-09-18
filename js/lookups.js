// Lookup tabs share the same layout: column B ("Nome") holds the plain name,
// column C ("Complemento") holds the "N - Nome" string. Which one to use depends
// on which sheet/column is being filled: Lançamento's own columns store the
// complemento form, while Estoque's Loja/Comprador/Vendedor columns store the
// plain name — this file returns both so each form can pick the right one.
async function fetchLookupTab(token, sheetName) {
  const rows = await fetchSheetValues(CONFIG.SPREADSHEET_ID, `${sheetName}!A2:D`, token, {
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return rows.filter((row) => row[0] !== undefined && row[0] !== null && row[0] !== "");
}

function toLookupOption(row) {
  const complemento = row[2];
  return { value: complemento, label: String(complemento) };
}

function toLookupOptionPlain(row) {
  const nome = row[1];
  return { value: nome, label: String(nome) };
}

async function fetchAllLookups(token) {
  const [lojas, contas, empresas, categorias, pessoas, produtos, tiposProduto, marcas] = await Promise.all([
    fetchLookupTab(token, "Lojas"),
    fetchLookupTab(token, "Contas"),
    fetchLookupTab(token, "Empresas"),
    fetchLookupTab(token, "Categoria"),
    fetchLookupTab(token, "Pessoa"),
    fetchLookupTab(token, "Produto"),
    fetchLookupTab(token, "Tipo de Produto"),
    fetchLookupTab(token, "Marcas"),
  ]);

  return {
    lojas: lojas.map(toLookupOption),
    lojasPlain: lojas.map(toLookupOptionPlain),
    contas: contas.map(toLookupOption),
    empresas: empresas.map(toLookupOption),
    categorias: categorias.filter((row) => row[3] === "Ativo").map(toLookupOption),
    pessoas: pessoas.map(toLookupOption),
    pessoasPlain: pessoas.map(toLookupOptionPlain),
    produtos: produtos.map(toLookupOption),
    tiposProduto: tiposProduto.map(toLookupOption),
    marcas: marcas.map(toLookupOption),
  };
}
