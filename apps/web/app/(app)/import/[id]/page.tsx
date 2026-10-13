import { can, getDb, getImport } from "@vantiq/db";
import { FIELDS } from "@vantiq/integrations";
import { notFound, redirect } from "next/navigation";
import { ColumnMapper } from "@/components/ColumnMapper";
import { PageHeader } from "@/components/ui";
import { getWorkspace } from "@/lib/data";

export const metadata = { title: "Check columns · Vantiq Finance" };

const KIND_LABEL = { ledger: "general ledger", budget: "budget", cash: "cash balances" } as const;

export default async function ImportColumnsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getWorkspace();
  if (ws.mode === "demo" || !can.importData(ws.role)) redirect("/import");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const draft = await getImport(getDb(), ws.companyId!, id);
  if (!draft) notFound();
  if (draft.status !== "draft" || !draft.rows) redirect(`/import?done=${id}`);
  return (
    <>
      <PageHeader
        title="Check columns"
        subtitle={`${draft.filename} · ${draft.rowCount.toLocaleString("en-US")} rows · imported as ${KIND_LABEL[draft.kind]}`}
      />
      <ColumnMapper
        importId={draft.id}
        kind={draft.kind}
        fields={FIELDS[draft.kind]}
        headers={draft.headers}
        sampleRows={draft.rows.slice(0, 6)}
        initial={draft.columnMap ?? {}}
      />
    </>
  );
}
