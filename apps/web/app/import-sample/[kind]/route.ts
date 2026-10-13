import { sampleFiles } from "@vantiq/fixtures";

/** Example files in the format the importer expects, for people to compare against their own exports. */
export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const files = sampleFiles();
  const body = kind === "ledger" ? files.ledgerCsv : kind === "budget" ? files.budgetCsv : kind === "cash" ? files.cashCsv : null;
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="vantiq-sample-${kind}.csv"` },
  });
}
