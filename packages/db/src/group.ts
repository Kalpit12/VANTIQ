import { isValidRate, type Entity, type FxRate, type IntercompanyPair } from "@vantiq/domain";
import { and, eq, or, sql } from "drizzle-orm";
import type { Db, Tx } from "./client";
import { auditEvents, companies, entities, fxRates, intercompanyPairs, sourceAccounts } from "./schema";
import { withCompany } from "./tenant";

/*
 * Multi-entity groups (Phase 3): the company's entities, monthly FX rates and
 * intercompany pairs. Ledger, budget and cash rows name their entity; rows
 * with none belong to the parent, so a company that adds entities later keeps
 * everything it already has. Every change is in the audit log.
 */

export class GroupError extends Error {}

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const CURRENCY = /^[A-Z]{3}$/;
const CODE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,29}$/;
const UUID = /^[0-9a-f-]{36}$/i;

export interface GroupSetup {
  reportingCurrency: string;
  entities: Entity[];
  rates: FxRate[];
  pairs: IntercompanyPair[];
}

/** Trims "1.2734000000" (how Postgres returns numeric(22,10)) to "1.2734". */
const tidy = (r: string) => (r.includes(".") ? r.replace(/0+$/, "").replace(/\.$/, "") : r);

export async function readGroupSetup(tx: Tx, companyId: string): Promise<GroupSetup> {
  const [company] = await tx.select({ base: companies.baseCurrency }).from(companies).where(eq(companies.id, companyId));
  const rows = await tx.select().from(entities);
  const list: Entity[] = rows
    .map((e) => ({ id: e.id, code: e.code, name: e.name, currency: e.currency, parent: e.isParent }))
    .sort((a, b) => Number(b.parent) - Number(a.parent) || a.code.localeCompare(b.code));
  const rates = (await tx.select().from(fxRates)).map((r) => ({ period: r.period, currency: r.currency, average: tidy(r.averageRate), closing: tidy(r.closingRate) }));
  rates.sort((a, b) => a.period.localeCompare(b.period) || a.currency.localeCompare(b.currency));
  const codes = new Map((await tx.select({ id: sourceAccounts.id, code: sourceAccounts.code }).from(sourceAccounts)).map((a) => [a.id, a.code]));
  const pairs = (await tx.select().from(intercompanyPairs).orderBy(intercompanyPairs.createdAt)).map((p) => ({
    id: p.id,
    entityId: p.entityId,
    accountCode: codes.get(p.sourceAccountId) ?? "",
    counterpartyEntityId: p.counterpartyEntityId,
    counterpartyAccountCode: codes.get(p.counterpartyAccountId) ?? "",
  }));
  return { reportingCurrency: company?.base ?? "USD", entities: list, rates, pairs };
}

export async function getGroup(db: Db, companyId: string): Promise<GroupSetup> {
  return withCompany(db, companyId, (tx) => readGroupSetup(tx, companyId));
}

/** Within `withCompany`: the parent, or null for a single-entity company. */
export async function parentEntity(tx: Tx) {
  const [p] = await tx.select().from(entities).where(eq(entities.isParent, true));
  return p ?? null;
}

const audit = (tx: Tx, companyId: string, actorId: string, action: string, target: string, detail: Record<string, unknown> = {}) =>
  tx.insert(auditEvents).values({ companyId, actorId, action, target, detail });

function checkEntityFields(code: string, name: string) {
  if (!CODE.test(code)) throw new GroupError("Use a short code of letters and numbers, such as HLX-UK.");
  if (!name || name.length > 120) throw new GroupError("Enter the entity's legal name, 120 characters or fewer.");
}

/**
 * Adds a subsidiary. The first one also creates the parent from the company
 * itself (its name and reporting currency), which every existing row belongs to.
 */
export async function addEntity(db: Db, companyId: string, userId: string, input: { code: string; name: string; currency: string }) {
  const code = input.code.trim();
  const name = input.name.trim();
  const currency = input.currency.trim().toUpperCase();
  checkEntityFields(code, name);
  if (!CURRENCY.test(currency)) throw new GroupError("Enter a three-letter currency code, such as GBP.");
  return withCompany(db, companyId, async (tx) => {
    const [company] = await tx.select().from(companies).where(eq(companies.id, companyId));
    if (!(await parentEntity(tx))) {
      const parentCode = code.toUpperCase() === "PARENT" ? "HQ" : "PARENT";
      await tx.insert(entities).values({ companyId, code: parentCode, name: company!.name, currency: company!.baseCurrency, isParent: true });
      await audit(tx, companyId, userId, "entity.added", company!.name, { code: parentCode, currency: company!.baseCurrency, parent: true });
    }
    const [taken] = await tx.select({ id: entities.id }).from(entities).where(sql`lower(${entities.code}) = lower(${code})`);
    if (taken) throw new GroupError(`There is already an entity with the code ${code}.`);
    const [row] = await tx.insert(entities).values({ companyId, code, name, currency }).returning({ id: entities.id });
    await audit(tx, companyId, userId, "entity.added", name, { code, currency });
    return row!.id;
  });
}

export async function updateEntity(db: Db, companyId: string, userId: string, entityId: string, input: { code: string; name: string }) {
  const code = input.code.trim();
  const name = input.name.trim();
  checkEntityFields(code, name);
  if (!UUID.test(entityId)) throw new GroupError("That entity does not exist.");
  await withCompany(db, companyId, async (tx) => {
    const [before] = await tx.select().from(entities).where(eq(entities.id, entityId));
    if (!before) throw new GroupError("That entity does not exist.");
    const [taken] = await tx.select({ id: entities.id }).from(entities).where(and(sql`lower(${entities.code}) = lower(${code})`, sql`${entities.id} <> ${entityId}`));
    if (taken) throw new GroupError(`There is already an entity with the code ${code}.`);
    if (before.code === code && before.name === name) return;
    await tx.update(entities).set({ code, name }).where(eq(entities.id, entityId));
    await audit(tx, companyId, userId, "entity.renamed", name, { from: { code: before.code, name: before.name }, to: { code, name } });
  });
}

/** Removes a subsidiary with nothing booked to it. Removing the last subsidiary removes the parent too. */
export async function removeEntity(db: Db, companyId: string, userId: string, entityId: string) {
  if (!UUID.test(entityId)) throw new GroupError("That entity does not exist.");
  await withCompany(db, companyId, async (tx) => {
    const [e] = await tx.select().from(entities).where(eq(entities.id, entityId));
    if (!e) throw new GroupError("That entity does not exist.");
    if (e.isParent) throw new GroupError("The parent can't be removed while it has subsidiaries.");
    const [used] = await tx.execute<{ n: number }>(sql`select (
      (select count(*) from transactions where entity_id = ${entityId}) +
      (select count(*) from budget_lines where entity_id = ${entityId}) +
      (select count(*) from cash_balances where entity_id = ${entityId}))::int as n`);
    if ((used?.n ?? 0) > 0) throw new GroupError(`${e.name} has ledger, budget or cash rows, so it can't be removed.`);
    await tx.delete(entities).where(eq(entities.id, entityId));
    await audit(tx, companyId, userId, "entity.removed", e.name, { code: e.code });
    const left = await tx.select().from(entities);
    if (left.length === 1 && left[0]!.isParent) {
      await tx.delete(entities).where(eq(entities.id, left[0]!.id));
      await audit(tx, companyId, userId, "entity.removed", left[0]!.name, { code: left[0]!.code, parent: true });
    }
  });
}

export interface RateInput {
  period: string;
  currency: string;
  average: string;
  closing: string;
}

/** Adds or replaces monthly rates. Rates are units of the reporting currency per one unit of `currency`. */
export async function saveRates(db: Db, companyId: string, userId: string, input: RateInput[]) {
  if (!input.length) throw new GroupError("Enter at least one month's rates.");
  const rows = input.map((r, i) => {
    const period = r.period.trim();
    const currency = r.currency.trim().toUpperCase();
    const average = r.average.trim();
    const closing = r.closing.trim();
    const where = input.length > 1 ? ` (row ${i + 1})` : "";
    if (!PERIOD.test(period)) throw new GroupError(`Month "${r.period}" should look like 2026-09${where}.`);
    if (!CURRENCY.test(currency)) throw new GroupError(`"${r.currency}" is not a three-letter currency code${where}.`);
    for (const v of [average, closing]) if (!isValidRate(v)) throw new GroupError(`Rate "${v}" should be a positive number with up to 10 decimals${where}.`);
    return { companyId, period, currency, averageRate: average, closingRate: closing, updatedBy: userId, updatedAt: new Date() };
  });
  await withCompany(db, companyId, async (tx) => {
    const [company] = await tx.select({ base: companies.baseCurrency }).from(companies).where(eq(companies.id, companyId));
    if (rows.some((r) => r.currency === company!.base)) throw new GroupError(`${company!.base} is the reporting currency, so it needs no rate.`);
    for (const r of rows)
      await tx
        .insert(fxRates)
        .values(r)
        .onConflictDoUpdate({ target: [fxRates.companyId, fxRates.period, fxRates.currency], set: { averageRate: r.averageRate, closingRate: r.closingRate, updatedBy: userId, updatedAt: r.updatedAt } });
    const months = [...new Set(rows.map((r) => r.period))].sort();
    await audit(tx, companyId, userId, "entity.rates_saved", [...new Set(rows.map((r) => r.currency))].join(", "), {
      months: months.length > 3 ? `${months[0]} to ${months.at(-1)}` : months.join(", "),
      rows: rows.length,
    });
  });
}

export async function removeRate(db: Db, companyId: string, userId: string, period: string, currency: string) {
  await withCompany(db, companyId, async (tx) => {
    const gone = await tx.delete(fxRates).where(and(eq(fxRates.period, period), eq(fxRates.currency, currency))).returning({ period: fxRates.period });
    if (gone.length) await audit(tx, companyId, userId, "entity.rate_removed", currency, { month: period });
  });
}

/** Pairs an account in one entity with the account that mirrors it in another. */
export async function addPair(db: Db, companyId: string, userId: string, input: { entityId: string; accountCode: string; counterpartyEntityId: string; counterpartyAccountCode: string }) {
  if (!UUID.test(input.entityId) || !UUID.test(input.counterpartyEntityId)) throw new GroupError("Choose both entities.");
  if (input.entityId === input.counterpartyEntityId) throw new GroupError("Choose two different entities.");
  return withCompany(db, companyId, async (tx) => {
    const ents = new Map((await tx.select().from(entities)).map((e) => [e.id, e]));
    const a = ents.get(input.entityId);
    const b = ents.get(input.counterpartyEntityId);
    if (!a || !b) throw new GroupError("Choose both entities.");
    const account = async (code: string) => {
      const [acct] = await tx.select().from(sourceAccounts).where(eq(sourceAccounts.code, code.trim()));
      if (!acct) throw new GroupError(`There is no account ${code.trim() || "(blank)"} in the books yet.`);
      return acct;
    };
    const accA = await account(input.accountCode);
    const accB = await account(input.counterpartyAccountCode);
    // Each account sits in one pair per entity, on either side.
    for (const [e, acc] of [
      [a, accA],
      [b, accB],
    ] as const) {
      const [clash] = await tx
        .select({ id: intercompanyPairs.id })
        .from(intercompanyPairs)
        .where(
          or(
            and(eq(intercompanyPairs.entityId, e.id), eq(intercompanyPairs.sourceAccountId, acc.id)),
            and(eq(intercompanyPairs.counterpartyEntityId, e.id), eq(intercompanyPairs.counterpartyAccountId, acc.id)),
          ),
        );
      if (clash) throw new GroupError(`Account ${acc.code} in ${e.name} is already paired.`);
    }
    const [row] = await tx
      .insert(intercompanyPairs)
      .values({ companyId, entityId: a.id, sourceAccountId: accA.id, counterpartyEntityId: b.id, counterpartyAccountId: accB.id, createdBy: userId })
      .returning({ id: intercompanyPairs.id });
    await audit(tx, companyId, userId, "entity.pair_added", `${a.code} ${accA.code} ↔ ${b.code} ${accB.code}`);
    return row!.id;
  });
}

export async function removePair(db: Db, companyId: string, userId: string, pairId: string) {
  if (!UUID.test(pairId)) throw new GroupError("That pair does not exist.");
  await withCompany(db, companyId, async (tx) => {
    const g = await readGroupSetup(tx, companyId);
    const p = g.pairs.find((x) => x.id === pairId);
    if (!p) throw new GroupError("That pair does not exist.");
    const code = (id: string) => g.entities.find((e) => e.id === id)?.code ?? "";
    await tx.delete(intercompanyPairs).where(eq(intercompanyPairs.id, pairId));
    await audit(tx, companyId, userId, "entity.pair_removed", `${code(p.entityId)} ${p.accountCode} ↔ ${code(p.counterpartyEntityId)} ${p.counterpartyAccountCode}`);
  });
}

/**
 * Within `withCompany`: entity codes in a file → entity ids. The parent's
 * code (and a blank) map to null, since rows with no entity are the parent's.
 */
export async function entityResolver(tx: Tx) {
  const rows = await tx.select().from(entities);
  const byCode = new Map(rows.map((e) => [e.code.toLowerCase(), e]));
  return {
    any: rows.length > 0,
    resolve(code: string): { ok: true; id: string | null } | { ok: false; message: string } {
      const c = code.trim();
      if (!c) return { ok: true, id: null };
      if (!rows.length) return { ok: false, message: `Entity "${c}" isn't set up. Add entities under Settings → Entities first.` };
      const e = byCode.get(c.toLowerCase());
      if (!e) return { ok: false, message: `Entity "${c}" isn't set up. The codes are ${rows.map((r) => r.code).join(", ")}.` };
      return { ok: true, id: e.isParent ? null : e.id };
    },
  };
}
