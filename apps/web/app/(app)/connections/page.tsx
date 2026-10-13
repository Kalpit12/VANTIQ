import { can, getConnection, getDb, listPeriodChecks, listSyncRuns } from "@vantiq/db";
import { formatCompactCurrency, formatCurrency, periodLabel } from "@vantiq/domain";
import { ACCOUNTING_SYSTEMS } from "@vantiq/integrations";
import { connectSandboxAction, disconnectAction, syncNowAction } from "@/app/actions/connections";
import { SubmitButton } from "@/components/AuthForm";
import { ConnectSystem } from "@/components/ConnectSystem";
import { DemoNotice } from "@/components/DemoNotice";
import { Card, PageHeader, StatusPill } from "@/components/ui";
import { getWorkspace } from "@/lib/data";
import { one, type SearchParams } from "@/lib/view";

export const metadata = { title: "Connections · Vantiq Finance" };

const TRIGGER = { initial: "First sync", manual: "Sync now", scheduled: "Scheduled" } as const;

function ago(d: Date, now = Date.now()) {
  const m = Math.round((now - d.getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} days ago`;
}

const when = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  if (ws.mode === "demo") return <Card className="max-w-[480px] p-6"><DemoNotice /></Card>;
  const db = getDb();
  const allowed = can.importData(ws.role);
  const conn = await getConnection(db, ws.companyId!);
  const error = one(sp, "error");

  return (
    <>
      <PageHeader title="Connections" subtitle="Vantiq reads your ledger straight from your accounting system, then checks every month against it." />
      {error && (
        <p role="alert" className="mb-4 rounded-md bg-warn/10 px-3 py-2 text-[13px] text-ink">
          {error === "not-empty" ? "The sandbox only connects to an empty company, so it never mixes with your own books." : error}
        </p>
      )}
      {conn ? <Connected conn={conn} companyId={ws.companyId!} allowed={allowed} /> : <NotConnected allowed={allowed} empty={!ws.ledger.hasData()} />}
    </>
  );
}

function NotConnected({ allowed, empty }: { allowed: boolean; empty: boolean }) {
  const ready = Boolean(process.env.MERGE_API_KEY && process.env.CONNECTION_SECRET_KEY);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ACCOUNTING_SYSTEMS.map((s) => (
          <Card key={s.id} className="flex flex-col p-4">
            <div className="flex items-center gap-3">
              <span className="num grid h-9 w-9 place-items-center rounded-md bg-accent-subtle text-[12px] font-semibold text-accent" aria-hidden>
                {s.mono}
              </span>
              <div>
                <h2 className="text-[14px] font-semibold text-ink">{s.name}</h2>
                <p className="text-[12px] text-ink-3">Ledger, accounts, classes</p>
              </div>
            </div>
            {allowed && <ConnectSystem systemId={s.id} systemName={s.name} enabled={ready} />}
          </Card>
        ))}
      </div>
      {!allowed && <p className="mt-3 text-[13px] text-ink-2">Your role can view numbers but not connect systems. Ask an admin or someone in Finance.</p>}
      {allowed && !ready && (
        <p className="mt-3 text-[13px] text-ink-2">
          Connecting a real system needs a Merge account. Add <code className="num rounded bg-subtle px-1">MERGE_API_KEY</code> and{" "}
          <code className="num rounded bg-subtle px-1">CONNECTION_SECRET_KEY</code> to the server environment to turn these buttons on.
        </p>
      )}
      <Card className="mt-4 p-5">
        <h2 className="text-[15px] font-semibold text-ink">What a connection does</h2>
        <ul className="mt-2 grid gap-1.5 text-[13px] text-ink-2 sm:grid-cols-3">
          <li>Reads the last 24 months of profit-and-loss lines, then only what changed.</li>
          <li>Checks each month&apos;s net income against your system&apos;s own report.</li>
          <li>Never writes to your books. Vantiq stores an encrypted access token, not your password.</li>
        </ul>
      </Card>
      {allowed && empty && (
        <Card className="mt-4 flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">No accounting system handy?</h2>
            <p className="text-[13px] text-ink-2">Connect a sandbox QuickBooks holding Helixa Therapeutics&apos; books to see a sync and the month-end check.</p>
          </div>
          <form action={connectSandboxAction}>
            <SubmitButton label="Connect the sandbox" pendingLabel="Syncing 24 months…" />
          </form>
        </Card>
      )}
    </>
  );
}

async function Connected({ conn, companyId, allowed }: { conn: NonNullable<Awaited<ReturnType<typeof getConnection>>>; companyId: string; allowed: boolean }) {
  const db = getDb();
  const [checks, runs] = await Promise.all([listPeriodChecks(db, companyId), listSyncRuns(db, companyId, 8)]);
  const off = checks.filter((c) => c.status === "out_of_balance");
  const compared = checks.filter((c) => c.status !== "unavailable");
  const system = conn.systemName;

  return (
    <>
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-start gap-3">
          <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${conn.status === "active" ? "bg-good" : "bg-bad"}`} aria-hidden />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[16px] font-semibold text-ink">{system}</h2>
              {conn.status === "active" ? <StatusPill tone="accent">Connected</StatusPill> : <StatusPill tone="warn">Needs attention</StatusPill>}
            </div>
            <p className="text-[13px] text-ink-2">
              {conn.lastSyncedAt ? <>Last synced {ago(conn.lastSyncedAt)}. Vantiq syncs again on its own schedule.</> : "Not synced yet."}
            </p>
            {conn.lastError && (
              <p role="alert" className="mt-1 text-[13px] text-bad">
                {conn.lastError}
              </p>
            )}
          </div>
        </div>
        {allowed && (
          <div className="flex items-center gap-2">
            <form action={disconnectAction}>
              <SubmitButton label="Disconnect" pendingLabel="Disconnecting…" className="!bg-surface border border-line-strong !text-ink hover:!bg-subtle" />
            </form>
            <form action={syncNowAction}>
              <SubmitButton label="Sync now" pendingLabel="Syncing…" />
            </form>
          </div>
        )}
      </Card>

      <Card className="mt-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-ink">Month-end check</h2>
          <p className="text-[13px] text-ink-2">
            {compared.length === 0
              ? `${system} has not reported monthly net income yet.`
              : off.length === 0
                ? `All ${compared.length} months match ${system}.`
                : `${off.length} of ${compared.length} months don't match ${system}.`}
          </p>
        </div>
        <p className="mt-1 text-[12px] text-ink-3">Net income Vantiq adds up from the synced lines, against the income statement in {system}. A difference over $1 is flagged.</p>
        <ol className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6 xl:grid-cols-12" aria-label="Months checked">
          {checks.map((c) => {
            const diff = c.sourceMinor === null ? null : c.sourceMinor - c.vantiqMinor;
            const tone =
              c.status === "balanced" ? "border-good/30 bg-good/5" : c.status === "out_of_balance" ? "border-bad/50 bg-bad/10" : "border-line bg-subtle";
            const label = c.status === "balanced" ? "Matches" : c.status === "out_of_balance" ? `Off ${formatCompactCurrency(Math.abs(diff!))}` : "No report";
            return (
              <li key={c.period} className={`rounded-md border px-2 py-1.5 ${tone}`} title={c.sourceMinor === null ? undefined : `${system}: ${formatCurrency(c.sourceMinor)} · Vantiq: ${formatCurrency(c.vantiqMinor)}`}>
                <p className="text-[12px] font-medium text-ink">{periodLabel(c.period)}</p>
                <p className={`num truncate text-[11px] ${c.status === "out_of_balance" ? "font-semibold text-bad" : "text-ink-3"}`}>{label}</p>
              </li>
            );
          })}
        </ol>
        {off.length > 0 && (
          <p className="mt-3 text-[13px] text-ink-2">
            A mismatch usually means a closed month was edited in {system}, or the books changed since the last sync. Run <strong className="font-medium text-ink">Sync now</strong>; if it
            stays, look for back-dated entries in {periodLabel(off[0]!.period)}.
          </p>
        )}
      </Card>

      <Card className="mt-4 overflow-hidden">
        <h2 className="border-b border-line px-5 py-3 text-[15px] font-semibold text-ink">Sync history</h2>
        <div className="overflow-x-auto">
          <table className="num w-full text-[13px]">
            <thead className="bg-subtle text-left text-[12px] text-ink-3">
              <tr>
                <th className="px-5 py-2 font-medium">Started</th>
                <th className="py-2 pr-4 font-medium">Kind</th>
                <th className="py-2 pr-4 text-right font-medium">Added</th>
                <th className="py-2 pr-4 text-right font-medium">Changed</th>
                <th className="py-2 pr-4 text-right font-medium">Removed</th>
                <th className="px-5 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-line/70 last:border-0">
                  <td className="whitespace-nowrap px-5 py-2 text-ink">{when(r.startedAt)}</td>
                  <td className="py-2 pr-4 text-ink-2">{TRIGGER[r.trigger]}</td>
                  <td className="py-2 pr-4 text-right">{r.inserted.toLocaleString("en-US")}</td>
                  <td className="py-2 pr-4 text-right">{r.updated.toLocaleString("en-US")}</td>
                  <td className="py-2 pr-4 text-right">{r.deleted.toLocaleString("en-US")}</td>
                  <td className="px-5 py-2">
                    {r.status === "done" ? <StatusPill tone="accent">Done</StatusPill> : r.status === "running" ? <StatusPill tone="info">Running</StatusPill> : <span className="text-bad">{r.error}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
