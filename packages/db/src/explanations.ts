import type { Period } from "@vantiq/domain";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "./client";
import { auditEvents, explanations, users, type ExplanationStatus } from "./schema";
import { isPeriodLocked, lockedMessage } from "./packs";
import { withCompany } from "./tenant";

/** `2026-09` for one month, `2026-01..2026-09` for a range. */
export const scopeOf = (periods: Period[]) => (periods.length === 1 ? periods[0]! : `${periods[0]}..${periods[periods.length - 1]}`);

export interface ExplanationRow {
  categoryId: string;
  text: string;
  status: ExplanationStatus;
  citedTransactionIds: string[];
  source: "claude" | "rules";
  model: string | null;
  confidence: "low" | "medium" | "high";
  draftedDeltaMinor: number;
  draftedAt: Date;
  decidedByName: string | null;
  decidedAt: Date | null;
}

export async function listExplanations(db: Db, companyId: string, periods: Period[]): Promise<Map<string, ExplanationRow>> {
  const rows = await withCompany(db, companyId, (tx) =>
    tx
      .select({
        categoryId: explanations.categoryId,
        text: explanations.text,
        status: explanations.status,
        citedTransactionIds: explanations.citedTransactionIds,
        source: explanations.source,
        model: explanations.model,
        confidence: explanations.confidence,
        draftedDeltaMinor: explanations.draftedDeltaMinor,
        draftedAt: explanations.draftedAt,
        decidedByName: users.name,
        decidedAt: explanations.decidedAt,
      })
      .from(explanations)
      .leftJoin(users, eq(users.id, explanations.decidedBy))
      .where(eq(explanations.scope, scopeOf(periods))),
  );
  return new Map(rows.map((r) => [r.categoryId, r]));
}

export interface DraftInput {
  categoryId: string;
  text: string;
  citedTransactionIds: string[];
  source: "claude" | "rules";
  model?: string;
  confidence: "low" | "medium" | "high";
  promptVersion: string;
  deltaMinor: number;
}

/**
 * Stores fresh drafts. A line someone already accepted or edited keeps its
 * text unless `replaceDecided` is set (the "Draft again" button).
 */
export async function saveDrafts(db: Db, companyId: string, actorId: string | null, periods: Period[], drafts: DraftInput[], replaceDecided = false) {
  if (!drafts.length) return 0;
  const scope = scopeOf(periods);
  return withCompany(db, companyId, async (tx) => {
    if (periods.length === 1 && (await isPeriodLocked(tx, scope))) throw new Error(lockedMessage(scope));
    const existing = await tx
      .select({ categoryId: explanations.categoryId, status: explanations.status })
      .from(explanations)
      .where(and(eq(explanations.scope, scope), inArray(explanations.categoryId, drafts.map((d) => d.categoryId))));
    const locked = new Set(existing.filter((e) => e.status === "accepted" || e.status === "edited").map((e) => e.categoryId));
    let saved = 0;
    for (const d of drafts) {
      if (locked.has(d.categoryId) && !replaceDecided) continue;
      const values = {
        text: d.text,
        status: "ai_draft" as const,
        citedTransactionIds: d.citedTransactionIds,
        source: d.source,
        model: d.model ?? null,
        confidence: d.confidence,
        promptVersion: d.promptVersion,
        draftedDeltaMinor: d.deltaMinor,
        draftedAt: new Date(),
        decidedBy: null,
        decidedAt: null,
      };
      await tx
        .insert(explanations)
        .values({ companyId, scope, categoryId: d.categoryId, ...values })
        .onConflictDoUpdate({ target: [explanations.companyId, explanations.scope, explanations.categoryId], set: values });
      saved++;
    }
    if (saved) await tx.insert(auditEvents).values({ companyId, actorId, action: "explanation.draft", target: scope, detail: { lines: drafts.map((d) => d.categoryId), source: drafts[0]!.source } });
    return saved;
  });
}

/** A person's decision on a draft. Editing accepts it with their wording. */
export async function decideExplanation(
  db: Db,
  companyId: string,
  userId: string,
  periods: Period[],
  categoryId: string,
  decision: { action: "accept" } | { action: "reject" } | { action: "edit"; text: string },
) {
  const scope = scopeOf(periods);
  const text = decision.action === "edit" ? decision.text.trim() : null;
  if (decision.action === "edit" && (!text || text.length > 1200)) throw new Error("Write the explanation in 1,200 characters or fewer.");
  await withCompany(db, companyId, async (tx) => {
    if (periods.length === 1 && (await isPeriodLocked(tx, scope))) throw new Error(lockedMessage(scope));
    const status: ExplanationStatus = decision.action === "accept" ? "accepted" : decision.action === "reject" ? "rejected" : "edited";
    const [row] = await tx
      .update(explanations)
      .set({ status, decidedBy: userId, decidedAt: new Date(), ...(text ? { text } : {}) })
      .where(and(eq(explanations.scope, scope), eq(explanations.categoryId, categoryId)))
      .returning({ id: explanations.id });
    if (!row) throw new Error("There is no draft for this line yet.");
    await tx.insert(auditEvents).values({ companyId, actorId: userId, action: `explanation.${decision.action}`, target: `${scope} ${categoryId}`, detail: text ? { text } : {} });
  });
}
