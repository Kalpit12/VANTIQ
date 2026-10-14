import { describe, expect, it } from "vitest";
import { buildForecast, DEFAULT_SCENARIOS, Ledger, summarizeForecast, type LedgerData, type Scenario } from "../src";

const tx = (id: string, date: string, categoryId: string, amount: number) => ({ id, date, categoryId, amount, vendorId: null, departmentId: null, programId: null, memo: "", accountCode: "x" });

const data: LedgerData = {
  companyName: "Test Bio",
  currency: "USD",
  categories: [
    { id: "rev", name: "Revenue", kind: "revenue", parentId: null, order: 0 },
    { id: "grant", name: "Grants", kind: "revenue", parentId: "rev", order: 0 },
    { id: "opex", name: "Operating expenses", kind: "opex", parentId: null, order: 1 },
    { id: "rd", name: "R&D", kind: "opex", parentId: "opex", order: 0 },
    { id: "cro", name: "CRO fees", kind: "opex", parentId: "rd", order: 0 },
    { id: "lab", name: "Lab supplies", kind: "opex", parentId: "rd", order: 1 },
    { id: "ga", name: "G&A", kind: "opex", parentId: "opex", order: 1 },
  ],
  programs: [],
  vendors: [],
  departments: [],
  transactions: [
    // CRO 100, 200, 300 over the last three months: run rate 200. Lab 30 a month, G&A 60 a month.
    tx("a", "2026-07-05", "cro", 100_00), tx("b", "2026-08-05", "cro", 200_00), tx("c", "2026-09-05", "cro", 300_00),
    tx("d", "2026-07-05", "lab", 30_00), tx("e", "2026-08-05", "lab", 30_00), tx("f", "2026-09-05", "lab", 30_00),
    tx("g", "2026-07-05", "ga", 60_00), tx("h", "2026-08-05", "ga", 60_00), tx("i", "2026-09-05", "ga", 60_00),
    tx("j", "2026-09-20", "grant", 900_00), // one-off: must not become a run rate for revenue
    tx("old", "2026-01-05", "cro", 5_000_00), // outside the run-rate window
  ],
  budget: [{ period: "2026-10", categoryId: "grant", programId: null, amount: 50_00 }],
  cash: [{ period: "2026-09", balance: 10_000_00 }],
};
const ledger = new Ledger(data);
const scenario = (over: Partial<Scenario> = {}): Scenario => ({ id: "s", ...DEFAULT_SCENARIOS[0]!, drivers: [], overrides: [], ...over });

describe("forecast", () => {
  it("starts the month after the books end and runs twelve months", () => {
    const f = buildForecast(ledger, scenario());
    expect(f.lastActual).toBe("2026-09");
    expect(f.periods[0]).toBe("2026-10");
    expect(f.periods).toHaveLength(12);
  });

  it("forecasts costs at their three-month run rate and revenue from the budget", () => {
    const f = buildForecast(ledger, scenario());
    expect(f.amount("cro", "2026-10")).toBe(200_00);
    expect(f.amount("opex", "2026-10")).toBe(290_00);
    expect(f.amount("grant", "2026-10")).toBe(50_00);
    // No budget for November: revenue falls back to its run rate (900 / 3).
    expect(f.amount("grant", "2026-11")).toBe(300_00);
    expect(f.explain("grant", "2026-11").steps[0]).toBe("No budget for Nov 2026, so the run rate is used");
    expect(f.explain("cro", "2026-10").steps).toEqual(["Average of Jul, Aug, Sep: $200.00"]);
  });

  it("compounds growth, splits a fixed amount by recent share, and lets a month be set by hand", () => {
    const f = buildForecast(
      ledger,
      scenario({
        drivers: [
          { categoryId: "cro", method: "run_rate", growth: 0.1, amount: null },
          { categoryId: "opex", method: "flat", growth: 0, amount: 1_000_00 },
        ],
        overrides: [{ period: "2026-12", categoryId: "lab", amount: 5_00, note: "Lab move" }],
      }),
    );
    expect(f.amount("cro", "2026-10")).toBe(220_00);
    expect(f.amount("cro", "2026-11")).toBe(242_00);
    // Lab and G&A inherit the fixed amount on Operating expenses: 1,000 split 30 : 60 between them.
    expect(f.amount("lab", "2026-10")).toBe(333_33);
    expect(f.amount("ga", "2026-10")).toBe(666_67);
    expect(f.driverFor("lab")).toMatchObject({ inherited: true, from: "opex" });
    expect(f.explain("lab", "2026-12")).toMatchObject({ value: 5_00, overridden: true });
    expect(f.explain("lab", "2026-12").steps.at(-1)).toBe("Set by hand to $5.00: Lab move");
  });

  it("applies the scenario's changes and never alters actuals", () => {
    const before = ledger.actual({ periods: ["2026-09"] });
    const down = buildForecast(ledger, scenario({ name: "Downside", kind: "downside", revenueChange: -0.25, costChange: 0.1 }));
    expect(down.amount("cro", "2026-10")).toBe(220_00);
    expect(down.amount("grant", "2026-10")).toBe(37_50);
    expect(ledger.actual({ periods: ["2026-09"] })).toBe(before);
  });

  it("rolls cash forward and summarizes each scenario", () => {
    const f = buildForecast(ledger, scenario());
    // October: 50 in, 290 out.
    expect(f.netIncome("2026-10")).toBe(-240_00);
    expect(f.cash("2026-10")).toBe(10_000_00 - 240_00);
    const s = summarizeForecast(ledger, f);
    expect(s.netIncome).toBe(s.revenue - s.costs);
    expect(s.endingCash).toBe(10_000_00 + s.netIncome);
    expect(s.zeroCash).toBeNull();
    const burn = buildForecast(ledger, scenario({ drivers: [{ categoryId: "ga", method: "flat", growth: 0, amount: 5_000_00 }] }));
    expect(summarizeForecast(ledger, burn).zeroCash).toBe("2026-11");
  });
});
