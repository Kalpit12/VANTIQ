import { CLOSE_TEMPLATE, type CloseTask, type CommentAnchor } from "@vantiq/domain";
import { SAMPLE_LAST_PERIOD } from "./periods";

/**
 * Helixa's September 2026 close as the demo shows it, part way through:
 * the books and most accruals are done, a couple of tasks wait on sign-off,
 * and the department review is still open.
 */
const TEAM = {
  cfo: "Elena Park",
  controller: "Priya Shah",
  accountant: "Marcus Lee",
  clinops: "Dana Ortiz",
};

type Who = keyof typeof TEAM;
const plan: Record<string, { owner: Who; reviewer?: Who; prepared?: string; reviewed?: string }> = {
  synced: { owner: "accountant" },
  bank: { owner: "accountant", reviewer: "controller", prepared: "2026-10-02T16:10:00Z", reviewed: "2026-10-05T09:30:00Z" },
  mapped: { owner: "accountant" },
  reconciled: { owner: "controller" },
  cro: { owner: "controller", reviewer: "cfo", prepared: "2026-10-05T18:00:00Z", reviewed: "2026-10-06T08:45:00Z" },
  payroll: { owner: "accountant", reviewer: "controller", prepared: "2026-10-05T15:20:00Z", reviewed: "2026-10-06T10:05:00Z" },
  ap: { owner: "accountant", reviewer: "controller", prepared: "2026-10-06T17:40:00Z" },
  prepaids: { owner: "accountant", reviewer: "controller", prepared: "2026-10-06T12:00:00Z", reviewed: "2026-10-07T09:00:00Z" },
  stock: { owner: "controller", reviewer: "cfo" },
  explained: { owner: "controller" },
  flux: { owner: "clinops", reviewer: "controller" },
  cash: { owner: "cfo" },
  approved: { owner: "cfo" },
};

export const SAMPLE_CLOSE_PERIOD = SAMPLE_LAST_PERIOD;
/** The demo's "today": business day 5 of the September close. */
export const SAMPLE_CLOSE_TODAY = "2026-10-07";

export function generateSampleClose(): { tasks: CloseTask[]; comments: { anchor: CommentAnchor; body: string; authorName: string; at: string }[] } {
  const tasks = CLOSE_TEMPLATE.map((t): CloseTask => {
    const p = plan[t.key]!;
    return {
      ...t,
      custom: false,
      ownerId: p.owner,
      ownerName: TEAM[p.owner],
      reviewerId: p.reviewer ?? null,
      reviewerName: p.reviewer ? TEAM[p.reviewer] : null,
      preparedByName: p.prepared ? TEAM[p.owner] : null,
      preparedAt: p.prepared ?? null,
      reviewedByName: p.reviewed && p.reviewer ? TEAM[p.reviewer] : null,
      reviewedAt: p.reviewed ?? null,
    };
  });
  tasks.splice(4, 0, {
    key: "c-grant",
    section: "books",
    title: "Reconcile the NIH grant receivable",
    detail: "",
    dueDay: 4,
    custom: true,
    ownerId: "accountant",
    ownerName: TEAM.accountant,
    reviewerId: "controller",
    reviewerName: TEAM.controller,
    preparedByName: TEAM.accountant,
    preparedAt: "2026-10-06T11:00:00Z",
    reviewedByName: TEAM.controller,
    reviewedAt: "2026-10-06T15:30:00Z",
  });
  return {
    tasks,
    comments: [
      { anchor: "task:ap", body: "Two Strata invoices for September work haven't arrived; accrued $38k from their estimate.", authorName: TEAM.accountant, at: "2026-10-06T17:38:00Z" },
      { anchor: "task:flux", body: "Waiting on Dana's review of the HX-204 site start-up credits before signing off.", authorName: TEAM.controller, at: "2026-10-07T08:02:00Z" },
      { anchor: "task:stock", body: "Carta's September expense report is a day late; booking it as soon as it lands.", authorName: TEAM.controller, at: "2026-10-06T16:15:00Z" },
      { anchor: "line:rd-cro", body: "Meridian's change order 4 visits are running ahead of plan; the trial accrual covers September's unbilled work.", authorName: TEAM.controller, at: "2026-10-06T10:20:00Z" },
      { anchor: "line:rd-cro", body: "Confirmed with Meridian: October invoice will catch up on CO4 visits.", authorName: TEAM.clinops, at: "2026-10-06T16:45:00Z" },
    ],
  };
}
