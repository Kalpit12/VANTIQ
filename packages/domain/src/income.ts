import { addMonths, periodRange } from "./period";
import type { LedgerData } from "./ledger";
import type { Cents, Period } from "./types";

/**
 * Grants, partner milestones and licensing income (architecture.md Phase 2).
 * Each source has a schedule of expected receipts with a probability. Actual
 * receipts come from the ledger: income from the source's counterparty in its
 * revenue line, matched to the schedule in order, so nothing is entered twice.
 */

export type IncomeKind = "grant" | "milestone" | "license";

export const INCOME_KINDS: { kind: IncomeKind; label: string; categoryId: string }[] = [
  { kind: "grant", label: "Grant", categoryId: "rev-grant" },
  { kind: "milestone", label: "Partner milestones", categoryId: "rev-collab" },
  { kind: "license", label: "Licensing", categoryId: "rev-collab" },
];

export interface ExpectedReceipt {
  id: string;
  label: string;
  /** Month the money is expected. */
  expected: Period;
  amount: Cents;
  /** Chance it arrives, 0..1. Grants already awarded are usually near 1; clinical milestones much lower. */
  probability: number;
}

export interface IncomeSource {
  id: string;
  name: string;
  kind: IncomeKind;
  /** Who pays, matched to ledger vendors by name. */
  counterparty: string;
  programCode: string | null;
  /** Total awarded, for grants: what is left to draw is award minus received. */
  award: Cents | null;
  receipts: ExpectedReceipt[];
}

export type ReceiptStatus = "received" | "overdue" | "expected";

export interface ReceiptRow extends ExpectedReceipt {
  status: ReceiptStatus;
  /** When it was received, from the ledger. */
  receivedOn: string | null;
  receivedAmount: Cents | null;
  /** Months between expected and received (positive = late). */
  monthsLate: number | null;
  /** amount × probability, or the amount received. */
  weighted: Cents;
}

const monthsBetween = (a: Period, b: Period) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

/** Ledger income from the source's counterparty in its revenue line, oldest first. */
export function receivedFor(data: Pick<LedgerData, "transactions" | "vendors">, source: Pick<IncomeSource, "counterparty" | "kind">) {
  const name = source.counterparty.trim().toLowerCase();
  const ids = new Set(data.vendors.filter((v) => v.name.trim().toLowerCase() === name).map((v) => v.id));
  const categoryId = INCOME_KINDS.find((k) => k.kind === source.kind)!.categoryId;
  return data.transactions
    .filter((t) => t.categoryId === categoryId && t.vendorId !== null && ids.has(t.vendorId) && t.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((t) => ({ id: t.id, date: t.date, amount: t.amount }));
}

/**
 * Where each expected receipt stands at the end of `asOf`. Receipts are taken
 * in expected order; each claims the first unclaimed ledger receipt within 2%
 * of its amount, dated no earlier than two months before it was expected and
 * no later than `asOf`. Unmatched receipts expected before `asOf` are overdue.
 */
export function scheduleStatus(source: IncomeSource, received: { id: string; date: string; amount: Cents }[], asOf: Period): ReceiptRow[] {
  const used = new Set<string>();
  const ordered = [...source.receipts].sort((a, b) => a.expected.localeCompare(b.expected) || a.id.localeCompare(b.id));
  const rows = ordered.map((r): ReceiptRow => {
    const hit = received.find(
      (t) => !used.has(t.id) && t.date.slice(0, 7) <= asOf && t.date.slice(0, 7) >= addMonths(r.expected, -2) && Math.abs(t.amount - r.amount) <= Math.abs(r.amount) * 0.02,
    );
    if (hit) {
      used.add(hit.id);
      return { ...r, status: "received", receivedOn: hit.date, receivedAmount: hit.amount, monthsLate: monthsBetween(r.expected, hit.date.slice(0, 7)), weighted: hit.amount };
    }
    return {
      ...r,
      status: r.expected < asOf ? "overdue" : "expected",
      receivedOn: null,
      receivedAmount: null,
      monthsLate: null,
      weighted: Math.round(r.amount * r.probability),
    };
  });
  return rows;
}

export interface IncomeSummary {
  receivedThisYear: Cents;
  /** Expected (not yet received) in the 12 months after `asOf`, risk-weighted and in full. */
  next12Weighted: Cents;
  next12Full: Cents;
  overdue: Cents;
  overdueCount: number;
  /** Grant funds awarded but not yet drawn. */
  grantRemaining: Cents;
  /** Month by month from `from` to `to`: received, and expected (weighted and full). */
  byMonth: { period: Period; received: Cents; weighted: Cents; full: Cents }[];
}

export function incomeSummary(rows: { source: IncomeSource; receipts: ReceiptRow[] }[], asOf: Period, from: Period, to: Period): IncomeSummary {
  const year = asOf.slice(0, 4);
  const horizon = addMonths(asOf, 12);
  const all = rows.flatMap((r) => r.receipts);
  const open = all.filter((r) => r.status !== "received");
  const months = periodRange(from, to);
  return {
    receivedThisYear: all.filter((r) => r.receivedOn?.startsWith(year)).reduce((s, r) => s + r.receivedAmount!, 0),
    next12Weighted: open.filter((r) => r.expected > asOf && r.expected <= horizon).reduce((s, r) => s + r.weighted, 0),
    next12Full: open.filter((r) => r.expected > asOf && r.expected <= horizon).reduce((s, r) => s + r.amount, 0),
    overdue: open.filter((r) => r.status === "overdue").reduce((s, r) => s + r.amount, 0),
    overdueCount: open.filter((r) => r.status === "overdue").length,
    grantRemaining: rows
      .filter((r) => r.source.kind === "grant" && r.source.award !== null)
      .reduce((s, r) => s + Math.max(0, r.source.award! - r.receipts.reduce((x, c) => x + (c.receivedAmount ?? 0), 0)), 0),
    byMonth: months.map((p) => ({
      period: p,
      received: all.filter((r) => r.receivedOn?.slice(0, 7) === p).reduce((s, r) => s + r.receivedAmount!, 0),
      weighted: open.filter((r) => r.expected === p).reduce((s, r) => s + r.weighted, 0),
      full: open.filter((r) => r.expected === p).reduce((s, r) => s + r.amount, 0),
    })),
  };
}
