import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Db } from "./client";
import { createEmailToken, INVITED, queueEmail, useEmailToken } from "./notify";
import { auditEvents, companies, memberships, sessions, users, type Role } from "./schema";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1 };
export const SESSION_DAYS = 30;
export const MIN_PASSWORD = 10;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32, PARAMS);
  return `scrypt$${PARAMS.N}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !n || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, { ...PARAMS, N: Number(n) });
  return timingSafeEqual(actual, expected);
}

const tokenId = (token: string) => createHash("sha256").update(token).digest("hex");
const normEmail = (e: string) => e.trim().toLowerCase();

export class AuthError extends Error {}

export interface SessionUser {
  sessionId: string;
  user: { id: string; name: string; email: string };
  company: { id: string; name: string; role: Role } | null;
  companies: { id: string; name: string; role: Role }[];
}

export async function createSession(db: Db, userId: string, companyId: string | null): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: tokenId(token), userId, companyId, expiresAt });
  return { token, expiresAt };
}

/** Creates a user, their company and an admin membership, then signs them in. */
export async function signUp(db: Db, input: { name: string; email: string; password: string; companyName: string }) {
  const email = normEmail(input.email);
  if (!input.name.trim() || !input.companyName.trim()) throw new AuthError("Enter your name and your company's name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AuthError("Enter a valid email address.");
  if (input.password.length < MIN_PASSWORD) throw new AuthError(`Use a password of at least ${MIN_PASSWORD} characters.`);
  const passwordHash = await hashPassword(input.password);
  const { userId, companyId } = await db.transaction(async (tx) => {
    const existing = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`);
    if (existing.length) throw new AuthError("An account with this email already exists. Sign in instead.");
    const [u] = await tx.insert(users).values({ email, name: input.name.trim(), passwordHash }).returning({ id: users.id });
    const [c] = await tx.insert(companies).values({ name: input.companyName.trim() }).returning({ id: companies.id });
    await tx.insert(memberships).values({ userId: u!.id, companyId: c!.id, role: "admin" });
    return { userId: u!.id, companyId: c!.id };
  });
  return createSession(db, userId, companyId);
}

export async function signIn(db: Db, emailRaw: string, password: string) {
  const email = normEmail(emailRaw);
  const [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
  // Hash anyway when the user is unknown so response time does not reveal which emails exist.
  const ok = u ? await verifyPassword(password, u.passwordHash) : (await hashPassword(password), false);
  if (!u || !ok) throw new AuthError("That email and password don't match.");
  const [m] = await db.select().from(memberships).where(eq(memberships.userId, u.id)).orderBy(memberships.createdAt).limit(1);
  return createSession(db, u.id, m?.companyId ?? null);
}

export async function signOut(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.id, tokenId(token)));
}

export async function getSession(db: Db, token: string): Promise<SessionUser | null> {
  const id = tokenId(token);
  const [row] = await db
    .select({ s: sessions, u: { id: users.id, name: users.name, email: users.email } })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
  if (!row) return null;
  const list = await db
    .select({ id: companies.id, name: companies.name, role: memberships.role })
    .from(memberships)
    .innerJoin(companies, eq(companies.id, memberships.companyId))
    .where(eq(memberships.userId, row.u.id))
    .orderBy(companies.name);
  // The session's company must still be one the user belongs to.
  const company = list.find((c) => c.id === row.s.companyId) ?? list[0] ?? null;
  return { sessionId: id, user: row.u, company, companies: list };
}

export async function switchCompany(db: Db, token: string, companyId: string) {
  const s = await getSession(db, token);
  if (!s || !s.companies.some((c) => c.id === companyId)) throw new AuthError("You are not a member of that company.");
  await db.update(sessions).set({ companyId }).where(eq(sessions.id, s.sessionId));
}

/** Who may do what (architecture.md 9). */
export const can = {
  view: (_r: Role) => true,
  importData: (r: Role) => r === "admin" || r === "finance",
  editMappings: (r: Role) => r === "admin" || r === "finance",
  explain: (r: Role) => r === "admin" || r === "finance",
  approvePack: (r: Role) => r === "admin" || r === "finance",
  reopenPack: (r: Role) => r === "admin",
  viewAudit: (r: Role) => r === "admin" || r === "finance",
  manageMembers: (r: Role) => r === "admin",
  /** Set up the close: assign owners and reviewers, add tasks. A task's owner can always tick it off. */
  manageClose: (r: Role) => r === "admin" || r === "finance",
  /** Anyone in the company can comment, including viewers such as department heads. */
  comment: (_r: Role) => true,
  /** Share an approved month's board pack outside Vantiq. */
  sharePack: (r: Role) => r === "admin" || r === "finance",
  /** Set up grant, milestone and licensing schedules. */
  manageIncome: (r: Role) => r === "admin" || r === "finance",
  /** Add, change and import inventory batches. */
  manageInventory: (r: Role) => r === "admin" || r === "finance",
};

export async function listMembers(db: Db, companyId: string) {
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: memberships.role, since: memberships.createdAt, pending: sql<boolean>`${users.passwordHash} = ${INVITED}` })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.companyId, companyId))
    .orderBy(users.name);
}

/**
 * Adds someone to a company and emails them. Someone new gets an invitation
 * link to set their password (valid for 7 days); someone who already uses
 * Vantiq gets a note that they were added. Returns the invitation token so
 * the admin can pass the link on when email isn't set up.
 */
export async function addMember(db: Db, actorId: string, companyId: string, input: { name: string; email: string; role: Role }) {
  const email = normEmail(input.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AuthError("Enter a valid email address.");
  return db.transaction(async (tx) => {
    let [u] = await tx.select({ id: users.id, pending: users.passwordHash }).from(users).where(sql`lower(${users.email}) = ${email}`);
    if (!u) [u] = await tx.insert(users).values({ email, name: input.name.trim() || email, passwordHash: INVITED }).returning({ id: users.id, pending: users.passwordHash });
    const added = await tx.insert(memberships).values({ userId: u!.id, companyId, role: input.role }).onConflictDoNothing().returning();
    if (!added.length) throw new AuthError("That person is already a member.");
    const [names] = await tx
      .select({ company: companies.name, actor: users.name })
      .from(companies)
      .innerJoin(users, eq(users.id, actorId))
      .where(eq(companies.id, companyId));
    let inviteToken: string | null = null;
    if (u!.pending.startsWith(INVITED)) {
      inviteToken = await createEmailToken(tx, u!.id, "invite", companyId, 24 * 7);
      await queueEmail(tx, {
        companyId,
        userId: u!.id,
        to: email,
        kind: "invite",
        subject: `${names!.actor} invited you to ${names!.company} on Vantiq`,
        body: `${names!.actor} invited you to join ${names!.company} on Vantiq Finance as ${ROLE_LABEL[input.role]}.\n\nSet your password to get started (the link works for 7 days):\n{{origin}}/invite/${inviteToken}`,
      });
    } else {
      await queueEmail(tx, {
        companyId,
        userId: u!.id,
        to: email,
        kind: "added",
        subject: `You now have access to ${names!.company} on Vantiq`,
        body: `${names!.actor} added you to ${names!.company} on Vantiq Finance as ${ROLE_LABEL[input.role]}. Sign in with your usual password and switch to it from the company menu:\n{{origin}}/sign-in`,
      });
    }
    await tx.execute(sql`select set_config('app.company_id', ${companyId}, true)`);
    await tx.insert(auditEvents).values({ companyId, actorId, action: "member.added", target: email, detail: { role: input.role, invited: !!inviteToken } });
    return { inviteToken };
  });
}

const ROLE_LABEL: Record<Role, string> = { admin: "an admin", finance: "a member of the finance team", viewer: "a viewer" };

/** Sets the invited person's password from their invitation link and signs them in to that company. */
export async function acceptInvite(db: Db, token: string, password: string) {
  if (password.length < MIN_PASSWORD) throw new AuthError(`Use a password of at least ${MIN_PASSWORD} characters.`);
  const passwordHash = await hashPassword(password);
  const { userId, companyId } = await db.transaction(async (tx) => {
    const t = await useEmailToken(tx, token, "invite").catch((e: Error) => {
      throw new AuthError(e.message);
    });
    await tx.update(users).set({ passwordHash }).where(eq(users.id, t.userId));
    return { userId: t.userId, companyId: t.companyId };
  });
  return createSession(db, userId, companyId);
}

/**
 * Emails a password reset link (valid for an hour) when the address belongs
 * to someone. Says nothing either way, so the form can't be used to find out
 * who has an account.
 */
export async function requestPasswordReset(db: Db, emailRaw: string) {
  const email = normEmail(emailRaw);
  const [u] = await db.select({ id: users.id, pending: users.passwordHash }).from(users).where(sql`lower(${users.email}) = ${email}`);
  if (!u || u.pending.startsWith(INVITED)) return;
  await db.transaction(async (tx) => {
    const token = await createEmailToken(tx, u.id, "reset", null, 1);
    await queueEmail(tx, {
      companyId: null,
      userId: u.id,
      to: email,
      kind: "password_reset",
      subject: "Reset your Vantiq password",
      body: `Someone asked to reset the password for ${email} on Vantiq Finance. If it was you, choose a new password here (the link works for an hour):\n{{origin}}/reset-password/${token}\n\nIf it wasn't you, ignore this email and your password stays the same.`,
    });
  });
}

/** Sets a new password from a reset link, signs out every other session and signs in. */
export async function resetPassword(db: Db, token: string, password: string) {
  if (password.length < MIN_PASSWORD) throw new AuthError(`Use a password of at least ${MIN_PASSWORD} characters.`);
  const passwordHash = await hashPassword(password);
  const userId = await db.transaction(async (tx) => {
    const t = await useEmailToken(tx, token, "reset").catch((e: Error) => {
      throw new AuthError(e.message);
    });
    await tx.update(users).set({ passwordHash }).where(eq(users.id, t.userId));
    await tx.delete(sessions).where(eq(sessions.userId, t.userId));
    return t.userId;
  });
  const [m] = await db.select().from(memberships).where(eq(memberships.userId, userId)).orderBy(memberships.createdAt).limit(1);
  return createSession(db, userId, m?.companyId ?? null);
}

export async function setMemberRole(db: Db, actorId: string, companyId: string, userId: string, role: Role) {
  return db.transaction(async (tx) => {
    const admins = await tx.select().from(memberships).where(and(eq(memberships.companyId, companyId), eq(memberships.role, "admin")));
    if (role !== "admin" && admins.length === 1 && admins[0]!.userId === userId) throw new AuthError("A company needs at least one admin.");
    await tx.update(memberships).set({ role }).where(and(eq(memberships.companyId, companyId), eq(memberships.userId, userId)));
    await tx.execute(sql`select set_config('app.company_id', ${companyId}, true)`);
    await tx.insert(auditEvents).values({ companyId, actorId, action: "member.role_changed", target: userId, detail: { role } });
  });
}
