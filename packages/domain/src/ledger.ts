import { periodOfDate } from "./period";
import type { BudgetLine, CashPoint, Category, Cents, Period, Program, Transaction, Vendor, Department } from "./types";
import { computeVariance, type Variance } from "./variance";

export interface LedgerData {
  companyName: string;
  currency: string;
  categories: Category[];
  programs: Program[];
  vendors: Vendor[];
  departments: Department[];
  transactions: Transaction[];
  budget: BudgetLine[];
  cash: CashPoint[];
}

export interface Filter {
  periods: Period[];
  /** Category ids; a parent id includes all of its descendants. */
  categoryIds?: string[];
  programId?: string | null;
}

export interface TreeRow {
  category: Category;
  depth: number;
  hasChildren: boolean;
  variance: Variance;
}

/** Sentinel for "no program" when grouping by program. */
export const UNASSIGNED = "__unassigned__";

/**
 * Read model over one company's mapped ledger. Totals are precomputed per
 * (period, leaf category, program) so every screen and chart reads the same
 * numbers from the same place.
 */
export class Ledger {
  readonly data: LedgerData;
  private readonly byId = new Map<string, Category>();
  private readonly children = new Map<string | null, Category[]>();
  private readonly leafCache = new Map<string, string[]>();
  /** key: period|categoryId|programId */
  private readonly actuals = new Map<string, Cents>();
  private readonly budgets = new Map<string, Cents>();

  constructor(data: LedgerData) {
    this.data = data;
    for (const c of data.categories) {
      this.byId.set(c.id, c);
      const list = this.children.get(c.parentId) ?? [];
      list.push(c);
      this.children.set(c.parentId, list);
    }
    for (const list of this.children.values()) list.sort((a, b) => a.order - b.order);
    for (const t of data.transactions) {
      if (!this.byId.has(t.categoryId)) throw new Error(`Transaction ${t.id} has unknown category ${t.categoryId}`);
      const k = key(periodOfDate(t.date), t.categoryId, t.programId);
      this.actuals.set(k, (this.actuals.get(k) ?? 0) + t.amount);
    }
    for (const b of data.budget) {
      const k = key(b.period, b.categoryId, b.programId);
      this.budgets.set(k, (this.budgets.get(k) ?? 0) + b.amount);
    }
  }

  category(id: string): Category {
    const c = this.byId.get(id);
    if (!c) throw new Error(`Unknown category ${id}`);
    return c;
  }

  childrenOf(id: string | null): Category[] {
    return this.children.get(id) ?? [];
  }

  /** Leaf category ids under `id` (or `[id]` when it is a leaf). */
  leavesOf(id: string): string[] {
    const cached = this.leafCache.get(id);
    if (cached) return cached;
    const kids = this.childrenOf(id);
    const out = kids.length === 0 ? [id] : kids.flatMap((k) => this.leavesOf(k.id));
    this.leafCache.set(id, out);
    return out;
  }

  /** Category ids of a given kind at the top of the tree. */
  rootsOfKind(kind: Category["kind"]): Category[] {
    return this.childrenOf(null).filter((c) => c.kind === kind);
  }

  actual(f: Filter): Cents {
    return this.sum(this.actuals, f);
  }

  budget(f: Filter): Cents {
    return this.sum(this.budgets, f);
  }

  variance(f: Filter): Variance {
    const kind = f.categoryIds?.[0] ? this.category(f.categoryIds[0]).kind : "opex";
    return computeVariance(this.actual(f), this.budget(f), kind);
  }

  /** Flattened category tree with actual vs budget for each node. */
  tree(periods: Period[], programId?: string | null): TreeRow[] {
    const rows: TreeRow[] = [];
    const walk = (cats: Category[], depth: number) => {
      for (const c of cats) {
        const f: Filter = { periods, categoryIds: [c.id], programId };
        rows.push({
          category: c,
          depth,
          hasChildren: this.childrenOf(c.id).length > 0,
          variance: computeVariance(this.actual(f), this.budget(f), c.kind),
        });
        walk(this.childrenOf(c.id), depth + 1);
      }
    };
    walk(this.childrenOf(null), 0);
    return rows;
  }

  /** Total income minus total costs for the periods (negative = net loss). */
  netIncome(periods: Period[]): Cents {
    let income = 0;
    let costs = 0;
    for (const root of this.childrenOf(null)) {
      const v = this.actual({ periods, categoryIds: [root.id] });
      if (root.kind === "revenue") income += v;
      else costs += v;
    }
    return income - costs;
  }

  /** Program ids that have any actual or budget amount, plus unassigned. */
  programTotals(periods: Period[], categoryIds: string[]): { programId: string; variance: Variance }[] {
    const ids = [...this.data.programs.map((p) => p.id), UNASSIGNED];
    return ids.map((id) => {
      const f: Filter = { periods, categoryIds, programId: id === UNASSIGNED ? null : id };
      return { programId: id, variance: computeVariance(this.actual(f), this.budget(f), "opex") };
    });
  }

  transactionsFor(f: Filter): Transaction[] {
    const leaves = f.categoryIds ? new Set(f.categoryIds.flatMap((id) => this.leavesOf(id))) : null;
    const periods = new Set(f.periods);
    return this.data.transactions
      .filter(
        (t) =>
          periods.has(periodOfDate(t.date)) &&
          (!leaves || leaves.has(t.categoryId)) &&
          (f.programId === undefined || t.programId === f.programId),
      )
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }

  cashAt(period: Period): Cents | null {
    return this.data.cash.find((c) => c.period === period)?.balance ?? null;
  }

  latestPeriod(): Period {
    const periods = this.data.cash.map((c) => c.period).sort();
    const last = periods[periods.length - 1];
    if (!last) throw new Error("Ledger has no cash data");
    return last;
  }

  firstPeriod(): Period {
    const periods = this.data.cash.map((c) => c.period).sort();
    const first = periods[0];
    if (!first) throw new Error("Ledger has no cash data");
    return first;
  }

  private sum(map: Map<string, Cents>, f: Filter): Cents {
    const leaves = f.categoryIds
      ? [...new Set(f.categoryIds.flatMap((id) => this.leavesOf(id)))]
      : this.data.categories.filter((c) => this.childrenOf(c.id).length === 0).map((c) => c.id);
    const programs: (string | null)[] =
      f.programId === undefined ? [...this.data.programs.map((p) => p.id), null] : [f.programId];
    let total = 0;
    for (const p of f.periods) for (const c of leaves) for (const pr of programs) total += map.get(key(p, c, pr)) ?? 0;
    return total;
  }
}

function key(period: Period, categoryId: string, programId: string | null): string {
  return `${period}|${categoryId}|${programId ?? ""}`;
}
