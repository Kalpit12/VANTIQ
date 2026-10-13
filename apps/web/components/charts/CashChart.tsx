"use client";

import { formatCompactCurrency } from "@vantiq/domain";
import { CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TooltipBox } from "./TrendChart";

export interface CashPointView {
  label: string;
  actual: number | null;
  projected: number | null;
}

/**
 * Cash balance with a straight-line projection at the trailing burn (chart C4).
 * The month cash runs out is marked; actual is solid, projection dashed.
 */
export function CashChart({ data, today, zeroLabel }: { data: CashPointView[]; today: string; zeroLabel: string | null }) {
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 16, right: 24, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border-default)" }} minTickGap={16} tick={{ fontSize: 12 }} />
          <YAxis width={56} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCompactCurrency(v)} tick={{ fontSize: 12 }} domain={[0, "auto"]} />
          <ReferenceLine x={today} stroke="var(--border-strong)" label={{ value: "Today", position: "insideTopLeft", fill: "var(--text-muted)", fontSize: 11 }} />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]!.payload as CashPointView;
              return (
                <TooltipBox
                  title={p.label}
                  hint={null}
                  rows={[
                    p.actual !== null
                      ? { label: "Cash balance", color: "var(--series-1)", value: p.actual }
                      : { label: "Projected cash", color: "var(--series-1)", dashed: true, value: p.projected },
                  ]}
                />
              );
            }}
          />
          <Line dataKey="actual" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="projected" stroke="var(--series-1)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          {zeroLabel && (
            <ReferenceDot
              x={zeroLabel}
              y={0}
              r={5}
              fill="var(--warning)"
              stroke="var(--bg-surface)"
              strokeWidth={2}
              label={{ value: `Cash runs out ${zeroLabel}`, position: "left", offset: 10, fill: "var(--text-primary)", fontSize: 12 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
