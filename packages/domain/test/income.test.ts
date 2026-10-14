import { describe, expect, it } from "vitest";
import { incomeSummary, receivedFor, scheduleStatus, type IncomeSource } from "../src";

const partner: IncomeSource = {
  id: "s1",
  name: "Partner collaboration",
  kind: "milestone",
  counterparty: "Partner Pharma",
  programCode: null,
  award: null,
  receipts: [
    { id: "m1", label: "IND cleared", expected: "2026-03", amount: 2_000_000_00, probability: 0.9 },
    { id: "m2", label: "First patient dosed", expected: "2026-06", amount: 3_000_000_00, probability: 0.7 },
    { id: "m3", label: "Phase 2 readout", expected: "2026-08", amount: 5_000_000_00, probability: 0.4 },
    { id: "m4", label: "Phase 3 start", expected: "2027-03", amount: 10_000_000_00, probability: 0.25 },
  ],
};

const data = {
  vendors: [
    { id: "v1", name: "Partner Pharma", type: "other" as const },
    { id: "v2", name: "Someone else", type: "other" as const },
  ],
  transactions: [
    // On time, and two months late.
    { id: "t1", date: "2026-03-28", categoryId: "rev-collab", amount: 2_000_000_00, vendorId: "v1", departmentId: null, programId: null, memo: "", accountCode: "4100" },
    { id: "t2", date: "2026-08-25", categoryId: "rev-collab", amount: 3_000_000_00, vendorId: "v1", departmentId: null, programId: null, memo: "", accountCode: "4100" },
    // Not this counterparty, and not income from it.
    { id: "t3", date: "2026-08-25", categoryId: "rev-collab", amount: 5_000_000_00, vendorId: "v2", departmentId: null, programId: null, memo: "", accountCode: "4100" },
    { id: "t4", date: "2026-08-25", categoryId: "ga-professional", amount: 5_000_000_00, vendorId: "v1", departmentId: null, programId: null, memo: "", accountCode: "7210" },
  ],
};

describe("income schedules", () => {
  const rows = scheduleStatus(partner, receivedFor(data, partner), "2026-09");

  it("matches ledger receipts to the schedule, on time or late", () => {
    expect(receivedFor(data, partner).map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(rows.map((r) => [r.id, r.status, r.monthsLate])).toEqual([
      ["m1", "received", 0],
      ["m2", "received", 2],
      ["m3", "overdue", null],
      ["m4", "expected", null],
    ]);
  });

  it("weights what hasn't arrived by its probability", () => {
    expect(rows.map((r) => r.weighted)).toEqual([2_000_000_00, 3_000_000_00, 2_000_000_00, 2_500_000_00]);
  });

  it("doesn't count a receipt dated after the as-of month", () => {
    const june = scheduleStatus(partner, receivedFor(data, partner), "2026-07");
    expect(june.find((r) => r.id === "m2")!.status).toBe("overdue");
  });

  it("sums the year, the next 12 months, overdue and grant funds left", () => {
    const grant: IncomeSource = { ...partner, id: "g", kind: "grant", counterparty: "Nobody", award: 1_000_000_00, receipts: [{ id: "g1", label: "Q4", expected: "2026-12", amount: 250_000_00, probability: 1 }] };
    const s = incomeSummary(
      [
        { source: partner, receipts: rows },
        { source: grant, receipts: scheduleStatus(grant, [], "2026-09") },
      ],
      "2026-09",
      "2026-07",
      "2026-12",
    );
    expect(s).toMatchObject({
      receivedThisYear: 5_000_000_00,
      next12Weighted: 2_500_000_00 + 250_000_00,
      next12Full: 10_000_000_00 + 250_000_00,
      overdue: 5_000_000_00,
      overdueCount: 1,
      grantRemaining: 1_000_000_00,
    });
    expect(s.byMonth.map((m) => [m.period, m.received, m.weighted])).toEqual([
      ["2026-07", 0, 0],
      ["2026-08", 3_000_000_00, 2_000_000_00],
      ["2026-09", 0, 0],
      ["2026-10", 0, 0],
      ["2026-11", 0, 0],
      ["2026-12", 0, 250_000_00],
    ]);
  });
});
