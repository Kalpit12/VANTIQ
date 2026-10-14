"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NOTIFY_KINDS, setEmailPrefs, type NotifyKind } from "@vantiq/db";
import { requireMember } from "@/lib/data";

export async function saveEmailPrefsAction(form: FormData) {
  const { db, companyId, userId } = await requireMember();
  const on = new Set(form.getAll("on").map(String));
  const off: NotifyKind[] = NOTIFY_KINDS.filter((k) => !on.has(k.kind)).map((k) => k.kind);
  await setEmailPrefs(db, userId, companyId, off);
  revalidatePath("/settings/notifications");
  redirect("/settings/notifications?saved=1");
}
