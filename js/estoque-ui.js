let allEstoque = [];
let estoqueLookups = null;
let estoqueFormInitialized = false;

const ESTOQUE_ORDER_KEY = "financegold_estoque_order";

// --- Local drag order (per-browser only, never written to the sheet) -------

function loadEstoqueOrder() {
  try {
    const raw = localStorage.getItem(ESTOQUE_ORDER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

function saveEstoqueOrder(order) {
  try {
    localStorage.setItem(ESTOQUE_ORDER_KEY, JSON.stringify(order));
  } catch (err) {
    // ignore — reordering is a local convenience, not critical state
  }
}

function applyEstoqueOrder(items) {
  const order = loadEstoqueOrder();
  if (order.length === 0) return items.slice();
  const positionByLinha = new Map(order.map((linha, index) => [linha, index]));
  return items.slice().sort((a, b) => {
    const posA = positionByLinha.has(a.linha) ? positionByLinha.get(a.linha) : Infinity;
    const posB = positionByLinha.has(b.linha) ? positionByLinha.get(b.linha) : Infinity;
    if (posA !== posB) return posA - posB;
    return a.linha - b.linha;
  });
}

// --- Filters -----------------------------------------------------------------

function populateFilterSelect(selectEl, values, allLabel) {
  const previousValue = selectEl.value;
  selectEl.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = allLabel;
  selectEl.appendChild(allOpt);
  values.forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    selectEl.appendChild(opt);
  });
  if (values.includes(previousValue)) selectEl.value = previousValue;
}

function populateEstoqueFilterOptions(items) {
  const lojas = Array.from(new Set(items.map((i) => i.loja).filter(Boolean))).sort();
  const tipos = Array.from(new Set(items.map((i) => stripCode(i.tipo)).filter(Boolean))).sort();
  populateFilterSelect(document.getElementById("estoque-filtro-loja"), lojas, "Todas as lojas");
  populateFilterSelect(document.getElementById("estoque-filtro-tipo"), tipos, "Todos os tipos");
}

function getEstoqueFilters() {
  return {
    loja: document.getElementById("estoque-filtro-loja").value,
    status: document.getElementById("estoque-filtro-status").value,
    tipo: document.getElementById("estoque-filtro-tipo").value,
    busca: document.getElementById("estoque-busca").value.trim().toLowerCase(),
  };
}

function filterEstoqueItems(items, filters) {
  return items.filter((item) => {
    if (filters.loja && item.loja !== filters.loja) return false;
    if (filters.tipo && stripCode(item.tipo) !== filters.tipo) return false;
    if (filters.status && computeEstoqueStatus(item) !== filters.status) return false;
    if (filters.busca) {
      const haystack = [item.produto, item.tipo, item.marca, item.observacao, item.comprador]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(filters.busca)) return false;
    }
    return true;
  });
}

function statusLabel(status) {
  if (status === "vendido") return "Vendido";
  if (status === "com-vendedor") return "Com vendedor";
  return "Em estoque";
}

// --- CSV export --------------------------------------------------------------

function exportEstoqueCsv() {
  const filters = getEstoqueFilters();
  const filtered = filterEstoqueItems(applyEstoqueOrder(allEstoque), filters);

  const headers = [
    "#", "Produto", "Tipo", "Marca", "Condição", "Estado", "Peso (g)", "Pureza (k)",
    "Valor de Custo", "Valor de Venda", "Data de Compra", "Data de Venda",
    "Comprador", "Vendedor", "Loja", "Status", "Observação",
  ];

  const rows = filtered.map((item) => [
    item.linha,
    stripCode(item.produto) || "",
    stripCode(item.tipo) || "",
    stripCode(item.marca) || "",
    item.condicao || "",
    item.estado || "",
    item.pesoGrama ?? "",
    item.pureza ?? "",
    item.valorCusto ?? "",
    item.valorVenda ?? "",
    item.dataCompra ? item.dataCompra.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "",
    item.dataVenda ? item.dataVenda.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "",
    item.comprador || "",
    item.vendedor || "",
    item.loja || "",
    statusLabel(computeEstoqueStatus(item)),
    item.observacao || "",
  ]);

  downloadCsv(`estoque_${todayForFilename()}.csv`, headers, rows);
}

// --- List rendering ------------------------------------------------------------

function renderEstoqueList() {
  const filters = getEstoqueFilters();
  const ordered = applyEstoqueOrder(allEstoque);
  const filtered = filterEstoqueItems(ordered, filters);
  const container = document.getElementById("estoque-lista-container");
  container.innerHTML = "";

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "chart-empty";
    empty.textContent = "Nenhuma peça encontrada.";
    container.appendChild(empty);
    return;
  }

  filtered.forEach((item) => container.appendChild(buildEstoqueCard(item)));
  setupEstoqueDragAndDrop(container);
}

function buildEstoqueCard(item) {
  const status = computeEstoqueStatus(item);
  const custody = parseCustodyFromObservacao(item.observacao);

  const card = document.createElement("div");
  card.className = "estoque-card";
  card.draggable = true;
  card.dataset.linha = String(item.linha);

  const handle = document.createElement("span");
  handle.className = "estoque-drag-handle";
  handle.textContent = "⠿⠿";
  handle.title = "Arrastar para reordenar";
  card.appendChild(handle);

  const idBadge = document.createElement("span");
  idBadge.className = "estoque-id";
  idBadge.textContent = `#${item.linha}`;
  card.appendChild(idBadge);

  const info = document.createElement("div");
  info.className = "estoque-info";

  const title = document.createElement("div");
  title.className = "estoque-title";
  title.textContent = [stripCode(item.produto), stripCode(item.tipo), stripCode(item.marca)]
    .filter(Boolean)
    .join(" · ");
  info.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "estoque-meta";
  const metaParts = [];
  if (item.loja) metaParts.push(item.loja);
  if (item.pesoGrama != null) metaParts.push(formatGrams(item.pesoGrama));
  if (item.valorCusto != null) metaParts.push(`Custo ${formatBRL(item.valorCusto)}`);
  if (item.vendido && item.valorVenda != null) metaParts.push(`Venda ${formatBRL(item.valorVenda)}`);
  meta.textContent = metaParts.join(" · ");
  info.appendChild(meta);

  if (item.observacao) {
    const obs = document.createElement("div");
    obs.className = "estoque-obs";
    obs.textContent = item.observacao;
    info.appendChild(obs);
  }

  const actionsHost = document.createElement("div");
  actionsHost.className = "estoque-actions-host";
  info.appendChild(actionsHost);

  card.appendChild(info);

  const statusBadge = document.createElement("span");
  statusBadge.className = `estoque-status estoque-status-${status}`;
  statusBadge.textContent = custody && status === "com-vendedor" ? `Com vendedor: ${custody}` : statusLabel(status);
  card.appendChild(statusBadge);

  renderEstoqueActions(actionsHost, item, status);

  return card;
}

function renderEstoqueActions(host, item, status) {
  host.innerHTML = "";
  if (status === "vendido") return;
  if (!canEdit(currentUserRole)) return;

  const actions = document.createElement("div");
  actions.className = "estoque-actions";

  if (status === "em-estoque") {
    actions.appendChild(makeActionButton("Enviar c/ vendedor", () => showCustodyPanel(host, item)));
  } else if (status === "com-vendedor") {
    actions.appendChild(makeActionButton("Retornar à loja", () => handleReturnToStore(host, item)));
  }
  actions.appendChild(makeActionButton("Marcar vendida", () => showSoldPanel(host, item)));

  host.appendChild(actions);
}

function makeActionButton(label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "estoque-action-btn";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function showCustodyPanel(host, item) {
  host.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "estoque-inline-panel";

  const select = document.createElement("select");
  populateFilterSelect(select, estoqueLookups.pessoasPlain.map((p) => p.value), "Selecione a pessoa");
  select.querySelector('option[value=""]').disabled = true;
  panel.appendChild(select);

  const confirmBtn = makeActionButton("Confirmar", async () => {
    if (!select.value) return;
    confirmBtn.disabled = true;
    try {
      await markEstoqueCustody(item, select.value, accessToken);
      await refreshEstoque();
    } catch (err) {
      console.error(err);
      alert(describeSaveError(err));
      renderEstoqueActions(host, item, computeEstoqueStatus(item));
    }
  });
  panel.appendChild(confirmBtn);
  panel.appendChild(makeActionButton("Cancelar", () => renderEstoqueActions(host, item, computeEstoqueStatus(item))));

  host.appendChild(panel);
}

async function handleReturnToStore(host, item) {
  if (!confirm("Confirmar retorno desta peça à loja?")) return;
  try {
    await returnEstoqueToStore(item, accessToken);
    await refreshEstoque();
  } catch (err) {
    console.error(err);
    alert(describeSaveError(err));
  }
}

function showSoldPanel(host, item) {
  host.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "estoque-inline-panel";

  const compradorSelect = document.createElement("select");
  populateFilterSelect(compradorSelect, estoqueLookups.pessoasPlain.map((p) => p.value), "Comprador");
  compradorSelect.querySelector('option[value=""]').disabled = true;
  panel.appendChild(compradorSelect);

  const valorInput = document.createElement("input");
  valorInput.type = "number";
  valorInput.step = "0.01";
  valorInput.min = "0.01";
  valorInput.placeholder = "Valor de venda";
  panel.appendChild(valorInput);

  const dataInput = document.createElement("input");
  dataInput.type = "date";
  dataInput.value = new Date().toISOString().slice(0, 10);
  panel.appendChild(dataInput);

  const custodyName = parseCustodyFromObservacao(item.observacao);

  const confirmBtn = makeActionButton("Confirmar venda", async () => {
    if (!compradorSelect.value || !valorInput.value || !dataInput.value) {
      alert("Preencha comprador, valor e data.");
      return;
    }
    confirmBtn.disabled = true;
    try {
      await markEstoqueVendido(
        item,
        {
          comprador: compradorSelect.value,
          vendedor: custodyName || "",
          valorVenda: Number(valorInput.value),
          dataVenda: dataInput.value,
        },
        accessToken
      );
      await refreshEstoque();
    } catch (err) {
      console.error(err);
      alert(describeSaveError(err));
      renderEstoqueActions(host, item, computeEstoqueStatus(item));
    }
  });
  panel.appendChild(confirmBtn);
  panel.appendChild(makeActionButton("Cancelar", () => renderEstoqueActions(host, item, computeEstoqueStatus(item))));

  host.appendChild(panel);
}

// --- Drag and drop (local order only) ------------------------------------------

function setupEstoqueDragAndDrop(container) {
  let draggedEl = null;

  container.querySelectorAll(".estoque-card").forEach((card) => {
    card.addEventListener("dragstart", () => {
      draggedEl = card;
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      draggedEl = null;
      const newOrder = Array.from(container.querySelectorAll(".estoque-card")).map((el) => Number(el.dataset.linha));
      saveEstoqueOrder(newOrder);
    });
    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (!draggedEl || draggedEl === card) return;
      const rect = card.getBoundingClientRect();
      const before = event.clientY - rect.top < rect.height / 2;
      container.insertBefore(draggedEl, before ? card : card.nextSibling);
    });
  });
}

// --- Filter wiring ---------------------------------------------------------

function setupEstoqueFilterHandlers() {
  ["estoque-filtro-loja", "estoque-filtro-status", "estoque-filtro-tipo", "estoque-busca"].forEach((id) => {
    const el = document.getElementById(id);
    const evt = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(evt, renderEstoqueList);
  });
  document.getElementById("estoque-export-btn").addEventListener("click", exportEstoqueCsv);
}

let estoqueFilterHandlersReady = false;

function initEstoqueList(items, lookups) {
  allEstoque = items;
  estoqueLookups = lookups;
  populateEstoqueFilterOptions(items);
  if (!estoqueFilterHandlersReady) {
    setupEstoqueFilterHandlers();
    estoqueFilterHandlersReady = true;
  }
  renderEstoqueList();
}

async function refreshEstoque() {
  const items = await fetchEstoque(accessToken);
  allEstoque = items;
  populateEstoqueFilterOptions(items);
  renderEstoqueList();
}

// --- Nova peça form ----------------------------------------------------------

function populateEstoqueFormSelects(lookups) {
  populateSelect(document.getElementById("estoque-field-produto"), lookups.produtos, "Selecione o produto");
  populateSelect(document.getElementById("estoque-field-tipo"), lookups.tiposProduto, "Selecione o tipo");
  populateSelect(document.getElementById("estoque-field-marca"), lookups.marcas, "Selecione a marca");
  populateSelect(document.getElementById("estoque-field-loja"), lookups.lojasPlain, "Selecione a loja");
}

function resetEstoqueForm() {
  document.getElementById("estoque-form").reset();
  document.getElementById("estoque-field-data-compra").value = new Date().toISOString().slice(0, 10);
}

function setupEstoqueForm() {
  if (estoqueFormInitialized) return;
  estoqueFormInitialized = true;

  const form = document.getElementById("estoque-form");
  const formStatus = document.getElementById("estoque-form-status");
  const submitButton = document.getElementById("btn-salvar-estoque");

  resetEstoqueForm();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const values = {
      produto: document.getElementById("estoque-field-produto").value,
      tipo: document.getElementById("estoque-field-tipo").value,
      marca: document.getElementById("estoque-field-marca").value,
      condicao: document.getElementById("estoque-field-condicao").value,
      estado: document.getElementById("estoque-field-estado").value,
      pesoGrama: Number(document.getElementById("estoque-field-peso").value),
      pureza: document.getElementById("estoque-field-pureza").value
        ? Number(document.getElementById("estoque-field-pureza").value)
        : "",
      valorCusto: Number(document.getElementById("estoque-field-custo").value),
      dataCompra: document.getElementById("estoque-field-data-compra").value,
      loja: document.getElementById("estoque-field-loja").value,
      observacao: document.getElementById("estoque-field-observacao").value,
    };

    if (!values.produto || !values.tipo || !values.marca || !values.loja || !values.dataCompra) {
      formStatus.textContent = "Preencha todos os campos obrigatórios.";
      return;
    }
    if (!values.pesoGrama || values.pesoGrama <= 0 || !values.valorCusto || values.valorCusto <= 0) {
      formStatus.textContent = "Informe peso e valor de custo maiores que zero.";
      return;
    }

    submitButton.disabled = true;
    formStatus.textContent = "Salvando...";
    try {
      const targetRow = await createEstoqueItem(values, accessToken);
      formStatus.textContent = `Peça salva na linha ${targetRow}.`;
      resetEstoqueForm();
      await refreshEstoque();
    } catch (err) {
      if (isNetworkError(err)) {
        enqueueWrite("estoque-novo", values);
        formStatus.textContent = "Sem internet — a peça foi guardada e será enviada automaticamente quando a conexão voltar.";
        resetEstoqueForm();
      } else {
        console.error(err);
        formStatus.textContent = `Erro ao salvar: ${err.message}`;
      }
    } finally {
      submitButton.disabled = false;
    }
  });
}
