import { formatCompactCurrency } from "@vantiq/domain";
import type { ContextTransaction, ProgramSplit, VarianceContext } from "./context";
import type { Draft } from "./types";

/**
 * A plain, deterministic draft for when no Claude API key is set (free to run)
 * or Claude's answer failed validation. It names the program or programs that
 * drove the variance and the standout transactions behind each, and cites them.
 */
export function draftWithRules(ctx: VarianceContext): Draft {
  const { variance } = ctx;
  const income = ctx.kind === "revenue";
  // Programs pushing the line the same way as the total, until they cover most of it.
  const drivers: ProgramSplit[] = [];
  let covered = 0;
  for (const p of ctx.programs) {
    if (Math.sign(p.variance.delta) !== Math.sign(variance.delta) || p.variance.delta === 0) continue;
    drivers.push(p);
    covered += p.variance.delta;
    if (drivers.length === 2 || Math.abs(covered) >= Math.abs(variance.delta) * 0.6) break;
  }
  // The biggest opposite move is worth a mention: it explains why the total is smaller than the driver.
  const offset = ctx.programs.find((p) => Math.sign(p.variance.delta) === -Math.sign(variance.delta) && Math.abs(p.variance.delta) >= Math.abs(variance.delta) * 0.2);

  if (ctx.transactions.length === 0) {
    const what = income ? "income" : "spend";
    return {
      text: `Nothing was recorded on ${ctx.category} in ${ctx.periodLabel} against a ${formatCompactCurrency(variance.comparison)} budget. The ledger has no entries to explain it; check whether the ${what} is late or the budget assumed something that moved.`,
      citedTransactionIds: [],
      confidence: "low",
      source: "rules",
    };
  }
  const cited: string[] = [];
  const sentences: string[] = [];
  const dir = (d: number) => (d > 0 ? (income ? "ahead of" : "over") : income ? "behind" : "under");
  for (const p of drivers.length ? drivers : []) sentences.push(sentenceFor(ctx, p, dir(p.variance.delta), cited));
  if (offset) sentences.push(sentenceFor(ctx, offset, dir(offset.variance.delta), cited, true));
  if (!sentences.length) {
    const top = ctx.transactions.slice(0, 2);
    cited.push(...top.map((t) => t.id));
    sentences.push(`${ctx.category} is ${formatCompactCurrency(Math.abs(variance.delta))} ${dir(variance.delta)} budget in ${ctx.periodLabel}${top[0] ? `; the largest entry is ${describe(top[0])}` : ""}.`);
  }
  return { text: sentences.join(" "), citedTransactionIds: cited, confidence: drivers.length ? "medium" : "low", source: "rules" };
}

function sentenceFor(ctx: VarianceContext, p: ProgramSplit, dir: string, cited: string[], offset = false): string {
  const who = p.programId ? p.program : ctx.category;
  const amount = formatCompactCurrency(Math.abs(p.variance.delta));
  const mine = ctx.transactions.filter((t) => (p.programId ? t.program === p.program : !t.program));
  // Standout entries in the direction of the move: rare kinds of entry first, then the largest.
  const sameWay = mine.filter((t) => Math.sign(t.amount) === Math.sign(p.variance.delta) || (p.variance.delta < 0 && t.amount < 0));
  // Rare entries tell the story; with none, the single largest entry stands in.
  const unusual = sameWay.filter((t) => t.unusual).slice(0, 2);
  const pick = unusual.length ? unusual : sameWay.slice(0, 1);
  for (const t of pick) if (!cited.includes(t.id)) cited.push(t.id);
  const lead = offset ? `Partly offset by ${who}, ${amount} ${dir} budget` : `${who} ran ${amount} ${dir} budget${p.programId ? ` on ${ctx.category}` : ""}`;
  if (!pick.length) return `${lead}.`;
  const vendor = pick[0]!.vendor;
  const notes = [...new Set(pick.map((t) => t.memo))].slice(0, 2).join("; ");
  return `${lead}${vendor ? `, mainly ${vendor}` : ""} (${notes}).`;
}

const describe = (t: ContextTransaction) => `${t.vendor || "an entry"} for ${formatCompactCurrency(Math.abs(t.amount))} (${t.memo})`;
