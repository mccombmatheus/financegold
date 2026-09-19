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
  return wrapArt(330, 260, "art-svg", [
    colored("art-halftone", buildHalftone(215, 120, 108, 9, 4.1)),
    colored("art-wire", buildWireframe([[0, 0, 0, 1], [1, 0, 0, 1], [0, 0, 1, 1]], 46, 205, 150, 1.1, 0.7)),
  ]);
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
