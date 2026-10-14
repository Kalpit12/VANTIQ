import type { Ledger } from "./ledger";
import { addMonths, periodLabel, trailingPeriods } from "./period";
import { formatCurrency } from "./format";
import type { Category, Cents, Period } from "./types";

/**
 * Forecasts and scenarios. A forecast never touches actuals: it starts the
 * month after the latest month in the books and reads the ledger only to get
 * a starting point for each line.
 *
 * Each leaf category is forecast on its own:
 * 1. The driver is the one set on that category or its nearest parent;
 *    with none set, revenue follows the budget and costs follow their run rate.
 * 2. The scenario then scales revenue and costs by its own percentages.
 * 3. A month set by hand replaces the result for that line and month.
 */

export type DriverMethod = "run_rate" | "budget" | "flat";

export const DRIVER_METHODS: { method: DriverMethod; label: string }[] = [
  { method: "run_rate", label: "Run rate" },
  { method: "budget", label: "Budget" },
  { method: "flat", label: "Fixed amount" },
];

export interface Driver {
  categoryId: string;
  method: DriverMethod;
  /** Monthly growth for run rate, as a fraction (0.02 = 2% a month). */
  growth: number;
  /** For a fixed amount: the monthly total for this category. */
  amount: Cents | null;
}

export interface ForecastOverride {
  period: Period;
  /** A leaf category. */
  categoryId: string;
  amount: Cents;
  note: string;
}

export type ScenarioKind = "base" | "upside" | "downside";

export interface Scenario {
  id: string;
  name: string;
  kind: ScenarioKind;
  /** Change applied to every revenue line, as a fraction (+0.15 = 15% more). */
  revenueChange: number;
  /** Change applied to every cost line, as a fraction (-0.05 = 5% less). */
  costChange: number;
  drivers: Driver[];
  overrides: ForecastOverride[];
}

/** The three scenarios every company starts with. */
export const DEFAULT_SCENARIOS: Pick<Scenario, "name" | "kind" | "revenueChange" | "costChange">[] = [
  { name: "Base", kind: "base", revenueChange: 0, costChange: 0 },
  { name: "Upside", kind: "upside", revenueChange: 0.15, costChange: -0.05 },
  { name: "Downside", kind: "downside", revenueChange: -0.25, costChange: 0.1 },
];

export const FORECAST_MONTHS = 12;
/** Months of actuals averaged for a run rate. */
export const RUN_RATE_MONTHS = 3;

export interface CellExplanation {
  value: Cents;
  steps: string[];
  overridden: boolean;
}

export interface Forecast {
  scenario: Scenario;
  /** The last month of actuals; the forecast starts the month after. */
  lastActual: Period;
  periods: Period[];
  /** Forecast for a leaf or parent category in one month (natural sign: spend and income both positive). */
  amount(categoryId: string, period: Period): Cents;
  total(categoryId: string): Cents;
  /** Income minus costs for the month. */
  netIncome(period: Period): Cents;
  /** Month-end cash, starting from the last actual month's cash. */
  cash(period: Period): Cents | null;
  explain(leafId: string, period: Period): CellExplanation;
  driverFor(categoryId: string): { driver: Driver; inherited: boolean; from: string | null };
}

const pct = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x * 1000) / 10}%`;

export function buildForecast(ledger: Ledger, scenario: Scenario, months = FORECAST_MONTHS): Forecast {
  const lastActual = ledger.latestPeriod();
  const periods = Array.from({ length: months }, (_, i) => addMonths(lastActual, i + 1));
  const history = trailingPeriods(lastActual, RUN_RATE_MONTHS).filter((p) => p >= ledger.firstPeriod());
  const byCat = new Map(scenario.drivers.map((d) => [d.categoryId, d]));
  const overrides = new Map(scenario.overrides.map((o) => [`${o.period}|${o.categoryId}`, o]));
  const hasBudget = new Set(ledger.data.budget.map((b) => b.period));

  const rootOf = (c: Category): Category => (c.parentId ? rootOf(ledger.category(c.parentId)) : c);
  const isRevenue = (c: Category) => rootOf(c).kind === "revenue";
  const baseline = (leafId: string) =>
    history.length ? ledger.actual({ periods: history, categoryIds: [leafId] }) / history.length : 0;

  function driverFor(categoryId: string) {
    let c: Category | null = ledger.category(categoryId);
    while (c) {
      const d = byCat.get(c.id);
      if (d) return { driver: d, inherited: c.id !== categoryId, from: c.id };
      c = c.parentId ? ledger.category(c.parentId) : null;
    }
    const revenue = isRevenue(ledger.category(categoryId));
    return { driver: { categoryId, method: revenue ? "budget" : "run_rate", growth: 0, amount: null } as Driver, inherited: true, from: null };
  }

  const cache = new Map<string, CellExplanation>();
  function explain(leafId: string, period: Period): CellExplanation {
    const k = `${period}|${leafId}`;
    const hit = cache.get(k);
    if (hit) return hit;
    const leaf = ledger.category(leafId);
    const i = periods.indexOf(period) + 1;
    const { driver, from } = driverFor(leafId);
    const base = baseline(leafId);
    const steps: string[] = [];
    const avgStep = `Average of ${history.map((p) => periodLabel(p, true)).join(", ")}: ${formatCurrency(Math.round(base))}`;
    let v: number;
    if (driver.method === "flat") {
      const owner = ledger.category(driver.categoryId);
      // Only the leaves this driver reaches: a leaf with its own driver is left out.
      const leaves = ledger.leavesOf(owner.id).filter((l) => driverFor(l).from === owner.id);
      const total = driver.amount ?? 0;
      const bases = leaves.map(baseline);
      const sum = bases.reduce((s, b) => s + b, 0);
      const share = leaves.length === 1 ? 1 : sum > 0 ? baseline(leafId) / sum : 1 / leaves.length;
      v = total * share;
      steps.push(leaves.length === 1 ? `Fixed at ${formatCurrency(total)} a month` : `${Math.round(share * 100)}% of ${owner.name}'s fixed ${formatCurrency(total)} a month, by its recent share`);
    } else if (driver.method === "budget" && hasBudget.has(period)) {
      v = ledger.budget({ periods: [period], categoryIds: [leafId] });
      steps.push(`Budget for ${periodLabel(period)}: ${formatCurrency(v)}`);
    } else {
      v = base * (1 + driver.growth) ** i;
      if (driver.method === "budget") steps.push(`No budget for ${periodLabel(period)}, so the run rate is used`);
      steps.push(avgStep);
      if (driver.growth) steps.push(`Grows ${pct(driver.growth)} a month for ${i} month${i === 1 ? "" : "s"}: ${formatCurrency(Math.round(v))}`);
    }
    if (from && from !== leafId) steps.push(`Driver set on ${ledger.category(from).name}`);
    const change = isRevenue(leaf) ? scenario.revenueChange : scenario.costChange;
    if (change) {
      v = v * (1 + change);
      steps.push(`${scenario.name}: ${isRevenue(leaf) ? "revenue" : "costs"} ${pct(change)}, giving ${formatCurrency(Math.round(v))}`);
    }
    let value = Math.round(v);
    const o = overrides.get(k);
    if (o) {
      value = o.amount;
      steps.push(`Set by hand to ${formatCurrency(o.amount)}${o.note ? `: ${o.note}` : ""}`);
    }
    const out = { value, steps, overridden: Boolean(o) };
    cache.set(k, out);
    return out;
  }

  const amount = (categoryId: string, period: Period) => ledger.leavesOf(categoryId).reduce((s, l) => s + explain(l, period).value, 0);
  const netIncome = (period: Period) =>
    ledger.childrenOf(null).reduce((s, root) => s + (root.kind === "revenue" ? 1 : -1) * amount(root.id, period), 0);
  const startCash = ledger.cashAt(lastActual);
  const cash = (period: Period) => {
    if (startCash === null) return null;
    const i = periods.indexOf(period);
    return periods.slice(0, i + 1).reduce((c, p) => c + netIncome(p), startCash);
  };
  return {
    scenario,
    lastActual,
    periods,
    amount,
    total: (id) => periods.reduce((s, p) => s + amount(id, p), 0),
    netIncome,
    cash,
    explain,
    driverFor,
  };
}

export interface ScenarioSummary {
  scenario: Scenario;
  revenue: Cents;
  costs: Cents;
  netIncome: Cents;
  endingCash: Cents | null;
  /** First forecast month that ends with cash below zero, if any. */
  zeroCash: Period | null;
}

export function summarizeForecast(ledger: Ledger, f: Forecast): ScenarioSummary {
  let revenue = 0;
  let costs = 0;
  for (const root of ledger.childrenOf(null)) {
    if (root.kind === "revenue") revenue += f.total(root.id);
    else costs += f.total(root.id);
  }
  const last = f.periods[f.periods.length - 1]!;
  return {
    scenario: f.scenario,
    revenue,
    costs,
    netIncome: revenue - costs,
    endingCash: f.cash(last),
    zeroCash: f.periods.find((p) => (f.cash(p) ?? 1) < 0) ?? null,
  };
}
