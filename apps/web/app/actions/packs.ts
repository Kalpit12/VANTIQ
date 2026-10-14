"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { approvePack, can, PackError, renameCompany, reopenPack } from "@vantiq/db";
import { getWorkspace, requireMember } from "@/lib/data";
import { packState } from "@/lib/pack";

const pageFor = (period: string, extra = "") => `/pack?period=${encodeURIComponent(period)}${extra}`;
const fail = (period: string, e: unknown): never =>
  redirect(pageFor(period, `&perr=${encodeURIComponent(e instanceof PackError || e instanceof Error ? e.message : "Could not save.")}`));

/** Approves the month shown, after checking it is ready, and locks it. */
export async function approvePackAction(form: FormData) {
  const period = String(form.get("period") ?? "");
  const { db, companyId, userId } = await requireMember(can.approvePack);
  const ws = await getWorkspace();
  const st = await packState(ws, period);
  const blocked = st.checks.filter((c) => !c.ok);
  if (blocked.length) fail(period, new Error(`Not ready to approve: ${blocked.map((c) => c.detail).join(" ")}`));
  try {
    await approvePack(db, companyId, userId, st.live.period, st.live as unknown as Record<string, unknown>);
  } catch (e) {
    fail(period, e);
  }
  revalidatePath("/", "layout");
  redirect(pageFor(st.live.period));
}

export async function reopenPackAction(form: FormData) {
  const period = String(form.get("period") ?? "");
  const { db, companyId, userId } = await requireMember(can.reopenPack);
  try {
    await reopenPack(db, companyId, userId, period, String(form.get("reason") ?? ""));
  } catch (e) {
    fail(period, e);
  }
  revalidatePath("/", "layout");
  redirect(pageFor(period));
}

export async function renameCompanyAction(form: FormData) {
  const { db, companyId, userId } = await requireMember(can.manageMembers);
  try {
    await renameCompany(db, companyId, userId, String(form.get("name") ?? ""));
  } catch (e) {
    redirect(`/settings?error=${encodeURIComponent(e instanceof Error ? e.message : "Could not save.")}`);
  }
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}
