import { STANDARD_CATEGORIES } from "@vantiq/domain";
import { eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { accountMappings, auditEvents, sourceAccounts } from "./schema";
import { withCompany } from "./tenant";

export interface MappingRow {
  accountId: string;
  code: string;
  name: string;
  categoryId: string | null;
  excluded: boolean;
  status: "suggested" | "confirmed" | "unmapped";
  reason: string;
  transactions: number;
  /** Debit-positive total of every transaction on the account. */
  total: number;
}

const LEAVES = new Set(STANDARD_CATEGORIES.filter((c) => !STANDARD_CATEGORIES.some((x) => x.parentId === c.id)).map((c) => c.id));

export async function listMappings(db: Db, companyId: string): Promise<MappingRow[]> {
  return withCompany(db, companyId, async (tx) => {
    const rows = await tx.execute<{
      account_id: string;
      code: string;
      name: string;
      category_id: string | null;
      excluded: boolean | null;
      status: string | null;
      reason: string | null;
      n: number;
      total: string;
    }>(sql`
      select a.id as account_id, a.code, a.name, m.category_id, m.excluded, m.status, m.reason,
             count(t.id)::int as n, coalesce(sum(t.amount_minor), 0)::text as total
      from source_accounts a
      left join account_mappings m on m.source_account_id = a.id
      left join transactions t on t.source_account_id = a.id
      group by a.id, m.source_account_id
      order by a.code`);
    return rows.map((r) => ({
      accountId: r.account_id,
      code: r.code,
      name: r.name,
      categoryId: r.category_id,
      excluded: r.excluded ?? false,
      status: r.status === "confirmed" || r.status === "suggested" ? r.status : "unmapped",
      reason: r.reason ?? "",
      transactions: r.n,
      total: Number(r.total),
    }));
  });
}

/** Sets or confirms mappings. `categoryId: null` with `excluded: true` keeps an account out of the P&L. */
export async function saveMappings(
  db: Db,
  companyId: string,
  userId: string,
  changes: { accountId: string; categoryId: string | null; excluded: boolean }[],
) {
  for (const c of changes) {
    if (c.excluded ? c.categoryId !== null : !c.categoryId || !LEAVES.has(c.categoryId)) throw new Error("Pick a category for every account, or exclude it.");
  }
  return withCompany(db, companyId, async (tx) => {
    const owned = new Set((await tx.select({ id: sourceAccounts.id }).from(sourceAccounts)).map((a) => a.id));
    for (const c of changes) {
      if (!owned.has(c.accountId)) throw new Error("Unknown account.");
      await tx
        .insert(accountMappings)
        .values({ sourceAccountId: c.accountId, companyId, categoryId: c.categoryId, excluded: c.excluded, status: "confirmed", reason: "", updatedBy: userId })
        .onConflictDoUpdate({
          target: accountMappings.sourceAccountId,
          set: { categoryId: c.categoryId, excluded: c.excluded, status: "confirmed", updatedBy: userId, updatedAt: new Date() },
        });
    }
    if (changes.length) await tx.insert(auditEvents).values({ companyId, actorId: userId, action: "mapping.saved", target: `${changes.length} accounts`, detail: { changes } });
    return changes.length;
  });
}

export async function confirmAllSuggestions(db: Db, companyId: string, userId: string) {
  return withCompany(db, companyId, async (tx) => {
    const n = await tx
      .update(accountMappings)
      .set({ status: "confirmed", updatedBy: userId, updatedAt: new Date() })
      .where(eq(accountMappings.status, "suggested"))
      .returning({ id: accountMappings.sourceAccountId });
    if (n.length) await tx.insert(auditEvents).values({ companyId, actorId: userId, action: "mapping.confirmed_all", target: `${n.length} accounts` });
    return n.length;
  });
}
