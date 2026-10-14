import { CLOSE_TEMPLATE, periodLabel, type CloseSection, type CloseTask, type CommentAnchor, type Period } from "@vantiq/domain";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db, Tx } from "./client";
import { lockedMessage, isPeriodLocked } from "./packs";
import { auditEvents, closeTasks, comments, memberships, users, type Role } from "./schema";
import { withCompany } from "./tenant";

export class CloseError extends Error {}

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const checkPeriod = (p: string) => {
  if (!PERIOD.test(p)) throw new CloseError("Choose a month.");
};

async function assertOpen(tx: Tx, period: Period) {
  if (await isPeriodLocked(tx, period)) throw new CloseError(lockedMessage(period));
}

/**
 * Creates a month's checklist the first time it is opened: the standard tasks
 * plus the team's own tasks from the latest earlier month, with that month's
 * owners and reviewers. Ticks and sign-offs never carry over.
 */
async function ensureTasks(tx: Tx, companyId: string, period: Period) {
  const [any] = await tx.select({ id: closeTasks.id }).from(closeTasks).where(eq(closeTasks.period, period)).limit(1);
  if (any) return;
  const [prev] = await tx.select({ period: closeTasks.period }).from(closeTasks).where(lt(closeTasks.period, period)).orderBy(desc(closeTasks.period)).limit(1);
  const before = prev ? await tx.select().from(closeTasks).where(eq(closeTasks.period, prev.period)) : [];
  const byKey = new Map(before.map((t) => [t.key, t]));
  const rows = [
    ...CLOSE_TEMPLATE.map((t, i) => ({ ...t, auto: t.auto ?? null, href: t.href ?? null, custom: false, sortOrder: i })),
    ...before
      .filter((t) => t.custom)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t) => ({ key: t.key, section: t.section, title: t.title, detail: t.detail, dueDay: t.dueDay, auto: null, href: null, custom: true, sortOrder: t.sortOrder })),
  ].map((t) => ({ ...t, companyId, period, ownerId: byKey.get(t.key)?.ownerId ?? null, reviewerId: byKey.get(t.key)?.reviewerId ?? null }));
  await tx.insert(closeTasks).values(rows).onConflictDoNothing();
}

const owner = alias(users, "owner");
const reviewer = alias(users, "reviewer");
const preparer = alias(users, "preparer");
const signer = alias(users, "signer");

export interface CloseTaskRow extends CloseTask {
  id: string;
  preparedById: string | null;
}

/** The month's checklist in order, creating it on first use. */
export async function listCloseTasks(db: Db, companyId: string, period: Period): Promise<CloseTaskRow[]> {
  checkPeriod(period);
  return withCompany(db, companyId, async (tx) => {
    await ensureTasks(tx, companyId, period);
    const rows = await tx
      .select({
        t: closeTasks,
        ownerName: owner.name,
        reviewerName: reviewer.name,
        preparedByName: preparer.name,
        reviewedByName: signer.name,
      })
      .from(closeTasks)
      .leftJoin(owner, eq(owner.id, closeTasks.ownerId))
      .leftJoin(reviewer, eq(reviewer.id, closeTasks.reviewerId))
      .leftJoin(preparer, eq(preparer.id, closeTasks.preparedBy))
      .leftJoin(signer, eq(signer.id, closeTasks.reviewedBy))
      .where(eq(closeTasks.period, period))
      .orderBy(asc(closeTasks.sortOrder));
    return rows.map(({ t, ...names }) => ({
      id: t.id,
      key: t.key,
      section: t.section,
      title: t.title,
      detail: t.detail,
      dueDay: t.dueDay,
      auto: t.auto ?? undefined,
      href: t.href ?? undefined,
      custom: t.custom,
      ownerId: t.ownerId,
      ownerName: names.ownerName,
      reviewerId: t.reviewerId,
      reviewerName: names.reviewerName,
      preparedById: t.preparedBy,
      preparedByName: names.preparedByName,
      preparedAt: t.preparedAt?.toISOString() ?? null,
      reviewedByName: names.reviewedByName,
      reviewedAt: t.reviewedAt?.toISOString() ?? null,
    }));
  });
}

async function taskFor(tx: Tx, companyId: string, period: Period, key: string) {
  await ensureTasks(tx, companyId, period);
  const [t] = await tx.select().from(closeTasks).where(and(eq(closeTasks.period, period), eq(closeTasks.key, key))).for("update");
  if (!t) throw new CloseError("That task does not exist.");
  return t;
}

async function isMember(db: Db | Tx, companyId: string, userId: string) {
  const [m] = await db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.companyId, companyId), eq(memberships.userId, userId)));
  return Boolean(m);
}

export interface Actor {
  userId: string;
  role: Role;
}

const canManage = (r: Role) => r === "admin" || r === "finance";

/** Sets who prepares a task and who signs it off. Either can be left empty. */
export async function assignCloseTask(db: Db, companyId: string, actor: Actor, period: Period, key: string, who: { ownerId: string | null; reviewerId: string | null }) {
  checkPeriod(period);
  if (!canManage(actor.role)) throw new CloseError("Only admins and finance can assign close tasks.");
  for (const id of [who.ownerId, who.reviewerId]) if (id && !(await isMember(db, companyId, id))) throw new CloseError("Choose someone in this company.");
  if (who.ownerId && who.ownerId === who.reviewerId) throw new CloseError("The reviewer has to be someone other than the owner.");
  await withCompany(db, companyId, async (tx) => {
    await assertOpen(tx, period);
    const t = await taskFor(tx, companyId, period, key);
    if (t.auto && who.reviewerId) throw new CloseError("Vantiq checks this task itself, so it has no reviewer.");
    // A new reviewer signs off afresh.
    const reviewChanged = (t.reviewerId ?? null) !== (who.reviewerId ?? null);
    await tx
      .update(closeTasks)
      .set({ ownerId: who.ownerId, reviewerId: who.reviewerId, ...(reviewChanged ? { reviewedBy: null, reviewedAt: null } : {}) })
      .where(eq(closeTasks.id, t.id));
    await tx.insert(auditEvents).values({ companyId, actorId: actor.userId, action: "close.assigned", target: `${period} ${t.title}`, detail: { period, key, ownerId: who.ownerId, reviewerId: who.reviewerId } });
  });
}

/**
 * The owner ticks a task off (or un-ticks it). Admins and finance can tick any
 * task; anyone else only the tasks they own. Un-ticking clears the sign-off.
 */
export async function prepareCloseTask(db: Db, companyId: string, actor: Actor, period: Period, key: string, done: boolean) {
  checkPeriod(period);
  await withCompany(db, companyId, async (tx) => {
    await assertOpen(tx, period);
    const t = await taskFor(tx, companyId, period, key);
    if (t.auto) throw new CloseError("Vantiq checks this task itself.");
    if (!canManage(actor.role) && t.ownerId !== actor.userId) throw new CloseError("Only the task's owner, finance or an admin can tick it off.");
    if (done && t.reviewerId === actor.userId) throw new CloseError("You are this task's reviewer, so someone else has to prepare it.");
    await tx
      .update(closeTasks)
      .set(done ? { preparedBy: actor.userId, preparedAt: new Date() } : { preparedBy: null, preparedAt: null, reviewedBy: null, reviewedAt: null })
      .where(eq(closeTasks.id, t.id));
    await tx.insert(auditEvents).values({ companyId, actorId: actor.userId, action: done ? "close.prepared" : "close.reopened", target: `${period} ${t.title}`, detail: { period, key } });
  });
}

/** The reviewer signs off a prepared task. Nobody signs off their own work. */
export async function reviewCloseTask(db: Db, companyId: string, actor: Actor, period: Period, key: string) {
  checkPeriod(period);
  await withCompany(db, companyId, async (tx) => {
    await assertOpen(tx, period);
    const t = await taskFor(tx, companyId, period, key);
    if (!t.reviewerId) throw new CloseError("This task has no reviewer.");
    if (t.reviewerId !== actor.userId && actor.role !== "admin") throw new CloseError("Only the task's reviewer or an admin can sign it off.");
    if (!t.preparedAt) throw new CloseError("The owner hasn't ticked this task off yet.");
    if (t.preparedBy === actor.userId) throw new CloseError("You prepared this task, so someone else has to sign it off.");
    await tx.update(closeTasks).set({ reviewedBy: actor.userId, reviewedAt: new Date() }).where(eq(closeTasks.id, t.id));
    await tx.insert(auditEvents).values({ companyId, actorId: actor.userId, action: "close.reviewed", target: `${period} ${t.title}`, detail: { period, key } });
  });
}

/** Adds the team's own task to a month. It carries forward to later months. */
export async function addCloseTask(db: Db, companyId: string, actor: Actor, period: Period, input: { title: string; section: CloseSection; dueDay: number }) {
  checkPeriod(period);
  if (!canManage(actor.role)) throw new CloseError("Only admins and finance can add close tasks.");
  const title = input.title.trim();
  if (!title || title.length > 200) throw new CloseError("Name the task in 200 characters or fewer.");
  if (!["books", "accruals", "review", "signoff"].includes(input.section)) throw new CloseError("Choose a section.");
  if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 20) throw new CloseError("Choose a due day from 1 to 20.");
  return withCompany(db, companyId, async (tx) => {
    await assertOpen(tx, period);
    await ensureTasks(tx, companyId, period);
    const existing = await tx.select({ sortOrder: closeTasks.sortOrder }).from(closeTasks).where(eq(closeTasks.period, period));
    const key = `c-${crypto.randomUUID().slice(0, 8)}`;
    await tx.insert(closeTasks).values({
      companyId,
      period,
      key,
      section: input.section,
      title,
      detail: "",
      dueDay: input.dueDay,
      custom: true,
      sortOrder: Math.max(0, ...existing.map((e) => e.sortOrder)) + 1,
    });
    await tx.insert(auditEvents).values({ companyId, actorId: actor.userId, action: "close.task_added", target: `${period} ${title}`, detail: { period, key } });
    return key;
  });
}

export interface CommentRow {
  id: string;
  anchor: CommentAnchor;
  body: string;
  authorName: string | null;
  at: string;
}

export async function listComments(db: Db, companyId: string, period: Period): Promise<CommentRow[]> {
  checkPeriod(period);
  const author = alias(users, "author");
  const rows = await withCompany(db, companyId, (tx) =>
    tx
      .select({ id: comments.id, anchor: comments.anchor, body: comments.body, authorName: author.name, at: comments.createdAt })
      .from(comments)
      .leftJoin(author, eq(author.id, comments.authorId))
      .where(eq(comments.period, period))
      .orderBy(asc(comments.createdAt)),
  );
  return rows.map((r) => ({ ...r, anchor: r.anchor as CommentAnchor, at: r.at.toISOString() }));
}

const ANCHOR = /^(line|task):[A-Za-z0-9_.:-]{1,80}$/;

/** Anyone in the company can comment on an open month. */
export async function addComment(db: Db, companyId: string, userId: string, period: Period, anchor: string, body: string) {
  checkPeriod(period);
  const text = body.trim();
  if (!ANCHOR.test(anchor)) throw new CloseError("Comment on a line or a task.");
  if (!text || text.length > 2000) throw new CloseError("Write a comment of 2,000 characters or fewer.");
  await withCompany(db, companyId, async (tx) => {
    await assertOpen(tx, period);
    await tx.insert(comments).values({ companyId, period, anchor, body: text, authorId: userId });
    await tx.insert(auditEvents).values({ companyId, actorId: userId, action: "comment.added", target: `${periodLabel(period)} ${anchor}`, detail: { period, anchor } });
  });
}
