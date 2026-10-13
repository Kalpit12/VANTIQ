"use client";

import { formatCompactCurrency } from "@vantiq/domain";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TooltipBox } from "./TrendChart";

export interface CashPointView {
  label: string;
  actual: number | null;
  projected: number | null;
}

export interface CashEvent {
  label: string;
  value: number;
  text: string;
}

/**
 * Cash runway chart (C4). Solid line: actual month-end cash. Dashed line with
 * a light fill: where cash goes if the company keeps spending at its recent
 * rate. Funding rounds, today's balance and the run-out month are labelled on
 * the chart so it can be read without a legend.
 */
export function CashChart({
  data,
  today,
  todayValue,
  zeroLabel,
  zeroText,
  events,
}: {
  data: CashPointView[];
  today: string;
  todayValue: number;
  zeroLabel: string | null;
  zeroText: string | null;
  events: CashEvent[];
}) {
  return (
    <div style={{ height: 250 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 28, right: 28, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="cash-proj" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.14} />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border-default)" }} minTickGap={24} tick={{ fontSize: 12 }} />
          <YAxis width={56} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCompactCurrency(v)} tick={{ fontSize: 12 }} domain={[0, "auto"]} />
          <ReferenceLine x={today} stroke="var(--border-strong)" strokeDasharray="2 3" />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]!.payload as CashPointView;
              const ev = events.find((e) => e.label === p.label);
              return (
                <TooltipBox
                  title={p.label}
                  hint={ev ? ev.text : p.actual === null ? "Forecast at the current monthly burn" : null}
                  rows={[
                    p.actual !== null
                      ? { label: "Cash at month end", color: "var(--series-1)", value: p.actual }
                      : { label: "Forecast cash", color: "var(--series-1)", dashed: true, value: p.projected },
                  ]}
                />
              );
            }}
          />
          <Area dataKey="projected" stroke="none" fill="url(#cash-proj)" isAnimationActive={false} activeDot={false} />
          <Line dataKey="projected" stroke="var(--series-1)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          <Line dataKey="actual" stroke="var(--series-1)" strokeWidth={2.25} dot={false} isAnimationActive={false} />
          {events.map((e) => (
            <ReferenceDot
              key={e.label}
              x={e.label}
              y={e.value}
              r={4}
              fill="var(--bg-surface)"
              stroke="var(--series-1)"
              strokeWidth={2}
              label={{ value: e.text, position: "right", offset: 10, fill: "var(--text-secondary)", fontSize: 12 }}
            />
          ))}
          <ReferenceDot
            x={today}
            y={todayValue}
            r={5}
            fill="var(--series-1)"
            stroke="var(--bg-surface)"
            strokeWidth={2}
            label={{ value: `Today ${formatCompactCurrency(todayValue)}`, position: "top", offset: 12, dx: 44, fill: "var(--text-primary)", fontSize: 12, fontWeight: 600 }}
          />
          {zeroLabel && (
            <ReferenceDot
              x={zeroLabel}
              y={0}
              r={5}
              fill="var(--warning)"
              stroke="var(--bg-surface)"
              strokeWidth={2}
              label={{ value: `Runs out ${zeroText ?? zeroLabel}`, position: "left", offset: 14, fill: "var(--warning)", fontSize: 12, fontWeight: 600 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
