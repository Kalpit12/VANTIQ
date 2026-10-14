import { and, desc, eq, like, lt, type SQL } from "drizzle-orm";
import type { Db } from "./client";
import { auditEvents, companies, users } from "./schema";
import { withCompany } from "./tenant";

export interface AuditRow {
  id: string;
  action: string;
  target: string;
  detail: Record<string, unknown>;
  at: Date;
  actorName: string | null;
  actorEmail: string | null;
}

/**
 * The company's audit log, newest first. `area` filters by the part before the
 * dot (`pack`, `explanation`…); `before` pages back from a timestamp.
 */
export async function listAuditEvents(db: Db, companyId: string, opts: { limit?: number; before?: Date; area?: string } = {}): Promise<AuditRow[]> {
  const conds: SQL[] = [];
  if (opts.before) conds.push(lt(auditEvents.at, opts.before));
  if (opts.area) conds.push(like(auditEvents.action, `${opts.area.replace(/[%_\\]/g, "")}.%`));
  return withCompany(db, companyId, (tx) =>
    tx
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        target: auditEvents.target,
        detail: auditEvents.detail,
        at: auditEvents.at,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(auditEvents.at), desc(auditEvents.id))
      .limit(opts.limit ?? 50),
  );
}

export async function renameCompany(db: Db, companyId: string, userId: string, name: string) {
  const next = name.trim();
  if (!next || next.length > 120) throw new Error("Enter a company name of 120 characters or fewer.");
  await withCompany(db, companyId, async (tx) => {
    const [before] = await tx.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId));
    if (!before || before.name === next) return;
    await tx.update(companies).set({ name: next }).where(eq(companies.id, companyId));
    await tx.insert(auditEvents).values({ companyId, actorId: userId, action: "company.renamed", target: next, detail: { from: before.name } });
  });
}
