"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addChangeOrder, can, createTrial, importActivity, saveActivity, TrialError } from "@vantiq/db";
import type { AccrualDriver, ContractItem } from "@vantiq/domain";
import { parseUpload } from "@vantiq/integrations";
import { requireMember } from "@/lib/data";

const DRIVER_KEYS: AccrualDriver[] = ["monthly", "site", "patient", "visit"];
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const money = (s: string) => Math.round(Number(s.replace(/[$,\s]/g, "") || "0") * 100);
const count = (s: string) => Number(s.replace(/[,\s]/g, "") || "0");
const message = (e: unknown) => (e instanceof TrialError || e instanceof Error ? e.message : "Could not save.");
const withError = (path: string, e: unknown) => `${path}${path.includes("?") ? "&" : "?"}terr=${encodeURIComponent(message(e))}`;

/** Reads `units-<driver>` and `cost-<driver>` fields into contract lines. */
function itemsFrom(f: FormData): ContractItem[] {
  return DRIVER_KEYS.map((driver) => ({ driver, units: count(str(f, `units-${driver}`)), unitCost: money(str(f, `cost-${driver}`)) })).filter((i) => i.units !== 0 || i.unitCost !== 0);
}

export async function createTrialAction(form: FormData) {
  const { db, companyId, userId } = await requireMember(can.importData);
  let id: string;
  try {
    id = await createTrial(db, companyId, userId, {
      code: str(form, "code"),
      name: str(form, "name"),
      programCode: str(form, "programCode") || null,
      croName: str(form, "croName"),
      phase: str(form, "phase"),
      start: str(form, "start"),
      end: str(form, "end"),
      items: itemsFrom(form),
    });
  } catch (e) {
    redirect(withError("/trials/new", e));
  }
  revalidatePath("/trials");
  redirect(`/trials/${id}`);
}

export async function addChangeOrderAction(form: FormData) {
  const { db, companyId, userId } = await requireMember(can.importData);
  const trialId = str(form, "trialId");
  const back = `/trials/${trialId}`;
  try {
    await addChangeOrder(db, companyId, userId, trialId, { effective: str(form, "effective"), description: str(form, "description"), items: itemsFrom(form) });
  } catch (e) {
    redirect(withError(back, e));
  }
  revalidatePath(back);
  redirect(back);
}

export async function saveActivityAction(form: FormData) {
  const { db, companyId, userId } = await requireMember(can.importData);
  const trialId = str(form, "trialId");
  const back = `/trials/${trialId}`;
  try {
    await saveActivity(db, companyId, userId, trialId, [{ period: str(form, "period"), sites: count(str(form, "sites")), patients: count(str(form, "patients")), visits: count(str(form, "visits")) }], "manual");
  } catch (e) {
    redirect(withError(back, e));
  }
  revalidatePath("/trials", "layout");
  redirect(back);
}

export async function importActivityAction(form: FormData) {
  const { db, companyId, userId } = await requireMember(can.importData);
  const file = form.get("file");
  let note: string;
  try {
    if (!(file instanceof File) || file.size === 0) throw new TrialError("Choose a CRO activity file.");
    const res = await importActivity(db, companyId, userId, await parseUpload(file.name, await file.arrayBuffer()));
    const months = res.saved.reduce((s, r) => s + r.months, 0);
    note = `Saved ${months} month${months === 1 ? "" : "s"} of activity for ${res.saved.length} trial${res.saved.length === 1 ? "" : "s"}.${res.errors.length ? ` Skipped ${res.errors.length}: ${res.errors.slice(0, 3).join(" ")}${res.errors.length > 3 ? " …" : ""}` : ""}`;
  } catch (e) {
    redirect(withError("/trials", e));
  }
  revalidatePath("/trials", "layout");
  redirect(`/trials?tnote=${encodeURIComponent(note)}`);
}
