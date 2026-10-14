import { XMLParser } from "fast-xml-parser";
import { addMonths, periodOfDate, type Cents, type Period } from "@vantiq/domain";
import { parseAmount } from "../values";
import { ConnectorError, type AccountClass, type Connector, type LinesPage, type LinesQuery, type RemoteAccount, type RemoteProgram } from "./types";

/**
 * Sage Intacct, called directly through its XML Web Services API.
 *
 * - Every request carries two sets of credentials: the Web Services sender id
 *   (Vantiq's, from the Intacct developer licence) and the company's own Web
 *   Services user. Only the second is stored per connection.
 * - Ledger lines come from GLDETAIL, read one month at a time. Every sync
 *   re-reads the window and mirrors it (`incremental: false`), like QuickBooks.
 * - Program is the line's Project or Class, whichever dimension the company
 *   picked when connecting; department is its Department.
 * - Net income and month-end cash come from account balances per month.
 */

export const INTACCT_ENDPOINT = "https://api.intacct.com/ia/xml/xmlgw.phtml";
const PAGE = 1000;

type Fetch = typeof fetch;

export interface IntacctSender {
  senderId: string;
  senderPassword: string;
}

export type IntacctProgramDimension = "project" | "class";

/** What Vantiq seals and stores for a Sage Intacct connection. */
export interface IntacctCredentials {
  companyId: string;
  userId: string;
  password: string;
  /** Entity (location) id for multi-entity companies; empty reads the top level. */
  entityId?: string;
  programDimension: IntacctProgramDimension;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", parseTagValue: false, trimValues: true, isArray: (name, path, _leaf, isAttr) => !isAttr && (/\.data\.[^.]+$/.test(path) || name === "error" || name === "result" || name === "accountbalance") });

type Node = Record<string, unknown>;
const text = (v: unknown): string => (v === undefined || v === null ? "" : typeof v === "object" ? String((v as Node)["#text"] ?? "") : String(v));
const cents = (v: unknown): Cents => {
  const s = text(v).trim();
  return s ? (parseAmount(s) ?? 0) : 0;
};
/** Intacct dates are MM/DD/YYYY. */
const isoDate = (v: unknown) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text(v).trim());
  return m ? `${m[3]}-${m[1]}-${m[2]}` : text(v).trim();
};
const usDate = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const lastDay = (p: Period) => {
  const [y, m] = p.split("-").map(Number);
  return `${p}-${String(new Date(Date.UTC(y!, m!, 0)).getUTCDate()).padStart(2, "0")}`;
};
const dateXml = (tag: string, iso: string) => `<${tag}><year>${iso.slice(0, 4)}</year><month>${Number(iso.slice(5, 7))}</month><day>${Number(iso.slice(8, 10))}</day></${tag}>`;

function errorText(n: unknown) {
  const errs = ((n as Node | undefined)?.error as Node[] | undefined) ?? [];
  return errs.map((e) => [text(e.description), text(e.description2)].filter(Boolean).join(" ")).filter(Boolean).join(" ") || "unknown error";
}

/** Classifies a GLACCOUNT row. Balance-sheet accounts split by normal balance; equity reads as a liability, which Vantiq never syncs either way. */
export function intacctClass(accountType: string, normalBalance: string): AccountClass | null {
  const t = accountType.toLowerCase();
  const n = normalBalance.toLowerCase();
  if (t === "incomestatement") return n === "credit" ? "revenue" : n === "debit" ? "expense" : null;
  if (t === "balancesheet") return n === "debit" ? "asset" : n === "credit" ? "liability" : null;
  return null;
}

export function intacctConnector(opts: { sender: IntacctSender; credentials: IntacctCredentials; fetch?: Fetch; endpoint?: string }): Connector {
  const f = opts.fetch ?? fetch;
  const c = opts.credentials;
  let seq = 0;

  async function call(fn: string): Promise<Node> {
    const id = `vantiq-${++seq}`;
    const body =
      `<?xml version="1.0" encoding="UTF-8"?><request><control><senderid>${esc(opts.sender.senderId)}</senderid><password>${esc(opts.sender.senderPassword)}</password>` +
      `<controlid>${id}</controlid><uniqueid>false</uniqueid><dtdversion>3.0</dtdversion><includewhitespace>false</includewhitespace></control>` +
      `<operation><authentication><login><userid>${esc(c.userId)}</userid><companyid>${esc(c.companyId)}</companyid><password>${esc(c.password)}</password>` +
      (c.entityId ? `<locationid>${esc(c.entityId)}</locationid>` : "") +
      `</login></authentication><content><function controlid="${id}">${fn}</function></content></operation></request>`;
    let res: Response;
    try {
      res = await f(opts.endpoint ?? INTACCT_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/xml" }, body });
    } catch {
      throw new ConnectorError("Could not reach Sage Intacct. Try again in a few minutes.");
    }
    if (res.status === 429) throw new ConnectorError("Sage Intacct is rate limiting requests. Try Sync now again in a minute.");
    if (!res.ok) throw new ConnectorError(`Sage Intacct returned an error (${res.status}).`);
    const doc = parser.parse(await res.text()) as { response?: Node };
    const r = doc.response;
    if (!r) throw new ConnectorError("Sage Intacct sent a response Vantiq could not read.");
    const control = r.control as Node | undefined;
    if (text(control?.status) !== "success") throw new ConnectorError(`Sage Intacct refused the request: ${errorText(r.errormessage)}`);
    const op = r.operation as Node | undefined;
    const auth = op?.authentication as Node | undefined;
    if (text(auth?.status) !== "success") throw new ConnectorError("Sage Intacct did not accept the company ID, user or password.", true);
    const result = ((op?.result as Node[] | undefined) ?? [])[0];
    if (!result) throw new ConnectorError("Sage Intacct sent an empty response.");
    if (text(result.status) !== "success") {
      const msg = errorText(result.errormessage);
      if (/permission|not authorized|authorization/i.test(msg)) throw new ConnectorError(`The Sage Intacct user lacks permission: ${msg}`, true);
      throw new ConnectorError(`Sage Intacct returned an error: ${msg}`);
    }
    return result;
  }

  /** Reads every row of an object through readByQuery and readMore. */
  async function readAll(object: string, fields: string[], query = ""): Promise<Node[]> {
    const out: Node[] = [];
    let result = await call(`<readByQuery><object>${object}</object><fields>${fields.join(",")}</fields><query>${esc(query)}</query><pagesize>${PAGE}</pagesize></readByQuery>`);
    for (;;) {
      const data = result.data as Node | undefined;
      const rows = (data?.[object.toLowerCase()] as Node[] | undefined) ?? [];
      out.push(...rows);
      const remaining = Number(text(data?.["@numremaining"]) || 0);
      const resultId = text(data?.["@resultId"]);
      if (!remaining || !resultId) return out;
      result = await call(`<readMore><resultId>${esc(resultId)}</resultId></readMore>`);
    }
  }

  let accountsP: Promise<RemoteAccount[]> | null = null;
  const accounts = () =>
    (accountsP ??= readAll("GLACCOUNT", ["RECORDNO", "ACCOUNTNO", "TITLE", "ACCOUNTTYPE", "NORMALBALANCE"]).then((rows) =>
      rows.map((a) => ({
        externalId: text(a.ACCOUNTNO) || text(a.RECORDNO),
        code: text(a.ACCOUNTNO),
        name: text(a.TITLE),
        classification: intacctClass(text(a.ACCOUNTTYPE), text(a.NORMALBALANCE)),
      })),
    ));

  async function balances(period: Period) {
    const r = await call(`<get_accountbalances>${dateXml("startdate", `${period}-01`)}${dateXml("enddate", lastDay(period))}</get_accountbalances>`);
    return ((r.data as Node | undefined)?.accountbalance as Node[] | undefined) ?? [];
  }

  const programField = c.programDimension === "class" ? "CLASSNAME" : "PROJECTNAME";

  return {
    systemName: "Sage Intacct",
    incremental: false,
    listAccounts: accounts,
    async listLines(q: LinesQuery): Promise<LinesPage> {
      const period = q.cursor ?? periodOfDate(q.from);
      const thisMonth = periodOfDate(new Date().toISOString().slice(0, 10));
      const start = `${period}-01` < q.from ? q.from : `${period}-01`;
      const byCode = new Map((await accounts()).map((a) => [a.code, a]));
      const rows = await readAll(
        "GLDETAIL",
        ["RECORDNO", "ENTRY_DATE", "ACCOUNTNO", "ACCOUNTTITLE", "TR_TYPE", "AMOUNT", "DEBITAMOUNT", "CREDITAMOUNT", "DESCRIPTION", "VENDORNAME", "DEPARTMENTTITLE", programField],
        `ENTRY_DATE >= '${usDate(start)}' AND ENTRY_DATE <= '${usDate(lastDay(period))}'`,
      );
      const lines: LinesPage["lines"] = [];
      for (const r of rows) {
        const code = text(r.ACCOUNTNO);
        const acct = byCode.get(code);
        if (acct && acct.classification !== null && acct.classification !== "revenue" && acct.classification !== "expense") continue;
        const trType = text(r.TR_TYPE).trim();
        const amount = trType ? Math.sign(Number(trType)) * cents(r.AMOUNT) : cents(r.DEBITAMOUNT) - cents(r.CREDITAMOUNT);
        if (!amount) continue;
        lines.push({
          externalId: text(r.RECORDNO),
          date: isoDate(r.ENTRY_DATE),
          accountCode: code,
          accountName: acct?.name || text(r.ACCOUNTTITLE),
          amount,
          vendor: text(r.VENDORNAME),
          memo: text(r.DESCRIPTION),
          department: text(r.DEPARTMENTTITLE),
          program: text(r[programField]),
        });
      }
      return { lines, deleted: [], next: period < thisMonth ? addMonths(period, 1) : null };
    },
    async periodNetIncome(periods: Period[]) {
      const pl = new Set((await accounts()).filter((a) => a.classification === "revenue" || a.classification === "expense").map((a) => a.code));
      const out = new Map<Period, Cents>();
      for (const p of periods) {
        let net = 0;
        for (const b of await balances(p)) if (pl.has(text(b.glaccountno))) net += cents(b.credits) + cents(b.adjcredits) - cents(b.debits) - cents(b.adjdebits);
        out.set(p, net);
      }
      return out;
    },
    async cashBalances(periods: Period[]) {
      const cash = new Set((await readAll("CHECKINGACCOUNT", ["BANKACCOUNTID", "GLACCOUNTNO"])).map((b) => text(b.GLACCOUNTNO)).filter(Boolean));
      const out = new Map<Period, Cents>();
      if (!cash.size) return out;
      for (const p of periods) {
        let total = 0;
        for (const b of await balances(p)) if (cash.has(text(b.glaccountno))) total += cents(b.endbalance);
        out.set(p, total);
      }
      return out;
    },
    async listPrograms(): Promise<RemoteProgram[]> {
      const [object, name] = c.programDimension === "class" ? ["CLASS", "NAME"] : ["PROJECT", "NAME"];
      const rows = await readAll(object, [name, "STATUS"]);
      return rows.filter((r) => text(r.STATUS).toLowerCase() !== "inactive" && text(r[name]).trim()).map((r) => ({ code: text(r[name]).trim(), name: text(r[name]).trim() }));
    },
  };
}

/** Signs in and reads the chart of accounts once, so a bad credential fails at connect time. */
export async function verifyIntacct(opts: Parameters<typeof intacctConnector>[0]) {
  const accounts = await intacctConnector(opts).listAccounts();
  if (!accounts.length) throw new ConnectorError("Sage Intacct signed in but returned no GL accounts. Check the user's permissions.");
  return accounts.length;
}
