import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  guessColumns,
  normalize,
  type BudgetRecord,
  type CashRecord,
  type ColumnMap,
  type ImportKind,
  type LedgerRecord,
  type RawTable,
  type RowError,
} from "@vantiq/integrations";
import type { Db, Tx } from "./client";
import { auditEvents, budgetLines, cashBalances, departments, imports, transactions, vendors } from "./schema";
import { chunks, ensureAccounts, ensureNamed, ensurePrograms } from "./entities";
import { withCompany } from "./tenant";


/** Step 1: store the parsed file and a first guess at its columns. */
export async function createDraft(db: Db, companyId: string, userId: string, kind: ImportKind, filename: string, table: RawTable) {
  if (!table.headers.length || !table.rows.length) throw new Error("The file has no rows under its header line.");
  const columnMap = guessColumns(table.headers, kind);
  return withCompany(db, companyId, async (tx) => {
    const [row] = await tx
      .insert(imports)
      .values({ companyId, kind, filename, status: "draft", headers: table.headers, rows: table.rows, columnMap, rowCount: table.rows.length, createdBy: userId })
      .returning({ id: imports.id });
    return row!.id;
  });
}

export async function getImport(db: Db, companyId: string, importId: string) {
  return withCompany(db, companyId, async (tx) => {
    const [row] = await tx.select().from(imports).where(eq(imports.id, importId));
    return row ?? null;
  });
}

export async function listImports(db: Db, companyId: string, limit = 20) {
  return withCompany(db, companyId, (tx) =>
    tx
      .select({ id: imports.id, kind: imports.kind, filename: imports.filename, status: imports.status, rowCount: imports.rowCount, inserted: imports.inserted, duplicates: imports.duplicates, createdAt: imports.createdAt })
      .from(imports)
      .orderBy(desc(imports.createdAt))
      .limit(limit),
  );
}

/** Dry run of step 2: what the chosen columns produce, without saving anything. */
export async function previewImport(db: Db, companyId: string, importId: string, columnMap: ColumnMap) {
  const draft = await getImport(db, companyId, importId);
  if (!draft || draft.status !== "draft" || !draft.rows) throw new Error("This import was already finished or does not exist.");
  const res = normalize(draft.kind, { headers: draft.headers, rows: draft.rows }, columnMap);
  return { valid: res.records.length, errors: res.errors, skipped: res.skipped, sample: res.records.slice(0, 8) };
}

export interface CommitResult {
  inserted: number;
  duplicates: number;
  errors: RowError[];
  skipped: number;
  newAccounts: number;
}

/**
 * Step 2: validate every row with the chosen columns and save. Ledger rows are
 * deduplicated by content, so importing the same file twice adds nothing.
 * A budget import replaces the budget for the months it covers; a cash import
 * replaces those months' balances. Rows with errors are reported and skipped.
 */
export async function commitImport(db: Db, companyId: string, userId: string, importId: string, columnMap: ColumnMap): Promise<CommitResult> {
  return withCompany(db, companyId, async (tx) => {
    const [draft] = await tx.select().from(imports).where(eq(imports.id, importId)).for("update");
    if (!draft || draft.status !== "draft" || !draft.rows) throw new Error("This import was already finished or does not exist.");
    const table = { headers: draft.headers, rows: draft.rows };
    let result: CommitResult;
    if (draft.kind === "ledger") result = await saveLedger(tx, companyId, importId, normalize("ledger", table, columnMap));
    else if (draft.kind === "budget") result = await saveBudget(tx, companyId, importId, normalize("budget", table, columnMap));
    else result = await saveCash(tx, companyId, importId, normalize("cash", table, columnMap));
    await tx
      .update(imports)
      .set({ status: "done", rows: null, columnMap, inserted: result.inserted, duplicates: result.duplicates, completedAt: new Date() })
      .where(eq(imports.id, importId));
    await tx.insert(auditEvents).values({
      companyId,
      actorId: userId,
      action: `import.${draft.kind}`,
      target: draft.filename,
      detail: { inserted: result.inserted, duplicates: result.duplicates, errors: result.errors.length, skipped: result.skipped },
    });
    return result;
  });
}

async function saveLedger(tx: Tx, companyId: string, importId: string, res: { records: LedgerRecord[]; errors: RowError[]; skipped: number }): Promise<CommitResult> {
  const { records } = res;
  const { idByCode, newAccounts } = await ensureAccounts(tx, companyId, new Map(records.map((r) => [r.accountCode, r.accountName])));
  const vendorIds = await ensureNamed(tx, companyId, vendors, new Set(records.map((r) => r.vendor)));
  const deptIds = await ensureNamed(tx, companyId, departments, new Set(records.map((r) => r.department)));
  const programIds = await ensurePrograms(tx, companyId, new Set(records.map((r) => r.program)));
  // Identical lines in one file are legitimate (two equal invoices), so the hash includes the occurrence number.
  const seen = new Map<string, number>();
  const values = records.map((r) => {
    const base = [r.date, r.accountCode, r.amount, r.vendor, r.memo, r.department, r.program].join("\u001f");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return {
      companyId,
      importId,
      date: r.date,
      sourceAccountId: idByCode.get(r.accountCode)!,
      vendorId: vendorIds.get(r.vendor) ?? null,
      departmentId: deptIds.get(r.department) ?? null,
      programId: programIds.get(r.program) ?? null,
      amountMinor: r.amount,
      memo: r.memo,
      sourceHash: createHash("sha256").update(`${base}\u001f${n}`).digest("hex"),
    };
  });
  let inserted = 0;
  for (const c of chunks(values)) inserted += (await tx.insert(transactions).values(c).onConflictDoNothing().returning({ id: transactions.id })).length;
  return { inserted, duplicates: values.length - inserted, errors: res.errors, skipped: res.skipped, newAccounts };
}

async function saveBudget(tx: Tx, companyId: string, importId: string, res: { records: BudgetRecord[]; errors: RowError[]; skipped: number }): Promise<CommitResult> {
  const { records } = res;
  const { idByCode, newAccounts } = await ensureAccounts(tx, companyId, new Map(records.map((r) => [r.accountCode, r.accountName])));
  const programIds = await ensurePrograms(tx, companyId, new Set(records.map((r) => r.program)));
  const periods = [...new Set(records.map((r) => r.period))];
  if (periods.length) await tx.delete(budgetLines).where(inArray(budgetLines.period, periods));
  const values = records.map((r) => ({
    companyId,
    importId,
    period: r.period,
    sourceAccountId: idByCode.get(r.accountCode)!,
    programId: programIds.get(r.program) ?? null,
    amountMinor: r.amount,
  }));
  for (const c of chunks(values)) await tx.insert(budgetLines).values(c);
  return { inserted: values.length, duplicates: 0, errors: res.errors, skipped: res.skipped, newAccounts };
}

async function saveCash(tx: Tx, companyId: string, importId: string, res: { records: CashRecord[]; errors: RowError[]; skipped: number }): Promise<CommitResult> {
  for (const r of res.records) {
    await tx
      .insert(cashBalances)
      .values({ companyId, period: r.period, balanceMinor: r.balance, importId })
      .onConflictDoUpdate({ target: [cashBalances.companyId, cashBalances.period], set: { balanceMinor: r.balance, importId } });
  }
  return { inserted: res.records.length, duplicates: 0, errors: res.errors, skipped: res.skipped, newAccounts: 0 };
}

export async function discardDraft(db: Db, companyId: string, importId: string) {
  await withCompany(db, companyId, (tx) => tx.delete(imports).where(and(eq(imports.id, importId), eq(imports.status, "draft"))));
}

export async function hasAnyData(db: Db, companyId: string) {
  return withCompany(db, companyId, async (tx) => {
    const [r] = await tx.execute<{ n: number }>(sql`select (select count(*) from transactions)::int as n`);
    return (r?.n ?? 0) > 0;
  });
}
