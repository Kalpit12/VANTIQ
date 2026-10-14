import { addMonths, periodRange, type ChangeOrder, type ContractItem, type Period, type Trial, type TrialContract } from "@vantiq/domain";
import { SAMPLE_FIRST_PERIOD, SAMPLE_LAST_PERIOD } from "./periods";

/**
 * Sample clinical trials for Helixa, matched to the CRO invoices in the sample
 * ledger. Activity is set so the work done each month roughly tracks what the
 * CRO billed, with two stories for the accrual screens:
 * - HX-101-201 (Meridian): change order 4 added sites and visits from July;
 *   visits ran ahead of billing, so there is unbilled work to accrue.
 * - HX-204-101 (Atlas): Atlas deferred start-up fees from July (credits in
 *   the ledger) while the work continued, and its September report is late.
 */
export type SampleTrial = Trial;

interface Plan {
  code: string;
  name: string;
  programCode: string;
  croName: string;
  phase: string;
  months: number;
  /** Monthly CRO billing plan in the ledger, in dollars. */
  base: number;
  growth: number;
  /** Extra work done in a month, in dollars, on top of the plan. */
  extra: Record<Period, number>;
  /** Work done relative to the plan. */
  pace: number;
  items: ContractItem[];
  changeOrders: ChangeOrder[];
  sitesPerMonth: (i: number) => number;
  patientsPerMonth: (i: number) => number;
  lastReport: Period;
}

const $ = (d: number) => Math.round(d * 100);

const PLANS: Plan[] = [
  {
    code: "HX-101-201",
    name: "Phase 2 study of HX-101 in advanced solid tumors",
    programCode: "HX-101",
    croName: "Meridian Clinical Research",
    phase: "Phase 2",
    months: 36,
    base: 1_150_000,
    growth: 0.012,
    extra: { "2026-07": 380_000, "2026-08": 470_000, "2026-09": 560_000 },
    pace: 1.01,
    items: [
      { driver: "monthly", unitCost: $(300_000), units: 36 },
      { driver: "site", unitCost: $(60_000), units: 40 },
      { driver: "patient", unitCost: $(18_000), units: 260 },
      { driver: "visit", unitCost: $(3_200), units: 6_000 },
    ],
    changeOrders: [
      {
        number: 4,
        effective: "2026-07",
        description: "Two additional sites and accelerated enrollment",
        items: [
          { driver: "site", unitCost: $(70_000), units: 2 },
          { driver: "patient", unitCost: $(19_500), units: 60 },
          { driver: "visit", unitCost: $(3_400), units: 900 },
        ],
      },
    ],
    sitesPerMonth: (i) => (i < 18 ? 2 : i < 22 ? 1 : i < 24 ? 1 : 0),
    patientsPerMonth: (i) => (i < 2 ? 0 : i < 21 ? 7 : 12),
    lastReport: "2026-09",
  },
  {
    code: "HX-204-101",
    name: "Phase 1 dose-escalation study of HX-204 in lupus",
    programCode: "HX-204",
    croName: "Atlas CRO",
    phase: "Phase 1",
    months: 30,
    base: 520_000,
    growth: 0.015,
    extra: {},
    pace: 1.0,
    items: [
      { driver: "monthly", unitCost: $(120_000), units: 30 },
      { driver: "site", unitCost: $(40_000), units: 12 },
      { driver: "patient", unitCost: $(30_000), units: 72 },
      { driver: "visit", unitCost: $(5_000), units: 2_400 },
    ],
    changeOrders: [],
    sitesPerMonth: (i) => (i < 6 ? 2 : 0),
    patientsPerMonth: (i) => (i < 3 ? 0 : i < 21 ? 3 : 2),
    lastReport: "2026-08",
  },
];

export function generateSampleTrials(): SampleTrial[] {
  return PLANS.map((p) => {
    const start = SAMPLE_FIRST_PERIOD;
    const contract: TrialContract = { start, items: p.items, changeOrders: p.changeOrders };
    const monthly = p.items.find((i) => i.driver === "monthly")!.unitCost;
    const rate = (d: ContractItem["driver"]) => p.items.find((i) => i.driver === d)!.unitCost;
    const activity: Trial["activity"] = periodRange(start, p.lastReport).map((period, i) => {
      const target = $((p.base * Math.pow(1 + p.growth, i) + (p.extra[period] ?? 0)) * p.pace);
      const sites = p.sitesPerMonth(i);
      const patients = p.patientsPerMonth(i);
      // Visits make up the rest of the month's work.
      const visits = Math.max(0, Math.round((target - monthly - sites * rate("site") - patients * rate("patient")) / rate("visit")));
      return { period, sites, patients, visits };
    });
    return {
      id: p.code.toLowerCase(),
      code: p.code,
      name: p.name,
      programCode: p.programCode,
      croName: p.croName,
      phase: p.phase,
      end: addMonths(start, p.months - 1),
      contract,
      activity,
    };
  });
}

export const SAMPLE_TRIALS_AS_OF = SAMPLE_LAST_PERIOD;
