import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  allocate,
  consolidate,
  consolidatedLedgerData,
  entityLedgerData,
  intercompanyFlags,
  inverseTranslate,
  isValidRate,
  Ledger,
  parseRate,
  STANDARD_CATEGORIES,
  translateAmount,
  type EntityBooks,
  type FxRate,
  type IntercompanyPair,
  type Transaction,
} from "../src";

const tx = (id: string, date: string, categoryId: string, amount: number, accountCode: string): Transaction => ({ id, date, categoryId, amount, vendorId: null, departmentId: null, programId: null, memo: id, accountCode });
const us = { id: "us", code: "US", name: "Parent Inc.", currency: "USD", parent: true };
const uk = { id: "uk", code: "UK", name: "Research Ltd", currency: "GBP", parent: false };
const base = { companyName: "Group", currency: "USD", categories: STANDARD_CATEGORIES, programs: [], vendors: [], departments: [] };
const opts = { reportingCurrency: "USD", categories: STANDARD_CATEGORIES };
const gbp = (period: string, average: string, closing = average): FxRate => ({ period, currency: "GBP", average, closing });
const kind = new Map(STANDARD_CATEGORIES.map((c) => [c.id, c.kind]));
const netIncome = (ts: Transaction[]) => ts.reduce((s, t) => s + (kind.get(t.categoryId) === "revenue" ? t.amount : -t.amount), 0);

describe("rates", () => {
  it("parses decimal rates exactly and refuses anything else", () => {
    expect(parseRate("1.2734")).toBe(12_734_000_000n);
    expect(parseRate("0.0000000001")).toBe(1n);
    for (const bad of ["", "0", "-1.2", "1,27", "abc", "1.12345678901"]) expect(isValidRate(bad), bad).toBe(false);
  });

  it("rounds each translated line half away from zero", () => {
    expect(translateAmount(1_000_00, "1.2734")).toBe(1_273_40);
    expect(translateAmount(1, "1.5")).toBe(2); // 1.5 cents → 2
    expect(translateAmount(-1, "1.5")).toBe(-2);
    expect(translateAmount(3, "0.5")).toBe(2); // 1.5 → 2
  });

  it("finds the local amount that translates to an exact target when the rate is below 1", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e10, max: 1e10 }), fc.integer({ min: 1, max: 9999 }), (target, r) => {
        const rate = `0.${String(r).padStart(4, "0")}`;
        expect(translateAmount(inverseTranslate(target, rate), rate)).toBe(target);
      }),
    );
  });
});

describe("allocate", () => {
  it("splits a total across lines in proportion, adding up exactly", () => {
    expect(allocate([100, 100, 100], 100)).toEqual([34, 33, 33]);
    expect(allocate([300, -100], 100)).toEqual([150, -50]);
    expect(allocate([5, 5], 0)).toEqual([0, 0]);
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 1e9 }), { minLength: 1, maxLength: 20 }), fc.double({ min: 0, max: 1, noNaN: true }), fc.boolean(), (xs, share, negative) => {
        const amounts = negative ? xs.map((x) => -x) : xs;
        const sum = amounts.reduce((s, a) => s + a, 0);
        const total = Math.trunc(sum * share) || 0;
        const parts = allocate(amounts, total);
        expect(parts.reduce((s, p) => s + p, 0)).toBe(total);
        parts.forEach((p, i) => expect(Math.abs(p)).toBeLessThanOrEqual(Math.abs(amounts[i]!)));
      }),
    );
  });
});

describe("consolidate", () => {
  const pair: IntercompanyPair = { id: "p1", entityId: "uk", accountCode: "4900", counterpartyEntityId: "us", counterpartyAccountCode: "6450" };

  it("adds entities together in the reporting currency, with the parent first", () => {
    const books: EntityBooks[] = [
      { entity: uk, transactions: [tx("u1", "2026-09-10", "rd-lab", 1_000_00, "6310")], budget: [{ period: "2026-09", categoryId: "rd-lab", programId: null, amount: 900_00 }], cash: [{ period: "2026-09", balance: 10_000_00 }] },
      { entity: us, transactions: [tx("a1", "2026-09-10", "rd-lab", 500_00, "6310")], budget: [], cash: [{ period: "2026-09", balance: 20_000_00 }] },
    ];
    const r = consolidate(books, [gbp("2026-09", "1.25", "1.30")], [], opts);
    expect(r.entities.map((e) => e.entity.id)).toEqual(["us", "uk"]);
    const ledger = new Ledger(consolidatedLedgerData(base, r));
    expect(ledger.actual({ periods: ["2026-09"], categoryIds: ["rd-lab"] })).toBe(1_750_00);
    expect(ledger.budget({ periods: ["2026-09"], categoryIds: ["rd-lab"] })).toBe(1_125_00);
    expect(ledger.cashAt("2026-09")).toBe(33_000_00);
    const ukLedger = new Ledger(entityLedgerData(base, r, "uk"));
    expect(ukLedger.actual({ periods: ["2026-09"] })).toBe(1_250_00);
    expect(ukLedger.data.transactions[0]!.original).toEqual({ amount: 1_000_00, currency: "GBP", rate: "1.25" });
  });

  it("uses the nearest earlier month's rate when one is missing, and says so", () => {
    const books: EntityBooks[] = [{ entity: uk, transactions: [tx("u1", "2026-09-10", "rd-lab", 100_00, "6310"), tx("u0", "2026-06-10", "rd-lab", 100_00, "6310")], budget: [], cash: [] }];
    const r = consolidate(books, [gbp("2026-07", "1.20"), gbp("2026-08", "1.30")], [], opts);
    expect(r.transactions.map((t) => t.amount)).toEqual([130_00, 120_00]);
    expect(r.rateIssues).toEqual([
      { currency: "GBP", period: "2026-06", kind: "average", usedPeriod: "2026-07" },
      { currency: "GBP", period: "2026-09", kind: "average", usedPeriod: "2026-08" },
    ]);
  });

  it("leaves out an entity whose currency has no rates at all, and names the months", () => {
    const books: EntityBooks[] = [{ entity: uk, transactions: [tx("u1", "2026-09-10", "rd-lab", 100_00, "6310")], budget: [], cash: [] }];
    const r = consolidate(books, [], [], opts);
    expect(r.transactions).toEqual([]);
    expect(r.entities[0]!.translated).toBe(false);
    expect(r.rateIssues).toEqual([{ currency: "GBP", period: "2026-09", kind: "average", usedPeriod: null }]);
  });

  it("eliminates matching intercompany lines in full, leaving them out of the group", () => {
    const books: EntityBooks[] = [
      { entity: uk, transactions: [tx("u1", "2026-09-30", "rev-collab", 800_00, "4900")], budget: [], cash: [] },
      { entity: us, transactions: [tx("a1", "2026-09-30", "rd-consult", 1_000_00, "6450"), tx("a2", "2026-09-05", "rd-cro", 50_00, "6110")], budget: [], cash: [] },
    ];
    const r = consolidate(books, [gbp("2026-09", "1.25")], [pair], opts);
    expect(r.transactions.map((t) => t.id)).toEqual(["a2"]);
    expect(r.checks).toMatchObject([{ pairId: "p1", period: "2026-09", eliminated: 1_000_00, difference: 0, status: "matched" }]);
    // Each entity on its own still shows its intercompany lines, marked.
    expect(r.entities.find((e) => e.entity.id === "us")!.transactions[0]!.intercompany).toEqual({ pairId: "p1", counterpartyEntityId: "uk", eliminated: 0 });
  });

  it("flags a month only one side booked, and keeps its amount in the group", () => {
    const books: EntityBooks[] = [
      { entity: uk, transactions: [tx("u1", "2026-09-30", "rev-collab", 800_00, "4900")], budget: [], cash: [] },
      { entity: us, transactions: [], budget: [], cash: [] },
    ];
    const r = consolidate(books, [gbp("2026-09", "1.25")], [pair], opts);
    expect(r.transactions.map((t) => [t.id, t.amount])).toEqual([["u1", 1_000_00]]);
    expect(intercompanyFlags(r, "2026-09")).toMatchObject([{ status: "one_sided", eliminated: 0, difference: 1_000_00 }]);
  });

  it("never eliminates two sides that both raise (or both lower) net income", () => {
    const books: EntityBooks[] = [
      { entity: uk, transactions: [tx("u1", "2026-09-30", "rev-collab", 100_00, "4900")], budget: [], cash: [] },
      { entity: us, transactions: [tx("a1", "2026-09-30", "rd-consult", -125_00, "6450")], budget: [], cash: [] },
    ];
    const r = consolidate(books, [gbp("2026-09", "1.25")], [pair], opts);
    expect(r.checks[0]).toMatchObject({ eliminated: 0, difference: 250_00, status: "difference" });
  });

  it("eliminates intercompany budget lines the same way", () => {
    const books: EntityBooks[] = [
      { entity: uk, transactions: [], budget: [{ period: "2026-10", categoryId: "rev-collab", programId: null, amount: 800_00, accountCode: "4900" }], cash: [] },
      { entity: us, transactions: [], budget: [{ period: "2026-10", categoryId: "rd-consult", programId: null, amount: 1_000_00, accountCode: "6450" }, { period: "2026-10", categoryId: "rd-cro", programId: null, amount: 70_00, accountCode: "6110" }], cash: [] },
    ];
    const r = consolidate(books, [gbp("2026-09", "1.25")], [pair], opts);
    expect(r.budget.map((b) => [b.categoryId, b.amount])).toEqual([["rd-cro", 70_00]]);
    expect(r.checks.filter((c) => c.basis === "budget")).toMatchObject([{ status: "matched", eliminated: 1_000_00 }]);
  });

  it("refuses pairs that reuse an account or pair an entity with itself", () => {
    const books: EntityBooks[] = [
      { entity: uk, transactions: [], budget: [], cash: [] },
      { entity: us, transactions: [], budget: [], cash: [] },
    ];
    expect(() => consolidate(books, [], [pair, { ...pair, id: "p2", counterpartyAccountCode: "6451" }], opts)).toThrow(/more than one/);
    expect(() => consolidate(books, [], [{ ...pair, counterpartyEntityId: "uk" }], opts)).toThrow(/itself/);
  });

  it("keeps group net income unchanged whatever the intercompany amounts (property)", () => {
    const line = fc.record({ day: fc.integer({ min: 1, max: 28 }), month: fc.constantFrom("2026-07", "2026-08", "2026-09"), amount: fc.integer({ min: -5e7, max: 5e7 }) });
    fc.assert(
      fc.property(fc.array(line, { maxLength: 8 }), fc.array(line, { maxLength: 8 }), fc.array(line, { maxLength: 8 }), (ukIc, usIc, external) => {
        const mk = (prefix: string, xs: typeof ukIc, cat: string, acct: string) => xs.map((x, i) => tx(`${prefix}${i}`, `${x.month}-${String(x.day).padStart(2, "0")}`, cat, x.amount, acct));
        const books: EntityBooks[] = [
          { entity: uk, transactions: [...mk("u", ukIc, "rev-collab", "4900"), ...mk("x", external, "rd-lab", "6310")], budget: [], cash: [] },
          { entity: us, transactions: mk("a", usIc, "rd-consult", "6450"), budget: [], cash: [] },
        ];
        const r = consolidate(books, [gbp("2026-07", "1.2734"), gbp("2026-08", "1.2690"), gbp("2026-09", "1.2817")], [pair], opts);
        expect(netIncome(r.transactions)).toBe(netIncome(r.entities.flatMap((e) => e.transactions)));
        for (const c of r.checks) expect(Math.abs(c.eliminated)).toBeLessThanOrEqual(Math.min(Math.abs(c.side.translated), Math.abs(c.counterparty.translated)));
      }),
    );
  });
});
