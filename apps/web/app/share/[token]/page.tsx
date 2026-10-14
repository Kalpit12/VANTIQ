import type { Metadata } from "next";
import { formatDate } from "@vantiq/domain";
import { getDb, openShareLink } from "@vantiq/db";
import { BoardPackView } from "@/components/board/BoardPackView";
import { Wordmark } from "@/components/Sidebar";
import { boardPack } from "@/lib/board";
import type { PackData } from "@/lib/pack";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Board pack · Vantiq Finance", robots: { index: false, follow: false } };

const GONE: Record<string, { title: string; body: string }> = {
  missing: { title: "This link doesn't work", body: "Check that you copied the whole link, or ask the sender for a new one." },
  expired: { title: "This link has expired", body: "Board pack links work for a limited time. Ask the sender for a new one." },
  revoked: { title: "This link was turned off", body: "The sender stopped sharing this board pack. Ask them for a new link if you still need it." },
  withdrawn: { title: "This board pack is being updated", body: "The month was reopened after this link was sent. Ask the sender for a new link once it is approved again." },
};

/** A board pack shared by link: read-only, no sign-in, nothing beyond the approved board subset. */
export default async function SharedBoardPack({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = process.env.DATABASE_URL ? await openShareLink<PackData>(getDb(), token, "view") : ({ status: "missing" } as const);

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Wordmark />
        {share.status === "active" && (
          <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink-3">
            <span>Shared read-only · link works until {formatDate(share.expiresAt.toISOString().slice(0, 10))}</span>
            <a
              href={`/share/${token}/pdf`}
              className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3 text-[14px] font-medium text-ink hover:bg-subtle"
            >
              Download PDF
            </a>
          </div>
        )}
      </div>
      <main className="mx-auto max-w-[1200px] px-4 pb-12 sm:px-6">
        {share.status === "active" ? (
          <BoardPackView
            data={boardPack(share.snapshot)}
            status={`Approved${share.approvedByName ? ` by ${share.approvedByName}` : ""} on ${formatDate(share.approvedAt.toISOString().slice(0, 10))}`}
            note={share.note || undefined}
          />
        ) : (
          <div className="mx-auto mt-16 max-w-[480px] rounded-[10px] border border-line bg-surface p-6">
            <h1 className="text-[20px] font-semibold text-ink">{GONE[share.status]!.title}</h1>
            <p className="mt-2 text-[14px] text-ink-2">{GONE[share.status]!.body}</p>
          </div>
        )}
        <p className="mt-8 text-center text-[12px] text-ink-3">Confidential. Shared from Vantiq Finance for the named recipients only.</p>
      </main>
    </div>
  );
}
