import { can, getDb, listMembers, ROLES } from "@vantiq/db";
import { formatDate } from "@vantiq/domain";
import { redirect } from "next/navigation";
import { setRoleAction } from "@/app/actions/data";
import { AddMemberForm } from "@/components/AddMemberForm";
import { SettingsTabs } from "@/components/SettingsTabs";
import { Card, PageHeader, StatusPill } from "@/components/ui";
import { getWorkspace } from "@/lib/data";
import { one, type SearchParams } from "@/lib/view";

export const metadata = { title: "Members · Vantiq Finance" };

const ROLE_TEXT = {
  admin: "Everything, including adding people and changing roles",
  finance: "View, import files and edit account mapping",
  viewer: "View numbers and drill into transactions",
} as const;

export default async function MembersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  if (ws.mode === "demo" || !can.manageMembers(ws.role)) redirect("/overview");
  const members = await listMembers(getDb(), ws.companyId!);
  const error = one(sp, "error");
  return (
    <>
      <PageHeader title="Settings" subtitle={`People who can see ${ws.companyName} in Vantiq`} />
      <SettingsTabs role={ws.role} active="members" />
      {error && (
        <p role="alert" className="mb-4 rounded-md bg-bad/10 px-3 py-2 text-[13px] text-bad">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-subtle text-left text-[12px] text-ink-3">
              <tr>
                <th className="px-5 py-2 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="px-5 py-2 font-medium">Member since</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-line/70">
                  <td className="px-5 py-2">
                    <div className="flex items-center gap-2 text-ink">
                      {m.name}
                      {m.pending && <StatusPill tone="neutral">Invitation pending</StatusPill>}
                    </div>
                    <div className="text-[12px] text-ink-3">{m.email}</div>
                  </td>
                  <td className="py-2 pr-4">
                    <form action={setRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={m.id} />
                      <label htmlFor={`role-${m.id}`} className="sr-only">
                        Role for {m.name}
                      </label>
                      <select id={`role-${m.id}`} name="role" defaultValue={m.role} className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink">
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r[0]!.toUpperCase() + r.slice(1)}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="h-8 rounded-md border border-line px-2 text-[12px] text-ink-2 hover:bg-subtle">
                        Update
                      </button>
                    </form>
                  </td>
                  <td className="whitespace-nowrap px-5 py-2 text-ink-2">{formatDate(m.since.toISOString().slice(0, 10))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <h2 className="mb-3 text-[15px] font-semibold text-ink">Add someone</h2>
            <AddMemberForm />
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 text-[13px] font-semibold text-ink">What each role can do</h2>
            <dl className="flex flex-col gap-2 text-[13px]">
              {ROLES.map((r) => (
                <div key={r}>
                  <dt className="font-medium text-ink">{r[0]!.toUpperCase() + r.slice(1)}</dt>
                  <dd className="text-ink-2">{ROLE_TEXT[r]}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
