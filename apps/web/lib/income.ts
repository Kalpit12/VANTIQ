import "server-only";
import { getDb, listIncomeSources } from "@vantiq/db";
import { addMonths, incomeSummary, receivedFor, scheduleStatus, type IncomeSource, type Period } from "@vantiq/domain";
import { generateSampleIncome } from "@vantiq/fixtures";
import type { Workspace } from "./data";

/** Income schedules for the workspace: stored ones, or Helixa's in the demo. */
export async function incomeSourcesFor(ws: Workspace): Promise<IncomeSource[]> {
  return ws.mode === "demo" ? generateSampleIncome() : listIncomeSources(getDb(), ws.companyId!);
}

/** Every schedule matched to the books as of the end of `asOf`, and the totals for the page. */
export function incomeAt(ws: Workspace, sources: IncomeSource[], asOf: Period) {
  const rows = sources.map((source) => {
    const received = receivedFor(ws.ledger.data, source);
    return { source, receipts: scheduleStatus(source, received, asOf), paidBefore: received.length > 0 };
  });
  const from = addMonths(asOf, -11);
  const to = addMonths(asOf, 15);
  return { rows, from, to, summary: incomeSummary(rows, asOf, from, to) };
}
