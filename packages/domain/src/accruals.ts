import { addMonths, periodRange } from "./period";
import type { LedgerData } from "./ledger";
import type { Cents, Period } from "./types";

/**
 * Clinical trial accruals (architecture.md 7, `estimateAccrual`).
 *
 * A CRO contract prices the work by activity drivers: a monthly management
 * fee, a fee per site activated, per patient enrolled and per patient visit.
 * Work done to date is each driver's completed units times its unit cost,
 * never more than the units contracted. The accrual is work done minus what
 * the CRO has billed: positive means unbilled work (a liability to book),
 * negative means billing ran ahead of the work (a prepayment).
 */

export type AccrualDriver = "monthly" | "site" | "patient" | "visit";

export const DRIVERS: { driver: AccrualDriver; label: string; unit: string }[] = [
  { driver: "monthly", label: "Study management", unit: "months" },
  { driver: "site", label: "Site activation", unit: "sites" },
  { driver: "patient", label: "Patient enrollment", unit: "patients" },
  { driver: "visit", label: "Patient visits", unit: "visits" },
];

export interface ContractItem {
  driver: AccrualDriver;
  unitCost: Cents;
  units: number;
}

/** Adds units to the contract from `effective` on, at its own unit costs. */
export interface ChangeOrder {
  number: number;
  effective: Period;
  description: string;
  items: ContractItem[];
}

/** New activity the CRO reported for one month (not cumulative). */
export interface TrialActivity {
  period: Period;
  sites: number;
  patients: number;
  visits: number;
}

export interface TrialContract {
  /** First month the management fee runs. */
  start: Period;
  items: ContractItem[];
  changeOrders: ChangeOrder[];
}

export interface AccrualLine {
  driver: AccrualDriver;
  label: string;
  unit: string;
  contractedUnits: number;
  unitsToDate: number;
  /** Units beyond what is contracted: work done that no contract line pays for yet. */
  unitsOverContract: number;
  earned: Cents;
  /** Average unit cost of the units earned so far; the contract's rate when none are. */
  unitCost: Cents;
}

export interface AccrualPoint {
  period: Period;
  contractValue: Cents;
  earned: Cents;
  billed: Cents;
}

export interface AccrualEstimate {
  asOf: Period;
  contractValue: Cents;
  earned: Cents;
  billed: Cents;
  /** earned − billed */
  accrual: Cents;
  /** Share of the contract value earned, 0..1. */
  pctComplete: number;
  lines: AccrualLine[];
  /** Months with no CRO report, filled from the trailing average of the last three reports. */
  estimatedPeriods: Period[];
  lastReported: Period | null;
  /** Cumulative month by month from the contract start to `asOf`. */
  curve: AccrualPoint[];
}

const ACTIVITY_KEY: Record<Exclude<AccrualDriver, "monthly">, keyof Omit<TrialActivity, "period">> = { site: "sites", patient: "patients", visit: "visits" };

/** Contract lines in force at `period`: the base contract plus change orders effective by then, in order. */
export function itemsInForce(contract: TrialContract, period: Period): ContractItem[] {
  const cos = [...contract.changeOrders].filter((c) => c.effective <= period).sort((a, b) => a.effective.localeCompare(b.effective) || a.number - b.number);
  return [...contract.items, ...cos.flatMap((c) => c.items)];
}

export function contractValue(contract: TrialContract, period: Period): Cents {
  return itemsInForce(contract, period).reduce((s, i) => s + i.unitCost * i.units, 0);
}

/**
 * Fills units into the contract lines for one driver in order (base contract
 * first, then change orders), so units beyond the base are priced at the
 * change order's rate. Returns the amount earned and any units left over.
 */
function priceUnits(items: ContractItem[], units: number): { earned: Cents; over: number } {
  let left = units;
  let earned = 0;
  for (const i of items) {
    const used = Math.min(left, i.units);
    earned += used * i.unitCost;
    left -= used;
    if (left <= 0) break;
  }
  return { earned, over: Math.max(0, left) };
}

/**
 * Activity by month from the contract start to `asOf`. A month the CRO has not
 * reported yet is estimated as the rounded average of the last three reported
 * months, so a late report doesn't make the accrual drop to zero.
 */
export function activityWithEstimates(contract: TrialContract, activity: TrialActivity[], asOf: Period) {
  const reported = new Map(activity.filter((a) => a.period <= asOf).map((a) => [a.period, a]));
  const months: (TrialActivity & { estimated: boolean })[] = [];
  const recent: TrialActivity[] = [];
  for (const period of contract.start <= asOf ? periodRange(contract.start, asOf) : []) {
    const r = reported.get(period);
    if (r) {
      months.push({ ...r, estimated: false });
      recent.push(r);
      if (recent.length > 3) recent.shift();
      continue;
    }
    const avg = (k: keyof Omit<TrialActivity, "period">) => (recent.length ? Math.round(recent.reduce((s, a) => s + a[k], 0) / recent.length) : 0);
    months.push({ period, sites: avg("sites"), patients: avg("patients"), visits: avg("visits"), estimated: true });
  }
  // Only months after the last report are estimated; a gap before it means nothing happened.
  const last = [...reported.keys()].sort().pop() ?? null;
  return {
    months: months.map((m) => (m.estimated && last !== null && m.period < last ? { ...m, sites: 0, patients: 0, visits: 0, estimated: false } : m)),
    lastReported: last,
  };
}

function earnedAt(contract: TrialContract, cumulative: Record<"site" | "patient" | "visit", number>, monthsElapsed: number, period: Period) {
  const items = itemsInForce(contract, period);
  const lines = DRIVERS.map(({ driver, label, unit }) => {
    const mine = items.filter((i) => i.driver === driver);
    const contracted = mine.reduce((s, i) => s + i.units, 0);
    const units = driver === "monthly" ? monthsElapsed : cumulative[driver];
    const { earned, over } = priceUnits(mine, units);
    const done = units - over;
    return {
      driver,
      label,
      unit,
      contractedUnits: contracted,
      unitsToDate: units,
      unitsOverContract: over,
      earned,
      unitCost: done > 0 ? Math.round(earned / done) : (mine[0]?.unitCost ?? 0),
    };
  });
  return lines;
}

/**
 * Work done by activity drivers minus billed to date, as of the end of `asOf`.
 * `billed` maps each month to what the CRO invoiced in it.
 */
export function estimateAccrual(contract: TrialContract, activity: TrialActivity[], billed: Map<Period, Cents>, asOf: Period): AccrualEstimate {
  const { months, lastReported } = activityWithEstimates(contract, activity, asOf);
  const cum = { site: 0, patient: 0, visit: 0 };
  let billedSum = 0;
  for (const [p, v] of billed) if (p < contract.start && p <= asOf) billedSum += v;
  const curve: AccrualPoint[] = [];
  let lines: AccrualLine[] = earnedAt(contract, cum, 0, asOf);
  months.forEach((m, i) => {
    for (const d of ["site", "patient", "visit"] as const) cum[d] += m[ACTIVITY_KEY[d]];
    billedSum += billed.get(m.period) ?? 0;
    lines = earnedAt(contract, cum, i + 1, m.period);
    curve.push({ period: m.period, contractValue: contractValue(contract, m.period), earned: lines.reduce((s, l) => s + l.earned, 0), billed: billedSum });
  });
  const value = contractValue(contract, asOf);
  const earned = lines.reduce((s, l) => s + l.earned, 0);
  return {
    asOf,
    contractValue: value,
    earned,
    billed: billedSum,
    accrual: earned - billedSum,
    pctComplete: value > 0 ? earned / value : 0,
    lines,
    estimatedPeriods: months.filter((m) => m.estimated).map((m) => m.period),
    lastReported,
    curve,
  };
}

export interface JournalLine {
  date: string;
  account: string;
  accountName: string;
  debit: Cents;
  credit: Cents;
  memo: string;
  className: string;
}

export const ACCRUAL_ACCOUNTS = {
  expense: { code: "6110", name: "CRO clinical trial services" },
  accrued: { code: "2150", name: "Accrued clinical trial costs" },
  prepaid: { code: "1250", name: "Prepaid clinical trial costs" },
};

/** Last calendar day of a period, as YYYY-MM-DD. */
export function periodEnd(p: Period): string {
  const next = addMonths(p, 1);
  const d = new Date(Date.UTC(Number(next.slice(0, 4)), Number(next.slice(5, 7)) - 1, 0));
  return d.toISOString().slice(0, 10);
}

/**
 * The month-end entry for one trial: book the full accrual (or prepayment) on
 * the last day of the month, to be reversed on the first day of the next.
 */
export function accrualJournal(trial: { code: string; programCode: string | null }, est: AccrualEstimate): JournalLine[] {
  const amt = Math.abs(est.accrual);
  if (amt === 0) return [];
  const date = periodEnd(est.asOf);
  const memo = `${est.accrual > 0 ? "Accrual" : "Prepayment"} ${trial.code} ${est.asOf}, reverses ${addMonths(est.asOf, 1)}-01`;
  const className = trial.programCode ?? "";
  const { expense, accrued, prepaid } = ACCRUAL_ACCOUNTS;
  return est.accrual > 0
    ? [
        { date, account: expense.code, accountName: expense.name, debit: amt, credit: 0, memo, className },
        { date, account: accrued.code, accountName: accrued.name, debit: 0, credit: amt, memo, className },
      ]
    : [
        { date, account: prepaid.code, accountName: prepaid.name, debit: amt, credit: 0, memo, className },
        { date, account: expense.code, accountName: expense.name, debit: 0, credit: amt, memo, className },
      ];
}

/** A clinical trial run by a CRO under one contract. */
export interface Trial {
  id: string;
  code: string;
  name: string;
  /** Program code the trial's costs are tagged with in the ledger. */
  programCode: string | null;
  /** The CRO, matched to ledger vendors by name. */
  croName: string;
  phase: string;
  /** Planned last month of the study. */
  end: Period;
  contract: TrialContract;
  activity: TrialActivity[];
}

/**
 * What the CRO billed for this trial, by month: CRO-line spend from that
 * vendor, tagged to the trial's program when it has one.
 */
export function billedForTrial(data: Pick<LedgerData, "transactions" | "vendors" | "programs">, trial: Pick<Trial, "croName" | "programCode">): Map<Period, Cents> {
  const name = trial.croName.trim().toLowerCase();
  const vendorIds = new Set(data.vendors.filter((v) => v.name.trim().toLowerCase() === name).map((v) => v.id));
  const programId = trial.programCode ? (data.programs.find((p) => p.code === trial.programCode)?.id ?? "∅") : undefined;
  const out = new Map<Period, Cents>();
  for (const t of data.transactions) {
    if (t.categoryId !== "rd-cro" || !t.vendorId || !vendorIds.has(t.vendorId)) continue;
    if (programId !== undefined && t.programId !== programId) continue;
    const p = t.date.slice(0, 7);
    out.set(p, (out.get(p) ?? 0) + t.amount);
  }
  return out;
}
