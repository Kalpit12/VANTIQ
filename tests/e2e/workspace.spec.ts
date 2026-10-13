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

  await page.getByRole("link", { name: "Members" }).click();
  const viewerEmail = `viewer-${Date.now()}@example.com`;
  await page.getByLabel("Name").fill("Val Viewer");
  await page.getByLabel("Work email").fill(viewerEmail);
  await page.getByLabel("Role", { exact: true }).selectOption("viewer");
  await page.getByRole("button", { name: "Add member" }).click();
  const temp = (await page.locator("code").textContent())!.trim();

  const viewer = await (await browser.newContext()).newPage();
  await viewer.goto("/sign-in");
  await viewer.getByLabel("Work email").fill(viewerEmail);
  await viewer.getByLabel("Password").fill(temp);
  await viewer.getByRole("button", { name: "Sign in" }).click();
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
