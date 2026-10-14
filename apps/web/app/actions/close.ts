"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addCloseTask, addComment, assignCloseTask, can, prepareCloseTask, reviewCloseTask } from "@vantiq/db";
import type { CloseSection } from "@vantiq/domain";
import { requireMember } from "@/lib/data";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const message = (e: unknown) => (e instanceof Error ? e.message : "Could not save.");

/** Where to go back to: a same-site path from the form, or the close page for the month. */
function backTo(f: FormData) {
  const back = str(f, "back");
  return back.startsWith("/") && !back.startsWith("//") ? back : `/close?period=${encodeURIComponent(str(f, "period"))}`;
}
const withParam = (path: string, k: string, v: string) => {
  const [base, hash] = path.split("#");
  return `${base}${base!.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(v)}${hash ? `#${hash}` : ""}`;
};

async function run(form: FormData, fn: (m: Awaited<ReturnType<typeof requireMember>>) => Promise<unknown>, check?: Parameters<typeof requireMember>[0]) {
  const m = await requireMember(check);
  const back = backTo(form);
  try {
    await fn(m);
  } catch (e) {
    redirect(withParam(back, "cerr", message(e)));
  }
  revalidatePath("/", "layout");
  redirect(back);
}

export async function assignTaskAction(form: FormData) {
  await run(
    form,
    ({ db, companyId, userId, role }) =>
      assignCloseTask(db, companyId, { userId, role }, str(form, "period"), str(form, "key"), { ownerId: str(form, "ownerId") || null, reviewerId: str(form, "reviewerId") || null }),
    can.manageClose,
  );
}

export async function prepareTaskAction(form: FormData) {
  await run(form, ({ db, companyId, userId, role }) => prepareCloseTask(db, companyId, { userId, role }, str(form, "period"), str(form, "key"), str(form, "done") === "1"));
}

export async function reviewTaskAction(form: FormData) {
  await run(form, ({ db, companyId, userId, role }) => reviewCloseTask(db, companyId, { userId, role }, str(form, "period"), str(form, "key")));
}

export async function addTaskAction(form: FormData) {
  await run(
    form,
    ({ db, companyId, userId, role }) =>
      addCloseTask(db, companyId, { userId, role }, str(form, "period"), { title: str(form, "title"), section: str(form, "section") as CloseSection, dueDay: Number(str(form, "dueDay")) }),
    can.manageClose,
  );
}

export async function addCommentAction(form: FormData) {
  await run(form, ({ db, companyId, userId }) => addComment(db, companyId, userId, str(form, "period"), str(form, "anchor"), str(form, "body")), can.comment);
}
