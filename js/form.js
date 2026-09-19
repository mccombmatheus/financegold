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

// Inputs for the sheet's own extra columns (the ones the app has no field for),
// so a new row can fill them too. Text only, written as typed.
function montarCamposExtras(gridId, extras) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = "";
  (extras || []).slice(0, 8).forEach((extra) => {
    const wrap = document.createElement("div");
    wrap.className = "form-field";
    const label = document.createElement("label");
    label.textContent = `${extra.nome} — opcional`;
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 500;
    input.dataset.col = String(extra.col);
    wrap.appendChild(label);
    wrap.appendChild(input);
    grid.appendChild(wrap);
  });
  grid.hidden = grid.children.length === 0;
}

function lerCamposExtras(gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return [];
  return Array.from(grid.querySelectorAll("input"))
    .map((input) => ({ col: Number(input.dataset.col), valor: input.value.trim() }))
    .filter((e) => e.valor !== "");
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
    extras: lerCamposExtras("lancamento-extras-grid"),
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
  const esquema = await garantirEsquema("lancamentos", token);
  if (esquema.cols.data === undefined || esquema.cols.valor === undefined) {
    throw new Error("Não encontrei as colunas de Data e Valor na planilha.");
  }
  const { porColuna } = colunasParaEscrever(esquema, {
    data: dateInputToSheetSerial(values.data),
    loja: values.loja,
    conta: values.conta,
    empresa: values.empresa,
    categoria: values.categoria,
    valor: valorParaPlanilha(esquema, values.tipo, values.valor),
    tipo: rotuloTipoParaPlanilha(esquema, values.tipo),
    peso: values.peso ? Number(values.peso) : "",
    pessoa: values.pessoa,
    observacao: values.observacao || "",
  }, values.extras);

  const targetRow = await findNextLancamentoRow(token);
  await escreverColunas("lancamentos", targetRow, porColuna, esquema.cols.data, token);
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
