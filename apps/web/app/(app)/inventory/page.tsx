import { can } from "@vantiq/db";
import { EXPIRY_BUCKETS, expiryBuckets, formatCompactCurrency, formatCurrency, formatDate, periodLabel, type Batch } from "@vantiq/domain";
import { importBatchesAction, removeBatchAction, saveBatchAction } from "@/app/actions/inventory";
import { ChartCard } from "@/components/ChartCard";
import { SubmitButton } from "@/components/AuthForm";
import { NoData } from "@/components/NoData";
import { BUCKET_STYLE, ExpiryExposure } from "@/components/inventory/ExpiryExposure";
import { Card, PageHeader } from "@/components/ui";
import { getWorkspace } from "@/lib/data";
import { batchesFor, writeOffReason } from "@/lib/inventory";
import { one, resolveView, type SearchParams } from "@/lib/view";

export const metadata = { title: "Inventory and expiry · Vantiq Finance" };

const field = "h-9 rounded-md border border-line-strong bg-surface px-3 text-[14px] text-ink";
const label = "flex flex-col gap-1 text-[13px] font-medium text-ink";
const n = (x: number) => x.toLocaleString("en-US");

function monthsLeftText(m: number) {
  if (m <= 0) return "Expired";
  if (m < 1) return "Under a month";
  return `${Math.floor(m)} month${Math.floor(m) === 1 ? "" : "s"} left`;
}

function BatchFields({ b, programs }: { b?: Batch; programs: string[] }) {
  return (
    <>
      {b && <input type="hidden" name="id" value={b.id} />}
      <label className={`${label} min-w-[200px] flex-[2]`}>
        Product
        <input name="product" required maxLength={120} defaultValue={b?.product} className={field} />
      </label>
      <label className={`${label} w-[130px]`}>
        Lot
        <input name="lot" required maxLength={60} defaultValue={b?.lot} className={`${field} font-mono`} />
      </label>
      <label className={`${label} w-[130px]`}>
        Program
        <select name="programCode" className={field} defaultValue={b?.programCode ?? ""}>
          <option value="">None</option>
          {programs.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <label className={`${label} w-[110px]`}>
        Quantity
        <input name="quantity" inputMode="numeric" required defaultValue={b?.quantity} className={`${field} num`} />
      </label>
      <label className={`${label} w-[100px]`}>
        Unit
        <input name="unit" maxLength={20} defaultValue={b?.unit ?? "vials"} className={field} />
      </label>
      <label className={`${label} w-[130px]`}>
        Unit cost (USD)
        <input name="unitCost" inputMode="decimal" required defaultValue={b ? String(b.unitCost / 100) : undefined} className={`${field} num`} />
      </label>
      <label className={`${label} w-[160px]`}>
        Expiry date
        <input name="expiry" type="date" required defaultValue={b?.expiry} className={field} />
      </label>
      <label className={`${label} w-[140px]`}>
        Used per month
        <input name="monthlyUsage" inputMode="numeric" defaultValue={b?.monthlyUsage ?? ""} placeholder="Optional" className={`${field} num`} />
      </label>
      <label className={`${label} min-w-[180px] flex-1`}>
        Location
        <input name="location" maxLength={120} defaultValue={b?.location} className={field} />
      </label>
    </>
  );
}

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  if (!ws.ledger.hasData()) return <NoData title="Inventory and expiry" canImport={ws.mode === "db" && can.importData(ws.role)} />;
  const asOf = resolveView({ period: one(sp, "period") }, ws.ledger).period;
  const { rows, summary } = expiryBuckets(await batchesFor(ws), asOf);
  const canEdit = ws.mode === "db" && can.manageInventory(ws.role);
  const programs = ws.ledger.data.programs.map((p) => p.code);
  const error = one(sp, "verr");
  const note = one(sp, "vnote");
  const month = periodLabel(asOf);
  const bucket = (k: string) => summary.buckets.find((b) => b.bucket === k)!;
  const within12 = bucket("0-3").value + bucket("3-6").value + bucket("6-12").value;

  return (
    <>
      <PageHeader title="Inventory and expiry" subtitle={`Stock on hand by when it expires, with a suggested write-off for each lot · as of the end of ${month}`}>
        <div className="flex flex-wrap items-center gap-2">
          {summary.writeOff > 0 && (
            <a href={`/inventory/journal?period=${asOf}`} className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3 text-[14px] font-medium text-ink hover:bg-subtle">
              Download reserve entry
            </a>
          )}
          {canEdit && (
            <a href="#add-batch" className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-[14px] font-medium text-accent-contrast hover:opacity-90">
              Add a batch
            </a>
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
          <h2 className="text-[17px] font-semibold text-ink">No batches yet</h2>
          <p className="mt-1 text-[13px] text-ink-2">
            Add each lot of clinical supply, drug substance or lab material with its quantity, unit cost and expiry date, or import your inventory listing. Vantiq groups stock by when
            it expires and suggests how much to write off at month end.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card className="p-5">
              <p className="text-[12px] text-ink-3">Stock on hand</p>
              <p className="num mt-1 text-[26px] font-semibold text-ink">{formatCompactCurrency(summary.total)}</p>
              <p className="mt-1 text-[12px] text-ink-2">
                {rows.length} lot{rows.length === 1 ? "" : "s"} of {summary.byProduct.length} product{summary.byProduct.length === 1 ? "" : "s"}, at cost
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-[12px] text-ink-3">Expires within 12 months</p>
              <p className={`num mt-1 text-[26px] font-semibold ${within12 ? "text-warn" : "text-ink"}`}>{formatCompactCurrency(within12)}</p>
              <p className="mt-1 text-[12px] text-ink-2">
                {formatCompactCurrency(bucket("0-3").value)} of it within 3 months
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-[12px] text-ink-3">Already expired</p>
              <p className={`num mt-1 text-[26px] font-semibold ${bucket("expired").value ? "text-warn" : "text-ink"}`}>{formatCompactCurrency(bucket("expired").value)}</p>
              <p className="mt-1 text-[12px] text-ink-2">
                {bucket("expired").count ? `${bucket("expired").count} lot${bucket("expired").count === 1 ? "" : "s"} still on the books` : "Nothing past its expiry date"}
              </p>
            </Card>
            <Card className={`p-5 ${summary.writeOff ? "border-l-[3px] border-l-[var(--warning)]" : ""}`}>
              <p className="text-[12px] text-ink-3">Suggested write-off</p>
              <p className="num mt-1 text-[26px] font-semibold text-ink">{formatCompactCurrency(summary.writeOff)}</p>
              <p className="mt-1 text-[12px] text-ink-2">{summary.writeOff ? `Reserve at the end of ${month}, ready to download as a journal entry` : "Nothing to reserve this month"}</p>
            </Card>
          </div>

          <ChartCard
            className="mt-4"
            title={within12 + bucket("expired").value > 0 ? `${formatCompactCurrency(within12 + bucket("expired").value)} of stock is expired or expires within a year` : "Nothing expires within a year"}
            subtitle={`Value at cost by product and expiry, USD · as of the end of ${month}`}
            table={{
              columns: ["Product", ...EXPIRY_BUCKETS.map((b) => b.label)],
              rows: summary.byProduct.map((p) => [p.product, ...EXPIRY_BUCKETS.map((b) => formatCompactCurrency(p.values[b.bucket]))]),
            }}
          >
            <ExpiryExposure byProduct={summary.byProduct} />
          </ChartCard>

          <div id="batches" className="scroll-mt-20">
            {summary.buckets
              .filter((b) => b.count > 0)
              .map((b) => (
                <Card key={b.bucket} className="mt-4 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
                    <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                      <span className="h-3 w-3 rounded-sm" style={BUCKET_STYLE[b.bucket]} aria-hidden />
                      {b.label}
                    </h2>
                    <span className="num text-[12px] text-ink-3">
                      {formatCompactCurrency(b.value)} in {b.count} lot{b.count === 1 ? "" : "s"}
                      {b.writeOff > 0 && <span className="font-medium text-warn"> · {formatCompactCurrency(b.writeOff)} to write off</span>}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="num w-full min-w-[960px] table-fixed text-[13px]">
                      <thead className="bg-subtle text-[12px] text-ink-3">
                        <tr>
                          <th className="w-[24%] px-5 py-2 text-left font-medium">Product and lot</th>
                          <th className="w-[13%] px-3 py-2 text-left font-medium">Expiry</th>
                          <th className="w-[11%] px-3 py-2 text-right font-medium">On hand</th>
                          <th className="w-[10%] px-3 py-2 text-right font-medium">Value</th>
                          <th className="w-[11%] px-3 py-2 text-right font-medium">Write off</th>
                          <th className="px-5 py-2 text-left font-medium">Why</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows
                          .filter((r) => r.bucket === b.bucket)
                          .map((r) => (
                            <tr key={r.batch.id} id={`batch-${r.batch.id}`} className="scroll-mt-20 border-b border-line/70 align-top">
                              <td className="px-5 py-2.5">
                                <div className="font-medium text-ink">{r.batch.product}</div>
                                <div className="text-[12px] text-ink-3">
                                  <span className="font-mono">{r.batch.lot}</span>
                                  {[r.batch.programCode, r.batch.location].filter(Boolean).map((x) => ` · ${x}`)}
                                </div>
                                {canEdit && (
                                  <details className="mt-1">
                                    <summary className="cursor-pointer text-[12px] text-accent">Change</summary>
                                    <form
                                      action={saveBatchAction}
                                      className="relative z-10 mt-2 flex w-[880px] flex-wrap items-end gap-2 rounded-md border border-line bg-surface p-3 shadow-[var(--shadow-float)]"
                                      aria-label={`Change lot ${r.batch.lot}`}
                                    >
                                      <BatchFields b={r.batch} programs={programs} />
                                      <SubmitButton label="Save" pendingLabel="Saving…" />
                                    </form>
                                    <form action={removeBatchAction} className="mt-2">
                                      <input type="hidden" name="id" value={r.batch.id} />
                                      <button type="submit" className="text-[12px] text-bad hover:underline">
                                        Remove lot {r.batch.lot}
                                      </button>
                                    </form>
                                  </details>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <div>{formatDate(r.batch.expiry)}</div>
                                <div className="text-[12px] text-ink-3">{monthsLeftText(r.monthsLeft)}</div>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                {n(r.batch.quantity)} <span className="text-[12px] text-ink-3">{r.batch.unit}</span>
                                <div className="text-[12px] text-ink-3">at {formatCurrency(r.batch.unitCost)}</div>
                              </td>
                              <td className="px-3 py-2.5 text-right">{formatCompactCurrency(r.value)}</td>
                              <td className={`px-3 py-2.5 text-right font-semibold ${r.writeOff ? "text-warn" : "text-ink-3"}`}>{r.writeOff ? formatCompactCurrency(r.writeOff) : "—"}</td>
                              <td className="px-5 py-2.5 text-[12px] leading-relaxed text-ink-2">{writeOffReason(r)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}
          </div>
        </>
      )}

      {canEdit && (
        <>
          <Card className="mt-4 scroll-mt-20 p-5">
            <h2 id="add-batch" className="scroll-mt-20 text-[15px] font-semibold text-ink">
              Add a batch
            </h2>
            <p className="mt-1 max-w-[720px] text-[13px] text-ink-2">
              One lot of a product. Add how many units you expect to use each month and the write-off is the stock left over at expiry; without it, Vantiq reserves 50% of stock expiring
              within 3 months and 25% within 6.
            </p>
            <form action={saveBatchAction} className="mt-3 flex flex-wrap items-end gap-2" aria-label="Add a batch">
              <BatchFields programs={programs} />
              <SubmitButton label="Add batch" pendingLabel="Adding…" />
            </form>
          </Card>
          <Card className="mt-4 max-w-[720px] scroll-mt-20 p-5">
            <h2 id="import-batches" className="scroll-mt-20 text-[15px] font-semibold text-ink">
              Import an inventory listing
            </h2>
            <p className="mt-1 text-[13px] text-ink-2">
              CSV or Excel with one row per lot: product, lot, quantity, unit cost and expiry date, plus unit, monthly usage, program and location if you have them. A lot already on
              file is replaced.
            </p>
            <form action={importBatchesAction} className="mt-3 flex flex-wrap items-end gap-3">
              <label className={label}>
                Inventory file
                <input type="file" name="file" accept=".csv,.xlsx,.xls" required className="text-[13px] font-normal text-ink-2" />
              </label>
              <SubmitButton label="Import lots" pendingLabel="Importing…" />
            </form>
          </Card>
        </>
      )}
      {ws.mode === "demo" && <p className="mt-4 text-[12px] text-ink-3">This is Helixa&apos;s sample stock. Sign up to add your own.</p>}
    </>
  );
}
