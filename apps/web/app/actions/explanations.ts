"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { draftExplanation, PROMPT_VERSION } from "@vantiq/ai";
import { can, decideExplanation, saveDrafts, type DraftInput } from "@vantiq/db";
import { getWorkspace, requireMember } from "@/lib/data";
import { materialCategoryIds } from "@/lib/explanations";
import { resolveView } from "@/lib/view";

/** Only same-site paths, so a crafted form can't bounce users elsewhere. */
const backTo = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "/variances");
  return s.startsWith("/") && !s.startsWith("//") ? s : "/variances";
};

async function context(form: FormData) {
  const member = await requireMember(can.explain);
  const ws = await getWorkspace();
  const view = resolveView({ period: String(form.get("period") ?? ""), mode: String(form.get("mode") ?? "") }, ws.ledger);
  return { ...member, ws, view };
}

/** Runs `fn` over `items`, `limit` at a time. */
async function pooled<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

/**
 * Drafts explanations: every material line in the view that nobody has
 * confirmed yet, or one line again when `categoryId` is given.
 */
export async function draftExplanationsAction(form: FormData) {
  const { db, companyId, userId, ws, view } = await context(form);
  const one = form.get("categoryId") ? String(form.get("categoryId")) : null;
  const ids = one ? [one] : materialCategoryIds(ws.ledger, view.periods);
  const drafts = await pooled(ids, 4, async (categoryId): Promise<DraftInput> => {
    const d = await draftExplanation(ws.ledger, categoryId, view.periods);
    return {
      categoryId,
      text: d.text,
      citedTransactionIds: d.citedTransactionIds,
      source: d.source,
      model: d.model,
      confidence: d.confidence,
      promptVersion: PROMPT_VERSION,
      deltaMinor: ws.ledger.variance({ periods: view.periods, categoryIds: [categoryId] }).delta,
    };
  });
  await saveDrafts(db, companyId, userId, view.periods, drafts, Boolean(one));
  revalidatePath("/", "layout");
  redirect(backTo(form.get("back")));
}

export async function decideExplanationAction(form: FormData) {
  const { db, companyId, userId, view } = await context(form);
  const action = String(form.get("action"));
  const categoryId = String(form.get("categoryId"));
  const back = backTo(form.get("back"));
  try {
    if (action === "edit") await decideExplanation(db, companyId, userId, view.periods, categoryId, { action, text: String(form.get("text") ?? "") });
    else if (action === "accept" || action === "reject") await decideExplanation(db, companyId, userId, view.periods, categoryId, { action });
  } catch (e) {
    redirect(`${back}${back.includes("?") ? "&" : "?"}xerr=${encodeURIComponent(e instanceof Error ? e.message : "Could not save.")}`);
  }
  revalidatePath("/", "layout");
  redirect(back);
}
