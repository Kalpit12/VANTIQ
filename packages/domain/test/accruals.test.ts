import { describe, expect, it } from "vitest";
import { accrualJournal, contractValue, estimateAccrual, periodEnd, type TrialContract } from "../src";

// Every figure below is worked out by hand in the comments.
const contract: TrialContract = {
  start: "2026-01",
  items: [
    { driver: "monthly", unitCost: 10_000_00, units: 12 }, // $10k a month for 12 months = $120k
    { driver: "site", unitCost: 5_000_00, units: 4 }, // $20k
    { driver: "patient", unitCost: 2_000_00, units: 20 }, // $40k
    { driver: "visit", unitCost: 500_00, units: 100 }, // $50k
  ],
  changeOrders: [],
}; // total $230k

const activity = [
  { period: "2026-01", sites: 2, patients: 0, visits: 0 },
  { period: "2026-02", sites: 2, patients: 4, visits: 6 },
  { period: "2026-03", sites: 0, patients: 5, visits: 15 },
];
const billed = (entries: [string, number][]) => new Map(entries.map(([p, v]) => [p, v * 100]));

describe("estimateAccrual", () => {
  it("earns each driver's completed units at its unit cost and subtracts billing", () => {
    const e = estimateAccrual(contract, activity, billed([["2026-01", 20_000], ["2026-02", 40_000], ["2026-03", 30_000]]), "2026-03");
    // monthly 3 × $10k = $30k; sites 4 × $5k = $20k; patients 9 × $2k = $18k; visits 21 × $500 = $10.5k
    expect(e.lines.map((l) => [l.driver, l.unitsToDate, l.earned / 100])).toEqual([
      ["monthly", 3, 30_000],
      ["site", 4, 20_000],
      ["patient", 9, 18_000],
      ["visit", 21, 10_500],
    ]);
    expect(e.earned).toBe(78_500_00);
    expect(e.billed).toBe(90_000_00);
    expect(e.accrual).toBe(-11_500_00); // billed ahead of the work: a prepayment
    expect(e.contractValue).toBe(230_000_00);
    expect(e.pctComplete).toBeCloseTo(78_500 / 230_000);
    expect(e.estimatedPeriods).toEqual([]);
    expect(e.curve.map((c) => c.earned / 100)).toEqual([
      10_000 + 10_000, // Jan: 1 month + 2 sites
      20_000 + 20_000 + 8_000 + 3_000, // Feb: 2 months, 4 sites, 4 patients, 6 visits
      78_500,
    ]);
    expect(e.curve.map((c) => c.billed / 100)).toEqual([20_000, 60_000, 90_000]);
  });

  it("never earns more than the contract pays for, and says how far over it is", () => {
    const e = estimateAccrual(contract, [{ period: "2026-01", sites: 6, patients: 0, visits: 0 }], new Map(), "2026-01");
    const site = e.lines.find((l) => l.driver === "site")!;
    expect(site).toMatchObject({ contractedUnits: 4, unitsToDate: 6, unitsOverContract: 2, earned: 20_000_00 });
    // The management fee stops after the contracted 12 months.
    const late = estimateAccrual(contract, activity, new Map(), "2027-06");
    expect(late.lines.find((l) => l.driver === "monthly")!.earned).toBe(120_000_00);
  });

  it("prices units beyond the base contract at the change order's rate, from its effective month", () => {
    const withCo: TrialContract = {
      ...contract,
      changeOrders: [{ number: 1, effective: "2026-03", description: "Two more sites", items: [{ driver: "site", unitCost: 7_000_00, units: 2 }] }],
    };
    const act = [{ period: "2026-01", sites: 4, patients: 0, visits: 0 }, { period: "2026-02", sites: 1, patients: 0, visits: 0 }, { period: "2026-03", sites: 1, patients: 0, visits: 0 }];
    expect(contractValue(withCo, "2026-02")).toBe(230_000_00);
    expect(contractValue(withCo, "2026-03")).toBe(244_000_00);
    // Feb: the 5th site is over contract (CO not effective yet): 4 × $5k
    const feb = estimateAccrual(withCo, act, new Map(), "2026-02");
    expect(feb.lines.find((l) => l.driver === "site")).toMatchObject({ earned: 20_000_00, unitsOverContract: 1 });
    // Mar: 4 × $5k + 2 × $7k = $34k, average $5,667 a site
    const mar = estimateAccrual(withCo, act, new Map(), "2026-03");
    expect(mar.lines.find((l) => l.driver === "site")).toMatchObject({ earned: 34_000_00, unitsOverContract: 0, unitCost: 5_666_67 });
  });

  it("fills months the CRO hasn't reported with the average of the last three reports", () => {
    // April and May not reported: each estimated as the average of Jan–Mar
    // sites (2+2+0)/3 → 1, patients (0+4+5)/3 → 3, visits (0+6+15)/3 → 7
    const e = estimateAccrual(contract, activity, new Map(), "2026-05");
    expect(e.estimatedPeriods).toEqual(["2026-04", "2026-05"]);
    expect(e.lastReported).toBe("2026-03");
    const units = Object.fromEntries(e.lines.map((l) => [l.driver, l.unitsToDate]));
    expect(units).toEqual({ monthly: 5, site: 4 + 2, patient: 9 + 6, visit: 21 + 14 });
    // A gap before the latest report counts as no activity, not an estimate.
    const gap = estimateAccrual(contract, [activity[0]!, activity[2]!], new Map(), "2026-03");
    expect(gap.estimatedPeriods).toEqual([]);
    expect(gap.lines.find((l) => l.driver === "patient")!.unitsToDate).toBe(5);
  });

  it("counts billing before the contract start and none after the as-of month", () => {
    const e = estimateAccrual(contract, activity, billed([["2025-12", 5_000], ["2026-01", 1_000], ["2026-04", 9_999]]), "2026-01");
    expect(e.billed).toBe(6_000_00);
    expect(e.accrual).toBe(20_000_00 - 6_000_00);
  });
});

describe("accrualJournal", () => {
  it("books unbilled work to accrued costs on the last day of the month", () => {
    const e = estimateAccrual(contract, activity, billed([["2026-01", 15_000]]), "2026-01");
    expect(periodEnd("2026-02")).toBe("2026-02-28");
    expect(accrualJournal({ code: "HX-1", programCode: "HX-101" }, e)).toEqual([
      { date: "2026-01-31", account: "6110", accountName: "CRO clinical trial services", debit: 5_000_00, credit: 0, memo: "Accrual HX-1 2026-01, reverses 2026-02-01", className: "HX-101" },
      { date: "2026-01-31", account: "2150", accountName: "Accrued clinical trial costs", debit: 0, credit: 5_000_00, memo: "Accrual HX-1 2026-01, reverses 2026-02-01", className: "HX-101" },
    ]);
  });

  it("books billing ahead of the work as a prepayment, and nothing when they match", () => {
    const e = estimateAccrual(contract, activity, billed([["2026-01", 25_000]]), "2026-01");
    const je = accrualJournal({ code: "HX-1", programCode: null }, e);
    expect(je.map((l) => [l.account, l.debit / 100, l.credit / 100])).toEqual([["1250", 5_000, 0], ["6110", 0, 5_000]]);
    const even = estimateAccrual(contract, activity, billed([["2026-01", 20_000]]), "2026-01");
    expect(accrualJournal({ code: "HX-1", programCode: null }, even)).toEqual([]);
  });
});

describe("accrual properties", () => {
  it("work done never exceeds the contract value and never falls month to month", async () => {
    const fc = (await import("fast-check")).default;
    const month = fc.record({ sites: fc.nat(5), patients: fc.nat(20), visits: fc.nat(80) });
    fc.assert(
      fc.property(fc.array(month, { maxLength: 18 }), (rows) => {
        const act = rows.map((r, i) => ({ period: `2026-${String((i % 12) + 1).padStart(2, "0")}`, ...r })).slice(0, 12);
        const e = estimateAccrual(contract, act, new Map(), "2026-12");
        for (let i = 1; i < e.curve.length; i++) expect(e.curve[i]!.earned).toBeGreaterThanOrEqual(e.curve[i - 1]!.earned);
        expect(e.earned).toBeLessThanOrEqual(e.contractValue);
      }),
    );
  });
});
