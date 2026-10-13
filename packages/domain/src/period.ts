import type { Period } from "./types";

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function parsePeriod(p: Period): { year: number; month: number } {
  const m = PERIOD_RE.exec(p);
  if (!m) throw new Error(`Invalid period "${p}", expected YYYY-MM`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function makePeriod(year: number, month: number): Period {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function periodOfDate(date: string): Period {
  return date.slice(0, 7);
}

export function addMonths(p: Period, n: number): Period {
  const { year, month } = parsePeriod(p);
  const idx = year * 12 + (month - 1) + n;
  return makePeriod(Math.floor(idx / 12), (idx % 12) + 1);
}

/** Inclusive list of periods from `from` to `to`. */
export function periodRange(from: Period, to: Period): Period[] {
  const out: Period[] = [];
  for (let p = from; p <= to; p = addMonths(p, 1)) out.push(p);
  return out;
}

/** The `n` periods ending at (and including) `end`. */
export function trailingPeriods(end: Period, n: number): Period[] {
  return periodRange(addMonths(end, -(n - 1)), end);
}

/** Periods from January of `end`'s year through `end` (calendar YTD). */
export function ytdPeriods(end: Period): Period[] {
  const { year } = parsePeriod(end);
  return periodRange(makePeriod(year, 1), end);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-09` → `Sep 2026`; with `short`, `Sep`. */
export function periodLabel(p: Period, short = false): string {
  const { year, month } = parsePeriod(p);
  const name = MONTHS[month - 1]!;
  return short ? name : `${name} ${year}`;
}

/** `["2026-01", …, "2026-03"]` → `Jan–Mar 2026`. */
export function rangeLabel(periods: Period[]): string {
  if (periods.length === 0) return "";
  const first = periods[0]!;
  const last = periods[periods.length - 1]!;
  if (first === last) return periodLabel(first);
  const a = parsePeriod(first);
  const b = parsePeriod(last);
  if (a.year === b.year) return `${periodLabel(first, true)}–${periodLabel(last)}`;
  return `${periodLabel(first)}–${periodLabel(last)}`;
}
