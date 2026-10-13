import { eq } from "drizzle-orm";
import { EXCLUDED, suggestCategory } from "@vantiq/integrations";
import type { Tx } from "./client";
import { accountMappings, departments, programs, sourceAccounts, vendors } from "./schema";

/* Lookups shared by file imports and connected-system syncs. All run inside withCompany. */

const CHUNK = 1000;
export const chunks = <T>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, (i + 1) * CHUNK));

/**
 * Makes sure every account code exists, fills in blank names, and suggests a
 * category for any account nobody has mapped yet. `classes` records what a
 * connected system says each account is (revenue, expense...).
 */
export async function ensureAccounts(tx: Tx, companyId: string, accounts: Map<string, string>, classes?: Map<string, string | null>) {
  const existing = await tx.select().from(sourceAccounts);
  const byCode = new Map(existing.map((a) => [a.code, a]));
  const fresh = [...accounts]
    .filter(([code]) => !byCode.has(code))
    .map(([code, name]) => ({ companyId, code, name, classification: classes?.get(code) ?? null }));
  for (const c of chunks(fresh)) for (const a of await tx.insert(sourceAccounts).values(c).returning()) byCode.set(a.code, a);
  // Fill in names that an earlier file left blank.
  for (const [code, name] of accounts) {
    const a = byCode.get(code)!;
    if (!a.name && name) await tx.update(sourceAccounts).set({ name }).where(eq(sourceAccounts.id, a.id));
    const cls = classes?.get(code);
    if (cls && a.classification !== cls) await tx.update(sourceAccounts).set({ classification: cls }).where(eq(sourceAccounts.id, a.id));
  }
  // First-guess mappings for accounts nobody has mapped yet.
  const mapped = new Set((await tx.select({ id: accountMappings.sourceAccountId }).from(accountMappings)).map((m) => m.id));
  const suggestions = [...byCode.values()]
    .filter((a) => !mapped.has(a.id))
    .flatMap((a) => {
      const s = suggestCategory(a.code, accounts.get(a.code) || a.name);
      if (!s) return [];
      const excluded = s.categoryId === EXCLUDED;
      return [{ sourceAccountId: a.id, companyId, categoryId: excluded ? null : s.categoryId, excluded, status: "suggested" as const, reason: s.reason }];
    });
  for (const c of chunks(suggestions)) await tx.insert(accountMappings).values(c).onConflictDoNothing();
  return { idByCode: new Map([...byCode].map(([k, v]) => [k, v.id])), newAccounts: fresh.length };
}

export async function ensureNamed(tx: Tx, companyId: string, table: typeof vendors | typeof departments, names: Set<string>) {
  const list = [...names].filter(Boolean);
  if (list.length) await tx.insert(table).values(list.map((name) => ({ companyId, name }))).onConflictDoNothing();
  const rows = await tx.select({ id: table.id, name: table.name }).from(table);
  return new Map(rows.map((r) => [r.name, r.id]));
}

/** Creates programs for new codes. Named programs (from a connected system) keep whatever a user has since edited. */
export async function ensurePrograms(tx: Tx, companyId: string, codes: Set<string>, named: { code: string; name: string; therapeuticArea?: string; phase?: string | null }[] = []) {
  const list = [...codes].filter(Boolean);
  const values = new Map(list.map((code) => [code, { companyId, code, name: code, therapeuticArea: "", phase: null as string | null }]));
  for (const p of named) values.set(p.code, { companyId, code: p.code, name: p.name, therapeuticArea: p.therapeuticArea ?? "", phase: p.phase ?? null });
  for (const c of chunks([...values.values()])) await tx.insert(programs).values(c).onConflictDoNothing();
  const rows = await tx.select({ id: programs.id, code: programs.code }).from(programs);
  return new Map(rows.map((r) => [r.code, r.id]));
}
