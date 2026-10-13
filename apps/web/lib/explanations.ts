import "server-only";
import { buildVarianceContext, draftWithRules } from "@vantiq/ai";
import { getDb, listExplanations, scopeOf, type ExplanationRow } from "@vantiq/db";
import { isMaterial, type Ledger, type Period } from "@vantiq/domain";
import type { Workspace } from "./data";

/** Leaf lines over the materiality threshold, largest first. */
export function materialCategoryIds(ledger: Ledger, periods: Period[]) {
  return ledger
    .tree(periods)
    .filter((r) => !r.hasChildren && isMaterial(r.variance))
    .sort((a, b) => Math.abs(b.variance.delta) - Math.abs(a.variance.delta))
    .map((r) => r.category.id);
}

const demoCache = new Map<string, Map<string, ExplanationRow>>();

/**
 * Explanations for a view. Signed in: what is stored. Demo: rule-based drafts
 * made on the fly for every material line, read-only, so the demo shows the
 * feature without a database or an API key.
 */
export async function explanationsFor(ws: Workspace, periods: Period[]): Promise<Map<string, ExplanationRow>> {
  if (ws.mode === "db") return listExplanations(getDb(), ws.companyId!, periods);
  const key = scopeOf(periods);
  let hit = demoCache.get(key);
  if (!hit) {
    hit = new Map();
    for (const id of materialCategoryIds(ws.ledger, periods)) {
      const d = draftWithRules(buildVarianceContext(ws.ledger, id, periods));
      hit.set(id, {
        categoryId: id,
        text: d.text,
        status: "ai_draft",
        citedTransactionIds: d.citedTransactionIds,
        source: "rules",
        model: null,
        confidence: d.confidence,
        draftedDeltaMinor: ws.ledger.variance({ periods, categoryIds: [id] }).delta,
        draftedAt: new Date(0),
        decidedByName: null,
        decidedAt: null,
      });
    }
    demoCache.set(key, hit);
  }
  return hit;
}

/** True when the variance moved by more than 1% (and $1) since the draft was written. */
export function isStale(row: ExplanationRow, delta: number) {
  const diff = Math.abs(delta - row.draftedDeltaMinor);
  return diff > 100 && diff > Math.abs(row.draftedDeltaMinor) * 0.01;
}

export type ExplanationState = "pending" | "draft" | "confirmed" | "rejected";
export function stateOf(row: ExplanationRow | undefined): ExplanationState {
  if (!row) return "pending";
  if (row.status === "ai_draft") return "draft";
  return row.status === "rejected" ? "rejected" : "confirmed";
}
