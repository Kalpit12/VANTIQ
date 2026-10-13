import type { CategoryKind, Cents } from "./types";

export interface Variance {
  actual: Cents;
  comparison: Cents;
  /** actual − comparison */
  delta: Cents;
  /** delta / |comparison|, or null when the comparison is zero. */
  deltaPct: number | null;
  /** True when the variance is good for the company. */
  favorable: boolean;
}

/**
 * Revenue above plan is favorable; costs above plan are unfavorable.
 * An exact match counts as favorable.
 */
export function isIncomeKind(kind: CategoryKind): boolean {
  return kind === "revenue";
}

export function computeVariance(actual: Cents, comparison: Cents, kind: CategoryKind): Variance {
  const delta = actual - comparison;
  const deltaPct = comparison === 0 ? null : delta / Math.abs(comparison);
  const favorable = isIncomeKind(kind) ? delta >= 0 : delta <= 0;
  return { actual, comparison, delta, deltaPct, favorable };
}

export interface MaterialityThresholds {
  /** Fraction, e.g. 0.10 for 10%. */
  pct: number;
  /** Absolute floor in cents, e.g. 2_500_000 for $25k. */
  abs: Cents;
}

export const DEFAULT_THRESHOLDS: MaterialityThresholds = { pct: 0.1, abs: 2_500_000 };

/**
 * A variance is material when its absolute size reaches the larger of the
 * absolute floor and the percentage of the comparison value
 * (design.md: "±10% and ±$25k, whichever larger").
 */
export function isMaterial(v: Variance, t: MaterialityThresholds = DEFAULT_THRESHOLDS): boolean {
  const threshold = Math.max(t.abs, t.pct * Math.abs(v.comparison));
  return Math.abs(v.delta) >= threshold && v.delta !== 0;
}

export interface BridgeInput {
  id: string;
  label: string;
  delta: Cents;
  favorable: boolean;
}

export interface BridgeStep {
  id: string;
  label: string;
  kind: "start" | "step" | "end";
  /** Bar runs from `from` to `to` on the value axis. */
  from: Cents;
  to: Cents;
  delta: Cents;
  favorable: boolean | null;
}

/**
 * Builds a variance bridge (waterfall) from a starting total through each
 * driver to the ending total. Drivers smaller than `minAbs` are folded into a
 * single "Other" step so the chart stays readable. The end always equals
 * start + sum of all deltas.
 */
export function buildBridge(
  start: { label: string; value: Cents },
  drivers: BridgeInput[],
  endLabel: string,
  opts: { maxSteps?: number; favorableWhenPositive: boolean } ,
): BridgeStep[] {
  const maxSteps = opts.maxSteps ?? 6;
  const sorted = [...drivers].filter((d) => d.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const shown = sorted.slice(0, maxSteps);
  const rest = sorted.slice(maxSteps);
  if (rest.length > 0) {
    const otherDelta = rest.reduce((s, d) => s + d.delta, 0);
    if (otherDelta !== 0) {
      shown.push({
        id: "other",
        label: `Other (${rest.length})`,
        delta: otherDelta,
        favorable: opts.favorableWhenPositive ? otherDelta >= 0 : otherDelta <= 0,
      });
    }
  }
  const steps: BridgeStep[] = [
    { id: "start", label: start.label, kind: "start", from: 0, to: start.value, delta: start.value, favorable: null },
  ];
  let running = start.value;
  for (const d of shown) {
    steps.push({ id: d.id, label: d.label, kind: "step", from: running, to: running + d.delta, delta: d.delta, favorable: d.favorable });
    running += d.delta;
  }
  const total = start.value + drivers.reduce((s, d) => s + d.delta, 0);
  steps.push({ id: "end", label: endLabel, kind: "end", from: 0, to: total, delta: total, favorable: null });
  return steps;
}
