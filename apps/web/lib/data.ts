import "server-only";
import { sendEmailsAfterResponse } from "./email";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { consolidate, consolidatedLedgerData, Ledger } from "@vantiq/domain";
import { generateSampleGroup } from "@vantiq/fixtures";
import { makeGroup, type Group } from "./entities";
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
  /** Multi-entity groups: entities, the consolidation, and each entity's own ledger. `ledger` is then the consolidated group. */
  group: Group | null;
}

let demo: { ledger: Ledger; group: Group } | null = null;
const ledgers = new Map<string, { version: string; ledger: Ledger; unmapped: Workspace["unmapped"]; unconfirmed: number; group: Group | null }>();

/** The sample company as a group of three entities (US parent, Australia, Canada), consolidated. */
function demoWorkspace() {
  const g = generateSampleGroup();
  const consolidation = consolidate(g.books, g.fx, g.pairs, { reportingCurrency: "USD", categories: g.base.categories });
  return { ledger: new Ledger(consolidatedLedgerData(g.base, consolidation)), group: makeGroup(g.base, consolidation, g.fx) };
}

/** The signed-in user, or null. Never redirects. */
export const currentSession = cache(async (): Promise<SessionUser | null> => {
  if (!dbEnabled()) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? getSession(getDb(), token) : null;
});

/** Everything a screen needs. Sends signed-out visitors to the sign-in page. */
export const getWorkspace = cache(async (): Promise<Workspace> => {
  if (!dbEnabled()) {
    demo ??= demoWorkspace();
    return { mode: "demo", ledger: demo.ledger, companyId: null, companyName: demo.ledger.data.companyName, role: "viewer", session: null, unmapped: { accounts: 0, transactions: 0 }, unconfirmed: 0, group: demo.group };
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
    const { transactions: _t, budget: _b, cash: _c, ...base } = loaded.data;
    const group = loaded.group ? makeGroup(base, loaded.group.consolidation, loaded.group.setup.rates) : null;
    hit = { version, ledger: new Ledger(loaded.data), unmapped: loaded.unmapped, unconfirmed: loaded.unconfirmed, group };
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
    group: hit.group,
  };
});

/** For server actions: the signed-in member, or an error if they lack the permission. */
export async function requireMember(check?: (r: Role) => boolean) {
  if (!dbEnabled()) throw new Error("Connect a database to use this.");
  const s = await currentSession();
  if (!s?.company) throw new Error("Your session has ended. Sign in again.");
  if (check && !check(s.company.role)) throw new Error("Your role can't do this. Ask an admin.");
  // Anything this change emails goes out once the response has been sent.
  await sendEmailsAfterResponse();
  return { db: getDb(), session: s, companyId: s.company.id, userId: s.user.id, role: s.company.role };
}
