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
    : colored("art-wire", grupoMarcaSegmento(id, 215, 122, 118, 112, 1.2));
  return wrapArt(330, 260, "art-svg", [colored("art-halftone", buildHalftone(215, 120, 108, 9, 4.1)), desenho]);
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
// Segment marks. Every segment has its own wireframe drawing in the family of the
// cube logo: things that SEEM something and could be, but are not literal (an
// ingot stack that could be boxes, two cubes with ears that could be a cat and a
// dog, a hex nut that could be a gear...). Isometric geometry only: no images.
// Joalheria: stacked ingots | Petshop: two cubes with ears | Comércio: a cube
// with a handle | Serviços: a hex nut | Alimentação: a lidded cylinder |
// Saúde: an extruded plus | Outro: the two cubes.
// ---------------------------------------------------------------------------

const ESCALA_ISO = 30;

// Every drawing is a list of polylines: [[x, y], ...] (closed ones repeat the first point).
function projetar(x, y, z) {
  return isoPoint(x, y, z, ESCALA_ISO, 0, 0);
}

function linhaIso(pontos3d, fechar) {
  const pts = pontos3d.map((p) => projetar(p[0], p[1], p[2]));
  if (fechar) pts.push(pts[0]);
  return pts;
}

// A box (dx, dy, dz) at (x, y, z): all 12 edges, like the cube logo.
function caixaIso(x, y, z, dx, dy, dz) {
  const c = (i, j, k) => [x + i * dx, y + j * dy, z + k * dz];
  const arestas = [];
  [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]].forEach(([i, j]) => arestas.push([c(i, j, 0), c(i, j, 1)]));
  [0, 1].forEach((k) => {
    arestas.push([c(0, 0, k), c(1, 0, k)], [c(1, 0, k), c(1, 1, k)], [c(1, 1, k), c(0, 1, k)], [c(0, 1, k), c(0, 0, k)]);
  });
  return arestas.map((par) => linhaIso(par, false));
}

// A bar wider at the bottom than at the top (an ingot).
function lingoteIso(x, y, z, dx, dy, dz, recuo) {
  const b = [[x, y, z], [x + dx, y, z], [x + dx, y + dy, z], [x, y + dy, z]];
  const t = [[x + recuo, y + recuo, z + dz], [x + dx - recuo, y + recuo, z + dz], [x + dx - recuo, y + dy - recuo, z + dz], [x + recuo, y + dy - recuo, z + dz]];
  const linhas = [linhaIso(b, true), linhaIso(t, true)];
  for (let i = 0; i < 4; i += 1) linhas.push(linhaIso([b[i], t[i]], false));
  return linhas;
}

function pontosElipse(cx, cy, z, raio, passos) {
  const pts = [];
  for (let i = 0; i <= passos; i += 1) {
    const a = (i / passos) * Math.PI * 2;
    pts.push([cx + raio * Math.cos(a), cy + raio * Math.sin(a), z]);
  }
  return pts;
}

function desenhoIngotes() {
  // a bar with a stamp on top: could be a gold bar, a box, a pedestal — it is none of them
  const retangulo = (x0, y0, x1, y1, z) => [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];
  const base = retangulo(0, 0, 2, 1.1, 0);
  const topo = retangulo(0.28, 0.2, 1.72, 0.9, 0.62);
  const l = [linhaIso(base, true), linhaIso(topo, true)];
  for (let i = 0; i < 4; i += 1) l.push(linhaIso([base[i], topo[i]], false));
  l.push(linhaIso(retangulo(0.62, 0.36, 1.38, 0.74, 0.62), true));
  return l;
}

function desenhoCuboComOrelhas() {
  // two cubes like the logo; the first with pointed ears (a cat?), the second with drooping ones (a dog?)
  const l = [];
  caixaIso(0, 0, 0, 1, 1, 1).forEach((x) => l.push(x));
  caixaIso(1, 0, 0, 1, 1, 1).forEach((x) => l.push(x));
  // pointed ears on the first cube's top face (near its left and right corners)
  const orelhaPontuda = (cx, cy) => {
    const t = 0.34;
    const base = [[cx - t / 2, cy - t / 2, 1], [cx + t / 2, cy - t / 2, 1], [cx + t / 2, cy + t / 2, 1], [cx - t / 2, cy + t / 2, 1]];
    const topo = [cx, cy, 1.5];
    l.push(linhaIso(base, true));
    base.forEach((p) => l.push(linhaIso([p, topo], false)));
  };
  orelhaPontuda(0.22, 0.78);
  orelhaPontuda(0.78, 0.22);
  // drooping ears on the second cube: flaps folded down from its top corners
  const orelhaCaida = (cx, cy, sx, sy) => {
    l.push(linhaIso([[cx, cy, 1], [cx + sx * 0.5, cy + sy * 0.5, 0.84], [cx + sx * 0.16, cy + sy * 0.16, 0.36]], true));
  };
  orelhaCaida(1.06, 0.94, -1, 1);
  orelhaCaida(1.94, 0.06, 1, -1);
  return l;
}

function desenhoCuboComAlca() {
  // a box with a handle: a bag, or a box with a handle
  const l = caixaIso(0, 0, 0, 1.3, 1.0, 1.15);
  const cx = 0.65, y0 = 0.5, topo = 1.15;
  l.push(linhaIso([[cx - 0.32, y0, topo], [cx - 0.32, y0, topo + 0.6], [cx + 0.32, y0, topo + 0.6], [cx + 0.32, y0, topo]], false));
  return l;
}

function desenhoPorca() {
  // a hex nut drawn opaque (only what you would see): could be a gear, a bolt head, a box
  const l = [];
  const raio = 1.05, alt = 0.7;
  const hex = (r, z) => {
    const pts = [];
    for (let i = 0; i < 6; i += 1) pts.push([1 + r * Math.cos((i * Math.PI) / 3), 1 + r * Math.sin((i * Math.PI) / 3), z]);
    return pts;
  };
  const topo = hex(raio, alt), base = hex(raio, 0);
  const baseY = base.map((p) => projetar(p[0], p[1], p[2])[1]);
  const meioY = (Math.max(...baseY) + Math.min(...baseY)) / 2;
  l.push(linhaIso(topo, true));
  // lower (front) half of the bottom hexagon and the verticals that reach it
  const frente = base.map((p, i) => ({ p, i })).filter((o) => baseY[o.i] >= meioY - 0.01);
  for (let k = 0; k < frente.length - 1; k += 1) {
    if ((frente[k + 1].i - frente[k].i + 6) % 6 === 1) l.push(linhaIso([frente[k].p, frente[k + 1].p], false));
  }
  frente.forEach((o) => l.push(linhaIso([topo[o.i], o.p], false)));
  l.push(linhaIso(hex(raio * 0.45, alt), true));
  return l;
}

function desenhoCilindro() {
  const l = [];
  const r = 0.85, alt = 1.1;
  l.push(linhaIso(pontosElipse(1, 1, alt, r, 36), false), linhaIso(pontosElipse(1, 1, 0, r, 36), false));
  // vertical sides at the widest points of the ellipse (isometric left / right)
  const esq = [1 - r * 0.7071, 1 + r * 0.7071], dir = [1 + r * 0.7071, 1 - r * 0.7071];
  l.push(linhaIso([[esq[0], esq[1], 0], [esq[0], esq[1], alt]], false), linhaIso([[dir[0], dir[1], 0], [dir[0], dir[1], alt]], false));
  // a smaller lid on top: a pot, a cake, a cloche
  l.push(linhaIso(pontosElipse(1, 1, alt + 0.25, r * 0.55, 28), false));
  l.push(linhaIso(pontosElipse(1, 1, alt + 0.25, r * 0.55, 28).map((p) => [p[0], p[1], alt]), false));
  return l;
}

function desenhoCruzExtrudada() {
  // a plus turned 45 degrees so its arms run up/down and left/right on screen
  const forma = [[1, 0], [2, 0], [2, 1], [3, 1], [3, 2], [2, 2], [2, 3], [1, 3], [1, 2], [0, 2], [0, 1], [1, 1]];
  const c = Math.SQRT1_2;
  const base = forma.map(([x, y]) => [1.5 + (x - 1.5) * c - (y - 1.5) * c, 1.5 + (x - 1.5) * c + (y - 1.5) * c]);
  const l = [];
  const alt = 0.6;
  l.push(linhaIso(base.map((p) => [p[0], p[1], alt]), true), linhaIso(base.map((p) => [p[0], p[1], 0]), true));
  base.forEach((p) => l.push(linhaIso([[p[0], p[1], 0], [p[0], p[1], alt]], false)));
  return l;
}

function desenhoCubosLogo() {
  const l = [];
  caixaIso(0, 0, 0, 1, 1, 1).forEach((x) => l.push(x));
  caixaIso(1, 0, 0, 1, 1, 1).forEach((x) => l.push(x));
  return l;
}

const MARCAS_SEGMENTO = {
  joalheria: { desenho: desenhoIngotes },
  petshop: { desenho: desenhoCuboComOrelhas },
  comercio: { desenho: desenhoCuboComAlca },
  servicos: { desenho: desenhoPorca },
  alimentacao: { desenho: desenhoCilindro },
  saude: { desenho: desenhoCruzExtrudada },
  outro: { desenho: desenhoCubosLogo },
};

const marcasCalculadas = {};

// path data + bounding box of a drawing, computed once.
function marcaDoSegmento(id) {
  const chave = Object.prototype.hasOwnProperty.call(MARCAS_SEGMENTO, id) ? id : "outro";
  if (!marcasCalculadas[chave]) {
    const linhas = MARCAS_SEGMENTO[chave].desenho();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    linhas.forEach((ln) => ln.forEach(([x, y]) => {
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }));
    const d = linhas.map((ln) => ln.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("")).join("");
    marcasCalculadas[chave] = { w: maxX - minX, h: maxY - minY, minX: minX, minY: minY, d: () => d };
  }
  return marcasCalculadas[chave];
}

// Same dimensions rule as the cube logo: height = size * 1.3; width follows the drawing.
function buildSegmentMark(id, size) {
  const marca = marcaDoSegmento(id);
  const altura = Math.round(size * 1.3);
  const largura = Math.round(altura * (marca.w / marca.h) * 0.85);
  const pad = 2;
  const escala = Math.min((largura - 2 * pad) / marca.w, (altura - 2 * pad) / marca.h);
  const ox = (largura - marca.w * escala) / 2 - marca.minX * escala;
  const oy = (altura - marca.h * escala) / 2 - marca.minY * escala;
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
  const svg = wrapArt(largura, altura, "art-logo-svg", [colored("art-accent", g)]);
  svg.setAttribute("width", String(largura));
  svg.setAttribute("height", String(altura));
  return svg;
}

// Larger version for the KPI tiles (fills its slot, scales with it).
function buildSegmentArt(id) {
  const marca = marcaDoSegmento(id);
  const escala = Math.min(180 / marca.w, 130 / marca.h);
  const ox = (200 - marca.w * escala) / 2 - marca.minX * escala;
  const oy = (150 - marca.h * escala) / 2 - marca.minY * escala;
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
  const g = svgNode("g", { transform: `translate(${(cx - (marca.w * escala) / 2 - marca.minX * escala).toFixed(2)} ${(cy - (marca.h * escala) / 2 - marca.minY * escala).toFixed(2)}) scale(${escala.toFixed(4)})` });
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
