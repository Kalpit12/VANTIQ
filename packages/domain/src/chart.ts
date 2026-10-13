import type { Category } from "./types";

/**
 * Vantiq's standard pharma chart. Every company's accounts map onto these
 * categories, so screens, budgets and benchmarks share one structure.
 */
export const STANDARD_CATEGORIES: Category[] = [
  { id: "rev", name: "Revenue and income", kind: "revenue", parentId: null, order: 0 },
  { id: "rev-collab", name: "Collaboration revenue", kind: "revenue", parentId: "rev", order: 0 },
  { id: "rev-grant", name: "Grant income", kind: "revenue", parentId: "rev", order: 1 },
  { id: "opex", name: "Operating expenses", kind: "opex", parentId: null, order: 1 },
  { id: "rd", name: "Research and development", kind: "opex", parentId: "opex", order: 0 },
  { id: "rd-cro", name: "CRO and clinical fees", kind: "opex", parentId: "rd", order: 0 },
  { id: "rd-cmc", name: "CMC and manufacturing", kind: "opex", parentId: "rd", order: 1 },
  { id: "rd-people", name: "R&D personnel", kind: "opex", parentId: "rd", order: 2 },
  { id: "rd-lab", name: "Lab supplies", kind: "opex", parentId: "rd", order: 3 },
  { id: "rd-consult", name: "Consultants", kind: "opex", parentId: "rd", order: 4 },
  { id: "ga", name: "General and administrative", kind: "opex", parentId: "opex", order: 1 },
  { id: "ga-people", name: "G&A personnel", kind: "opex", parentId: "ga", order: 0 },
  { id: "ga-facilities", name: "Rent and facilities", kind: "opex", parentId: "ga", order: 1 },
  { id: "ga-professional", name: "Professional fees", kind: "opex", parentId: "ga", order: 2 },
  { id: "ga-software", name: "Software and IT", kind: "opex", parentId: "ga", order: 3 },
];
