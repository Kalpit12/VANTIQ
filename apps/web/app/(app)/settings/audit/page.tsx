import Link from "next/link";
import { can, getDb, listAuditEvents } from "@vantiq/db";
import { redirect } from "next/navigation";
import { SettingsTabs } from "@/components/SettingsTabs";
import { Card, PageHeader } from "@/components/ui";
import { AUDIT_AREAS, describeEvent } from "@/lib/audit";
import { getWorkspace } from "@/lib/data";
import { one, type SearchParams } from "@/lib/view";

export const metadata = { title: "Audit log · Vantiq Finance" };

const PAGE = 50;
const when = (d: Date) =>
  d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  if (ws.mode === "demo" || !can.viewAudit(ws.role)) redirect("/overview");
  const area = AUDIT_AREAS.find((a) => a.key === one(sp, "area"))?.key;
  const beforeRaw = one(sp, "before");
  const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw) : undefined;
  const rows = await listAuditEvents(getDb(), ws.companyId!, { limit: PAGE + 1, before, area });
  const page = rows.slice(0, PAGE);
  const more = rows.length > PAGE;
  const names = new Map(ws.ledger.data.categories.map((c) => [c.id, c.name]));
  const q = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <>
      <PageHeader title="Settings" subtitle={ws.companyName}>
        <a href={`/settings/audit/export${q({ area })}`} className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3 text-[14px] font-medium text-ink hover:bg-subtle">
          Export CSV
        </a>
      </PageHeader>
      <SettingsTabs role={ws.role} active="audit" />
      <div className="mb-3 flex flex-wrap gap-1.5 text-[12px]" role="group" aria-label="Filter by area">
        {[{ key: undefined, label: "Everything" }, ...AUDIT_AREAS].map((a) => (
          <Link
            key={a.label}
            href={`/settings/audit${q({ area: a.key })}`}
            aria-current={area === a.key ? "page" : undefined}
            className={`rounded-full border px-2.5 py-1 ${area === a.key ? "border-accent bg-accent-subtle text-accent" : "border-line text-ink-2 hover:bg-subtle"}`}
          >
            {a.label}
          </Link>
        ))}
      </div>
      <Card className="overflow-hidden">
        {page.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-ink-3">Nothing recorded{area ? " in this area" : ""} yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="bg-subtle text-left text-[12px] text-ink-3">
                <tr>
                  <th className="w-48 px-5 py-2 font-medium">When</th>
                  <th className="w-44 py-2 pr-4 font-medium">Who</th>
                  <th className="py-2 pr-5 font-medium">What</th>
                </tr>
              </thead>
              <tbody>
                {page.map((e) => (
                  <tr key={e.id} className="border-b border-line/70 align-top">
                    <td className="num whitespace-nowrap px-5 py-2 text-ink-2">{when(e.at)}</td>
                    <td className="py-2 pr-4 text-ink">{e.actorName ?? <span className="text-ink-3">Vantiq (automatic)</span>}</td>
                    <td className="py-2 pr-5 text-ink">{describeEvent(e, names)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="mt-3 flex justify-between text-[13px]">
        <span className="text-ink-3">The log is append-only: nobody can edit or delete an entry.</span>
        {more && (
          <Link href={`/settings/audit${q({ area, before: page[page.length - 1]!.at.toISOString() })}`} className="font-medium text-accent hover:underline">
            Older entries →
          </Link>
        )}
      </div>
    </>
  );
}
