import { auditEvents, getDb, withCompany } from "@vantiq/db";
import { getWorkspace } from "@/lib/data";
import { accrualsAt, journalCsv, trialsFor } from "@/lib/trials";
import { resolveView } from "@/lib/view";

/** Month-end accrual journal entries as CSV, for every trial or one (`?trial=`). Each export is audited. */
export async function GET(req: Request) {
  const ws = await getWorkspace();
  if (!ws.ledger.hasData()) return new Response("No data yet.", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const asOf = resolveView({ period: sp.get("period") ?? undefined }, ws.ledger).period;
  const only = sp.get("trial");
  const rows = accrualsAt(ws, (await trialsFor(ws)).filter((t) => !only || t.id === only), asOf);
  if (ws.mode === "db") {
    const companyId = ws.companyId!;
    await withCompany(getDb(), companyId, (tx) =>
      tx.insert(auditEvents).values({ companyId, actorId: ws.session!.user.id, action: "trial.journal_exported", target: asOf, detail: { trials: rows.map((r) => r.trial.code) } }),
    );
  }
  const name = rows.length === 1 ? `accrual-${rows[0]!.trial.code}-${asOf}.csv` : `trial-accruals-${asOf}.csv`;
  return new Response(journalCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name.replace(/[^\w.-]+/g, "-")}"`, "Cache-Control": "private, no-store" },
  });
}
