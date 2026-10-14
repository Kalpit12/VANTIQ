// A stand-in for Sage Intacct's XML gateway, for the workspace e2e run.
// Answers the calls Vantiq makes with one month of books: last month's CRO bill and a milestone payment.
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3199);
// The only Web Services user secret this fake accepts; set by playwright.config.ts.
const accepted = process.env.FAKE_INTACCT_ACCEPTS ?? "";
const now = new Date();
const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
const y = last.getUTCFullYear();
const m = last.getUTCMonth() + 1;
const mm = String(m).padStart(2, "0");

const ok = (data) => `<response><control><status>success</status></control><operation><authentication><status>success</status></authentication><result><status>success</status>${data}</result></operation></response>`;
const rows = (type, items) => `<data count="${items.length}" numremaining="0">${items.map((i) => `<${type}>${Object.entries(i).map(([k, v]) => `<${k}>${v}</${k}>`).join("")}</${type}>`).join("")}</data>`;
const refused = `<response><control><status>success</status></control><operation><authentication><status>failure</status></authentication><errormessage><error><description2>Invalid Web Services Authorization</description2></error></errormessage></operation></response>`;

function answer(body) {
  if (!accepted || !body.includes(`<password>${accepted}</password>`)) return refused;
  if (body.includes("<object>GLACCOUNT</object>"))
    return ok(rows("glaccount", [
      { ACCOUNTNO: "6110", TITLE: "CRO clinical trial services", ACCOUNTTYPE: "incomestatement", NORMALBALANCE: "debit" },
      { ACCOUNTNO: "4100", TITLE: "Collaboration revenue", ACCOUNTTYPE: "incomestatement", NORMALBALANCE: "credit" },
      { ACCOUNTNO: "1010", TITLE: "Operating checking", ACCOUNTTYPE: "balancesheet", NORMALBALANCE: "debit" },
    ]));
  if (body.includes("<object>GLDETAIL</object>"))
    return ok(rows("gldetail", body.includes(`${mm}/01/${y}`)
      ? [
          { RECORDNO: "9001", ENTRY_DATE: `${mm}/03/${y}`, ACCOUNTNO: "6110", TR_TYPE: "1", AMOUNT: "125000.00", DESCRIPTION: "Site activation", VENDORNAME: "Meridian Clinical Research", DEPARTMENTTITLE: "Clinical Ops", PROJECTNAME: "HX-101" },
          { RECORDNO: "9002", ENTRY_DATE: `${mm}/15/${y}`, ACCOUNTNO: "4100", TR_TYPE: "-1", AMOUNT: "500000.00", DESCRIPTION: "Milestone payment" },
        ]
      : []));
  if (body.includes("<get_accountbalances>"))
    return ok(body.includes(`<startdate><year>${y}</year><month>${m}</month>`)
      ? `<data><accountbalance><glaccountno>6110</glaccountno><debits>125000</debits><credits>0</credits></accountbalance><accountbalance><glaccountno>4100</glaccountno><debits>0</debits><credits>500000</credits></accountbalance><accountbalance><glaccountno>1010</glaccountno><endbalance>2400000</endbalance></accountbalance></data>`
      : "<data/>");
  if (body.includes("<object>CHECKINGACCOUNT</object>")) return ok(rows("checkingaccount", [{ BANKACCOUNTID: "OPS", GLACCOUNTNO: "1010" }]));
  if (body.includes("<object>PROJECT</object>")) return ok(rows("project", [{ NAME: "HX-101", STATUS: "active" }]));
  return ok("<data/>");
}

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.writeHead(200, { "Content-Type": "application/xml" });
    res.end(req.method === "POST" ? answer(body) : "fake intacct");
  });
}).listen(port);
