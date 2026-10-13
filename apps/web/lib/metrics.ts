import {
  addMonths,
  computeVariance,
  formatCompactCurrency,
  formatSignedPct,
  isMaterial,
  periodLabel,
  runwayMonths,
  trailingPeriods,
  type Ledger,
  type Period,
  type Variance,
} from "@vantiq/domain";
import type { View } from "./view";

/** Shared calculations used by several screens, so they always agree. */

export function monthlyNetBurn(ledger: Ledger, period: Period): number {
  return -ledger.netIncome([period]);
}

export function runwayAt(ledger: Ledger, period: Period) {
  const cash = ledger.cashAt(period) ?? 0;
  const burns = trailingPeriods(period, 3)
    .filter((p) => p >= ledger.firstPeriod())
    .map((p) => monthlyNetBurn(ledger, p));
  const avgBurn = burns.reduce((s, b) => s + b, 0) / Math.max(1, burns.length);
  return { cash, avgBurn, months: runwayMonths(cash, burns) };
}

export interface AttentionItem {
  categoryId: string;
  name: string;
  parentName: string;
  variance: Variance;
}

/** Leaf lines whose variance is material for the view, largest first. */
export function materialLines(ledger: Ledger, view: View): AttentionItem[] {
  return ledger
    .tree(view.periods)
    .filter((r) => !r.hasChildren && isMaterial(r.variance))
    .sort((a, b) => Math.abs(b.variance.delta) - Math.abs(a.variance.delta))
    .map((r) => ({
      categoryId: r.category.id,
      name: r.category.name,
      parentName: r.category.parentId ? ledger.category(r.category.parentId).name : "",
      variance: r.variance,
    }));
}

/** "Operating expenses are 7.3% over budget in Sep 2026" */
export function findingTitle(subject: string, v: Variance, when: string, income = false): string {
  if (v.comparison === 0) return `${subject}: ${formatCompactCurrency(v.actual)} in ${when}`;
  const pct = formatSignedPct(v.deltaPct).replace(/^[+−]/, "");
  if (Math.abs(v.deltaPct ?? 0) < 0.005) return `${subject} ${verb(subject)} on budget in ${when}`;
  const dir = v.delta > 0 ? (income ? "ahead of" : "over") : income ? "behind" : "under";
  return `${subject} ${verb(subject)} ${pct} ${dir} budget in ${when}`;
}

function verb(subject: string): string {
  return subject.endsWith("s") ? "are" : "is";
}

export function trendPoints(ledger: Ledger, periods: Period[], categoryIds: string[], programId?: string | null) {
  return periods.map((p) => ({
    period: p,
    label: periodLabel(p, true),
    actual: ledger.actual({ periods: [p], categoryIds, programId }),
    budget: ledger.budget({ periods: [p], categoryIds, programId }),
  }));
}

export function varianceFor(ledger: Ledger, periods: Period[], categoryId: string, programId?: string | null): Variance {
  const f = { periods, categoryIds: [categoryId], programId };
  return computeVariance(ledger.actual(f), ledger.budget(f), ledger.category(categoryId).kind);
}

export function cashProjection(ledger: Ledger, view: View) {
  const { cash, avgBurn } = runwayAt(ledger, view.period);
  const history = view.trend.map((p) => ({ label: periodLabel(p, true) + " " + p.slice(2, 4), actual: ledger.cashAt(p), projected: null as number | null }));
  // Projection starts at today's balance so the lines join.
  const last = history[history.length - 1];
  if (last) last.projected = last.actual;
  let zeroLabel: string | null = null;
  if (avgBurn > 0) {
    let c = cash;
    for (let i = 1; i <= 36 && c > 0; i++) {
      c = Math.max(0, c - avgBurn);
      const p = addMonths(view.period, i);
      const label = periodLabel(p, true) + " " + p.slice(2, 4);
      history.push({ label, actual: null, projected: c });
      if (c === 0) zeroLabel = label;
    }
  }
  return { data: history, today: last?.label ?? "", zeroLabel };
}
