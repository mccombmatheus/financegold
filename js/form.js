let lancamentoFormInitialized = false;

function populateSelect(selectEl, options, placeholder) {
  const previousValue = selectEl.value;
  selectEl.innerHTML = "";

  const placeholderOpt = document.createElement("option");
  placeholderOpt.value = "";
  placeholderOpt.textContent = placeholder;
  placeholderOpt.disabled = true;
  placeholderOpt.selected = true;
  selectEl.appendChild(placeholderOpt);

  options.forEach(({ value, label }) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    selectEl.appendChild(opt);
  });

  if (previousValue && options.some((o) => o.value === previousValue)) {
    selectEl.value = previousValue;
  }
}

function populateLookupSelects(lookups) {
  populateSelect(document.getElementById("field-loja"), lookups.lojas, "Selecione a loja");
  populateSelect(document.getElementById("field-conta"), lookups.contas, "Selecione a conta");
  populateSelect(document.getElementById("field-empresa"), lookups.empresas, "Selecione a empresa");
  populateSelect(document.getElementById("field-categoria"), lookups.categorias, "Selecione a categoria");
  populateSelect(document.getElementById("field-pessoa"), lookups.pessoas, "Selecione a pessoa");
}

function setDefaultFormDate() {
  document.getElementById("field-data").value = new Date().toISOString().slice(0, 10);
}

function resetLancamentoForm() {
  document.getElementById("lancamento-form").reset();
  setDefaultFormDate();
}

function readFormValues() {
  return {
    data: document.getElementById("field-data").value,
    tipo: document.getElementById("field-tipo").value,
    valor: Number(document.getElementById("field-valor").value),
    loja: document.getElementById("field-loja").value,
    conta: document.getElementById("field-conta").value,
    empresa: document.getElementById("field-empresa").value,
    categoria: document.getElementById("field-categoria").value,
    pessoa: document.getElementById("field-pessoa").value,
    peso: document.getElementById("field-peso").value,
    observacao: document.getElementById("field-observacao").value,
  };
}

function validateFormValues(values) {
  const required = ["data", "tipo", "loja", "conta", "empresa", "categoria", "pessoa"];
  const missing = required.some((key) => !values[key]);
  if (missing) return "Preencha todos os campos obrigatórios.";
  if (!values.valor || values.valor <= 0) return "Informe um valor maior que zero.";
  return null;
}

async function submitLancamentoValues(values, token) {
  const valorFinal = values.tipo === "Saída" ? -Math.abs(values.valor) : Math.abs(values.valor);
  const row = [
    dateInputToSheetSerial(values.data),
    values.loja,
    values.conta,
    values.empresa,
    values.categoria,
    valorFinal,
    values.tipo,
    values.peso ? Number(values.peso) : "",
    values.pessoa,
    values.observacao || "",
  ];

  const targetRow = await findNextLancamentoRow(token);
  const range = `${CONFIG.SHEET_NAME}!A${targetRow}:J${targetRow}`;
  await updateSheetRow(CONFIG.SPREADSHEET_ID, range, row, token);
  return targetRow;
}

function setupLancamentoForm() {
  if (lancamentoFormInitialized) return;
  lancamentoFormInitialized = true;

  const form = document.getElementById("lancamento-form");
  const formStatus = document.getElementById("form-status");
  const submitButton = document.getElementById("btn-salvar-lancamento");

  setDefaultFormDate();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = readFormValues();
    const validationError = validateFormValues(values);
    if (validationError) {
      formStatus.textContent = validationError;
      return;
    }

    submitButton.disabled = true;
    formStatus.textContent = "Salvando...";

    try {
      const targetRow = await submitLancamentoValues(values, accessToken);
      formStatus.textContent = `Lançamento salvo na linha ${targetRow}.`;
      resetLancamentoForm();
      await refreshLancamentosAndDashboard();
    } catch (err) {
      if (isNetworkError(err)) {
        enqueueWrite("lancamento", values);
        formStatus.textContent = "Sem internet — o lançamento foi guardado e será enviado automaticamente quando a conexão voltar.";
        resetLancamentoForm();
      } else {
        console.error(err);
        formStatus.textContent = `Erro ao salvar: ${err.message}`;
      }
    } finally {
      submitButton.disabled = false;
    }
  });
}
