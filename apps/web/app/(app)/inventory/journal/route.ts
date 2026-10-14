import { auditEvents, getDb, withCompany } from "@vantiq/db";
import { expiryBuckets } from "@vantiq/domain";
import { getWorkspace } from "@/lib/data";
import { batchesFor, reserveCsv } from "@/lib/inventory";
import { resolveView } from "@/lib/view";

/** The month-end expiry reserve entry as CSV. Each export is audited. */
export async function GET(req: Request) {
  const ws = await getWorkspace();
  if (!ws.ledger.hasData()) return new Response("No data yet.", { status: 404 });
  const asOf = resolveView({ period: new URL(req.url).searchParams.get("period") ?? undefined }, ws.ledger).period;
  const { rows, summary } = expiryBuckets(await batchesFor(ws), asOf);
  if (ws.mode === "db") {
    const companyId = ws.companyId!;
    await withCompany(getDb(), companyId, (tx) =>
      tx.insert(auditEvents).values({ companyId, actorId: ws.session!.user.id, action: "inventory.journal_exported", target: asOf, detail: { writeOff: summary.writeOff, lots: rows.filter((r) => r.writeOff > 0).length } }),
    );
  }
  return new Response(reserveCsv(rows, asOf), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="expiry-reserve-${asOf}.csv"`, "Cache-Control": "private, no-store" },
  });
}
