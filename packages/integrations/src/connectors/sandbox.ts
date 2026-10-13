import { periodOfDate, type Cents, type LedgerData, type Period } from "@vantiq/domain";
import { generateSampleCompany, SAMPLE_ACCOUNTS, SAMPLE_LAST_PERIOD } from "@vantiq/fixtures";
import type { Connector, LinesPage, LinesQuery, RemoteAccount, RemoteProgram } from "./types";

export interface SandboxOptions {
  data?: LedgerData;
  /** Added to the net income the "source" reports for a month, to simulate books that changed under a closed period. */
  reportedDrift?: Record<Period, Cents>;
  pageSize?: number;
}

/**
 * A pretend QuickBooks holding the Helixa sample company's books. It lets a new
 * workspace try connecting and syncing without an accounting system, and it is
 * what the sync tests run against.
 */
export function sandboxConnector(opts: SandboxOptions = {}): Connector {
  const data = opts.data ?? generateSampleCompany();
  const pageSize = opts.pageSize ?? 500;
  const name = new Map(SAMPLE_ACCOUNTS.map((a) => [a.code, a.name]));
  const kind = new Map(data.categories.map((c) => [c.id, c.kind]));
  const vendor = new Map(data.vendors.map((v) => [v.id, v.name]));
  const dept = new Map(data.departments.map((d) => [d.id, d.name]));
  const program = new Map(data.programs.map((p) => [p.id, p.code]));
  const lines = [...data.transactions]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((t) => ({
      externalId: t.id,
      date: t.date,
      accountCode: t.accountCode,
      accountName: name.get(t.accountCode) ?? "",
      // Revenue is a credit in the ledger, so it reads negative debit-positive.
      amount: kind.get(t.categoryId) === "revenue" ? -t.amount : t.amount,
      vendor: (t.vendorId && vendor.get(t.vendorId)) || "",
      memo: t.memo,
      department: (t.departmentId && dept.get(t.departmentId)) || "",
      program: (t.programId && program.get(t.programId)) || "",
    }));

  return {
    systemName: "QuickBooks Online (sandbox)",
    incremental: false,
    // The sample books end with September 2026; sync the 24 months up to then.
    asOf: `${SAMPLE_LAST_PERIOD}-28`,
    async listAccounts(): Promise<RemoteAccount[]> {
      return SAMPLE_ACCOUNTS.map((a) => ({ externalId: `acct-${a.code}`, code: a.code, name: a.name, classification: a.code.startsWith("4") ? "revenue" : "expense" }));
    },
    async listLines(q: LinesQuery): Promise<LinesPage> {
      const inWindow = lines.filter((l) => l.date >= q.from);
      const start = Number(q.cursor ?? 0);
      const page = inWindow.slice(start, start + pageSize);
      return { lines: page, deleted: [], next: start + pageSize < inWindow.length ? String(start + pageSize) : null };
    },
    async periodNetIncome(periods: Period[]) {
      const want = new Set(periods);
      const out = new Map<Period, Cents>(periods.map((p) => [p, 0]));
      for (const l of lines) {
        const p = periodOfDate(l.date);
        if (want.has(p)) out.set(p, out.get(p)! - l.amount);
      }
      for (const [p, d] of Object.entries(opts.reportedDrift ?? {})) if (out.has(p)) out.set(p, out.get(p)! + d);
      return out;
    },
    async cashBalances(periods: Period[]) {
      const want = new Set(periods);
      return new Map(data.cash.filter((c) => want.has(c.period)).map((c) => [c.period, c.balance]));
    },
    async listPrograms(): Promise<RemoteProgram[]> {
      return data.programs.map((p) => ({ code: p.code, name: p.name, therapeuticArea: p.therapeuticArea, phase: p.phase }));
    },
  };
}
