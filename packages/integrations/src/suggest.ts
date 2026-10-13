import { STANDARD_CATEGORIES } from "@vantiq/domain";

/** Sentinel category for balance sheet and other accounts that stay out of the P&L. */
export const EXCLUDED = "__excluded__";

export interface Suggestion {
  categoryId: string; // a leaf category id, or EXCLUDED
  reason: string;
}

const LEAVES = new Set(STANDARD_CATEGORIES.filter((c) => !STANDARD_CATEGORIES.some((x) => x.parentId === c.id)).map((c) => c.id));

const RULES: { test: RegExp; categoryId: string; reason: string }[] = [
  { test: /\bgrants?\b|sbir|\bnih\b/, categoryId: "rev-grant", reason: "Name mentions a grant" },
  { test: /revenue|collaborat|licens|royalt|milestone (income|revenue)|sales/, categoryId: "rev-collab", reason: "Name mentions revenue or licensing" },
  { test: /\bcro\b|clinical|trial|investigator|site (fees|payments)|patient/, categoryId: "rd-cro", reason: "Name mentions clinical work" },
  { test: /\bcmc\b|\bcmo\b|manufactur|drug (product|substance)|clinical supply|process dev/, categoryId: "rd-cmc", reason: "Name mentions manufacturing" },
  { test: /lab(oratory)? (supplies|consumables)|reagent|consumables|lab supplies/, categoryId: "rd-lab", reason: "Name mentions lab supplies" },
  { test: /consult|regulatory/, categoryId: "rd-consult", reason: "Name mentions consultants" },
  { test: /rent|lease|facilit|utilit|occupancy/, categoryId: "ga-facilities", reason: "Name mentions rent or facilities" },
  { test: /legal|audit|accounting|tax (prep|services)|professional fees|attorney/, categoryId: "ga-professional", reason: "Name mentions professional fees" },
  { test: /software|subscription|saas|\bit\b|computer|hosting|cloud/, categoryId: "ga-software", reason: "Name mentions software or IT" },
];

const PEOPLE = /salar|wage|payroll|benefit|bonus|stock comp|compensation|personnel|headcount|401k|payroll tax/;
const RND = /\br&d\b|\brd\b|research|development|scientific|clinical/;
const BALANCE_SHEET = /\bcash\b|bank|receivable|payable|accrued|accrual|prepaid|deposit|equity|stock(?! comp)|retained|loan|debt|fixed asset|equipment|depreciation reserve|accumulated|inventory|deferred/;

/**
 * Rule-based first guess for a source account. The finance user confirms
 * every mapping; AI suggestions replace these rules in a later milestone.
 * Uses the account number range when the name gives nothing away
 * (1000–3999 balance sheet, 4000s income).
 */
export function suggestCategory(code: string, name: string): Suggestion | null {
  const n = ` ${name.toLowerCase()} `;
  const num = Number(code.replace(/\D/g, "").slice(0, 4));
  if (BALANCE_SHEET.test(n) || (num >= 1000 && num < 4000 && name === "")) {
    return { categoryId: EXCLUDED, reason: "Balance sheet account" };
  }
  if (PEOPLE.test(n)) {
    return RND.test(n) ? { categoryId: "rd-people", reason: "R&D salaries and benefits" } : { categoryId: "ga-people", reason: "Salaries and benefits" };
  }
  for (const r of RULES) if (r.test.test(n) && LEAVES.has(r.categoryId)) return { categoryId: r.categoryId, reason: r.reason };
  if (num >= 1000 && num < 4000) return { categoryId: EXCLUDED, reason: "Account number is in the balance sheet range" };
  if (num >= 4000 && num < 5000) return { categoryId: "rev-collab", reason: "Account number is in the income range" };
  return null;
}
