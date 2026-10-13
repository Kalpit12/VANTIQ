import { can, getDb, getImport, listImports } from "@vantiq/db";
import { formatDate } from "@vantiq/domain";
import Link from "next/link";
import { loadSampleAction } from "@/app/actions/data";
import { SubmitButton } from "@/components/AuthForm";
import { DemoNotice } from "@/components/DemoNotice";
import { UploadForm } from "@/components/UploadForm";
import { Card, PageHeader, StatusPill } from "@/components/ui";
import { getWorkspace } from "@/lib/data";
import { one, type SearchParams } from "@/lib/view";

export const metadata = { title: "Import data · Vantiq Finance" };

const KIND_LABEL = { ledger: "General ledger", budget: "Budget", cash: "Cash balances" } as const;

export default async function ImportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  if (ws.mode === "demo") return <Card className="max-w-[480px] p-6"><DemoNotice /></Card>;
  const db = getDb();
  const allowed = can.importData(ws.role);
  const recent = await listImports(db, ws.companyId!);
  const doneId = one(sp, "done");
  const done = doneId ? await getImport(db, ws.companyId!, doneId) : null;

  return (
    <>
      <PageHeader title="Import data" subtitle="Upload exports from your accounting system. Vantiq checks every row before saving." />
      {done && done.status === "done" && (
        <div role="status" className="mb-4 rounded-[10px] border border-good/40 bg-good/10 px-4 py-3 text-[13px] text-ink">
          <strong className="font-semibold">Imported {done.filename}.</strong> {done.inserted.toLocaleString("en-US")} row{done.inserted === 1 ? "" : "s"} saved
          {done.duplicates > 0 && `, ${done.duplicates.toLocaleString("en-US")} already imported before and skipped`}.{" "}
          {done.kind !== "cash" && (
            <Link href="/mappings" className="font-medium text-accent hover:underline">
              Check account mapping →
            </Link>
          )}
        </div>
      )}
      {one(sp, "error") === "not-empty" && (
        <p role="alert" className="mb-4 rounded-md bg-warn/10 px-3 py-2 text-[13px] text-ink">
          Sample data only loads into an empty company, so it never mixes with your own books.
        </p>
      )}
      {allowed ? (
        <Card className="p-5">
          <UploadForm />
        </Card>
      ) : (
        <Card className="p-5 text-[13px] text-ink-2">Your role can view numbers but not import files. Ask an admin to change your role.</Card>
      )}

      {allowed && !ws.ledger.hasData() && (
        <Card className="mt-4 flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">No files to hand?</h2>
            <p className="text-[13px] text-ink-2">Load Helixa Therapeutics, a sample biotech with two years of books, to try every screen.</p>
          </div>
          <form action={loadSampleAction}>
            <SubmitButton label="Load sample data" pendingLabel="Loading…" />
          </form>
        </Card>
      )}

      <Card className="mt-4 overflow-hidden">
        <h2 className="border-b border-line px-5 py-3 text-[15px] font-semibold text-ink">Recent imports</h2>
        {recent.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-ink-3">Nothing imported yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="num w-full text-[13px]">
              <thead className="bg-subtle text-left text-[12px] text-ink-3">
                <tr>
                  <th className="px-5 py-2 font-medium">File</th>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Uploaded</th>
                  <th className="py-2 pr-4 text-right font-medium">Rows saved</th>
                  <th className="py-2 pr-4 text-right font-medium">Skipped as duplicates</th>
                  <th className="px-5 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-b border-line/70">
                    <td className="px-5 py-2 text-ink">{r.filename}</td>
                    <td className="py-2 pr-4 text-ink-2">{KIND_LABEL[r.kind]}</td>
                    <td className="whitespace-nowrap py-2 pr-4 text-ink-2">{formatDate(r.createdAt.toISOString().slice(0, 10))}</td>
                    <td className="py-2 pr-4 text-right">{r.status === "done" ? r.inserted.toLocaleString("en-US") : "—"}</td>
                    <td className="py-2 pr-4 text-right text-ink-2">{r.status === "done" ? r.duplicates.toLocaleString("en-US") : "—"}</td>
                    <td className="px-5 py-2">
                      {r.status === "done" ? (
                        <StatusPill tone="accent">Imported</StatusPill>
                      ) : (
                        <Link href={`/import/${r.id}`} className="font-medium text-accent hover:underline">
                          Finish checking columns
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
