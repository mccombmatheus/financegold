// Ajustes → Empresas (system administrators only): create a new company from
// inside the app. The gateway does the real work and the real permission check
// (only ADMIN_EMAILS may create one); this file is just the form.

let empresasAdminReady = false;
let pedidoEmAtendimento = null; // request (row) the create-company form was filled from
let pedidosPendentes = [];
let pedidoAddAberto = null; // row whose 'add to an existing company' picker is open
let pedidoRecusarConfirma = null;

function renderEmpresasAdminList() {
  const list = document.getElementById("empresas-admin-lista");
  if (!list) return;
  list.innerHTML = "";
  currentCompanies.forEach((company) => {
    const li = document.createElement("li");
    li.textContent = company.empresa;
    list.appendChild(li);
  });
}

function setupEmpresasAdmin() {
  if (empresasAdminReady) return;
  empresasAdminReady = true;

  const form = document.getElementById("empresa-add-form");
  const statusEl = document.getElementById("empresa-add-status");
  const submitButton = document.getElementById("btn-empresa-add");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nome = document.getElementById("empresa-add-nome").value.trim();
    const ownerEmail = document.getElementById("empresa-add-email").value.trim();
    const ownerNome = document.getElementById("empresa-add-dono").value.trim();
    const incluirMeuAcesso = document.getElementById("empresa-add-meu-acesso").checked;

    if (!nome || !ownerEmail || !ownerNome) {
      statusEl.textContent = "Preencha o nome da empresa, o e-mail e o nome do administrador.";
      return;
    }
    if (!looksLikeEmail(ownerEmail)) {
      statusEl.textContent = "Informe um e-mail válido.";
      return;
    }

    submitButton.disabled = true;
    statusEl.textContent = "Criando a empresa... isso leva alguns segundos.";
    try {
      await gatewayCall("createCompany", { nome, ownerEmail, ownerNome, incluirMeuAcesso }, accessToken);
      form.reset();
      document.getElementById("empresa-add-meu-acesso").checked = true;
      await refreshCompaniesList();
      renderEmpresasAdminList();
      let aviso = "";
      if (pedidoEmAtendimento) {
        try {
          await gatewayCall("resolveRequest", { linha: pedidoEmAtendimento, status: "Atendida" }, accessToken);
          aviso = " O pedido foi marcado como atendido e a pessoa foi avisada por e-mail.";
        } catch (err) {
          console.error(err);
          aviso = " (A empresa foi criada, mas não consegui marcar o pedido como atendido.)";
        }
        pedidoEmAtendimento = null;
        await loadPedidosAdmin();
      }
      statusEl.textContent = `Empresa "${nome}" criada. ${ownerNome} já pode entrar com a conta ${ownerEmail.toLowerCase()}.${aviso} Para ver a empresa por aqui, use "Trocar de empresa".`;
    } catch (err) {
      console.error(err);
      statusEl.textContent = `Não foi possível criar: ${describeSaveError(err)}`;
    } finally {
      submitButton.disabled = false;
    }
  });
}


// ---------------------------------------------------------------------------
// Pedidos de acesso (system administrator)
// ---------------------------------------------------------------------------

function pedidosStatus(message) {
  const el = document.getElementById("pedidos-status");
  if (el) el.textContent = message || "";
}

function updateAjustesBadge() {
  const badge = document.getElementById("ajustes-badge");
  if (!badge) return;
  const n = pedidosPendentes.length;
  badge.hidden = n === 0;
  badge.textContent = String(n);
}

function formatPedidoData(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}

async function loadPedidosAdmin() {
  try {
    const data = await gatewayCall("listRequests", {}, accessToken);
    pedidosPendentes = data.pendentes || [];
    updateAjustesBadge();
    renderPedidosAdmin();
  } catch (err) {
    console.error(err);
    if (!err.sessionExpired) pedidosStatus(`Não foi possível carregar os pedidos: ${describeSaveError(err)}`);
  }
}

async function resolverPedido(pedido, status, nota) {
  await gatewayCall("resolveRequest", { linha: pedido.linha, status, nota }, accessToken);
  pedidoAddAberto = null;
  pedidoRecusarConfirma = null;
  await loadPedidosAdmin();
}

function preencherCriarEmpresa(pedido) {
  pedidoEmAtendimento = pedido.linha;
  document.getElementById("empresa-add-nome").value = pedido.empresa;
  document.getElementById("empresa-add-email").value = pedido.email;
  document.getElementById("empresa-add-dono").value = pedido.nome;
  document.getElementById("empresa-add-status").textContent = `Dados do pedido de ${pedido.nome} preenchidos. Confira e clique em "Criar empresa".`;
  const field = document.getElementById("empresa-add-nome");
  field.scrollIntoView({ behavior: "smooth", block: "center" });
  field.focus();
}

function renderPedidosAdmin() {
  const box = document.getElementById("pedidos-lista");
  if (!box) return;
  box.innerHTML = "";
  if (pedidosPendentes.length === 0) {
    const p = document.createElement("p");
    p.className = "lista-vazia";
    p.textContent = "Nenhum pedido em análise.";
    box.appendChild(p);
    return;
  }

  pedidosPendentes.forEach((pedido) => {
    const card = document.createElement("div");
    card.className = "pedido-card";

    const titulo = document.createElement("div");
    titulo.className = "pedido-titulo";
    titulo.textContent = `${pedido.nome} — ${pedido.email}`;
    card.appendChild(titulo);

    const meta = document.createElement("div");
    meta.className = "pedido-meta";
    const tipoTxt = pedido.tipo === "nova" ? "quer usar na própria empresa" : "trabalha em empresa que já usa";
    meta.textContent = [pedido.empresa, tipoTxt, formatPedidoData(pedido.data)].filter(Boolean).join(" · ");
    card.appendChild(meta);

    if (pedido.mensagem) {
      const msg = document.createElement("div");
      msg.className = "pedido-mensagem";
      msg.textContent = pedido.mensagem;
      card.appendChild(msg);
    }

    const acoes = document.createElement("div");
    acoes.className = "pedido-acoes";

    if (pedido.tipo === "nova") {
      acoes.appendChild(makeAdminButton("Criar empresa", () => preencherCriarEmpresa(pedido), "usuario-action-primary"));
    }
    acoes.appendChild(
      makeAdminButton("Adicionar a uma empresa", () => {
        pedidoAddAberto = pedidoAddAberto === pedido.linha ? null : pedido.linha;
        pedidoRecusarConfirma = null;
        renderPedidosAdmin();
      })
    );
    if (pedidoRecusarConfirma === pedido.linha) {
      acoes.appendChild(
        makeAdminButton(
          "Confirmar recusa",
          async () => {
            try {
              await resolverPedido(pedido, "Recusada", "");
              pedidosStatus(`Pedido de ${pedido.nome} recusado. A pessoa foi avisada por e-mail.`);
            } catch (err) {
              console.error(err);
              pedidosStatus(`Erro: ${describeSaveError(err)}`);
            }
          },
          "usuario-action-danger"
        )
      );
      acoes.appendChild(makeAdminButton("Cancelar", () => { pedidoRecusarConfirma = null; renderPedidosAdmin(); }));
    } else {
      acoes.appendChild(
        makeAdminButton("Recusar", () => {
          pedidoRecusarConfirma = pedido.linha;
          pedidoAddAberto = null;
          renderPedidosAdmin();
        }, "usuario-action-danger-soft")
      );
    }
    card.appendChild(acoes);

    if (pedidoAddAberto === pedido.linha) {
      const add = document.createElement("div");
      add.className = "pedido-add";
      if (currentMasterCompanies.length === 0) {
        add.textContent = "Você não é Master de nenhuma empresa para adicionar essa pessoa.";
      } else {
        const selEmpresa = document.createElement("select");
        selEmpresa.setAttribute("aria-label", "Empresa");
        currentMasterCompanies.forEach((c) => {
          const o = document.createElement("option");
          o.value = c.spreadsheetId;
          o.textContent = c.empresa;
          selEmpresa.appendChild(o);
        });
        const selPerfil = document.createElement("select");
        selPerfil.setAttribute("aria-label", "Perfil");
        ALL_ROLES.forEach((r) => {
          const o = document.createElement("option");
          o.value = r;
          o.textContent = r;
          if (r === ROLE_EDITOR) o.selected = true;
          selPerfil.appendChild(o);
        });
        add.appendChild(selEmpresa);
        add.appendChild(selPerfil);
        add.appendChild(
          makeAdminButton(
            "Adicionar",
            async () => {
              pedidosStatus("Adicionando...");
              try {
                await addUsuarioTo(selEmpresa.value, pedido.email, pedido.nome, selPerfil.value, accessToken);
                await resolverPedido(pedido, "Atendida", "");
                pedidosStatus(`${pedido.nome} foi adicionado(a) e avisado(a) por e-mail.`);
              } catch (err) {
                console.error(err);
                pedidosStatus(`Erro ao adicionar: ${describeSaveError(err)}`);
              }
            },
            "usuario-action-primary"
          )
        );
      }
      card.appendChild(add);
    }

    box.appendChild(card);
  });
}
