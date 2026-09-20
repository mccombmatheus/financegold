// The screen a person sees after signing in with a Google account that has no
// access to any company yet: instead of a dead end, they can ask for access.
// The request goes to the gateway (action "requestAccess"), which stores it and
// e-mails the system administrator; the administrator answers in Ajustes.

let solicitarAcessoReady = false;

function setSolicitarEstado(message) {
  const el = document.getElementById("solicitar-estado");
  el.textContent = message || "";
  el.hidden = !message;
}

// pedido: { status: "Pendente" | "Atendida" | "Recusada", empresa } or null.
function showSolicitarAcessoScreen(email, pedido) {
  hideAllScreens();
  solicitarAcessoScreen.hidden = false;
  setupSolicitarAcesso();

  document.getElementById("solicitar-lede").textContent =
    `Você entrou como ${email}, mas essa conta ainda não tem acesso a nenhuma empresa. Se o administrador diz que já liberou você, confira se ele cadastrou exatamente este e-mail: você pode estar entrando com outra conta Google (toque em Sair e escolha a conta certa).`;
  document.getElementById("solicitar-status").textContent = "";
  const form = document.getElementById("solicitar-form");
  const verificar = document.getElementById("btn-solicitar-verificar");
  form.hidden = false;
  verificar.hidden = true;
  setSolicitarEstado("");

  if (pedido && pedido.status === "Pendente") {
    form.hidden = true;
    verificar.hidden = false;
    setSolicitarEstado(`Seu pedido${pedido.empresa ? ` (${pedido.empresa})` : ""} está em análise. Você receberá um e-mail quando for liberado. Depois é só entrar de novo.`);
  } else if (pedido && pedido.status === "Atendida") {
    form.hidden = true;
    verificar.hidden = false;
    setSolicitarEstado("Seu pedido foi atendido. Toque em \"Verificar de novo\" para entrar.");
  } else if (pedido && pedido.status === "Recusada") {
    setSolicitarEstado("Seu último pedido não foi aprovado. Se quiser, envie um novo abaixo.");
  }
}

function setupSolicitarAcesso() {
  if (solicitarAcessoReady) return;
  solicitarAcessoReady = true;

  const form = document.getElementById("solicitar-form");
  const submit = document.getElementById("btn-solicitar-enviar");
  const status = document.getElementById("solicitar-status");
  const empresaInput = document.getElementById("solicitar-empresa");

  form.querySelectorAll('input[name="solicitar-tipo"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      empresaInput.placeholder = radio.value === "nova" ? "Nome da sua empresa" : "Nome da empresa onde você trabalha";
    });
  });

  document.getElementById("btn-solicitar-verificar").addEventListener("click", () => {
    status.textContent = "Verificando...";
    handleSignedIn(accessToken);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const tipo = form.querySelector('input[name="solicitar-tipo"]:checked').value;
    const nome = document.getElementById("solicitar-nome").value.trim();
    const empresa = empresaInput.value.trim();
    const mensagem = document.getElementById("solicitar-mensagem").value.trim();
    if (!nome || !empresa) {
      status.textContent = "Preencha o seu nome e o nome da empresa.";
      return;
    }

    submit.disabled = true;
    status.textContent = "Enviando...";
    try {
      const result = await gatewayCall("requestAccess", { tipo, nome, empresa, mensagem }, accessToken);
      form.hidden = true;
      status.textContent = "";
      setSolicitarEstado(
        result.duplicate
          ? "Você já tem um pedido em análise. Assim que for liberado você recebe um e-mail."
          : "Pedido enviado! O administrador foi avisado por e-mail. Quando for liberado você recebe uma mensagem e é só entrar de novo."
      );
      document.getElementById("btn-solicitar-verificar").hidden = false;
    } catch (err) {
      console.error(err);
      if (!err.sessionExpired) status.textContent = `Não foi possível enviar: ${describeSaveError(err)}`;
    } finally {
      submit.disabled = false;
    }
  });
}
