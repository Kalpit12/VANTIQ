import {
  addMonths,
  parsePeriod,
  periodLabel,
  rangeLabel,
  ytdPeriods,
  type Ledger,
  type Period,
} from "@vantiq/domain";

export type ViewMode = "month" | "ytd";

export interface View {
  period: Period;
  mode: ViewMode;
  periods: Period[];
  label: string;
  /** 12 months ending at `period`, for trend charts. */
  trend: Period[];
}

export type SearchParams = Record<string, string | string[] | undefined>;

export function one(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Reads `?period=2026-09&mode=ytd` and clamps to the data the ledger has. */
export function resolveView(sp: SearchParams, ledger: Ledger): View {
  const latest = ledger.latestPeriod();
  const first = ledger.firstPeriod();
  let period = one(sp, "period") ?? latest;
  try {
    parsePeriod(period);
  } catch {
    period = latest;
  }
  if (period > latest) period = latest;
  if (period < first) period = first;
  const mode: ViewMode = one(sp, "mode") === "ytd" ? "ytd" : "month";
  const periods = mode === "ytd" ? ytdPeriods(period).filter((p) => p >= first) : [period];
  const trend: Period[] = [];
  for (let i = 11; i >= 0; i--) {
    const p = addMonths(period, -i);
    if (p >= first) trend.push(p);
  }
  const label = mode === "ytd" ? `YTD ${rangeLabel(periods)}` : periodLabel(period);
  return { period, mode, periods, label, trend };
}

/** Builds a query string that keeps the current view and overrides some keys. */
export function href(path: string, sp: SearchParams, overrides: Record<string, string | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (s !== undefined) q.set(k, s);
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
