"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, importBatches, InventoryError, removeBatch, saveBatch } from "@vantiq/db";
import { parseUpload } from "@vantiq/integrations";
import { requireMember } from "@/lib/data";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (s: string) => Number(s.replace(/[$,\s]/g, "") || "NaN");
const back = (anchor: string, q = "") => `/inventory${q}#${anchor}`;
const fail = (anchor: string, e: unknown): never => redirect(back(anchor, `?verr=${encodeURIComponent(e instanceof Error ? e.message : "Could not save.")}`));

/** Adds a batch, or changes one when `id` is set. */
export async function saveBatchAction(form: FormData) {
  const { db, companyId, userId } = await requireMember(can.manageInventory);
  const id = str(form, "id") || null;
  try {
    const usage = str(form, "monthlyUsage");
    await saveBatch(db, companyId, userId, id, {
      product: str(form, "product"),
      lot: str(form, "lot"),
      programCode: str(form, "programCode") || null,
      quantity: num(str(form, "quantity")),
      unit: str(form, "unit"),
      unitCost: Math.round(num(str(form, "unitCost")) * 100),
      expiry: str(form, "expiry"),
      monthlyUsage: usage ? num(usage) : null,
      location: str(form, "location"),
    });
  } catch (e) {
    fail(id ? `batch-${id}` : "add-batch", e);
  }
  revalidatePath("/inventory");
  redirect(back(id ? `batch-${id}` : "batches"));
}

export async function removeBatchAction(form: FormData) {
  const { db, companyId, userId } = await requireMember(can.manageInventory);
  try {
    await removeBatch(db, companyId, userId, str(form, "id"));
  } catch (e) {
    fail("batches", e);
  }
  revalidatePath("/inventory");
  redirect(back("batches"));
}

export async function importBatchesAction(form: FormData) {
  const { db, companyId, userId } = await requireMember(can.manageInventory);
  const file = form.get("file");
  let note: string;
  try {
    if (!(file instanceof File) || file.size === 0) throw new InventoryError("Choose an inventory file.");
    const res = await importBatches(db, companyId, userId, await parseUpload(file.name, await file.arrayBuffer()));
    note = `Added ${res.added} lot${res.added === 1 ? "" : "s"} and updated ${res.updated}.${res.errors.length ? ` Skipped ${res.errors.length}: ${res.errors.slice(0, 3).join(" ")}${res.errors.length > 3 ? " …" : ""}` : ""}`;
  } catch (e) {
    fail("import-batches", e);
  }
  revalidatePath("/inventory");
  redirect(back("import-batches", `?vnote=${encodeURIComponent(note!)}`));
}
