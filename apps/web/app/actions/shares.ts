"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { can, createShareLink, revokeShareLink } from "@vantiq/db";
import { NEW_SHARE_COOKIE } from "@/lib/board";
import { requireMember } from "@/lib/data";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const page = (period: string, extra = "") => `/pack?period=${encodeURIComponent(period)}${extra}#board`;
const fail = (period: string, e: unknown): never => redirect(page(period, `&serr=${encodeURIComponent(e instanceof Error ? e.message : "Could not save.")}`));

export async function createShareAction(form: FormData) {
  const { db, companyId, userId } = await requireMember(can.sharePack);
  const period = str(form, "period");
  try {
    const created = await createShareLink(db, companyId, userId, { period, label: str(form, "label"), note: str(form, "note"), days: Number(str(form, "days")) });
    (await cookies()).set(NEW_SHARE_COOKIE, `${created.id}.${created.token}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/pack",
      maxAge: 60,
    });
  } catch (e) {
    fail(period, e);
  }
  revalidatePath("/pack");
  redirect(page(period));
}

export async function revokeShareAction(form: FormData) {
  const { db, companyId, userId } = await requireMember(can.sharePack);
  const period = str(form, "period");
  try {
    await revokeShareLink(db, companyId, userId, str(form, "id"));
  } catch (e) {
    fail(period, e);
  }
  revalidatePath("/pack");
  redirect(page(period));
}

