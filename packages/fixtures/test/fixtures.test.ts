import { describe, expect, it } from "vitest";
import { consolidate, type Transaction, billedForTrial, CLOSE_TEMPLATE, expiryBuckets, estimateAccrual, Ledger, receivedFor, scheduleStatus, taskStatus, ytdPeriods, isMaterial } from "@vantiq/domain";
import { generateSampleClose, generateSampleCompany, generateSampleGroup, SAMPLE_IC_MISMATCH, generateSampleIncome, generateSampleInventory, generateSampleTrials, SAMPLE_CLOSE_TODAY, SAMPLE_LAST_PERIOD, SAMPLE_TRIALS_AS_OF, type SampleTrial } from "../src";

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

describe("sample inventory", () => {
  it("has one expired lot, one the trial can't use up, and a write-off from each basis", () => {
    const { rows, summary } = expiryBuckets(generateSampleInventory(), "2026-09");
    expect(summary.total).toBe(1_011_700_00);
    expect(summary.writeOff).toBe(193_975_00);
    expect(rows.find((r) => r.batch.lot === "DP-2311")).toMatchObject({ bucket: "expired", basis: "expired" });
    expect(rows.find((r) => r.batch.lot === "DP-2402")).toMatchObject({ bucket: "0-3", basis: "usage", unusedUnits: 420 });
    expect(rows.find((r) => r.batch.lot === "DP-2405")).toMatchObject({ bucket: "6-12", usedFromEarlierLots: 480, usedBeforeExpiry: 1440, writeOff: 64_800_00 });
    expect(rows.find((r) => r.batch.lot === "RS-118")).toMatchObject({ basis: "policy", writeOff: 15_000_00 });
    expect(summary.byProduct[0]).toMatchObject({ product: "HX-204 drug product 50 mg", atRisk: 511_200_00 });
  });
});

describe("sample group", () => {
  const group = generateSampleGroup();
  const company = generateSampleCompany();
  const result = consolidate(group.books, group.fx, group.pairs, { reportingCurrency: "USD", categories: company.categories });
  const strip = (t: Transaction) => ({ id: t.id, date: t.date, categoryId: t.categoryId, amount: t.amount, vendorId: t.vendorId, departmentId: t.departmentId, programId: t.programId, memo: t.memo, accountCode: t.accountCode });

  it("consolidates back to the single-company sample, plus August's unmatched intercompany difference", () => {
    const flags = result.checks.filter((c) => c.status !== "matched");
    expect(flags.map((c) => `${c.basis} ${c.pairId} ${c.period} ${c.status}`)).toEqual([`actual ic-research ${SAMPLE_IC_MISMATCH} difference`]);
    const external = result.transactions.filter((t) => !t.intercompany);
    expect(external.map(strip).sort((a, b) => a.id.localeCompare(b.id))).toEqual([...company.transactions].sort((a, b) => a.id.localeCompare(b.id)));
    const left = result.transactions.filter((t) => t.intercompany);
    expect(left).toHaveLength(1);
    // Canada's invoice is worth more at August's rate than the parent booked: the extra stays as income.
    expect([left[0]!.categoryId, left[0]!.amount]).toEqual(["rev-collab", flags[0]!.difference]);
    expect(result.rateIssues).toEqual([]);
  });

  it("consolidates the budget and cash exactly", () => {
    const sum = (xs: { period: string; categoryId: string; programId: string | null; amount: number }[]) => {
      const m = new Map<string, number>();
      for (const x of xs) m.set(`${x.period}|${x.categoryId}|${x.programId}`, (m.get(`${x.period}|${x.categoryId}|${x.programId}`) ?? 0) + x.amount);
      return m;
    };
    expect(sum(result.budget)).toEqual(sum(company.budget));
    expect(result.cash).toEqual(company.cash);
  });

  it("puts each program in its entity and books each subsidiary in its own currency", () => {
    const au = result.entities.find((e) => e.entity.id === "e-au")!;
    expect(new Set(au.transactions.filter((t) => !t.intercompany).map((t) => t.programId))).toEqual(new Set(["hx204"]));
    expect(au.transactions.every((t) => t.original?.currency === "AUD")).toBe(true);
    // Every AUD line is bigger in AUD than in USD.
    expect(au.transactions.every((t) => Math.abs(t.original!.amount) >= Math.abs(t.amount))).toBe(true);
  });
});
