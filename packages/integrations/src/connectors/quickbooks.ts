import { addMonths, periodOfDate, periodRange, type Cents, type Period } from "@vantiq/domain";
import { parseAmount } from "../values";
import { ConnectorError, type AccountClass, type Connector, type LinesPage, type LinesQuery, type RemoteAccount, type RemoteProgram } from "./types";

/**
 * QuickBooks Online, called directly through Intuit's API. Free to build and
 * test against: an Intuit developer account comes with sandbox companies full
 * of sample books. This is the testing path until Vantiq moves to Merge at
 * launch (merge.ts), which covers Xero, NetSuite and Sage Intacct too.
 *
 * - Ledger lines come from the General Ledger report, read one month at a time.
 *   QuickBooks reports carry no line ids, so every sync re-reads the window
 *   and mirrors it (`incremental: false`).
 * - Program is the line's Class; department is its Department (Location).
 * - Net income per month comes from the Profit and Loss report by month.
 */

const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const API = { sandbox: "https://sandbox-quickbooks.api.intuit.com", production: "https://quickbooks.api.intuit.com" } as const;
const MINOR_VERSION = "75";

type Fetch = typeof fetch;

export type QuickbooksEnvironment = keyof typeof API;

export interface QuickbooksApp {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface QuickbooksTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires (they last an hour). */
  expiresAt: number;
}

/** What Vantiq seals and stores for a QuickBooks connection. */
export interface QuickbooksCredentials {
  realmId: string;
  environment: QuickbooksEnvironment;
  tokens: QuickbooksTokens;
}

export function quickbooksAuthUrl(app: Pick<QuickbooksApp, "clientId" | "redirectUri">, state: string) {
  const q = new URLSearchParams({ client_id: app.clientId, response_type: "code", scope: "com.intuit.quickbooks.accounting", redirect_uri: app.redirectUri, state });
  return `${AUTH_URL}?${q}`;
}

async function tokenCall(app: QuickbooksApp, body: Record<string, string>, f: Fetch): Promise<QuickbooksTokens> {
  let res: Response;
  try {
    res = await f(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(body).toString(),
    });
  } catch {
    throw new ConnectorError("Could not reach QuickBooks. Try again in a few minutes.");
  }
  if (res.status === 400 || res.status === 401) throw new ConnectorError("QuickBooks access was revoked or has expired. Reconnect it.", true);
  if (!res.ok) throw new ConnectorError(`QuickBooks sign-in returned an error (${res.status}).`);
  const t = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Date.now() + t.expires_in * 1000 };
}

/** Swaps the code from Intuit's redirect for tokens. */
export function exchangeQuickbooksCode(app: QuickbooksApp, code: string, f: Fetch = fetch) {
  return tokenCall(app, { grant_type: "authorization_code", code, redirect_uri: app.redirectUri }, f);
}

const CLASSES: Record<string, AccountClass> = { Revenue: "revenue", Expense: "expense", Asset: "asset", Liability: "liability", Equity: "equity" };

interface QbAccount {
  Id: string;
  Name: string;
  AcctNum?: string;
  Classification?: string;
}

interface ColData {
  value?: string;
  id?: string;
}
interface ReportRow {
  type?: "Section" | "Data";
  group?: string;
  Header?: { ColData: ColData[] };
  ColData?: ColData[];
  Rows?: { Row?: ReportRow[] };
  Summary?: { ColData: ColData[] };
}
interface Report {
  Columns?: { Column?: { ColTitle?: string; ColType?: string; MetaData?: { Name: string; Value: string }[] }[] };
  Rows?: { Row?: ReportRow[] };
}

const lastDay = (p: Period) => {
  const [y, m] = p.split("-").map(Number);
  return `${p}-${String(new Date(Date.UTC(y!, m!, 0)).getUTCDate()).padStart(2, "0")}`;
};
const meta = (c: { MetaData?: { Name: string; Value: string }[] }, name: string) => c.MetaData?.find((m) => m.Name === name)?.Value;
const cents = (v: string | undefined): Cents | null => (v === undefined || v.trim() === "" ? null : parseAmount(v));

export function quickbooksConnector(opts: {
  app: QuickbooksApp;
  credentials: QuickbooksCredentials;
  /** Called whenever tokens are refreshed, so the caller can store the new ones. */
  onTokens?: (t: QuickbooksTokens) => Promise<void>;
  fetch?: Fetch;
}): Connector {
  const f = opts.fetch ?? fetch;
  const { realmId, environment } = opts.credentials;
  let tokens = opts.credentials.tokens;
  const base = `${API[environment]}/v3/company/${encodeURIComponent(realmId)}`;

  async function refresh() {
    tokens = await tokenCall(opts.app, { grant_type: "refresh_token", refresh_token: tokens.refreshToken }, f);
    await opts.onTokens?.(tokens);
  }

  async function get<T>(path: string, retried = false): Promise<T> {
    if (tokens.expiresAt - 60_000 < Date.now()) await refresh();
    const sep = path.includes("?") ? "&" : "?";
    let res: Response;
    try {
      res = await f(`${base}${path}${sep}minorversion=${MINOR_VERSION}`, { headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: "application/json" } });
    } catch {
      throw new ConnectorError("Could not reach QuickBooks. Try again in a few minutes.");
    }
    if (res.status === 401 && !retried) {
      await refresh();
      return get<T>(path, true);
    }
    if (res.status === 401 || res.status === 403) throw new ConnectorError("QuickBooks access was revoked or has expired. Reconnect it.", true);
    if (res.status === 429) throw new ConnectorError("QuickBooks is rate limiting requests. Try Sync now again in a minute.");
    if (!res.ok) throw new ConnectorError(`QuickBooks returned an error (${res.status}).`);
    return (await res.json()) as T;
  }

  async function query<T>(entity: string): Promise<T[]> {
    const out: T[] = [];
    for (let start = 1; ; start += 1000) {
      const r = await get<{ QueryResponse: Record<string, T[] | undefined> }>(`/query?query=${encodeURIComponent(`select * from ${entity} startposition ${start} maxresults 1000`)}`);
      const page = r.QueryResponse[entity] ?? [];
      out.push(...page);
      if (page.length < 1000) return out;
    }
  }

  let accountsP: Promise<Map<string, QbAccount>> | null = null;
  const accounts = () => (accountsP ??= query<QbAccount>("Account").then((xs) => new Map(xs.map((a) => [a.Id, a]))));
  const toAccount = (a: QbAccount): RemoteAccount => ({
    externalId: a.Id,
    code: a.AcctNum?.trim() || a.Name.trim(),
    name: a.Name.trim(),
    classification: (a.Classification && CLASSES[a.Classification]) || null,
  });

  /** One month of the General Ledger report, flattened to P&L lines. */
  async function monthLines(period: Period, from: string) {
    const cols = "tx_date,txn_type,name,memo,klass_name,dept_name,account_name,debt_amt,credit_amt,subt_nat_amount";
    const start = `${period}-01` < from ? from : `${period}-01`;
    const report = await get<Report>(`/reports/GeneralLedger?start_date=${start}&end_date=${lastDay(period)}&columns=${cols}&accounting_method=Accrual`);
    const keys = (report.Columns?.Column ?? []).map((c) => meta(c, "ColKey") ?? c.ColType ?? "");
    const at = (row: ColData[], key: string) => {
      const i = keys.indexOf(key);
      return i < 0 ? undefined : row[i];
    };
    const byId = await accounts();
    const lines: LinesPage["lines"] = [];
    const seen = new Map<string, number>();
    const walk = (rows: ReportRow[] | undefined, sectionAccount: string | undefined) => {
      for (const r of rows ?? []) {
        if (r.Rows?.Row) walk(r.Rows.Row, r.Header?.ColData?.[0]?.id ?? sectionAccount);
        if (r.type !== "Data" || !r.ColData) continue;
        const date = at(r.ColData, "tx_date")?.value ?? "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue; // beginning balances and totals
        const acctId = at(r.ColData, "account_name")?.id || sectionAccount;
        const acct = acctId ? byId.get(acctId) : undefined;
        if (!acct) continue;
        const a = toAccount(acct);
        if (a.classification !== null && a.classification !== "revenue" && a.classification !== "expense") continue;
        const debit = cents(at(r.ColData, "debt_amt")?.value);
        const credit = cents(at(r.ColData, "credit_amt")?.value);
        let amount: Cents;
        if (debit !== null || credit !== null) amount = (debit ?? 0) - (credit ?? 0);
        else {
          // Without debit/credit columns, the report's amount is in the account's natural sign.
          const natural = cents(at(r.ColData, "subt_nat_amount")?.value) ?? 0;
          amount = a.classification === "revenue" ? -natural : natural;
        }
        if (amount === 0) continue;
        const txn = at(r.ColData, "txn_type");
        const key = `${txn?.value ?? ""}:${txn?.id ?? date}:${acct.Id}`;
        const n = (seen.get(key) ?? 0) + 1;
        seen.set(key, n);
        lines.push({
          externalId: `${key}:${n}`,
          date,
          accountCode: a.code,
          accountName: a.name,
          amount,
          vendor: at(r.ColData, "name")?.value?.trim() ?? "",
          memo: at(r.ColData, "memo")?.value?.trim() ?? "",
          department: at(r.ColData, "dept_name")?.value?.trim() ?? "",
          program: at(r.ColData, "klass_name")?.value?.trim() ?? "",
        });
      }
    };
    walk(report.Rows?.Row, undefined);
    return lines;
  }

  return {
    systemName: environment === "sandbox" ? "QuickBooks Online (Intuit sandbox)" : "QuickBooks Online",
    incremental: false,
    async listAccounts() {
      return [...(await accounts()).values()].map(toAccount);
    },
    async listLines(q: LinesQuery): Promise<LinesPage> {
      // The cursor is the month being read; one General Ledger report per month keeps each response small.
      const period = q.cursor ?? periodOfDate(q.from);
      const thisMonth = periodOfDate(new Date().toISOString().slice(0, 10));
      const lines = await monthLines(period, q.from);
      return { lines, deleted: [], next: period < thisMonth ? addMonths(period, 1) : null };
    },
    async periodNetIncome(periods: Period[]) {
      const out = new Map<Period, Cents>();
      if (!periods.length) return out;
      const report = await get<Report>(`/reports/ProfitAndLoss?start_date=${periods[0]}-01&end_date=${lastDay(periods[periods.length - 1]!)}&summarize_column_by=Month&accounting_method=Accrual`);
      const columns = report.Columns?.Column ?? [];
      const net = (report.Rows?.Row ?? []).find((r) => r.group === "NetIncome")?.Summary?.ColData ?? [];
      const want = new Set(periods);
      columns.forEach((c, i) => {
        const start = meta(c, "StartDate");
        if (!start) return;
        const p = periodOfDate(start);
        const v = cents(net[i]?.value);
        if (want.has(p) && v !== null) out.set(p, v);
      });
      // Months with no activity can be missing from the report; their net income is zero.
      if (columns.some((c) => meta(c, "StartDate"))) for (const p of periodRange(periods[0]!, periods[periods.length - 1]!)) if (!out.has(p)) out.set(p, 0);
      return out;
    },
    async listPrograms(): Promise<RemoteProgram[]> {
      const classes = await query<{ Name: string; Active?: boolean }>("Class");
      return classes.filter((c) => c.Active !== false && c.Name.trim()).map((c) => ({ code: c.Name.trim(), name: c.Name.trim() }));
    },
  };
}
