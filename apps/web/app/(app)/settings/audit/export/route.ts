import { can, getDb, listAuditEvents } from "@vantiq/db";
import { AUDIT_AREAS, describeEvent } from "@/lib/audit";
import { getWorkspace } from "@/lib/data";

const cell = (v: string) => (/[",\n\r]/.test(v) || /^[=+\-@]/.test(v) ? `"${(/^[=+\-@]/.test(v) ? "'" : "") + v.replace(/"/g, '""')}"` : v);

/** The whole audit log as CSV (architecture.md 9: append-only and exportable). */
export async function GET(req: Request) {
  const ws = await getWorkspace();
  if (ws.mode === "demo" || !can.viewAudit(ws.role)) return new Response("Not allowed.", { status: 403 });
  const areaParam = new URL(req.url).searchParams.get("area");
  const area = AUDIT_AREAS.find((a) => a.key === areaParam)?.key;
  const rows = await listAuditEvents(getDb(), ws.companyId!, { limit: 100_000, area });
  const names = new Map(ws.ledger.data.categories.map((c) => [c.id, c.name]));
  const lines = [
    ["time_utc", "actor", "actor_email", "action", "target", "description", "detail_json"].join(","),
    ...rows.map((e) =>
      [e.at.toISOString(), e.actorName ?? "Vantiq (automatic)", e.actorEmail ?? "", e.action, e.target, describeEvent(e, names), JSON.stringify(e.detail)].map(cell).join(","),
    ),
  ];
  const day = new Date().toISOString().slice(0, 10);
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vantiq-audit-log-${day}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
