import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  { path: "/overview", heading: "Overview" },
  { path: "/variances", heading: "Variances" },
  { path: "/programs", heading: "R&D programs" },
  { path: "/statements", heading: "Statements" },
  { path: "/pack", heading: "Review pack" },
];

for (const p of pages) {
  test(`${p.heading} loads without errors in light and dark`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(p.path);
      await expect(page.getByRole("heading", { level: 1, name: p.heading })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

test("every chart has a working 'view as table' toggle", async ({ page }) => {
  await page.goto("/overview");
  const toggles = page.getByRole("button", { name: "View as table" });
  const count = await toggles.count();
  expect(count).toBeGreaterThanOrEqual(3);
  await toggles.first().click();
  await expect(page.getByRole("button", { name: "View chart" }).first()).toBeVisible();
});

test("drill-down total matches the table cell it was opened from", async ({ page }) => {
  await page.goto("/variances");
  const row = page.getByRole("row", { name: /CRO and clinical fees/ });
  const cell = row.getByRole("link").first();
  const tableValue = (await cell.innerText()).replace(/,/g, "");
  await cell.click();
  const drawer = page.getByRole("dialog", { name: /CRO and clinical fees/ });
  await expect(drawer).toBeVisible();
  const total = await drawer.locator(".text-\\[22px\\]").innerText();
  // Drawer shows full dollars; table shows thousands.
  const dollars = Number(total.replace(/[$,]/g, ""));
  expect(Math.round(dollars / 1000)).toBe(Number(tableValue));
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("period picker changes the view", async ({ page }) => {
  await page.goto("/overview");
  await page.getByRole("button", { name: "Year to date" }).click();
  await expect(page.getByText(/YTD Jan–Sep 2026/).first()).toBeVisible();
  await page.getByLabel("Period", { exact: true }).selectOption("2026-03");
  await expect(page.getByText(/YTD Jan–Mar 2026/).first()).toBeVisible();
});

test("landing page loads, fits a phone and leads to the demo", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("traced to the molecule.");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole("link", { name: "Open the live demo" }).first().click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the demo explains each material variance and cites its transactions", async ({ page }) => {
  await page.goto("/overview");
  const cro = page.getByRole("link", { name: /CRO and clinical fees/ }).first();
  await expect(cro.getByText("Auto draft")).toBeVisible();
  await expect(cro.getByText(/Meridian Clinical Research/)).toBeVisible();
  await cro.click();
  const drawer = page.getByRole("dialog");
  const block = drawer.getByRole("region", { name: "Explanation" });
  await expect(block.getByText(/HX-101 ran \$\d+k over budget/)).toBeVisible();
  const chips = block.getByRole("list", { name: "Cited transactions" }).getByRole("link");
  expect(await chips.count()).toBeGreaterThan(0);
  // Every cited transaction is one of the rows behind the number, marked as cited.
  expect(await drawer.getByText("Cited", { exact: true }).count()).toBe(await chips.count());
});

for (const p of pages) {
  test(`${p.heading} passes axe accessibility checks`, async ({ page }) => {
    await page.goto(p.path);
    await expect(page.getByRole("heading", { level: 1, name: p.heading })).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  });
}

test("the review pack downloads as a PDF", async ({ page }) => {
  await page.goto("/pack?period=2026-09");
  await expect(page.getByText("Sign up and load the sample data to approve packs.", { exact: false })).toBeVisible();
  const res = await page.request.get("/pack/pdf?period=2026-09");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect(res.headers()["content-disposition"]).toContain("Helixa-Therapeutics-review-pack-2026-09.pdf");
  expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
});
