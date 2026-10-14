import Link from "next/link";
import { can, getDb, listMembers } from "@vantiq/db";
import { CLOSE_SECTIONS, formatDate } from "@vantiq/domain";
import { addTaskAction, assignTaskAction, prepareTaskAction, reviewTaskAction } from "@/app/actions/close";
import { SubmitButton } from "@/components/AuthForm";
import { ChartCard } from "@/components/ChartCard";
import { CALENDAR_LEGEND, CloseCalendar } from "@/components/close/CloseCalendar";
import { CommentThread } from "@/components/close/CommentThread";
import { NoData } from "@/components/NoData";
import { Card, PageHeader, StatusPill } from "@/components/ui";
import { closeState, type CloseRow } from "@/lib/close";
import { getWorkspace } from "@/lib/data";
import { packStatusText } from "@/lib/pack";
import { one, type SearchParams } from "@/lib/view";

export const metadata = { title: "Close checklist · Vantiq Finance" };

const field = "h-9 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink";
const stamp = (iso: string) => formatDate(iso.slice(0, 10));
const dueText = (r: CloseRow) => `Day ${r.dueDay} · ${new Date(`${r.due}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}`;

function StatusIcon({ r }: { r: CloseRow }) {
  const [cls, glyph, text] =
    r.status === "done"
      ? ["bg-good/15 text-good", "✓", "Done"]
      : r.status === "prepared"
        ? ["bg-info/15 text-info", "◐", "Waiting for sign-off"]
        : r.late
          ? ["bg-bad/15 text-bad", "!", "Late"]
          : ["border border-line-strong text-ink-3", "", "Open"];
  return (
    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${cls}`} title={text}>
      <span aria-hidden>{glyph}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

export default async function ClosePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  if (!ws.ledger.hasData()) return <NoData title="Close checklist" canImport={ws.mode === "db" && can.importData(ws.role)} />;
  const cs = await closeState(ws, one(sp, "period") ?? "");
  const { period, label, progress, rows } = cs;
  const me = ws.session?.user.id ?? null;
  const mine = ws.mode === "db" && one(sp, "mine") === "1";
  const live = ws.mode === "db" && !cs.pack.locked;
  const canManage = live && can.manageClose(ws.role);
  const members = canManage ? await listMembers(getDb(), ws.companyId!) : [];
  const shown = mine ? rows.filter((r) => r.ownerId === me || r.reviewerId === me) : rows;
  const error = one(sp, "cerr");
  const base = `/close?period=${period}${mine ? "&mine=1" : ""}`;
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const lastDay = progress.byDay.at(-1);

  return (
    <>
      <PageHeader
        title="Close checklist"
        subtitle={`${label} close · ${
          cs.day === 0 ? `starts ${stamp(progress.byDay[0]!.date)}` : lastDay && cs.day > lastDay.day && progress.done === progress.total ? "complete" : `business day ${cs.day}, ${stamp(cs.today)}`
        }`}
      >
        {ws.mode === "db" && (
          <nav aria-label="Which tasks" className="flex rounded-md border border-line-strong p-0.5 text-[13px]">
            {[
              { href: `/close?period=${period}`, label: "All tasks", on: !mine },
              { href: `/close?period=${period}&mine=1`, label: "My tasks", on: mine },
            ].map((l) => (
              <Link key={l.label} href={l.href} aria-current={l.on ? "page" : undefined} className={`rounded px-3 py-1 font-medium ${l.on ? "bg-accent text-accent-contrast" : "text-ink-2 hover:bg-subtle"}`}>
                {l.label}
              </Link>
            ))}
          </nav>
        )}
      </PageHeader>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-bad/10 px-3 py-2 text-[13px] text-bad">
          {error}
        </p>
      )}
      {cs.pack.locked && (
        <p role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-md bg-accent-subtle px-3 py-2 text-[13px] text-ink">
          <StatusPill tone="accent">Closed</StatusPill>
          {packStatusText(cs.pack)}. The checklist and its comments are locked.
        </p>
      )}
      {ws.mode === "demo" && (
        <p className="mb-4 text-[12px] text-ink-3">This is Helixa&apos;s September close part way through. Sign up to run your own close with your team.</p>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-5">
          <p className="text-[12px] text-ink-3">Tasks done</p>
          <p className="num mt-1 text-[26px] font-semibold text-ink">
            {progress.done} of {progress.total}
          </p>
          <div className="mt-2 h-2 rounded-full bg-subtle" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Share of close tasks done">
            <div className="h-2 rounded-full bg-[var(--favorable)]" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-[12px] text-ink-2">
            {progress.prepared > 0 && `${progress.prepared} waiting for sign-off. `}
            {progress.late > 0 ? `${progress.late} past due.` : "Nothing is past due."}
          </p>
          <ul className="mt-4 flex flex-col gap-2 border-t border-line pt-3">
            {progress.sections.map((s) => (
              <li key={s.section} className="text-[12px]">
                <div className="flex justify-between gap-2">
                  <span className="text-ink">{s.label}</span>
                  <span className="num text-ink-2">
                    {s.done} of {s.total}
                  </span>
                </div>
                <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden>
                  <div className="bg-[var(--favorable)]" style={{ width: `${(s.done / s.total) * 100}%` }} />
                  <div className="bg-[var(--info)]" style={{ width: `${(s.prepared / s.total) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <ChartCard
          className="xl:col-span-2"
          title={progress.late ? `${progress.late} task${progress.late === 1 ? " is" : "s are"} past due` : progress.done === progress.total ? "Every task is done" : "The close is on schedule"}
          subtitle={`Tasks by business day of the ${label} close`}
          legend={CALENDAR_LEGEND}
          table={{
            columns: ["Day", "Date", "Due by then", "Done"],
            rows: progress.byDay.map((d) => [`Day ${d.day}`, stamp(d.date), String(d.due), String(d.done)]),
          }}
        >
          <CloseCalendar days={progress.byDay} tasks={rows} today={cs.day} />
        </ChartCard>
      </div>

      {CLOSE_SECTIONS.map(({ section, label: sectionLabel }) => {
        const list = shown.filter((r) => r.section === section);
        if (!list.length) return null;
        return (
          <Card key={section} className="mt-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="text-[15px] font-semibold text-ink">{sectionLabel}</h2>
              <span className="text-[12px] text-ink-3">
                {list.filter((r) => r.status === "done").length} of {list.length} done
              </span>
            </div>
            <ul className="divide-y divide-line">
              {list.map((r) => {
                const back = `${base}#task-${r.key}`;
                const isOwner = me !== null && r.ownerId === me;
                const canTick = live && !r.auto && (can.manageClose(ws.role) || isOwner);
                const canSign = live && r.status === "prepared" && (r.reviewerId === me || ws.role === "admin") && r.preparedById !== me;
                return (
                  <li key={r.key} id={`task-${r.key}`} className="flex scroll-mt-20 gap-3 px-5 py-3.5">
                    <StatusIcon r={r} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                        <div className="min-w-0">
                          <p className="text-[14px] font-medium text-ink">
                            {r.title}
                            {r.custom && <span className="ml-2 align-middle text-[11px] font-normal text-ink-3">Team task</span>}
                          </p>
                          {r.detail && <p className="text-[12px] text-ink-2">{r.detail}</p>}
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
                            <span>Owner: {r.ownerName ?? "nobody yet"}</span>
                            {!r.auto && <span>Reviewer: {r.reviewerName ?? "none"}</span>}
                            <span className={r.late ? "font-medium text-bad" : ""}>
                              {dueText(r)}
                              {r.late && " · late"}
                            </span>
                          </p>
                          {(r.auto || r.preparedAt) && (
                            <p className="mt-1 text-[12px] text-ink-2">
                              {r.auto
                                ? `Checked by Vantiq: ${r.status === "done" ? "passing" : "not yet"}.`
                                : [
                                    r.preparedAt && `Ticked off by ${r.preparedByName ?? "a former member"} on ${stamp(r.preparedAt)}`,
                                    r.reviewedAt && `signed off by ${r.reviewedByName ?? "a former member"} on ${stamp(r.reviewedAt)}`,
                                  ]
                                    .filter(Boolean)
                                    .join(", ") + "."}
                              {r.auto && r.href && r.status !== "done" && (
                                <>
                                  {" "}
                                  <Link href={`${r.href}?period=${period}`} className="font-medium text-accent hover:underline">
                                    Open →
                                  </Link>
                                </>
                              )}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {!r.auto && r.href && (
                            <Link href={`${r.href}?period=${period}`} className="text-[13px] font-medium text-accent hover:underline">
                              Open
                            </Link>
                          )}
                          {canTick && r.status === "open" && r.reviewerId !== me && (
                            <form action={prepareTaskAction}>
                              <input type="hidden" name="period" value={period} />
                              <input type="hidden" name="key" value={r.key} />
                              <input type="hidden" name="done" value="1" />
                              <input type="hidden" name="back" value={back} />
                              <SubmitButton label="Mark done" pendingLabel="Saving…" className="!h-8 !px-3 !text-[13px]" />
                            </form>
                          )}
                          {canSign && (
                            <form action={reviewTaskAction}>
                              <input type="hidden" name="period" value={period} />
                              <input type="hidden" name="key" value={r.key} />
                              <input type="hidden" name="back" value={back} />
                              <SubmitButton label="Sign off" pendingLabel="Signing…" className="!h-8 !px-3 !text-[13px]" />
                            </form>
                          )}
                          {canTick && r.status !== "open" && (
                            <form action={prepareTaskAction}>
                              <input type="hidden" name="period" value={period} />
                              <input type="hidden" name="key" value={r.key} />
                              <input type="hidden" name="done" value="0" />
                              <input type="hidden" name="back" value={back} />
                              <button type="submit" className="h-8 rounded-md border border-line-strong px-3 text-[13px] text-ink hover:bg-subtle">
                                Undo
                              </button>
                            </form>
                          )}
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                        <details className="group min-w-0 flex-1 basis-[320px]" open={r.comments.length > 0 && !r.auto && r.status !== "done"}>
                          <summary className="cursor-pointer text-[12px] font-medium text-ink-2 hover:text-ink">
                            Comments{r.comments.length ? ` (${r.comments.length})` : ""}
                          </summary>
                          <div className="mt-2">
                            <CommentThread
                              comments={r.comments.map((c) => ({ id: c.id, body: c.body, by: c.authorName, at: c.at }))}
                              anchor={`task:${r.key}`}
                              period={period}
                              back={back}
                              canComment={live}
                              label={`Comment on ${r.title}`}
                            />
                            {!live && r.comments.length === 0 && <p className="text-[12px] text-ink-3">No comments.</p>}
                          </div>
                        </details>
                        {canManage && (
                          <details className="text-[12px]">
                            <summary className="cursor-pointer font-medium text-ink-2 hover:text-ink">Assign</summary>
                            <form action={assignTaskAction} className="mt-2 flex flex-wrap items-end gap-2">
                              <input type="hidden" name="period" value={period} />
                              <input type="hidden" name="key" value={r.key} />
                              <input type="hidden" name="back" value={back} />
                              <label className="flex flex-col gap-1 text-ink-2">
                                Owner
                                <select name="ownerId" defaultValue={r.ownerId ?? ""} className={field}>
                                  <option value="">Nobody</option>
                                  {members.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              {!r.auto && (
                                <label className="flex flex-col gap-1 text-ink-2">
                                  Reviewer
                                  <select name="reviewerId" defaultValue={r.reviewerId ?? ""} className={field}>
                                    <option value="">No sign-off</option>
                                    {members.map((m) => (
                                      <option key={m.id} value={m.id}>
                                        {m.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              )}
                              <SubmitButton label="Save" pendingLabel="Saving…" className="!h-9 !px-3 !text-[13px]" />
                            </form>
                          </details>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
      {mine && shown.length === 0 && (
        <Card className="mt-4 p-5">
          <p className="text-[13px] text-ink-2">Nothing in the {label} close is assigned to you.</p>
        </Card>
      )}

      {canManage && (
        <Card className="mt-4 max-w-[760px] p-5">
          <h2 className="text-[15px] font-semibold text-ink">Add a task</h2>
          <p className="mt-1 text-[13px] text-ink-2">Your own tasks carry forward to later months, with their owners and reviewers.</p>
          <form action={addTaskAction} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="period" value={period} />
            <input type="hidden" name="back" value={base} />
            <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-[13px] font-medium text-ink">
              Task
              <input name="title" required maxLength={200} className={field} placeholder="Reconcile the grant receivable" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-ink">
              Section
              <select name="section" defaultValue="books" className={field}>
                {CLOSE_SECTIONS.map((s) => (
                  <option key={s.section} value={s.section}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-ink">
              Due on day
              <input name="dueDay" type="number" min={1} max={20} defaultValue={3} required className={`${field} w-20`} />
            </label>
            <SubmitButton label="Add task" pendingLabel="Adding…" />
          </form>
        </Card>
      )}
    </>
  );
}
