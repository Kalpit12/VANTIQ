import { describe, expect, it } from "vitest";
import { Ledger, ytdPeriods, isMaterial } from "@vantiq/domain";
import { generateSampleCompany, SAMPLE_LAST_PERIOD } from "../src";

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
