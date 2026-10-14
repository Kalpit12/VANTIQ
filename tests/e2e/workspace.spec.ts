import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "e2e-password-123";

async function signUp(page: Page, company: string) {
  const email = `cfo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Your name").fill("Casey CFO");
  await page.getByLabel("Company name").fill(company);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  return email;
}

/** Ticks off every manual task on the open close checklist page. */
async function tickEverything(page: Page) {
  const ids = await page.locator("li[id^=task-]").filter({ has: page.getByRole("button", { name: "Mark done" }) }).evaluateAll((els) => els.map((e) => e.id));
  for (const id of ids) {
    const task = page.locator(`#${id}`);
    await task.getByRole("button", { name: "Mark done" }).click();
    await expect(task).toContainText("Ticked off by");
  }
  await page.reload();
  await expect(page.getByRole("button", { name: "Mark done" })).toHaveCount(0);
}

test("sign up, load sample data, confirm mappings", async ({ page }) => {
  await signUp(page, "Sample Trial Bio");
  await expect(page.getByText("Bring in your numbers")).toBeVisible();
  await page.getByRole("button", { name: "Try it with sample data" }).click();
  await expect(page.getByText("$59.6M", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Vantiq suggested categories for 11 accounts/)).toBeVisible();

  await page.getByRole("link", { name: "Review mapping →" }).click();
  await page.getByRole("button", { name: "Confirm all 11 suggestions" }).click();
  await expect(page.getByText("Every account is mapped and confirmed.")).toBeVisible();
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByText(/suggested categories/)).toHaveCount(0);
});

test("import a ledger file: check columns, skip bad rows, map the new account", async ({ page }) => {
  await signUp(page, "Import Test Bio");
  await page.getByRole("link", { name: "Import a file" }).click();
  const csv = [
    "Date,Account,Debit,Credit,Name,Memo/Description,Class",
    "09/02/2026,6110 · CRO clinical services,125000.00,,Meridian CRO,Site payments,HX-1",
    "09/15/2026,6010 · R&D Salaries,80000,,Payroll,Sept payroll,HX-1",
    "09/30/2026,6999 · Miscellaneous,1200,,Misc vendor,Odds and ends,",
    "not a date,6110,5,,,,",
  ].join("\n");
  await page.getByLabel("File", { exact: true }).setInputFiles({ name: "gl.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Upload and check columns" }).click();
  await expect(page.getByRole("heading", { name: "Check columns" })).toBeVisible();
  await expect(page.getByText("3 rows ready to import.")).toBeVisible();
  await expect(page.getByText('Date "not a date" is not a date.')).toBeVisible();
  await page.getByRole("button", { name: "Import 3 rows" }).click();
  await expect(page.getByText(/Imported gl\.csv\. 3 rows saved/)).toBeVisible();

  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByText("1 account not mapped.")).toBeVisible();
  await expect(page.getByText("$205k").first()).toBeVisible();

  await page.goto("/mappings");
  await page.getByLabel("Category for 6999 Miscellaneous").selectOption("ga-professional");
  await page.getByRole("button", { name: "Save 1 change" }).click();
  await expect(page.getByText(/Saved 1 account/)).toBeVisible();
  await page.goto("/overview");
  await expect(page.getByText("1 account not mapped.")).toHaveCount(0);
  await expect(page.getByText("$206k").first()).toBeVisible();

  // Importing the same file again adds nothing.
  await page.goto("/import");
  await page.getByLabel("File", { exact: true }).setInputFiles({ name: "gl.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Upload and check columns" }).click();
  await page.getByRole("button", { name: "Import 3 rows" }).click();
  await expect(page.getByText(/0 rows saved, 3 already imported before and skipped/)).toBeVisible();
});

test("companies are isolated and viewers cannot import", async ({ page, browser }) => {
  await signUp(page, "Tenant One Bio");
  await page.getByRole("button", { name: "Try it with sample data" }).click();
  await expect(page.getByText("$59.6M", { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: "Members" }).click();
  await expect(page.getByRole("heading", { name: "Add someone" })).toBeVisible();
  const viewerEmail = `viewer-${Date.now()}@example.com`;
  await page.getByLabel("Name").fill("Val Viewer");
  await page.getByLabel("Work email").fill(viewerEmail);
  await page.getByLabel("Role", { exact: true }).selectOption("viewer");
  await page.getByRole("button", { name: "Add member" }).click();
  const invite = (await page.locator("code").textContent())!.trim();

  const viewer = await (await browser.newContext()).newPage();
  await viewer.goto(invite);
  await viewer.getByLabel("Password").fill("viewer's long password");
  await viewer.getByRole("button", { name: "Join" }).click();
  await expect(viewer.getByText("$59.6M", { exact: true })).toBeVisible();
  await expect(viewer.getByRole("link", { name: "Members" })).toHaveCount(0);
  await viewer.goto("/import");
  await expect(viewer.getByText("Your role can view numbers but not import files.")).toBeVisible();

  // A different company sees none of Tenant One's data.
  const other = await (await browser.newContext()).newPage();
  await signUp(other, "Tenant Two Bio");
  await expect(other.getByText("Bring in your numbers")).toBeVisible();
  await other.goto("/mappings");
  await expect(other.getByText("No accounts yet.")).toBeVisible();

  await other.getByRole("button", { name: "Sign out" }).click();
  await expect(other).toHaveURL(/\/sign-in$/);
  await other.goto("/statements");
  await expect(other).toHaveURL(/\/sign-in$/);
});

test("connect the sandbox accounting system, sync, and see every month balance", async ({ page, request }) => {
  await signUp(page, "Connected Bio");
  await page.getByRole("link", { name: "Connect accounting" }).click();
  await expect(page.getByRole("heading", { name: "Connections" })).toBeVisible();
  // Without Merge keys the real systems are listed but cannot be connected.
  await expect(page.getByRole("button", { name: "Connect QuickBooks Online" })).toBeDisabled();
  await page.getByRole("button", { name: "Connect the sandbox" }).click();
  await expect(page.getByRole("heading", { name: "QuickBooks Online (sandbox)" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("All 24 months match QuickBooks Online (sandbox).")).toBeVisible();
  await expect(page.getByRole("row", { name: /First sync/ })).toBeVisible();

  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByRole("row", { name: /Sync now 0 0 0 Done/ })).toBeVisible();

  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByText("$59.6M", { exact: true })).toBeVisible();
  await expect(page.getByText(/Out of balance/)).toHaveCount(0);

  // The scheduled sync endpoint only answers the cron secret.
  expect((await request.get("/api/cron/sync")).status()).toBe(401);
  const cron = await request.get("/api/cron/sync", { headers: { authorization: "Bearer e2e-cron-secret" } });
  expect(cron.status()).toBe(200);

  await page.goto("/connections");
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("button", { name: "Connect Xero" })).toBeVisible();
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByText("$59.6M", { exact: true })).toBeVisible();
});

test("draft explanations, then accept one and edit another", async ({ page }) => {
  await signUp(page, "Explain Bio");
  await page.getByRole("button", { name: "Try it with sample data" }).click();
  await expect(page.getByText("$59.6M", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: "Variances" }).click();
  await page.getByRole("button", { name: /^Draft \d+ explanations?$/ }).click();
  await expect(page.getByRole("button", { name: /^Draft \d+ explanations?$/ })).toHaveCount(0);

  const table = page.getByRole("table").last();
  await table.getByRole("link", { name: /HX-101 ran/ }).click();
  const block = page.getByRole("dialog").getByRole("region", { name: "Explanation" });
  await expect(block.getByText("Auto draft")).toBeVisible();
  await block.getByRole("button", { name: "Accept" }).click();
  await expect(block.getByText("Confirmed by Casey CFO")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await table.getByRole("link", { name: /Harbor Legal/ }).click();
  await block.getByText("Edit", { exact: true }).click();
  await block.getByLabel("Explanation").fill("Harbor Legal reviewed the licensing term sheet; a one-off cost.");
  await block.getByRole("button", { name: "Save and confirm" }).click();
  await expect(block.getByText("Edited and confirmed by Casey CFO")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByText("Harbor Legal reviewed the licensing term sheet; a one-off cost.")).toBeVisible();
  await expect(page.getByText("Confirmed")).toHaveCount(2);
});

test("Phase 1 gate: sample data, mapping, drill-down, explanations, close, approve the pack, PDF, board link, audit log", async ({ page, browser }) => {
  await signUp(page, "Gate Bio");
  await page.getByRole("button", { name: "Try it with sample data" }).click();
  await expect(page.getByText("$59.6M", { exact: true })).toBeVisible({ timeout: 30_000 });

  // Mapping
  await page.goto("/mappings");
  await page.getByRole("button", { name: "Confirm all 11 suggestions" }).click();
  await expect(page.getByText("Every account is mapped and confirmed.")).toBeVisible();

  // Overview and drill-down
  await page.getByRole("link", { name: "Overview" }).click();
  await page.getByRole("link", { name: /CRO and clinical fees/ }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Meridian Clinical Research");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The pack can't be approved until material lines are explained
  await page.getByRole("link", { name: "Review pack" }).click();
  await expect(page.getByRole("heading", { name: "Review pack" })).toBeVisible();
  await expect(page.getByText("2 of 2 material lines still need an accepted or edited explanation.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve Sep 2026" })).toBeDisabled();

  await page.getByRole("link", { name: "Fix this →" }).first().click();
  await page.getByRole("button", { name: /^Draft 2 explanations$/ }).click();
  const table = page.getByRole("table").last();
  const block = page.getByRole("dialog").getByRole("region", { name: "Explanation" });
  for (const name of [/HX-101 ran/, /Harbor Legal/]) {
    await table.getByRole("link", { name }).click();
    await block.getByRole("button", { name: "Accept" }).click();
    await expect(block.getByText("Confirmed by Casey CFO")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }

  // ...and until the close checklist is done
  await page.getByRole("link", { name: "Review pack" }).click();
  await expect(page.getByText("8 close tasks are still open or waiting for sign-off.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve Sep 2026" })).toBeDisabled();
  await page.getByRole("link", { name: "Close checklist" }).click();
  await expect(page.getByRole("heading", { name: "Close checklist" })).toBeVisible();
  await tickEverything(page);
  await expect(page.locator("#task-explained")).toContainText("Checked by Vantiq: passing.");

  // Approve: the month locks
  await page.goto("/pack?period=2026-09");
  await expect(page.getByText("Ready to approve.")).toBeVisible();
  await page.getByRole("button", { name: "Approve Sep 2026" }).click();
  await expect(page.getByText(/Approved by Casey CFO on/)).toBeVisible();
  await expect(page.getByText("Accepted by Casey CFO")).toHaveCount(2);

  // PDF export
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Gate-Bio-review-pack-2026-09.pdf");
  const head = (await (await file.createReadStream()).toArray()).map((c) => Buffer.from(c)).reduce((a, b) => Buffer.concat([a, b]));
  expect(head.subarray(0, 5).toString()).toBe("%PDF-");

  // Locked: explanations are read-only
  await page.goto("/variances?period=2026-09");
  await expect(page.getByText("Sep 2026 is approved and locked")).toBeVisible();
  await table.getByRole("link", { name: /HX-101 ran/ }).click();
  await expect(block.getByRole("button", { name: "Accept" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.goto("/close?period=2026-09");
  await expect(page.getByText("The checklist and its comments are locked.")).toBeVisible();
  await expect(page.locator("#task-approved")).toContainText("Checked by Vantiq: passing.");
  await expect(page.getByRole("button", { name: /Mark done|Undo/ })).toHaveCount(0);

  // Audit log
  await page.goto("/settings/audit");
  for (const text of ["Downloaded the Sep 2026 review pack as PDF", "Approved the Sep 2026 review pack", "Accepted the explanation for Professional fees · Sep 2026", "Imported ledger file helixa-general-ledger.csv"]) {
    await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
  }
  await page.getByRole("link", { name: "Review packs" }).click();
  await expect(page.getByRole("row")).toHaveCount(3);
  const csv = await page.request.get("/settings/audit/export");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("pack.approved");

  // Share the board pack with a link that expires
  await page.goto("/pack?period=2026-09");
  await page.getByLabel("Who is it for?").fill("Board of directors");
  await page.getByLabel("Link works for").selectOption("7");
  await page.getByLabel("Note to the board (optional)").fill("CRO spend ran ahead of plan; runway is unchanged.");
  await page.getByRole("button", { name: "Create link" }).click();
  await expect(page.getByText("Link for Board of directors is ready.")).toBeVisible();
  const url = await page.getByLabel("Board pack link for Board of directors").inputValue();
  expect(url).toMatch(/\/share\/[A-Za-z0-9_-]{32}$/);
  const guest = await (await browser.newContext()).newPage();
  const res = await guest.goto(url);
  expect(res!.headers()["x-robots-tag"]).toContain("noindex");
  expect(res!.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(guest.getByRole("heading", { name: "Gate Bio" })).toBeVisible();
  await expect(guest.getByText("CRO spend ran ahead of plan; runway is unchanged.")).toBeVisible();
  await expect(guest.getByText(/Approved by Casey CFO on/)).toBeVisible();
  // The board sees no cited transactions and has no way into the app.
  await expect(guest.getByText("20 Sep 2026")).toHaveCount(0);
  await expect(guest.getByRole("link", { name: "Overview" })).toHaveCount(0);
  const pdf = await guest.request.get(`${url}/pdf`);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  // The link is shown once; afterwards only its row remains, counting the view and the download.
  await page.reload();
  await expect(page.getByText("Link for Board of directors is ready.")).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Board of directors/ })).toContainText("2 times");
  await page.getByRole("button", { name: "Revoke the link for Board of directors" }).click();
  await expect(page.getByRole("row", { name: /Board of directors/ })).toContainText("Revoked");
  await guest.goto(url);
  await expect(guest.getByRole("heading", { name: "This link was turned off" })).toBeVisible();

  // Reopen with a reason
  await page.goto("/pack?period=2026-09");
  await page.getByText("Reopen month").click();
  await page.getByLabel("Why? This goes in the audit log.").fill("Late CRO invoice");
  await page.getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByText(/Reopened by Casey CFO/)).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByText("Reopened by Casey CFO")).toBeVisible();
});

test("trial accruals: record late CRO activity, add a change order, import a report", async ({ page }) => {
  await signUp(page, "Trial Bio");
  await page.getByRole("button", { name: "Try it with sample data" }).click();
  await expect(page.getByText("$59.6M", { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("link", { name: "Trial accruals" }).click();
  await expect(page.getByText("1 mo estimated")).toBeVisible();
  await page.getByRole("link", { name: "HX-204-101" }).click();
  await expect(page.getByText("Atlas CRO hasn't reported Sep 2026 yet.")).toBeVisible();

  // Atlas's September report arrives
  await page.getByLabel("Month", { exact: true }).fill("2026-09");
  await page.getByLabel("sites", { exact: true }).fill("0");
  await page.getByLabel("patients", { exact: true }).fill("2");
  await page.getByLabel("visits", { exact: true }).fill("150");
  await page.getByRole("button", { name: "Record activity" }).click();
  await expect(page.getByText("hasn't reported")).toHaveCount(0);

  await page.getByText("Add a change order").click();
  await page.getByLabel("Takes effect").fill("2026-09");
  await page.getByLabel("What changed").fill("Expansion cohort");
  await page.locator("#co-units-patient").fill("12");
  await page.locator("#co-cost-patient").fill("32,000");
  await page.getByRole("button", { name: "Add change order" }).click();
  await expect(page.getByText("Change order 1 · from Sep 2026")).toBeVisible();
  await expect(page.getByText("+12 patients at $32,000")).toBeVisible();

  // A CRO report file
  await page.getByRole("link", { name: "← All trials" }).click();
  const csv = "Trial ID,Month,Sites,Patients,Visits\nHX-101-201,2026-09,1,14,500\nNOPE,2026-09,1,1,1\n";
  await page.getByLabel("Activity file").setInputFiles({ name: "cro.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Import activity" }).click();
  await expect(page.getByText('Saved 1 month of activity for 1 trial. Skipped 1: Row 3: no trial "NOPE".')).toBeVisible();

  await page.goto("/settings/audit?area=trial");
  await expect(page.getByText("Imported CRO activity for HX-101-201: Sep 2026")).toBeVisible();
  await expect(page.getByText("Added change order 1 to HX-204-101, effective Sep 2026: Expansion cohort")).toBeVisible();
});

test("close checklist: owner and reviewer, sign-off, comments on tasks and lines", async ({ page, browser }) => {
  await signUp(page, "Close Bio");
  await page.getByRole("button", { name: "Try it with sample data" }).click();
  await expect(page.getByText("$59.6M", { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: "Members" }).click();
  await expect(page.getByRole("heading", { name: "Add someone" })).toBeVisible();
  const finEmail = `fin-${Date.now()}@example.com`;
  await page.getByLabel("Name").fill("Fin Finance");
  await page.getByLabel("Work email").fill(finEmail);
  await page.getByLabel("Role", { exact: true }).selectOption("finance");
  await page.getByRole("button", { name: "Add member" }).click();
  const invite = (await page.locator("code").textContent())!.trim();

  // The CFO makes Fin the owner of the bank reconciliation and reviews it.
  await page.goto("/close?period=2026-09");
  const bank = page.locator("#task-bank");
  await bank.getByText("Assign").click();
  await bank.getByLabel("Owner").selectOption({ label: "Fin Finance" });
  await bank.getByLabel("Reviewer").selectOption({ label: "Casey CFO" });
  await bank.getByRole("button", { name: "Save" }).click();
  await expect(bank).toContainText("Owner: Fin Finance");
  await expect(bank).toContainText("Reviewer: Casey CFO");
  // The reviewer can't prepare the task they review.
  await expect(bank.getByRole("button", { name: "Mark done" })).toHaveCount(0);
  await bank.getByText("Comments").click();
  await bank.getByLabel("Comment on Reconcile bank and investment accounts").fill("Use the SVB statement, not the online balance.");
  await bank.getByRole("button", { name: "Comment" }).click();
  await expect(bank).toContainText("Use the SVB statement, not the online balance.");

  // Fin sees it under My tasks and ticks it off.
  const fin = await (await browser.newContext()).newPage();
  await fin.goto(invite);
  await expect(fin.getByRole("heading", { name: "Join Close Bio" })).toBeVisible();
  await fin.getByLabel("Password").fill("fin's long password");
  await fin.getByRole("button", { name: "Join" }).click();
  await expect(fin.getByRole("heading", { name: "Overview" })).toBeVisible();
  await fin.goto("/close?period=2026-09&mine=1");
  await expect(fin.locator("li[id^=task-]")).toHaveCount(1);
  await fin.locator("#task-bank").getByRole("button", { name: "Mark done" }).click();
  await expect(fin.locator("#task-bank")).toContainText("Ticked off by Fin Finance");
  await expect(fin.locator("#task-bank").getByRole("button", { name: "Sign off" })).toHaveCount(0);

  // The CFO signs it off.
  await page.reload();
  await expect(bank).toContainText("Waiting for sign-off");
  await bank.getByRole("button", { name: "Sign off" }).click();
  await expect(bank).toContainText("signed off by Casey CFO");

  // Comments on a variance line show in the review pack.
  await page.goto("/pack?period=2026-09");
  await page.getByLabel(/^Comment on CRO/).first().fill("CO4 visits ran ahead of plan; Meridian will catch up in October.");
  await page.getByRole("button", { name: "Comment" }).first().click();
  await expect(page.getByText("CO4 visits ran ahead of plan; Meridian will catch up in October.")).toBeVisible();

  await page.goto("/settings/audit");
  for (const text of ["Signed off “Reconcile bank and investment accounts”", "Ticked off “Reconcile bank and investment accounts”", "Commented on"]) {
    await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
  }
});

test("income schedules: move a late licensing fee, add a grant, and see it in the audit log", async ({ page }) => {
  await signUp(page, "Income Bio");
  await page.getByRole("button", { name: "Try it with sample data" }).click();
  await expect(page.getByText("$59.6M", { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("link", { name: "Grants and income" }).click();
  await expect(page.getByText("Kairo license (HX-310): Signing fee, due Aug 2026")).toBeVisible();

  // Kairo's term sheet slipped: the fee is now expected in November.
  const kairo = page.locator("section", { has: page.getByRole("heading", { name: /Kairo license/ }) });
  await kairo.getByText("Change").first().click();
  const change = kairo.getByRole("form", { name: "Change Signing fee" });
  await change.getByLabel("Expected").fill("2026-11");
  await change.getByLabel("Likelihood %").fill("70");
  await change.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Nothing expected has failed to arrive.")).toBeVisible();

  // A new state grant with its first tranche
  await page.getByLabel("Name", { exact: true }).fill("CPRIT product development award");
  await page.getByLabel("Paid by").fill("Texas CPRIT");
  await page.getByLabel("Total award (grants, USD)").fill("2,000,000");
  await page.getByRole("button", { name: "Add schedule" }).click();
  const cprit = page.locator("section", { has: page.getByRole("heading", { name: /CPRIT product development award/ }) });
  await expect(cprit.getByText("no payments from Texas CPRIT found yet")).toBeVisible();
  const add = cprit.getByRole("form", { name: "Add a receipt to CPRIT product development award" });
  await add.getByLabel("Receipt").fill("Tranche 1");
  await add.getByLabel("Expected").fill("2026-12");
  await add.getByLabel("Amount (USD)").fill("1,000,000");
  await add.getByLabel("Likelihood %").fill("90");
  await add.getByRole("button", { name: "Add receipt" }).click();
  await expect(cprit.getByRole("cell", { name: "$900k" })).toBeVisible();
  await expect(cprit.getByText("$0 drawn of $2.0M")).toBeVisible();

  await page.goto("/settings/audit?area=income");
  await expect(page.getByText("Changed Signing fee on Kairo license (HX-310): moved from Aug 2026 to Nov 2026, likelihood 80% to 70%")).toBeVisible();
  await expect(page.getByText("Added Tranche 1 to CPRIT product development award: $1.0M expected Dec 2026 at 90%")).toBeVisible();
});

test("inventory: write off an expired lot, change a quantity, import a listing, and see it in the audit log", async ({ page }) => {
  await signUp(page, "Stock Bio");
  await page.getByRole("button", { name: "Try it with sample data" }).click();
  await expect(page.getByText("$59.6M", { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("link", { name: "Inventory and expiry" }).click();
  await expect(page.getByText("1 lot still on the books")).toBeVisible();

  // The expired lot was destroyed.
  const expired = page.locator("tr", { hasText: "DP-2311" });
  await expired.getByText("Change").click();
  await expired.getByRole("button", { name: "Remove lot DP-2311" }).click();
  await expect(page.getByText("Nothing past its expiry date")).toBeVisible();

  // A stock count found fewer reference standard vials.
  const rs = page.locator("tr", { hasText: "RS-118" });
  await rs.getByText("Change").click();
  await rs.getByRole("form", { name: "Change lot RS-118" }).getByLabel("Quantity").fill("10");
  await rs.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("tr", { hasText: "RS-118" }).getByRole("cell", { name: "$6k", exact: true })).toBeVisible();

  const csv = "Product,Lot,Qty,Unit cost,Expiry date,Unit,Monthly usage\nAssay kits,AK-77,40,250,2026-11-30,kits,10\nAssay kits,AK-78,40,250,soon,kits,10\n";
  await page.getByLabel("Inventory file").setInputFiles({ name: "stock.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Import lots" }).click();
  await expect(page.getByText('Added 1 lot and updated 0. Skipped 1: Row 3: "soon" is not a date.')).toBeVisible();
  await expect(page.getByText("At 10 kits a month, 20 get used before expiry and 20 are left over")).toBeVisible();

  await page.goto("/settings/audit?area=inventory");
  await expect(page.getByText("Removed HX-204 drug product 50 mg DP-2311")).toBeVisible();
  await expect(page.getByText("Changed Reference standard HX-101 RS-118: quantity 25 to 10")).toBeVisible();
  await expect(page.getByText("Imported inventory: 1 lot added, 0 updated, 1 row skipped")).toBeVisible();
});

test("notifications: forgot password by email, invitation and close emails, and choosing what to get", async ({ page, browser }) => {
  const email = await signUp(page, "Mail Bio");
  await page.getByRole("button", { name: "Try it with sample data" }).click();
  await expect(page.getByText("$59.6M", { exact: true })).toBeVisible({ timeout: 30_000 });

  // Invite someone and make them the owner of a close task.
  const nia = `nia-${Date.now()}@example.com`;
  await page.goto("/settings/members");
  await page.getByLabel("Name").fill("Nia Finance");
  await page.getByLabel("Work email").fill(nia);
  await page.getByLabel("Role", { exact: true }).selectOption("finance");
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByText("Email isn't set up yet, so send them this invitation link yourself")).toBeVisible();
  await expect(page.getByText("Invitation pending")).toBeVisible();
  const invite = (await page.locator("code").textContent())!.trim();
  const other = await (await browser.newContext()).newPage();
  await other.goto(invite);
  await other.getByLabel("Password").fill("nia's long password");
  await other.getByRole("button", { name: "Join" }).click();
  await expect(other.getByRole("heading", { name: "Overview" })).toBeVisible();
  // The link works once.
  await other.goto(invite);
  await expect(other.getByRole("heading", { name: "This invitation has expired" })).toBeVisible();

  await page.goto("/close?period=2026-09");
  const bank = page.locator("#task-bank");
  await bank.getByText("Assign").click();
  await bank.getByLabel("Owner").selectOption({ label: "Nia Finance" });
  await bank.getByRole("button", { name: "Save" }).click();
  await expect(bank).toContainText("Owner: Nia Finance");

  // Nia turns off approval emails.
  await other.goto("/settings/notifications");
  await other.getByLabel(/A month is approved/).uncheck();
  await other.getByRole("button", { name: "Save" }).click();
  await expect(other.getByText("Saved.")).toBeVisible();
  await expect(other.getByLabel(/A month is approved/)).not.toBeChecked();
  await expect(other.getByRole("heading", { name: "Recent emails" })).toHaveCount(0);

  // The admin sees what went out (logged, since no email provider is set up here).
  await page.goto("/settings/notifications");
  await expect(page.getByText("Casey CFO invited you to Mail Bio on Vantiq")).toBeVisible();
  await expect(page.getByText("You own “Reconcile bank and investment accounts” for the Sep 2026 close")).toBeVisible();
  await expect(page.getByText("Not sent: email not set up").first()).toBeVisible();

  // Forgot password: the reset link comes by email.
  const guest = await (await browser.newContext()).newPage();
  await guest.goto("/sign-in");
  await guest.getByRole("link", { name: "Forgot your password?" }).click();
  await guest.waitForURL("**/forgot-password");
  await guest.waitForLoadState("networkidle"); // a click before hydration would post the form natively
  await guest.getByLabel("Work email").fill(email);
  await guest.getByRole("button", { name: "Send reset link" }).click();
  await expect(guest.getByText(`If ${email} has a Vantiq account, a link to reset the password is on its way.`)).toBeVisible({ timeout: 15_000 });
});
