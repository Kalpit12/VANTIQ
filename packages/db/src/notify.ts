import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { Db, Tx } from "./client";
import { companies, emails, emailTokens, memberships, users, type Role } from "./schema";

/**
 * Email notifications (architecture.md: invites, review requests, approvals).
 * Emails are written to the `emails` outbox inside the same transaction as
 * the change that caused them; the web app delivers them afterwards.
 */

export type NotifyKind = "close_assigned" | "close_review" | "comment" | "pack_approved" | "sync_alert";
export type EmailKind = NotifyKind | "invite" | "added" | "password_reset";

/** The notifications a member can turn off, in the order the settings show them. */
export const NOTIFY_KINDS: { kind: NotifyKind; label: string; detail: string; roles: Role[] }[] = [
  { kind: "close_assigned", label: "Close tasks assigned to me", detail: "When someone makes you the owner or reviewer of a close task.", roles: ["admin", "finance", "viewer"] },
  { kind: "close_review", label: "Tasks waiting for my sign-off", detail: "When a task you review is ticked off by its owner.", roles: ["admin", "finance", "viewer"] },
  { kind: "comment", label: "Comments on my close tasks", detail: "When someone comments on a close task you own or review.", roles: ["admin", "finance", "viewer"] },
  { kind: "pack_approved", label: "A month is approved", detail: "When a month's review pack is approved and its numbers are locked.", roles: ["admin", "finance", "viewer"] },
  { kind: "sync_alert", label: "Books out of balance after a sync", detail: "When a synced month no longer matches your accounting system's net income.", roles: ["admin", "finance"] },
];

export class NotifyError extends Error {}

/** Password hash of someone invited who hasn't set a password yet; it never matches. */
export const INVITED = "!invited";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const FOOTER = "\n\n—\nYou can choose which emails Vantiq sends you: {{origin}}/settings/notifications";

/**
 * Queues one email to each member listed, skipping anyone who turned this
 * kind off, anyone who is no longer a member, and `except` (the person who
 * caused it). `body` may use {{origin}} for links into the app.
 */
export async function notifyMembers(
  tx: Tx | Db,
  companyId: string,
  kind: NotifyKind,
  userIds: (string | null | undefined)[],
  msg: { subject: string; body: string; except?: string | null },
) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x && x !== msg.except))];
  if (!ids.length) return 0;
  const to = await tx
    .select({ id: users.id, email: users.email, pending: users.passwordHash, off: memberships.emailOff, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.companyId, companyId), inArray(memberships.userId, ids)));
  const roles = NOTIFY_KINDS.find((k) => k.kind === kind)!.roles;
  // People who haven't accepted their invitation yet get only the invitation.
  const rows = to.filter((u) => !u.off.includes(kind) && roles.includes(u.role) && !u.pending.startsWith(INVITED));
  if (rows.length) await tx.insert(emails).values(rows.map((u) => ({ companyId, userId: u.id, to: u.email, kind, subject: msg.subject, body: msg.body + FOOTER })));
  return rows.length;
}

export async function nameOf(tx: Tx | Db, userId: string | null | undefined) {
  if (!userId) return "Vantiq";
  const [u] = await tx.select({ name: users.name }).from(users).where(eq(users.id, userId));
  return u?.name ?? "Someone";
}

/** Members of a company with one of these roles, for notifications to a role. */
export async function membersWithRole(tx: Tx | Db, companyId: string, roles: Role[]) {
  const rows = await tx.select({ id: memberships.userId }).from(memberships).where(and(eq(memberships.companyId, companyId), inArray(memberships.role, roles)));
  return rows.map((r) => r.id);
}

export async function queueEmail(tx: Tx | Db, e: { companyId: string | null; userId: string | null; to: string; kind: EmailKind; subject: string; body: string }) {
  await tx.insert(emails).values(e);
}

/** Creates a one-time link token. Only its hash is stored. */
export async function createEmailToken(tx: Tx | Db, userId: string, purpose: "invite" | "reset", companyId: string | null, hours: number) {
  const token = randomBytes(24).toString("base64url");
  await tx.insert(emailTokens).values({ id: hash(token), userId, purpose, companyId, expiresAt: new Date(Date.now() + hours * 3_600_000) });
  return token;
}

/** What a still-valid link is for, without using it. */
export async function peekEmailToken(db: Db, token: string, purpose: "invite" | "reset") {
  const [row] = await db
    .select({ userId: emailTokens.userId, companyId: emailTokens.companyId, email: users.email, name: users.name, companyName: companies.name })
    .from(emailTokens)
    .innerJoin(users, eq(users.id, emailTokens.userId))
    .leftJoin(companies, eq(companies.id, emailTokens.companyId))
    .where(and(eq(emailTokens.id, hash(token)), eq(emailTokens.purpose, purpose), isNull(emailTokens.usedAt), gt(emailTokens.expiresAt, new Date())));
  return row ?? null;
}

/** Marks a link used, once. Returns who it was for, or throws when it is unknown, used or expired. */
export async function useEmailToken(tx: Tx, token: string, purpose: "invite" | "reset") {
  const [row] = await tx
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(emailTokens.id, hash(token)), eq(emailTokens.purpose, purpose), isNull(emailTokens.usedAt), gt(emailTokens.expiresAt, new Date())))
    .returning({ userId: emailTokens.userId, companyId: emailTokens.companyId });
  if (!row) throw new NotifyError(purpose === "invite" ? "This invitation has expired or was already used. Ask your admin to add you again." : "This link has expired or was already used. Ask for a new one.");
  return row;
}

export async function getEmailPrefs(db: Db, userId: string, companyId: string): Promise<NotifyKind[]> {
  const [m] = await db.select({ off: memberships.emailOff }).from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.companyId, companyId)));
  return (m?.off ?? []) as NotifyKind[];
}

export async function setEmailPrefs(db: Db, userId: string, companyId: string, off: NotifyKind[]) {
  const valid = off.filter((k) => NOTIFY_KINDS.some((n) => n.kind === k));
  await db.update(memberships).set({ emailOff: valid }).where(and(eq(memberships.userId, userId), eq(memberships.companyId, companyId)));
}

/** The company's recent emails, newest first, for admins to see what went out. */
export async function listEmails(db: Db, companyId: string, limit = 50) {
  return db
    .select({ id: emails.id, to: emails.to, kind: emails.kind, subject: emails.subject, status: emails.status, error: emails.error, createdAt: emails.createdAt, sentAt: emails.sentAt })
    .from(emails)
    .where(eq(emails.companyId, companyId))
    .orderBy(desc(emails.createdAt))
    .limit(limit);
}

export type OutboxEmail = typeof emails.$inferSelect;

/** Claims queued emails for delivery (oldest first), so two senders never send the same one. */
export async function claimQueuedEmails(db: Db, limit = 25): Promise<OutboxEmail[]> {
  return db.execute<OutboxEmail>(sql`
    update emails set status = 'sending' where id in (
      select id from emails where status = 'queued' order by created_at limit ${limit} for update skip locked
    ) returning id, company_id as "companyId", user_id as "userId", "to", kind, subject, body, status, error, provider_id as "providerId", created_at as "createdAt", sent_at as "sentAt"`);
}

export async function markEmail(db: Db, id: string, result: { status: "sent" | "logged" | "failed"; providerId?: string | null; error?: string | null }) {
  await db
    .update(emails)
    .set({ status: result.status, providerId: result.providerId ?? null, error: result.error?.slice(0, 500) ?? null, sentAt: result.status === "failed" ? null : new Date() })
    .where(eq(emails.id, id));
}
