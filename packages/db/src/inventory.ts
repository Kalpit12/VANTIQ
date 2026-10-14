import type { Batch } from "@vantiq/domain";
import { generateSampleInventory } from "@vantiq/fixtures";
import type { RawTable } from "@vantiq/integrations";
import { and, eq } from "drizzle-orm";
import type { Db, Tx } from "./client";
import { auditEvents, inventoryBatches } from "./schema";
import { withCompany } from "./tenant";

export class InventoryError extends Error {}

export type BatchInput = Omit<Batch, "id">;

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const validDate = (s: string) => DATE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

function clean(b: BatchInput, where = ""): BatchInput {
  const fail = (m: string) => new InventoryError(where ? `${where}: ${m}` : m[0]!.toUpperCase() + m.slice(1));
  const product = b.product.trim();
  const lot = b.lot.trim();
  if (!product || product.length > 120) throw fail("enter the product name.");
  if (!lot || lot.length > 60) throw fail("enter the lot number.");
  if (!Number.isInteger(b.quantity) || b.quantity < 0 || b.quantity > 1e9) throw fail("quantity must be a whole number of zero or more.");
  if (!Number.isInteger(b.unitCost) || b.unitCost < 0 || b.unitCost > 1e12) throw fail("enter a unit cost of zero or more.");
  if (!validDate(b.expiry)) throw fail("enter the expiry date.");
  if (b.monthlyUsage !== null && (!Number.isInteger(b.monthlyUsage) || b.monthlyUsage < 0 || b.monthlyUsage > 1e9))
    throw fail("monthly usage must be a whole number, or left blank.");
  return { ...b, product, lot, unit: b.unit.trim() || "units", programCode: b.programCode?.trim() || null, location: b.location.trim().slice(0, 120) };
}

const toBatch = (r: typeof inventoryBatches.$inferSelect): Batch => ({
  id: r.id,
  product: r.product,
  programCode: r.programCode,
  lot: r.lot,
  quantity: r.quantity,
  unit: r.unit,
  unitCost: r.unitCost,
  expiry: r.expiry,
  monthlyUsage: r.monthlyUsage,
  location: r.location,
});

export async function listBatches(db: Db, companyId: string): Promise<Batch[]> {
  const rows = await withCompany(db, companyId, (tx) => tx.select().from(inventoryBatches).orderBy(inventoryBatches.expiry, inventoryBatches.product, inventoryBatches.lot));
  return rows.map(toBatch);
}

async function upsert(tx: Tx, companyId: string, b: BatchInput): Promise<"added" | "updated"> {
  const [existing] = await tx
    .select({ id: inventoryBatches.id })
    .from(inventoryBatches)
    .where(and(eq(inventoryBatches.product, b.product), eq(inventoryBatches.lot, b.lot)));
  if (existing) {
    await tx.update(inventoryBatches).set(b).where(eq(inventoryBatches.id, existing.id));
    return "updated";
  }
  await tx.insert(inventoryBatches).values({ companyId, ...b });
  return "added";
}

const summary = (b: BatchInput) => ({ product: b.product, lot: b.lot, quantity: b.quantity, unit: b.unit, expiry: b.expiry, monthlyUsage: b.monthlyUsage });

/** Adds a batch, or changes one (`id` given). Adding a product and lot that already exist updates that batch. */
export async function saveBatch(db: Db, companyId: string, userId: string, id: string | null, input: BatchInput) {
  const b = clean(input);
  await withCompany(db, companyId, async (tx) => {
    if (id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new InventoryError("That batch no longer exists.");
      const [before] = await tx.select().from(inventoryBatches).where(eq(inventoryBatches.id, id)).for("update");
      if (!before) throw new InventoryError("That batch no longer exists.");
      const [clash] = await tx
        .select({ id: inventoryBatches.id })
        .from(inventoryBatches)
        .where(and(eq(inventoryBatches.product, b.product), eq(inventoryBatches.lot, b.lot)));
      if (clash && clash.id !== id) throw new InventoryError(`There is already a batch of ${b.product} with lot ${b.lot}.`);
      await tx.update(inventoryBatches).set(b).where(eq(inventoryBatches.id, id));
      await tx.insert(auditEvents).values({ companyId, actorId: userId, action: "inventory.updated", target: `${b.product} ${b.lot}`, detail: { ...summary(b), before: summary(toBatch(before)) } });
      return;
    }
    const how = await upsert(tx, companyId, b);
    await tx.insert(auditEvents).values({ companyId, actorId: userId, action: `inventory.${how}`, target: `${b.product} ${b.lot}`, detail: summary(b) });
  });
}

export async function removeBatch(db: Db, companyId: string, userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new InventoryError("That batch no longer exists.");
  await withCompany(db, companyId, async (tx) => {
    const [row] = await tx.delete(inventoryBatches).where(eq(inventoryBatches.id, id)).returning();
    if (!row) throw new InventoryError("That batch no longer exists.");
    await tx.insert(auditEvents).values({ companyId, actorId: userId, action: "inventory.removed", target: `${row.product} ${row.lot}`, detail: summary(toBatch(row)) });
  });
}

const HEADERS = {
  product: /^(product|item|material)(\s*name)?$/i,
  lot: /^(lot|batch)(\s*(no\.?|number|id|#))?$/i,
  quantity: /^(quantity|qty|on hand|units on hand)$/i,
  unitCost: /^(unit cost|cost per unit|unit price|cost)$/i,
  expiry: /^(expiry|expiration|expires|exp)(\s*date)?$/i,
  unit: /^(unit|uom|unit of measure)$/i,
  usage: /usage|use per month|monthly use|burn/i,
  program: /^program(\s*code)?$/i,
  location: /^(location|site|warehouse|depot)$/i,
};

/** YYYY-MM-DD, M/D/YYYY (US) or D Mon YYYY. */
function dateOf(s: string): string | null {
  const v = s.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  let iso = m ? `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}` : null;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (m) iso = `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  m = /^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s-](\d{4})$/.exec(v);
  if (m) {
    const i = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2]!.toLowerCase());
    if (i >= 0) iso = `${m[3]}-${String(i + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  }
  return iso && validDate(iso) ? iso : null;
}

export interface BatchImportResult {
  added: number;
  updated: number;
  errors: string[];
}

/** Imports an inventory listing, one row per lot. A product and lot already on file is replaced. */
export async function importBatches(db: Db, companyId: string, userId: string, table: RawTable): Promise<BatchImportResult> {
  const col = (k: keyof typeof HEADERS) => table.headers.findIndex((h) => HEADERS[k].test(h.trim()));
  const idx = Object.fromEntries(Object.keys(HEADERS).map((k) => [k, col(k as keyof typeof HEADERS)])) as Record<keyof typeof HEADERS, number>;
  const missing = (["product", "lot", "quantity", "unitCost", "expiry"] as const).filter((k) => idx[k] < 0);
  if (missing.length)
    throw new InventoryError(`The file needs columns for product, lot, quantity, unit cost and expiry date. Missing: ${missing.map((k) => (k === "unitCost" ? "unit cost" : k)).join(", ")}.`);
  const cell = (r: string[], k: keyof typeof HEADERS) => (idx[k] < 0 ? "" : (r[idx[k]] ?? "").trim());
  const num = (s: string) => Number(s.replace(/[$,\s]/g, ""));
  const errors: string[] = [];
  const batches = new Map<string, BatchInput>();
  table.rows.forEach((r, n) => {
    const line = n + 2;
    const expiry = dateOf(cell(r, "expiry"));
    if (!expiry) return void errors.push(`Row ${line}: "${cell(r, "expiry")}" is not a date.`);
    const usage = cell(r, "usage");
    try {
      const b = clean(
        {
          product: cell(r, "product"),
          lot: cell(r, "lot"),
          quantity: num(cell(r, "quantity") || "NaN"),
          unitCost: Math.round(num(cell(r, "unitCost") || "NaN") * 100),
          expiry,
          unit: cell(r, "unit"),
          monthlyUsage: usage ? num(usage) : null,
          programCode: cell(r, "program") || null,
          location: cell(r, "location"),
        },
        `Row ${line}`,
      );
      batches.set(`${b.product.toLowerCase()}|${b.lot.toLowerCase()}`, b);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : `Row ${line}: could not read.`);
    }
  });
  const res = { added: 0, updated: 0, errors };
  if (!batches.size) return res;
  await withCompany(db, companyId, async (tx) => {
    for (const b of batches.values()) res[await upsert(tx, companyId, b)]++;
    await tx.insert(auditEvents).values({ companyId, actorId: userId, action: "inventory.imported", target: `${batches.size} lots`, detail: { added: res.added, updated: res.updated, skipped: errors.length } });
  });
  return res;
}

/** The Helixa sample stock, for a company that loaded the sample books. */
export async function loadSampleInventory(db: Db, companyId: string) {
  await withCompany(db, companyId, async (tx) => {
    for (const { id: _id, ...b } of generateSampleInventory()) {
      await tx.insert(inventoryBatches).values({ companyId, ...b }).onConflictDoNothing();
    }
  });
}
