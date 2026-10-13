import { addMonths, computeVariance, periodOfDate, rangeLabel, UNASSIGNED, type Cents, type Ledger, type Period, type Variance } from "@vantiq/domain";

/**
 * Everything a draft explanation may draw on for one variance line: the
 * numbers, how each program contributed, and the transactions behind it. The
 * same context feeds the rule-based drafter and Claude, and it is the only
 * company data Claude sees (architecture.md 8.2, grounding).
 */

export interface ContextTransaction {
  id: string;
  date: string;
  vendor: string;
  program: string;
  memo: string;
  /** Natural sign: positive spend (or income), negative credits. */
  amount: Cents;
  /** True when this kind of entry is rare for the line: seen in at most 3 of the prior 12 months. */
  unusual: boolean;
}

export interface ProgramSplit {
  programId: string | null;
  program: string;
  variance: Variance;
}

export interface VarianceContext {
  categoryId: string;
  category: string;
  parent: string;
  kind: "revenue" | "cogs" | "opex" | "other";
  periods: Period[];
  periodLabel: string;
  variance: Variance;
  /** The same line in each of the three months before the window. */
  prior: { period: Period; actual: Cents; budget: Cents }[];
  programs: ProgramSplit[];
  /** Largest first, capped at 40. */
  transactions: ContextTransaction[];
}

/** Memo with numbers removed, so "invoice 1043" and "invoice 1187" count as the same kind of entry. */
const pattern = (vendor: string, memo: string) => `${vendor}|${memo.replace(/[0-9]+/g, "#").toLowerCase()}`;

export function buildVarianceContext(ledger: Ledger, categoryId: string, periods: Period[]): VarianceContext {
  const cat = ledger.category(categoryId);
  const f = { periods, categoryIds: [categoryId] };
  const vendors = new Map(ledger.data.vendors.map((v) => [v.id, v.name]));
  const programs = new Map(ledger.data.programs.map((p) => [p.id, p.code]));

  // How often each kind of entry appeared in the 12 months before the window.
  const first = periods[0]!;
  const history = Array.from({ length: 12 }, (_, i) => addMonths(first, -(i + 1)));
  const monthsSeen = new Map<string, Set<Period>>();
  for (const t of ledger.transactionsFor({ periods: history, categoryIds: [categoryId] })) {
    const k = pattern(t.vendorId ?? "", t.memo);
    const set = monthsSeen.get(k) ?? new Set<Period>();
    set.add(periodOfDate(t.date));
    monthsSeen.set(k, set);
  }

  const txns = ledger.transactionsFor(f).slice(0, 40);
  const split: ProgramSplit[] = [...ledger.data.programs.map((p) => p.id), UNASSIGNED]
    .map((id) => {
      const pf = { ...f, programId: id === UNASSIGNED ? null : id };
      return { programId: id === UNASSIGNED ? null : id, program: id === UNASSIGNED ? "No program" : programs.get(id)!, variance: computeVariance(ledger.actual(pf), ledger.budget(pf), cat.kind) };
    })
    .filter((p) => p.variance.actual !== 0 || p.variance.comparison !== 0)
    .sort((a, b) => Math.abs(b.variance.delta) - Math.abs(a.variance.delta));

  return {
    categoryId,
    category: cat.name,
    parent: cat.parentId ? ledger.category(cat.parentId).name : "",
    kind: cat.kind,
    periods,
    periodLabel: rangeLabel(periods),
    variance: ledger.variance(f),
    prior: [3, 2, 1].map((n) => {
      const p = addMonths(first, -n);
      return { period: p, actual: ledger.actual({ periods: [p], categoryIds: [categoryId] }), budget: ledger.budget({ periods: [p], categoryIds: [categoryId] }) };
    }),
    programs: split,
    transactions: txns.map((t) => ({
      id: t.id,
      date: t.date,
      vendor: (t.vendorId && vendors.get(t.vendorId)) || "",
      program: (t.programId && programs.get(t.programId)) || "",
      memo: t.memo,
      amount: t.amount,
      unusual: (monthsSeen.get(pattern(t.vendorId ?? "", t.memo))?.size ?? 0) <= 3,
    })),
  };
}
