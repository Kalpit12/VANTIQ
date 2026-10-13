import { describe, expect, it } from "vitest";
import { ConnectorError, exchangeQuickbooksCode, quickbooksAuthUrl, quickbooksConnector, type QuickbooksTokens } from "../src";

const app = { clientId: "cid", clientSecret: "secret", redirectUri: "https://app.example/api/connect/quickbooks/callback" };
const fresh = (): QuickbooksTokens => ({ accessToken: "at1", refreshToken: "rt1", expiresAt: Date.now() + 3600_000 });

const ACCOUNTS = [
  { Id: "45", Name: "CRO clinical trial services", AcctNum: "6110", Classification: "Expense" },
  { Id: "46", Name: "Collaboration revenue", AcctNum: "4100", Classification: "Revenue" },
  { Id: "35", Name: "Checking", Classification: "Asset" },
  { Id: "47", Name: "Lab supplies", Classification: "Expense" },
];

const GL_COLUMNS = ["tx_date", "txn_type", "name", "memo", "klass_name", "dept_name", "account_name", "debt_amt", "credit_amt", "subt_nat_amount"].map((k) => ({
  ColTitle: k,
  MetaData: [{ Name: "ColKey", Value: k }],
}));
const row = (date: string, type: [string, string], name: string, memo: string, klass: string, dept: string, acct: [string, string], debit: string, credit: string) => ({
  type: "Data",
  ColData: [{ value: date }, { value: type[0], id: type[1] }, { value: name }, { value: memo }, { value: klass }, { value: dept }, { value: acct[0], id: acct[1] }, { value: debit }, { value: credit }, { value: "" }],
});
const GL_SEP = {
  Columns: { Column: GL_COLUMNS },
  Rows: {
    Row: [
      {
        type: "Section",
        Header: { ColData: [{ value: "6110 CRO clinical trial services", id: "45" }] },
        Rows: {
          Row: [
            { type: "Data", ColData: [{ value: "Beginning Balance" }] },
            row("2026-09-03", ["Bill", "901"], "Meridian Clinical Research", "Site activation", "HX-101", "Clinical Ops", ["CRO clinical trial services", "45"], "125000.00", ""),
            row("2026-09-03", ["Bill", "901"], "Meridian Clinical Research", "Site activation, second line", "HX-101", "Clinical Ops", ["CRO clinical trial services", "45"], "5000.00", ""),
          ],
        },
        Summary: { ColData: [{ value: "Total for 6110" }] },
      },
      {
        type: "Section",
        Header: { ColData: [{ value: "4100 Collaboration revenue", id: "46" }] },
        Rows: { Row: [row("2026-09-25", ["Invoice", "77"], "Partner Pharma", "Milestone", "", "", ["Collaboration revenue", "46"], "", "500000.00")] },
      },
      {
        type: "Section",
        Header: { ColData: [{ value: "Checking", id: "35" }] },
        Rows: { Row: [row("2026-09-03", ["Bill Payment", "902"], "Meridian", "", "", "", ["Checking", "35"], "", "125000.00")] },
      },
    ],
  },
};
const PL = {
  Columns: {
    Column: [
      { ColTitle: "", ColType: "Account" },
      { ColTitle: "Aug 2026", ColType: "Money", MetaData: [{ Name: "StartDate", Value: "2026-08-01" }, { Name: "EndDate", Value: "2026-08-31" }] },
      { ColTitle: "Sep 2026", ColType: "Money", MetaData: [{ Name: "StartDate", Value: "2026-09-01" }, { Name: "EndDate", Value: "2026-09-30" }] },
      { ColTitle: "Total", ColType: "Money" },
    ],
  },
  Rows: { Row: [{ type: "Section", group: "Income" }, { type: "Section", group: "NetIncome", Summary: { ColData: [{ value: "Net Income" }, { value: "" }, { value: "370000.00" }, { value: "370000.00" }] } }] },
};

function fakeQuickbooks(opts: { expireFirst?: boolean } = {}) {
  const calls: { url: URL; auth: string; body?: string }[] = [];
  let first = true;
  const f = (async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const auth = (init?.headers as Record<string, string>).Authorization ?? "";
    calls.push({ url, auth, body: init?.body as string | undefined });
    const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status });
    if (url.pathname.endsWith("/tokens/bearer")) return json({ access_token: "at2", refresh_token: "rt2", expires_in: 3600 });
    if (opts.expireFirst && first && auth === "Bearer at1") {
      first = false;
      return json({ fault: "expired" }, 401);
    }
    if (url.pathname.endsWith("/query")) {
      const q = url.searchParams.get("query")!;
      if (q.includes("from Account")) return json({ QueryResponse: { Account: ACCOUNTS } });
      if (q.includes("from Class")) return json({ QueryResponse: { Class: [{ Name: "HX-101", Active: true }, { Name: "Old", Active: false }] } });
    }
    if (url.pathname.endsWith("/reports/GeneralLedger")) return json(url.searchParams.get("start_date")!.startsWith("2026-09") ? GL_SEP : { Columns: { Column: GL_COLUMNS }, Rows: {} });
    if (url.pathname.endsWith("/reports/ProfitAndLoss")) return json(PL);
    return json({}, 404);
  }) as typeof fetch;
  return { f, calls };
}

const creds = () => ({ realmId: "9130", environment: "sandbox" as const, tokens: fresh() });

describe("QuickBooks connector (against fakes shaped like Intuit's API, not the live service)", () => {
  it("builds the Intuit sign-in link and exchanges the code for tokens", async () => {
    const u = new URL(quickbooksAuthUrl(app, "st8"));
    expect(u.origin + u.pathname).toBe("https://appcenter.intuit.com/connect/oauth2");
    expect(Object.fromEntries(u.searchParams)).toEqual({ client_id: "cid", response_type: "code", scope: "com.intuit.quickbooks.accounting", redirect_uri: app.redirectUri, state: "st8" });
    const { f, calls } = fakeQuickbooks();
    const t = await exchangeQuickbooksCode(app, "code123", f);
    expect(t).toMatchObject({ accessToken: "at2", refreshToken: "rt2" });
    expect(calls[0]!.auth).toBe(`Basic ${Buffer.from("cid:secret").toString("base64")}`);
    expect(new URLSearchParams(calls[0]!.body)).toEqual(new URLSearchParams({ grant_type: "authorization_code", code: "code123", redirect_uri: app.redirectUri }));
  });

  it("reads one month of the General Ledger: P&L lines only, debit-positive, with vendor, class and department", async () => {
    const { f, calls } = fakeQuickbooks();
    const c = quickbooksConnector({ app, credentials: creds(), fetch: f });
    const page = await c.listLines({ from: "2026-09-01", modifiedSince: null, cursor: null });
    expect(page.lines).toEqual([
      { externalId: "Bill:901:45:1", date: "2026-09-03", accountCode: "6110", accountName: "CRO clinical trial services", amount: 12_500_000, vendor: "Meridian Clinical Research", memo: "Site activation", department: "Clinical Ops", program: "HX-101" },
      { externalId: "Bill:901:45:2", date: "2026-09-03", accountCode: "6110", accountName: "CRO clinical trial services", amount: 500_000, vendor: "Meridian Clinical Research", memo: "Site activation, second line", department: "Clinical Ops", program: "HX-101" },
      { externalId: "Invoice:77:46:1", date: "2026-09-25", accountCode: "4100", accountName: "Collaboration revenue", amount: -50_000_000, vendor: "Partner Pharma", memo: "Milestone", department: "", program: "" },
    ]);
    expect(page.next).toBe("2026-10");
    const gl = calls.find((x) => x.url.pathname.endsWith("GeneralLedger"))!;
    expect(gl.url.pathname).toBe("/v3/company/9130/reports/GeneralLedger");
    expect(gl.url.origin).toBe("https://sandbox-quickbooks.api.intuit.com");
    expect([gl.url.searchParams.get("start_date"), gl.url.searchParams.get("end_date")]).toEqual(["2026-09-01", "2026-09-30"]);
  });

  it("reads monthly net income from the Profit and Loss report, zero for quiet months", async () => {
    const { f } = fakeQuickbooks();
    const c = quickbooksConnector({ app, credentials: creds(), fetch: f });
    expect(await c.periodNetIncome(["2026-08", "2026-09"])).toEqual(
      new Map([
        ["2026-08", 0],
        ["2026-09", 37_000_000],
      ]),
    );
  });

  it("refreshes an expired access token once and hands the new tokens back for storing", async () => {
    const { f } = fakeQuickbooks({ expireFirst: true });
    const saved: QuickbooksTokens[] = [];
    const c = quickbooksConnector({ app, credentials: creds(), fetch: f, onTokens: async (t) => void saved.push(t) });
    expect((await c.listAccounts()).map((a) => a.code)).toEqual(["6110", "4100", "Checking", "Lab supplies"]);
    expect(saved.map((t) => t.accessToken)).toEqual(["at2"]);
  });

  it("asks for reconnection when the refresh token is no longer valid", async () => {
    const f = (async () => new Response("{}", { status: 400 })) as typeof fetch;
    const c = quickbooksConnector({ app, credentials: { ...creds(), tokens: { ...fresh(), expiresAt: 0 } }, fetch: f });
    const err = await c.listAccounts().catch((e) => e);
    expect(err).toBeInstanceOf(ConnectorError);
    expect(err.needsReauth).toBe(true);
  });

  it("lists active classes as programs", async () => {
    const { f } = fakeQuickbooks();
    const c = quickbooksConnector({ app, credentials: creds(), fetch: f });
    expect(await c.listPrograms!()).toEqual([{ code: "HX-101", name: "HX-101" }]);
  });
});
