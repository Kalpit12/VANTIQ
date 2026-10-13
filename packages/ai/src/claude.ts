import Anthropic from "@anthropic-ai/sdk";
import { formatCurrency } from "@vantiq/domain";
import type { VarianceContext } from "./context";
import type { Draft } from "./types";

/**
 * Claude-drafted variance explanations (architecture.md 8). The model sees only
 * this one line's numbers and transactions, must answer in a fixed JSON shape,
 * and must cite transactions from the list it was given; anything else is
 * rejected and the caller falls back to the rule-based draft.
 */

/** Sonnet keeps testing cheap; set VANTIQ_AI_MODEL to change it. */
export const DEFAULT_MODEL = "claude-sonnet-5-5";

const SYSTEM = `You are a senior biotech FP&A analyst writing the explanation a CFO reads beside one budget variance.

Write one to three plain sentences that say WHY the line is over or under budget: which program, vendor and event drove it, and whether it looks like timing (spend moving between months) or a real change in cost. Lead with the cause, not the numbers. Use the dollar amounts given; never invent figures, vendors or events that are not in the data. If the data does not show a clear cause, say what it does show and keep confidence low.

Cite the transactions your explanation relies on by their id, at least one and at most five, only from the transactions provided.`;

const SCHEMA = {
  type: "object",
  properties: {
    explanation: { type: "string", description: "One to three sentences." },
    cited_transaction_ids: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
  required: ["explanation", "cited_transaction_ids", "confidence"],
  additionalProperties: false,
} as const;

/** The slice of the SDK used here, so tests can pass a fake. */
export interface MessagesClient {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
}

export class DraftRejected extends Error {}

const usd = (c: number) => formatCurrency(c);

/** The variance as a compact JSON document for the prompt. */
export function promptPayload(ctx: VarianceContext) {
  return {
    line: `${ctx.parent ? `${ctx.parent} › ` : ""}${ctx.category}`,
    kind: ctx.kind,
    period: ctx.periodLabel,
    actual: usd(ctx.variance.actual),
    budget: usd(ctx.variance.comparison),
    variance: usd(ctx.variance.delta),
    variance_pct: ctx.variance.deltaPct === null ? null : `${(ctx.variance.deltaPct * 100).toFixed(1)}%`,
    favorable: ctx.variance.favorable,
    prior_months: ctx.prior.map((p) => ({ month: p.period, actual: usd(p.actual), budget: usd(p.budget) })),
    by_program: ctx.programs.map((p) => ({ program: p.program, actual: usd(p.variance.actual), budget: usd(p.variance.comparison), variance: usd(p.variance.delta) })),
    transactions: ctx.transactions.map((t) => ({ id: t.id, date: t.date, vendor: t.vendor, program: t.program, memo: t.memo, amount: usd(t.amount), unusual_for_this_line: t.unusual })),
  };
}

export async function draftWithClaude(ctx: VarianceContext, opts: { client: MessagesClient; model?: string }): Promise<Draft> {
  const model = opts.model ?? DEFAULT_MODEL;
  const res = await opts.client.messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: "user", content: `Explain this variance.\n\n${JSON.stringify(promptPayload(ctx), null, 1)}` }],
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
  });
  if (res.stop_reason === "refusal") throw new DraftRejected("Claude declined to draft this explanation.");
  if (res.stop_reason === "max_tokens") throw new DraftRejected("Claude's draft was cut off.");
  const text = res.content.find((b) => b.type === "text")?.text;
  if (!text) throw new DraftRejected("Claude returned no text.");
  let out: { explanation?: unknown; cited_transaction_ids?: unknown; confidence?: unknown };
  try {
    out = JSON.parse(text);
  } catch {
    throw new DraftRejected("Claude's draft was not valid JSON.");
  }
  const explanation = typeof out.explanation === "string" ? out.explanation.trim() : "";
  const cited = Array.isArray(out.cited_transaction_ids) ? out.cited_transaction_ids.filter((x): x is string => typeof x === "string") : [];
  const known = new Set(ctx.transactions.map((t) => t.id));
  // Citation validity must be 100%: one unknown id and the whole draft is discarded.
  if (!explanation || explanation.length > 700) throw new DraftRejected("Claude's draft was empty or too long.");
  if (!cited.length || cited.some((id) => !known.has(id))) throw new DraftRejected("Claude cited transactions that are not behind this number.");
  const confidence = out.confidence === "high" || out.confidence === "medium" ? out.confidence : "low";
  return { text: explanation, citedTransactionIds: [...new Set(cited)].slice(0, 5), confidence, source: "claude", model };
}
