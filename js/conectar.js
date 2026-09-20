// Ajustes → Conectar planilha (company Master). The app already recognises the
// columns of any tab by itself; this card is for the other half: telling it
// WHICH tab is the cash flow, the stock and the support lists when the tabs are
// not named like the defaults. It analyses every tab (the Master may read them
// all), suggests a role for each, and saves the choice in a small "Configuração"
// tab that the gateway then uses to authorise those tabs for the whole company.
// A card below shows exactly how each column was understood.

let conectarReady = false;
let conectarAbas = []; // [{ nome, papel, resumo }]

const CONECTAR_PAPEIS = [
  { valor: "", rotulo: "Não usar" },
  { valor: "lancamentos", rotulo: "Fluxo de caixa" },
  { valor: "estoque", rotulo: "Estoque" },
  { valor: "lista:lojas", rotulo: "Lista: lojas" },
  { valor: "lista:contas", rotulo: "Lista: contas" },
  { valor: "lista:empresas", rotulo: "Lista: empresas" },
  { valor: "lista:categorias", rotulo: "Lista: categorias" },
  { valor: "lista:pessoas", rotulo: "Lista: pessoas" },
  { valor: "lista:produtos", rotulo: "Lista: produtos" },
  { valor: "lista:tiposProduto", rotulo: "Lista: tipos de produto" },
  { valor: "lista:marcas", rotulo: "Lista: marcas" },
];

function conectarStatus(message) {
  const el = document.getElementById("conectar-status");
  if (el) el.textContent = message || "";
}

function papelPadraoDaAba(nome) {
  if (nome === nomeAba("lancamentos")) return "lancamentos";
  if (nome === nomeAba("estoque")) return "estoque";
  const chave = Object.keys(ABAS_LISTAS_PADRAO).filter((k) => nomeAba(k) === nome)[0];
  return chave ? `lista:${chave}` : "";
}

function resumoDoEsquema(esquema) {
  if (!esquema || esquema.linhaCabecalho === 0) return "";
  return esquema.reconhecidos
    .map((r) => `${NOMES_CAMPOS[r.campo] || r.campo} ← ${r.titulo || "?"}`)
    .join(" · ");
}

// Scans the tabs and suggests what each one is.
async function analisarPlanilha() {
  conectarStatus("Analisando as abas da planilha...");
  const titulos = (await getSheetTitles(CONFIG.SPREADSHEET_ID, accessToken)).filter((t) => t !== USUARIOS_SHEET_NAME && t !== ABA_CONFIG);
  const lidas = [];
  for (let i = 0; i < titulos.length; i += 1) {
    const nome = titulos[i];
    let rows = [];
    try {
      rows = await fetchSheetValues(CONFIG.SPREADSHEET_ID, intervaloAba(nome, "A1:BZ60"), accessToken, {
        valueRenderOption: "UNFORMATTED_VALUE",
      });
    } catch (err) {
      if (err && (err.sessionExpired || isNetworkError(err))) throw err;
    }
    lidas.push({ nome, rows });
  }

  const sugestoes = lidas.map(({ nome, rows }) => {
    const cls = classificarAba(nome, rows);
    let papel = cls.papel === "outra" ? "" : cls.papel;
    if (!papel) {
      const lista = adivinharLista(nome);
      papel = lista ? `lista:${lista}` : "";
    }
    const esquema = papel === "lancamentos" || papel === "estoque" ? detectarEsquema(rows, papel) : null;
    return { nome, papel, nota: cls.nota, resumo: esquema ? resumoDoEsquema(esquema) : "", linhas: rows.length };
  });

  // one tab per role: the best-scored keeps it
  ["lancamentos", "estoque"].forEach((papel) => {
    const candidatas = sugestoes.filter((s) => s.papel === papel).sort((a, b) => b.nota - a.nota);
    candidatas.slice(1).forEach((s) => {
      s.papel = "";
      s.resumo = "";
    });
  });
  const vistas = {};
  sugestoes.forEach((s) => {
    if (s.papel.indexOf("lista:") === 0) {
      if (vistas[s.papel]) s.papel = "";
      else vistas[s.papel] = true;
    }
  });

  conectarAbas = sugestoes;
  renderConectarTabela();
  const tem = (p) => sugestoes.some((s) => s.papel === p);
  conectarStatus(
    tem("lancamentos")
      ? "Confira o que foi reconhecido e clique em Salvar conexão."
      : "Não encontrei uma aba que pareça o fluxo de caixa (precisa ter ao menos Data e Valor). Escolha manualmente, se houver."
  );
}

function renderConectarTabela() {
  const tbody = document.querySelector("#conectar-table tbody");
  tbody.innerHTML = "";
  conectarAbas.forEach((aba, i) => {
    const tr = document.createElement("tr");
    const tdNome = document.createElement("td");
    tdNome.textContent = aba.nome;
    tr.appendChild(tdNome);

    const tdPapel = document.createElement("td");
    const select = document.createElement("select");
    select.setAttribute("aria-label", `O que é a aba ${aba.nome}`);
    CONECTAR_PAPEIS.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.valor;
      opt.textContent = p.rotulo;
      select.appendChild(opt);
    });
    select.value = aba.papel;
    select.addEventListener("change", () => {
      aba.papel = select.value;
      // a role can only belong to one tab
      if (aba.papel) conectarAbas.forEach((outra, j) => { if (j !== i && outra.papel === aba.papel) outra.papel = ""; });
      renderConectarTabela();
    });
    tdPapel.appendChild(select);
    tr.appendChild(tdPapel);

    const tdResumo = document.createElement("td");
    tdResumo.textContent = aba.resumo || `${aba.linhas} linha(s)`;
    tr.appendChild(tdResumo);
    tbody.appendChild(tr);
  });
  document.getElementById("conectar-resultado").hidden = false;
}

function recarregarPagina() {
  location.reload();
}

async function salvarConexao() {
  const escolhidas = conectarAbas.filter((a) => a.papel);
  const diferentes = escolhidas.filter((a) => papelPadraoDaAba(a.nome) !== a.papel);
  if (!escolhidas.some((a) => a.papel === "lancamentos")) {
    conectarStatus("Escolha qual aba é o fluxo de caixa.");
    return;
  }
  if (diferentes.length === 0 && Object.keys(abasConfiguradas).length === 0) {
    conectarStatus("Nada a configurar: os nomes das abas já são os esperados.");
    return;
  }
  if (diferentes.length > 25) {
    conectarStatus("Muitas abas selecionadas. Deixe só o que o app precisa.");
    return;
  }
  conectarStatus("Salvando a conexão...");
  try {
    let existe = true;
    try {
      await fetchSheetValues(CONFIG.SPREADSHEET_ID, intervaloAba(ABA_CONFIG, "A1:B1"), accessToken);
    } catch (err) {
      if (err && (err.sessionExpired || isNetworkError(err))) throw err;
      existe = false;
    }
    if (!existe) await createSheetTab(CONFIG.SPREADSHEET_ID, ABA_CONFIG, accessToken);

    await updateSheetRow(CONFIG.SPREADSHEET_ID, intervaloAba(ABA_CONFIG, "A1:B1"), ["Papel", "Aba"], accessToken);
    const linhas = diferentes.map((a) => [a.papel, a.nome]);
    const total = Math.max(linhas.length, Object.keys(abasConfiguradas).length);
    for (let i = 0; i < total; i += 1) {
      const linha = linhas[i] || ["", ""];
      await updateSheetRow(CONFIG.SPREADSHEET_ID, intervaloAba(ABA_CONFIG, `A${i + 2}:B${i + 2}`), linha, accessToken);
    }
    conectarStatus("Conexão salva. Recarregando...");
    setTimeout(recarregarPagina, 900);
  } catch (err) {
    console.error(err);
    conectarStatus(`Não foi possível salvar: ${mensagemDoErro(err)}`);
  }
}

// How the app currently understands each tab: column by column.
function renderLeituraAtual() {
  const host = document.getElementById("conectar-leitura");
  if (!host) return;
  host.innerHTML = "";
  [["lancamentos", "Fluxo de caixa"], ["estoque", "Estoque"]].forEach(([papel, titulo]) => {
    const esq = obterEsquema(papel);
    const bloco = document.createElement("div");
    bloco.className = "leitura-bloco";
    const h = document.createElement("h3");
    h.textContent = `${titulo} — aba "${nomeAba(papel)}"`;
    bloco.appendChild(h);
    const p = document.createElement("p");
    p.className = "field-hint";
    if (!esq) {
      p.textContent = "Ainda não carregada.";
    } else {
      const partes = [];
      partes.push(esq.linhaCabecalho > 0 ? `Títulos na linha ${esq.linhaCabecalho}.` : "Sem linha de títulos reconhecida: usei as colunas na ordem padrão.");
      partes.push(resumoDoEsquema(esq) || "Nenhuma coluna reconhecida pelo título.");
      const camposDoPapel = Object.keys(POSICOES_PADRAO[papel]);
      const faltando = camposDoPapel.filter((c) => esq.cols[c] === undefined).map((c) => NOMES_CAMPOS[c]);
      if (faltando.length) partes.push(`Não encontrei: ${faltando.join(", ")}.`);
      if (esq.extras.length) partes.push(`Colunas extras (mostradas assim mesmo): ${esq.extras.map((e) => e.nome).join(", ")}.`);
      p.textContent = partes.join(" ");
    }
    bloco.appendChild(p);
    host.appendChild(bloco);
  });
}

// Two panels in the card: connecting a sheet, and downloading the template.
function mostrarPainelConectar(qual) {
  ["conectar", "modelo"].forEach((nome) => {
    document.getElementById(`conectar-painel-${nome}`).hidden = nome !== qual;
    const aba = document.getElementById(`aba-${nome}`);
    aba.classList.toggle("active", nome === qual);
    aba.setAttribute("aria-selected", nome === qual ? "true" : "false");
  });
}

function prepararModelo() {
  const select = document.getElementById("modelo-segmento");
  select.innerHTML = "";
  Object.keys(SEGMENTOS).forEach((id) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = SEGMENTOS[id].nome;
    select.appendChild(option);
  });
  select.value = segmentoValido(segmentoAtual);
}

function initConectar() {
  renderLeituraAtual();
  prepararModelo();
  if (conectarReady) return;
  conectarReady = true;
  document.querySelectorAll(".conectar-aba").forEach((botao) => {
    botao.addEventListener("click", () => mostrarPainelConectar(botao.dataset.painel));
  });
  document.getElementById("btn-baixar-modelo").addEventListener("click", () => {
    const status = document.getElementById("modelo-status");
    try {
      baixarModelo(document.getElementById("modelo-segmento").value);
      status.textContent = "Modelo baixado. Procure o arquivo na pasta Downloads.";
    } catch (err) {
      console.error(err);
      status.textContent = "Não foi possível gerar o modelo neste navegador.";
    }
  });
  document.getElementById("btn-conectar-analisar").addEventListener("click", async () => {
    const btn = document.getElementById("btn-conectar-analisar");
    btn.disabled = true;
    try {
      await analisarPlanilha();
    } catch (err) {
      console.error(err);
      conectarStatus(`Não foi possível analisar: ${mensagemDoErro(err)}`);
    } finally {
      btn.disabled = false;
    }
  });
  document.getElementById("btn-conectar-salvar").addEventListener("click", salvarConexao);
}
