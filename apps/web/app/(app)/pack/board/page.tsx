import Link from "next/link";
import { can } from "@vantiq/db";
import { BoardPackView } from "@/components/board/BoardPackView";
import { NoData } from "@/components/NoData";
import { boardPack } from "@/lib/board";
import { getWorkspace } from "@/lib/data";
import { packState, packStatusText } from "@/lib/pack";
import { one, type SearchParams } from "@/lib/view";

export const metadata = { title: "Board pack · Vantiq Finance" };

/** What the board will see for this month, before it is shared. */
export default async function BoardPreviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  if (!ws.ledger.hasData()) return <NoData title="Board pack" canImport={ws.mode === "db" && can.importData(ws.role)} />;
  const st = await packState(ws, one(sp, "period") ?? "");
  const data = boardPack(st.shown);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-subtle px-3 py-2 text-[13px] text-ink-2">
        <span>
          Preview of the board pack.{" "}
          {st.locked ? "Links to it show exactly this." : `${data.label} isn't approved yet, so it can't be shared and these numbers can still change.`}
        </span>
        <span className="flex gap-3">
          <a href={`/pack/board/pdf?period=${data.period}`} className="font-medium text-accent hover:underline">
            Download board PDF
          </a>
          <Link href={`/pack?period=${data.period}#board`} className="font-medium text-accent hover:underline">
            Back to the review pack
          </Link>
        </span>
      </div>
      <BoardPackView data={data} status={packStatusText(st)} />
    </>
  );
}
