import { describe, expect, it } from "vitest";
import { billedForTrial, CLOSE_TEMPLATE, estimateAccrual, Ledger, receivedFor, scheduleStatus, taskStatus, ytdPeriods, isMaterial } from "@vantiq/domain";
import { generateSampleClose, generateSampleCompany, generateSampleIncome, generateSampleTrials, SAMPLE_CLOSE_TODAY, SAMPLE_LAST_PERIOD, SAMPLE_TRIALS_AS_OF, type SampleTrial } from "../src";

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

describe("sample close", () => {
  it("covers the standard checklist part way through, with comments on real tasks and lines", () => {
    const { tasks, comments } = generateSampleClose();
    for (const t of CLOSE_TEMPLATE) expect(tasks.some((x) => x.key === t.key)).toBe(true);
    const statuses = tasks.map((t) => taskStatus(t, {}));
    expect(statuses).toContain("done");
    expect(statuses).toContain("prepared");
    expect(statuses).toContain("open");
    const keys = new Set(tasks.map((t) => `task:${t.key}`));
    const ledger = new Ledger(generateSampleCompany());
    for (const c of comments) expect(keys.has(c.anchor) || ledger.category(c.anchor.slice(5)) !== undefined).toBe(true);
    // Nothing is stamped after the demo's "today".
    for (const t of tasks) for (const at of [t.preparedAt, t.reviewedAt]) if (at) expect(at.slice(0, 10) <= SAMPLE_CLOSE_TODAY).toBe(true);
    for (const c of comments) expect(c.at.slice(0, 10) <= SAMPLE_CLOSE_TODAY).toBe(true);
  });
});

describe("sample income", () => {
  it("matches the sample ledger: grant drawn on time, Novagen's milestone late, Kairo's fee overdue", () => {
    const data = generateSampleCompany();
    const [nih, novagen, kairo] = generateSampleIncome().map((s) => scheduleStatus(s, receivedFor(data, s), SAMPLE_LAST_PERIOD));
    expect(nih!.filter((r) => r.status === "received")).toHaveLength(8);
    expect(nih!.filter((r) => r.status === "received").every((r) => r.monthsLate === 0)).toBe(true);
    expect(novagen!.find((r) => r.id === "nov-2")).toMatchObject({ status: "received", monthsLate: 2 });
    expect(kairo!.find((r) => r.id === "kai-1")).toMatchObject({ status: "overdue" });
  });
});
