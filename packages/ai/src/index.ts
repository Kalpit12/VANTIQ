import Anthropic from "@anthropic-ai/sdk";
import type { Ledger, Period } from "@vantiq/domain";
import { buildVarianceContext } from "./context";
import { DEFAULT_MODEL, DraftRejected, draftWithClaude, type MessagesClient } from "./claude";
import { draftWithRules } from "./rules";
import type { Draft } from "./types";

export * from "./context";
export * from "./claude";
export * from "./rules";
export * from "./types";

export interface DraftOptions {
  /** Defaults to a client built from ANTHROPIC_API_KEY; with no key, drafts come from the rules. */
  client?: MessagesClient | null;
  model?: string;
}

export function claudeClient(): MessagesClient | null {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new Anthropic({ apiKey: key, maxRetries: 2, timeout: 60_000 }) : null;
}

/**
 * Drafts the explanation for one variance line. Uses Claude when a key is set
 * and its answer passes validation; otherwise the rule-based draft, so the
 * feature works for free and never shows an ungrounded answer.
 */
export async function draftExplanation(ledger: Ledger, categoryId: string, periods: Period[], opts: DraftOptions = {}): Promise<Draft & { note?: string }> {
  const ctx = buildVarianceContext(ledger, categoryId, periods);
  const client = opts.client === undefined ? claudeClient() : opts.client;
  if (!client) return draftWithRules(ctx);
  try {
    return await draftWithClaude(ctx, { client, model: opts.model ?? process.env.VANTIQ_AI_MODEL ?? DEFAULT_MODEL });
  } catch (e) {
    const note = e instanceof DraftRejected ? e.message : "Claude could not be reached.";
    return { ...draftWithRules(ctx), note };
  }
}
