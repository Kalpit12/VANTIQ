import { can, getDb, listMappings } from "@vantiq/db";
import { STANDARD_CATEGORIES } from "@vantiq/domain";
import { DemoNotice } from "@/components/DemoNotice";
import { MappingTable } from "@/components/MappingTable";
import { Card, PageHeader } from "@/components/ui";
import { getWorkspace } from "@/lib/data";

export const metadata = { title: "Account mapping · Vantiq Finance" };

export default async function MappingsPage() {
  const ws = await getWorkspace();
  if (ws.mode === "demo") return <Card className="max-w-[480px] p-6"><DemoNotice /></Card>;
  const rows = await listMappings(getDb(), ws.companyId!);
  const groups = STANDARD_CATEGORIES.filter((c) => c.parentId && STANDARD_CATEGORIES.some((x) => x.parentId === c.id)).map((g) => ({
    label: g.name,
    options: STANDARD_CATEGORIES.filter((c) => c.parentId === g.id).map((c) => ({ id: c.id, name: c.name })),
  }));
  // Revenue leaves sit directly under the root.
  const rootLeaves = STANDARD_CATEGORIES.filter(
    (c) => c.parentId && !STANDARD_CATEGORIES.some((x) => x.parentId === c.id) && !STANDARD_CATEGORIES.find((p) => p.id === c.parentId)?.parentId,
  );
  const revenueGroup = { label: "Revenue and income", options: rootLeaves.map((c) => ({ id: c.id, name: c.name })) };
  return (
    <>
      <PageHeader
        title="Account mapping"
        subtitle="Each account from your ledger rolls up to one line of Vantiq's standard pharma chart. Changes apply to every screen right away."
      />
      {rows.length === 0 ? (
        <Card className="p-6 text-[13px] text-ink-2">No accounts yet. Import a general ledger or budget file and its accounts appear here.</Card>
      ) : (
        <MappingTable rows={rows} groups={[revenueGroup, ...groups]} canEdit={can.editMappings(ws.role)} />
      )}
    </>
  );
}
