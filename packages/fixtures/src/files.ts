import type { LedgerData } from "@vantiq/domain";
import { generateSampleCompany } from "./index";

/** The sample company's chart of accounts, as its accounting system names them. */
export const SAMPLE_ACCOUNTS: { code: string; name: string; categoryId: string }[] = [
  { code: "4100", name: "Collaboration revenue", categoryId: "rev-collab" },
  { code: "4200", name: "Grant revenue - NIH SBIR", categoryId: "rev-grant" },
  { code: "6010", name: "R&D salaries and benefits", categoryId: "rd-people" },
  { code: "6110", name: "CRO clinical trial services", categoryId: "rd-cro" },
  { code: "6210", name: "CMC drug product manufacturing", categoryId: "rd-cmc" },
  { code: "6310", name: "Lab supplies and reagents", categoryId: "rd-lab" },
  { code: "6410", name: "Regulatory consulting", categoryId: "rd-consult" },
  { code: "7010", name: "G&A salaries and benefits", categoryId: "ga-people" },
  { code: "7110", name: "Rent and facilities", categoryId: "ga-facilities" },
  { code: "7210", name: "Legal and audit fees", categoryId: "ga-professional" },
  { code: "7310", name: "Software subscriptions", categoryId: "ga-software" },
];

const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => (typeof c === "string" && /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : String(c))).join(",")).join("\n") + "\n";

const money = (cents: number) => (cents / 100).toFixed(2);

/**
 * The sample company exported the way a customer's files look: a general
 * ledger detail report (debit/credit columns, account numbers, project codes),
 * a budget by account and project, and month-end cash balances. Importing these
 * three files must reproduce `generateSampleCompany()` exactly.
 */
export function sampleFiles(data: LedgerData = generateSampleCompany()) {
  const accountName = new Map(SAMPLE_ACCOUNTS.map((a) => [a.code, a.name]));
  const codeFor = new Map(SAMPLE_ACCOUNTS.map((a) => [a.categoryId, a.code]));
  const kind = new Map(data.categories.map((c) => [c.id, c.kind]));
  const vendor = new Map(data.vendors.map((v) => [v.id, v.name]));
  const dept = new Map(data.departments.map((d) => [d.id, d.name]));
  const program = new Map(data.programs.map((p) => [p.id, p.code]));

  const ledger: (string | number)[][] = [["Date", "Account Number", "Account Name", "Debit", "Credit", "Vendor", "Memo", "Department", "Project"]];
  for (const t of [...data.transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    const debitPositive = kind.get(t.categoryId) === "revenue" ? -t.amount : t.amount;
    ledger.push([
      t.date,
      t.accountCode,
      accountName.get(t.accountCode) ?? "",
      debitPositive > 0 ? money(debitPositive) : "",
      debitPositive < 0 ? money(-debitPositive) : "",
      (t.vendorId && vendor.get(t.vendorId)) || "",
      t.memo,
      (t.departmentId && dept.get(t.departmentId)) || "",
      (t.programId && program.get(t.programId)) || "",
    ]);
  }
  const budget: (string | number)[][] = [["Month", "Account", "Account Name", "Project", "Budget"]];
  for (const b of data.budget) {
    const code = codeFor.get(b.categoryId)!;
    budget.push([b.period, code, accountName.get(code)!, (b.programId && program.get(b.programId)) || "", money(b.amount)]);
  }
  const cash: (string | number)[][] = [["Month", "Closing balance"]];
  for (const c of data.cash) cash.push([c.period, money(c.balance)]);
  return { ledgerCsv: csv(ledger), budgetCsv: csv(budget), cashCsv: csv(cash), programs: data.programs };
}
