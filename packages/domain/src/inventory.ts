import { periodEnd, type JournalLine } from "./accruals";
import { addMonths } from "./period";
import type { Cents, Period } from "./types";

/**
 * Inventory batches and the expiry watchlist (design.md 10). Each batch is a
 * lot of one product with a quantity, a unit cost and an expiry date. Batches
 * fall into buckets by how soon they expire, and each gets a suggested
 * write-off: all of it once expired; otherwise the units that won't be used
 * before expiry at the expected usage rate, or a policy percentage of the
 * value when no usage rate is known. Lots of the same product are used
 * first-expiry-first-out, so a later lot only starts being used once the
 * earlier ones run out.
 */

export interface Batch {
  id: string;
  product: string;
  programCode: string | null;
  lot: string;
  /** Units on hand, e.g. vials, grams, kits. */
  quantity: number;
  unit: string;
  unitCost: Cents;
  /** ISO date, YYYY-MM-DD. */
  expiry: string;
  /** Units expected to be used per month; null when not known. */
  monthlyUsage: number | null;
  location: string;
}

export type ExpiryBucket = "expired" | "0-3" | "3-6" | "6-12" | "later";

export const EXPIRY_BUCKETS: { bucket: ExpiryBucket; label: string; months: number | null; policy: number }[] = [
  { bucket: "expired", label: "Expired", months: 0, policy: 1 },
  { bucket: "0-3", label: "Expires in 0–3 months", months: 3, policy: 0.5 },
  { bucket: "3-6", label: "Expires in 3–6 months", months: 6, policy: 0.25 },
  { bucket: "6-12", label: "Expires in 6–12 months", months: 12, policy: 0 },
  { bucket: "later", label: "Expires after 12 months", months: null, policy: 0 },
];

export const INVENTORY_ACCOUNTS = {
  expense: { code: "6320", name: "Inventory write-off (expiry)" },
  reserve: { code: "1320", name: "Inventory reserve for expiry" },
};

export type WriteOffBasis = "expired" | "usage" | "policy" | "none";

export interface BatchStatus {
  batch: Batch;
  bucket: ExpiryBucket;
  value: Cents;
  /** Months from the end of `asOf` to expiry; negative once expired. */
  monthsLeft: number;
  /** Units used before expiry at the expected rate (usage basis only). */
  usedBeforeExpiry: number | null;
  /** Units of the same product in earlier-expiring lots, used before this one. */
  usedFromEarlierLots: number;
  /** Units that won't be used before expiry (expired and usage bases). */
  unusedUnits: number | null;
  writeOff: Cents;
  basis: WriteOffBasis;
}

/** Calendar months from the end of `asOf` to `date`: whole months, plus the part of the expiry month that has passed. */
function monthsFrom(asOf: Period, date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const whole = (y - Number(asOf.slice(0, 4))) * 12 + m - Number(asOf.slice(5, 7)) - 1;
  return whole + d / new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** One batch on its own; `earlier` is the units of earlier-expiring lots of the product that get used first. */
export function batchStatus(batch: Batch, asOf: Period, earlier = 0): BatchStatus {
  const end = periodEnd(asOf);
  const value = Math.round(batch.quantity * batch.unitCost);
  const monthsLeft = monthsFrom(asOf, batch.expiry);
  const bucket = batch.expiry <= end ? "expired" : EXPIRY_BUCKETS.find((b) => b.months && batch.expiry <= periodEnd(addMonths(asOf, b.months)))?.bucket ?? "later";
  const base = { batch, bucket, value, monthsLeft, usedBeforeExpiry: null, unusedUnits: null, usedFromEarlierLots: 0 };
  if (bucket === "expired") return { ...base, unusedUnits: batch.quantity, writeOff: value, basis: "expired" };
  if (bucket === "later" || bucket === "6-12") {
    if (batch.monthlyUsage === null) return { ...base, writeOff: 0, basis: "none" };
  }
  if (batch.monthlyUsage !== null) {
    const used = Math.min(batch.quantity, Math.max(0, Math.floor(batch.monthlyUsage * monthsLeft) - earlier));
    const unused = batch.quantity - used;
    return { ...base, usedFromEarlierLots: earlier, usedBeforeExpiry: used, unusedUnits: unused, writeOff: Math.round(unused * batch.unitCost), basis: unused > 0 ? "usage" : "none" };
  }
  const policy = EXPIRY_BUCKETS.find((b) => b.bucket === bucket)!.policy;
  return { ...base, writeOff: Math.round(value * policy), basis: policy > 0 ? "policy" : "none" };
}

export interface ExpirySummary {
  total: Cents;
  writeOff: Cents;
  /** Value by bucket, in EXPIRY_BUCKETS order. */
  buckets: { bucket: ExpiryBucket; label: string; value: Cents; writeOff: Cents; count: number }[];
  /** Value by product and bucket, products with the most value at risk (expired to 12 months) first. */
  byProduct: { product: string; values: Record<ExpiryBucket, Cents>; atRisk: Cents }[];
}

/** Batches grouped by how soon they expire, as of the end of `asOf`. */
export function expiryBuckets(batches: Batch[], asOf: Period): { rows: BatchStatus[]; summary: ExpirySummary } {
  const ordered = [...batches].sort((a, b) => a.expiry.localeCompare(b.expiry) || a.product.localeCompare(b.product) || a.lot.localeCompare(b.lot));
  const usedFirst = new Map<string, number>();
  const rows = ordered.map((b) => {
    const r = batchStatus(b, asOf, usedFirst.get(b.product) ?? 0);
    if (r.usedBeforeExpiry) usedFirst.set(b.product, (usedFirst.get(b.product) ?? 0) + r.usedBeforeExpiry);
    return r;
  });
  const products = new Map<string, Record<ExpiryBucket, Cents>>();
  for (const r of rows) {
    const v = products.get(r.batch.product) ?? { expired: 0, "0-3": 0, "3-6": 0, "6-12": 0, later: 0 };
    v[r.bucket] += r.value;
    products.set(r.batch.product, v);
  }
  return {
    rows,
    summary: {
      total: rows.reduce((s, r) => s + r.value, 0),
      writeOff: rows.reduce((s, r) => s + r.writeOff, 0),
      buckets: EXPIRY_BUCKETS.map(({ bucket, label }) => {
        const inB = rows.filter((r) => r.bucket === bucket);
        return { bucket, label, value: inB.reduce((s, r) => s + r.value, 0), writeOff: inB.reduce((s, r) => s + r.writeOff, 0), count: inB.length };
      }),
      byProduct: [...products]
        .map(([product, values]) => ({ product, values, atRisk: values.expired + values["0-3"] + values["3-6"] + values["6-12"] }))
        .sort((a, b) => b.atRisk - a.atRisk || a.product.localeCompare(b.product)),
    },
  };
}

/**
 * The month-end reserve for expiring stock: book the full suggested
 * write-off on the last day of the month, reversed on the first day of the
 * next, the same way as trial accruals, so the reserve always equals this
 * month's suggestion.
 */
export function writeOffJournal(rows: BatchStatus[], asOf: Period): JournalLine[] {
  const date = periodEnd(asOf);
  const { expense, reserve } = INVENTORY_ACCOUNTS;
  return rows
    .filter((r) => r.writeOff > 0)
    .flatMap((r) => {
      const memo = `Expiry reserve ${r.batch.product} lot ${r.batch.lot} ${asOf}, reverses ${addMonths(asOf, 1)}-01`;
      const className = r.batch.programCode ?? "";
      return [
        { date, account: expense.code, accountName: expense.name, debit: r.writeOff, credit: 0, memo, className },
        { date, account: reserve.code, accountName: reserve.name, debit: 0, credit: r.writeOff, memo, className },
      ];
    });
}
