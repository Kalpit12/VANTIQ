import { desc, sql } from "drizzle-orm";
import type { Db } from "./client";
import { encryptSecret } from "./secrets";
import { auditEvents, companies, connections, periodChecks, syncRuns, type ConnectionProvider } from "./schema";
import { withCompany } from "./tenant";

export type Connection = Omit<typeof connections.$inferSelect, "accountTokenEnc">;

const visible = {
  id: connections.id,
  companyId: connections.companyId,
  provider: connections.provider,
  systemName: connections.systemName,
  status: connections.status,
  syncedThrough: connections.syncedThrough,
  lastSyncedAt: connections.lastSyncedAt,
  lastError: connections.lastError,
  createdBy: connections.createdBy,
  createdAt: connections.createdAt,
};

/** The company's connection, without its token. */
export async function getConnection(db: Db, companyId: string): Promise<Connection | null> {
  return withCompany(db, companyId, async (tx) => (await tx.select(visible).from(connections))[0] ?? null);
}

export class ConnectionError extends Error {}

/**
 * Records a new connection. Refused when the company already has one, or
 * already has ledger lines from file imports: synced lines would count the
 * same spending twice.
 */
export async function createConnection(
  db: Db,
  companyId: string,
  userId: string,
  c: { provider: ConnectionProvider; systemName: string; accountToken?: string },
): Promise<string> {
  const sealed = c.accountToken ? encryptSecret(c.accountToken) : null;
  return withCompany(db, companyId, async (tx) => {
    if ((await tx.select({ id: connections.id }).from(connections)).length) throw new ConnectionError("This company is already connected. Disconnect it first to switch systems.");
    const [r] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from transactions where connection_id is null`);
    if ((r?.n ?? 0) > 0)
      throw new ConnectionError("This company already has ledger lines from file imports. Connect your accounting system in a fresh company so nothing is counted twice.");
    const [row] = await tx
      .insert(connections)
      .values({ companyId, provider: c.provider, systemName: c.systemName, accountTokenEnc: sealed, createdBy: userId })
      .returning({ id: connections.id });
    await tx.insert(auditEvents).values({ companyId, actorId: userId, action: "connection.create", target: c.systemName, detail: { provider: c.provider } });
    return row!.id;
  });
}

/** Removes the connection and its token. Lines already synced stay, so the screens keep working. */
export async function deleteConnection(db: Db, companyId: string, userId: string) {
  await withCompany(db, companyId, async (tx) => {
    const [c] = await tx.delete(connections).returning({ systemName: connections.systemName });
    if (c) await tx.insert(auditEvents).values({ companyId, actorId: userId, action: "connection.delete", target: c.systemName });
  });
}

export async function listSyncRuns(db: Db, companyId: string, limit = 10) {
  return withCompany(db, companyId, (tx) => tx.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(limit));
}

export async function listPeriodChecks(db: Db, companyId: string) {
  return withCompany(db, companyId, (tx) => tx.select().from(periodChecks).orderBy(periodChecks.period));
}

/**
 * Connections whose last sync is older than `staleMs`, across every company.
 * Row-level security hides other companies' connections, so this asks each
 * company in turn. Fine at today's scale; a job queue replaces it later.
 */
export async function listDueConnections(db: Db, staleMs: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - staleMs);
  const out: { companyId: string; connectionId: string }[] = [];
  for (const { id } of await db.select({ id: companies.id }).from(companies)) {
    const [c] = await withCompany(db, id, (tx) => tx.select({ id: connections.id, last: connections.lastSyncedAt }).from(connections));
    if (c && (!c.last || c.last < cutoff)) out.push({ companyId: id, connectionId: c.id });
  }
  return out;
}

