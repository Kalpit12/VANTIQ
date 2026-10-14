import { periodLabel, type Period } from "@vantiq/domain";
import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db, Tx } from "./client";
import { auditEvents, reviewPacks, users, type PackStatus } from "./schema";
import { withCompany } from "./tenant";

export class PackError extends Error {}

export interface PackRecord<S = Record<string, unknown>> {
  period: Period;
  status: PackStatus;
  snapshot: S;
  approvedByName: string | null;
  approvedAt: Date;
  reopenedByName: string | null;
  reopenedAt: Date | null;
}

const approver = alias(users, "approver");
const reopener = alias(users, "reopener");

function selectPacks(tx: Tx) {
  return tx
    .select({
      period: reviewPacks.period,
      status: reviewPacks.status,
      snapshot: reviewPacks.snapshot,
      approvedByName: approver.name,
      approvedAt: reviewPacks.approvedAt,
      reopenedByName: reopener.name,
      reopenedAt: reviewPacks.reopenedAt,
    })
    .from(reviewPacks)
    .leftJoin(approver, eq(approver.id, reviewPacks.approvedBy))
    .leftJoin(reopener, eq(reopener.id, reviewPacks.reopenedBy));
}

export async function getPack<S = Record<string, unknown>>(db: Db, companyId: string, period: Period): Promise<PackRecord<S> | null> {
  const [row] = await withCompany(db, companyId, (tx) => selectPacks(tx).where(eq(reviewPacks.period, period)));
  return (row as PackRecord<S> | undefined) ?? null;
}

/** Every month that has been approved at least once, newest first, without snapshots. */
export async function listPacks(db: Db, companyId: string) {
  const rows = await withCompany(db, companyId, (tx) => selectPacks(tx).orderBy(desc(reviewPacks.period)));
  return rows.map(({ snapshot: _s, ...r }) => r);
}

/** True when the month's pack is approved, so its explanations can't change. */
export async function isPeriodLocked(tx: Tx, period: string): Promise<boolean> {
  const [row] = await tx
    .select({ n: sql<number>`1` })
    .from(reviewPacks)
    .where(and(eq(reviewPacks.period, period), eq(reviewPacks.status, "approved")));
  return Boolean(row);
}

export const lockedMessage = (period: string) => `${periodLabel(period)} is approved and locked. Reopen its review pack to change it.`;

/** Approves a month: stores what was reviewed and locks the month. */
export async function approvePack(db: Db, companyId: string, userId: string, period: Period, snapshot: Record<string, unknown>) {
  await withCompany(db, companyId, async (tx) => {
    if (await isPeriodLocked(tx, period)) throw new PackError(`${periodLabel(period)} is already approved.`);
    const values = { status: "approved" as const, snapshot, approvedBy: userId, approvedAt: new Date(), reopenedBy: null, reopenedAt: null };
    await tx
      .insert(reviewPacks)
      .values({ companyId, period, ...values })
      .onConflictDoUpdate({ target: [reviewPacks.companyId, reviewPacks.period], set: values });
    await tx.insert(auditEvents).values({ companyId, actorId: userId, action: "pack.approved", target: period });
  });
}

/** Unlocks an approved month. The reason is kept in the audit log. */
export async function reopenPack(db: Db, companyId: string, userId: string, period: Period, reason: string) {
  const why = reason.trim();
  if (!why || why.length > 500) throw new PackError("Say why you are reopening it, in 500 characters or fewer.");
  await withCompany(db, companyId, async (tx) => {
    const [row] = await tx
      .update(reviewPacks)
      .set({ status: "reopened", reopenedBy: userId, reopenedAt: new Date() })
      .where(and(eq(reviewPacks.period, period), eq(reviewPacks.status, "approved")))
      .returning({ id: reviewPacks.id });
    if (!row) throw new PackError(`${periodLabel(period)} is not approved.`);
    await tx.insert(auditEvents).values({ companyId, actorId: userId, action: "pack.reopened", target: period, detail: { reason: why } });
  });
}

export async function recordPackExport(db: Db, companyId: string, userId: string, period: Period, format: "pdf") {
  await withCompany(db, companyId, (tx) => tx.insert(auditEvents).values({ companyId, actorId: userId, action: "pack.exported", target: period, detail: { format } }));
}
