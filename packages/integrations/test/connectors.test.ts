import { generateSampleCompany } from "@vantiq/fixtures";
import { describe, expect, it } from "vitest";
import { createMergeLinkToken, ConnectorError, exchangeMergePublicToken, mergeConnector, sandboxConnector, syncWindowStart, type Connector, type RemoteLine } from "../src";

async function allLines(c: Connector, from = "2000-01-01") {
  const out: RemoteLine[] = [];
  let cursor: string | null = null;
  do {
    const page = await c.listLines({ from, modifiedSince: null, cursor });
    out.push(...page.lines);
    cursor = page.next;
  } while (cursor);
  return out;
}

describe("sandbox connector", () => {
  it("serves every sample transaction across pages, debit-positive", async () => {
    const data = generateSampleCompany();
    const lines = await allLines(sandboxConnector({ pageSize: 97 }));
    expect(lines).toHaveLength(data.transactions.length);
    expect(new Set(lines.map((l) => l.externalId)).size).toBe(lines.length);
    expect(lines.filter((l) => l.accountCode.startsWith("4")).every((l) => l.amount < 0)).toBe(true);
  });

  it("reports net income that matches its own lines, plus any injected drift", async () => {
    const c = sandboxConnector({ reportedDrift: { "2026-09": 25_000 } });
    const lines = await allLines(c);
    const ni = await c.periodNetIncome(["2026-08", "2026-09"]);
    const sum = (p: string) => -lines.filter((l) => l.date.startsWith(p)).reduce((s, l) => s + l.amount, 0);
    expect(ni.get("2026-08")).toBe(sum("2026-08"));
    expect(ni.get("2026-09")).toBe(sum("2026-09") + 25_000);
  });

  it("only reads lines inside the window", async () => {
    const lines = await allLines(sandboxConnector(), "2026-01-01");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l.date >= "2026-01-01")).toBe(true);
  });
});

describe("sync window", () => {
  it("covers 24 calendar months ending with the current one", () => {
    expect(syncWindowStart("2026-10-13")).toBe("2024-11-01");
    expect(syncWindowStart("2026-01-31", 12)).toBe("2025-02-01");
  });
});

/** A fake Merge API: routes by path, records every request. */
function fakeMerge(routes: Record<string, (url: URL) => unknown>, status = 200) {
  const calls: { url: URL; headers: Record<string, string>; method: string; body?: string }[] = [];
  const f = (async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    calls.push({ url, headers: init?.headers as Record<string, string>, method: init?.method ?? "GET", body: init?.body as string | undefined });
    const key = Object.keys(routes).find((k) => url.pathname.endsWith(k));
    if (status !== 200) return new Response("{}", { status });
    if (!key) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(routes[key]!(url)), { status: 200 });
  }) as typeof fetch;
  return { f, calls };
}

const ACCOUNTS = [
  { id: "a1", name: "CRO clinical trial services", account_number: "6110", classification: "EXPENSE" },
  { id: "a2", name: "Collaboration revenue", account_number: "4100", classification: "REVENUE" },
  { id: "a3", name: "Operating cash", account_number: "1010", classification: "ASSET" },
  { id: "a4", name: "Lab supplies", account_number: null, classification: "EXPENSE" },
];
const TRACKING = [
  { id: "t1", name: "HX-101", category_type: "CLASS" },
  { id: "t2", name: "Clinical Operations", category_type: "DEPARTMENT" },
];
const CONTACTS = [{ id: "c1", name: "Meridian Clinical Research" }];
const GL = [
  {
    id: "g1",
    posting_date: "2026-09-03T00:00:00Z",
    general_ledger_transaction_lines: [
      { id: "l1", account: "a1", contact: "c1", description: "Site activation, invoice 2231", debit_amount: "125000.00", credit_amount: "0", tracking_categories: ["t1", "t2"] },
      { id: "l2", account: "a3", contact: "c1", description: "Cash out", debit_amount: "0", credit_amount: "125000.00", tracking_categories: [] },
    ],
  },
  {
    id: "g2",
    posting_date: "2026-09-25",
    general_ledger_transaction_lines: [{ id: "l3", account: "a2", contact: null, description: "Milestone", debit_amount: null, credit_amount: "500000", tracking_categories: null }],
  },
  { id: "g3", posting_date: "2026-09-26", remote_was_deleted: true, general_ledger_transaction_lines: [{ id: "l4", account: "a1", debit_amount: "10", credit_amount: "0" }] },
  { id: "g4", posting_date: "2023-01-05", general_ledger_transaction_lines: [{ id: "l5", account: "a4", debit_amount: "10", credit_amount: "0" }] },
];

describe("Merge connector (against a recorded-shape fake, not the live API)", () => {
  const routes = {
    "/accounting/v1/accounts": () => ({ next: null, results: ACCOUNTS }),
    "/accounting/v1/tracking-categories": () => ({ next: null, results: TRACKING }),
    "/accounting/v1/contacts": () => ({ next: null, results: CONTACTS }),
    "/accounting/v1/general-ledger-transactions": (u: URL) =>
      u.searchParams.get("cursor") ? { next: null, results: GL.slice(2) } : { next: "page2", results: GL.slice(0, 2) },
    "/accounting/v1/income-statements": () => ({
      next: null,
      results: [
        { start_period: "2026-09-01T00:00:00Z", end_period: "2026-09-30T00:00:00Z", net_income: "375000.00" },
        { start_period: "2026-01-01T00:00:00Z", end_period: "2026-09-30T00:00:00Z", net_income: "1" },
      ],
    }),
  };

  it("sends the API key and account token, and pages with Merge's cursor", async () => {
    const { f, calls } = fakeMerge(routes);
    const c = mergeConnector({ apiKey: "key", accountToken: "acct", systemName: "QuickBooks Online", fetch: f });
    const p1 = await c.listLines({ from: "2024-11-01", modifiedSince: null, cursor: null });
    expect(p1.next).toBe("page2");
    const p2 = await c.listLines({ from: "2024-11-01", modifiedSince: null, cursor: p1.next });
    expect(p2.next).toBeNull();
    expect(calls.every((x) => x.headers.Authorization === "Bearer key" && x.headers["X-Account-Token"] === "acct")).toBe(true);
    expect(calls.find((x) => x.url.searchParams.get("cursor"))?.url.searchParams.get("cursor")).toBe("page2");
  });

  it("keeps profit-and-loss lines only, debit-positive, with vendor, department and program", async () => {
    const { f } = fakeMerge(routes);
    const c = mergeConnector({ apiKey: "key", accountToken: "acct", systemName: "QBO", fetch: f });
    const p1 = await c.listLines({ from: "2024-11-01", modifiedSince: null, cursor: null });
    expect(p1.lines).toEqual([
      { externalId: "l1", date: "2026-09-03", accountCode: "6110", accountName: "CRO clinical trial services", amount: 12_500_000, vendor: "Meridian Clinical Research", memo: "Site activation, invoice 2231", department: "Clinical Operations", program: "HX-101" },
      { externalId: "l3", date: "2026-09-25", accountCode: "4100", accountName: "Collaboration revenue", amount: -50_000_000, vendor: "", memo: "Milestone", department: "", program: "" },
    ]);
    const p2 = await c.listLines({ from: "2024-11-01", modifiedSince: null, cursor: "page2" });
    // Deleted transactions come back as deletions; lines before the window are dropped.
    expect(p2.lines).toEqual([]);
    expect(p2.deleted).toEqual(["l4"]);
  });

  it("asks only for changes when it has a cursor time", async () => {
    const { f, calls } = fakeMerge(routes);
    const c = mergeConnector({ apiKey: "key", accountToken: "acct", systemName: "QBO", fetch: f });
    await c.listLines({ from: "2024-11-01", modifiedSince: "2026-10-01T00:00:00.000Z", cursor: null });
    const gl = calls.find((x) => x.url.pathname.endsWith("general-ledger-transactions"))!;
    expect(gl.url.searchParams.get("modified_after")).toBe("2026-10-01T00:00:00.000Z");
    expect(gl.url.searchParams.get("include_deleted_data")).toBe("true");
  });

  it("falls back to the account name when there is no account number, and lists classes as programs", async () => {
    const { f } = fakeMerge(routes);
    const c = mergeConnector({ apiKey: "key", accountToken: "acct", systemName: "QBO", fetch: f });
    expect((await c.listAccounts()).find((a) => a.externalId === "a4")).toEqual({ externalId: "a4", code: "Lab supplies", name: "Lab supplies", classification: "expense" });
    expect(await c.listPrograms!()).toEqual([{ code: "HX-101", name: "HX-101" }]);
  });

  it("reads single-month income statements only", async () => {
    const { f } = fakeMerge(routes);
    const c = mergeConnector({ apiKey: "key", accountToken: "acct", systemName: "QBO", fetch: f });
    expect(await c.periodNetIncome(["2026-08", "2026-09"])).toEqual(new Map([["2026-09", 37_500_000]]));
  });

  it("turns revoked access into a reconnect message", async () => {
    const { f } = fakeMerge(routes, 401);
    const c = mergeConnector({ apiKey: "key", accountToken: "acct", systemName: "QBO", fetch: f });
    const err = await c.listAccounts().catch((e) => e);
    expect(err).toBeInstanceOf(ConnectorError);
    expect(err.needsReauth).toBe(true);
  });

  it("creates a link token and exchanges the public token", async () => {
    const { f, calls } = fakeMerge({
      "/integrations/create-link-token": () => ({ link_token: "lt_123" }),
      "/integrations/account-token/pub_9": () => ({ account_token: "acct_9", integration: { name: "Xero", slug: "xero" } }),
    });
    expect(await createMergeLinkToken("key", { id: "co1", name: "Helixa", email: "cfo@helixa.bio" }, f)).toBe("lt_123");
    expect(JSON.parse(calls[0]!.body!)).toEqual({ end_user_origin_id: "co1", end_user_organization_name: "Helixa", end_user_email_address: "cfo@helixa.bio", categories: ["accounting"] });
    expect(await exchangeMergePublicToken("key", "pub_9", f)).toEqual({ accountToken: "acct_9", systemName: "Xero", slug: "xero" });
  });
});
