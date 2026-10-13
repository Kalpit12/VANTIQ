import { addMonths, periodOfDate, type Cents, type Period } from "@vantiq/domain";
import { parseAmount } from "../values";
import { ConnectorError, type AccountClass, type Connector, type LinesPage, type LinesQuery, type RemoteAccount, type RemoteProgram } from "./types";

/**
 * Merge's unified accounting API (https://docs.merge.dev/accounting/), which
 * fronts QuickBooks Online, Xero, NetSuite and Sage Intacct with one schema.
 * Merge holds the customer's OAuth credentials; Vantiq keeps only the
 * per-connection account token, encrypted.
 *
 * Mapping from Merge's schema:
 * - Ledger lines come from General Ledger Transactions, which cover every
 *   posting (bills, invoices, journal entries), not just manual journals.
 * - Department is the tracking category of type DEPARTMENT; program is the
 *   tracking category of type CLASS, which is how most biotechs tag projects.
 * - Net income per month comes from Merge's Income Statement reports.
 */

const BASE = "https://api.merge.dev/api";
const PAGE_SIZE = 100;

type Fetch = typeof fetch;

export interface MergeOptions {
  apiKey: string;
  accountToken: string;
  systemName: string;
  fetch?: Fetch;
}

interface Page<T> {
  next: string | null;
  results: T[];
}

interface MergeAccount {
  id: string;
  name: string | null;
  account_number: string | null;
  classification: string | null;
  remote_was_deleted?: boolean;
}

interface MergeTracking {
  id: string;
  name: string | null;
  category_type: string | null;
  remote_was_deleted?: boolean;
}

interface MergeContact {
  id: string;
  name: string | null;
}

interface MergeGlLine {
  id: string;
  account: string | null;
  contact: string | null;
  description: string | null;
  debit_amount: string | number | null;
  credit_amount: string | number | null;
  tracking_categories: string[] | null;
  remote_was_deleted?: boolean;
}

interface MergeGlTransaction {
  id: string;
  posting_date: string | null;
  general_ledger_transaction_lines: MergeGlLine[] | null;
  remote_was_deleted?: boolean;
}

interface MergeIncomeStatement {
  start_period: string | null;
  end_period: string | null;
  net_income: string | number | null;
  remote_was_deleted?: boolean;
}

const CLASSES: Record<string, AccountClass> = { REVENUE: "revenue", EXPENSE: "expense", ASSET: "asset", LIABILITY: "liability", EQUITY: "equity" };

const cents = (v: string | number | null | undefined): Cents => (v === null || v === undefined || v === "" ? 0 : (parseAmount(String(v)) ?? 0));

/** Calls Merge with the API key and an optional account token, turning failures into messages a finance user can act on. */
async function call<T>(f: Fetch, apiKey: string, accountToken: string | null, path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  if (accountToken) headers["X-Account-Token"] = accountToken;
  if (init?.body) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await f(path.startsWith("http") ? path : `${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ConnectorError("Could not reach Merge. Try again in a few minutes.");
  }
  if (res.status === 401 || res.status === 403) throw new ConnectorError("Access to the accounting system was revoked or has expired. Reconnect it.", true);
  if (res.status === 429) throw new ConnectorError("The accounting system is rate limiting requests. The next sync will pick up where this one stopped.");
  if (!res.ok) throw new ConnectorError(`Merge returned an error (${res.status}).`);
  return (await res.json()) as T;
}

/** Creates a short-lived token that opens Merge Link for one company, optionally straight to one system. */
export async function createMergeLinkToken(apiKey: string, company: { id: string; name: string; email: string }, f: Fetch = fetch, integration?: string) {
  const body: Record<string, unknown> = { end_user_origin_id: company.id, end_user_organization_name: company.name, end_user_email_address: company.email, categories: ["accounting"] };
  if (integration) body.integration = integration;
  const r = await call<{ link_token: string }>(f, apiKey, null, "/integrations/create-link-token", { method: "POST", body: JSON.stringify(body) });
  return r.link_token;
}

/** Swaps the public token Merge Link hands the browser for the account token used on every call. */
export async function exchangeMergePublicToken(apiKey: string, publicToken: string, f: Fetch = fetch) {
  const r = await call<{ account_token: string; integration?: { name?: string; slug?: string } }>(f, apiKey, null, `/integrations/account-token/${encodeURIComponent(publicToken)}`);
  return { accountToken: r.account_token, systemName: r.integration?.name ?? "Accounting system", slug: r.integration?.slug ?? "" };
}

export function mergeConnector(opts: MergeOptions): Connector {
  const f = opts.fetch ?? fetch;
  const get = <T>(path: string) => call<T>(f, opts.apiKey, opts.accountToken, path);

  async function all<T>(path: string): Promise<T[]> {
    const out: T[] = [];
    let url: string | null = `${path}${path.includes("?") ? "&" : "?"}page_size=${PAGE_SIZE}`;
    while (url) {
      const page: Page<T> = await get<Page<T>>(url);
      out.push(...page.results);
      url = page.next ? `${path}${path.includes("?") ? "&" : "?"}page_size=${PAGE_SIZE}&cursor=${encodeURIComponent(page.next)}` : null;
    }
    return out;
  }

  // Lookups are read once per connector, which lives for one sync.
  let lookups: Promise<{ accounts: Map<string, MergeAccount>; contacts: Map<string, string>; tracking: Map<string, MergeTracking> }> | null = null;
  const loadLookups = () =>
    (lookups ??= (async () => {
      const [accounts, contacts, tracking] = await Promise.all([all<MergeAccount>("/accounting/v1/accounts"), all<MergeContact>("/accounting/v1/contacts"), all<MergeTracking>("/accounting/v1/tracking-categories")]);
      return {
        accounts: new Map(accounts.map((a) => [a.id, a])),
        contacts: new Map(contacts.map((c) => [c.id, c.name ?? ""])),
        tracking: new Map(tracking.map((t) => [t.id, t])),
      };
    })());

  const toAccount = (a: MergeAccount): RemoteAccount => ({
    externalId: a.id,
    code: (a.account_number ?? "").trim() || (a.name ?? "").trim() || a.id,
    name: (a.name ?? "").trim(),
    classification: (a.classification && CLASSES[a.classification.toUpperCase()]) || null,
  });

  return {
    systemName: opts.systemName,
    incremental: true,
    async listAccounts() {
      const { accounts } = await loadLookups();
      return [...accounts.values()].filter((a) => !a.remote_was_deleted).map(toAccount);
    },

    async listLines(q: LinesQuery): Promise<LinesPage> {
      const { accounts, contacts, tracking } = await loadLookups();
      const params = new URLSearchParams({ page_size: String(PAGE_SIZE), expand: "general_ledger_transaction_lines" });
      if (q.modifiedSince) {
        params.set("modified_after", q.modifiedSince);
        params.set("include_deleted_data", "true");
      }
      if (q.cursor) params.set("cursor", q.cursor);
      const page = await get<Page<MergeGlTransaction>>(`/accounting/v1/general-ledger-transactions?${params}`);
      const lines: LinesPage["lines"] = [];
      const deleted: string[] = [];
      for (const t of page.results) {
        for (const l of t.general_ledger_transaction_lines ?? []) {
          if (t.remote_was_deleted || l.remote_was_deleted) {
            deleted.push(l.id);
            continue;
          }
          const acct = l.account ? accounts.get(l.account) : undefined;
          // Merge has no posting-date filter on this endpoint, so the window is applied here.
          if (!acct || !t.posting_date || t.posting_date.slice(0, 10) < q.from) continue;
          const a = toAccount(acct);
          if (a.classification !== null && a.classification !== "revenue" && a.classification !== "expense") continue;
          const tags = (l.tracking_categories ?? []).map((id) => tracking.get(id)).filter((x): x is MergeTracking => Boolean(x));
          const tag = (type: string) => tags.find((x) => x.category_type?.toUpperCase() === type)?.name?.trim() ?? "";
          lines.push({
            externalId: l.id,
            date: t.posting_date.slice(0, 10),
            accountCode: a.code,
            accountName: a.name,
            amount: cents(l.debit_amount) - cents(l.credit_amount),
            vendor: (l.contact && contacts.get(l.contact)) || "",
            memo: (l.description ?? "").trim(),
            department: tag("DEPARTMENT"),
            program: tag("CLASS"),
          });
        }
      }
      return { lines, deleted, next: page.next };
    },

    async periodNetIncome(periods: Period[]) {
      const want = new Set(periods);
      const out = new Map<Period, Cents>();
      for (const s of await all<MergeIncomeStatement>("/accounting/v1/income-statements")) {
        if (s.remote_was_deleted || !s.start_period || !s.end_period) continue;
        const p = periodOfDate(s.start_period.slice(0, 10));
        // Only single-month reports can be compared with one month of lines.
        if (periodOfDate(s.end_period.slice(0, 10)) !== p || !want.has(p)) continue;
        out.set(p, cents(s.net_income));
      }
      return out;
    },

    async listPrograms(): Promise<RemoteProgram[]> {
      const { tracking } = await loadLookups();
      return [...tracking.values()]
        .filter((t) => !t.remote_was_deleted && t.category_type?.toUpperCase() === "CLASS" && t.name?.trim())
        .map((t) => ({ code: t.name!.trim(), name: t.name!.trim() }));
    },
  };
}

/** First day of the sync window: the start of the month 23 months before `today`'s month, so 24 months in all. */
export function syncWindowStart(today: string, months = 24): string {
  return `${addMonths(periodOfDate(today), -(months - 1))}-01`;
}
