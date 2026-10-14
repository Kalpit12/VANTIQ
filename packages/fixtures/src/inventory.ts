import type { Batch } from "@vantiq/domain";

/**
 * Helixa's clinical supply and lab stock at the September 2026 close: drug
 * product for the HX-204 Phase 1, the HX-101 placebo and drug substance, and
 * lab reference materials. One drug product lot has just expired, the next
 * expires before the trial can use it all, and the trial won't get through
 * the lot after that before it expires either.
 */
export function generateSampleInventory(): Batch[] {
  const b = (id: string, product: string, programCode: string | null, lot: string, quantity: number, unit: string, unitCost: number, expiry: string, monthlyUsage: number | null, location: string): Batch => ({
    id,
    product,
    programCode,
    lot,
    quantity,
    unit,
    unitCost,
    expiry,
    monthlyUsage,
    location,
  });
  return [
    b("inv-1", "HX-204 drug product 50 mg", "HX-204", "DP-2311", 140, "vials", 180_00, "2026-09-15", null, "Almac, Craigavon"),
    b("inv-2", "HX-204 drug product 50 mg", "HX-204", "DP-2402", 900, "vials", 180_00, "2026-12-31", 160, "Almac, Craigavon"),
    b("inv-3", "HX-204 drug product 50 mg", "HX-204", "DP-2405", 1800, "vials", 180_00, "2027-09-30", 160, "Almac, Craigavon"),
    b("inv-4", "HX-101 placebo tablets", "HX-101", "PL-2403", 600, "bottles", 35_00, "2027-02-28", 80, "Fisher Clinical, Allentown"),
    b("inv-5", "HX-101 drug substance", "HX-101", "DS-2310", 4000, "g", 95_00, "2027-06-30", 450, "Lonza, Visp"),
    b("inv-6", "Reference standard HX-101", null, "RS-118", 25, "vials", 1_200_00, "2026-11-30", null, "Helixa lab, Cambridge"),
    b("inv-7", "Cell culture media", null, "CM-5521", 300, "bottles", 85_00, "2027-03-31", null, "Helixa lab, Cambridge"),
    b("inv-8", "HX-310 tox batch", "HX-310", "TX-0907", 2000, "g", 22_00, "2028-01-31", null, "Charles River, Ashland"),
  ];
}
