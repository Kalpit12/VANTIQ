"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, createIncomeSource, saveReceipt } from "@vantiq/db";
import type { IncomeKind } from "@vantiq/domain";
import { requireMember } from "@/lib/data";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const money = (s: string) => Math.round(Number(s.replace(/[$,\s]/g, "") || "NaN") * 100);
const pct = (s: string) => Number(s.replace(/[%\s]/g, "") || "NaN") / 100;
const back = (anchor: string, extra = "") => `/income${extra}#${anchor}`;
const fail = (anchor: string, e: unknown): never => redirect(back(anchor, `?ierr=${encodeURIComponent(e instanceof Error ? e.message : "Could not save.")}`));

export async function createIncomeSourceAction(form: FormData) {
  const { db, companyId, userId } = await requireMember(can.manageIncome);
  let id: string;
  try {
    const award = str(form, "award");
    id = await createIncomeSource(db, companyId, userId, {
      name: str(form, "name"),
      kind: str(form, "kind") as IncomeKind,
      counterparty: str(form, "counterparty"),
      programCode: str(form, "programCode") || null,
      award: award ? money(award) : null,
    });
  } catch (e) {
    fail("add-schedule", e);
  }
  revalidatePath("/income");
  redirect(back(`source-${id!}`));
}

/** Adds a receipt, or changes one when `receiptId` is set. */
export async function saveReceiptAction(form: FormData) {
  const { db, companyId, userId } = await requireMember(can.manageIncome);
  const sourceId = str(form, "sourceId");
  try {
    await saveReceipt(db, companyId, userId, sourceId, str(form, "receiptId") || null, {
      label: str(form, "label"),
      expected: str(form, "expected"),
      amount: money(str(form, "amount")),
      probability: pct(str(form, "probability")),
    });
  } catch (e) {
    fail(`source-${sourceId}`, e);
  }
  revalidatePath("/income");
  redirect(back(`source-${sourceId}`));
}

export async function removeReceiptAction(form: FormData) {
  const { db, companyId, userId } = await requireMember(can.manageIncome);
  const sourceId = str(form, "sourceId");
  try {
    await saveReceipt(db, companyId, userId, sourceId, str(form, "receiptId"), null);
  } catch (e) {
    fail(`source-${sourceId}`, e);
  }
  revalidatePath("/income");
  redirect(back(`source-${sourceId}`));
}
