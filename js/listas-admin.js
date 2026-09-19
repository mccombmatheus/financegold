// Ajustes → Listas de apoio (company Master): add or remove the items behind the
// dropdowns — lojas, contas, categorias, pessoas, produtos... A new company
// starts with a few seed rows; this is how its Master makes them theirs.
// Row layout of every list tab: A código, B nome, C "código - nome", D status
// (only Categoria uses D, "Ativo").

const LISTAS_APOIO = ["Lojas", "Contas", "Empresas", "Categoria", "Pessoa", "Produto", "Tipo de Produto", "Marcas"];
let listasAdminReady = false;
let listaItens = [];
let listaRemoveConfirmLinha = null;

function listasStatus(message) {
  const el = document.getElementById("listas-admin-status");
  if (el) el.textContent = message || "";
}

async function loadListaItens() {
  const tab = document.getElementById("listas-select").value;
  const rows = await fetchSheetValues(CONFIG.SPREADSHEET_ID, `${tab}!A2:D`, accessToken, {
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  listaItens = [];
  rows.forEach((row, index) => {
    if (row[0] === undefined || row[0] === null || row[0] === "") return;
    listaItens.push({ linha: index + 2, codigo: Number(row[0]) || 0, nome: String(row[1] || ""), status: row[3] || "" });
  });
}

function renderListaItens() {
  const ul = document.getElementById("listas-itens");
  ul.innerHTML = "";
  if (listaItens.length === 0) {
    const li = document.createElement("li");
    li.className = "lista-vazia";
    li.textContent = "Nenhum item ainda.";
    ul.appendChild(li);
    return;
  }
  listaItens.forEach((item) => {
    const li = document.createElement("li");
    li.className = "lista-item";
    const nome = document.createElement("span");
    nome.className = "lista-item-nome";
    nome.textContent = item.nome;
    li.appendChild(nome);

    const acoes = document.createElement("span");
    acoes.className = "lista-item-acoes";
    if (listaRemoveConfirmLinha === item.linha) {
      acoes.appendChild(makeAdminButton("Confirmar remoção", () => removeListaItem(item), "usuario-action-danger"));
      acoes.appendChild(
        makeAdminButton("Cancelar", () => {
          listaRemoveConfirmLinha = null;
          renderListaItens();
        })
      );
    } else {
      acoes.appendChild(
        makeAdminButton(
          "Remover",
          () => {
            listaRemoveConfirmLinha = item.linha;
            listasStatus("");
            renderListaItens();
          },
          "usuario-action-danger-soft"
        )
      );
    }
    li.appendChild(acoes);
    ul.appendChild(li);
  });
}

async function reloadListaAdmin(message) {
  try {
    await loadListaItens();
    renderListaItens();
    if (typeof refreshLookupsOnly === "function") await refreshLookupsOnly();
    if (message) listasStatus(message);
  } catch (err) {
    console.error(err);
    listasStatus(`Erro: ${describeSaveError(err)}`);
  }
}

async function removeListaItem(item) {
  const tab = document.getElementById("listas-select").value;
  listasStatus("Removendo...");
  try {
    await updateSheetRow(CONFIG.SPREADSHEET_ID, `${tab}!A${item.linha}:D${item.linha}`, ["", "", "", ""], accessToken);
    listaRemoveConfirmLinha = null;
    await reloadListaAdmin(`"${item.nome}" removido. Lançamentos antigos que usam esse nome continuam como estão.`);
  } catch (err) {
    console.error(err);
    listasStatus(`Erro ao remover: ${describeSaveError(err)}`);
  }
}

async function addListaItem(nome) {
  const tab = document.getElementById("listas-select").value;
  const limpo = nome.trim();
  if (!limpo) return listasStatus("Informe o nome do item.");
  if (limpo.length > 80) return listasStatus("Use no máximo 80 letras.");
  if (listaItens.some((i) => i.nome.trim().toLowerCase() === limpo.toLowerCase())) {
    return listasStatus("Esse item já existe nesta lista.");
  }

  const codigo = listaItens.reduce((max, i) => Math.max(max, i.codigo), 0) + 1;
  const proximaLinha = listaItens.reduce((max, i) => Math.max(max, i.linha), 1) + 1;
  const linha = tab === "Categoria" ? [codigo, limpo, `${codigo} - ${limpo}`, "Ativo"] : [codigo, limpo, `${codigo} - ${limpo}`];
  const ultimaColuna = tab === "Categoria" ? "D" : "C";

  listasStatus("Salvando...");
  try {
    await updateSheetRow(CONFIG.SPREADSHEET_ID, `${tab}!A${proximaLinha}:${ultimaColuna}${proximaLinha}`, linha, accessToken);
    document.getElementById("listas-add-nome").value = "";
    await reloadListaAdmin(`"${limpo}" adicionado.`);
  } catch (err) {
    console.error(err);
    listasStatus(`Erro ao salvar: ${describeSaveError(err)}`);
  }
}

function setupListasAdmin() {
  if (listasAdminReady) return;
  listasAdminReady = true;

  const select = document.getElementById("listas-select");
  LISTAS_APOIO.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  select.addEventListener("change", () => {
    listaRemoveConfirmLinha = null;
    listasStatus("");
    reloadListaAdmin();
  });
  document.getElementById("listas-add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    addListaItem(document.getElementById("listas-add-nome").value);
  });
}

// Called on every sign-in / company switch: the wiring above happens once, the
// lists shown must always belong to the company that is currently open.
function initListasAdmin() {
  setupListasAdmin();
  listaRemoveConfirmLinha = null;
  listasStatus("");
  return reloadListaAdmin();
}
