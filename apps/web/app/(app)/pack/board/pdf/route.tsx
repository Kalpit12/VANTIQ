import { renderToBuffer } from "@react-pdf/renderer";
import { getDb, recordPackExport } from "@vantiq/db";
import { PackPdf } from "@/components/pack/PackPdf";
import { boardPack, packFileName } from "@/lib/board";
import { getWorkspace } from "@/lib/data";
import { packState, packStatusText } from "@/lib/pack";

export const runtime = "nodejs";

/** Downloads the month's board pack as a PDF. Every export is in the audit log. */
export async function GET(req: Request) {
  const ws = await getWorkspace();
  if (!ws.ledger.hasData()) return new Response("There is no data to put in a pack yet.", { status: 404 });
  const period = new URL(req.url).searchParams.get("period") ?? ws.ledger.latestPeriod();
  const st = await packState(ws, period);
  const data = boardPack(st.shown);
  const pdf = await renderToBuffer(<PackPdf data={data} status={packStatusText(st)} board />);
  if (ws.mode === "db") await recordPackExport(getDb(), ws.companyId!, ws.session!.user.id, data.period, "board_pdf");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${packFileName(data, "board")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
