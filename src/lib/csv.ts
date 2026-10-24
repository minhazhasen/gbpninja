// CSV export in the browser (Reviews, Performance, search queries). Excel opens it straight away thanks to the BOM.
export type CsvCell = string | number | null | undefined;

export function toCsv(rows: CsvCell[][]) {
  const esc = (v: CsvCell) => {
    let s = v == null ? "" : String(v);
    // Review text and search queries are public input: stop spreadsheets from running them as formulas.
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

export function downloadCsv(filename: string, rows: CsvCell[][]) {
  const blob = new Blob(["﻿", toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** "performance-sunrise-dental-2026-09-24-to-2026-10-23.csv" */
export function csvFilename(...parts: (string | null | undefined)[]) {
  const slug = parts
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
  return `${slug || "export"}.csv`;
}
