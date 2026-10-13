import Link from "next/link";
import {
  formatCompactCurrency,
  formatMonths,
  formatSignedPct,
  periodLabel,
  UNASSIGNED,
} from "@vantiq/domain";
import { ChartCard } from "@/components/ChartCard";
import { DrillDrawer } from "@/components/DrillDrawer";
import { KpiCard } from "@/components/KpiCard";
import { BulletRows } from "@/components/charts/BulletRows";
import { CashChart } from "@/components/charts/CashChart";
import { TrendChart } from "@/components/charts/TrendChart";
import { Card, PageHeader, StatusPill, VarianceChip } from "@/components/ui";
import { getLedger } from "@/lib/data";
import { cashProjection, findingTitle, materialLines, runwayAt, trendPoints, varianceFor } from "@/lib/metrics";
import { href, resolveView, type SearchParams } from "@/lib/view";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ledger = getLedger();
  const view = resolveView(sp, ledger);
  const drill = (dc: string, extra: Record<string, string | null> = {}) => href("/", sp, { dc, dp: null, dper: null, ...extra });

  const income = varianceFor(ledger, view.periods, "rev");
  const opex = varianceFor(ledger, view.periods, "opex");
  const rd = varianceFor(ledger, view.periods, "rd");
  const runway = runwayAt(ledger, view.period);
  const prevCash = ledger.cashAt(view.trend[view.trend.length - 2] ?? view.period);
  const cashChange = prevCash === null ? 0 : runway.cash - prevCash;

  const spark = (id: string) => view.trend.map((p) => ledger.actual({ periods: [p], categoryIds: [id] }));
  const attention = materialLines(ledger, view).slice(0, 5);
  const opexTrend = trendPoints(ledger, view.trend, ["opex"]);
  const programRows = ledger
    .programTotals(view.periods, ["rd"])
    .filter((p) => p.variance.actual !== 0 || p.variance.comparison !== 0)
    .sort((a, b) => b.variance.actual - a.variance.actual)
    .map((p) => {
      const prog = ledger.data.programs.find((x) => x.id === p.programId);
      return {
        id: p.programId,
        label: prog ? prog.code : "Not assigned to a program",
        sublabel: prog ? `${prog.therapeuticArea} · ${prog.phase}` : "Shared R&D costs",
        variance: p.variance,
        href: drill("rd", { dp: p.programId === UNASSIGNED ? "none" : p.programId }),
      };
    });
  const cash = cashProjection(ledger, view);
  const topProgram = programRows.filter((r) => r.variance.comparison > 0).sort((a, b) => Math.abs(b.variance.delta) - Math.abs(a.variance.delta))[0];

  return (
    <>
      <PageHeader title="Overview" subtitle={`${ledger.data.companyName} · ${view.label} · compared with budget`} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="Revenue and income" value={formatCompactCurrency(income.actual)} variance={income} caption="vs budget" series={spark("rev")} href={drill("rev")} />
        <KpiCard label="Operating expenses" value={formatCompactCurrency(opex.actual)} variance={opex} caption="vs budget" series={spark("opex")} href={drill("opex")} />
        <KpiCard label="R&D spend" value={formatCompactCurrency(rd.actual)} variance={rd} caption="vs budget" series={spark("rd")} href={drill("rd")} />
        <KpiCard
          label="Cash balance"
          value={formatCompactCurrency(runway.cash)}
          caption={`${cashChange >= 0 ? "+" : ""}${formatCompactCurrency(cashChange)} vs prior month`}
          series={view.trend.map((p) => ledger.cashAt(p) ?? 0)}
        />
        <KpiCard
          label="Runway"
          value={formatMonths(runway.months)}
          caption={`at ${formatCompactCurrency(runway.avgBurn)}/mo net burn`}
          series={view.trend.map((p) => runwayAt(ledger, p).months ?? 0)}
          tone={runway.months !== null && runway.months < 12 ? "warn" : undefined}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">Needs attention</h2>
            <span className="text-[12px] text-ink-3">Variances over ±10% and ±$25k</span>
          </div>
          {attention.length === 0 ? (
            <p className="text-[13px] text-ink-3">No material variances in {view.label}.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {attention.map((a) => (
                <li key={a.categoryId}>
                  <Link href={drill(a.categoryId)} scroll={false} className="flex items-start justify-between gap-3 py-2.5 hover:bg-subtle">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-ink">{a.name}</span>
                      <span className="block text-[12px] text-ink-3">{a.parentName}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="num text-[13px] text-ink">
                        {a.variance.delta > 0 ? "+" : ""}
                        {formatCompactCurrency(a.variance.delta)} <VarianceChip v={a.variance} />
                      </span>
                      <StatusPill tone="neutral">Explanation pending</StatusPill>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href={href("/variances", sp, { dc: null, dp: null, dper: null })} className="mt-3 inline-block text-[13px] font-medium text-accent hover:underline">
            Open variance explorer →
          </Link>
        </Card>

        <ChartCard
          className="xl:col-span-2"
          title={findingTitle("Operating expenses", opex, view.label)}
          subtitle={`Monthly operating expenses, USD · ${periodLabel(view.trend[0]!)}–${periodLabel(view.period)} · click a month for transactions`}
          legend={[
            { label: "Actual", color: "var(--series-1)" },
            { label: "Budget", color: "var(--text-secondary)", dashed: true },
          ]}
          table={{
            columns: ["Month", "Actual", "Budget", "Variance"],
            rows: opexTrend.map((p) => [periodLabel(p.period), formatCompactCurrency(p.actual), formatCompactCurrency(p.budget), formatSignedPct(p.budget ? (p.actual - p.budget) / p.budget : null)]),
          }}
        >
          <TrendChart
            data={opexTrend}
            series={[
              { key: "actual", label: "Actual", color: "var(--series-1)", drill: { dc: "opex" } },
              { key: "budget", label: "Budget", color: "var(--text-secondary)", dashed: true },
            ]}
            varianceOf={["actual", "budget"]}
            height={260}
          />
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title={topProgram ? `${topProgram.label} R&D spend is ${formatSignedPct(topProgram.variance.deltaPct).replace(/^[+−]/, "")} ${topProgram.variance.delta > 0 ? "over" : "under"} budget` : "R&D spend by program"}
          subtitle={`R&D spend by program vs budget, USD · ${view.label}`}
          table={{
            columns: ["Program", "Actual", "Budget", "Variance"],
            rows: programRows.map((r) => [r.label, formatCompactCurrency(r.variance.actual), formatCompactCurrency(r.variance.comparison), formatSignedPct(r.variance.deltaPct)]),
          }}
        >
          <BulletRows rows={programRows} />
        </ChartCard>

        <ChartCard
          title={runway.months === null ? "Cash is not decreasing" : `Cash lasts about ${formatMonths(runway.months)} at the current burn`}
          subtitle={`Month-end cash, USD · projection at ${formatCompactCurrency(runway.avgBurn)}/mo (3-month average net burn)`}
          legend={[
            { label: "Cash balance", color: "var(--series-1)" },
            { label: "Projection", color: "var(--series-1)", dashed: true },
          ]}
          table={{
            columns: ["Month", "Cash", "Projected"],
            rows: cash.data.map((d) => [d.label, d.actual === null ? "—" : formatCompactCurrency(d.actual), d.projected === null ? "—" : formatCompactCurrency(d.projected)]),
          }}
        >
          <CashChart data={cash.data} today={cash.today} zeroLabel={cash.zeroLabel} />
        </ChartCard>
      </div>

      <DrillDrawer ledger={ledger} sp={sp} view={view} path="/" />
    </>
  );
}
