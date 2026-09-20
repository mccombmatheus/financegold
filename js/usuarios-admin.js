let allUsuariosAdmin = [];
let usuariosAdminFormReady = false;
let usuarioEditingLinha = null;
let usuarioRemoveConfirmLinha = null;

// A failure is shown in the danger colour (it used to look just like a hint).
function marcarStatusDeErro(el, texto) {
  el.classList.toggle("status-erro", /^(Erro|Não foi possível|Informe|Preencha|Esse e-mail)/.test(texto || ""));
}

function usuariosAdminStatus(message) {
  const el = document.getElementById("usuarios-admin-status");
  if (el) {
    el.textContent = message || "";
    marcarStatusDeErro(el, message);
  }
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isCurrentUser(usuario) {
  return mesmoEmail(usuario.email || "", currentEmail || "");
}

function countMasters() {
  return allUsuariosAdmin.filter((u) => u.perfil === ROLE_MASTER).length;
}

function makeAdminButton(label, onClick, extraClass) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `usuario-action-btn${extraClass ? " " + extraClass : ""}`;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

async function saveUsuarioEdit(usuario, nome, email) {
  const novoNome = nome.trim();
  const novoEmail = email.trim();
  if (!novoNome) return usuariosAdminStatus("Informe o nome.");
  if (!looksLikeEmail(novoEmail)) return usuariosAdminStatus("Informe um e-mail válido.");
  const emailTaken = allUsuariosAdmin.some(
    (u) => u.linha !== usuario.linha && mesmoEmail(u.email, novoEmail)
  );
  if (emailTaken) return usuariosAdminStatus("Esse e-mail já está cadastrado.");

  usuariosAdminStatus("Salvando...");
  try {
    if (novoNome !== usuario.nome) await updateUsuarioNome(usuario.linha, novoNome, accessToken);
    if (novoEmail.toLowerCase() !== usuario.email.toLowerCase()) await updateUsuarioEmail(usuario.linha, novoEmail, accessToken);
    usuarioEditingLinha = null;
    await refreshUsuariosAdmin();
    usuariosAdminStatus("Alterações salvas.");
  } catch (err) {
    console.error(err);
    usuariosAdminStatus(`Erro ao salvar: ${mensagemDoErro(err)}`);
  }
}

async function confirmUsuarioRemoval(usuario) {
  usuariosAdminStatus("Removendo...");
  try {
    await removeUsuario(usuario.linha, accessToken);
    usuarioRemoveConfirmLinha = null;
    await refreshUsuariosAdmin();
    usuariosAdminStatus(`${usuario.nome || usuario.email} não tem mais acesso.`);
  } catch (err) {
    console.error(err);
    usuariosAdminStatus(`Erro ao remover: ${mensagemDoErro(err)}`);
  }
}

function buildPerfilSelect(usuario) {
  const select = document.createElement("select");
  ALL_ROLES.forEach((role) => {
    const opt = document.createElement("option");
    opt.value = role;
    opt.textContent = role;
    if (role === usuario.perfil) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener("change", async () => {
    const previous = usuario.perfil;
    // Never leave a company with no Master: nobody could manage access anymore.
    if (previous === ROLE_MASTER && select.value !== ROLE_MASTER && countMasters() <= 1) {
      select.value = previous;
      usuariosAdminStatus("A empresa precisa ter pelo menos um Master. Torne outra pessoa Master antes.");
      return;
    }
    select.disabled = true;
    try {
      await updateUsuarioPerfil(usuario.linha, select.value, accessToken);
      usuario.perfil = select.value;
      usuariosAdminStatus("Perfil atualizado.");
    } catch (err) {
      console.error(err);
      usuariosAdminStatus(`Erro ao salvar: ${mensagemDoErro(err)}`);
      select.value = previous;
    } finally {
      select.disabled = false;
    }
  });
  return select;
}

function renderUsuariosTable() {
  const tbody = document.querySelector("#usuarios-table tbody");
  tbody.innerHTML = "";

  allUsuariosAdmin.forEach((usuario) => {
    const editing = usuarioEditingLinha === usuario.linha;
    const confirmingRemoval = usuarioRemoveConfirmLinha === usuario.linha;
    const tr = document.createElement("tr");

    const nomeTd = document.createElement("td");
    nomeTd.className = "usuario-col-nome";
    const emailTd = document.createElement("td");
    emailTd.className = "usuario-col-email";
    let nomeInput = null;
    let emailInput = null;
    if (editing) {
      nomeInput = document.createElement("input");
      nomeInput.type = "text";
      nomeInput.value = usuario.nome;
      nomeInput.setAttribute("aria-label", "Nome");
      nomeTd.appendChild(nomeInput);
      emailInput = document.createElement("input");
      emailInput.type = "email";
      emailInput.value = usuario.email;
      emailInput.setAttribute("aria-label", "E-mail");
      emailTd.appendChild(emailInput);
    } else {
      nomeTd.textContent = usuario.nome;
      emailTd.textContent = usuario.email;
    }
    tr.appendChild(nomeTd);
    tr.appendChild(emailTd);

    const perfilTd = document.createElement("td");
    perfilTd.className = "usuario-col-perfil";
    perfilTd.appendChild(buildPerfilSelect(usuario));
    tr.appendChild(perfilTd);

    const acoesTd = document.createElement("td");
    acoesTd.className = "usuario-col-acoes";
    if (editing) {
      acoesTd.appendChild(
        makeAdminButton("Salvar", () => saveUsuarioEdit(usuario, nomeInput.value, emailInput.value), "usuario-action-primary")
      );
      acoesTd.appendChild(
        makeAdminButton("Cancelar", () => {
          usuarioEditingLinha = null;
          usuariosAdminStatus("");
          renderUsuariosTable();
        })
      );
    } else if (confirmingRemoval) {
      acoesTd.appendChild(makeAdminButton("Confirmar remoção", () => confirmUsuarioRemoval(usuario), "usuario-action-danger"));
      acoesTd.appendChild(
        makeAdminButton("Cancelar", () => {
          usuarioRemoveConfirmLinha = null;
          usuariosAdminStatus("");
          renderUsuariosTable();
        })
      );
    } else {
      acoesTd.appendChild(
        makeAdminButton("Editar", () => {
          usuarioEditingLinha = usuario.linha;
          usuarioRemoveConfirmLinha = null;
          usuariosAdminStatus("");
          renderUsuariosTable();
        })
      );
      acoesTd.appendChild(
        makeAdminButton("Remover", () => {
          if (isCurrentUser(usuario)) {
            usuariosAdminStatus("Você não pode remover o seu próprio acesso.");
            return;
          }
          if (usuario.perfil === ROLE_MASTER && countMasters() <= 1) {
            usuariosAdminStatus("A empresa precisa ter pelo menos um Master.");
            return;
          }
          usuarioEditingLinha = null;
          usuarioRemoveConfirmLinha = usuario.linha;
          usuariosAdminStatus("");
          renderUsuariosTable();
        }, "usuario-action-danger-soft")
      );
    }
    tr.appendChild(acoesTd);

    tbody.appendChild(tr);
  });
}

function initUsuariosAdmin(usuarios) {
  allUsuariosAdmin = usuarios;
  renderUsuariosTable();
  if (!usuariosAdminFormReady) {
    usuariosAdminFormReady = true;
    setupUsuarioAddForm();
  }
}

async function refreshUsuariosAdmin() {
  allUsuariosAdmin = await fetchAllUsuarios(accessToken);
  renderUsuariosTable();
}

function setupUsuarioAddForm() {
  const hintEl = document.getElementById("usuario-add-hint");
  if (hintEl && CONFIG.GATEWAY_URL) {
    hintEl.textContent = "Ao adicionar, a pessoa já pode entrar com esse e-mail: pela conta Google ou, se tiver um acesso com senha aprovado, com e-mail e senha. Não precisa compartilhar a planilha.";
  }
  const form = document.getElementById("usuario-add-form");
  const statusEl = document.getElementById("usuario-add-status");
  const submitButton = document.getElementById("btn-usuario-add");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("usuario-add-email").value.trim();
    const nome = document.getElementById("usuario-add-nome").value.trim();
    const perfil = document.getElementById("usuario-add-perfil").value;

    if (!email || !nome) {
      statusEl.textContent = "Preencha e-mail e nome.";
      marcarStatusDeErro(statusEl, statusEl.textContent);
      return;
    }
    if (!looksLikeEmail(email)) {
      statusEl.textContent = "Informe um e-mail válido.";
      marcarStatusDeErro(statusEl, statusEl.textContent);
      return;
    }
    if (allUsuariosAdmin.some((u) => mesmoEmail(u.email, email))) {
      statusEl.textContent = "Esse e-mail já está cadastrado.";
      marcarStatusDeErro(statusEl, statusEl.textContent);
      return;
    }

    submitButton.disabled = true;
    statusEl.textContent = "Salvando...";
    marcarStatusDeErro(statusEl, "");
    try {
      await addUsuario(email, nome, perfil, accessToken);
      statusEl.textContent = CONFIG.GATEWAY_URL
        ? "Usuário adicionado. Ele já pode entrar com esse e-mail (conta Google ou e-mail e senha)."
        : "Usuário adicionado. Falta compartilhar a planilha no Google Drive com este e-mail.";
      form.reset();
      document.getElementById("usuario-add-perfil").value = "Visualizador";
      await refreshUsuariosAdmin();
    } catch (err) {
      console.error(err);
      statusEl.textContent = `Erro ao salvar: ${mensagemDoErro(err)}`;
    } finally {
      marcarStatusDeErro(statusEl, statusEl.textContent);
      submitButton.disabled = false;
    }
  });
}
