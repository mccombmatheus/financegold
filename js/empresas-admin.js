// Ajustes → Empresas (system administrators only): create a new company from
// inside the app. The gateway does the real work and the real permission check
// (only ADMIN_EMAILS may create one); this file is just the form.

let empresasAdminReady = false;

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
      statusEl.textContent = `Empresa "${nome}" criada. ${ownerNome} já pode entrar com a conta ${ownerEmail.toLowerCase()}. Para ver a empresa por aqui, use "Trocar de empresa".`;
    } catch (err) {
      console.error(err);
      statusEl.textContent = `Não foi possível criar: ${describeSaveError(err)}`;
    } finally {
      submitButton.disabled = false;
    }
  });
}
