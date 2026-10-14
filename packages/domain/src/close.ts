import { addMonths, parsePeriod } from "./period";
import type { Period } from "./types";

/**
 * The month-end close checklist (architecture.md Phase 2). Each month gets the
 * same standard tasks; a team adds its own. Some tasks are checked by Vantiq
 * itself (the books are mapped, reconciled, explained, the pack approved), the
 * rest are ticked off by their owner and, when a reviewer is set, signed off
 * by the reviewer. Due dates count business days into the following month,
 * the way close calendars are written ("day 3").
 */

export type CloseSection = "books" | "accruals" | "review" | "signoff";

export const CLOSE_SECTIONS: { section: CloseSection; label: string }[] = [
  { section: "books", label: "Books" },
  { section: "accruals", label: "Accruals and adjustments" },
  { section: "review", label: "Review" },
  { section: "signoff", label: "Sign-off" },
];

/** Things Vantiq checks itself; these tasks can't be ticked by hand. */
export type AutoCheck = "synced" | "mapped" | "reconciled" | "explained" | "approved";

export interface CloseTemplateTask {
  key: string;
  section: CloseSection;
  title: string;
  detail: string;
  /** Business day of the following month it is due on. */
  dueDay: number;
  auto?: AutoCheck;
  href?: string;
}

export const CLOSE_TEMPLATE: CloseTemplateTask[] = [
  { key: "synced", section: "books", title: "Bring in the month's transactions", detail: "Sync the accounting system or import the month's ledger.", dueDay: 1, auto: "synced", href: "/connections" },
  { key: "bank", section: "books", title: "Reconcile bank and investment accounts", detail: "Match every cash and investment account to its statement.", dueDay: 2 },
  { key: "mapped", section: "books", title: "Map every account", detail: "No transactions sit in unmapped accounts.", dueDay: 2, auto: "mapped", href: "/mappings" },
  { key: "reconciled", section: "books", title: "Books agree with the accounting system", detail: "Net income matches the source system's income statement.", dueDay: 3, auto: "reconciled", href: "/connections" },
  { key: "cro", section: "accruals", title: "Book CRO and clinical trial accruals", detail: "Review each trial's suggested accrual and post the journal entry.", dueDay: 3, href: "/trials" },
  { key: "payroll", section: "accruals", title: "Accrue payroll, bonus and PTO", detail: "Book unpaid wages, the bonus accrual and PTO.", dueDay: 3 },
  { key: "ap", section: "accruals", title: "Check AP cutoff for unbilled work", detail: "Accrue services received from vendors who haven't invoiced yet.", dueDay: 3 },
  { key: "prepaids", section: "accruals", title: "Amortize prepaid expenses", detail: "Expense this month's share of prepaid contracts, insurance and licenses.", dueDay: 4 },
  { key: "stock", section: "accruals", title: "Book stock-based compensation", detail: "Record the month's expense from the equity schedule.", dueDay: 4 },
  { key: "explained", section: "review", title: "Explain material variances", detail: "Every line over the materiality threshold has an accepted or edited explanation.", dueDay: 5, auto: "explained", href: "/variances" },
  { key: "flux", section: "review", title: "Department owners review their spend", detail: "Each budget owner confirms their lines and comments on anything unexpected.", dueDay: 5 },
  { key: "cash", section: "review", title: "Review cash and runway", detail: "Confirm the cash balance and the runway shown in the pack.", dueDay: 6 },
  { key: "approved", section: "signoff", title: "Approve the review pack", detail: "Approving locks the month and keeps a copy of exactly what was approved.", dueDay: 7, auto: "approved", href: "/pack" },
];

export type TaskStatus = "open" | "prepared" | "done";

export interface CloseTask extends CloseTemplateTask {
  custom: boolean;
  ownerId: string | null;
  ownerName: string | null;
  reviewerId: string | null;
  reviewerName: string | null;
  preparedByName: string | null;
  preparedAt: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
}

/**
 * Where a task stands. An automatic task is done when its check passes. A
 * manual task is "prepared" once its owner ticks it, and "done" when the
 * reviewer signs off, or straight away when it has no reviewer.
 */
export function taskStatus(t: Pick<CloseTask, "auto" | "preparedAt" | "reviewedAt" | "reviewerId">, checks: Partial<Record<AutoCheck, boolean>>): TaskStatus {
  if (t.auto) return checks[t.auto] ? "done" : "open";
  if (!t.preparedAt) return "open";
  if (t.reviewerId && !t.reviewedAt) return "prepared";
  return "done";
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The date of the nth business day (Monday to Friday) of the month after `period`. */
export function closeDueDate(period: Period, day: number): string {
  const { year, month } = parsePeriod(addMonths(period, 1));
  const d = new Date(Date.UTC(year, month - 1, 1));
  let n = 0;
  for (;;) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && ++n >= Math.max(1, day)) return iso(d);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

/** Business days of the close elapsed by `today` (0 before the month after `period` starts). */
export function closeDay(period: Period, today: string): number {
  const { year, month } = parsePeriod(addMonths(period, 1));
  const d = new Date(Date.UTC(year, month - 1, 1));
  let n = 0;
  while (iso(d) <= today) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
    d.setUTCDate(d.getUTCDate() + 1);
    if (n > 400) break;
  }
  return n;
}

export const isLate = (period: Period, t: Pick<CloseTask, "dueDay">, status: TaskStatus, today: string) => status !== "done" && today > closeDueDate(period, t.dueDay);

export interface CloseProgress {
  total: number;
  done: number;
  prepared: number;
  late: number;
  sections: { section: CloseSection; label: string; total: number; done: number; prepared: number }[];
  /** Tasks due by each business day of the close, and how many of those are done. */
  byDay: { day: number; date: string; due: number; done: number }[];
}

export function closeProgress(period: Period, tasks: (CloseTask & { status: TaskStatus })[], today: string): CloseProgress {
  const count = (list: typeof tasks, s: TaskStatus) => list.filter((t) => t.status === s).length;
  const maxDay = Math.max(1, ...tasks.map((t) => t.dueDay));
  return {
    total: tasks.length,
    done: count(tasks, "done"),
    prepared: count(tasks, "prepared"),
    late: tasks.filter((t) => isLate(period, t, t.status, today)).length,
    sections: CLOSE_SECTIONS.map(({ section, label }) => {
      const mine = tasks.filter((t) => t.section === section);
      return { section, label, total: mine.length, done: count(mine, "done"), prepared: count(mine, "prepared") };
    }).filter((s) => s.total > 0),
    byDay: Array.from({ length: maxDay }, (_, i) => {
      const mine = tasks.filter((t) => t.dueDay <= i + 1);
      return { day: i + 1, date: closeDueDate(period, i + 1), due: mine.length, done: count(mine, "done") };
    }),
  };
}

/** A comment's anchor: a variance line by its reporting category, or a close task by its key. */
export type CommentAnchor = `line:${string}` | `task:${string}`;

export const lineAnchor = (categoryId: string): CommentAnchor => `line:${categoryId}`;
export const taskAnchor = (key: string): CommentAnchor => `task:${key}`;
