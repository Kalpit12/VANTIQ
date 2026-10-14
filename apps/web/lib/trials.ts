import "server-only";
import { accrualJournal, billedForTrial, estimateAccrual, type AccrualEstimate, type Period, type Trial } from "@vantiq/domain";
import { getDb, getTrial, listTrials } from "@vantiq/db";
import { generateSampleTrials } from "@vantiq/fixtures";
import type { Workspace } from "./data";

/** Trials for the workspace: stored ones, or the Helixa sample trials in the demo. */
export async function trialsFor(ws: Workspace): Promise<Trial[]> {
  return ws.mode === "demo" ? generateSampleTrials() : listTrials(getDb(), ws.companyId!);
}

export async function trialFor(ws: Workspace, id: string): Promise<Trial | null> {
  if (ws.mode === "demo") return generateSampleTrials().find((t) => t.id === id) ?? null;
  return getTrial(getDb(), ws.companyId!, id);
}

export interface TrialAccrual {
  trial: Trial;
  est: AccrualEstimate;
}

/** Each trial's accrual as of the end of `asOf`. A trial that hasn't started yet is left out. */
export function accrualsAt(ws: Workspace, list: Trial[], asOf: Period): TrialAccrual[] {
  return list.filter((t) => t.contract.start <= asOf).map((trial) => ({ trial, est: estimateAccrual(trial.contract, trial.activity, billedForTrial(ws.ledger.data, trial), asOf) }));
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) || /^[=+\-@]/.test(v) ? `"${(/^[=+\-@]/.test(v) ? "'" : "") + v.replace(/"/g, '""')}"` : v);

/** Journal entries as a CSV most accounting systems can import. */
export function journalCsv(rows: TrialAccrual[]): string {
  const lines = [["Journal No", "Date", "Account", "Account Name", "Debit", "Credit", "Memo", "Class"].join(",")];
  rows.forEach(({ trial, est }, i) => {
    for (const l of accrualJournal(trial, est)) {
      lines.push(
        [`ACR-${est.asOf.replace("-", "")}-${String(i + 1).padStart(2, "0")}`, l.date, l.account, l.accountName, l.debit ? (l.debit / 100).toFixed(2) : "", l.credit ? (l.credit / 100).toFixed(2) : "", l.memo, l.className]
          .map(csvCell)
          .join(","),
      );
    }
  });
  return lines.join("\r\n") + "\r\n";
}
