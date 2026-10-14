import {
  STANDARD_CATEGORIES,
  addMonths,
  periodRange,
  type BudgetLine,
  type CashPoint,
  type Category,
  type Cents,
  type LedgerData,
  type Period,
  type Program,
  type Transaction,
  type Vendor,
} from "@vantiq/domain";

/**
 * Synthetic sample company for development, demos and tests.
 * "Helixa Therapeutics" is fictional: a ~120-person clinical-stage biotech
 * with three R&D programs. The data is deterministic (seeded) so tests and
 * screenshots are stable. Scripted events give the variance screens something
 * real to explain.
 */

import { SAMPLE_FIRST_PERIOD, SAMPLE_LAST_PERIOD } from "./periods";
export { SAMPLE_FIRST_PERIOD, SAMPLE_LAST_PERIOD };

const categories: Category[] = STANDARD_CATEGORIES;

const programs: Program[] = [
  { id: "hx101", code: "HX-101", name: "HX-101 (solid tumors)", therapeuticArea: "Oncology", phase: "Phase 2" },
  { id: "hx204", code: "HX-204", name: "HX-204 (lupus)", therapeuticArea: "Immunology", phase: "Phase 1" },
  { id: "hx310", code: "HX-310", name: "HX-310 (discovery)", therapeuticArea: "Oncology", phase: "Discovery" },
];

const vendors: Vendor[] = [
  { id: "v-meridian", name: "Meridian Clinical Research", type: "cro" },
  { id: "v-atlas", name: "Atlas CRO", type: "cro" },
  { id: "v-kestrel", name: "Kestrel Biologics", type: "cmo" },
  { id: "v-labsource", name: "LabSource Supply", type: "other" },
  { id: "v-bioreag", name: "BioReagents Direct", type: "other" },
  { id: "v-strata", name: "Strata Regulatory Consulting", type: "other" },
  { id: "v-harbor", name: "Harbor Legal LLP", type: "other" },
  { id: "v-clearline", name: "Clearline Audit", type: "other" },
  { id: "v-pier9", name: "Pier 9 Properties", type: "other" },
  { id: "v-cloudstack", name: "Cloudstack Software", type: "other" },
  { id: "v-payroll", name: "Payroll", type: "other" },
  { id: "v-nih", name: "NIH (SBIR grant)", type: "other" },
  { id: "v-novagen", name: "Novagen Pharma (partner)", type: "other" },
];

const departments = [
  { id: "d-clinical", name: "Clinical operations" },
  { id: "d-research", name: "Research" },
  { id: "d-cmc", name: "CMC" },
  { id: "d-ga", name: "Finance and admin" },
];

interface LinePlan {
  categoryId: string;
  programId: string | null;
  departmentId: string;
  accountCode: string;
  /** Monthly budget in dollars at the first period. */
  base: number;
  /** Monthly growth of the budget. */
  growth: number;
  vendors: string[];
  memo: string;
  /** Typical actual-vs-budget noise (fraction). */
  noise: number;
}

const lines: LinePlan[] = [
  // HX-101: Phase 2 oncology trial run by Meridian
  { categoryId: "rd-cro", programId: "hx101", departmentId: "d-clinical", accountCode: "6110", base: 1_150_000, growth: 0.012, vendors: ["v-meridian"], memo: "HX-101-201 clinical services", noise: 0.05 },
  { categoryId: "rd-cmc", programId: "hx101", departmentId: "d-cmc", accountCode: "6210", base: 420_000, growth: 0.005, vendors: ["v-kestrel"], memo: "HX-101 drug product manufacturing", noise: 0.08 },
  { categoryId: "rd-people", programId: "hx101", departmentId: "d-clinical", accountCode: "6010", base: 380_000, growth: 0.006, vendors: ["v-payroll"], memo: "Salaries and benefits", noise: 0.02 },
  { categoryId: "rd-consult", programId: "hx101", departmentId: "d-clinical", accountCode: "6410", base: 60_000, growth: 0, vendors: ["v-strata"], memo: "Regulatory consulting", noise: 0.15 },
  // HX-204: Phase 1 immunology study run by Atlas
  { categoryId: "rd-cro", programId: "hx204", departmentId: "d-clinical", accountCode: "6110", base: 520_000, growth: 0.015, vendors: ["v-atlas"], memo: "HX-204-101 clinical services", noise: 0.05 },
  { categoryId: "rd-cmc", programId: "hx204", departmentId: "d-cmc", accountCode: "6210", base: 160_000, growth: 0.004, vendors: ["v-kestrel"], memo: "HX-204 clinical supply", noise: 0.08 },
  { categoryId: "rd-people", programId: "hx204", departmentId: "d-clinical", accountCode: "6010", base: 240_000, growth: 0.006, vendors: ["v-payroll"], memo: "Salaries and benefits", noise: 0.02 },
  // HX-310: discovery research
  { categoryId: "rd-people", programId: "hx310", departmentId: "d-research", accountCode: "6010", base: 310_000, growth: 0.006, vendors: ["v-payroll"], memo: "Salaries and benefits", noise: 0.02 },
  { categoryId: "rd-lab", programId: "hx310", departmentId: "d-research", accountCode: "6310", base: 140_000, growth: 0.004, vendors: ["v-labsource", "v-bioreag"], memo: "Reagents and consumables", noise: 0.12 },
  // Shared R&D not assigned to a program
  { categoryId: "rd-lab", programId: null, departmentId: "d-research", accountCode: "6310", base: 45_000, growth: 0, vendors: ["v-labsource"], memo: "Shared lab consumables", noise: 0.15 },
  // G&A
  { categoryId: "ga-people", programId: null, departmentId: "d-ga", accountCode: "7010", base: 290_000, growth: 0.005, vendors: ["v-payroll"], memo: "Salaries and benefits", noise: 0.02 },
  { categoryId: "ga-facilities", programId: null, departmentId: "d-ga", accountCode: "7110", base: 185_000, growth: 0, vendors: ["v-pier9"], memo: "Lease and facilities", noise: 0.01 },
  { categoryId: "ga-professional", programId: null, departmentId: "d-ga", accountCode: "7210", base: 95_000, growth: 0, vendors: ["v-harbor", "v-clearline"], memo: "Legal and audit", noise: 0.2 },
  { categoryId: "ga-software", programId: null, departmentId: "d-ga", accountCode: "7310", base: 38_000, growth: 0.01, vendors: ["v-cloudstack"], memo: "Subscriptions", noise: 0.05 },
];

/** Scripted one-off differences between actual and budget (dollars). */
const events: { period: Period; categoryId: string; programId: string | null; extra: number; vendorId: string; memo: string }[] = [
  // Enrollment accelerated in HX-101 after two new sites activated: CRO costs run ahead of plan.
  { period: "2026-07", categoryId: "rd-cro", programId: "hx101", extra: 310_000, vendorId: "v-meridian", memo: "Change order 4: two additional sites, accelerated enrollment" },
  { period: "2026-08", categoryId: "rd-cro", programId: "hx101", extra: 385_000, vendorId: "v-meridian", memo: "Change order 4: patient visits above plan" },
  { period: "2026-09", categoryId: "rd-cro", programId: "hx101", extra: 420_000, vendorId: "v-meridian", memo: "Change order 4: patient visits above plan" },
  // Unplanned engineering batch at the CMO.
  { period: "2026-08", categoryId: "rd-cmc", programId: "hx101", extra: 640_000, vendorId: "v-kestrel", memo: "Engineering batch EB-07 (process change)" },
  // HX-204 site activation delayed: spend below plan.
  { period: "2026-07", categoryId: "rd-cro", programId: "hx204", extra: -240_000, vendorId: "v-atlas", memo: "Credit: site start-up fees deferred" },
  { period: "2026-08", categoryId: "rd-cro", programId: "hx204", extra: -265_000, vendorId: "v-atlas", memo: "Credit: site start-up fees deferred" },
  { period: "2026-09", categoryId: "rd-cro", programId: "hx204", extra: -120_000, vendorId: "v-atlas", memo: "Credit: site start-up fees deferred" },
  // Annual audit and a financing-related legal bill.
  { period: "2026-03", categoryId: "ga-professional", programId: null, extra: 180_000, vendorId: "v-clearline", memo: "FY2025 annual audit" },
  { period: "2025-11", categoryId: "ga-professional", programId: null, extra: 260_000, vendorId: "v-harbor", memo: "Series B financing legal fees" },
  { period: "2026-09", categoryId: "ga-professional", programId: null, extra: 95_000, vendorId: "v-harbor", memo: "Licensing term sheet review" },
];

/** Income: quarterly grant draws and partner milestones (dollars). */
const income: { period: Period; categoryId: string; budget: number; actual: number; vendorId: string; memo: string }[] = [
  ...quarterly("2024-12", "2026-09", (p) => ({ period: p, categoryId: "rev-grant", budget: 450_000, actual: 450_000, vendorId: "v-nih", memo: "SBIR Phase II grant drawdown" })),
  { period: "2025-06", categoryId: "rev-collab", budget: 2_000_000, actual: 2_000_000, vendorId: "v-novagen", memo: "Milestone: IND clearance HX-204" },
  { period: "2026-06", categoryId: "rev-collab", budget: 3_000_000, actual: 0, vendorId: "v-novagen", memo: "Milestone: first patient dosed (expected)" },
  { period: "2026-08", categoryId: "rev-collab", budget: 0, actual: 3_000_000, vendorId: "v-novagen", memo: "Milestone: first patient dosed (received late)" },
];

function quarterly<T>(from: Period, to: Period, f: (p: Period) => T): T[] {
  const out: T[] = [];
  for (let p = from; p <= to; p = addMonths(p, 3)) out.push(f(p));
  return out;
}

const STARTING_CASH = 74_000_000;
const FINANCING: Record<Period, number> = { "2025-11": 85_000_000 };

/** Small seeded PRNG (mulberry32) so the sample data never changes between runs. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cents = (dollars: number): Cents => Math.round(dollars * 100);

export function generateSampleCompany(seed = 7): LedgerData {
  const rand = rng(seed);
  const periods = periodRange(SAMPLE_FIRST_PERIOD, SAMPLE_LAST_PERIOD);
  const transactions: Transaction[] = [];
  const budget: BudgetLine[] = [];
  let txn = 0;

  const addTxn = (period: Period, line: Pick<LinePlan, "categoryId" | "programId" | "departmentId" | "accountCode">, amount: Cents, vendorId: string | null, memo: string, day: number) => {
    txn += 1;
    transactions.push({
      id: `t${String(txn).padStart(5, "0")}`,
      date: `${period}-${String(day).padStart(2, "0")}`,
      categoryId: line.categoryId,
      amount,
      vendorId,
      departmentId: line.departmentId,
      programId: line.programId,
      memo,
      accountCode: line.accountCode,
    });
  };

  periods.forEach((period, i) => {
    for (const line of lines) {
      const planned = line.base * Math.pow(1 + line.growth, i);
      budget.push({ period, categoryId: line.categoryId, programId: line.programId, amount: cents(planned) });
      const actualTotal = cents(planned * (1 + (rand() * 2 - 1) * line.noise));
      // Split into 1-4 invoices so drill-down looks like a real ledger.
      const parts = line.vendors[0] === "v-payroll" ? 2 : 1 + Math.floor(rand() * 4);
      let remaining = actualTotal;
      for (let k = 0; k < parts; k++) {
        const share = k === parts - 1 ? remaining : Math.round((actualTotal / parts) * (0.7 + rand() * 0.6));
        remaining -= share;
        const vendor = line.vendors[Math.floor(rand() * line.vendors.length)] ?? null;
        const memo = line.vendors[0] === "v-payroll" ? `${line.memo} (${k === 0 ? "1st" : "2nd"} half)` : `${line.memo}, invoice ${1000 + txn}`;
        addTxn(period, line, share, vendor, memo, line.vendors[0] === "v-payroll" ? (k === 0 ? 15 : 28) : 3 + Math.floor(rand() * 25));
      }
    }
    for (const e of events.filter((ev) => ev.period === period)) {
      const line = lines.find((l) => l.categoryId === e.categoryId && l.programId === e.programId)!;
      addTxn(period, line, cents(e.extra), e.vendorId, e.memo, 20);
    }
    for (const inc of income.filter((x) => x.period === period)) {
      const line = { categoryId: inc.categoryId, programId: null, departmentId: "d-ga", accountCode: inc.categoryId === "rev-grant" ? "4200" : "4100" };
      if (inc.budget) budget.push({ period, categoryId: inc.categoryId, programId: null, amount: cents(inc.budget) });
      if (inc.actual) addTxn(period, line, cents(inc.actual), inc.vendorId, inc.memo, 25);
    }
  });

  // Cash: opening balance + net income + financing (a simplification of the cash flow statement).
  const cash: CashPoint[] = [];
  let balance = cents(STARTING_CASH);
  for (const period of periods) {
    const net = transactions
      .filter((t) => t.date.startsWith(period))
      .reduce((s, t) => s + (t.categoryId.startsWith("rev") ? t.amount : -t.amount), 0);
    balance += net + cents(FINANCING[period] ?? 0);
    cash.push({ period, balance });
  }

  return {
    companyName: "Helixa Therapeutics",
    currency: "USD",
    categories,
    programs,
    vendors,
    departments,
    transactions,
    budget,
    cash,
  };
}
export * from "./files";
export * from "./trials";
export * from "./close";
