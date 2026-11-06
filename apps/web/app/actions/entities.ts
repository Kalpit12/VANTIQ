"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addEntity, addPair, can, removeEntity, removePair, removeRate, saveRates, updateEntity, type RateInput } from "@vantiq/db";
import { requireMember } from "@/lib/data";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (anchor: string, error?: unknown) => {
  const q = new URLSearchParams(error === undefined ? { saved: anchor } : { error: error instanceof Error ? error.message : "Could not save.", at: anchor });
  return `/settings/entities?${q}#${anchor}`;
};

async function run(anchor: string, fn: (ctx: Awaited<ReturnType<typeof requireMember>>) => Promise<unknown>) {
  const ctx = await requireMember(can.manageEntities);
  try {
    await fn(ctx);
  } catch (e) {
    redirect(back(anchor, e));
  }
  revalidatePath("/", "layout");
  redirect(back(anchor));
}

export async function addEntityAction(form: FormData) {
  await run("entities", ({ db, companyId, userId }) => addEntity(db, companyId, userId, { code: str(form, "code"), name: str(form, "name"), currency: str(form, "currency") }));
}

export async function updateEntityAction(form: FormData) {
  await run("entities", ({ db, companyId, userId }) => updateEntity(db, companyId, userId, str(form, "id"), { code: str(form, "code"), name: str(form, "name") }));
}

export async function removeEntityAction(form: FormData) {
  await run("entities", ({ db, companyId, userId }) => removeEntity(db, companyId, userId, str(form, "id")));
}

export async function saveRateAction(form: FormData) {
  await run("rates", ({ db, companyId, userId }) =>
    saveRates(db, companyId, userId, [{ period: str(form, "period"), currency: str(form, "currency"), average: str(form, "average"), closing: str(form, "closing") }]),
  );
}

/** Pasted rows of "Month, Currency, Average, Closing" (tabs or commas; a header line is skipped). */
export async function importRatesAction(form: FormData) {
  await run("rates", ({ db, companyId, userId }) => {
    const rows: RateInput[] = str(form, "rows")
      .split(/\r?\n/)
      .map((l) => l.split(/\t|,|;/).map((c) => c.trim()))
      .filter((c) => c.some(Boolean) && !/^month/i.test(c[0] ?? ""))
      .map(([period = "", currency = "", average = "", closing = ""]) => ({ period, currency, average, closing: closing || average }));
    return saveRates(db, companyId, userId, rows);
  });
}

export async function removeRateAction(form: FormData) {
  await run("rates", ({ db, companyId, userId }) => removeRate(db, companyId, userId, str(form, "period"), str(form, "currency")));
}

export async function addPairAction(form: FormData) {
  await run("pairs", ({ db, companyId, userId }) =>
    addPair(db, companyId, userId, { entityId: str(form, "entityId"), accountCode: str(form, "accountCode"), counterpartyEntityId: str(form, "counterpartyEntityId"), counterpartyAccountCode: str(form, "counterpartyAccountCode") }),
  );
}

export async function removePairAction(form: FormData) {
  await run("pairs", ({ db, companyId, userId }) => removePair(db, companyId, userId, str(form, "id")));
}
