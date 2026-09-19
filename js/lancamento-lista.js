let lancamentoListaHandlersReady = false;

// Thousands of rows at once make phones sluggish, so show a page at a time.
const LANCAMENTO_LISTA_PAGE = 200;
let lancamentoListaLimit = LANCAMENTO_LISTA_PAGE;

function getLancamentoListaFilters() {
  return {
    start: parseInputDate(document.getElementById("lanc-lista-inicio").value, false),
    end: parseInputDate(document.getElementById("lanc-lista-fim").value, true),
    loja: document.getElementById("lanc-lista-loja").value,
    tipo: document.getElementById("lanc-lista-tipo").value,
    busca: document.getElementById("lanc-lista-busca").value.trim().toLowerCase(),
  };
}

function filterLancamentosLista(records, filters) {
  return records.filter((r) => {
    if (r.data && (r.data < filters.start || r.data > filters.end)) return false;
    if (filters.loja && r.loja !== filters.loja) return false;
    if (filters.tipo && r.tipo !== filters.tipo) return false;
    if (filters.busca) {
      const haystack = [r.categoria, r.pessoa, r.observacao, r.empresa, r.conta]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(filters.busca)) return false;
    }
    return true;
  });
}

function populateLancamentoListaFilterOptions(records) {
  const lojas = Array.from(new Set(records.map((r) => r.loja).filter(Boolean))).sort();
  populateFilterSelect(document.getElementById("lanc-lista-loja"), lojas, "Todas as lojas");
}

function formatLancamentoData(date) {
  return date ? date.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "";
}

function renderLancamentoListaTable() {
  const filters = getLancamentoListaFilters();
  const filtered = filterLancamentosLista(allLancamentos, filters)
    .slice()
    .sort((a, b) => {
      const dataDiff = (b.data ? b.data.getTime() : 0) - (a.data ? a.data.getTime() : 0);
      return dataDiff !== 0 ? dataDiff : b.linha - a.linha;
    });

  const shown = Math.min(filtered.length, lancamentoListaLimit);
  document.getElementById("lancamento-lista-count").textContent =
    shown < filtered.length ? `${filtered.length} lançamento(s) — mostrando os ${shown} mais recentes` : `${filtered.length} lançamento(s)`;

  const moreButton = document.getElementById("lancamento-lista-mais");
  moreButton.hidden = shown >= filtered.length;
  moreButton.textContent = `Mostrar mais (${filtered.length - shown} restantes)`;

  const tbody = document.querySelector("#lancamento-lista-table tbody");
  tbody.innerHTML = "";

  filtered.slice(0, shown).forEach((r) => {
    const tr = document.createElement("tr");
    // Column keys become classes (lanc-col-*) so the mobile stylesheet can
    // lay each row out as a compact card instead of a wide scrolling table.
    [
      ["linha", `#${r.linha}`],
      ["data", formatLancamentoData(r.data)],
      ["loja", r.loja || ""],
      ["conta", r.conta || ""],
      ["empresa", r.empresa || ""],
      ["categoria", r.categoria || ""],
      ["valor", formatBRL(r.valor)],
      ["tipo", r.tipo || ""],
      ["peso", r.peso != null ? formatGrams(r.peso) : ""],
      ["pessoa", r.pessoa || ""],
      ["observacao", r.observacao || ""],
    ].forEach(([key, text]) => {
      const td = document.createElement("td");
      td.className = `lanc-col-${key}`;
      if (key === "valor") td.classList.add(r.tipo === "Entrada" ? "valor-entrada" : "valor-saida");
      td.textContent = text;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

// A changed filter starts back at the first page.
function onLancamentoListaFilterChange() {
  lancamentoListaLimit = LANCAMENTO_LISTA_PAGE;
  renderLancamentoListaTable();
}

function setupLancamentoListaFilterHandlers() {
  ["lanc-lista-inicio", "lanc-lista-fim", "lanc-lista-loja", "lanc-lista-tipo"].forEach((id) => {
    document.getElementById(id).addEventListener("change", onLancamentoListaFilterChange);
  });
  document.getElementById("lanc-lista-busca").addEventListener("input", onLancamentoListaFilterChange);
  document.getElementById("lancamento-lista-mais").addEventListener("click", () => {
    lancamentoListaLimit += LANCAMENTO_LISTA_PAGE;
    renderLancamentoListaTable();
  });
  document.getElementById("lanc-lista-export-btn").addEventListener("click", exportLancamentosCsv);
}

function exportLancamentosCsv() {
  const filters = getLancamentoListaFilters();
  const filtered = filterLancamentosLista(allLancamentos, filters).slice().sort((a, b) => {
    const dataDiff = (b.data ? b.data.getTime() : 0) - (a.data ? a.data.getTime() : 0);
    return dataDiff !== 0 ? dataDiff : b.linha - a.linha;
  });

  const headers = [
    "#", "Data", "Loja", "Conta", "Empresa", "Categoria", "Valor", "Tipo", "Peso (g)", "Pessoa", "Observação",
  ];

  const rows = filtered.map((r) => [
    r.linha,
    formatLancamentoData(r.data),
    r.loja || "",
    r.conta || "",
    r.empresa || "",
    r.categoria || "",
    r.valor ?? "",
    r.tipo || "",
    r.peso ?? "",
    r.pessoa || "",
    r.observacao || "",
  ]);

  downloadCsv(`lancamentos_${todayForFilename()}.csv`, headers, rows);
}

function initLancamentoLista(records) {
  populateLancamentoListaFilterOptions(records);
  if (!lancamentoListaHandlersReady) {
    setupLancamentoListaFilterHandlers();
    lancamentoListaHandlersReady = true;
  }
  const { start, end } = computePresetRange("tudo", records);
  document.getElementById("lanc-lista-inicio").value = toInputDateValue(start);
  document.getElementById("lanc-lista-fim").value = toInputDateValue(end);
  lancamentoListaLimit = LANCAMENTO_LISTA_PAGE;
  renderLancamentoListaTable();
}
