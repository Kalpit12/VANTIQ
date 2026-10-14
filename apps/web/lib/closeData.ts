import "server-only";
import { getDb, listCloseTasks, listComments } from "@vantiq/db";
import { CLOSE_TEMPLATE, type CloseTask, type CommentAnchor, type Period } from "@vantiq/domain";
import { generateSampleClose, SAMPLE_CLOSE_PERIOD, SAMPLE_CLOSE_TODAY } from "@vantiq/fixtures";
import type { Workspace } from "./data";

export interface ShownComment {
  id: string;
  anchor: CommentAnchor;
  body: string;
  authorName: string | null;
  at: string;
}

export type ShownTask = CloseTask & { preparedById?: string | null };

/** The month's checklist. Demo: Helixa's sample close for September, a blank checklist otherwise. */
export async function closeTasksFor(ws: Workspace, period: Period): Promise<ShownTask[]> {
  if (ws.mode === "db") return listCloseTasks(getDb(), ws.companyId!, period);
  if (period === SAMPLE_CLOSE_PERIOD) return generateSampleClose().tasks;
  return CLOSE_TEMPLATE.map((t) => ({
    ...t,
    custom: false,
    ownerId: null,
    ownerName: null,
    reviewerId: null,
    reviewerName: null,
    preparedByName: null,
    preparedAt: null,
    reviewedByName: null,
    reviewedAt: null,
  }));
}

export async function commentsFor(ws: Workspace, period: Period): Promise<ShownComment[]> {
  if (ws.mode === "db") return listComments(getDb(), ws.companyId!, period);
  if (period !== SAMPLE_CLOSE_PERIOD) return [];
  return generateSampleClose().comments.map((c, i) => ({ ...c, id: `demo-${i}` }));
}

/** Today's date for due dates and the close day. The demo is pinned to a day in Helixa's close. */
export const todayFor = (ws: Workspace) => (ws.mode === "demo" ? SAMPLE_CLOSE_TODAY : new Date().toISOString().slice(0, 10));
