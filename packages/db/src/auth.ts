import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Db } from "./client";
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
  manageMembers: (r: Role) => r === "admin",
};

export async function listMembers(db: Db, companyId: string) {
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: memberships.role, since: memberships.createdAt })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.companyId, companyId))
    .orderBy(users.name);
}

/**
 * Adds someone to a company. A new user gets a temporary password that the
 * admin passes on; email invitations arrive with the notifications milestone.
 */
export async function addMember(db: Db, actorId: string, companyId: string, input: { name: string; email: string; role: Role }) {
  const email = normEmail(input.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AuthError("Enter a valid email address.");
  return db.transaction(async (tx) => {
    let [u] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`);
    let tempPassword: string | null = null;
    if (!u) {
      tempPassword = randomBytes(9).toString("base64url");
      [u] = await tx.insert(users).values({ email, name: input.name.trim() || email, passwordHash: await hashPassword(tempPassword) }).returning({ id: users.id });
    }
    const added = await tx.insert(memberships).values({ userId: u!.id, companyId, role: input.role }).onConflictDoNothing().returning();
    if (!added.length) throw new AuthError("That person is already a member.");
    await tx.execute(sql`select set_config('app.company_id', ${companyId}, true)`);
    await tx.insert(auditEvents).values({ companyId, actorId, action: "member.added", target: email, detail: { role: input.role } });
    return { tempPassword };
  });
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
