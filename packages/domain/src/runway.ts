import type { Cents } from "./types";

/**
 * Months of cash left at the average net burn of the trailing periods given.
 * `netBurn` values are positive when the company is spending more than it
 * brings in. Returns null when the company is not burning cash.
 */
export function runwayMonths(cash: Cents, netBurn: Cents[]): number | null {
  if (netBurn.length === 0) return null;
  const avg = netBurn.reduce((s, b) => s + b, 0) / netBurn.length;
  if (avg <= 0) return null;
  return Math.max(0, cash / avg);
}

/**
 * Projects month-end cash forward at a constant burn until it reaches zero or
 * `maxMonths` is hit. The first point is the starting cash.
 */
export function projectCash(cash: Cents, monthlyBurn: Cents, maxMonths: number): Cents[] {
  const out: Cents[] = [cash];
  if (monthlyBurn <= 0) return out;
  let c = cash;
  for (let i = 0; i < maxMonths && c > 0; i++) {
    c = Math.max(0, c - monthlyBurn);
    out.push(c);
  }
  return out;
}
