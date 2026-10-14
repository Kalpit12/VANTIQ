import { renderToBuffer } from "@react-pdf/renderer";
import { getDb, recordPackExport } from "@vantiq/db";
import { PackPdf } from "@/components/pack/PackPdf";
import { getWorkspace } from "@/lib/data";
import { packState, packStatusText } from "@/lib/pack";

export const runtime = "nodejs";

/** Downloads the month's review pack as a PDF. Every export is in the audit log. */
export async function GET(req: Request) {
  const ws = await getWorkspace();
  if (!ws.ledger.hasData()) return new Response("There is no data to put in a pack yet.", { status: 404 });
  const period = new URL(req.url).searchParams.get("period") ?? ws.ledger.latestPeriod();
  const st = await packState(ws, period);
  const pdf = await renderToBuffer(<PackPdf data={st.shown} status={packStatusText(st)} />);
  if (ws.mode === "db") await recordPackExport(getDb(), ws.companyId!, ws.session!.user.id, st.shown.period, "pdf");
  const name = `${st.shown.companyName.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "")}-review-pack-${st.shown.period}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
