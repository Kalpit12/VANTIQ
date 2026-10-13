import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  Ledger,
  addMonths,
  buildBridge,
  computeVariance,
  formatAmount,
  formatCompactCurrency,
  formatSignedPct,
  isMaterial,
  periodRange,
  rangeLabel,
  runwayMonths,
  ytdPeriods,
  type LedgerData,
} from "../src";

describe("periods", () => {
  it("adds months across year boundaries", () => {
    expect(addMonths("2025-11", 3)).toBe("2026-02");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
  it("builds ranges and labels", () => {
    expect(periodRange("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(ytdPeriods("2026-03")).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(rangeLabel(["2026-01", "2026-02", "2026-03"])).toBe("Jan–Mar 2026");
  });
  it("round-trips addMonths", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2000, max: 2100 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: -500, max: 500 }), (y, m, n) => {
        const p = `${y}-${String(m).padStart(2, "0")}`;
        return addMonths(addMonths(p, n), -n) === p;
      }),
    );
  });
});

describe("variance", () => {
  it("treats costs above budget as unfavorable", () => {
    const v = computeVariance(120_00, 100_00, "opex");
    expect(v.delta).toBe(20_00);
    expect(v.deltaPct).toBeCloseTo(0.2);
    expect(v.favorable).toBe(false);
  });
  it("treats revenue above budget as favorable", () => {
    expect(computeVariance(120_00, 100_00, "revenue").favorable).toBe(true);
    expect(computeVariance(80_00, 100_00, "revenue").favorable).toBe(false);
  });
  it("returns null percent when budget is zero", () => {
    expect(computeVariance(5_00, 0, "opex").deltaPct).toBeNull();
  });
  it("uses the larger of the absolute and percent thresholds", () => {
    const t = { pct: 0.1, abs: 25_000_00 };
    // 10% of $1M = $100k > $25k floor, so $50k is not material.
    expect(isMaterial(computeVariance(1_050_000_00, 1_000_000_00, "opex"), t)).toBe(false);
    expect(isMaterial(computeVariance(1_100_000_00, 1_000_000_00, "opex"), t)).toBe(true);
    // Small line: $30k over a $40k budget clears the $25k floor.
    expect(isMaterial(computeVariance(70_000_00, 40_000_00, "opex"), t)).toBe(true);
    expect(isMaterial(computeVariance(60_000_00, 40_000_00, "opex"), t)).toBe(false);
  });
});

describe("bridge", () => {
  it("always ends at start plus the sum of deltas", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1e9 }),
        fc.array(fc.integer({ min: -1e8, max: 1e8 }), { maxLength: 20 }),
        (start, deltas) => {
          const steps = buildBridge(
            { label: "Budget", value: start },
            deltas.map((d, i) => ({ id: `c${i}`, label: `c${i}`, delta: d, favorable: d <= 0 })),
            "Actual",
            { favorableWhenPositive: false, maxSteps: 4 },
          );
          const end = steps[steps.length - 1]!;
          const last = steps[steps.length - 2]!;
          const sum = deltas.reduce((s, d) => s + d, 0);
          return end.to === start + sum && last.to === start + sum && steps.length <= 7;
        },
      ),
    );
  });
});

describe("runway", () => {
  it("divides cash by average burn", () => {
    expect(runwayMonths(12_000_000_00, [1_000_000_00, 1_000_000_00, 1_000_000_00])).toBe(12);
  });
  it("is null when not burning", () => {
    expect(runwayMonths(1_00, [-5_00, 0, 2_00])).toBeNull();
  });
});

describe("formatting", () => {
  it("formats table amounts", () => {
    expect(formatAmount(128_400_00)).toBe("128");
    expect(formatAmount(1_284_000_00)).toBe("1,284");
    expect(formatAmount(-1_284_000_00, { parens: true })).toBe("(1,284)");
    expect(formatAmount(-1_284_000_00)).toBe("−1,284");
    expect(formatAmount(0)).toBe("–");
  });
  it("formats compact currency and percents", () => {
    expect(formatCompactCurrency(12_400_000_00)).toBe("$12.4M");
    expect(formatCompactCurrency(840_000_00)).toBe("$840k");
    expect(formatSignedPct(0.1823)).toBe("+18.2%");
    expect(formatSignedPct(-0.04)).toBe("−4.0%");
    expect(formatSignedPct(null)).toBe("—");
  });
});

const small: LedgerData = {
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
  programs: [{ id: "p1", code: "TB-1", name: "TB-1", therapeuticArea: "Oncology", phase: "Phase 1" }],
  vendors: [],
  departments: [],
  transactions: [
    { id: "t1", date: "2026-01-10", categoryId: "cro", amount: 100_00, vendorId: null, departmentId: null, programId: "p1", memo: "", accountCode: "6100" },
    { id: "t2", date: "2026-01-12", categoryId: "lab", amount: 50_00, vendorId: null, departmentId: null, programId: null, memo: "", accountCode: "6200" },
    { id: "t3", date: "2026-02-03", categoryId: "ga", amount: 30_00, vendorId: null, departmentId: null, programId: null, memo: "", accountCode: "7000" },
    { id: "t4", date: "2026-02-20", categoryId: "grant", amount: 40_00, vendorId: null, departmentId: null, programId: null, memo: "", accountCode: "4000" },
  ],
  budget: [{ period: "2026-01", categoryId: "cro", programId: "p1", amount: 80_00 }],
  cash: [
    { period: "2026-01", balance: 1_000_00 },
    { period: "2026-02", balance: 900_00 },
  ],
};

describe("ledger", () => {
  const l = new Ledger(small);
  const periods = ["2026-01", "2026-02"];

  it("rolls leaves up to parents", () => {
    expect(l.actual({ periods, categoryIds: ["rd"] })).toBe(150_00);
    expect(l.actual({ periods, categoryIds: ["opex"] })).toBe(180_00);
    expect(l.actual({ periods: ["2026-01"], categoryIds: ["opex"] })).toBe(150_00);
  });

  it("filters by program", () => {
    expect(l.actual({ periods, categoryIds: ["rd"], programId: "p1" })).toBe(100_00);
    expect(l.actual({ periods, categoryIds: ["rd"], programId: null })).toBe(50_00);
  });

  it("computes net income", () => {
    expect(l.netIncome(periods)).toBe(40_00 - 180_00);
  });

  it("every parent in the tree equals the sum of its children", () => {
    const rows = l.tree(periods);
    for (const row of rows.filter((r) => r.hasChildren)) {
      const kids = rows.filter((r) => r.category.parentId === row.category.id);
      expect(kids.reduce((s, k) => s + k.variance.actual, 0)).toBe(row.variance.actual);
      expect(kids.reduce((s, k) => s + k.variance.comparison, 0)).toBe(row.variance.comparison);
    }
  });

  it("drill-down transactions sum to the cell total", () => {
    const f = { periods, categoryIds: ["rd"] };
    expect(l.transactionsFor(f).reduce((s, t) => s + t.amount, 0)).toBe(l.actual(f));
  });

  it("program totals sum to the category total", () => {
    const totals = l.programTotals(periods, ["opex"]);
    expect(totals.reduce((s, t) => s + t.variance.actual, 0)).toBe(l.actual({ periods, categoryIds: ["opex"] }));
  });
});
