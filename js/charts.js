const SVG_NS = "http://www.w3.org/2000/svg";

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function formatBRL(value) {
  return brlFormatter.format(value);
}

function formatCompactBRL(value) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  let text;
  if (abs >= 1_000_000) text = `${(abs / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  else if (abs >= 1_000) text = `${(abs / 1_000).toFixed(1).replace(".", ",")} mil`;
  else text = abs.toFixed(0);
  return `${sign}R$ ${text}`;
}

function formatGrams(value) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} g`;
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

// --- Shared tooltip -------------------------------------------------------

let tooltipEl = null;

function getTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "chart-tooltip";
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function showTooltip(clientX, clientY, title, rows) {
  const el = getTooltip();
  el.innerHTML = "";
  if (title) {
    const titleEl = document.createElement("div");
    titleEl.className = "tooltip-title";
    titleEl.textContent = title;
    el.appendChild(titleEl);
  }
  rows.forEach(({ label, value, color }) => {
    const row = document.createElement("div");
    row.className = "tooltip-row";
    if (color) {
      const key = document.createElement("span");
      key.className = "tooltip-key";
      key.style.background = color;
      row.appendChild(key);
    }
    const labelSpan = document.createElement("span");
    labelSpan.textContent = label;
    row.appendChild(labelSpan);
    const valueSpan = document.createElement("span");
    valueSpan.className = "tooltip-value";
    valueSpan.textContent = value;
    row.appendChild(valueSpan);
    el.appendChild(row);
  });
  el.classList.add("visible");
  positionTooltip(clientX, clientY);
}

function positionTooltip(clientX, clientY) {
  const el = getTooltip();
  const offset = 14;
  const rect = el.getBoundingClientRect();
  let left = clientX + offset;
  let top = clientY + offset;
  if (left + rect.width > window.innerWidth) left = clientX - rect.width - offset;
  if (top + rect.height > window.innerHeight) top = clientY - rect.height - offset;
  el.style.transform = `translate(${left}px, ${top}px)`;
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.classList.remove("visible");
}

function attachHoverTooltip(mark, { title, rows }) {
  mark.classList.add("chart-bar");
  mark.setAttribute("tabindex", "0");
  const handleMove = (event) => {
    mark.classList.add("hovered");
    showTooltip(event.clientX, event.clientY, title, rows);
  };
  const handleLeave = () => {
    mark.classList.remove("hovered");
    hideTooltip();
  };
  const handleFocus = () => {
    const rect = mark.getBoundingClientRect();
    mark.classList.add("hovered");
    showTooltip(rect.left + rect.width / 2, rect.top, title, rows);
  };
  mark.addEventListener("pointermove", handleMove);
  mark.addEventListener("pointerleave", handleLeave);
  mark.addEventListener("focus", handleFocus);
  mark.addEventListener("blur", handleLeave);
}

// --- Legend & table twin ---------------------------------------------------

function buildLegend(container, items) {
  const legend = document.createElement("div");
  legend.className = "chart-legend";
  items.forEach(({ label, color }) => {
    const item = document.createElement("span");
    item.className = "chart-legend-item";
    const swatch = document.createElement("span");
    swatch.className = "chart-legend-swatch";
    swatch.style.background = color;
    item.appendChild(swatch);
    const text = document.createElement("span");
    text.textContent = label;
    item.appendChild(text);
    legend.appendChild(item);
  });
  container.appendChild(legend);
}

function buildTableToggle(container, headers, rows) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chart-table-toggle";
  button.textContent = "Ver tabela";

  const tableView = document.createElement("div");
  tableView.className = "chart-table-view table-wrapper";
  tableView.hidden = true;

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((rowValues) => {
    const tr = document.createElement("tr");
    rowValues.forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tableView.appendChild(table);

  button.addEventListener("click", () => {
    tableView.hidden = !tableView.hidden;
    button.textContent = tableView.hidden ? "Ver tabela" : "Ocultar tabela";
  });

  container.appendChild(button);
  container.appendChild(tableView);
}

function renderEmptyState(container, message) {
  container.innerHTML = "";
  const p = document.createElement("div");
  p.className = "chart-empty";
  p.textContent = message;
  container.appendChild(p);
}

function getContainerWidth(container) {
  return Math.max(container.getBoundingClientRect().width || 0, 280);
}

// Below this width the horizontal bar charts stop reserving a fixed label
// column on the left (which left almost no room for the bar itself on a
// phone) and instead put the name + value on a line above each full-width bar.
const COMPACT_CHART_MAX_WIDTH = 480;

function truncateLabel(text, maxChars) {
  const value = String(text || "");
  return value.length > maxChars ? value.slice(0, Math.max(1, maxChars - 1)) + "…" : value;
}

// --- Diverging bar chart (saldo por loja) ----------------------------------

function renderDivergingBarChart(container, items) {
  container.innerHTML = "";
  if (items.length === 0) return renderEmptyState(container, "Sem lançamentos no período.");

  const width = getContainerWidth(container);
  const compact = width < COMPACT_CHART_MAX_WIDTH;
  const rowHeight = compact ? 54 : 40;
  const barThickness = compact ? 14 : 20;
  const marginLeft = compact ? 8 : 110;
  const marginRight = compact ? 8 : 70;
  const topPad = 10;
  const height = items.length * rowHeight + topPad * 2;
  const plotWidth = width - marginLeft - marginRight;
  const halfWidth = plotWidth / 2;
  const baselineX = marginLeft + halfWidth;
  const maxAbs = Math.max(1, ...items.map((i) => Math.abs(i.saldo)));

  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, width, height, role: "img" });

  svg.appendChild(svgEl("line", {
    x1: baselineX, x2: baselineX, y1: topPad - 4, y2: height - topPad + 4,
    class: "chart-baseline",
  }));

  items.forEach((item, index) => {
    const rowY = topPad + index * rowHeight;
    const barY = compact ? rowY + 26 : rowY + (rowHeight - barThickness) / 2;
    const barLen = (Math.abs(item.saldo) / maxAbs) * (halfWidth - (compact ? 4 : 12));
    const positive = item.saldo >= 0;
    const barX = positive ? baselineX : baselineX - barLen;
    const color = positive ? "var(--diverging-pos)" : "var(--diverging-neg)";

    const label = svgEl("text", {
      x: compact ? marginLeft : marginLeft - 12,
      y: compact ? rowY + 14 : rowY + rowHeight / 2 + 4,
      "text-anchor": compact ? "start" : "end",
      class: "chart-tick-label",
    });
    label.textContent = compact ? truncateLabel(item.loja, Math.floor((width - 120) / 6.4)) : item.loja;
    svg.appendChild(label);

    const rect = svgEl("rect", {
      x: barX, y: barY, width: Math.max(barLen, 1), height: barThickness, rx: 4, fill: color,
    });
    svg.appendChild(rect);

    const valueLabel = svgEl("text", {
      x: compact ? width - marginRight : positive ? barX + barLen + 8 : barX - 8,
      y: compact ? rowY + 14 : rowY + rowHeight / 2 + 4,
      "text-anchor": compact ? "end" : positive ? "start" : "end",
      class: "chart-direct-label",
    });
    valueLabel.textContent = formatCompactBRL(item.saldo);
    svg.appendChild(valueLabel);

    attachHoverTooltip(rect, {
      title: item.loja,
      rows: [
        { label: "Entradas", value: formatBRL(item.entradas), color: "var(--series-1)" },
        { label: "Saídas", value: formatBRL(item.saidas), color: "var(--series-2)" },
        { label: "Saldo", value: formatBRL(item.saldo) },
      ],
    });
  });

  container.appendChild(svg);
  buildLegend(container, [
    { label: "Saldo positivo", color: "var(--diverging-pos)" },
    { label: "Saldo negativo", color: "var(--diverging-neg)" },
  ]);
  buildTableToggle(
    container,
    ["Loja", "Entradas", "Saídas", "Saldo"],
    items.map((i) => [i.loja, formatBRL(i.entradas), formatBRL(i.saidas), formatBRL(i.saldo)])
  );
}

// --- Ranked horizontal bar chart (gastos por categoria) ---------------------

function renderRankedBarChart(container, items) {
  container.innerHTML = "";
  if (items.length === 0) return renderEmptyState(container, "Sem lançamentos no período.");

  const width = getContainerWidth(container);
  const compact = width < COMPACT_CHART_MAX_WIDTH;
  const rowHeight = compact ? 46 : 32;
  const barThickness = compact ? 14 : 18;
  const marginLeft = compact ? 8 : 160;
  const marginRight = compact ? 8 : 90;
  const topPad = 10;
  const height = items.length * rowHeight + topPad * 2;
  const plotWidth = width - marginLeft - marginRight;
  const maxValue = Math.max(1, ...items.map((i) => i.valor));

  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, width, height, role: "img" });

  items.forEach((item, index) => {
    const rowY = topPad + index * rowHeight;
    const barY = compact ? rowY + 22 : rowY + (rowHeight - barThickness) / 2;
    const barLen = Math.max((item.valor / maxValue) * plotWidth, 1);

    const label = svgEl("text", {
      x: compact ? marginLeft : marginLeft - 12,
      y: compact ? rowY + 12 : rowY + rowHeight / 2 + 4,
      "text-anchor": compact ? "start" : "end",
      class: "chart-tick-label",
    });
    label.textContent = compact ? truncateLabel(item.categoria, Math.floor((width - 110) / 6.4)) : item.categoria;
    svg.appendChild(label);

    const rect = svgEl("rect", {
      x: marginLeft, y: barY, width: barLen, height: barThickness, rx: 4, fill: "var(--series-1)",
    });
    svg.appendChild(rect);

    // Desktop labels only the top bar (selective direct labeling); the compact
    // layout has a dedicated value slot on each name line, so every row gets one.
    if (index === 0 || compact) {
      const valueLabel = svgEl("text", {
        x: compact ? width - marginRight : marginLeft + barLen + 8,
        y: compact ? rowY + 12 : rowY + rowHeight / 2 + 4,
        "text-anchor": compact ? "end" : "start",
        class: "chart-direct-label",
      });
      valueLabel.textContent = formatCompactBRL(item.valor);
      svg.appendChild(valueLabel);
    }

    attachHoverTooltip(rect, {
      title: item.categoria,
      rows: [{ label: "Valor", value: formatBRL(item.valor), color: "var(--series-1)" }],
    });
  });

  container.appendChild(svg);
  buildTableToggle(
    container,
    ["Categoria", "Valor"],
    items.map((i) => [i.categoria, formatBRL(i.valor)])
  );
}

// --- Grouped monthly bar chart (entradas x saídas por mês) ------------------

function renderMonthlyGroupedChart(container, items) {
  container.innerHTML = "";
  if (items.length === 0) return renderEmptyState(container, "Sem lançamentos no período.");

  const width = getContainerWidth(container);
  const height = 280;
  const marginLeft = 60;
  const marginRight = 20;
  const marginTop = 16;
  const marginBottom = 32;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;
  const maxValue = Math.max(1, ...items.flatMap((i) => [i.entradas, i.saidas]));

  const groupWidth = plotWidth / items.length;
  const barWidth = Math.min(24, groupWidth / 3);
  const gap = 3;

  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, width, height, role: "img" });

  const gridSteps = 4;
  for (let step = 0; step <= gridSteps; step += 1) {
    const value = (maxValue / gridSteps) * step;
    const y = marginTop + plotHeight - (value / maxValue) * plotHeight;
    svg.appendChild(svgEl("line", {
      x1: marginLeft, x2: width - marginRight, y1: y, y2: y, class: "chart-gridline",
    }));
    const tick = svgEl("text", { x: marginLeft - 8, y: y + 3, "text-anchor": "end", class: "chart-tick-label" });
    tick.textContent = formatCompactBRL(value);
    svg.appendChild(tick);
  }

  items.forEach((item, index) => {
    const groupX = marginLeft + index * groupWidth;
    const center = groupX + groupWidth / 2;

    const entradaHeight = (item.entradas / maxValue) * plotHeight;
    const saidaHeight = (item.saidas / maxValue) * plotHeight;

    const entradaRect = svgEl("rect", {
      x: center - barWidth - gap / 2,
      y: marginTop + plotHeight - entradaHeight,
      width: barWidth,
      height: Math.max(entradaHeight, 1),
      rx: 3,
      fill: "var(--series-1)",
    });
    const saidaRect = svgEl("rect", {
      x: center + gap / 2,
      y: marginTop + plotHeight - saidaHeight,
      width: barWidth,
      height: Math.max(saidaHeight, 1),
      rx: 3,
      fill: "var(--series-2)",
    });
    svg.appendChild(entradaRect);
    svg.appendChild(saidaRect);

    const monthLabel = svgEl("text", {
      x: center, y: height - marginBottom + 18, "text-anchor": "middle", class: "chart-tick-label",
    });
    monthLabel.textContent = formatMonthLabel(item.mes);
    svg.appendChild(monthLabel);

    const tooltipRows = [
      { label: "Entradas", value: formatBRL(item.entradas), color: "var(--series-1)" },
      { label: "Saídas", value: formatBRL(item.saidas), color: "var(--series-2)" },
    ];
    attachHoverTooltip(entradaRect, { title: formatMonthLabel(item.mes), rows: tooltipRows });
    attachHoverTooltip(saidaRect, { title: formatMonthLabel(item.mes), rows: tooltipRows });
  });

  svg.appendChild(svgEl("line", {
    x1: marginLeft, x2: width - marginRight, y1: marginTop + plotHeight, y2: marginTop + plotHeight, class: "chart-baseline",
  }));

  container.appendChild(svg);
  buildLegend(container, [
    { label: "Entradas", color: "var(--series-1)" },
    { label: "Saídas", color: "var(--series-2)" },
  ]);
  buildTableToggle(
    container,
    ["Mês", "Entradas", "Saídas"],
    items.map((i) => [formatMonthLabel(i.mes), formatBRL(i.entradas), formatBRL(i.saidas)])
  );
}

// --- Donut chart (top categorias) ------------------------------------------

const DONUT_COLORS = [
  "var(--series-1)", "var(--series-2)", "var(--series-3)",
  "var(--series-4)", "var(--series-5)", "var(--series-6)",
];

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeDonutArc(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const startOuter = polarToCartesian(cx, cy, rOuter, endAngle);
  const endOuter = polarToCartesian(cx, cy, rOuter, startAngle);
  const startInner = polarToCartesian(cx, cy, rInner, endAngle);
  const endInner = polarToCartesian(cx, cy, rInner, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return [
    "M", startOuter.x, startOuter.y,
    "A", rOuter, rOuter, 0, largeArc, 0, endOuter.x, endOuter.y,
    "L", endInner.x, endInner.y,
    "A", rInner, rInner, 0, largeArc, 1, startInner.x, startInner.y,
    "Z",
  ].join(" ");
}

function renderDonutChart(container, items) {
  container.innerHTML = "";
  const total = items.reduce((sum, i) => sum + i.valor, 0);
  if (items.length === 0 || total <= 0) return renderEmptyState(container, "Sem lançamentos no período.");

  const width = getContainerWidth(container);
  const size = Math.min(width, 260);
  const height = size;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 8;
  const rInner = rOuter * 0.6;

  const svg = svgEl("svg", { viewBox: `0 0 ${size} ${height}`, width: size, height, role: "img", class: "chart-donut" });

  let angle = 0;
  let largestIndex = 0;
  items.forEach((item, index) => {
    if (item.valor > items[largestIndex].valor) largestIndex = index;
  });

  items.forEach((item, index) => {
    const sliceAngle = Math.min((item.valor / total) * 360, 359.99);
    const startAngle = angle;
    const endAngle = angle + sliceAngle;
    angle = endAngle;
    const color = DONUT_COLORS[index % DONUT_COLORS.length];

    const path = svgEl("path", {
      d: describeDonutArc(cx, cy, rOuter, rInner, startAngle, endAngle),
      fill: color,
      stroke: "var(--color-surface)",
      "stroke-width": 2,
    });
    svg.appendChild(path);

    const percent = (item.valor / total) * 100;
    if (index === largestIndex) {
      const midAngle = (startAngle + endAngle) / 2;
      const labelPos = polarToCartesian(cx, cy, (rOuter + rInner) / 2, midAngle);
      const label = svgEl("text", {
        x: labelPos.x, y: labelPos.y, "text-anchor": "middle", class: "chart-direct-label",
        fill: "#ffffff",
      });
      label.textContent = `${percent.toFixed(0)}%`;
      svg.appendChild(label);
    }

    attachHoverTooltip(path, {
      title: item.categoria,
      rows: [
        { label: "Valor", value: formatBRL(item.valor), color },
        { label: "Share", value: `${percent.toFixed(1)}%` },
      ],
    });
  });

  container.appendChild(svg);
  buildLegend(container, items.map((item, index) => ({
    label: item.categoria,
    color: DONUT_COLORS[index % DONUT_COLORS.length],
  })));
  buildTableToggle(
    container,
    ["Categoria", "Valor", "%"],
    items.map((item) => [item.categoria, formatBRL(item.valor), `${((item.valor / total) * 100).toFixed(1)}%`])
  );
}
