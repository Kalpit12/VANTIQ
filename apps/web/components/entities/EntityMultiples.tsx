"use client";

import { formatCompactCurrency } from "@vantiq/domain";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TooltipBox } from "../charts/TrendChart";

export interface EntityPanel {
  code: string;
  name: string;
  currency: string;
  color: string;
  points: { period: string; label: string; actual: number; budget: number }[];
}

/**
 * Chart C20 (design.md 7.2): spend by entity as small multiples sharing one
 * scale, so a small subsidiary looks small. Bars are actual, the dashed line
 * is budget. Each entity keeps its series color everywhere on the screen.
 * Clicking a month opens that entity's transactions.
 */
export function EntityMultiples({ panels, measure, dc }: { panels: EntityPanel[]; measure: string; dc: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const max = Math.max(1, ...panels.flatMap((p) => p.points.flatMap((x) => [x.actual, x.budget])));
  const drill = (code: string, period: string) => {
    const q = new URLSearchParams(sp.toString());
    q.set("de", code);
    q.set("dc", dc);
    q.set("dper", period);
    q.delete("dp");
    router.push(`${pathname}?${q.toString()}`, { scroll: false });
  };
  return (
    <div className={`grid grid-cols-1 gap-4 ${panels.length > 1 ? "md:grid-cols-2" : ""} ${panels.length > 2 ? "xl:grid-cols-3" : ""}`}>
      {panels.map((p) => {
        const last = p.points.at(-1);
        return (
          <figure key={p.code} className="min-w-0" aria-label={`${measure} for ${p.name}`}>
            <figcaption className="mb-1 flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden />
                <span className="truncate text-[13px] font-medium text-ink">{p.name}</span>
              </span>
              <span className="num shrink-0 text-[12px] text-ink-3">
                {p.code} · {p.currency}
                {last ? ` · ${formatCompactCurrency(last.actual)} in ${last.label}` : ""}
              </span>
            </figcaption>
            <div style={{ height: 150 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={p.points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%">
                  <CartesianGrid vertical={false} stroke="var(--grid)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border-default)" }} tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={8} />
                  <YAxis width={48} domain={[0, max]} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCompactCurrency(v)} tick={{ fontSize: 11 }} tickCount={3} allowDataOverflow />
                  <Tooltip
                    cursor={{ fill: "var(--bg-subtle)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0]!.payload as EntityPanel["points"][number];
                      return (
                        <TooltipBox
                          title={`${p.code} · ${row.label}`}
                          rows={[
                            { label: "Actual", color: p.color, value: row.actual },
                            { label: "Budget", color: "var(--text-secondary)", dashed: true, value: row.budget },
                          ]}
                          variance={row.budget ? { delta: row.actual - row.budget, pct: (row.actual - row.budget) / row.budget, favorable: row.actual <= row.budget } : null}
                        />
                      );
                    }}
                  />
                  <Bar
                    dataKey="actual"
                    name="Actual"
                    fill={p.color}
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                    className="cursor-pointer"
                    onClick={(d: { payload?: { period?: string } }) => {
                      if (d?.payload?.period) drill(p.code, d.payload.period);
                    }}
                  />
                  <Line dataKey="budget" name="Budget" stroke="var(--text-secondary)" strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </figure>
        );
      })}
    </div>
  );
}
