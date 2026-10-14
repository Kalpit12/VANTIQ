import { addMonths, type IncomeSource } from "@vantiq/domain";

/**
 * Helixa's income schedules, matched to the sample ledger: the NIH SBIR grant
 * drawn quarterly, the Novagen collaboration (whose first-patient milestone
 * arrived two months late), and a new licensing deal on HX-310 whose signing
 * fee is overdue while the term sheet is negotiated.
 */
export function generateSampleIncome(): IncomeSource[] {
  const quarters: string[] = [];
  for (let p = "2024-12"; p <= "2027-03"; p = addMonths(p, 3)) quarters.push(p);
  return [
    {
      id: "nih-sbir",
      name: "NIH SBIR Phase II grant",
      kind: "grant",
      counterparty: "NIH (SBIR grant)",
      programCode: null,
      award: 4_500_000_00,
      receipts: quarters.map((p, i) => ({ id: `nih-${i + 1}`, label: `Drawdown ${i + 1} of 10`, expected: p, amount: 450_000_00, probability: p <= "2026-09" ? 1 : 0.95 })),
    },
    {
      id: "novagen",
      name: "Novagen collaboration (HX-204)",
      kind: "milestone",
      counterparty: "Novagen Pharma (partner)",
      programCode: "HX-204",
      award: null,
      receipts: [
        { id: "nov-1", label: "IND clearance", expected: "2025-06", amount: 2_000_000_00, probability: 1 },
        { id: "nov-2", label: "First patient dosed", expected: "2026-06", amount: 3_000_000_00, probability: 0.9 },
        { id: "nov-3", label: "Phase 1 data readout", expected: "2027-03", amount: 5_000_000_00, probability: 0.6 },
        { id: "nov-4", label: "Phase 2 first patient", expected: "2027-09", amount: 10_000_000_00, probability: 0.4 },
        { id: "nov-5", label: "Phase 3 start", expected: "2029-01", amount: 25_000_000_00, probability: 0.2 },
      ],
    },
    {
      id: "kairo",
      name: "Kairo license (HX-310)",
      kind: "license",
      counterparty: "Kairo Biosciences",
      programCode: "HX-310",
      award: null,
      receipts: [
        { id: "kai-1", label: "Signing fee", expected: "2026-08", amount: 750_000_00, probability: 0.8 },
        { id: "kai-2", label: "Option exercise", expected: "2027-06", amount: 1_500_000_00, probability: 0.5 },
        { id: "kai-3", label: "IND milestone", expected: "2028-06", amount: 4_000_000_00, probability: 0.25 },
      ],
    },
  ];
}
