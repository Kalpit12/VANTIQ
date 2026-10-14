import "server-only";
import { getDb, listBatches } from "@vantiq/db";
import { EXPIRY_BUCKETS, formatDate, writeOffJournal, type Batch, type BatchStatus, type Period } from "@vantiq/domain";
import { generateSampleInventory } from "@vantiq/fixtures";
import type { Workspace } from "./data";

/** Batches for the workspace: stored ones, or Helixa's stock in the demo. */
export async function batchesFor(ws: Workspace): Promise<Batch[]> {
  return ws.mode === "demo" ? generateSampleInventory() : listBatches(getDb(), ws.companyId!);
}

const n = (x: number) => x.toLocaleString("en-US");

const earlier = (r: BatchStatus) => (r.usedFromEarlierLots ? ` and ${n(r.usedFromEarlierLots)} used from earlier lots first` : "");

/** Why a batch has the write-off it has, in a sentence. */
export function writeOffReason(r: BatchStatus): string {
  const { batch } = r;
  const b = batch;
  switch (r.basis) {
    case "expired":
      return `Expired ${formatDate(b.expiry)}: write off all ${n(b.quantity)} ${b.unit}`;
    case "usage":
      return `At ${n(b.monthlyUsage!)} ${b.unit} a month${earlier(r)}, ${n(r.usedBeforeExpiry!)} get used before expiry and ${n(r.unusedUnits!)} are left over`;
    case "policy":
    {
      const b = EXPIRY_BUCKETS.find((x) => x.bucket === r.bucket)!;
      return `No usage rate, so ${Math.round(b.policy * 100)}% of the value for stock expiring within ${b.months} months`;
    }
    default:
      return b.monthlyUsage !== null ? `At ${n(b.monthlyUsage)} ${b.unit} a month${earlier(r)}, all of it gets used before expiry` : "Nothing yet";
  }
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) || /^[=+\-@]/.test(v) ? `"${(/^[=+\-@]/.test(v) ? "'" : "") + v.replace(/"/g, '""')}"` : v);

/** The month-end expiry reserve as a CSV journal most accounting systems can import. */
export function reserveCsv(rows: BatchStatus[], asOf: Period): string {
  const lines = [["Journal No", "Date", "Account", "Account Name", "Debit", "Credit", "Memo", "Class"].join(",")];
  for (const l of writeOffJournal(rows, asOf))
    lines.push(
      [`EXP-${asOf.replace("-", "")}`, l.date, l.account, l.accountName, l.debit ? (l.debit / 100).toFixed(2) : "", l.credit ? (l.credit / 100).toFixed(2) : "", l.memo, l.className].map(csvCell).join(","),
    );
  return lines.join("\r\n") + "\r\n";
}
