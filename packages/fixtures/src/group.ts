import {
  inverseTranslate,
  periodOfDate,
  translateAmount,
  type BudgetLine,
  type Cents,
  type Entity,
  type EntityBooks,
  type FxRate,
  type IntercompanyPair,
  type LedgerData,
  type Period,
  type Transaction,
} from "@vantiq/domain";
import { generateSampleCompany } from "./index";

/*
 * Helixa as a group of three entities, for the consolidation screens:
 *  - Helixa Therapeutics, Inc. (US, USD): the parent. Runs HX-101, CMC and G&A.
 *  - Helixa Therapeutics Pty Ltd (Australia, AUD): runs the HX-204 Phase 1
 *    study with Atlas, as many US biotechs do for Australia's R&D incentive.
 *  - Helixa Research Canada ULC (Canada, CAD): the HX-310 discovery team.
 *
 * Each subsidiary's lines are the same lines as `generateSampleCompany()`,
 * booked in its own currency at amounts that translate back to exactly the
 * same dollars (both rates are below 1, so that is always possible). On top
 * of that, two intercompany agreements:
 *  - Canada bills the parent for its research at cost plus 8% each month
 *    (Canada: 4900 income; parent: 6450 expense, tagged HX-310). In August
 *    2026 the parent booked the invoice at July's rate, so the two sides
 *    differ and the pair is flagged.
 *  - The parent charges Australia a $40,000 management fee each month
 *    (parent: 4950 income; Australia: 7450 expense). Always matched.
 * So consolidating the group gives back the single-company sample exactly,
 * plus August's unmatched difference.
 */

export const SAMPLE_ENTITIES: Entity[] = [
  { id: "e-us", code: "HLX-US", name: "Helixa Therapeutics, Inc.", currency: "USD", parent: true },
  { id: "e-au", code: "HLX-AU", name: "Helixa Therapeutics Pty Ltd", currency: "AUD", parent: false },
  { id: "e-ca", code: "HLX-CA", name: "Helixa Research Canada ULC", currency: "CAD", parent: false },
];

/** Accounts only the group uses, on top of SAMPLE_ACCOUNTS. */
export const SAMPLE_GROUP_ACCOUNTS: { code: string; name: string; categoryId: string }[] = [
  { code: "4900", name: "Intercompany research services income", categoryId: "rev-collab" },
  { code: "4950", name: "Intercompany management fee income", categoryId: "rev-collab" },
  { code: "6450", name: "Intercompany research services", categoryId: "rd-consult" },
  { code: "7450", name: "Intercompany management fees", categoryId: "ga-professional" },
];

export const SAMPLE_PAIRS: IntercompanyPair[] = [
  { id: "ic-research", entityId: "e-ca", accountCode: "4900", counterpartyEntityId: "e-us", counterpartyAccountCode: "6450" },
  { id: "ic-mgmt", entityId: "e-us", accountCode: "4950", counterpartyEntityId: "e-au", counterpartyAccountCode: "7450" },
];

/** Month the parent booked Canada's invoice at the previous month's rate. */
export const SAMPLE_IC_MISMATCH: Period = "2026-08";

const MARKUP_BP = 800n; // cost plus 8%
const MGMT_FEE: Cents = 40_000_00;

/** Smooth, deterministic monthly rates (USD per unit), four decimals. */
function sampleRates(periods: Period[]): FxRate[] {
  const out: FxRate[] = [];
  const four = (x: number) => x.toFixed(4);
  periods.forEach((period, i) => {
    out.push({ period, currency: "AUD", average: four(0.6550 + 0.012 * Math.sin(i / 3) - 0.0004 * i), closing: four(0.6550 + 0.012 * Math.sin((i + 0.5) / 3) - 0.0004 * (i + 0.5)) });
    out.push({ period, currency: "CAD", average: four(0.7350 + 0.008 * Math.cos(i / 4) - 0.0002 * i), closing: four(0.7350 + 0.008 * Math.cos((i + 0.5) / 4) - 0.0002 * (i + 0.5)) });
  });
  return out;
}

const entityOfLine = (programId: string | null): string => (programId === "hx204" ? "e-au" : programId === "hx310" ? "e-ca" : "e-us");

export interface SampleGroup {
  base: Omit<LedgerData, "transactions" | "budget" | "cash">;
  entities: Entity[];
  books: EntityBooks[];
  fx: FxRate[];
  pairs: IntercompanyPair[];
}

export function generateSampleGroup(): SampleGroup {
  const company = generateSampleCompany();
  const periods = company.cash.map((c) => c.period);
  const fx = sampleRates(periods);
  const rate = (currency: string, period: Period, kind: "average" | "closing") => fx.find((r) => r.currency === currency && r.period === period)![kind];
  const currencyOf = new Map(SAMPLE_ENTITIES.map((e) => [e.id, e.currency]));
  const books = new Map<string, EntityBooks>(SAMPLE_ENTITIES.map((entity) => [entity.id, { entity, transactions: [], budget: [], cash: [] }]));
  const local = (entityId: string, usd: Cents, period: Period) => {
    const cur = currencyOf.get(entityId)!;
    return cur === "USD" ? usd : inverseTranslate(usd, rate(cur, period, "average"));
  };

  for (const t of company.transactions) {
    const e = entityOfLine(t.programId);
    books.get(e)!.transactions.push({ ...t, amount: local(e, t.amount, periodOfDate(t.date)) });
  }
  const codeFor = new Map([
    ["rev-collab", "4100"], ["rev-grant", "4200"], ["rd-people", "6010"], ["rd-cro", "6110"], ["rd-cmc", "6210"], ["rd-lab", "6310"], ["rd-consult", "6410"],
    ["ga-people", "7010"], ["ga-facilities", "7110"], ["ga-professional", "7210"], ["ga-software", "7310"],
  ]);
  for (const b of company.budget) {
    const e = entityOfLine(b.programId);
    books.get(e)!.budget.push({ ...b, amount: local(e, b.amount, b.period), accountCode: codeFor.get(b.categoryId) });
  }

  const us = books.get("e-us")!;
  const au = books.get("e-au")!;
  const ca = books.get("e-ca")!;
  const ic = (id: string, date: string, categoryId: string, amount: Cents, accountCode: string, vendorId: string, memo: string, programId: string | null, departmentId: string): Transaction => ({
    id, date, categoryId, amount, vendorId, departmentId, programId, memo, accountCode,
  });
  const markup = (cost: Cents) => Number((BigInt(cost) * (10_000n + MARKUP_BP) + 5_000n) / 10_000n);
  const icBudget = (period: Period, categoryId: string, amount: Cents, accountCode: string, programId: string | null): BudgetLine => ({ period, categoryId, programId, amount, accountCode });

  periods.forEach((period, i) => {
    const end = `${period}-28`;
    // Canada's research services: its own costs for the month plus 8%, in CAD.
    const caCost = ca.transactions.filter((t) => periodOfDate(t.date) === period && !t.accountCode.startsWith("4")).reduce((s, t) => s + t.amount, 0);
    const caFee = markup(caCost);
    ca.transactions.push(ic(`ic-ca-${period}`, end, "rev-collab", caFee, "4900", "v-helixa-us", `Research services to Helixa Therapeutics, Inc., ${period}`, "hx310", "d-research"));
    const bookedRate = period === SAMPLE_IC_MISMATCH ? rate("CAD", periods[i - 1]!, "average") : rate("CAD", period, "average");
    us.transactions.push(ic(`ic-us-${period}`, end, "rd-consult", translateAmount(caFee, bookedRate), "6450", "v-helixa-ca", `Helixa Research Canada research services, ${period}`, "hx310", "d-research"));
    // The parent's management fee to Australia, in USD.
    us.transactions.push(ic(`ic-mgmt-us-${period}`, end, "rev-collab", MGMT_FEE, "4950", "v-helixa-au", `Management fee to Helixa Therapeutics Pty Ltd, ${period}`, null, "d-ga"));
    au.transactions.push(ic(`ic-mgmt-au-${period}`, end, "ga-professional", local("e-au", MGMT_FEE, period), "7450", "v-helixa-us", `Management fee from Helixa Therapeutics, Inc., ${period}`, null, "d-ga"));
    // Budgets for both agreements, always matched.
    const caBudgetCost = ca.budget.filter((b) => b.period === period).reduce((s, b) => s + b.amount, 0);
    const caBudgetFee = markup(caBudgetCost);
    ca.budget.push(icBudget(period, "rev-collab", caBudgetFee, "4900", "hx310"));
    us.budget.push(icBudget(period, "rd-consult", translateAmount(caBudgetFee, rate("CAD", period, "average")), "6450", "hx310"));
    us.budget.push(icBudget(period, "rev-collab", MGMT_FEE, "4950", null));
    au.budget.push(icBudget(period, "ga-professional", local("e-au", MGMT_FEE, period), "7450", null));
    // Cash: each subsidiary keeps a working balance; the parent holds the rest.
    const auCash = 3_000_000_00 + 45_000_00 * i;
    const caCash = 1_200_000_00 - 15_000_00 * i;
    au.cash.push({ period, balance: auCash });
    ca.cash.push({ period, balance: caCash });
    const group = company.cash.find((c) => c.period === period)!.balance;
    us.cash.push({ period, balance: group - translateAmount(auCash, rate("AUD", period, "closing")) - translateAmount(caCash, rate("CAD", period, "closing")) });
  });

  const { transactions: _t, budget: _b, cash: _c, ...rest } = company;
  const base = {
    ...rest,
    vendors: [
      ...company.vendors,
      { id: "v-helixa-us", name: "Helixa Therapeutics, Inc.", type: "other" as const },
      { id: "v-helixa-au", name: "Helixa Therapeutics Pty Ltd", type: "other" as const },
      { id: "v-helixa-ca", name: "Helixa Research Canada ULC", type: "other" as const },
    ],
  };
  return { base, entities: SAMPLE_ENTITIES, books: [...books.values()], fx, pairs: SAMPLE_PAIRS };
}
