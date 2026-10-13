/**
 * Core finance types. All money is stored as integer minor units (cents)
 * so sums are exact. Never store money as floating point dollars.
 */
export type Cents = number;

/** Calendar month in `YYYY-MM` form, e.g. `2026-09`. */
export type Period = string;

export type CategoryKind = "revenue" | "cogs" | "opex" | "other";

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  parentId: string | null;
  /** Sort order among siblings. */
  order: number;
}

export interface Program {
  id: string;
  code: string;
  name: string;
  therapeuticArea: string;
  phase: "Discovery" | "Preclinical" | "Phase 1" | "Phase 2" | "Phase 3";
}

export interface Vendor {
  id: string;
  name: string;
  type: "cro" | "cmo" | "other";
}

export interface Department {
  id: string;
  name: string;
}

/**
 * A ledger transaction already mapped to a Vantiq category.
 * Sign convention: amounts are positive for the natural direction of the
 * category (income received for revenue, spend for costs). Credits/reversals
 * are negative.
 */
export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  categoryId: string;
  amount: Cents;
  vendorId: string | null;
  departmentId: string | null;
  programId: string | null;
  memo: string;
  accountCode: string;
}

export interface BudgetLine {
  period: Period;
  categoryId: string;
  programId: string | null;
  amount: Cents;
}

export interface CashPoint {
  period: Period;
  /** Closing cash balance at month end. */
  balance: Cents;
}
