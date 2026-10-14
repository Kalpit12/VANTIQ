import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@vantiq/db";
import {
  accrualJournal,
  activityWithEstimates,
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  periodLabel,
} from "@vantiq/domain";
import { addChangeOrderAction, saveActivityAction } from "@/app/actions/trials";
import { SubmitButton } from "@/components/AuthForm";
import { ChartCard } from "@/components/ChartCard";
import { TrendChart } from "@/components/charts/TrendChart";
import { DriverFields } from "@/components/trials/DriverFields";
import { TrialTimeline } from "@/components/trials/TrialTimeline";
import { Card, PageHeader, StatusPill } from "@/components/ui";
import { getWorkspace } from "@/lib/data";
import { accrualsAt, trialFor } from "@/lib/trials";
import { one, resolveView, type SearchParams } from "@/lib/view";

const field = "h-9 rounded-md border border-line-strong bg-surface px-2 text-[14px] text-ink";
const n = (v: number) => v.toLocaleString("en-US");
/** Whole dollars, with cents only when there are some: `$3,200`, `$19,500`. */
const price = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export default async function TrialPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ws = await getWorkspace();
  const trial = await trialFor(ws, id);
  if (!trial || !ws.ledger.hasData()) notFound();
  const asOf = resolveView({ period: one(sp, "period") }, ws.ledger).period;
  const [row] = accrualsAt(ws, [trial], asOf);
  const canEdit = ws.mode === "db" && can.importData(ws.role);
  const error = one(sp, "terr");
  const label = periodLabel(asOf);

  if (!row) {
    return (
      <>
        <PageHeader title={trial.code} subtitle={trial.name} />
        <Card className="p-5 text-[13px] text-ink-2">This trial starts in {periodLabel(trial.contract.start)}, after {label}. Pick a later month at the top.</Card>
      </>
    );
  }
  const { est } = row;
  const je = accrualJournal(trial, est);
  const { months } = activityWithEstimates(trial.contract, trial.activity, asOf);
  const curve = est.curve.map((c) => ({ period: c.period, label: `${periodLabel(c.period, true)} ${c.period.slice(2, 4)}`, contract: c.contractValue, earned: c.earned, billed: c.billed }));

  return (
    <>
      <PageHeader title={trial.code} subtitle={`${trial.name} · ${[trial.programCode, trial.phase, trial.croName].filter(Boolean).join(" · ")}`}>
        <a
          href={`/trials/journal?period=${asOf}&trial=${trial.id}`}
          className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3 text-[14px] font-medium text-ink hover:bg-subtle"
        >
          Download journal entry
        </a>
      </PageHeader>
      <p className="-mt-3 mb-4 text-[13px]">
        <Link href={`/trials?period=${asOf}`} className="text-accent hover:underline">
          ← All trials
        </Link>
      </p>
      {error && (
        <p role="alert" className="mb-4 rounded-md bg-bad/10 px-3 py-2 text-[13px] text-bad">
          {error}
        </p>
      )}
      {est.estimatedPeriods.length > 0 && (
        <p className="mb-4 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-ink">
          <strong className="font-semibold">{trial.croName} hasn&apos;t reported {est.estimatedPeriods.map((p) => periodLabel(p)).join(", ")} yet.</strong> {est.estimatedPeriods.length === 1 ? "That month uses" : "Those months use"} the
          average of the last three reports. Record the real numbers when they arrive.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="p-5 xl:col-span-2">
          <h2 className="text-[15px] font-semibold text-ink">How the accrual is worked out</h2>
          <p className="mb-3 text-[12px] text-ink-3">Cumulative to the end of {label}</p>
          <table className="num w-full text-[13px]">
            <thead className="text-left text-[12px] text-ink-3">
              <tr>
                <th className="pb-1 font-medium">Driver</th>
                <th className="pb-1 text-right font-medium">Done / contracted</th>
                <th className="pb-1 text-right font-medium">Price</th>
                <th className="pb-1 text-right font-medium">Work done</th>
              </tr>
            </thead>
            <tbody>
              {est.lines
                .filter((l) => l.contractedUnits > 0 || l.unitsToDate > 0)
                .map((l) => (
                  <tr key={l.driver} className="border-t border-line/70">
                    <td className="py-1.5 text-ink">
                      {l.label}
                      {l.unitsOverContract > 0 && (
                        <span className="block text-[12px] text-warn">
                          {n(l.unitsOverContract)} {l.unit} over contract, not counted
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-right text-ink-2">
                      {n(l.unitsToDate)} / {n(l.contractedUnits)} {l.unit}
                    </td>
                    <td className="py-1.5 pl-3 text-right text-ink-2">{price(l.unitCost)}</td>
                    <td className="py-1.5 text-right">{formatCurrency(l.earned)}</td>
                  </tr>
                ))}
              <tr className="border-t border-line-strong font-medium">
                <td className="py-1.5 text-ink" colSpan={3}>
                  Work done to date
                </td>
                <td className="py-1.5 text-right">{formatCurrency(est.earned)}</td>
              </tr>
              <tr>
                <td className="py-1.5 text-ink-2" colSpan={3}>
                  Less billed by {trial.croName} to date
                </td>
                <td className="py-1.5 text-right text-ink-2">−{formatCurrency(est.billed).replace("−", "")}</td>
              </tr>
              <tr className="border-t border-line-strong text-[14px] font-semibold">
                <td className="py-2 text-ink" colSpan={3}>
                  {est.accrual >= 0 ? "Accrue (unbilled work)" : "Prepaid (billed ahead of work)"}
                </td>
                <td className={`py-2 text-right ${est.accrual > 0 ? "text-warn" : "text-ink"}`}>{formatCurrency(Math.abs(est.accrual))}</td>
              </tr>
            </tbody>
          </table>
          {je.length > 0 && (
            <div className="mt-4 rounded-md bg-subtle p-3 text-[12px]">
              <p className="mb-1 font-medium text-ink">Journal entry, {formatDate(je[0]!.date)}</p>
              {je.map((l) => (
                <p key={l.account} className="num flex justify-between gap-3 text-ink-2">
                  <span>
                    {l.credit ? "   Cr" : "Dr"} {l.account} {l.accountName}
                  </span>
                  <span>{formatCurrency(l.debit || l.credit)}</span>
                </p>
              ))}
              <p className="mt-1 text-ink-3">Reverses on the first day of the next month.</p>
            </div>
          )}
        </Card>
        <ChartCard
          className="xl:col-span-3"
          title={
            est.accrual > 0
              ? `Work done is ${formatCompactCurrency(est.accrual)} ahead of billing`
              : est.accrual < 0
                ? `Billing is ${formatCompactCurrency(-est.accrual)} ahead of the work`
                : "Billing matches the work done"
          }
          subtitle={`Cumulative USD · contract value, work done and billed · ${periodLabel(trial.contract.start)}–${label}`}
          legend={[
            { label: "Contract value", color: "var(--text-secondary)", dashed: true },
            { label: "Work done", color: "var(--series-1)" },
            { label: "Billed", color: "var(--series-2)" },
          ]}
          table={{
            columns: ["Month", "Contract value", "Work done", "Billed"],
            rows: curve.map((c) => [periodLabel(c.period), formatCompactCurrency(c.contract), formatCompactCurrency(c.earned), formatCompactCurrency(c.billed)]),
          }}
        >
          <TrendChart
            data={curve}
            series={[
              { key: "contract", label: "Contract value", color: "var(--text-secondary)", dashed: true },
              { key: "earned", label: "Work done", color: "var(--series-1)" },
              { key: "billed", label: "Billed", color: "var(--series-2)" },
            ]}
            compact
            height={280}
          />
        </ChartCard>
      </div>

      <Card className="mt-4 p-5">
        <h2 className="mb-3 text-[15px] font-semibold text-ink">Timeline</h2>
        <TrialTimeline trial={trial} asOf={asOf} lastReported={est.lastReported} />
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-line px-5 py-3">
            <h2 className="text-[15px] font-semibold text-ink">CRO activity by month</h2>
            <p className="text-[12px] text-ink-3">New sites, patients and visits in each month</p>
          </div>
          <div className="max-h-[420px] overflow-y-auto" tabIndex={0} role="region" aria-label="CRO activity by month">
            <table className="num w-full text-[13px]">
              <thead className="sticky top-0 bg-subtle text-[12px] text-ink-3">
                <tr>
                  <th className="px-5 py-2 text-left font-medium">Month</th>
                  <th className="px-3 py-2 text-right font-medium">Sites</th>
                  <th className="px-3 py-2 text-right font-medium">Patients</th>
                  <th className="px-5 py-2 text-right font-medium">Visits</th>
                </tr>
              </thead>
              <tbody>
                {[...months].reverse().map((m) => (
                  <tr key={m.period} className="border-b border-line/70">
                    <td className="px-5 py-1.5 text-ink">
                      {periodLabel(m.period)} {m.estimated && <StatusPill tone="warn">Estimated</StatusPill>}
                    </td>
                    <td className="px-3 py-1.5 text-right">{n(m.sites)}</td>
                    <td className="px-3 py-1.5 text-right">{n(m.patients)}</td>
                    <td className="px-5 py-1.5 text-right">{n(m.visits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <form action={saveActivityAction} className="flex flex-wrap items-end gap-2 border-t border-line px-5 py-4">
              <input type="hidden" name="trialId" value={trial.id} />
              <label className="flex flex-col gap-1 text-[12px] font-medium text-ink">
                Month
                <input type="month" name="period" required defaultValue={est.estimatedPeriods[0] ?? asOf} className={field} />
              </label>
              {(["sites", "patients", "visits"] as const).map((k) => (
                <label key={k} className="flex w-24 flex-col gap-1 text-[12px] font-medium capitalize text-ink">
                  {k}
                  <input name={k} inputMode="numeric" pattern="[0-9,]*" defaultValue="0" className={field} />
                </label>
              ))}
              <SubmitButton label="Record activity" pendingLabel="Saving…" />
            </form>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-line px-5 py-3">
            <h2 className="text-[15px] font-semibold text-ink">Contract and change orders</h2>
            <p className="text-[12px] text-ink-3">Contract value {formatCurrency(est.contractValue)} as of {label}</p>
          </div>
          <ul className="divide-y divide-line text-[13px]">
            <li className="px-5 py-3">
              <p className="font-medium text-ink">Original contract · from {periodLabel(trial.contract.start)}</p>
              <p className="text-ink-2">{trial.contract.items.map((i) => `${n(i.units)} ${i.driver === "monthly" ? "months" : `${i.driver}s`} at ${price(i.unitCost)}`).join(" · ")}</p>
            </li>
            {trial.contract.changeOrders.map((c) => (
              <li key={c.number} className="px-5 py-3">
                <p className="font-medium text-ink">
                  Change order {c.number} · from {periodLabel(c.effective)} {c.effective > asOf && <StatusPill tone="neutral">Not yet in effect</StatusPill>}
                </p>
                <p className="text-ink">{c.description}</p>
                <p className="text-ink-2">{c.items.map((i) => `+${n(i.units)} ${i.driver === "monthly" ? "months" : `${i.driver}s`} at ${price(i.unitCost)}`).join(" · ")}</p>
              </li>
            ))}
          </ul>
          {canEdit && (
            <details className="border-t border-line px-5 py-4">
              <summary className="cursor-pointer text-[13px] font-medium text-accent">Add a change order</summary>
              <form action={addChangeOrderAction} className="mt-3 flex flex-col gap-3">
                <input type="hidden" name="trialId" value={trial.id} />
                <div className="flex flex-wrap gap-3">
                  <label className="flex flex-col gap-1 text-[12px] font-medium text-ink">
                    Takes effect
                    <input type="month" name="effective" required className={field} />
                  </label>
                  <label className="flex min-w-0 flex-1 flex-col gap-1 text-[12px] font-medium text-ink">
                    What changed
                    <input name="description" required maxLength={300} className={field} />
                  </label>
                </div>
                <p className="text-[12px] text-ink-2">Units this change order adds, at its prices.</p>
                <DriverFields idPrefix="co" />
                <div>
                  <SubmitButton label="Add change order" pendingLabel="Saving…" />
                </div>
              </form>
            </details>
          )}
        </Card>
      </div>
    </>
  );
}
