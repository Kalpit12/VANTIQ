import { can } from "@vantiq/db";
import { formatCompactCurrency, formatDate, INCOME_KINDS, periodLabel, type ExpectedReceipt, type ReceiptRow } from "@vantiq/domain";
import { createIncomeSourceAction, removeReceiptAction, saveReceiptAction } from "@/app/actions/income";
import { ChartCard } from "@/components/ChartCard";
import { SubmitButton } from "@/components/AuthForm";
import { NoData } from "@/components/NoData";
import { ReceiptsTimeline } from "@/components/income/ReceiptsTimeline";
import { Card, PageHeader, StatusPill } from "@/components/ui";
import { getWorkspace } from "@/lib/data";
import { incomeAt, incomeSourcesFor } from "@/lib/income";
import { one, resolveView, type SearchParams } from "@/lib/view";

export const metadata = { title: "Grants and income · Vantiq Finance" };

const field = "h-9 rounded-md border border-line-strong bg-surface px-3 text-[14px] text-ink";
const label = "flex flex-col gap-1 text-[13px] font-medium text-ink";
const pct = (x: number) => `${Math.round(x * 100)}%`;
const kindLabel = (k: string) => INCOME_KINDS.find((x) => x.kind === k)?.label ?? k;

function Status({ r }: { r: ReceiptRow }) {
  if (r.status === "received")
    return (
      <span className="text-ink-2">
        Received {formatDate(r.receivedOn!)}
        {r.monthsLate! > 0 && <span className="text-warn"> · {r.monthsLate} mo late</span>}
      </span>
    );
  if (r.status === "overdue") return <StatusPill tone="warn">Overdue, not in the books</StatusPill>;
  return <span className="text-ink-3">Expected</span>;
}

function ReceiptFields({ r, sourceId }: { r?: ExpectedReceipt; sourceId: string }) {
  return (
    <>
      <input type="hidden" name="sourceId" value={sourceId} />
      {r && <input type="hidden" name="receiptId" value={r.id} />}
      <label className={`${label} min-w-[180px] flex-[2]`}>
        Receipt
        <input name="label" required maxLength={120} defaultValue={r?.label} placeholder="Phase 1 data readout" className={field} />
      </label>
      <label className={`${label} w-[150px]`}>
        Expected
        <input name="expected" type="month" required defaultValue={r?.expected} className={field} />
      </label>
      <label className={`${label} w-[140px]`}>
        Amount (USD)
        <input name="amount" inputMode="decimal" required defaultValue={r ? String(r.amount / 100) : undefined} className={`${field} num`} />
      </label>
      <label className={`${label} w-[100px]`}>
        Likelihood %
        <input name="probability" inputMode="numeric" required defaultValue={r ? String(Math.round(r.probability * 100)) : "100"} className={`${field} num`} />
      </label>
    </>
  );
}

export default async function IncomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  if (!ws.ledger.hasData()) return <NoData title="Grants and income" canImport={ws.mode === "db" && can.importData(ws.role)} />;
  const asOf = resolveView({ period: one(sp, "period") }, ws.ledger).period;
  const { rows, from, to, summary } = incomeAt(ws, await incomeSourcesFor(ws), asOf);
  const canEdit = ws.mode === "db" && can.manageIncome(ws.role);
  const error = one(sp, "ierr");
  const month = periodLabel(asOf);
  const overdue = rows.flatMap((r) => r.receipts.filter((c) => c.status === "overdue").map((c) => ({ ...c, source: r.source.name })));
  const grants = rows.filter((r) => r.source.kind === "grant" && r.source.award);

  return (
    <>
      <PageHeader title="Grants and income" subtitle={`Grant drawdowns, partner milestones and licensing fees against what has reached the books · as of the end of ${month}`}>
        {canEdit && (
          <a href="#add-schedule" className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-[14px] font-medium text-accent-contrast hover:opacity-90">
            Add a schedule
          </a>
        )}
      </PageHeader>
      {error && (
        <p role="alert" className="mb-4 rounded-md bg-bad/10 px-3 py-2 text-[13px] text-bad">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <Card className="max-w-[720px] p-6">
          <h2 className="text-[17px] font-semibold text-ink">No income schedules yet</h2>
          <p className="mt-1 text-[13px] text-ink-2">
            Add each grant, partner collaboration or license with the payments you expect and how likely each one is. Vantiq matches them to income in your books, so you see what
            has arrived, what is late, and what to plan on.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card className="p-5">
              <p className="text-[12px] text-ink-3">Received in {asOf.slice(0, 4)}</p>
              <p className="num mt-1 text-[26px] font-semibold text-ink">{formatCompactCurrency(summary.receivedThisYear)}</p>
              <p className="mt-1 text-[12px] text-ink-2">From these schedules, to the end of {month}</p>
            </Card>
            <Card className="p-5">
              <p className="text-[12px] text-ink-3">Expected in the next 12 months</p>
              <p className="num mt-1 text-[26px] font-semibold text-ink">{formatCompactCurrency(summary.next12Weighted)}</p>
              <p className="mt-1 text-[12px] text-ink-2">Weighted by likelihood · {formatCompactCurrency(summary.next12Full)} if everything lands</p>
            </Card>
            <Card className={`p-5 ${summary.overdueCount ? "border-l-[3px] border-l-[var(--warning)]" : ""}`}>
              <p className="text-[12px] text-ink-3">Overdue</p>
              <p className={`num mt-1 text-[26px] font-semibold ${summary.overdueCount ? "text-warn" : "text-ink"}`}>{formatCompactCurrency(summary.overdue)}</p>
              <p className="mt-1 text-[12px] text-ink-2">
                {overdue.length === 0 ? "Nothing expected has failed to arrive." : overdue.map((o) => `${o.source}: ${o.label}, due ${periodLabel(o.expected)}`).join("; ")}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-[12px] text-ink-3">Grant funds left to draw</p>
              <p className="num mt-1 text-[26px] font-semibold text-ink">{formatCompactCurrency(summary.grantRemaining)}</p>
              <p className="mt-1 text-[12px] text-ink-2">{grants.length ? grants.map((g) => `${formatCompactCurrency(g.source.award!)} ${g.source.name}`).join(", ") : "No grants with an award amount"}</p>
            </Card>
          </div>

          <ChartCard
            className="mt-4"
            title={summary.next12Weighted > 0 ? `${formatCompactCurrency(summary.next12Weighted)} likely in the next year, of ${formatCompactCurrency(summary.next12Full)} scheduled` : "Income by month"}
            subtitle={`Received and expected, USD · ${periodLabel(from)} to ${periodLabel(to)}`}
            table={{
              columns: ["Month", "Received", "Expected (weighted)", "Expected (full)"],
              rows: summary.byMonth.filter((m) => m.received || m.full).map((m) => [periodLabel(m.period), formatCompactCurrency(m.received), formatCompactCurrency(m.weighted), formatCompactCurrency(m.full)]),
            }}
          >
            <ReceiptsTimeline rows={rows} asOf={asOf} from={from} to={to} />
          </ChartCard>

          {rows.map(({ source, receipts, paidBefore }) => {
            const drawn = receipts.reduce((s, r) => s + (r.receivedAmount ?? 0), 0);
            const category = INCOME_KINDS.find((k) => k.kind === source.kind)!.categoryId;
            const categoryName = ws.ledger.data.categories.find((c) => c.id === category)?.name ?? category;
            return (
              <Card key={source.id} className="mt-4 scroll-mt-20 overflow-hidden">
                <div id={`source-${source.id}`} className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3">
                  <div className="min-w-0">
                    <h2 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
                      {source.name} <StatusPill tone="neutral">{kindLabel(source.kind)}</StatusPill>
                    </h2>
                    <p className="text-[12px] text-ink-3">
                      Paid by {source.counterparty}
                      {source.programCode && ` · ${source.programCode}`} · received amounts come from {categoryName} in the books
                      {!paidBefore && <span className="text-warn"> · no payments from {source.counterparty} found yet</span>}
                    </p>
                  </div>
                  {source.award && (
                    <div className="w-full max-w-[280px] text-[12px]">
                      <div className="flex justify-between gap-2 text-ink-2">
                        <span>
                          <span className="num font-medium text-ink">{formatCompactCurrency(drawn)}</span> drawn of {formatCompactCurrency(source.award)}
                        </span>
                        <span className="num">{pct(Math.min(1, drawn / source.award))}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-subtle" aria-hidden>
                        <div className="h-2 rounded-full bg-[var(--series-1)]" style={{ width: pct(Math.min(1, drawn / source.award)) }} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="num w-full min-w-[760px] table-fixed text-[13px]">
                    <thead className="bg-subtle text-[12px] text-ink-3">
                      <tr>
                        <th className="w-[30%] px-5 py-2 text-left font-medium">Receipt</th>
                        <th className="w-[13%] px-3 py-2 text-left font-medium">Expected</th>
                        <th className="w-[12%] px-3 py-2 text-right font-medium">Amount</th>
                        <th className="w-[11%] px-3 py-2 text-right font-medium">Likelihood</th>
                        <th className="w-[12%] px-3 py-2 text-right font-medium">Weighted</th>
                        <th className="px-5 py-2 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receipts.map((r) => (
                        <tr key={r.id} className={`border-b border-line/70 align-top ${r.status === "received" ? "text-ink-2" : ""}`}>
                          <td className="px-5 py-2.5 text-ink">
                            {r.label}
                            {canEdit && r.status !== "received" && (
                              <details className="mt-1">
                                <summary className="cursor-pointer text-[12px] text-accent">Change</summary>
                                <form action={saveReceiptAction} className="mt-2 flex flex-wrap items-end gap-2" aria-label={`Change ${r.label}`}>
                                  <ReceiptFields r={r} sourceId={source.id} />
                                  <SubmitButton label="Save" pendingLabel="Saving…" />
                                </form>
                                <form action={removeReceiptAction} className="mt-2">
                                  <input type="hidden" name="sourceId" value={source.id} />
                                  <input type="hidden" name="receiptId" value={r.id} />
                                  <button type="submit" className="text-[12px] text-bad hover:underline">
                                    Remove from the schedule
                                  </button>
                                </form>
                              </details>
                            )}
                          </td>
                          <td className="px-3 py-2.5">{periodLabel(r.expected)}</td>
                          <td className="px-3 py-2.5 text-right">{formatCompactCurrency(r.receivedAmount ?? r.amount)}</td>
                          <td className="px-3 py-2.5 text-right">{r.status === "received" ? "—" : pct(r.probability)}</td>
                          <td className="px-3 py-2.5 text-right">{formatCompactCurrency(r.weighted)}</td>
                          <td className="px-5 py-2.5">
                            <Status r={r} />
                          </td>
                        </tr>
                      ))}
                      {receipts.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-5 py-3 text-ink-3">
                            No receipts scheduled yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {canEdit && (
                  <form action={saveReceiptAction} className="flex flex-wrap items-end gap-2 border-t border-line px-5 py-3" aria-label={`Add a receipt to ${source.name}`}>
                    <ReceiptFields sourceId={source.id} />
                    <SubmitButton label="Add receipt" pendingLabel="Adding…" />
                  </form>
                )}
              </Card>
            );
          })}
        </>
      )}

      {canEdit && (
        <Card className="mt-4 max-w-[760px] scroll-mt-20 p-5">
          <h2 id="add-schedule" className="text-[15px] font-semibold text-ink">
            Add a schedule
          </h2>
          <p className="mt-1 text-[13px] text-ink-2">
            A grant, partner collaboration or license. Enter who pays exactly as they appear in your books: payments from them are matched to the schedule, so nothing is entered
            twice.
          </p>
          <form action={createIncomeSourceAction} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={`${label} sm:col-span-2`}>
              Name
              <input name="name" required maxLength={120} placeholder="CPRIT product development award" className={field} />
            </label>
            <label className={label}>
              Type
              <select name="kind" className={field} defaultValue="grant">
                {INCOME_KINDS.map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Paid by
              <input name="counterparty" required list="payers" className={field} />
              <datalist id="payers">
                {ws.ledger.data.vendors.map((v) => (
                  <option key={v.id} value={v.name} />
                ))}
              </datalist>
            </label>
            <label className={label}>
              Program
              <select name="programCode" className={field} defaultValue="">
                <option value="">None</option>
                {ws.ledger.data.programs.map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.code}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Total award (grants, USD)
              <input name="award" inputMode="decimal" className={`${field} num`} />
            </label>
            <div className="sm:col-span-2">
              <SubmitButton label="Add schedule" pendingLabel="Adding…" />
            </div>
          </form>
        </Card>
      )}
      {ws.mode === "demo" && <p className="mt-4 text-[12px] text-ink-3">These are Helixa&apos;s sample schedules. Sign up to add your own.</p>}
    </>
  );
}
