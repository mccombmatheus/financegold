let allUsuariosAdmin = [];
let usuariosAdminFormReady = false;

function renderUsuariosTable() {
  const tbody = document.querySelector("#usuarios-table tbody");
  tbody.innerHTML = "";

  allUsuariosAdmin.forEach((usuario) => {
    const tr = document.createElement("tr");

    const nomeTd = document.createElement("td");
    nomeTd.textContent = usuario.nome;
    tr.appendChild(nomeTd);

    const emailTd = document.createElement("td");
    emailTd.textContent = usuario.email;
    tr.appendChild(emailTd);

    const perfilTd = document.createElement("td");
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
      select.disabled = true;
      try {
        await updateUsuarioPerfil(usuario.linha, select.value, accessToken);
        usuario.perfil = select.value;
      } catch (err) {
        console.error(err);
        alert(describeSaveError(err));
        select.value = previous;
      } finally {
        select.disabled = false;
      }
    });
    perfilTd.appendChild(select);
    tr.appendChild(perfilTd);

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
      return;
    }

    submitButton.disabled = true;
    statusEl.textContent = "Salvando...";
    try {
      await addUsuario(email, nome, perfil, accessToken);
      statusEl.textContent = "Usuário adicionado.";
      form.reset();
      document.getElementById("usuario-add-perfil").value = "Visualizador";
      await refreshUsuariosAdmin();
    } catch (err) {
      console.error(err);
      statusEl.textContent = `Erro ao salvar: ${err.message}`;
    } finally {
      submitButton.disabled = false;
    }
  });
}
