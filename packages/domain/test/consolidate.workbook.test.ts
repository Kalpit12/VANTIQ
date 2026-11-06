import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { consolidate, Ledger, consolidatedLedgerData, STANDARD_CATEGORIES, type EntityBooks, type FxRate, type IntercompanyPair, type Transaction } from "../src";

/*
 * Consolidation against reference workbooks (architecture.md section 10,
 * Phase 3 test gate). The workbooks in test/workbooks hold the inputs and the
 * expected results as spreadsheet formulas (ROUND, SUMIFS, MIN), worked out by
 * the spreadsheet rather than by this code. build_workbooks.py makes them.
 */

type Row = (string | number | null)[];

async function readWorkbook(name: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(fileURLToPath(new URL(`./workbooks/${name}`, import.meta.url)));
  const rows = (sheet: string): Row[] => {
    const ws = wb.getWorksheet(sheet);
    if (!ws) throw new Error(`No sheet ${sheet} in ${name}`);
    const out: Row[] = [];
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const values = (row.values as unknown[]).slice(1).map((v) => {
        // Formula cells carry the value the spreadsheet calculated. ExcelJS drops a calculated 0, so a formula with no result is 0.
        const x = v && typeof v === "object" && "formula" in v ? ((v as { result?: unknown }).result ?? 0) : v;
        return x === undefined ? null : (x as string | number | null);
      });
      out.push(values);
    });
    return out;
  };
  return { rows };
}

const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const rate = (v: unknown) => String(v);

async function load(name: string) {
  const { rows } = await readWorkbook(name);
  const entities = rows("Entities").map(([code, entityName, currency, parent]) => ({ id: String(code), code: String(code), name: String(entityName), currency: String(currency), parent: parent === "Yes" }));
  const fx: FxRate[] = rows("Rates").map(([period, currency, average, closing]) => ({ period: String(period), currency: String(currency), average: rate(average), closing: rate(closing) }));
  const books: EntityBooks[] = entities.map((entity) => ({ entity, transactions: [], budget: [], cash: [] }));
  const bookOf = new Map(books.map((b) => [b.entity.id, b]));
  rows("Lines").forEach(([entity, date, account, category, amount, memo], i) => {
    const t: Transaction = { id: `L${i + 2}`, date: String(date), categoryId: String(category), amount: cents(amount), vendorId: null, departmentId: null, programId: null, memo: String(memo), accountCode: String(account) };
    bookOf.get(String(entity))!.transactions.push(t);
  });
  for (const [entity, period, balance] of rows("Cash")) bookOf.get(String(entity))!.cash.push({ period: String(period), balance: cents(balance) });
  let pairs: IntercompanyPair[] = [];
  try {
    pairs = rows("Pairs").map(([id, e, a, ce, ca]) => ({ id: String(id), entityId: String(e), accountCode: String(a), counterpartyEntityId: String(ce), counterpartyAccountCode: String(ca) }));
  } catch {
    // The translation workbook has no pairs.
  }
  const result = consolidate(books, fx, pairs, { reportingCurrency: "USD", categories: STANDARD_CATEGORIES });
  return { rows, result, books };
}

function expectMatchesWorkbook(rows: (s: string) => Row[], result: ReturnType<typeof consolidate>) {
  const ledger = new Ledger(consolidatedLedgerData({ companyName: "Group", currency: "USD", categories: STANDARD_CATEGORIES, programs: [], vendors: [], departments: [] }, result));
  const expected = rows("Expected consolidated");
  expect(expected.length).toBeGreaterThan(0);
  for (const [category, period, amount] of expected) {
    expect(ledger.actual({ periods: [String(period)], categoryIds: [String(category)] }), `${category} ${period}`).toBe(cents(amount));
  }
  for (const [period, balance] of rows("Expected cash")) expect(ledger.cashAt(String(period)), `cash ${period}`).toBe(cents(balance));
}

describe("consolidation reference workbook: FX translation", () => {
  it("translates every entity's lines at the month's average rate, to the cent", async () => {
    const { rows, result } = await load("fx-translation.xlsx");
    expect(result.rateIssues).toEqual([]);
    expectMatchesWorkbook(rows, result);
  });

  it("translates each line on its own and keeps the original amount and rate", async () => {
    const { rows, result } = await load("fx-translation.xlsx");
    const lines = rows("Lines");
    const all = result.entities.flatMap((e) => e.transactions);
    lines.forEach((line, i) => {
      const t = all.find((x) => x.id === `L${i + 2}`)!;
      expect(t.amount, `line ${i + 2}`).toBe(cents(line[9]));
      if (line[7] === "USD") expect(t.original).toBeUndefined();
      else expect(t.original).toEqual({ amount: cents(line[4]), currency: line[7], rate: String(line[8]) });
    });
  });

  it("translates cash at the closing rate", async () => {
    const { rows, result } = await load("fx-translation.xlsx");
    for (const [entity, period, , , , usd] of rows("Cash")) {
      const e = result.entities.find((x) => x.entity.id === entity)!;
      expect(e.cash.find((c) => c.period === period)!.balance).toBe(cents(usd));
    }
  });
});

describe("consolidation reference workbook: intercompany eliminations", () => {
  it("eliminates each pair month by month, as the workbook does", async () => {
    const { rows, result } = await load("intercompany-eliminations.xlsx");
    const expected = rows("Eliminations");
    const actual = result.checks.filter((c) => c.basis === "actual");
    expect(actual).toHaveLength(expected.length);
    for (const [pair, period, , , , , , , sideUsd, cpUsd, , , eliminated, , , difference, status] of expected) {
      const c = actual.find((x) => x.pairId === pair && x.period === period)!;
      expect(c, `${pair} ${period}`).toBeDefined();
      expect(c.side.translated, `${pair} ${period} side`).toBe(cents(sideUsd));
      expect(c.counterparty.translated, `${pair} ${period} counterparty`).toBe(cents(cpUsd));
      expect(c.eliminated, `${pair} ${period} eliminated`).toBe(cents(eliminated));
      expect(c.difference, `${pair} ${period} difference`).toBe(cents(difference));
      expect(c.status, `${pair} ${period} status`).toBe(status);
    }
  });

  it("matches the workbook's consolidated income statement and cash", async () => {
    const { rows, result } = await load("intercompany-eliminations.xlsx");
    expectMatchesWorkbook(rows, result);
  });

  it("never changes group net income by eliminating", async () => {
    const { result } = await load("intercompany-eliminations.xlsx");
    const kind = new Map(STANDARD_CATEGORIES.map((c) => [c.id, c.kind]));
    const ni = (ts: Transaction[]) => ts.reduce((s, t) => s + (kind.get(t.categoryId) === "revenue" ? t.amount : -t.amount), 0);
    expect(ni(result.transactions)).toBe(ni(result.entities.flatMap((e) => e.transactions)));
  });

  it("flags the FX difference and the invoice the parent hasn't booked, and nothing else", async () => {
    const { result } = await load("intercompany-eliminations.xlsx");
    const flagged = result.checks.filter((c) => c.status !== "matched").map((c) => `${c.pairId} ${c.period} ${c.status}`);
    expect(flagged).toEqual(["P1 2026-08 difference", "P1 2026-09 one_sided"]);
  });

  it("leaves what is unmatched on the lines it came from, split across both invoices", async () => {
    const { result } = await load("intercompany-eliminations.xlsx");
    // August: the parent booked $403.60 more than the UK's invoices are worth at August's rate.
    const us = result.transactions.filter((t) => t.entityId === "US" && t.accountCode === "6450");
    expect(us.map((t) => [t.date, t.amount, t.intercompany?.eliminated])).toEqual([["2026-08-31", 403_60, 116_343_53]]);
    // The UK's two August invoices are eliminated in full; its September invoice stays, unmatched.
    const uk = result.transactions.filter((t) => t.entityId === "UK" && t.accountCode === "4900");
    expect(uk.map((t) => [t.date, t.amount])).toEqual([["2026-09-30", 118_352_88]]);
  });
});
