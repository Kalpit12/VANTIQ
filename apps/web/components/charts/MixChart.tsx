"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TooltipBox } from "./TrendChart";
import { useDrill } from "./useDrill";

export interface MixPart {
  key: string;
  label: string;
  color: string;
}

/**
 * 100% stacked bars by month (chart C9): how the cost mix changes over time.
 * Max 5 parts plus Other; 2px surface gaps between segments.
 */
export function MixChart({ data, parts, programId }: { data: Record<string, number | string>[]; parts: MixPart[]; programId?: string }) {
  const drill = useDrill();
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} stackOffset="expand" margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="18%">
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border-default)" }} tick={{ fontSize: 12 }} interval={0} minTickGap={4} />
          <YAxis width={44} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} tick={{ fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: "var(--bg-subtle)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]!.payload as Record<string, number | string>;
              const total = parts.reduce((s, p) => s + Number(row[p.key] ?? 0), 0);
              return (
                <TooltipBox
                  title={String(row.label)}
                  hint={null}
                  rows={[...parts]
                    .reverse()
                    .map((p) => ({ label: `${p.label} (${total ? Math.round((Number(row[p.key] ?? 0) / total) * 100) : 0}%)`, color: p.color, value: Number(row[p.key] ?? 0) }))}
                />
              );
            }}
          />
          {parts.map((p) => (
            <Bar
              key={p.key}
              dataKey={p.key}
              name={p.label}
              stackId="mix"
              fill={p.color}
              stroke="var(--bg-surface)"
              strokeWidth={2}
              isAnimationActive={false}
              className="cursor-pointer"
              onClick={(d: { payload?: { period?: string } }) => {
                const period = d?.payload?.period;
                if (period) drill({ dc: p.key, dp: programId, dper: period });
              }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2" aria-label="Legend">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
            {p.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
