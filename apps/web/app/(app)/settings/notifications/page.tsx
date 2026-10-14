import { can, getDb, getEmailPrefs, listEmails, NOTIFY_KINDS } from "@vantiq/db";
import { redirect } from "next/navigation";
import { saveEmailPrefsAction } from "@/app/actions/notifications";
import { SubmitButton } from "@/components/AuthForm";
import { SettingsTabs } from "@/components/SettingsTabs";
import { Card, PageHeader, StatusPill } from "@/components/ui";
import { getWorkspace } from "@/lib/data";
import { emailConfigured } from "@/lib/email";
import { one, type SearchParams } from "@/lib/view";

export const metadata = { title: "Notifications · Vantiq Finance" };

const KIND_LABEL: Record<string, string> = {
  invite: "Invitation",
  added: "Added to company",
  close_assigned: "Close task assigned",
  close_review: "Ready for sign-off",
  comment: "Comment",
  pack_approved: "Month approved",
  sync_alert: "Out of balance",
};

const STATUS = {
  sent: { tone: "accent", label: "Sent" },
  logged: { tone: "neutral", label: "Not sent: email not set up" },
  failed: { tone: "warn", label: "Failed" },
  queued: { tone: "info", label: "Sending" },
  sending: { tone: "info", label: "Sending" },
} as const;

const when = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ") + " UTC";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  if (ws.mode === "demo") redirect("/overview");
  const db = getDb();
  const userId = ws.session!.user.id;
  const off = new Set(await getEmailPrefs(db, userId, ws.companyId!));
  const kinds = NOTIFY_KINDS.filter((k) => k.roles.includes(ws.role));
  const isAdmin = can.manageMembers(ws.role);
  const recent = isAdmin ? await listEmails(db, ws.companyId!, 30) : [];
  const configured = emailConfigured();

  return (
    <>
      <PageHeader title="Settings" subtitle={`What Vantiq emails you about ${ws.companyName}`} />
      <SettingsTabs role={ws.role} active="notifications" />
      {one(sp, "saved") && (
        <p role="status" className="mb-4 rounded-md bg-good/10 px-3 py-2 text-[13px] text-ink">
          Saved. Vantiq will email {ws.session!.user.email} about the things that are ticked.
        </p>
      )}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink">Email me when</h2>
          <p className="mt-1 text-[13px] text-ink-2">Sent to {ws.session!.user.email}. Invitations and password resets always arrive.</p>
          <form action={saveEmailPrefsAction} className="mt-4 flex flex-col gap-3">
            {kinds.map((k) => (
              <label key={k.kind} className="flex items-start gap-3 rounded-md border border-line p-3 text-[13px] hover:bg-subtle">
                <input type="checkbox" name="on" value={k.kind} defaultChecked={!off.has(k.kind)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
                <span>
                  <span className="block font-medium text-ink">{k.label}</span>
                  <span className="block text-ink-2">{k.detail}</span>
                </span>
              </label>
            ))}
            <div>
              <SubmitButton label="Save" pendingLabel="Saving…" />
            </div>
          </form>
        </Card>

        {isAdmin && (
          <Card className="overflow-hidden">
            <div className="border-b border-line px-5 py-3">
              <h2 className="text-[15px] font-semibold text-ink">Recent emails</h2>
              <p className="text-[12px] text-ink-3">
                {configured
                  ? "Everything Vantiq emailed people in this company."
                  : "Email isn't set up, so nothing is being sent. Add a RESEND_API_KEY to send these; until then you can read them here."}
              </p>
            </div>
            {recent.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-ink-3">No emails yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {recent.map((e) => (
                  <li key={e.id} className="px-5 py-3 text-[13px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 font-medium text-ink">{e.subject}</span>
                      <StatusPill tone={STATUS[e.status].tone}>{STATUS[e.status].label}</StatusPill>
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-3">
                      {KIND_LABEL[e.kind] ?? e.kind} · to {e.to} · {when(e.createdAt)}
                      {e.error && <span className="text-warn"> · {e.error}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
