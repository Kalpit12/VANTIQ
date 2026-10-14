import Link from "next/link";
import { can, getConnection, getDb, listPacks } from "@vantiq/db";
import { DEFAULT_THRESHOLDS, formatCompactCurrency, formatDate, periodLabel } from "@vantiq/domain";
import { redirect } from "next/navigation";
import { renameCompanyAction } from "@/app/actions/packs";
import { SubmitButton } from "@/components/AuthForm";
import { SettingsTabs } from "@/components/SettingsTabs";
import { Card, PageHeader, StatusPill } from "@/components/ui";
import { getWorkspace } from "@/lib/data";
import { one, type SearchParams } from "@/lib/view";

export const metadata = { title: "Settings · Vantiq Finance" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  if (ws.mode === "demo") redirect("/overview");
  const db = getDb();
  const [packs, conn] = await Promise.all([listPacks(db, ws.companyId!), getConnection(db, ws.companyId!)]);
  const admin = can.manageMembers(ws.role);
  const error = one(sp, "error");
  return (
    <>
      <PageHeader title="Settings" subtitle={ws.companyName} />
      <SettingsTabs role={ws.role} active="general" />
      {error && (
        <p role="alert" className="mb-4 rounded-md bg-bad/10 px-3 py-2 text-[13px] text-bad">
          {error}
        </p>
      )}
      {one(sp, "saved") && (
        <p role="status" className="mb-4 rounded-md bg-good/10 px-3 py-2 text-[13px] text-good">
          Saved.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Company</h2>
          {admin ? (
            <form action={renameCompanyAction} className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] text-ink-2">
                Name shown on screens and review packs
                <input name="name" defaultValue={ws.companyName} required maxLength={120} className="h-9 rounded-md border border-line-strong bg-surface px-3 text-[14px] text-ink" />
              </label>
              <SubmitButton label="Save" pendingLabel="Saving…" />
            </form>
          ) : (
            <p className="text-[14px] text-ink">{ws.companyName}</p>
          )}
          <dl className="mt-5 grid grid-cols-[160px_minmax(0,1fr)] gap-y-2 text-[13px]">
            <dt className="text-ink-3">Currency</dt>
            <dd className="text-ink">US dollars</dd>
            <dt className="text-ink-3">Books come from</dt>
            <dd className="text-ink">
              {conn ? conn.systemName : "Imported files"}{" "}
              <Link href={conn ? "/connections" : "/import"} className="ml-1 text-accent hover:underline">
                Manage →
              </Link>
            </dd>
            <dt className="text-ink-3">Material variance</dt>
            <dd className="text-ink">
              Over ±{DEFAULT_THRESHOLDS.pct * 100}% and ±{formatCompactCurrency(DEFAULT_THRESHOLDS.abs)}, whichever is larger
            </dd>
            <dt className="text-ink-3">Your role</dt>
            <dd className="text-ink">{ws.role[0]!.toUpperCase() + ws.role.slice(1)}</dd>
          </dl>
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-line px-5 py-3">
            <h2 className="text-[15px] font-semibold text-ink">Approved months</h2>
            <p className="text-[12px] text-ink-3">An approved month is locked; reopening it is recorded in the audit log</p>
          </div>
          {packs.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-ink-3">
              No month has been approved yet.{" "}
              <Link href="/pack" className="font-medium text-accent hover:underline">
                Open the review pack →
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-line text-[13px]">
              {packs.map((p) => (
                <li key={p.period} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <Link href={`/pack?period=${p.period}`} className="font-medium text-ink hover:underline">
                    {periodLabel(p.period)}
                  </Link>
                  <span className="flex items-center gap-2 text-ink-2">
                    {p.status === "approved"
                      ? `${p.approvedByName ?? "Someone"} · ${formatDate(p.approvedAt.toISOString().slice(0, 10))}`
                      : `Reopened by ${p.reopenedByName ?? "someone"}`}
                    <StatusPill tone={p.status === "approved" ? "accent" : "warn"}>{p.status === "approved" ? "Locked" : "Reopened"}</StatusPill>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
