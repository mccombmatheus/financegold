// Decorative artwork for the "Ouro" look: isometric wireframe cubes and a
// halftone (dot-matrix) sphere. Everything is built with createElementNS — no
// innerHTML — and colored through CSS (`currentColor`), so the palette lives in
// css/style.css only.

const ART_SVG_NS = "http://www.w3.org/2000/svg";

function svgNode(tag, attrs) {
  const el = document.createElementNS(ART_SVG_NS, tag);
  Object.keys(attrs || {}).forEach((key) => el.setAttribute(key, attrs[key]));
  return el;
}

function isoPoint(x, y, z, scale, ox, oy) {
  const cos30 = Math.cos(Math.PI / 6);
  const sin30 = 0.5;
  return [ox + (x - y) * cos30 * scale, oy + (x + y) * sin30 * scale - z * scale];
}

// cubes: [x, y, z, size] in grid units.
function wireframePathData(cubes, scale, ox, oy) {
  const parts = [];
  cubes.forEach(([x, y, z, size]) => {
    const corners = [];
    for (let dx = 0; dx < 2; dx += 1) {
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dz = 0; dz < 2; dz += 1) {
          corners.push({ k: [dx, dy, dz], p: isoPoint(x + dx * size, y + dy * size, z + dz * size, scale, ox, oy) });
        }
      }
    }
    corners.forEach((a) => {
      corners.forEach((b) => {
        const differsInOneAxis = a.k.reduce((sum, v, i) => sum + Math.abs(v - b.k[i]), 0) === 1;
        if (differsInOneAxis && a.k.join("") < b.k.join("")) {
          parts.push(`M${a.p[0].toFixed(1)} ${a.p[1].toFixed(1)}L${b.p[0].toFixed(1)} ${b.p[1].toFixed(1)}`);
        }
      });
    });
  });
  return parts.join("");
}

function buildWireframe(cubes, scale, ox, oy, strokeWidth, opacity) {
  return svgNode("path", {
    d: wireframePathData(cubes, scale, ox, oy),
    fill: "none",
    stroke: "currentColor",
    "stroke-width": String(strokeWidth),
    "stroke-linecap": "round",
    opacity: String(opacity),
  });
}

// A sphere lit from the top-right, drawn as a hex grid of dots whose radius
// follows the brightness.
function buildHalftone(cx, cy, radius, gap, maxDot) {
  const group = svgNode("g", { fill: "currentColor" });
  const n = Math.floor(radius / gap) + 1;
  for (let i = -n; i <= n; i += 1) {
    for (let j = -n; j <= n; j += 1) {
      const x = i * gap + (j % 2 ? gap / 2 : 0);
      const y = j * gap * 0.866;
      const dist = Math.hypot(x, y);
      if (dist > radius) continue;
      const nx = x / radius;
      const ny = y / radius;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const brightness = Math.max(0, Math.min(1, 0.55 * (-nx * 0.55 + ny * 0.6) + 0.33 * nz + 0.08));
      const r = maxDot * brightness;
      if (r < 0.55) continue;
      group.appendChild(svgNode("circle", { cx: (cx + x).toFixed(1), cy: (cy + y).toFixed(1), r: r.toFixed(2) }));
    }
  }
  return group;
}

function wrapArt(width, height, className, children) {
  const svg = svgNode("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width: "100%",
    height: "100%",
    "aria-hidden": "true",
    focusable: "false",
    preserveAspectRatio: "xMidYMid meet",
  });
  svg.setAttribute("class", className);
  children.forEach((child) => svg.appendChild(child));
  return svg;
}

function colored(className, node) {
  const wrap = svgNode("g", {});
  wrap.setAttribute("class", className);
  wrap.appendChild(node);
  return wrap;
}

// Login/brand panel: big halftone sphere with a stack of wireframe cubes.
function buildBrandArt() {
  return wrapArt(820, 600, "art-svg", [
    colored("art-halftone", buildHalftone(500, 300, 230, 13, 5.4)),
    colored(
      "art-wire",
      buildWireframe([[0, 0, 0, 1.6], [1.6, 0, 0, 1.6], [0, 1.6, 0, 1.6], [0, 0, 1.6, 1.6], [1.6, 1.6, 0, 1.6], [3.2, 0, 0, 1.6]], 72, 500, 190, 1.3, 0.85)
    ),
  ]);
}

// Hero KPI tile: a smaller sphere + cubes tucked in the top-right corner.
function buildHeroArt() {
  const id = typeof segmentoAtual === "string" ? segmentoAtual : "outro";
  // the halftone sphere stays; the drawing on it is the segment's own mark
  const desenho = id === "outro"
    ? colored("art-wire", buildWireframe([[0, 0, 0, 1], [1, 0, 0, 1], [0, 0, 1, 1]], 46, 205, 150, 1.1, 0.7))
    : colored("art-wire", grupoMarcaSegmento(id, 215, 122, id === "petshop" ? 170 : 110, 110, 1.2));
  return wrapArt(330, 260, "art-svg", [colored("art-halftone", buildHalftone(215, 120, 108, 9, 4.1)), desenho]);
}

// Gold tiles: an outlined cube (an "ingot") with a smaller one floating above.
function buildIngotArt() {
  return wrapArt(200, 150, "art-svg", [
    colored("art-accent", buildWireframe([[0, 0, 0, 1]], 70, 100, 82, 1.5, 1)),
    colored("art-wire", buildWireframe([[0.2, 0.2, 1, 0.6]], 70, 100, 82, 1, 0.5)),
  ]);
}

// The two-cube mark spans about 2.6 x 2.5 grid units, so its scale and offset
// are computed from the box it must fit in — a fixed scale used to overflow the
// viewBox and clip the right and bottom edges.
function buildLogoMark(size) {
  const pad = 2;
  const boxW = Math.round(size * 1.35);
  const boxH = Math.round(size * 1.3);
  const unitsW = 2 * Math.cos(Math.PI / 6) * 1.5; // x-extent of the two cubes in grid units
  const unitsH = 2.5; // y-extent in grid units
  const scale = Math.min((boxW - 2 * pad) / unitsW, (boxH - 2 * pad) / unitsH);
  const ox = pad + Math.cos(Math.PI / 6) * scale + (boxW - 2 * pad - unitsW * scale) / 2;
  const oy = pad + scale + (boxH - 2 * pad - unitsH * scale) / 2;
  const svg = wrapArt(boxW, boxH, "art-logo-svg", [
    colored("art-accent", buildWireframe([[0, 0, 0, 1], [1, 0, 0, 1]], scale, ox, oy, 1.6, 1)),
  ]);
  // The logo has a fixed size (the other art scales to its container).
  svg.setAttribute("width", String(boxW));
  svg.setAttribute("height", String(boxH));
  return svg;
}

// ---------------------------------------------------------------------------
// Segment marks: each business segment has its own wireframe drawing in the same
// thin gold line style as the cubes (Joalheria: a cut diamond; Petshop: a cat and
// a dog; Comércio: a shopping bag; Serviços: a gear; Alimentação: a cloche;
// Saúde: an extruded cross; Outro: the cubes). Pure geometry, no images.
// ---------------------------------------------------------------------------

function tracoPoli(pontos, fechado) {
  return pontos.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("") + (fechado ? "Z" : "");
}

function tracoLinhas(lista) {
  return lista.map((l) => `M${l[0]} ${l[1]}L${l[2]} ${l[3]}`).join("");
}

function pontoPolar(cx, cy, raio, graus) {
  const a = (graus * Math.PI) / 180;
  return [cx + raio * Math.cos(a), cy + raio * Math.sin(a)];
}

// A cat head (pointed ears) and a dog head (floppy ears) in low-poly facets.
function desenhoGato(dx, dy, k) {
  const P = (x, y) => [dx + x * k, dy + y * k];
  const v = { a: P(12, 8), b: P(32, 26), c: P(68, 26), d: P(88, 8), e: P(92, 44), f: P(70, 70), g: P(30, 70), h: P(8, 44), fr: P(50, 30), o1: P(32, 46), o2: P(68, 46), n: P(50, 56), q: P(50, 74) };
  const arestas = [["h", "b"], ["e", "c"], ["b", "fr"], ["c", "fr"], ["fr", "o1"], ["fr", "o2"], ["fr", "n"], ["b", "o1"], ["c", "o2"], ["h", "o1"], ["e", "o2"], ["o1", "n"], ["o2", "n"], ["g", "n"], ["f", "n"], ["g", "q"], ["f", "q"], ["n", "q"]];
  return tracoPoli([v.a, v.b, v.c, v.d, v.e, v.f, v.g, v.h], true) + arestas.map(([x, y]) => tracoPoli([v[x], v[y]], false)).join("");
}

function desenhoCachorro(dx, dy, k) {
  const P = (x, y) => [dx + x * k, dy + y * k];
  const v = { d1: P(34, 8), d2: P(66, 8), l1: P(12, 16), l2: P(6, 54), l3: P(22, 58), l4: P(30, 34), r1: P(88, 16), r2: P(94, 54), r3: P(78, 58), r4: P(70, 34), j1: P(34, 68), j2: P(50, 78), j3: P(66, 68), fr: P(50, 22), e1: P(40, 38), e2: P(60, 38), n: P(50, 58) };
  const contorno = tracoPoli([v.d1, v.d2, v.r1, v.r2, v.r3, v.r4, v.j3, v.j2, v.j1, v.l4, v.l3, v.l2, v.l1], true);
  const arestas = [["d1", "fr"], ["d2", "fr"], ["fr", "e1"], ["fr", "e2"], ["d1", "e1"], ["d2", "e2"], ["l4", "e1"], ["r4", "e2"], ["e1", "n"], ["e2", "n"], ["n", "j1"], ["n", "j2"], ["n", "j3"], ["l1", "l4"], ["l1", "l3"], ["r1", "r4"], ["r1", "r3"], ["l4", "j1"], ["r4", "j3"]];
  return contorno + arestas.map(([x, y]) => tracoPoli([v[x], v[y]], false)).join("");
}

function desenhoDiamante() {
  const T1 = [30, 8], T2 = [70, 8], C1 = [4, 32], C2 = [96, 32], P = [50, 92];
  return (
    tracoPoli([T1, T2, C2, P, C1], true) +
    tracoLinhas([[4, 32, 96, 32], [30, 8, 27, 32], [30, 8, 50, 32], [70, 8, 50, 32], [70, 8, 73, 32], [27, 32, P[0], P[1]], [50, 32, P[0], P[1]], [73, 32, P[0], P[1]]])
  );
}

function desenhoSacola() {
  return (
    tracoPoli([[22, 30], [78, 30], [86, 92], [14, 92]], true) +
    tracoPoli([[36, 30], [36, 16], [43, 7], [57, 7], [64, 16], [64, 30]], false) +
    tracoLinhas([[22, 30, 50, 92], [78, 30, 50, 92], [50, 30, 50, 92]])
  );
}

function desenhoEngrenagem() {
  const cx = 50, cy = 50, fora = 46, dentro = 34;
  const contorno = [];
  for (let i = 0; i < 8; i += 1) {
    const a = i * 45;
    contorno.push(pontoPolar(cx, cy, dentro, a - 13), pontoPolar(cx, cy, fora, a - 8), pontoPolar(cx, cy, fora, a + 8), pontoPolar(cx, cy, dentro, a + 13));
  }
  const furo = [];
  const raios = [];
  for (let i = 0; i < 6; i += 1) {
    furo.push(pontoPolar(cx, cy, 13, i * 60));
    const de = pontoPolar(cx, cy, 13, i * 60), ate = pontoPolar(cx, cy, 26, i * 60);
    raios.push(tracoPoli([de, ate], false));
  }
  const anel = [];
  for (let i = 0; i < 6; i += 1) anel.push(pontoPolar(cx, cy, 26, i * 60));
  return tracoPoli(contorno, true) + tracoPoli(furo, true) + tracoPoli(anel, true) + raios.join("");
}

function desenhoCloche() {
  const cx = 50, cy = 70, r = 44;
  const arco = [];
  for (let g = 180; g <= 360; g += 20) arco.push(pontoPolar(cx, cy, r, g));
  const meio = arco.length >> 1;
  const nos = arco.map((p, i) => (i === meio ? "" : tracoPoli([[cx, cy - r * 0.55], p], false))).join("");
  const botao = [];
  for (let i = 0; i < 6; i += 1) botao.push(pontoPolar(cx, cy - r - 5, 5.5, i * 60 + 30));
  return (
    tracoPoli(arco, false) +
    tracoLinhas([[6, 70, 94, 70], [2, 78, 98, 78], [14, 78, 14, 86], [86, 78, 86, 86], [14, 86, 86, 86]]) +
    tracoPoli(botao, true) +
    nos
  );
}

function desenhoCruz() {
  const frente = [[34, 22], [58, 22], [58, 46], [82, 46], [82, 70], [58, 70], [58, 94], [34, 94], [34, 70], [10, 70], [10, 46], [34, 46]];
  const dx = 14, dy = -14;
  const fundo = frente.map((p) => [p[0] + dx, p[1] + dy]);
  const liga = frente.map((p, i) => tracoPoli([p, fundo[i]], false)).join("");
  return tracoPoli(frente, true) + tracoPoli(fundo, true) + liga;
}

function desenhoCubos() {
  const cubos = [[0, 0, 0, 1], [1, 0, 0, 1]];
  return wireframePathData(cubos, 30, 30, 38);
}

// w x h = the drawing's own box (fits the slot with padding).
const MARCAS_SEGMENTO = {
  joalheria: { w: 100, h: 92, d: () => desenhoDiamante() },
  petshop: { w: 200, h: 84, d: () => desenhoGato(0, 4, 0.98) + desenhoCachorro(104, 4, 0.98) },
  comercio: { w: 100, h: 92, d: () => desenhoSacola() },
  servicos: { w: 100, h: 100, d: () => desenhoEngrenagem() },
  alimentacao: { w: 100, h: 90, d: () => desenhoCloche() },
  saude: { w: 100, h: 100, d: () => desenhoCruz() },
  outro: { w: 86, h: 90, d: () => desenhoCubos() },
};

function marcaDoSegmento(id) {
  return MARCAS_SEGMENTO[Object.prototype.hasOwnProperty.call(MARCAS_SEGMENTO, id) ? id : "outro"];
}

// Same dimensions rule as the cube logo: height = size * 1.3; width follows the
// drawing (the cat + dog pair is wider). Fixed pixel size, like buildLogoMark.
function buildSegmentMark(id, size) {
  const marca = marcaDoSegmento(id);
  const altura = Math.round(size * 1.3);
  const largura = Math.round(altura * (marca.w / marca.h) * (marca.w > 150 ? 0.9 : 0.85));
  const pad = 2;
  const escala = Math.min((largura - 2 * pad) / marca.w, (altura - 2 * pad) / marca.h);
  const ox = (largura - marca.w * escala) / 2;
  const oy = (altura - marca.h * escala) / 2;
  const g = svgNode("g", { transform: `translate(${ox.toFixed(2)} ${oy.toFixed(2)}) scale(${escala.toFixed(4)})` });
  g.appendChild(
    svgNode("path", {
      d: marca.d(),
      fill: "none",
      stroke: "currentColor",
      "stroke-width": String((1.5 / escala).toFixed(2)),
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    })
  );
  const svg = wrapArt(largura, altura, "art-logo-svg", [colored("art-accent", g)]);
  svg.setAttribute("width", String(largura));
  svg.setAttribute("height", String(altura));
  return svg;
}

// Larger version for the KPI tiles (fills its slot, scales with it).
function buildSegmentArt(id) {
  const marca = marcaDoSegmento(id);
  const escala = Math.min(180 / marca.w, 130 / marca.h);
  const ox = (200 - marca.w * escala) / 2;
  const oy = (150 - marca.h * escala) / 2;
  const g = svgNode("g", { transform: `translate(${ox.toFixed(2)} ${oy.toFixed(2)}) scale(${escala.toFixed(4)})` });
  g.appendChild(
    svgNode("path", {
      d: marca.d(),
      fill: "none",
      stroke: "currentColor",
      "stroke-width": String((1.6 / escala).toFixed(2)),
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    })
  );
  return wrapArt(200, 150, "art-svg", [colored("art-accent", g)]);
}

// The segment drawing centred in a box, for the big "Saldo" tile.
function grupoMarcaSegmento(id, cx, cy, caixaW, caixaH, traco) {
  const marca = marcaDoSegmento(id);
  const escala = Math.min(caixaW / marca.w, caixaH / marca.h);
  const g = svgNode("g", { transform: `translate(${(cx - (marca.w * escala) / 2).toFixed(2)} ${(cy - (marca.h * escala) / 2).toFixed(2)}) scale(${escala.toFixed(4)})` });
  g.appendChild(
    svgNode("path", {
      d: marca.d(),
      fill: "none",
      stroke: "currentColor",
      "stroke-width": String((traco / escala).toFixed(2)),
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    })
  );
  return g;
}

// Puts the current segment's mark in the sidebar logo slot.
function trocarLogoSegmento(id) {
  const slot = document.getElementById("sidebar-logo");
  if (!slot) return;
  slot.innerHTML = "";
  slot.appendChild(buildSegmentMark(id, 26));
}

// Fills every static slot in the page: [data-art="brand|logo|logo-lg"].
function mountStaticArt() {
  document.querySelectorAll("[data-art]").forEach((slot) => {
    if (slot.firstChild) return;
    const kind = slot.dataset.art;
    if (kind === "brand") slot.appendChild(buildBrandArt());
    else if (kind === "logo") slot.appendChild(buildLogoMark(26));
    else if (kind === "logo-lg") slot.appendChild(buildLogoMark(30));
  });
}

mountStaticArt();
