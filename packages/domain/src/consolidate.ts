import { periodOfDate } from "./period";
import type { BudgetLine, CashPoint, Category, CategoryKind, Cents, Period, Transaction } from "./types";
import type { LedgerData } from "./ledger";

/*
 * Multi-entity consolidation (architecture.md section 7, Phase 3).
 *
 * Each entity keeps its books in its own (functional) currency. To report the
 * group in one currency:
 *  1. Translate: income and expense lines at the month's average rate, cash
 *     at the month-end closing rate. Each line is rounded to the cent on its
 *     own (half away from zero, like Excel's ROUND), so every number can be
 *     traced back to a line, its original amount and the rate used.
 *  2. Eliminate: for each intercompany pair (an account in one entity that
 *     mirrors an account in another), the amount both sides agree on is
 *     removed from both, month by month. Whatever is left over stays where it
 *     was booked and the pair is flagged, so a timing or FX difference is
 *     visible instead of quietly disappearing. Net income never changes on
 *     elimination: equal amounts come off income on one side and cost on the
 *     other.
 * Rates are decimal strings (reporting currency per one unit of the entity's
 * currency) and all arithmetic is exact integer math on cents.
 */

export interface Entity {
  id: string;
  code: string;
  name: string;
  /** ISO 4217 code of the currency the entity keeps its books in. */
  currency: string;
  /** The parent company. Its currency is the group's reporting currency. */
  parent: boolean;
}

/** Units of the reporting currency for one unit of `currency`, for one month. */
export interface FxRate {
  period: Period;
  currency: string;
  /** Average rate for the month: used for income and expenses. */
  average: string;
  /** Month-end rate: used for balances such as cash. */
  closing: string;
}

/** `accountCode` in `entityId` mirrors `counterpartyAccountCode` in `counterpartyEntityId`. */
export interface IntercompanyPair {
  id: string;
  entityId: string;
  accountCode: string;
  counterpartyEntityId: string;
  counterpartyAccountCode: string;
}

/** One entity's books in its own currency, natural sign (see `Transaction`). */
export interface EntityBooks {
  entity: Entity;
  transactions: Transaction[];
  budget: BudgetLine[];
  cash: CashPoint[];
}

export interface RateIssue {
  currency: string;
  period: Period;
  kind: "average" | "closing";
  /** The month whose rate was used instead, or null when the currency has no rates at all (its amounts are left out). */
  usedPeriod: Period | null;
}

export interface PairSide {
  entityId: string;
  accountCode: string;
  currency: string;
  /** Natural-sign total in the entity's currency. */
  local: Cents;
  /** Natural-sign total in the reporting currency. */
  translated: Cents;
}

export type IntercompanyStatus = "matched" | "difference" | "one_sided";

export interface IntercompanyCheck {
  pairId: string;
  period: Period;
  basis: "actual" | "budget";
  side: PairSide;
  counterparty: PairSide;
  /** Amount removed from each side, in the reporting currency. */
  eliminated: Cents;
  /** Effect on group net income of what is left after elimination: zero when the two sides agree. */
  difference: Cents;
  status: IntercompanyStatus;
}

export interface EntityResult {
  entity: Entity;
  /** The entity's lines in the reporting currency, intercompany lines marked but not eliminated. */
  transactions: Transaction[];
  budget: BudgetLine[];
  cash: CashPoint[];
  /** Cash in the entity's own currency, as booked. */
  localCash: CashPoint[];
  /** False when the entity's currency has no rates, so none of its amounts could be translated. */
  translated: boolean;
}

export interface ConsolidationResult {
  reportingCurrency: string;
  entities: EntityResult[];
  /** Group lines after elimination; fully eliminated lines are left out. */
  transactions: Transaction[];
  budget: BudgetLine[];
  cash: CashPoint[];
  checks: IntercompanyCheck[];
  rateIssues: RateIssue[];
}

export interface ConsolidateOptions {
  reportingCurrency: string;
  categories: Category[];
  /** A pair whose two sides differ by more than this (cents) is flagged. Default $1, like the month-end check. */
  tolerance?: Cents;
}

/* ---------- exact decimal rates ---------- */

const RATE_DECIMALS = 10;
const RATE_SCALE = 10n ** BigInt(RATE_DECIMALS);
const RATE_RE = /^\d{1,12}(\.\d{1,10})?$/;

/** Parses a rate like "1.2734" into an integer scaled by 10^10. Throws on anything else. */
export function parseRate(rate: string): bigint {
  const s = rate.trim();
  if (!RATE_RE.test(s)) throw new Error(`Rate "${rate}" is not a positive decimal with at most ${RATE_DECIMALS} places.`);
  const [whole, frac = ""] = s.split(".");
  const scaled = BigInt(whole!) * RATE_SCALE + BigInt(frac.padEnd(RATE_DECIMALS, "0"));
  if (scaled === 0n) throw new Error("A rate can't be zero.");
  return scaled;
}

export function isValidRate(rate: string): boolean {
  try {
    parseRate(rate);
    return true;
  } catch {
    return false;
  }
}

/** Integer division rounded half away from zero (d > 0). */
function roundDiv(n: bigint, d: bigint): bigint {
  const q = n / d;
  const r = n % d;
  if (2n * (r < 0n ? -r : r) >= d) return q + (n < 0n ? -1n : 1n);
  return q;
}

function floorDiv(n: bigint, d: bigint): bigint {
  const q = n / d;
  return n % d !== 0n && n < 0n ? q - 1n : q;
}

/** `cents` × `rate`, rounded to the cent half away from zero. */
export function translateAmount(cents: Cents, rate: string): Cents {
  return Number(roundDiv(BigInt(cents) * parseRate(rate), RATE_SCALE));
}

/**
 * The smallest amount in the entity's currency that translates to exactly
 * `target` at `rate`. Exists for every target when the rate is below 1; above
 * 1 some targets fall between two cents and the nearest is returned.
 */
export function inverseTranslate(target: Cents, rate: string): Cents {
  const r = parseRate(rate);
  let x = roundDiv(BigInt(target) * RATE_SCALE, r);
  const t = (v: bigint) => roundDiv(v * r, RATE_SCALE);
  while (t(x) > BigInt(target)) x -= 1n;
  while (t(x) < BigInt(target)) x += 1n;
  while (t(x - 1n) === BigInt(target)) x -= 1n;
  return Number(x);
}

/**
 * Splits `total` across lines in proportion to `amounts` (largest remainder),
 * so the parts add up to `total` exactly. `total` has the sign of the sum and
 * is no larger than it.
 */
export function allocate(amounts: Cents[], total: Cents): Cents[] {
  const sum = amounts.reduce((s, a) => s + a, 0);
  if (sum === 0 || total === 0) return amounts.map(() => 0);
  if (total === sum) return [...amounts];
  const flip = sum < 0 ? -1n : 1n;
  const den = BigInt(sum) * flip;
  const parts = amounts.map((a, i) => {
    const num = BigInt(a) * BigInt(total) * flip;
    const q = floorDiv(num, den);
    return { i, q, rem: num - q * den };
  });
  let short = BigInt(total) - parts.reduce((s, p) => s + p.q, 0n);
  const step = short >= 0n ? 1n : -1n;
  const order = [...parts].sort((a, b) => (step > 0n ? Number(b.rem - a.rem) : Number(a.rem - b.rem)) || a.i - b.i);
  for (const p of order) {
    if (short === 0n) break;
    p.q += step;
    short -= step;
  }
  return parts.map((p) => Number(p.q));
}

/* ---------- rate lookup ---------- */

class Rates {
  private readonly byCurrency = new Map<string, Map<Period, FxRate>>();
  readonly issues = new Map<string, RateIssue>();

  constructor(
    rates: FxRate[],
    private readonly reporting: string,
  ) {
    for (const r of rates) {
      parseRate(r.average);
      parseRate(r.closing);
      const m = this.byCurrency.get(r.currency) ?? new Map<Period, FxRate>();
      m.set(r.period, r);
      this.byCurrency.set(r.currency, m);
    }
  }

  has(currency: string) {
    return currency === this.reporting || (this.byCurrency.get(currency)?.size ?? 0) > 0;
  }

  /** The rate for the month, or the nearest earlier month's (then later) when it is missing. */
  get(currency: string, period: Period, kind: "average" | "closing"): string | null {
    if (currency === this.reporting) return "1";
    const m = this.byCurrency.get(currency);
    const exact = m?.get(period);
    if (exact) return exact[kind];
    const months = m ? [...m.keys()].sort() : [];
    const earlier = months.filter((p) => p < period).at(-1);
    const used = earlier ?? months.find((p) => p > period) ?? null;
    const key = `${currency}|${period}|${kind}`;
    if (!this.issues.has(key)) this.issues.set(key, { currency, period, kind, usedPeriod: used });
    return used ? m!.get(used)![kind] : null;
  }
}

/* ---------- consolidation ---------- */

export function consolidate(books: EntityBooks[], fx: FxRate[], pairs: IntercompanyPair[], opts: ConsolidateOptions): ConsolidationResult {
  const tolerance = opts.tolerance ?? 100;
  const kind = new Map<string, CategoryKind>(opts.categories.map((c) => [c.id, c.kind]));
  const niSign = (categoryId: string) => (kind.get(categoryId) === "revenue" ? 1 : -1);
  const rates = new Rates(fx, opts.reportingCurrency);
  const entityIds = new Set(books.map((b) => b.entity.id));
  const currencyOf = new Map(books.map((b) => [b.entity.id, b.entity.currency]));

  // Each (entity, account) may sit in only one pair, on one side.
  const sideOf = new Map<string, { pair: IntercompanyPair; counterpartyEntityId: string }>();
  for (const p of pairs) {
    if (p.entityId === p.counterpartyEntityId) throw new Error(`Intercompany pair ${p.id} pairs an entity with itself.`);
    for (const [e, a, other] of [
      [p.entityId, p.accountCode, p.counterpartyEntityId],
      [p.counterpartyEntityId, p.counterpartyAccountCode, p.entityId],
    ] as const) {
      if (!entityIds.has(e)) throw new Error(`Intercompany pair ${p.id} names an unknown entity.`);
      const k = `${e}|${a}`;
      if (sideOf.has(k)) throw new Error(`Account ${a} is in more than one intercompany pair for the same entity.`);
      sideOf.set(k, { pair: p, counterpartyEntityId: other });
    }
  }

  // 1. Translate each entity.
  const entities: EntityResult[] = [...books]
    .sort((a, b) => Number(b.entity.parent) - Number(a.entity.parent) || a.entity.code.localeCompare(b.entity.code))
    .map((b) => {
      const cur = b.entity.currency;
      const translated = rates.has(cur);
      const isLocal = cur === opts.reportingCurrency;
      const money = (amount: Cents, rate: string | null) => (isLocal ? amount : translateAmount(amount, rate!));
      if (!translated) {
        // Record the gap once per month so the screens can say which rates to add.
        for (const p of new Set(b.transactions.map((t) => periodOfDate(t.date)))) rates.get(cur, p, "average");
        for (const c of b.cash) rates.get(cur, c.period, "closing");
        return { entity: b.entity, transactions: [], budget: [], cash: [], localCash: b.cash, translated: false };
      }
      const transactions = b.transactions.map((t) => {
        const rate = rates.get(cur, periodOfDate(t.date), "average");
        const out: Transaction = { ...t, amount: money(t.amount, rate), entityId: b.entity.id };
        if (!isLocal) out.original = { amount: t.amount, currency: cur, rate: rate! };
        const ic = sideOf.get(`${b.entity.id}|${t.accountCode}`);
        if (ic) out.intercompany = { pairId: ic.pair.id, counterpartyEntityId: ic.counterpartyEntityId, eliminated: 0 };
        return out;
      });
      // Budgets are plans: shown in the reporting currency only, at the month's average rate.
      const budget = b.budget.map((l) => ({ ...l, amount: money(l.amount, rates.get(cur, l.period, "average")), entityId: b.entity.id }));
      const cash = b.cash.map((c) => ({ period: c.period, balance: money(c.balance, rates.get(cur, c.period, "closing")) }));
      return { entity: b.entity, transactions, budget, cash, localCash: b.cash, translated };
    });

  // 2. Eliminate, pair by pair and month by month.
  const checks: IntercompanyCheck[] = [];
  const eliminatedTxn = new Map<Transaction, Cents>();
  const eliminatedBudget = new Map<BudgetLine, Cents>();

  const eliminate = <T extends { amount: Cents; categoryId: string; accountCode?: string; entityId?: string }>(
    basis: "actual" | "budget",
    lines: T[],
    periodOf: (x: T) => Period,
    localOf: (x: T) => Cents,
    out: Map<T, Cents>,
  ) => {
    const groups = new Map<string, T[]>();
    for (const l of lines) {
      if (!l.accountCode || !l.entityId || !sideOf.has(`${l.entityId}|${l.accountCode}`)) continue;
      const k = `${l.entityId}|${l.accountCode}|${periodOf(l)}`;
      const g = groups.get(k) ?? [];
      g.push(l);
      groups.set(k, g);
    }
    const periods = new Set([...groups.keys()].map((k) => k.split("|")[2]!));
    for (const pair of pairs) {
      for (const period of [...periods].sort()) {
        const a = groups.get(`${pair.entityId}|${pair.accountCode}|${period}`) ?? [];
        const b = groups.get(`${pair.counterpartyEntityId}|${pair.counterpartyAccountCode}|${period}`) ?? [];
        if (!a.length && !b.length) continue;
        const sum = (xs: T[]) => xs.reduce((s, x) => s + x.amount, 0);
        const side = (entityId: string, accountCode: string, xs: T[]): PairSide => ({
          entityId,
          accountCode,
          currency: currencyOf.get(entityId)!,
          local: xs.reduce((s, x) => s + localOf(x), 0),
          translated: sum(xs),
        });
        const sa = sum(a);
        const sb = sum(b);
        // Effect of each side on group net income.
        const na = a.length ? niSign(a[0]!.categoryId) * sa : 0;
        const nb = b.length ? niSign(b[0]!.categoryId) * sb : 0;
        const matched = na !== 0 && nb !== 0 && Math.sign(na) !== Math.sign(nb) ? Math.min(Math.abs(na), Math.abs(nb)) : 0;
        if (matched) {
          for (const [xs, s] of [
            [a, sa],
            [b, sb],
          ] as const) {
            const parts = allocate(
              xs.map((x) => x.amount),
              Math.sign(s) * matched,
            );
            xs.forEach((x, i) => out.set(x, parts[i]!));
          }
        }
        const difference = na + nb;
        checks.push({
          pairId: pair.id,
          period,
          basis,
          side: side(pair.entityId, pair.accountCode, a),
          counterparty: side(pair.counterpartyEntityId, pair.counterpartyAccountCode, b),
          eliminated: matched,
          difference,
          status: Math.abs(difference) <= tolerance ? "matched" : !a.length || !b.length || sa === 0 || sb === 0 ? "one_sided" : "difference",
        });
      }
    }
  };

  const allTxns = entities.flatMap((e) => e.transactions);
  const allBudget = entities.flatMap((e) => e.budget);
  eliminate("actual", allTxns, (t) => periodOfDate(t.date), (t) => t.original?.amount ?? t.amount, eliminatedTxn);
  const localBudget = new Map<BudgetLine, Cents>();
  for (const b of books) {
    const translated = entities.find((e) => e.entity.id === b.entity.id)!.budget;
    if (translated.length) b.budget.forEach((l, i) => localBudget.set(translated[i]!, l.amount));
  }
  eliminate("budget", allBudget, (l) => l.period, (l) => localBudget.get(l) ?? l.amount, eliminatedBudget);

  const transactions: Transaction[] = [];
  for (const t of allTxns) {
    const e = eliminatedTxn.get(t) ?? 0;
    if (!t.intercompany) transactions.push(t);
    else if (t.amount - e !== 0) transactions.push({ ...t, amount: t.amount - e, intercompany: { ...t.intercompany, eliminated: e } });
  }
  const budget: BudgetLine[] = [];
  for (const l of allBudget) {
    const e = eliminatedBudget.get(l) ?? 0;
    if (l.amount - e !== 0) budget.push(e ? { ...l, amount: l.amount - e } : l);
  }
  const cashBy = new Map<Period, Cents>();
  for (const e of entities) for (const c of e.cash) cashBy.set(c.period, (cashBy.get(c.period) ?? 0) + c.balance);
  const cash = [...cashBy].sort(([a], [b]) => a.localeCompare(b)).map(([period, balance]) => ({ period, balance }));

  checks.sort((x, y) => x.basis.localeCompare(y.basis) || x.period.localeCompare(y.period) || x.pairId.localeCompare(y.pairId));
  const rateIssues = [...rates.issues.values()].sort((a, b) => a.currency.localeCompare(b.currency) || a.period.localeCompare(b.period) || a.kind.localeCompare(b.kind));
  return { reportingCurrency: opts.reportingCurrency, entities, transactions, budget, cash, checks, rateIssues };
}

/** The group as one `LedgerData`, so every screen reads consolidated numbers through the same `Ledger`. */
export function consolidatedLedgerData(base: Omit<LedgerData, "transactions" | "budget" | "cash">, result: ConsolidationResult): LedgerData {
  return { ...base, currency: result.reportingCurrency, transactions: result.transactions, budget: result.budget, cash: result.cash };
}

/** One entity on its own, in the reporting currency, with nothing eliminated. */
export function entityLedgerData(base: Omit<LedgerData, "transactions" | "budget" | "cash">, result: ConsolidationResult, entityId: string): LedgerData {
  const e = result.entities.find((x) => x.entity.id === entityId);
  if (!e) throw new Error(`Unknown entity ${entityId}`);
  return { ...base, currency: result.reportingCurrency, transactions: e.transactions, budget: e.budget, cash: e.cash };
}

/** Pairs flagged for the month: what the close team needs to look at. */
export function intercompanyFlags(result: ConsolidationResult, period: Period): IntercompanyCheck[] {
  return result.checks.filter((c) => c.basis === "actual" && c.period === period && c.status !== "matched");
}
