import { describe, expect, it } from "vitest";
import { billedForTrial, estimateAccrual, Ledger, ytdPeriods, isMaterial } from "@vantiq/domain";
import { generateSampleCompany, generateSampleTrials, SAMPLE_LAST_PERIOD, SAMPLE_TRIALS_AS_OF, type SampleTrial } from "../src";

describe("sample company", () => {
  const data = generateSampleCompany();
  const ledger = new Ledger(data);

  it("is deterministic", () => {
    expect(generateSampleCompany()).toEqual(data);
  });

  it("covers 24 months of cash", () => {
    expect(data.cash).toHaveLength(24);
    expect(ledger.latestPeriod()).toBe(SAMPLE_LAST_PERIOD);
  });

  it("has scripted material variances in the latest month", () => {
    const rows = ledger.tree([SAMPLE_LAST_PERIOD]).filter((r) => !r.hasChildren && isMaterial(r.variance));
    expect(rows.map((r) => r.category.id)).toContain("rd-cro");
  });

  it("reconciles: tree roots equal the sum of all transactions", () => {
    const periods = ytdPeriods(SAMPLE_LAST_PERIOD);
    const fromTree = ledger.tree(periods).filter((r) => r.depth === 0).reduce((s, r) => s + r.variance.actual, 0);
    const fromTxns = data.transactions.filter((t) => periods.some((p) => t.date.startsWith(p))).reduce((s, t) => s + t.amount, 0);
    expect(fromTree).toBe(fromTxns);
  });

  it("prints a summary", () => {
    const p = [SAMPLE_LAST_PERIOD];
    console.log({
      txns: data.transactions.length,
      opex: ledger.variance({ periods: p, categoryIds: ["opex"] }),
      cash: ledger.cashAt(SAMPLE_LAST_PERIOD),
    });
  });
});

describe("sample trials", () => {
  const ledger = new Ledger(generateSampleCompany());
  const billedFor = (t: SampleTrial) => billedForTrial(ledger.data, t);

  it("match the ledger's CROs and programs, and tell the two accrual stories", () => {
    const [meridian, atlas] = generateSampleTrials();
    const m = estimateAccrual(meridian!.contract, meridian!.activity, billedFor(meridian!), SAMPLE_TRIALS_AS_OF);
    const a = estimateAccrual(atlas!.contract, atlas!.activity, billedFor(atlas!), SAMPLE_TRIALS_AS_OF);
    // Meridian: change order 4 work ran ahead of billing.
    expect(m.accrual).toBeGreaterThan(500_000_00);
    expect(m.lines.every((l) => l.unitsOverContract === 0)).toBe(true);
    // Atlas: deferred start-up fees, and September not reported yet.
    expect(a.accrual).toBeGreaterThan(500_000_00);
    expect(a.estimatedPeriods).toEqual(["2026-09"]);
    // Earlier, before those events, both trials sat close to billing.
    expect(Math.abs(estimateAccrual(atlas!.contract, atlas!.activity, billedFor(atlas!), "2026-06").accrual)).toBeLessThan(150_000_00);
  });
});
