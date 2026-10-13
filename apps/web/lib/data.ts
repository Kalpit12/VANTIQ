import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { Ledger } from "@vantiq/domain";
import { generateSampleCompany } from "@vantiq/fixtures";
import { getDb, getSession, ledgerVersion, loadLedger, type Role, type SessionUser } from "@vantiq/db";

/**
 * Data access for the web app. Two modes:
 * - Demo (no DATABASE_URL): the built-in Helixa sample company, no sign-in.
 *   This is what a fresh deployment shows before a database is connected.
 * - Workspace (DATABASE_URL set): sign-in required; each company sees only its
 *   own imported data. Screens only talk to `Ledger`, so they work in both.
 */
export const dbEnabled = () => Boolean(process.env.DATABASE_URL);

export const SESSION_COOKIE = "vantiq_session";

export interface Workspace {
  mode: "demo" | "db";
  ledger: Ledger;
  companyId: string | null;
  companyName: string;
  role: Role;
  session: SessionUser | null;
  unmapped: { accounts: number; transactions: number };
  unconfirmed: number;
}

let demo: Ledger | null = null;
const ledgers = new Map<string, { version: string; ledger: Ledger; unmapped: Workspace["unmapped"]; unconfirmed: number }>();

/** The signed-in user, or null. Never redirects. */
export const currentSession = cache(async (): Promise<SessionUser | null> => {
  if (!dbEnabled()) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? getSession(getDb(), token) : null;
});

/** Everything a screen needs. Sends signed-out visitors to the sign-in page. */
export const getWorkspace = cache(async (): Promise<Workspace> => {
  if (!dbEnabled()) {
    demo ??= new Ledger(generateSampleCompany());
    return { mode: "demo", ledger: demo, companyId: null, companyName: demo.data.companyName, role: "viewer", session: null, unmapped: { accounts: 0, transactions: 0 }, unconfirmed: 0 };
  }
  const session = await currentSession();
  if (!session) redirect("/sign-in");
  if (!session.company) redirect("/sign-in?error=no-company");
  const db = getDb();
  const companyId = session.company.id;
  // Rebuilding the ledger is the expensive part; reuse it until the data changes.
  const version = await ledgerVersion(db, companyId);
  let hit = ledgers.get(companyId);
  if (!hit || hit.version !== version) {
    const loaded = await loadLedger(db, companyId);
    hit = { version, ledger: new Ledger(loaded.data), unmapped: loaded.unmapped, unconfirmed: loaded.unconfirmed };
    ledgers.set(companyId, hit);
  }
  return {
    mode: "db",
    ledger: hit.ledger,
    companyId,
    companyName: session.company.name,
    role: session.company.role,
    session,
    unmapped: hit.unmapped,
    unconfirmed: hit.unconfirmed,
  };
});

/** For server actions: the signed-in member, or an error if they lack the permission. */
export async function requireMember(check?: (r: Role) => boolean) {
  if (!dbEnabled()) throw new Error("Connect a database to use this.");
  const s = await currentSession();
  if (!s?.company) throw new Error("Your session has ended. Sign in again.");
  if (check && !check(s.company.role)) throw new Error("Your role can't do this. Ask an admin.");
  return { db: getDb(), session: s, companyId: s.company.id, userId: s.user.id, role: s.company.role };
}
