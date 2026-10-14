import Link from "next/link";
import {
  formatAmount,
  formatCompactCurrency,
  formatSignedPct,
  periodLabel,
  UNASSIGNED,
} from "@vantiq/domain";
import { ChartCard } from "@/components/ChartCard";
import { DrillDrawer } from "@/components/DrillDrawer";
import { MixChart } from "@/components/charts/MixChart";
import { TrendChart } from "@/components/charts/TrendChart";
import { Card, PageHeader, VarianceChip } from "@/components/ui";
import { MappingBanner, NoData } from "@/components/NoData";
import { getWorkspace } from "@/lib/data";
import { can } from "@vantiq/db";
import { varianceFor } from "@/lib/metrics";
import { href, one, resolveView, type SearchParams } from "@/lib/view";

const SLOTS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  if (!ws.ledger.hasData()) return <NoData title="R&D programs" canImport={ws.mode === "db" && can.importData(ws.role)} />;
  const ledger = ws.ledger;
  const view = resolveView(sp, ledger);
  const programs = ledger.data.programs;
  const selected = programs.find((p) => p.id === one(sp, "program")) ?? null;
  const rdTotal = ledger.actual({ periods: view.periods, categoryIds: ["rd"] });

  // C8: spend over time, one line per program. Colors follow the program, not its rank.
  const lineKeys = [...programs.map((p) => p.id), UNASSIGNED];
  const trend = view.trend.map((period) => {
    const row: Record<string, string | number> = { period, label: periodLabel(period, true) };
    for (const id of lineKeys) row[id] = ledger.actual({ periods: [period], categoryIds: ["rd"], programId: id === UNASSIGNED ? null : id });
    return row;
  });
  const series = lineKeys.map((id, i) => {
    const prog = programs.find((p) => p.id === id);
    return { key: id, label: prog ? prog.code : "Unassigned", color: i < SLOTS.length ? SLOTS[i]! : "var(--series-other)" };
  });

  // C9: cost mix by month for the selected program (or all R&D).
  const parts = ledger.childrenOf("rd").map((c, i) => ({ key: c.id, label: c.name, color: SLOTS[i] ?? "var(--series-other)" }));
  const mix = view.trend.map((period) => {
    const row: Record<string, string | number> = { period, label: periodLabel(period, true) };
    for (const p of parts) row[p.key] = Math.max(0, ledger.actual({ periods: [period], categoryIds: [p.key], programId: selected ? selected.id : undefined }));
    return row;
  });
  const top = [...programs]
    .map((p) => ({ p, v: varianceFor(ledger, view.periods, "rd", p.id) }))
    .sort((a, b) => b.v.actual - a.v.actual)[0];

  return (
    <>
      <PageHeader title="R&D programs" subtitle={`R&D spend by program · ${view.label} · compared with budget`} />
      <MappingBanner unmapped={ws.unmapped} unconfirmed={ws.unconfirmed} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {programs.map((p, i) => {
          const v = varianceFor(ledger, view.periods, "rd", p.id);
          const active = selected?.id === p.id;
          return (
            <Link
              key={p.id}
              href={href("/programs", sp, { program: active ? null : p.id, dc: null, dp: null, dper: null })}
              scroll={false}
              aria-current={active ? "true" : undefined}
              className={`rounded-[10px] border bg-surface p-4 transition-colors ${active ? "border-accent ring-1 ring-accent" : "border-line hover:border-line-strong"}`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SLOTS[i] }} aria-hidden />
                  {p.code}
                </span>
                {p.phase && <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium text-ink-2">{p.phase}</span>}
              </div>
              <p className="mt-0.5 text-[12px] text-ink-3">{p.therapeuticArea}</p>
              <p className="num mt-3 text-[24px] font-semibold text-ink">{formatCompactCurrency(v.actual)}</p>
              <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
                <VarianceChip v={v} /> vs budget {formatCompactCurrency(v.comparison)} ·{" "}
                {rdTotal ? Math.round((v.actual / rdTotal) * 100) : 0}% of R&D
              </p>
            </Link>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title={top ? `${top.p.code} is the largest program at ${Math.round((top.v.actual / (rdTotal || 1)) * 100)}% of R&D spend` : "R&D spend by program"}
          subtitle={`Monthly R&D spend by program, USD · last 12 months · click a month for transactions`}
          legend={series.map((s) => ({ label: s.label, color: s.color }))}
          table={{
            columns: ["Month", ...series.map((s) => s.label)],
            rows: trend.map((r) => [periodLabel(String(r.period)), ...lineKeys.map((k) => formatCompactCurrency(Number(r[k])))]),
          }}
        >
          <TrendChart
            data={trend as never}
            series={series.map((s, i) => (i === 0 ? { ...s, drill: { dc: "rd" } } : s))}
            height={260}
          />
        </ChartCard>
        <ChartCard
          title={`Cost mix for ${selected ? selected.code : "all R&D"}`}
          subtitle={`Share of monthly R&D spend by type · last 12 months · ${selected ? "click a program card again to see all R&D" : "pick a program card to filter"}`}
          table={{
            columns: ["Month", ...parts.map((p) => p.label)],
            rows: mix.map((r) => [periodLabel(String(r.period)), ...parts.map((p) => formatCompactCurrency(Number(r[p.key])))]),
          }}
        >
          <MixChart data={mix} parts={parts} programId={selected?.id} />
        </ChartCard>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="border-b border-line px-5 py-3">
          <h2 className="text-[15px] font-semibold text-ink">Program spend by cost type</h2>
          <p className="text-[12px] text-ink-3">USD thousands · {view.label} · click a number for transactions</p>
        </div>
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[860px] text-[13px]">
            <thead className="bg-subtle text-[12px] text-ink-3">
              <tr>
                <th className="px-5 py-2 text-left font-medium">Program</th>
                {parts.map((p) => (
                  <th key={p.key} className="px-3 py-2 text-right font-medium">
                    {p.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-right font-medium">Budget</th>
                <th className="px-5 py-2 text-right font-medium">Var %</th>
              </tr>
            </thead>
            <tbody>
              {[...programs.map((p) => ({ id: p.id, label: [p.code, p.therapeuticArea].filter(Boolean).join(" · ") })), { id: UNASSIGNED, label: "Not assigned to a program" }].map((row) => {
                const programId = row.id === UNASSIGNED ? null : row.id;
                const dp = row.id === UNASSIGNED ? "none" : row.id;
                const v = varianceFor(ledger, view.periods, "rd", programId);
                return (
                  <tr key={row.id} className="border-b border-line/70">
                    <td className="px-5 py-2 text-ink">{row.label}</td>
                    {parts.map((p) => {
                      const a = ledger.actual({ periods: view.periods, categoryIds: [p.key], programId });
                      return (
                        <td key={p.key} className="px-3 py-2 text-right">
                          {a === 0 ? (
                            <span className="text-ink-3">–</span>
                          ) : (
                            <Link href={href("/programs", sp, { dc: p.key, dp, dper: null })} scroll={false} className="hover:underline">
                              {formatAmount(a)}
                            </Link>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-semibold">{formatAmount(v.actual)}</td>
                    <td className="px-3 py-2 text-right text-ink-2">{formatAmount(v.comparison)}</td>
                    <td className="px-5 py-2 text-right">{v.comparison ? <VarianceChip v={v} /> : <span className="text-ink-3">{formatSignedPct(null)}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <DrillDrawer ledger={ledger} sp={sp} view={view} path="/programs" />
    </>
  );
}
