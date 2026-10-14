import Link from "next/link";
import { can } from "@vantiq/db";
import { formatAmount, formatCompactCurrency, formatCurrency, formatDate, formatSignedAmount, type Variance } from "@vantiq/domain";
import { approvePackAction, reopenPackAction } from "@/app/actions/packs";
import { SubmitButton } from "@/components/AuthForm";
import { ChartCard } from "@/components/ChartCard";
import { NoData } from "@/components/NoData";
import { BulletRows } from "@/components/charts/BulletRows";
import { TrendChart } from "@/components/charts/TrendChart";
import { Card, PageHeader, StatusPill, VarianceChip } from "@/components/ui";
import { getWorkspace } from "@/lib/data";
import { packState, packStatusText } from "@/lib/pack";
import { one, resolveView, type SearchParams } from "@/lib/view";

export const metadata = { title: "Review pack · Vantiq Finance" };

const signed = (v: Variance) => (v.delta === 0 ? "text-ink-3" : v.favorable ? "text-good" : "text-bad");

export default async function PackPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  if (!ws.ledger.hasData()) return <NoData title="Review pack" canImport={ws.mode === "db" && can.importData(ws.role)} />;
  const view = resolveView({ period: one(sp, "period") }, ws.ledger);
  const st = await packState(ws, view.period);
  const pack = st.shown;
  const ready = st.checks.every((c) => c.ok);
  const canApprove = ws.mode === "db" && can.approvePack(ws.role);
  const error = one(sp, "perr");

  return (
    <>
      <PageHeader title="Review pack" subtitle={`${pack.companyName} · ${pack.label} · the month's numbers, explanations and runway in one document`}>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/pack/pdf?period=${pack.period}`}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-[14px] font-medium text-ink hover:bg-subtle"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
            </svg>
            Download PDF
          </a>
          {canApprove && !st.locked && (
            <form action={approvePackAction}>
              <input type="hidden" name="period" value={pack.period} />
              {ready ? (
                <SubmitButton label={`Approve ${pack.label}`} pendingLabel="Approving…" />
              ) : (
                <button type="button" disabled className="h-9 cursor-not-allowed rounded-md bg-accent px-4 text-[14px] font-medium text-accent-contrast opacity-50" title="Finish the checks below first">
                  Approve {pack.label}
                </button>
              )}
            </form>
          )}
        </div>
      </PageHeader>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-bad/10 px-3 py-2 text-[13px] text-bad">
          {error}
        </p>
      )}

      {st.locked ? (
        <Card className="mb-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <StatusPill tone="accent">Approved</StatusPill>
                <span className="text-[13px] text-ink-2">{packStatusText(st)}. The month is locked and this pack shows what was approved.</span>
              </div>
              {st.changes.length > 0 && (
                <div role="alert" className="mt-3 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-ink">
                  <strong className="font-semibold">Post-close change.</strong> {st.changes.length} line{st.changes.length === 1 ? "" : "s"} changed in the books after approval:{" "}
                  {st.changes
                    .slice(0, 4)
                    .map((c) => `${c.name} ${formatCompactCurrency(c.was)} → ${formatCompactCurrency(c.now)}`)
                    .join("; ")}
                  {st.changes.length > 4 ? "; and more" : ""}. Reopen the month to review them.
                </div>
              )}
            </div>
            {ws.mode === "db" && can.reopenPack(ws.role) && (
              <details className="text-[13px]">
                <summary className="cursor-pointer rounded-md border border-line-strong px-3 py-1.5 text-ink hover:bg-subtle">Reopen month</summary>
                <form action={reopenPackAction} className="mt-2 flex w-72 flex-col gap-2">
                  <input type="hidden" name="period" value={pack.period} />
                  <label htmlFor="reason" className="text-ink-2">
                    Why? This goes in the audit log.
                  </label>
                  <textarea id="reason" name="reason" required maxLength={500} rows={2} className="rounded-md border border-line-strong bg-surface px-2 py-1.5 text-ink" />
                  <SubmitButton label="Reopen" pendingLabel="Reopening…" className="!h-8 !text-[13px]" />
                </form>
              </details>
            )}
          </div>
        </Card>
      ) : (
        <Card className="mb-4 p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusPill tone="neutral">Draft</StatusPill>
            <span className="text-[13px] text-ink-2">
              {ws.mode === "demo"
                ? "Sign up and load the sample data to approve packs. Downloading the PDF works here."
                : st.record?.status === "reopened"
                  ? `Reopened${st.record.reopenedByName ? ` by ${st.record.reopenedByName}` : ""}${st.record.reopenedAt ? ` on ${formatDate(st.record.reopenedAt.toISOString().slice(0, 10))}` : ""}. Approve again when it is ready.`
                  : ready
                    ? "Ready to approve. Approving locks the month and keeps a copy of exactly what was approved."
                    : "Before approving, finish these checks."}
            </span>
          </div>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {st.checks.map((c) => (
              <li key={c.key} className="flex gap-2.5 rounded-md border border-line p-3">
                <span aria-hidden className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] ${c.ok ? "bg-good/15 text-good" : "bg-warn/15 text-warn"}`}>
                  {c.ok ? "✓" : "!"}
                </span>
                <span className="min-w-0 text-[13px]">
                  <span className="block font-medium text-ink">
                    {c.title}
                    <span className="sr-only">{c.ok ? " (done)" : " (needs work)"}</span>
                  </span>
                  <span className="block text-ink-2">{c.detail}</span>
                  {c.href && (
                    <Link href={c.href} className="mt-1 inline-block font-medium text-accent hover:underline">
                      Fix this →
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {pack.kpis.map((k) => (
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

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="p-5 xl:col-span-2">
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Summary</h2>
          <ul className="flex flex-col gap-2.5 text-[14px] leading-relaxed text-ink">
            {pack.headlines.map((h) => (
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
          table={{ columns: ["Month", "Actual", "Budget"], rows: pack.opexTrend.map((p) => [p.label, formatCompactCurrency(p.actual), formatCompactCurrency(p.budget)]) }}
        >
          <TrendChart
            data={pack.opexTrend}
            series={[
              { key: "actual", label: "Actual", color: "var(--series-1)" },
              { key: "budget", label: "Budget", color: "var(--text-secondary)", dashed: true },
            ]}
            varianceOf={["actual", "budget"]}
            height={220}
          />
        </ChartCard>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="border-b border-line px-5 py-3">
          <h2 className="text-[15px] font-semibold text-ink">Material variances · {pack.material.length}</h2>
          <p className="text-[12px] text-ink-3">Every line over the materiality threshold, with its explanation and the transactions it cites</p>
        </div>
        {pack.material.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-ink-3">No line moved by more than the materiality threshold.</p>
        ) : (
          <ol className="divide-y divide-line">
            {pack.material.map((m) => (
              <li key={m.id} className="grid grid-cols-1 gap-3 px-5 py-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                <div>
                  <p className="text-[14px] font-medium text-ink">{m.name}</p>
                  <p className="text-[12px] text-ink-3">{m.parentName}</p>
                  <p className="num mt-1 text-[13px] text-ink-2">
                    {formatCompactCurrency(m.variance.actual)} vs {formatCompactCurrency(m.variance.comparison)}
                  </p>
                  <p className={`num text-[13px] ${signed(m.variance)}`}>
                    {formatSignedAmount(m.variance.delta)}k <VarianceChip v={m.variance} />
                  </p>
                </div>
                <div className="min-w-0">
                  {m.explanation ? (
                    <>
                      <p className="text-[14px] leading-relaxed text-ink">{m.explanation.text}</p>
                      <p className="mt-1 text-[12px] text-ink-3">
                        {m.explanation.status === "ai_draft" ? (
                          <StatusPill tone="warn">Draft, not reviewed</StatusPill>
                        ) : (
                          `${m.explanation.status === "edited" ? "Edited" : "Accepted"}${m.explanation.by ? ` by ${m.explanation.by}` : ""}`
                        )}
                      </p>
                      {m.cited.length > 0 && (
                        <ul className="mt-2 flex flex-col gap-1 border-t border-line pt-2 text-[12px] text-ink-2">
                          {m.cited.map((c, i) => (
                            <li key={i} className="flex flex-wrap gap-x-3">
                              <span className="w-20 text-ink-3">{formatDate(c.date)}</span>
                              <span className="font-medium text-ink">{c.vendor}</span>
                              <span className="min-w-0 flex-1">{c.memo}</span>
                              <span className="num">{formatCurrency(c.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p className="text-[13px] text-warn">
                      No explanation yet.{" "}
                      {!st.locked && (
                        <Link href={`/variances?period=${pack.period}&dc=${m.id}`} className="font-medium text-accent hover:underline">
                          Write one →
                        </Link>
                      )}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card className="mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-[15px] font-semibold text-ink">Budget vs actual</h2>
          <span className="text-[12px] text-ink-3">USD thousands · {pack.label} and {pack.ytdLabel}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[860px] text-[13px]">
            <thead className="bg-subtle text-[12px] text-ink-3">
              <tr>
                <th className="px-5 py-2 text-left font-medium">Line</th>
                <th className="px-3 py-2 text-right font-medium">Actual</th>
                <th className="px-3 py-2 text-right font-medium">Budget</th>
                <th className="px-3 py-2 text-right font-medium">Variance</th>
                <th className="px-3 py-2 text-right font-medium">Var %</th>
                <th className="border-l border-line px-3 py-2 text-right font-medium">YTD actual</th>
                <th className="px-3 py-2 text-right font-medium">YTD budget</th>
                <th className="px-5 py-2 text-right font-medium">YTD var %</th>
              </tr>
            </thead>
            <tbody>
              {pack.lines.map((l) => (
                <tr key={l.id} className={`border-b border-line/70 ${l.depth === 0 ? "bg-subtle/60" : ""} ${l.material ? "shadow-[inset_3px_0_0_var(--warning)]" : ""}`}>
                  <td className={`py-2 pr-3 ${l.group ? "font-semibold text-ink" : "text-ink-2"}`} style={{ paddingLeft: 20 + l.depth * 16 }}>
                    {l.name}
                  </td>
                  <td className="px-3 py-2 text-right">{formatAmount(l.month.actual)}</td>
                  <td className="px-3 py-2 text-right text-ink-2">{formatAmount(l.month.comparison)}</td>
                  <td className={`px-3 py-2 text-right ${signed(l.month)}`}>{formatSignedAmount(l.month.delta)}</td>
                  <td className="px-3 py-2 text-right">{l.month.comparison === 0 ? <span className="text-ink-3">—</span> : <VarianceChip v={l.month} />}</td>
                  <td className="border-l border-line px-3 py-2 text-right">{formatAmount(l.ytd.actual)}</td>
                  <td className="px-3 py-2 text-right text-ink-2">{formatAmount(l.ytd.comparison)}</td>
                  <td className="px-5 py-2 text-right">{l.ytd.comparison === 0 ? <span className="text-ink-3">—</span> : <VarianceChip v={l.ytd} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="R&D spend by program"
          subtitle={`Actual vs budget, USD · ${pack.label}`}
          table={{ columns: ["Program", "Actual", "Budget"], rows: pack.programs.map((p) => [p.label, formatCompactCurrency(p.variance.actual), formatCompactCurrency(p.variance.comparison)]) }}
        >
          <BulletRows rows={pack.programs.map((p, i) => ({ id: String(i), label: p.label, sublabel: p.sublabel, variance: p.variance, href: `/programs?period=${pack.period}` }))} />
        </ChartCard>
        <ChartCard
          title={pack.cash ? (pack.cash.zeroText ? `Cash runs out around ${pack.cash.zeroText} at today's spending` : "Cash and runway") : "Cash and runway"}
          subtitle={pack.cash ? `Month-end cash, USD · ${pack.cash.runwayMonths === null ? "not burning cash" : `${pack.cash.runwayMonths.toFixed(1)} months at ${formatCompactCurrency(pack.cash.avgBurn)}/mo net burn`}` : "No cash balances imported"}
          table={{ columns: ["Month", "Cash"], rows: (pack.cash?.trend ?? []).map((p) => [p.label, formatCompactCurrency(p.value)]) }}
        >
          {pack.cash ? (
            <TrendChart data={pack.cash.trend.map((p) => ({ period: p.period, label: p.label, cash: p.value }))} series={[{ key: "cash", label: "Cash", color: "var(--series-1)" }]} height={220} />
          ) : (
            <p className="text-[13px] text-ink-3">Import month-end cash balances to add runway to the pack.</p>
          )}
        </ChartCard>
      </div>
    </>
  );
}
