// Neutralizes CSV/formula injection: Excel (and some other spreadsheet
// readers) treats a cell starting with =, +, -, @, tab, or CR as a live
// formula when the CSV is opened — a well-known attack (OWASP "CSV
// Injection"). Any exported field (Observação, Produto, a person's name...)
// ultimately comes from the sheet, which anyone with Editor+ access — or a
// corrupted/malicious entry — could have set, so this isn't hypothetical.
// Prefixing with a straight quote forces spreadsheet apps to read it as text.
function neutralizeFormulaValue(str) {
  return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
}

function toCsvValue(value) {
  const str = value === null || value === undefined ? "" : String(value);
  const safe = neutralizeFormulaValue(str);
  if (/[",\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

// Prefixing with a BOM keeps accented characters (ã, ç, é...) readable when
// the file is opened in Excel, which otherwise guesses the wrong encoding.
function downloadCsv(filename, headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(toCsvValue).join(","));
  const csvContent = "﻿" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function todayForFilename() {
  return new Date().toISOString().slice(0, 10);
}
