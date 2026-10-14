import { describe, expect, it } from "vitest";
import { batchStatus, expiryBuckets, writeOffJournal, type Batch } from "../src";

const batch = (over: Partial<Batch>): Batch => ({
  id: "b",
  product: "HX-204 drug product 50 mg",
  programCode: "HX-204",
  lot: "L1",
  quantity: 100,
  unit: "vials",
  unitCost: 200_00,
  expiry: "2027-06-30",
  monthlyUsage: null,
  location: "",
  ...over,
});

describe("inventory expiry", () => {
  it("puts batches in buckets by calendar month from the end of the period", () => {
    expect(batchStatus(batch({ expiry: "2026-09-30" }), "2026-09").bucket).toBe("expired");
    expect(batchStatus(batch({ expiry: "2026-10-01" }), "2026-09").bucket).toBe("0-3");
    expect(batchStatus(batch({ expiry: "2026-12-31" }), "2026-09").bucket).toBe("0-3");
    expect(batchStatus(batch({ expiry: "2027-01-01" }), "2026-09").bucket).toBe("3-6");
    expect(batchStatus(batch({ expiry: "2027-09-30" }), "2026-09").bucket).toBe("6-12");
    expect(batchStatus(batch({ expiry: "2027-10-01" }), "2026-09").bucket).toBe("later");
  });

  it("suggests a write-off: all of an expired batch, unused units at the usage rate, or the policy share", () => {
    expect(batchStatus(batch({ expiry: "2026-08-31" }), "2026-09")).toMatchObject({ writeOff: 20_000_00, basis: "expired", unusedUnits: 100 });
    // Three months left at 20 a month: 60 used, 40 left over.
    const usage = batchStatus(batch({ expiry: "2026-12-31", monthlyUsage: 20 }), "2026-09");
    expect(usage).toMatchObject({ basis: "usage", usedBeforeExpiry: 60, unusedUnits: 40, writeOff: 8_000_00 });
    // Fast enough usage means nothing to write off.
    expect(batchStatus(batch({ expiry: "2026-12-31", monthlyUsage: 50 }), "2026-09")).toMatchObject({ basis: "none", writeOff: 0 });
    // Usage still counts for a batch 6–12 months out.
    expect(batchStatus(batch({ expiry: "2027-06-30", monthlyUsage: 5 }), "2026-09")).toMatchObject({ basis: "usage", unusedUnits: 55 });
    // No usage rate: 50% within 3 months, 25% within 6, nothing later.
    expect(batchStatus(batch({ expiry: "2026-11-30" }), "2026-09")).toMatchObject({ basis: "policy", writeOff: 10_000_00 });
    expect(batchStatus(batch({ expiry: "2027-02-28" }), "2026-09")).toMatchObject({ basis: "policy", writeOff: 5_000_00 });
    expect(batchStatus(batch({ expiry: "2027-06-30" }), "2026-09")).toMatchObject({ basis: "none", writeOff: 0 });
  });

  it("uses lots of a product first-expiry-first-out", () => {
    const { rows } = expiryBuckets(
      [batch({ id: "late", lot: "B", quantity: 100, expiry: "2027-03-31", monthlyUsage: 20 }), batch({ id: "early", lot: "A", quantity: 50, expiry: "2026-12-31", monthlyUsage: 20 })],
      "2026-09",
    );
    // Lot A: 60 units of demand by December, all 50 used. Lot B: 120 by March, less the 50 from A.
    expect(rows.map((r) => [r.batch.lot, r.usedFromEarlierLots, r.usedBeforeExpiry, r.unusedUnits])).toEqual([
      ["A", 0, 50, 0],
      ["B", 50, 70, 30],
    ]);
  });

  it("totals by bucket and product, and books a balanced reversing reserve entry", () => {
    const list = [
      batch({ id: "1", lot: "A", expiry: "2026-08-31" }),
      batch({ id: "2", lot: "B", expiry: "2027-02-28" }),
      batch({ id: "3", product: "Reference standard", programCode: null, lot: "R", quantity: 10, unitCost: 1_000_00, expiry: "2028-01-31" }),
    ];
    const { rows, summary } = expiryBuckets(list, "2026-09");
    expect(summary.total).toBe(20_000_00 * 2 + 10_000_00);
    expect(summary.buckets.map((b) => [b.bucket, b.value])).toEqual([["expired", 20_000_00], ["0-3", 0], ["3-6", 20_000_00], ["6-12", 0], ["later", 10_000_00]]);
    expect(summary.byProduct.map((p) => [p.product, p.atRisk])).toEqual([["HX-204 drug product 50 mg", 40_000_00], ["Reference standard", 0]]);
    expect(summary.writeOff).toBe(25_000_00);
    const journal = writeOffJournal(rows, "2026-09");
    expect(journal).toHaveLength(4);
    expect(journal.reduce((s, l) => s + l.debit - l.credit, 0)).toBe(0);
    expect(journal[0]).toMatchObject({ date: "2026-09-30", account: "6320", debit: 20_000_00, className: "HX-204" });
    expect(journal[0]!.memo).toBe("Expiry reserve HX-204 drug product 50 mg lot A 2026-09, reverses 2026-10-01");
  });
});
