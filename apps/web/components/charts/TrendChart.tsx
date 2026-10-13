"use client";

import { formatCompactCurrency, formatSignedPct } from "@vantiq/domain";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDrill, type DrillTarget } from "./useDrill";

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  /** Drill target for clicks on this series; period is added automatically. */
  drill?: Omit<DrillTarget, "dper">;
}

type TooltipPayload = { payload: unknown }[];

export interface TrendPoint {
  period: string;
  label: string;
  /** Values in cents keyed by series key. */
  [key: string]: string | number | null;
}

/**
 * Line chart for "how is this trending?" (design.md 7.1). Actual is solid,
 * budget dashed. Crosshair tooltip lists every series; clicking a point drills
 * into that period. One y-axis only.
 */
export function TrendChart({
  data,
  series,
  height = 240,
  compact = false,
  varianceOf,
  favorableWhenUp = false,
  todayPeriod,
}: {
  data: TrendPoint[];
  series: TrendSeries[];
  height?: number;
  compact?: boolean;
  /** When set, the tooltip shows actual − budget for this [actualKey, budgetKey] pair. */
  varianceOf?: [string, string];
  favorableWhenUp?: boolean;
  todayPeriod?: string;
}) {
  const drill = useDrill();
  const clickable = series.find((s) => s.drill);
  const todayLabel = todayPeriod ? data.find((d) => d.period === todayPeriod)?.label : undefined;
  return (
    <div style={{ height }} className={clickable ? "cursor-pointer" : ""}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: compact ? 8 : 16, bottom: 0, left: 0 }}
          onClick={(e) => {
            const p = (e?.activePayload?.[0]?.payload as TrendPoint | undefined)?.period;
            if (p && clickable?.drill) drill({ ...clickable.drill, dper: p });
          }}
        >
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: "var(--border-default)" }}
            interval={compact ? "preserveStartEnd" : 0}
            minTickGap={8}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            width={compact ? 44 : 56}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatCompactCurrency(v)}
            tickCount={compact ? 3 : 5}
            tick={{ fontSize: 12 }}
          />
          {todayLabel && <ReferenceLine x={todayLabel} stroke="var(--border-strong)" />}
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            content={({ active, payload }) => (
              <TrendTooltip active={active} payload={payload as TooltipPayload} series={series} varianceOf={varianceOf} favorableWhenUp={favorableWhenUp} />
            )}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              dot={false}
              activeDot={s.dashed ? false : { r: 4, strokeWidth: 2, stroke: "var(--bg-surface)" }}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendTooltip({
  active,
  payload,
  series,
  varianceOf,
  favorableWhenUp,
}: { active?: boolean; payload?: TooltipPayload; series: TrendSeries[]; varianceOf?: [string, string]; favorableWhenUp: boolean }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]!.payload as TrendPoint;
  let variance: { delta: number; pct: number | null; favorable: boolean } | null = null;
  if (varianceOf) {
    const a = point[varianceOf[0]];
    const b = point[varianceOf[1]];
    if (typeof a === "number" && typeof b === "number") {
      const delta = a - b;
      variance = { delta, pct: b ? delta / Math.abs(b) : null, favorable: favorableWhenUp ? delta >= 0 : delta <= 0 };
    }
  }
  return <TooltipBox title={point.label} rows={series.map((s) => ({ label: s.label, color: s.color, dashed: s.dashed, value: point[s.key] }))} variance={variance} />;
}

export function TooltipBox({
  title,
  rows,
  variance,
  hint = "Click to see transactions",
}: {
  title: string;
  rows: { label: string; color?: string; dashed?: boolean; value: unknown }[];
  variance?: { delta: number; pct: number | null; favorable: boolean } | null;
  hint?: string | null;
}) {
  return (
    <div className="num min-w-[200px] rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-[var(--shadow-float)]">
      <div className="mb-1 font-semibold text-ink">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-ink-2">
            {r.color && (
              <svg width="12" height="6" aria-hidden>
                <line x1="0" y1="3" x2="12" y2="3" stroke={r.color} strokeWidth="2.5" strokeDasharray={r.dashed ? "3 2" : undefined} />
              </svg>
            )}
            {r.label}
          </span>
          <span className="text-ink">{typeof r.value === "number" ? formatCompactCurrency(r.value) : "—"}</span>
        </div>
      ))}
      {variance && (
        <div className="mt-1 flex justify-between gap-4 border-t border-line pt-1">
          <span className="text-ink-2">Variance</span>
          <span className={variance.favorable ? "text-good" : "text-bad"}>
            {variance.delta > 0 ? "+" : ""}
            {formatCompactCurrency(variance.delta)} ({formatSignedPct(variance.pct)})
          </span>
        </div>
      )}
      {hint && <div className="mt-1 text-[11px] text-ink-3">{hint}</div>}
    </div>
  );
}
