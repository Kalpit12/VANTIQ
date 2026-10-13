import { periodOfDate, periodRange, type Cents, type Period } from "@vantiq/domain";
import {
  ConnectorError,
  isProfitAndLoss,
  mergeConnector,
  sandboxConnector,
  syncWindowStart,
  type Connector,
  type RemoteAccount,
  type RemoteLine,
  type RemoteProgram,
} from "@vantiq/integrations";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "./client";
import { chunks, ensureAccounts, ensureNamed, ensurePrograms } from "./entities";
import { decryptSecret } from "./secrets";
import { auditEvents, cashBalances, connections, departments, periodChecks, syncRuns, transactions, vendors, type PeriodCheckStatus } from "./schema";
import { withCompany } from "./tenant";

/** Months each sync reads, ending with the current month (architecture.md 6.2). */
export const SYNC_MONTHS = 24;
/** A difference above this many cents marks a month out of balance. */
export const BALANCE_TOLERANCE = 100;
/** A run still "running" after this long is treated as dead, so a crashed sync never blocks the next one. */
const STALE_RUN_MS = 15 * 60_000;

export type SyncTrigger = "initial" | "manual" | "scheduled";

export interface SyncResult {
  status: "done" | "failed" | "skipped";
  runId?: string;
  inserted: number;
  updated: number;
  deleted: number;
  outOfBalance: Period[];
  error?: string;
}

/** Builds the connector for a stored connection. */
export function openConnector(c: { provider: string; systemName: string; accountTokenEnc: string | null }): Connector {
  if (c.provider === "sandbox") return sandboxConnector();
  const apiKey = process.env.MERGE_API_KEY;
  if (!apiKey) throw new ConnectorError("MERGE_API_KEY is not set, so Vantiq cannot reach the accounting system.");
  if (!c.accountTokenEnc) throw new ConnectorError("This connection has no access token. Reconnect it.", true);
  return mergeConnector({ apiKey, accountToken: decryptSecret(c.accountTokenEnc), systemName: c.systemName });
}

const hashFor = (connectionId: string, externalId: string) => `ext:${connectionId}:${externalId}`;

/**
 * Pulls the last 24 months of profit-and-loss lines from the connected system,
 * stores them, then checks every month against the system's own net income.
 *
 * - Reading happens before any database write, so a failed read changes nothing.
 * - Lines are keyed by their id in the source system: a changed line is
 *   updated in place, and a line deleted at the source is deleted here.
 * - Connectors that cannot report changes are re-read in full each time and
 *   mirrored exactly within the window.
 */
export async function runSync(
  db: Db,
  companyId: string,
  opts: { trigger: SyncTrigger; actorId?: string | null; connector?: Connector; today?: string },
): Promise<SyncResult> {
  const empty = { inserted: 0, updated: 0, deleted: 0, outOfBalance: [] as Period[] };
  const startedAt = new Date();

  // Claim the connection: one sync at a time per company.
  const claim = await withCompany(db, companyId, async (tx) => {
    const [conn] = await tx.select().from(connections).for("update");
    if (!conn) return null;
    const [running] = await tx
      .select({ id: syncRuns.id })
      .from(syncRuns)
      .where(and(eq(syncRuns.connectionId, conn.id), eq(syncRuns.status, "running"), gte(syncRuns.startedAt, new Date(startedAt.getTime() - STALE_RUN_MS))));
    if (running) return { conn, runId: null };
    const [run] = await tx.insert(syncRuns).values({ companyId, connectionId: conn.id, trigger: opts.trigger, status: "running", startedAt }).returning({ id: syncRuns.id });
    return { conn, runId: run!.id };
  });
  if (!claim) return { status: "failed", ...empty, error: "This company has no connected accounting system." };
  if (!claim.runId) return { status: "skipped", ...empty };
  const { conn, runId } = claim;

  try {
    const connector = opts.connector ?? openConnector(conn);
    const today = opts.today ?? connector.asOf ?? startedAt.toISOString().slice(0, 10);
    const from = syncWindowStart(today, SYNC_MONTHS);
    const periods = periodRange(periodOfDate(from), periodOfDate(today));
    const modifiedSince = connector.incremental && conn.syncedThrough ? conn.syncedThrough.toISOString() : null;

    // 1. Read everything first.
    const accounts = await connector.listAccounts();
    const programsList: RemoteProgram[] = (await connector.listPrograms?.()) ?? [];
    const lines: RemoteLine[] = [];
    const deletedIds: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await connector.listLines({ from, modifiedSince, cursor });
      lines.push(...page.lines);
      deletedIds.push(...page.deleted);
      cursor = page.next;
    } while (cursor);
    const sourceNet = await connector.periodNetIncome(periods);
    const cash = (await connector.cashBalances?.(periods)) ?? new Map<Period, Cents>();

    // 2. Write it in one transaction.
    const result = await withCompany(db, companyId, async (tx) => {
      const pl = accounts.filter(isProfitAndLoss);
      const names = new Map<string, string>(pl.map((a: RemoteAccount) => [a.code, a.name]));
      for (const l of lines) if (!names.has(l.accountCode)) names.set(l.accountCode, l.accountName);
      const classes = new Map(pl.map((a) => [a.code, a.classification]));
      const { idByCode } = await ensureAccounts(tx, companyId, names, classes);
      const vendorIds = await ensureNamed(tx, companyId, vendors, new Set(lines.map((l) => l.vendor)));
      const deptIds = await ensureNamed(tx, companyId, departments, new Set(lines.map((l) => l.department)));
      const programIds = await ensurePrograms(tx, companyId, new Set(lines.map((l) => l.program)), programsList);

      let inserted = 0;
      let updated = 0;
      const rows = lines.map((l) => ({
        companyId,
        connectionId: conn.id,
        externalId: l.externalId,
        date: l.date,
        sourceAccountId: idByCode.get(l.accountCode)!,
        vendorId: vendorIds.get(l.vendor) ?? null,
        departmentId: deptIds.get(l.department) ?? null,
        programId: programIds.get(l.program) ?? null,
        amountMinor: l.amount,
        memo: l.memo,
        sourceHash: hashFor(conn.id, l.externalId),
      }));
      for (const c of chunks(rows)) {
        const out = await tx
          .insert(transactions)
          .values(c)
          .onConflictDoUpdate({
            target: [transactions.companyId, transactions.sourceHash],
            set: {
              date: sql`excluded.date`,
              sourceAccountId: sql`excluded.source_account_id`,
              vendorId: sql`excluded.vendor_id`,
              departmentId: sql`excluded.department_id`,
              programId: sql`excluded.program_id`,
              amountMinor: sql`excluded.amount_minor`,
              memo: sql`excluded.memo`,
            },
            // Only rewrite lines that actually changed, so "updated" means something.
            setWhere: sql`(${transactions.date}, ${transactions.sourceAccountId}, ${transactions.vendorId}, ${transactions.departmentId}, ${transactions.programId}, ${transactions.amountMinor}, ${transactions.memo})
              is distinct from (excluded.date, excluded.source_account_id, excluded.vendor_id, excluded.department_id, excluded.program_id, excluded.amount_minor, excluded.memo)`,
          })
          .returning({ inserted: sql<boolean>`(xmax = 0)` });
        for (const r of out) r.inserted ? inserted++ : updated++;
      }

      // Deletions: reported by the source, or (full reads) whatever vanished from the window.
      let gone = deletedIds;
      if (!connector.incremental) {
        const seen = new Set(lines.map((l) => l.externalId));
        const stored = await tx
          .select({ externalId: transactions.externalId })
          .from(transactions)
          .where(and(eq(transactions.connectionId, conn.id), gte(transactions.date, from)));
        gone = stored.map((s) => s.externalId!).filter((id) => !seen.has(id));
      }
      let deleted = 0;
      for (const c of chunks(gone))
        deleted += (await tx.delete(transactions).where(and(eq(transactions.connectionId, conn.id), inArray(transactions.externalId, c))).returning({ id: transactions.id })).length;

      for (const [period, balance] of cash)
        await tx
          .insert(cashBalances)
          .values({ companyId, period, balanceMinor: balance })
          .onConflictDoUpdate({ target: [cashBalances.companyId, cashBalances.period], set: { balanceMinor: balance, importId: null } });

      // 3. Reconcile each month against the source's own net income.
      const sums = await tx.execute<{ period: string; net: string }>(sql`
        select to_char(date, 'YYYY-MM') as period, (-sum(amount_minor))::text as net
        from transactions where connection_id = ${conn.id} and date >= ${from} group by 1`);
      const ours = new Map(sums.map((s) => [s.period, Number(s.net)]));
      const outOfBalance: Period[] = [];
      const checks = periods.map((period) => {
        const vantiq = ours.get(period) ?? 0;
        const source = sourceNet.get(period);
        let status: PeriodCheckStatus = "unavailable";
        if (source !== undefined) status = Math.abs(source - vantiq) > BALANCE_TOLERANCE ? "out_of_balance" : "balanced";
        if (status === "out_of_balance") outOfBalance.push(period);
        return { companyId, connectionId: conn.id, period, sourceMinor: source ?? null, vantiqMinor: vantiq, status, checkedAt: new Date() };
      });
      await tx.delete(periodChecks).where(and(eq(periodChecks.connectionId, conn.id), lt(periodChecks.period, periods[0]!)));
      for (const c of chunks(checks))
        await tx
          .insert(periodChecks)
          .values(c)
          .onConflictDoUpdate({
            target: [periodChecks.connectionId, periodChecks.period],
            set: { sourceMinor: sql`excluded.source_minor`, vantiqMinor: sql`excluded.vantiq_minor`, status: sql`excluded.status`, checkedAt: sql`excluded.checked_at` },
          });

      await tx.update(connections).set({ status: "active", lastError: null, syncedThrough: startedAt, lastSyncedAt: new Date() }).where(eq(connections.id, conn.id));
      await tx.update(syncRuns).set({ status: "done", inserted, updated, deleted, finishedAt: new Date() }).where(eq(syncRuns.id, runId));
      await tx.insert(auditEvents).values({
        companyId,
        actorId: opts.actorId ?? null,
        action: `sync.${opts.trigger}`,
        target: conn.systemName,
        detail: { inserted, updated, deleted, outOfBalance },
      });
      return { inserted, updated, deleted, outOfBalance };
    });
    return { status: "done", runId, ...result };
  } catch (e) {
    const error = e instanceof ConnectorError ? e.message : e instanceof Error ? `Sync failed: ${e.message}` : "Sync failed.";
    await withCompany(db, companyId, async (tx) => {
      await tx.update(syncRuns).set({ status: "failed", error, finishedAt: new Date() }).where(eq(syncRuns.id, runId));
      await tx.update(connections).set({ status: "error", lastError: error }).where(eq(connections.id, conn.id));
    });
    return { status: "failed", runId, ...empty, error };
  }
}

/** The latest sync run, for showing progress and errors. */
export async function lastSyncRun(db: Db, companyId: string) {
  return withCompany(db, companyId, async (tx) => (await tx.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1))[0] ?? null);
}

