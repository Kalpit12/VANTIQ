import { formatAmount, formatCompactCurrency, formatSignedAmount, type Variance } from "@vantiq/domain";
import { ChartCard } from "@/components/ChartCard";
import { BulletRows } from "@/components/charts/BulletRows";
import { TrendChart } from "@/components/charts/TrendChart";
import { Card, VarianceChip } from "@/components/ui";
import type { PackData } from "@/lib/pack";

const signed = (v: Variance) => (v.delta === 0 ? "text-ink-3" : v.favorable ? "text-good" : "text-bad");

/**
 * The board pack (design.md 14), as the board reads it: in the app as a
 * preview and on a shared link. Rendered from the board subset of the
 * approved snapshot, so it never shows numbers that weren't approved.
 */
export function BoardPackView({ data, status, note, noteBy }: { data: PackData; status: string; note?: string; noteBy?: string | null }) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1 border-b border-line pb-5">
        <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-accent">Board pack · {data.label}</p>
        <h1 className="text-[28px] font-semibold leading-tight text-ink">{data.companyName}</h1>
        <p className="text-[13px] text-ink-2">
          Monthly financial review, {data.label} and {data.ytdLabel.replace(/^YTD /, "year to date ")}. {status}.
        </p>
      </header>

      {note && (
        <Card className="border-l-[3px] border-l-[var(--accent)] p-5">
          <p className="text-[12px] font-medium text-ink-3">Note to the board{noteBy ? ` from ${noteBy}` : ""}</p>
          <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-ink">{note}</p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {data.kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <p className="text-[12px] text-ink-3">{k.label}</p>
            <p className="num mt-1 text-[22px] font-semibold text-ink">{k.value}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-2">
              {k.variance && <VarianceChip v={k.variance} />}
              {k.note}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="p-5 xl:col-span-2">
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Summary</h2>
          <ul className="flex flex-col gap-2.5 text-[14px] leading-relaxed text-ink">
            {data.headlines.map((h) => (
              <li key={h} className="flex gap-2">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {h}
              </li>
            ))}
          </ul>
        </Card>
        <ChartCard
          className="xl:col-span-3"
          title="Operating expenses by month"
          subtitle="Actual vs budget, USD, the 12 months to this pack"
          legend={[
            { label: "Actual", color: "var(--series-1)" },
            { label: "Budget", color: "var(--text-secondary)", dashed: true },
          ]}
          table={{ columns: ["Month", "Actual", "Budget"], rows: data.opexTrend.map((p) => [p.label, formatCompactCurrency(p.actual), formatCompactCurrency(p.budget)]) }}
        >
          <TrendChart
            data={data.opexTrend}
            series={[
              { key: "actual", label: "Actual", color: "var(--series-1)" },
              { key: "budget", label: "Budget", color: "var(--text-secondary)", dashed: true },
            ]}
            varianceOf={["actual", "budget"]}
            height={220}
          />
        </ChartCard>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-3">
          <h2 className="text-[15px] font-semibold text-ink">What moved, and why</h2>
          <p className="text-[12px] text-ink-3">Every line over the materiality threshold, with the reviewed explanation</p>
        </div>
        {data.material.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-ink-3">No line moved by more than the materiality threshold.</p>
        ) : (
          <ol className="divide-y divide-line">
            {data.material.map((m) => (
              <li key={m.id} className="grid grid-cols-1 gap-3 px-5 py-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                <div>
                  <p className="text-[14px] font-medium text-ink">{m.name}</p>
                  <p className="num mt-1 text-[13px] text-ink-2">
                    {formatCompactCurrency(m.variance.actual)} vs {formatCompactCurrency(m.variance.comparison)} budget
                  </p>
                  <p className={`num text-[13px] ${signed(m.variance)}`}>
                    {formatSignedAmount(m.variance.delta)}k <VarianceChip v={m.variance} />
                  </p>
                </div>
                <p className="min-w-0 text-[14px] leading-relaxed text-ink">{m.explanation?.text ?? "No explanation was recorded."}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
          <h2 className="text-[15px] font-semibold text-ink">Income statement</h2>
          <span className="text-[12px] text-ink-3">USD thousands · {data.label} and {data.ytdLabel}</span>
        </div>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Income statement">
          <table className="num w-full min-w-[720px] text-[13px]">
            <thead className="bg-subtle text-[12px] text-ink-3">
              <tr>
                <th className="px-5 py-2 text-left font-medium">Line</th>
                <th className="px-3 py-2 text-right font-medium">Actual</th>
                <th className="px-3 py-2 text-right font-medium">Budget</th>
                <th className="px-3 py-2 text-right font-medium">Variance</th>
                <th className="border-l border-line px-3 py-2 text-right font-medium">YTD actual</th>
                <th className="px-3 py-2 text-right font-medium">YTD budget</th>
                <th className="px-5 py-2 text-right font-medium">YTD variance</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l) => (
                <tr key={l.id} className={`border-b border-line/70 ${l.depth === 0 ? "bg-subtle/60" : ""}`}>
                  <td className={`py-2 pr-3 ${l.depth === 0 ? "font-semibold text-ink" : "text-ink-2"}`} style={{ paddingLeft: 20 + l.depth * 16 }}>
                    {l.name}
                  </td>
                  <td className="px-3 py-2 text-right">{formatAmount(l.month.actual)}</td>
                  <td className="px-3 py-2 text-right text-ink-2">{formatAmount(l.month.comparison)}</td>
                  <td className={`px-3 py-2 text-right ${signed(l.month)}`}>{formatSignedAmount(l.month.delta)}</td>
                  <td className="border-l border-line px-3 py-2 text-right">{formatAmount(l.ytd.actual)}</td>
                  <td className="px-3 py-2 text-right text-ink-2">{formatAmount(l.ytd.comparison)}</td>
                  <td className={`px-5 py-2 text-right ${signed(l.ytd)}`}>{formatSignedAmount(l.ytd.delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="R&D spend by program"
          subtitle={`Actual vs budget, USD · ${data.label}`}
          table={{ columns: ["Program", "Actual", "Budget"], rows: data.programs.map((p) => [p.label, formatCompactCurrency(p.variance.actual), formatCompactCurrency(p.variance.comparison)]) }}
        >
          <BulletRows rows={data.programs.map((p, i) => ({ id: String(i), label: p.label, sublabel: p.sublabel, variance: p.variance }))} />
        </ChartCard>
        <ChartCard
          title={data.cash?.zeroText ? `Cash runs out around ${data.cash.zeroText} at today's spending` : "Cash and runway"}
          subtitle={data.cash ? `Month-end cash, USD · ${data.cash.runwayMonths === null ? "not burning cash" : `${data.cash.runwayMonths.toFixed(1)} months at ${formatCompactCurrency(data.cash.avgBurn)}/mo net burn`}` : "No cash balances"}
          table={{ columns: ["Month", "Cash"], rows: (data.cash?.trend ?? []).map((p) => [p.label, formatCompactCurrency(p.value)]) }}
        >
          {data.cash ? (
            <TrendChart data={data.cash.trend.map((p) => ({ period: p.period, label: p.label, cash: p.value }))} series={[{ key: "cash", label: "Cash", color: "var(--series-1)" }]} height={220} />
          ) : (
            <p className="text-[13px] text-ink-3">No cash balances were included.</p>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
