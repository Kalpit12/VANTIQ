import Link from "next/link";
import { can } from "@vantiq/db";
import { formatCompactCurrency, periodLabel } from "@vantiq/domain";
import { importActivityAction } from "@/app/actions/trials";
import { SubmitButton } from "@/components/AuthForm";
import { NoData } from "@/components/NoData";
import { Card, PageHeader, StatusPill } from "@/components/ui";
import { getWorkspace } from "@/lib/data";
import { accrualsAt, trialsFor } from "@/lib/trials";
import { one, resolveView, type SearchParams } from "@/lib/view";

export const metadata = { title: "Trial accruals · Vantiq Finance" };

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default async function TrialsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  if (!ws.ledger.hasData()) return <NoData title="Trial accruals" canImport={ws.mode === "db" && can.importData(ws.role)} />;
  const asOf = resolveView({ period: one(sp, "period") }, ws.ledger).period;
  const rows = accrualsAt(ws, await trialsFor(ws), asOf);
  const canEdit = ws.mode === "db" && can.importData(ws.role);
  const total = rows.reduce((s, r) => s + r.est.accrual, 0);
  const late = rows.filter((r) => r.est.estimatedPeriods.length > 0);
  const byCro = [...rows.reduce((m, r) => m.set(r.trial.croName, (m.get(r.trial.croName) ?? 0) + r.est.accrual), new Map<string, number>())].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const maxCro = Math.max(1, ...byCro.map(([, v]) => Math.abs(v)));
  const error = one(sp, "terr");
  const note = one(sp, "tnote");
  const label = periodLabel(asOf);

  return (
    <>
      <PageHeader title="Trial accruals" subtitle={`Work done by each CRO against what it has billed · as of the end of ${label}`}>
        <div className="flex flex-wrap items-center gap-2">
          {rows.length > 0 && (
            <a href={`/trials/journal?period=${asOf}`} className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3 text-[14px] font-medium text-ink hover:bg-subtle">
              Download journal entries
            </a>
          )}
          {canEdit && (
            <Link href="/trials/new" className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-[14px] font-medium text-accent-contrast hover:opacity-90">
              Add a trial
            </Link>
          )}
        </div>
      </PageHeader>
      {error && (
        <p role="alert" className="mb-4 rounded-md bg-bad/10 px-3 py-2 text-[13px] text-bad">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="mb-4 rounded-md bg-good/10 px-3 py-2 text-[13px] text-ink">
          {note}
        </p>
      )}

      {rows.length === 0 ? (
        <Card className="max-w-[720px] p-6">
          <h2 className="text-[17px] font-semibold text-ink">No trials yet</h2>
          <p className="mt-1 text-[13px] text-ink-2">
            Add each clinical trial with its CRO contract: the monthly management fee and the price per site, patient and visit. Then record the activity the CRO reports each month,
            and Vantiq works out how much unbilled work to accrue.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="p-5">
              <p className="text-[12px] text-ink-3">Suggested accrual, all trials</p>
              <p className="num mt-1 text-[26px] font-semibold text-ink">{formatCompactCurrency(total)}</p>
              <p className="mt-1 text-[12px] text-ink-2">{total >= 0 ? "Work done that CROs haven't billed yet" : "CROs billed ahead of the work: a prepayment"}</p>
            </Card>
            <Card className="p-5">
              <p className="text-[12px] text-ink-3">CRO reports</p>
              <p className="num mt-1 text-[26px] font-semibold text-ink">
                {rows.length - late.length} of {rows.length} in
              </p>
              <p className="mt-1 text-[12px] text-ink-2">
                {late.length === 0 ? `Every CRO has reported ${label}.` : `${late.map((r) => r.trial.code).join(", ")}: missing months are estimated from the last three reports.`}
              </p>
            </Card>
            <Card className="p-5">
              <h2 className="mb-2 text-[13px] font-semibold text-ink">Accrual by CRO</h2>
              <ul className="flex flex-col gap-2">
                {byCro.map(([cro, v]) => (
                  <li key={cro} className="text-[12px]">
                    <div className="flex justify-between gap-2">
                      <span className="truncate text-ink">{cro}</span>
                      <span className="num text-ink">{formatCompactCurrency(v)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-subtle" aria-hidden>
                      <div className={`h-2 rounded-full ${v >= 0 ? "bg-[var(--series-1)]" : "bg-[var(--series-2)]"}`} style={{ width: `${(Math.abs(v) / maxCro) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card className="mt-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="text-[15px] font-semibold text-ink">Trials</h2>
              <span className="text-[12px] text-ink-3">USD · cumulative to the end of {label}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="num w-full min-w-[980px] text-[13px]">
                <thead className="bg-subtle text-[12px] text-ink-3">
                  <tr>
                    <th className="px-5 py-2 text-left font-medium">Trial</th>
                    <th className="px-3 py-2 text-left font-medium">CRO</th>
                    <th className="px-3 py-2 text-right font-medium">Contract value</th>
                    <th className="px-3 py-2 text-right font-medium">Billed to date</th>
                    <th className="px-3 py-2 text-right font-medium">Work done</th>
                    <th className="px-3 py-2 text-right font-medium">Suggested accrual</th>
                    <th className="px-5 py-2 text-left font-medium">Last CRO report</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ trial, est }) => (
                    <tr key={trial.id} className="border-b border-line/70">
                      <td className="px-5 py-2.5">
                        <Link href={`/trials/${trial.id}?period=${asOf}`} className="font-mono text-[12px] font-medium text-accent hover:underline">
                          {trial.code}
                        </Link>
                        <div className="text-[12px] text-ink-3">
                          {[trial.programCode, trial.phase].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-ink-2">{trial.croName}</td>
                      <td className="px-3 py-2.5 text-right">{formatCompactCurrency(est.contractValue)}</td>
                      <td className="px-3 py-2.5 text-right">{formatCompactCurrency(est.billed)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {formatCompactCurrency(est.earned)} <span className="text-[12px] text-ink-3">({pct(est.pctComplete)})</span>
                      </td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${est.accrual > 0 ? "text-warn" : "text-ink"}`}>{formatCompactCurrency(est.accrual)}</td>
                      <td className="px-5 py-2.5">
                        {est.lastReported ? <span className="text-ink-2">{periodLabel(est.lastReported)}</span> : <span className="text-ink-3">None yet</span>}{" "}
                        {est.estimatedPeriods.length > 0 && <StatusPill tone="warn">{est.estimatedPeriods.length} mo estimated</StatusPill>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {canEdit && rows.length > 0 && (
        <Card className="mt-4 max-w-[720px] p-5">
          <h2 className="text-[15px] font-semibold text-ink">Import a CRO activity report</h2>
          <p className="mt-1 text-[13px] text-ink-2">
            CSV or Excel with one row per trial and month: trial ID, month, sites activated, patients enrolled and visits completed in that month. A month already recorded is replaced.
          </p>
          <form action={importActivityAction} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[13px] font-medium text-ink">
              Activity file
              <input type="file" name="file" accept=".csv,.xlsx,.xls" required className="text-[13px] font-normal text-ink-2" />
            </label>
            <SubmitButton label="Import activity" pendingLabel="Importing…" />
          </form>
        </Card>
      )}
      {ws.mode === "demo" && <p className="mt-4 text-[12px] text-ink-3">These are Helixa&apos;s sample trials. Sign up to add your own.</p>}
    </>
  );
}
