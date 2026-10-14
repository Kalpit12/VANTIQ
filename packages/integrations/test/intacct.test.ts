import { describe, expect, it } from "vitest";
import { ConnectorError, intacctClass, intacctConnector, verifyIntacct, type IntacctCredentials } from "../src";

const sender = { senderId: "vantiq", senderPassword: "s3nder" };
const creds: IntacctCredentials = { companyId: "helix-bio", userId: "vantiq_ws", password: "p<w>d&", programDimension: "project" };

const ok = (data: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><response><control><status>success</status></control><operation><authentication><status>success</status></authentication><result><status>success</status><function>x</function>${data}</result></operation></response>`;
const rows = (type: string, items: Record<string, string>[], extra = 'numremaining="0"') =>
  `<data listtype="${type}" count="${items.length}" ${extra}>${items.map((i) => `<${type}>${Object.entries(i).map(([k, v]) => `<${k}>${v}</${k}>`).join("")}</${type}>`).join("")}</data>`;

const ACCOUNTS = [
  { RECORDNO: "1", ACCOUNTNO: "6110", TITLE: "CRO clinical trial services", ACCOUNTTYPE: "incomestatement", NORMALBALANCE: "debit" },
  { RECORDNO: "2", ACCOUNTNO: "4100", TITLE: "Collaboration revenue", ACCOUNTTYPE: "incomestatement", NORMALBALANCE: "credit" },
  { RECORDNO: "3", ACCOUNTNO: "1010", TITLE: "Operating checking", ACCOUNTTYPE: "balancesheet", NORMALBALANCE: "debit" },
];

/** A fake Intacct gateway: answers by the function in the request body and records every request. */
function fakeIntacct(handle: (fn: string, body: string) => string) {
  const bodies: string[] = [];
  const f = (async (_url: string, init: RequestInit) => {
    const body = String(init.body);
    bodies.push(body);
    const fn = /<function controlid="[^"]+">(.*)<\/function>/s.exec(body)![1]!;
    return new Response(handle(fn, body), { status: 200, headers: { "Content-Type": "application/xml" } });
  }) as typeof fetch;
  return { f, bodies };
}

function standard(fn: string) {
  if (fn.includes("<object>GLACCOUNT</object>")) return ok(rows("glaccount", ACCOUNTS));
  if (fn.includes("<object>GLDETAIL</object>")) {
    if (fn.includes("09/01/2026"))
      return ok(
        rows("gldetail", [
          { RECORDNO: "9001", ENTRY_DATE: "09/03/2026", ACCOUNTNO: "6110", ACCOUNTTITLE: "CRO clinical trial services", TR_TYPE: "1", AMOUNT: "125000.00", DESCRIPTION: "Site activation &amp; startup", VENDORNAME: "Meridian Clinical Research", DEPARTMENTTITLE: "Clinical Ops", PROJECTNAME: "HX-101" },
          { RECORDNO: "9002", ENTRY_DATE: "09/15/2026", ACCOUNTNO: "4100", ACCOUNTTITLE: "Collaboration revenue", TR_TYPE: "-1", AMOUNT: "500000.00", DESCRIPTION: "Milestone", VENDORNAME: "", DEPARTMENTTITLE: "", PROJECTNAME: "" },
          { RECORDNO: "9003", ENTRY_DATE: "09/15/2026", ACCOUNTNO: "1010", ACCOUNTTITLE: "Operating checking", TR_TYPE: "1", AMOUNT: "500000.00", DESCRIPTION: "", VENDORNAME: "", DEPARTMENTTITLE: "", PROJECTNAME: "" },
        ]),
      );
    return ok(rows("gldetail", []));
  }
  if (fn.includes("<get_accountbalances>"))
    return ok(
      `<data><accountbalance><glaccountno>6110</glaccountno><debits>125000.00</debits><credits>0</credits><adjdebits>0</adjdebits><adjcredits>0</adjcredits><endbalance>125000.00</endbalance></accountbalance>` +
        `<accountbalance><glaccountno>4100</glaccountno><debits>0</debits><credits>500000.00</credits><adjdebits>0</adjdebits><adjcredits>0</adjcredits><endbalance>-500000.00</endbalance></accountbalance>` +
        `<accountbalance><glaccountno>1010</glaccountno><debits>500000.00</debits><credits>0</credits><adjdebits>0</adjdebits><adjcredits>0</adjcredits><endbalance>2400000.00</endbalance></accountbalance></data>`,
    );
  if (fn.includes("<object>CHECKINGACCOUNT</object>")) return ok(rows("checkingaccount", [{ BANKACCOUNTID: "OPS", GLACCOUNTNO: "1010" }]));
  if (fn.includes("<object>PROJECT</object>")) return ok(rows("project", [{ NAME: "HX-101", STATUS: "active" }, { NAME: "Old study", STATUS: "inactive" }]));
  throw new Error(`unexpected ${fn}`);
}

describe("Sage Intacct connector", () => {
  it("classifies accounts by type and normal balance", () => {
    expect(intacctClass("incomestatement", "credit")).toBe("revenue");
    expect(intacctClass("incomestatement", "debit")).toBe("expense");
    expect(intacctClass("balancesheet", "debit")).toBe("asset");
    expect(intacctClass("other", "debit")).toBeNull();
  });

  it("signs every request with the sender and the company user, escaping XML", async () => {
    const { f, bodies } = fakeIntacct(standard);
    await intacctConnector({ sender, credentials: { ...creds, entityId: "US" }, fetch: f }).listAccounts();
    expect(bodies[0]).toContain("<senderid>vantiq</senderid>");
    expect(bodies[0]).toContain("<companyid>helix-bio</companyid>");
    expect(bodies[0]).toContain("<password>p&lt;w&gt;d&amp;</password>");
    expect(bodies[0]).toContain("<locationid>US</locationid>");
    expect(bodies[0]).toContain("<dtdversion>3.0</dtdversion>");
  });

  it("reads accounts and a month of profit-and-loss lines", async () => {
    const { f } = fakeIntacct(standard);
    const c = intacctConnector({ sender, credentials: creds, fetch: f });
    expect(c.incremental).toBe(false);
    const accounts = await c.listAccounts();
    expect(accounts.map((a) => [a.code, a.classification])).toEqual([["6110", "expense"], ["4100", "revenue"], ["1010", "asset"]]);
    const page = await c.listLines({ from: "2026-09-01", modifiedSince: null, cursor: null });
    expect(page.lines).toEqual([
      { externalId: "9001", date: "2026-09-03", accountCode: "6110", accountName: "CRO clinical trial services", amount: 12_500_000, vendor: "Meridian Clinical Research", memo: "Site activation & startup", department: "Clinical Ops", program: "HX-101" },
      { externalId: "9002", date: "2026-09-15", accountCode: "4100", accountName: "Collaboration revenue", amount: -50_000_000, vendor: "", memo: "Milestone", department: "", program: "" },
    ]);
    expect(page.next).toBe("2026-10");
  });

  it("reports net income and cash from account balances", async () => {
    const { f } = fakeIntacct(standard);
    const c = intacctConnector({ sender, credentials: creds, fetch: f });
    expect(await c.periodNetIncome(["2026-09"])).toEqual(new Map([["2026-09", 37_500_000]]));
    expect(await c.cashBalances!(["2026-09"])).toEqual(new Map([["2026-09", 240_000_000]]));
  });

  it("lists active projects as programs, or classes when picked", async () => {
    const { f, bodies } = fakeIntacct((fn) => (fn.includes("<object>CLASS</object>") ? ok(rows("class", [{ NAME: "Oncology", STATUS: "active" }])) : standard(fn)));
    expect(await intacctConnector({ sender, credentials: creds, fetch: f }).listPrograms!()).toEqual([{ code: "HX-101", name: "HX-101" }]);
    expect(await intacctConnector({ sender, credentials: { ...creds, programDimension: "class" }, fetch: f }).listPrograms!()).toEqual([{ code: "Oncology", name: "Oncology" }]);
    expect(bodies.at(-1)).toContain("<object>CLASS</object>");
  });

  it("follows readMore until nothing remains", async () => {
    const { f, bodies } = fakeIntacct((fn) =>
      fn.includes("<readMore>") ? ok(rows("glaccount", [ACCOUNTS[1]!])) : ok(rows("glaccount", [ACCOUNTS[0]!], 'numremaining="1" resultId="r-77"')),
    );
    expect((await intacctConnector({ sender, credentials: creds, fetch: f }).listAccounts()).map((a) => a.code)).toEqual(["6110", "4100"]);
    expect(bodies[1]).toContain("<resultId>r-77</resultId>");
  });

  it("asks to reconnect when the login is refused, and reports other errors plainly", async () => {
    const refused = fakeIntacct(() => `<response><control><status>success</status></control><operation><authentication><status>failure</status></authentication><errormessage><error><description2>Invalid login</description2></error></errormessage></operation></response>`);
    const err = await verifyIntacct({ sender, credentials: creds, fetch: refused.f }).catch((e) => e);
    expect(err).toBeInstanceOf(ConnectorError);
    expect(err.needsReauth).toBe(true);

    const badSender = fakeIntacct(() => `<response><control><status>failure</status></control><errormessage><error><errorno>XL03000006</errorno><description>Incorrect Intacct XML Partner ID or password.</description></error></errormessage></response>`);
    await expect(verifyIntacct({ sender, credentials: creds, fetch: badSender.f })).rejects.toThrow("Incorrect Intacct XML Partner ID or password.");
  });
});
