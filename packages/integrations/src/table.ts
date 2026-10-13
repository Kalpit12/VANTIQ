import ExcelJS from "exceljs";
import Papa from "papaparse";

/** A parsed upload: header names plus rows of cell text, in file order. */
export interface RawTable {
  headers: string[];
  rows: string[][];
}

const MAX_ROWS = 200_000;

export function parseCsv(text: string): RawTable {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
  const [head, ...rest] = res.data;
  if (!head) return { headers: [], rows: [] };
  if (rest.length > MAX_ROWS) throw new Error(`File has ${rest.length} rows; the limit is ${MAX_ROWS}.`);
  return { headers: head.map((h) => h.trim()), rows: rest.map((r) => r.map((c) => (c ?? "").trim())) };
}

/** Reads the first worksheet. Dates become `YYYY-MM-DD`, numbers keep full precision. */
export async function parseXlsx(data: ArrayBuffer): Promise<RawTable> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const ws = wb.worksheets.find((w) => w.actualRowCount > 0);
  if (!ws) return { headers: [], rows: [] };
  const all: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) cells.push(cellText(row.getCell(c).value));
    if (cells.some((c) => c !== "")) all.push(cells);
  });
  const [head, ...rest] = all;
  if (!head) return { headers: [], rows: [] };
  if (rest.length > MAX_ROWS) throw new Error(`File has ${rest.length} rows; the limit is ${MAX_ROWS}.`);
  // Drop trailing columns with no header and no data.
  let width = head.length;
  while (width > 0 && head[width - 1] === "" && rest.every((r) => (r[width - 1] ?? "") === "")) width--;
  return { headers: head.slice(0, width), rows: rest.map((r) => r.slice(0, width)) };
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.trim();
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "object") {
    if ("result" in v && v.result !== undefined) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("").trim();
    if ("text" in v) return String(v.text).trim();
  }
  return String(v);
}

export async function parseUpload(filename: string, data: ArrayBuffer): Promise<RawTable> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx")) return parseXlsx(data);
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return parseCsv(new TextDecoder().decode(data));
  throw new Error("Upload a .csv or .xlsx file.");
}
