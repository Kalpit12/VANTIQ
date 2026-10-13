export interface Draft {
  /** One to three sentences. */
  text: string;
  citedTransactionIds: string[];
  confidence: "low" | "medium" | "high";
  /** "claude" for a Claude draft, "rules" for the built-in fallback. */
  source: "claude" | "rules";
  model?: string;
}

/** Recorded on every explanation (architecture.md 8.2). Bump when the prompt or rules change. */
export const PROMPT_VERSION = "variance-explain/1";
