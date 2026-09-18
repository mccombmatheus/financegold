let allLancamentos = [];

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function startOfMonthUTC(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonthUTC(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function toInputDateValue(date) {
  return date.toISOString().slice(0, 10);
}

function parseInputDate(value, endOfDay) {
  return new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}Z`);
}

function computePresetRange(preset, records) {
  const today = new Date();
  const now = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  switch (preset) {
    case "mes-atual":
      return { start: startOfMonthUTC(now), end: endOfMonthUTC(now) };
    case "mes-anterior": {
      const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      return { start: startOfMonthUTC(prevMonth), end: endOfMonthUTC(prevMonth) };
    }
    case "ano-atual":
      return {
        start: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
        end: new Date(Date.UTC(now.getUTCFullYear(), 11, 31)),
      };
    case "tudo":
    default: {
      const dates = records.map((r) => r.data).filter(Boolean);
      if (dates.length === 0) return { start: startOfMonthUTC(now), end: endOfMonthUTC(now) };
      return {
        start: new Date(Math.min(...dates)),
        end: new Date(Math.max(...dates)),
      };
    }
  }
}

// Fixed, developer-authored icon markup only (never sheet/user data) — safe
// to insert as innerHTML; see the no-innerHTML-with-untrusted-data rule this
// deliberately doesn't violate (CLAUDE.md's Security posture section).
const KPI_ICONS = {
  up: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  down: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  scale: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
  gem: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 3h12l4 6-10 12L2 9z"/></svg>',
};

// null when there's no meaningful baseline (no previous-period data, or it
// was zero) — the caller skips rendering a trend line rather than showing a
// fake/divide-by-zero percentage.
function computeTrend(current, previous) {
  if (previous === null || previous === undefined || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function buildKpiTile({ label, value, icon, iconClass, trend, hero, invertTrendColor }) {
  const tile = document.createElement("div");
  tile.className = `stat-tile${hero ? " stat-tile-hero" : ""}`;

  const top = document.createElement("div");
  top.className = "stat-top";

  const labelEl = document.createElement("span");
  labelEl.className = "stat-label";
  labelEl.textContent = label;

  const iconBadge = document.createElement("div");
  iconBadge.className = `stat-icon stat-icon-${iconClass}`;
  iconBadge.innerHTML = icon;

  top.appendChild(labelEl);
  top.appendChild(iconBadge);

  const valueEl = document.createElement("div");
  valueEl.className = "stat-value";
  valueEl.textContent = value;

  tile.appendChild(top);
  tile.appendChild(valueEl);

  if (trend !== null && trend !== undefined) {
    // The arrow/percentage always reflect the real change. The color reflects
    // whether that change is favorable for this specific metric — for a
    // "cost" metric like Saídas, a drop (trend < 0) is the good outcome and
    // should read green, not red, so it's inverted via `invertTrendColor`
    // rather than tying color straight to the raw sign.
    const isUp = trend >= 0;
    const isFavorable = invertTrendColor ? !isUp : isUp;
    const trendEl = document.createElement("div");
    trendEl.className = `stat-trend ${isFavorable ? "positive" : "negative"}`;
    trendEl.textContent = `${isUp ? "↑" : "↓"} ${Math.abs(trend).toFixed(1)}% vs. período anterior`;
    tile.appendChild(trendEl);
  }

  return tile;
}

function renderKpis(records, prevRecords) {
  const kpis = computeKpis(records);
  const prevKpis = prevRecords && prevRecords.length > 0 ? computeKpis(prevRecords) : null;
  const trendFor = (curr, key) => (prevKpis ? computeTrend(curr, prevKpis[key]) : null);

  const kpiRow = document.getElementById("kpi-row");
  kpiRow.innerHTML = "";

  kpiRow.appendChild(
    buildKpiTile({
      label: "Entradas do período",
      value: formatBRL(kpis.entradas),
      icon: KPI_ICONS.up,
      iconClass: "success",
      trend: trendFor(kpis.entradas, "entradas"),
    })
  );
  kpiRow.appendChild(
    buildKpiTile({
      label: "Saídas do período",
      value: formatBRL(kpis.saidas),
      icon: KPI_ICONS.down,
      iconClass: "danger",
      trend: trendFor(kpis.saidas, "saidas"),
      invertTrendColor: true,
    })
  );
  kpiRow.appendChild(
    buildKpiTile({
      label: "Saldo do período",
      value: formatBRL(kpis.saldo),
      icon: KPI_ICONS.scale,
      iconClass: "hero",
      hero: true,
      trend: trendFor(kpis.saldo, "saldo"),
    })
  );
  kpiRow.appendChild(
    buildKpiTile({
      label: "Ouro comprado (g)",
      value: formatGrams(kpis.pesoComprado),
      icon: KPI_ICONS.gem,
      iconClass: "neutral",
      trend: trendFor(kpis.pesoComprado, "pesoComprado"),
    })
  );
  kpiRow.appendChild(
    buildKpiTile({
      label: "Ouro vendido (g)",
      value: formatGrams(kpis.pesoVendido),
      icon: KPI_ICONS.gem,
      iconClass: "neutral",
      trend: trendFor(kpis.pesoVendido, "pesoVendido"),
    })
  );
}

function chartBody(cardId) {
  return document.querySelector(`#${cardId} .chart-body`);
}

// Fixed, developer-authored icon markup only — same non-dynamic-innerHTML
// exception as KPI_ICONS above.
const ACTIVITY_ICONS = {
  up: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  down: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
};

// Real transaction dates only — the sheet has no "entered at" timestamp, so
// this deliberately does not fabricate relative times like "12 min atrás".
function renderAtividadeRecente(records) {
  const container = document.getElementById("atividade-recente-lista");
  if (!container) return;
  container.innerHTML = "";

  const recent = records
    .slice()
    .sort((a, b) => {
      const dataDiff = (b.data ? b.data.getTime() : 0) - (a.data ? a.data.getTime() : 0);
      return dataDiff !== 0 ? dataDiff : b.linha - a.linha;
    })
    .slice(0, 6);

  if (recent.length === 0) {
    const empty = document.createElement("div");
    empty.className = "chart-empty";
    empty.textContent = "Sem lançamentos no período.";
    container.appendChild(empty);
    return;
  }

  recent.forEach((r) => {
    const isEntrada = r.tipo === "Entrada";
    const row = document.createElement("div");
    row.className = "activity-row";

    const icon = document.createElement("div");
    icon.className = `activity-icon ${isEntrada ? "success" : "danger"}`;
    icon.innerHTML = isEntrada ? ACTIVITY_ICONS.up : ACTIVITY_ICONS.down;
    row.appendChild(icon);

    const info = document.createElement("div");
    info.className = "activity-info";

    const title = document.createElement("div");
    title.className = "activity-title";
    title.textContent = [r.categoria, r.pessoa].filter(Boolean).join(" — ") || "Lançamento";
    info.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "activity-meta";
    const metaParts = [r.loja, r.data ? r.data.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null].filter(Boolean);
    meta.textContent = metaParts.join(" · ");
    info.appendChild(meta);

    row.appendChild(info);

    const amount = document.createElement("div");
    amount.className = `activity-amount ${isEntrada ? "positive" : "negative"}`;
    amount.textContent = `${isEntrada ? "+" : "−"}${formatBRL(Math.abs(r.valor))}`;
    row.appendChild(amount);

    container.appendChild(row);
  });
}

let activitySeeAllReady = false;

function setupActivitySeeAll() {
  if (activitySeeAllReady) return;
  activitySeeAllReady = true;
  const btn = document.querySelector(".activity-see-all");
  if (btn) btn.addEventListener("click", () => setActiveView(btn.dataset.view));
}

function renderDashboardCharts() {
  const startInput = document.getElementById("filter-start").value;
  const endInput = document.getElementById("filter-end").value;
  if (!startInput || !endInput) return;

  const start = parseInputDate(startInput, false);
  const end = parseInputDate(endInput, true);
  const filtered = filterByDateRange(allLancamentos, start, end);

  // Same-length window immediately preceding the selected range, used for
  // the KPI trend indicators ("↑ 12% vs. período anterior") — a real
  // comparison, not a decorative fixed number.
  const durationMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1000);
  const prevStart = new Date(prevEnd.getTime() - durationMs);
  const prevFiltered = filterByDateRange(allLancamentos, prevStart, prevEnd);

  renderKpis(filtered, prevFiltered);
  renderAtividadeRecente(filtered);
  renderDivergingBarChart(chartBody("chart-saldo-loja"), computeByLoja(filtered));
  renderRankedBarChart(chartBody("chart-categorias-saida"), topNWithOthers(computeByCategoria(filtered, "Saída"), 10));
  renderMonthlyGroupedChart(chartBody("chart-mensal"), computeByMonth(filtered));
  renderDonutChart(chartBody("chart-pizza-saidas"), topNWithOthers(computeByCategoria(filtered, "Saída"), 5));
  renderDonutChart(chartBody("chart-pizza-entradas"), topNWithOthers(computeByCategoria(filtered, "Entrada"), 5));
}

function setActivePreset(preset) {
  document.querySelectorAll(".filter-presets button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.preset === preset);
  });
}

function applyPreset(preset) {
  const { start, end } = computePresetRange(preset, allLancamentos);
  document.getElementById("filter-start").value = toInputDateValue(start);
  document.getElementById("filter-end").value = toInputDateValue(end);
  setActivePreset(preset);
  renderDashboardCharts();
}

function setupFilterHandlers() {
  document.querySelectorAll(".filter-presets button").forEach((btn) => {
    btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
  });

  ["filter-start", "filter-end"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      setActivePreset(null);
      renderDashboardCharts();
    });
  });

  window.addEventListener("resize", debounce(renderDashboardCharts, 200));
}

function initDashboard(records) {
  allLancamentos = records;
  document.getElementById("dashboard").hidden = false;
  setupFilterHandlers();
  setupActivitySeeAll();
  applyPreset("mes-atual");
}

// Refresh the underlying data without resetting the user's current filter/preset.
function updateLancamentos(records) {
  allLancamentos = records;
  renderDashboardCharts();
}
