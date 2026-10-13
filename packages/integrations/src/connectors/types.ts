import type { Cents, Period } from "@vantiq/domain";

/**
 * Connectors read a company's books from an accounting system. Each one hides
 * a provider's API behind the same small shape, so the sync engine
 * (packages/db/src/sync.ts) never knows which system it is talking to.
 */

export const ACCOUNTING_SYSTEMS = [
  { id: "quickbooks", name: "QuickBooks Online", mergeSlug: "quickbooks-online", mono: "QB" },
  { id: "xero", name: "Xero", mergeSlug: "xero", mono: "X" },
  { id: "netsuite", name: "NetSuite", mergeSlug: "netsuite", mono: "N" },
  { id: "sage_intacct", name: "Sage Intacct", mergeSlug: "sage-intacct", mono: "SI" },
] as const;

export type AccountClass = "revenue" | "expense" | "asset" | "liability" | "equity";

export interface RemoteAccount {
  externalId: string;
  /** Account number when the system has one, otherwise its name. */
  code: string;
  name: string;
  classification: AccountClass | null;
}

/** One ledger line on a profit-and-loss account. */
export interface RemoteLine {
  /** Stable id in the source system; a later sync with the same id updates the line. */
  externalId: string;
  date: string; // YYYY-MM-DD
  accountCode: string;
  accountName: string;
  /** Debit-positive cents, as in the source ledger. */
  amount: Cents;
  vendor: string;
  memo: string;
  department: string;
  program: string;
}

export interface LinesPage {
  lines: RemoteLine[];
  /** Ids of lines the source deleted since `modifiedSince`. */
  deleted: string[];
  next: string | null;
}

export interface LinesQuery {
  /** Earliest posting date to read, YYYY-MM-DD. */
  from: string;
  /** Only lines changed after this instant; null reads everything. */
  modifiedSince: string | null;
  cursor: string | null;
}

export interface RemoteProgram {
  code: string;
  name: string;
  therapeuticArea?: string;
  phase?: string | null;
}

export interface Connector {
  /** Display name of the connected system, such as "QuickBooks Online". */
  readonly systemName: string;
  /**
   * True when `listLines` honours `modifiedSince` and reports deletions. When
   * false, every sync reads the full window and lines that disappeared from it
   * are removed.
   */
  readonly incremental: boolean;
  /** For practice books frozen in time: the day the sync window ends on instead of today. */
  readonly asOf?: string;
  listAccounts(): Promise<RemoteAccount[]>;
  listLines(q: LinesQuery): Promise<LinesPage>;
  /**
   * Net income each month as the source system's own income statement reports
   * it. Vantiq compares this with the lines it stored to prove nothing went
   * missing. Months the source cannot report are left out.
   */
  periodNetIncome(periods: Period[]): Promise<Map<Period, Cents>>;
  /** Month-end cash, when the system reports it. */
  cashBalances?(periods: Period[]): Promise<Map<Period, Cents>>;
  /** Projects or classes to create as programs before lines arrive. */
  listPrograms?(): Promise<RemoteProgram[]>;
}

/** Accounts whose lines Vantiq reads: profit and loss only. Unclassified accounts are kept, to be mapped by hand. */
export const isProfitAndLoss = (a: RemoteAccount) => a.classification === null || a.classification === "revenue" || a.classification === "expense";

export class ConnectorError extends Error {
  constructor(
    message: string,
    /** True when reconnecting is the fix (revoked or expired access). */
    readonly needsReauth = false,
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}
