import type { Cents, Period } from "@vantiq/domain";
import type { RawTable } from "./table";
import { detectDateOrder, parseAmount, parseDate, parsePeriod } from "./values";

export type ImportKind = "ledger" | "budget" | "cash";

export interface FieldSpec {
  key: string;
  label: string;
  required: boolean;
  /** Lowercase header names that usually hold this field, best first. */
  aliases: string[];
  hint?: string;
}

/**
 * Columns each import understands. Ledger amounts are either one signed
 * column (debits positive) or a Debit and a Credit column.
 */
export const FIELDS: Record<ImportKind, FieldSpec[]> = {
  ledger: [
    { key: "date", label: "Date", required: true, aliases: ["date", "transaction date", "posting date", "txn date", "gl date", "posted date"] },
    { key: "accountCode", label: "Account number", required: true, aliases: ["account number", "account code", "account no", "acct no", "account #", "gl account", "account", "acct"] },
    { key: "accountName", label: "Account name", required: false, aliases: ["account name", "account description", "gl account name", "account title"] },
    { key: "amount", label: "Amount", required: false, aliases: ["amount", "net amount", "net", "amount (usd)", "value"], hint: "Debits positive. Or use Debit and Credit." },
    { key: "debit", label: "Debit", required: false, aliases: ["debit", "debits", "dr", "debit amount"] },
    { key: "credit", label: "Credit", required: false, aliases: ["credit", "credits", "cr", "credit amount"] },
    { key: "vendor", label: "Vendor", required: false, aliases: ["vendor", "vendor name", "supplier", "payee", "name", "customer/vendor"] },
    { key: "memo", label: "Memo", required: false, aliases: ["memo", "description", "memo/description", "line description", "narrative"] },
    { key: "department", label: "Department", required: false, aliases: ["department", "dept", "cost center", "cost centre"] },
    { key: "program", label: "Program or project", required: false, aliases: ["program", "project", "class", "program code", "project code"] },
  ],
  budget: [
    { key: "period", label: "Month", required: true, aliases: ["period", "month", "date", "budget month"] },
    { key: "accountCode", label: "Account number", required: true, aliases: ["account number", "account code", "account no", "account", "gl account", "acct"] },
    { key: "accountName", label: "Account name", required: false, aliases: ["account name", "account description"] },
    { key: "program", label: "Program or project", required: false, aliases: ["program", "project", "class"] },
    { key: "amount", label: "Budget amount", required: true, aliases: ["amount", "budget", "budget amount", "value"], hint: "Positive for both spend and income." },
  ],
  cash: [
    { key: "period", label: "Month", required: true, aliases: ["period", "month", "date", "month end"] },
    { key: "balance", label: "Closing cash balance", required: true, aliases: ["balance", "closing balance", "cash", "cash balance", "ending balance", "amount"] },
  ],
};

export type ColumnMap = Record<string, number | null>;

/** Best-guess column for each field from the header names. Each column is used once. */
export function guessColumns(headers: string[], kind: ImportKind): ColumnMap {
  const norm = headers.map((h) => h.toLowerCase().replace(/[_\s]+/g, " ").trim());
  const used = new Set<number>();
  const out: ColumnMap = {};
  // Exact alias matches first, then "header contains alias".
  for (const pass of ["exact", "contains"] as const) {
    for (const f of FIELDS[kind]) {
      if (out[f.key] !== undefined && out[f.key] !== null) continue;
      out[f.key] = null;
      for (const alias of f.aliases) {
        const i = norm.findIndex((h, idx) => !used.has(idx) && (pass === "exact" ? h === alias : alias.length > 3 && h.includes(alias)));
        if (i >= 0) {
          out[f.key] = i;
          used.add(i);
          break;
        }
      }
    }
  }
  if (kind === "ledger" && out.amount !== null && (out.debit !== null || out.credit !== null)) {
    // Prefer the single signed column when both shapes are present.
    out.debit = null;
    out.credit = null;
  }
  return out;
}

export interface RowError {
  row: number; // 1-based data row, matching the spreadsheet row minus the header
  message: string;
}

export interface LedgerRecord {
  row: number;
  date: string;
  accountCode: string;
  accountName: string;
  /** Debit-positive cents, as in the source ledger. */
  amount: Cents;
  vendor: string;
  memo: string;
  department: string;
  program: string;
}

export interface BudgetRecord {
  row: number;
  period: Period;
  accountCode: string;
  accountName: string;
  program: string;
  /** Natural-sign cents: positive for planned spend and planned income. */
  amount: Cents;
}

export interface CashRecord {
  row: number;
  period: Period;
  balance: Cents;
}

export type ImportRecord = LedgerRecord | BudgetRecord | CashRecord;

export interface NormalizeResult<T> {
  records: T[];
  errors: RowError[];
  /** Rows skipped on purpose, such as zero-amount lines or totals. */
  skipped: number;
}

export function missingRequired(kind: ImportKind, map: ColumnMap): string[] {
  const missing = FIELDS[kind].filter((f) => f.required && (map[f.key] ?? null) === null).map((f) => f.label);
  if (kind === "ledger" && map.amount == null && map.debit == null && map.credit == null) missing.push("Amount (or Debit and Credit)");
  return missing;
}

const MAX_ERRORS = 200;

/** QuickBooks and Xero often put "6110 CRO services" or "6110 · CRO services" in one column. */
export function splitAccount(code: string, name: string): { accountCode: string; accountName: string } {
  if (name) return { accountCode: code, accountName: name };
  const m = /^(\d[\d.\-]*)\s*[-–:·]?\s+(.+)$/.exec(code);
  return m ? { accountCode: m[1]!, accountName: m[2]!.trim() } : { accountCode: code, accountName: "" };
}

export function normalize(kind: "ledger", table: RawTable, map: ColumnMap): NormalizeResult<LedgerRecord>;
export function normalize(kind: "budget", table: RawTable, map: ColumnMap): NormalizeResult<BudgetRecord>;
export function normalize(kind: "cash", table: RawTable, map: ColumnMap): NormalizeResult<CashRecord>;
export function normalize(kind: ImportKind, table: RawTable, map: ColumnMap): NormalizeResult<ImportRecord>;
export function normalize(kind: ImportKind, table: RawTable, map: ColumnMap): NormalizeResult<ImportRecord> {
  const missing = missingRequired(kind, map);
  if (missing.length) throw new Error(`Choose a column for: ${missing.join(", ")}.`);
  const get = (row: string[], key: string) => {
    const i = map[key];
    return i === null || i === undefined ? "" : (row[i] ?? "").trim();
  };
  const dateKey = kind === "ledger" ? "date" : "period";
  const order = detectDateOrder(table.rows.map((r) => get(r, dateKey)));
  const records: ImportRecord[] = [];
  const errors: RowError[] = [];
  let skipped = 0;
  const fail = (row: number, message: string) => {
    if (errors.length < MAX_ERRORS) errors.push({ row, message });
  };

  table.rows.forEach((r, idx) => {
    const row = idx + 1;
    if (kind === "ledger") {
      const rawDate = get(r, "date");
      const accountCode = get(r, "accountCode");
      // Exports often end with a "Total" line with no date: skip those quietly.
      if (!rawDate && (!accountCode || /total/i.test(r.join(" ")))) return void skipped++;
      const date = parseDate(rawDate, order);
      if (!date) return fail(row, `Date "${rawDate}" is not a date.`);
      if (!accountCode) return fail(row, "Account number is empty.");
      let amount: Cents | null;
      if (map.amount != null) {
        amount = parseAmount(get(r, "amount"));
        if (amount === null) return fail(row, `Amount "${get(r, "amount")}" is not a number.`);
      } else {
        const dr = get(r, "debit");
        const cr = get(r, "credit");
        const d = dr ? parseAmount(dr) : 0;
        const c = cr ? parseAmount(cr) : 0;
        if (d === null || c === null) return fail(row, `Debit "${dr}" or credit "${cr}" is not a number.`);
        amount = d - c;
      }
      if (amount === 0) return void skipped++;
      records.push({
        row,
        date,
        ...splitAccount(accountCode, get(r, "accountName")),
        amount,
        vendor: get(r, "vendor"),
        memo: get(r, "memo"),
        department: get(r, "department"),
        program: get(r, "program"),
      });
    } else if (kind === "budget") {
      const rawPeriod = get(r, "period");
      const accountCode = get(r, "accountCode");
      if (!rawPeriod && !accountCode) return void skipped++;
      const period = parsePeriod(rawPeriod, order);
      if (!period) return fail(row, `Month "${rawPeriod}" is not a month.`);
      if (!accountCode) return fail(row, "Account number is empty.");
      const amount = parseAmount(get(r, "amount"));
      if (amount === null) return fail(row, `Budget amount "${get(r, "amount")}" is not a number.`);
      records.push({ row, period, ...splitAccount(accountCode, get(r, "accountName")), program: get(r, "program"), amount });
    } else {
      const rawPeriod = get(r, "period");
      if (!rawPeriod) return void skipped++;
      const period = parsePeriod(rawPeriod, order);
      if (!period) return fail(row, `Month "${rawPeriod}" is not a month.`);
      const balance = parseAmount(get(r, "balance"));
      if (balance === null) return fail(row, `Balance "${get(r, "balance")}" is not a number.`);
      records.push({ row, period, balance });
    }
  });
  return { records, errors, skipped };
}
