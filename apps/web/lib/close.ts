import "server-only";
import { closeDay, closeDueDate, closeProgress, isLate, taskStatus, type AutoCheck, type Period, type TaskStatus } from "@vantiq/domain";
import { closeTasksFor, commentsFor, todayFor, type ShownComment, type ShownTask } from "./closeData";
import type { Workspace } from "./data";
import { packState } from "./pack";
import { resolveView } from "./view";

export type CloseRow = ShownTask & { status: TaskStatus; due: string; late: boolean; comments: ShownComment[] };

/** Everything the close page shows for one month. */
export async function closeState(ws: Workspace, period: Period) {
  const month = resolveView({ period }, ws.ledger).period;
  const [st, tasks, comments] = await Promise.all([packState(ws, month), closeTasksFor(ws, month), commentsFor(ws, month)]);
  const ok = (k: string) => st.checks.find((c) => c.key === k)?.ok ?? false;
  const checks: Record<AutoCheck, boolean> = {
    synced: ws.ledger.transactionsFor({ periods: [st.live.period] }).length > 0,
    mapped: ok("mapped"),
    reconciled: ok("reconciled"),
    explained: ok("explained"),
    approved: st.locked,
  };
  const today = todayFor(ws);
  const p = st.live.period;
  const rows: CloseRow[] = tasks.map((t) => {
    const status = taskStatus(t, checks);
    return { ...t, status, due: closeDueDate(p, t.dueDay), late: isLate(p, t, status, today), comments: comments.filter((c) => c.anchor === `task:${t.key}`) };
  });
  return { period: p, label: st.live.label, pack: st, rows, progress: closeProgress(p, rows, today), today, day: closeDay(p, today) };
}
