import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { generateSampleCompany, SAMPLE_ACCOUNTS, sampleFiles } from "@vantiq/fixtures";
import { EXCLUDED, guessColumns, normalize, parseAmount, parseCsv, parseDate, parsePeriod, parseXlsx, suggestCategory } from "../src";

describe("parseAmount", () => {
  it.each([
    ["1234.56", 123456],
    ["$1,234.56", 123456],
    ["(1,234.56)", -123456],
    ["-1234.5", -123450],
    ["1234.56-", -123456],
    ["USD 10", 1000],
    ["0.005", 1],
    ["12", 1200],
  ])("%s → %d", (raw, cents) => expect(parseAmount(raw)).toBe(cents));
  it.each(["", "abc", "1.234,56", "12a"])("rejects %j", (raw) => expect(parseAmount(raw)).toBeNull());
});

describe("dates and periods", () => {
  it("parses ISO, US and day-first dates", () => {
    expect(parseDate("2026-09-30")).toBe("2026-09-30");
    expect(parseDate("9/30/2026")).toBe("2026-09-30");
    expect(parseDate("30/09/2026", "dmy")).toBe("2026-09-30");
    expect(parseDate("46295")).toBe("2026-09-30");
    expect(parseDate("2/30/2026")).toBeNull();
  });
  it("parses month labels", () => {
    expect(parsePeriod("2026-09")).toBe("2026-09");
    expect(parsePeriod("Sep 2026")).toBe("2026-09");
    expect(parsePeriod("September 2026")).toBe("2026-09");
    expect(parsePeriod("Sep-26")).toBe("2026-09");
    expect(parsePeriod("9/2026")).toBe("2026-09");
    expect(parsePeriod("2026-09-30")).toBe("2026-09");
    expect(parsePeriod("Q3 2026")).toBeNull();
  });
});

describe("guessColumns", () => {
  it("finds QuickBooks-style ledger columns", () => {
    const map = guessColumns(["Date", "Transaction Type", "Num", "Name", "Memo/Description", "Account", "Debit", "Credit"], "ledger");
    expect(map).toMatchObject({ date: 0, vendor: 3, memo: 4, accountCode: 5, debit: 6, credit: 7, amount: null });
  });
  it("prefers a signed amount column over debit and credit", () => {
    const map = guessColumns(["Posting Date", "GL Account", "Account Name", "Amount", "Debit", "Credit"], "ledger");
    expect(map).toMatchObject({ date: 0, accountCode: 1, accountName: 2, amount: 3, debit: null, credit: null });
  });
});

describe("normalize", () => {
  it("reports bad rows with their row number and skips totals", () => {
    const table = parseCsv("Date,Account,Amount\n2026-09-01,6110,100\nnot a date,6110,5\n,Total,105\n2026-09-02,6110,abc\n2026-09-03,6110,0\n");
    const res = normalize("ledger", table, guessColumns(table.headers, "ledger"));
    expect(res.records).toHaveLength(1);
    expect(res.errors.map((e) => e.row)).toEqual([2, 4]);
    expect(res.skipped).toBe(2);
  });
  it("splits a combined account column", () => {
    const table = parseCsv("Date,Account,Amount\n2026-09-01,6110 · CRO clinical services,100\n2026-09-01,6210 - CMC,5\n");
    const res = normalize("ledger", table, guessColumns(table.headers, "ledger"));
    expect(res.records.map((r) => [r.accountCode, r.accountName])).toEqual([["6110", "CRO clinical services"], ["6210", "CMC"]]);
  });
  it("refuses to run without required columns", () => {
    const table = parseCsv("Date,Memo\n2026-09-01,x\n");
    expect(() => normalize("ledger", table, guessColumns(table.headers, "ledger"))).toThrow(/Account number/);
  });
});

describe("sample files", () => {
  it("round-trip: the ledger file sums to the sample company's totals per account", () => {
    const data = generateSampleCompany();
    const { ledgerCsv } = sampleFiles(data);
    const table = parseCsv(ledgerCsv);
    const res = normalize("ledger", table, guessColumns(table.headers, "ledger"));
    expect(res.errors).toEqual([]);
    const fromFile = new Map<string, number>();
    for (const r of res.records) fromFile.set(r.accountCode, (fromFile.get(r.accountCode) ?? 0) + r.amount);
    const expected = new Map<string, number>();
    for (const t of data.transactions) {
      const sign = t.categoryId.startsWith("rev") ? -1 : 1;
      expected.set(t.accountCode, (expected.get(t.accountCode) ?? 0) + sign * t.amount);
    }
    expect(fromFile).toEqual(expected);
  });

  it("suggests the right category for every sample account", () => {
    for (const a of SAMPLE_ACCOUNTS) expect(suggestCategory(a.code, a.name)?.categoryId, a.name).toBe(a.categoryId);
  });

  it("keeps balance sheet accounts out of the P&L", () => {
    expect(suggestCategory("1010", "Operating cash - SVB")?.categoryId).toBe(EXCLUDED);
    expect(suggestCategory("2100", "Accrued clinical expenses")?.categoryId).toBe(EXCLUDED);
    expect(suggestCategory("2000", "")?.categoryId).toBe(EXCLUDED);
    expect(suggestCategory("6999", "Miscellaneous")).toBeNull();
  });

  it("reads the same rows from an Excel workbook", async () => {
    const { budgetCsv } = sampleFiles();
    const csvTable = parseCsv(budgetCsv);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Budget");
    ws.addRow(csvTable.headers);
    for (const r of csvTable.rows) ws.addRow([new Date(`${r[0]}-01T00:00:00Z`), Number(r[1]), r[2], r[3], Number(r[4])]);
    const buf = await wb.xlsx.writeBuffer();
    const xTable = await parseXlsx(buf as ArrayBuffer);
    const a = normalize("budget", csvTable, guessColumns(csvTable.headers, "budget"));
    const b = normalize("budget", xTable, guessColumns(xTable.headers, "budget"));
    expect(b.errors).toEqual([]);
    expect(b.records).toEqual(a.records);
  });
});
