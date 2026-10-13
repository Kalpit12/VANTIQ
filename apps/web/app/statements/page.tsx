import Link from "next/link";
import { formatAmount, formatCompactCurrency, formatSignedPct, periodLabel, type Period } from "@vantiq/domain";
import { ChartCard } from "@/components/ChartCard";
import { DrillDrawer } from "@/components/DrillDrawer";
import { TrendChart } from "@/components/charts/TrendChart";
import { Card, PageHeader } from "@/components/ui";
import { getLedger } from "@/lib/data";
import { trendPoints } from "@/lib/metrics";
import { href, resolveView, type SearchParams } from "@/lib/view";

export default async function StatementsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ledger = getLedger();
  const view = resolveView(sp, ledger);
  const months = view.trend.slice(-6);
  const rows = ledger.tree(view.periods);
  const drill = (dc: string, dper?: Period) => href("/statements", sp, { dc, dp: null, dper: dper ?? null });

  const netPoints = view.trend.map((p) => {
    const rev = ledger.budget({ periods: [p], categoryIds: ["rev"] });
    const costs = ledger.budget({ periods: [p], categoryIds: ["opex"] });
    return { period: p, label: periodLabel(p, true), actual: -ledger.netIncome([p]), budget: costs - rev };
  });
  const multiples = [
    { id: "rev", title: "Revenue and income", points: trendPoints(ledger, view.trend, ["rev"]), income: true },
    { id: "opex", title: "Operating expenses", points: trendPoints(ledger, view.trend, ["opex"]), income: false },
    { id: "rd", title: "Research and development", points: trendPoints(ledger, view.trend, ["rd"]), income: false },
    { id: "net", title: "Net loss", points: netPoints, income: false },
  ];

  const netBy = (periods: Period[]) => ledger.netIncome(periods);
  const netBudget = (periods: Period[]) => ledger.budget({ periods, categoryIds: ["rev"] }) - ledger.budget({ periods, categoryIds: ["opex"] });

  return (
    <>
      <PageHeader title="Statements" subtitle={`Income statement · last 6 months and ${view.label} · USD thousands, negatives in parentheses`} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {multiples.map((m) => (
          <ChartCard
            key={m.id}
            title={m.title}
            subtitle="Last 12 months, USD"
            legend={[
              { label: "Actual", color: "var(--series-1)" },
              { label: "Budget", color: "var(--text-secondary)", dashed: true },
            ]}
            table={{
              columns: ["Month", "Actual", "Budget"],
              rows: m.points.map((p) => [periodLabel(p.period), formatCompactCurrency(p.actual), formatCompactCurrency(p.budget)]),
            }}
          >
            <TrendChart
              data={m.points}
              compact
              height={150}
              series={[
                { key: "actual", label: "Actual", color: "var(--series-1)", drill: m.id === "net" ? undefined : { dc: m.id } },
                { key: "budget", label: "Budget", color: "var(--text-secondary)", dashed: true },
              ]}
              varianceOf={["actual", "budget"]}
              favorableWhenUp={m.income}
            />
          </ChartCard>
        ))}
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-[15px] font-semibold text-ink">Income statement</h2>
          <span className="text-[12px] text-ink-3">Click any number for transactions</span>
        </div>
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[900px] text-[13px]">
            <thead className="bg-subtle text-[12px] text-ink-3">
              <tr>
                <th className="sticky left-0 bg-subtle px-5 py-2 text-left font-medium">Line</th>
                {months.map((p) => (
                  <th key={p} className="px-3 py-2 text-right font-medium">
                    {periodLabel(p)}
                  </th>
                ))}
                <th className="border-l border-line px-3 py-2 text-right font-medium">{view.mode === "ytd" ? "YTD" : periodLabel(view.period)} actual</th>
                <th className="px-3 py-2 text-right font-medium">Budget</th>
                <th className="px-5 py-2 text-right font-medium">Var %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const strong = r.depth === 0 || r.hasChildren;
                return (
                  <tr key={r.category.id} className={`border-b border-line/70 ${r.depth === 0 ? "bg-subtle/60" : ""}`}>
                    <td className={`sticky left-0 bg-inherit py-2 pr-3 ${strong ? "font-semibold text-ink" : "text-ink-2"}`} style={{ paddingLeft: 20 + r.depth * 16 }}>
                      {r.category.name}
                    </td>
                    {months.map((p) => {
                      const a = ledger.actual({ periods: [p], categoryIds: [r.category.id] });
                      return (
                        <td key={p} className={`px-3 py-2 text-right ${strong ? "font-semibold" : ""}`}>
                          <Link href={drill(r.category.id, p)} scroll={false} className="hover:underline">
                            {formatAmount(a, { parens: true })}
                          </Link>
                        </td>
                      );
                    })}
                    <td className={`border-l border-line px-3 py-2 text-right ${strong ? "font-semibold" : ""}`}>{formatAmount(r.variance.actual, { parens: true })}</td>
                    <td className="px-3 py-2 text-right text-ink-2">{formatAmount(r.variance.comparison, { parens: true })}</td>
                    <td className={`px-5 py-2 text-right ${r.variance.delta === 0 || r.variance.comparison === 0 ? "text-ink-3" : r.variance.favorable ? "text-good" : "text-bad"}`}>
                      {formatSignedPct(r.variance.comparison ? r.variance.deltaPct : null)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-line-strong bg-subtle/60 font-semibold">
                <td className="sticky left-0 bg-inherit px-5 py-2 text-ink">Net income (loss)</td>
                {months.map((p) => (
                  <td key={p} className="px-3 py-2 text-right">
                    {formatAmount(netBy([p]), { parens: true })}
                  </td>
                ))}
                <td className="border-l border-line px-3 py-2 text-right">{formatAmount(netBy(view.periods), { parens: true })}</td>
                <td className="px-3 py-2 text-right text-ink-2">{formatAmount(netBudget(view.periods), { parens: true })}</td>
                <td className="px-5 py-2 text-right text-ink-3">
                  {formatSignedPct(netBudget(view.periods) ? (netBy(view.periods) - netBudget(view.periods)) / Math.abs(netBudget(view.periods)) : null)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-3 text-[12px] text-ink-3">Balance sheet and cash flow statements follow once real ledgers are connected in the next milestone.</p>

      <DrillDrawer ledger={ledger} sp={sp} view={view} path="/statements" />
    </>
  );
}
