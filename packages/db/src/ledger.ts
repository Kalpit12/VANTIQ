import { consolidate, consolidatedLedgerData, STANDARD_CATEGORIES, type ConsolidationResult, type EntityBooks, type LedgerData, type Program } from "@vantiq/domain";
import { eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { accountMappings, budgetLines, cashBalances, companies, departments, programs, sourceAccounts, transactions, vendors } from "./schema";
import { withCompany } from "./tenant";
import { readGroupSetup, type GroupSetup } from "./group";

const KIND = new Map(STANDARD_CATEGORIES.map((c) => [c.id, c.kind]));
const PHASES = new Set(["Discovery", "Preclinical", "Phase 1", "Phase 2", "Phase 3"]);

export interface LoadedLedger {
  data: LedgerData;
  /** Accounts with ledger activity but no mapping yet: their amounts are left out of every screen. */
  unmapped: { accounts: number; transactions: number };
  /** Mappings Vantiq guessed that nobody has confirmed. */
  unconfirmed: number;
  /** Multi-entity groups: the set-up and its consolidation. `data` is then the consolidated group. */
  group: { setup: GroupSetup; consolidation: ConsolidationResult } | null;
}

/**
 * Builds the `LedgerData` the screens read, from one company's imported rows.
 * Mapping happens here, at read time, so changing a mapping updates every
 * screen without re-importing. Amounts flip to natural sign by category kind
 * (income positive, spend positive).
 */
export async function loadLedger(db: Db, companyId: string): Promise<LoadedLedger> {
  return withCompany(db, companyId, async (tx) => {
    const [company] = await tx.select().from(companies).where(eq(companies.id, companyId));
    const map = await tx.select().from(accountMappings);
    const accounts = await tx.select({ id: sourceAccounts.id, code: sourceAccounts.code }).from(sourceAccounts);
    const categoryOf = new Map(map.filter((m) => m.categoryId && !m.excluded).map((m) => [m.sourceAccountId, m.categoryId!]));
    const handled = new Set(map.filter((m) => m.categoryId || m.excluded).map((m) => m.sourceAccountId));
    const codeOf = new Map(accounts.map((a) => [a.id, a.code]));
    const sign = (categoryId: string) => (KIND.get(categoryId) === "revenue" ? -1 : 1);

    const txns = await tx
      .select({
        id: transactions.id,
        date: transactions.date,
        account: transactions.sourceAccountId,
        amount: transactions.amountMinor,
        vendorId: transactions.vendorId,
        departmentId: transactions.departmentId,
        programId: transactions.programId,
        memo: transactions.memo,
        entityId: transactions.entityId,
      })
      .from(transactions);
    const unmappedAccounts = new Set<string>();
    let unmappedTxns = 0;
    const out: LedgerData["transactions"] = [];
    for (const t of txns) {
      const categoryId = categoryOf.get(t.account);
      if (!categoryId) {
        if (!handled.has(t.account)) {
          unmappedAccounts.add(t.account);
          unmappedTxns++;
        }
        continue;
      }
      out.push({
        id: t.id,
        date: t.date,
        categoryId,
        amount: sign(categoryId) * t.amount,
        vendorId: t.vendorId,
        departmentId: t.departmentId,
        programId: t.programId,
        memo: t.memo,
        accountCode: codeOf.get(t.account) ?? "",
        ...(t.entityId ? { entityId: t.entityId } : {}),
      });
    }
    const budget = (await tx.select().from(budgetLines)).flatMap((b) => {
      const categoryId = categoryOf.get(b.sourceAccountId);
      return categoryId ? [{ period: b.period, categoryId, programId: b.programId, amount: b.amountMinor, accountCode: codeOf.get(b.sourceAccountId) ?? "", ...(b.entityId ? { entityId: b.entityId } : {}) }] : [];
    });
    const progs: Program[] = (await tx.select().from(programs).orderBy(programs.code)).map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      therapeuticArea: p.therapeuticArea,
      phase: p.phase && PHASES.has(p.phase) ? (p.phase as Program["phase"]) : null,
    }));
    const vend = (await tx.select().from(vendors)).map((v) => ({ id: v.id, name: v.name, type: v.type as "cro" | "cmo" | "other" }));
    const depts = (await tx.select().from(departments)).map((d) => ({ id: d.id, name: d.name }));
    const cashRows = await tx.select().from(cashBalances).orderBy(cashBalances.period);
    const unconfirmed = map.filter((m) => m.status === "suggested").length;
    const base = {
      companyName: company?.name ?? "",
      currency: company?.baseCurrency ?? "USD",
      categories: STANDARD_CATEGORIES,
      programs: progs,
      vendors: vend,
      departments: depts,
    };
    const unmapped = { accounts: unmappedAccounts.size, transactions: unmappedTxns };
    const setup = await readGroupSetup(tx, companyId);
    if (!setup.entities.length) {
      const cash = cashRows.map((c) => ({ period: c.period, balance: c.balanceMinor }));
      return { data: { ...base, transactions: out, budget, cash }, unmapped, unconfirmed, group: null };
    }
    // A group: split everything by entity (no entity = the parent), then consolidate.
    const parent = setup.entities.find((e) => e.parent)!;
    const books = new Map<string, EntityBooks>(setup.entities.map((entity) => [entity.id, { entity, transactions: [], budget: [], cash: [] }]));
    const book = (id: string | null | undefined) => books.get(id ?? parent.id) ?? books.get(parent.id)!;
    for (const t of out) book(t.entityId).transactions.push(t);
    for (const b of budget) book(b.entityId).budget.push(b);
    for (const c of cashRows) book(c.entityId).cash.push({ period: c.period, balance: c.balanceMinor });
    const consolidation = consolidate([...books.values()], setup.rates, setup.pairs, { reportingCurrency: base.currency, categories: STANDARD_CATEGORIES });
    return { data: consolidatedLedgerData(base, consolidation), unmapped, unconfirmed, group: { setup, consolidation } };
  });
}

/** A cheap fingerprint of a company's data, so the web app can cache `loadLedger` until something changes. */
export async function ledgerVersion(db: Db, companyId: string): Promise<string> {
  return withCompany(db, companyId, async (tx) => {
    const [r] = await tx.execute<{ v: string }>(sql`
      select concat_ws(':',
        (select count(*) from transactions),
        (select coalesce(max(completed_at)::text, '') from imports),
        (select coalesce(max(finished_at)::text, '') from sync_runs where status = 'done'),
        (select coalesce(max(updated_at)::text, '') from account_mappings),
        (select count(*) from account_mappings),
        (select count(*) from programs),
        (select coalesce(string_agg(name || therapeutic_area || coalesce(phase, ''), ',' order by id), '') from programs),
        (select coalesce(string_agg(code || name || currency, ',' order by id), '') from entities),
        (select count(*) || coalesce(max(updated_at)::text, '') from fx_rates),
        (select count(*) || coalesce(max(created_at)::text, '') from intercompany_pairs)
      ) as v`);
    return r?.v ?? "";
  });
}
