import { renderToBuffer } from "@react-pdf/renderer";
import { formatDate } from "@vantiq/domain";
import { getDb, openShareLink } from "@vantiq/db";
import { PackPdf } from "@/components/pack/PackPdf";
import { boardPack, packFileName } from "@/lib/board";
import type { PackData } from "@/lib/pack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The shared board pack as a PDF, for someone holding a working link. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!process.env.DATABASE_URL) return new Response("Not found", { status: 404 });
  const { token } = await params;
  const share = await openShareLink<PackData>(getDb(), token, "pdf");
  if (share.status !== "active") return new Response("This link no longer works. Ask the sender for a new one.", { status: 410, headers: { "Cache-Control": "no-store" } });
  const data = boardPack(share.snapshot);
  const status = `Approved${share.approvedByName ? ` by ${share.approvedByName}` : ""} on ${formatDate(share.approvedAt.toISOString().slice(0, 10))}`;
  const pdf = await renderToBuffer(<PackPdf data={data} status={status} board note={share.note || undefined} />);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${packFileName(data, "board")}"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
