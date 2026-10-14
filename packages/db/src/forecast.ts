import { DEFAULT_SCENARIOS, DRIVER_METHODS, STANDARD_CATEGORIES, type Driver, type DriverMethod, type ForecastOverride, type Scenario } from "@vantiq/domain";
import { eq } from "drizzle-orm";
import type { Db, Tx } from "./client";
import { auditEvents, scenarios, type DriverJson, type ForecastOverrideJson } from "./schema";
import { withCompany } from "./tenant";

export class ForecastError extends Error {}

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX = 1e13;
const CATEGORY = new Map(STANDARD_CATEGORIES.map((c) => [c.id, c]));
const LEAVES = new Set(STANDARD_CATEGORIES.filter((c) => !STANDARD_CATEGORIES.some((x) => x.parentId === c.id)).map((c) => c.id));

const toScenario = (r: typeof scenarios.$inferSelect): Scenario => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  revenueChange: r.revenueChangeBp / 10_000,
  costChange: r.costChangeBp / 10_000,
  drivers: r.drivers.map((d) => ({ categoryId: d.categoryId, method: d.method, growth: d.growthBp / 10_000, amount: d.amount })),
  overrides: r.overrides,
});

const ORDER = ["base", "upside", "downside"];

async function ensureDefaults(tx: Tx, companyId: string) {
  await tx
    .insert(scenarios)
    .values(DEFAULT_SCENARIOS.map((s) => ({ companyId, name: s.name, kind: s.kind, revenueChangeBp: Math.round(s.revenueChange * 10_000), costChangeBp: Math.round(s.costChange * 10_000) })))
    .onConflictDoNothing();
}

/** The company's scenarios, Base first. The three standard ones are created the first time they are asked for. */
export async function listScenarios(db: Db, companyId: string): Promise<Scenario[]> {
  const rows = await withCompany(db, companyId, async (tx) => {
    let r = await tx.select().from(scenarios);
    if (r.length < DEFAULT_SCENARIOS.length) {
      await ensureDefaults(tx, companyId);
      r = await tx.select().from(scenarios);
    }
    return r;
  });
  return rows.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)).map(toScenario);
}

async function load(tx: Tx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ForecastError("That scenario does not exist.");
  const [row] = await tx.select().from(scenarios).where(eq(scenarios.id, id));
  if (!row) throw new ForecastError("That scenario does not exist.");
  return row;
}

const pctText = (bp: number) => `${bp > 0 ? "+" : ""}${bp / 100}%`;

/** Sets how much the scenario moves revenue and costs, as fractions (0.15 = 15% more). */
export async function saveScenarioChanges(db: Db, companyId: string, userId: string, scenarioId: string, revenueChange: number, costChange: number) {
  for (const x of [revenueChange, costChange]) if (!Number.isFinite(x) || x < -1 || x > 10) throw new ForecastError("Enter a change between −100% and +1000%.");
  const revenueChangeBp = Math.round(revenueChange * 10_000);
  const costChangeBp = Math.round(costChange * 10_000);
  await withCompany(db, companyId, async (tx) => {
    const row = await load(tx, scenarioId);
    if (row.revenueChangeBp === revenueChangeBp && row.costChangeBp === costChangeBp) return;
    await tx.update(scenarios).set({ revenueChangeBp, costChangeBp }).where(eq(scenarios.id, scenarioId));
    await tx.insert(auditEvents).values({
      companyId,
      actorId: userId,
      action: "forecast.scenario_changed",
      target: row.name,
      detail: { revenue: [pctText(row.revenueChangeBp), pctText(revenueChangeBp)], costs: [pctText(row.costChangeBp), pctText(costChangeBp)] },
    });
  });
}

/** Sets the driver for a category in one scenario, or removes it (`driver` null) so the category inherits again. */
export async function saveDriver(db: Db, companyId: string, userId: string, scenarioId: string, categoryId: string, driver: Omit<Driver, "categoryId"> | null) {
  const cat = CATEGORY.get(categoryId);
  if (!cat) throw new ForecastError("Choose a line of the income statement.");
  let json: DriverJson | null = null;
  if (driver) {
    if (!DRIVER_METHODS.some((m) => m.method === driver.method)) throw new ForecastError("Choose run rate, budget or a fixed amount.");
    if (!Number.isFinite(driver.growth) || driver.growth < -0.5 || driver.growth > 1) throw new ForecastError("Enter monthly growth between −50% and +100%.");
    if (driver.method === "flat" && (driver.amount === null || !Number.isInteger(driver.amount) || driver.amount < 0 || driver.amount > MAX))
      throw new ForecastError("Enter the monthly amount, zero or more.");
    json = { categoryId, method: driver.method as DriverMethod, growthBp: driver.method === "run_rate" ? Math.round(driver.growth * 10_000) : 0, amount: driver.method === "flat" ? driver.amount : null };
  }
  await withCompany(db, companyId, async (tx) => {
    const row = await load(tx, scenarioId);
    const drivers = row.drivers.filter((d) => d.categoryId !== categoryId);
    if (json) drivers.push(json);
    await tx.update(scenarios).set({ drivers }).where(eq(scenarios.id, scenarioId));
    await tx.insert(auditEvents).values({
      companyId,
      actorId: userId,
      action: json ? "forecast.driver_set" : "forecast.driver_removed",
      target: cat.name,
      detail: { scenario: row.name, ...(json ? { method: json.method, growthBp: json.growthBp, amount: json.amount } : {}) },
    });
  });
}

/** Sets one leaf line's forecast for one month by hand, or clears it (`amount` null). */
export async function saveForecastOverride(db: Db, companyId: string, userId: string, scenarioId: string, input: Omit<ForecastOverride, "amount"> & { amount: number | null }) {
  const cat = CATEGORY.get(input.categoryId);
  if (!cat || !LEAVES.has(input.categoryId)) throw new ForecastError("Choose a single line, not a subtotal.");
  if (!PERIOD.test(input.period)) throw new ForecastError("Choose the month.");
  if (input.amount !== null && (!Number.isInteger(input.amount) || Math.abs(input.amount) > MAX)) throw new ForecastError("Enter an amount.");
  if (input.note.length > 200) throw new ForecastError("Keep the note to 200 characters.");
  await withCompany(db, companyId, async (tx) => {
    const row = await load(tx, scenarioId);
    const overrides: ForecastOverrideJson[] = row.overrides.filter((o) => !(o.period === input.period && o.categoryId === input.categoryId));
    if (input.amount !== null) overrides.push({ period: input.period, categoryId: input.categoryId, amount: input.amount, note: input.note.trim() });
    overrides.sort((a, b) => a.period.localeCompare(b.period) || a.categoryId.localeCompare(b.categoryId));
    await tx.update(scenarios).set({ overrides }).where(eq(scenarios.id, scenarioId));
    await tx.insert(auditEvents).values({
      companyId,
      actorId: userId,
      action: input.amount === null ? "forecast.month_cleared" : "forecast.month_set",
      target: cat.name,
      detail: { scenario: row.name, period: input.period, amount: input.amount, note: input.note.trim() },
    });
  });
}
