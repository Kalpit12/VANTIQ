import { createHash, randomBytes } from "node:crypto";
import { periodLabel, type Period } from "@vantiq/domain";
import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "./client";
import { getPack } from "./packs";
import { auditEvents, shareLinks, users } from "./schema";
import { withCompany } from "./tenant";

export class ShareError extends Error {}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const DAY = 24 * 60 * 60 * 1000;
export const SHARE_DAYS = [7, 14, 30, 90] as const;

export type ShareStatus = "active" | "expired" | "revoked" | "withdrawn";

export interface ShareLinkRow {
  id: string;
  period: Period;
  label: string;
  note: string;
  createdByName: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  viewCount: number;
  lastViewedAt: Date | null;
  status: ShareStatus;
}

/**
 * Creates a read-only board pack link for an approved month. Returns the token
 * once; only its hash is kept, so a lost link can't be shown again.
 */
export async function createShareLink(
  db: Db,
  companyId: string,
  userId: string,
  input: { period: Period; label: string; note: string; days: number },
  now = new Date(),
) {
  const label = input.label.trim();
  const note = input.note.trim();
  if (!label || label.length > 120) throw new ShareError("Say who the link is for, in 120 characters or fewer.");
  if (note.length > 1000) throw new ShareError("Keep the note to 1,000 characters or fewer.");
  if (!(SHARE_DAYS as readonly number[]).includes(input.days)) throw new ShareError("Choose how long the link works.");
  const pack = await getPack(db, companyId, input.period);
  if (pack?.status !== "approved") throw new ShareError(`Approve the ${periodLabel(input.period)} review pack before sharing it.`);
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(now.getTime() + input.days * DAY);
  const [row] = await db
    .insert(shareLinks)
    .values({ companyId, period: input.period, tokenHash: hash(token), label, note, packApprovedAt: pack.approvedAt, expiresAt, createdBy: userId })
    .returning({ id: shareLinks.id });
  await withCompany(db, companyId, (tx) =>
    tx.insert(auditEvents).values({ companyId, actorId: userId, action: "share.created", target: input.period, detail: { label, days: input.days } }),
  );
  return { id: row!.id, token, expiresAt };
}

const creator = alias(users, "creator");

/** The company's links for a month, newest first, with where each one stands. */
export async function listShareLinks(db: Db, companyId: string, period: Period, now = new Date()): Promise<ShareLinkRow[]> {
  const pack = await getPack(db, companyId, period);
  const rows = await db
    .select({ l: shareLinks, createdByName: creator.name })
    .from(shareLinks)
    .leftJoin(creator, eq(creator.id, shareLinks.createdBy))
    .where(and(eq(shareLinks.companyId, companyId), eq(shareLinks.period, period)))
    .orderBy(desc(shareLinks.createdAt));
  return rows.map(({ l, createdByName }) => ({
    id: l.id,
    period: l.period,
    label: l.label,
    note: l.note,
    createdByName,
    createdAt: l.createdAt,
    expiresAt: l.expiresAt,
    revokedAt: l.revokedAt,
    viewCount: l.viewCount,
    lastViewedAt: l.lastViewedAt,
    status: statusOf(l, pack, now),
  }));
}

function statusOf(l: typeof shareLinks.$inferSelect, pack: Awaited<ReturnType<typeof getPack>>, now: Date): ShareStatus {
  if (l.revokedAt) return "revoked";
  if (pack?.status !== "approved" || pack.approvedAt.getTime() !== l.packApprovedAt.getTime()) return "withdrawn";
  if (l.expiresAt <= now) return "expired";
  return "active";
}

export async function revokeShareLink(db: Db, companyId: string, userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ShareError("That link does not exist.");
  const [row] = await db
    .update(shareLinks)
    .set({ revokedAt: new Date(), revokedBy: userId })
    .where(and(eq(shareLinks.id, id), eq(shareLinks.companyId, companyId), sql`${shareLinks.revokedAt} is null`))
    .returning({ period: shareLinks.period, label: shareLinks.label });
  if (!row) throw new ShareError("That link does not exist or is already revoked.");
  await withCompany(db, companyId, (tx) =>
    tx.insert(auditEvents).values({ companyId, actorId: userId, action: "share.revoked", target: row.period, detail: { label: row.label } }),
  );
}

export type OpenedShare<S> =
  | { status: "active"; snapshot: S; period: Period; label: string; note: string; expiresAt: Date; approvedByName: string | null; approvedAt: Date }
  | { status: "missing" | "expired" | "revoked" | "withdrawn" };

/**
 * What a visitor with a link sees: the approved snapshot, if the link still
 * works. Each open is counted and logged against the company.
 */
export async function openShareLink<S = Record<string, unknown>>(db: Db, token: string, kind: "view" | "pdf", now = new Date()): Promise<OpenedShare<S>> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { status: "missing" };
  const [l] = await db.select().from(shareLinks).where(eq(shareLinks.tokenHash, hash(token)));
  if (!l) return { status: "missing" };
  const pack = await getPack<S>(db, l.companyId, l.period);
  const status = statusOf(l, pack, now);
  if (status !== "active") return { status };
  await db
    .update(shareLinks)
    .set({ viewCount: sql`${shareLinks.viewCount} + 1`, lastViewedAt: now })
    .where(eq(shareLinks.id, l.id));
  await withCompany(db, l.companyId, (tx) =>
    tx.insert(auditEvents).values({ companyId: l.companyId, actorId: null, action: kind === "pdf" ? "share.downloaded" : "share.viewed", target: l.period, detail: { label: l.label } }),
  );
  return { status, snapshot: pack!.snapshot, period: l.period, label: l.label, note: l.note, expiresAt: l.expiresAt, approvedByName: pack!.approvedByName, approvedAt: pack!.approvedAt };
}
