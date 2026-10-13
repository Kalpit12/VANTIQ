import { expect, test } from "@playwright/test";

const pages = [
  { path: "/overview", heading: "Overview" },
  { path: "/variances", heading: "Variances" },
  { path: "/programs", heading: "R&D programs" },
  { path: "/statements", heading: "Statements" },
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
