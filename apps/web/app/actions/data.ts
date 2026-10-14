"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  addMember,
  AuthError,
  can,
  commitImport,
  confirmAllSuggestions,
  createDraft,
  discardDraft,
  hasAnyData,
  IMPORT_KINDS,
  loadSampleData,
  previewImport,
  ROLES,
  saveMappings,
  setMemberRole,
  type Role,
} from "@vantiq/db";
import { parseUpload, type ColumnMap } from "@vantiq/integrations";
import { appOrigin, emailConfigured } from "@/lib/email";
import { requireMember } from "@/lib/data";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export async function uploadAction(_: { error?: string }, form: FormData): Promise<{ error?: string }> {
  let id: string;
  try {
    const { db, companyId, userId } = await requireMember(can.importData);
    const kind = String(form.get("kind"));
    const file = form.get("file");
    if (!IMPORT_KINDS.includes(kind as never)) return { error: "Choose what the file contains." };
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
    if (file.size > MAX_UPLOAD_BYTES) return { error: "That file is over 4 MB. Split it by year and upload each part." };
    const table = await parseUpload(file.name, await file.arrayBuffer());
    id = await createDraft(db, companyId, userId, kind as (typeof IMPORT_KINDS)[number], file.name, table);
  } catch (e) {
    return { error: message(e) };
  }
  redirect(`/import/${id}`);
}

export async function previewAction(importId: string, columnMap: ColumnMap) {
  try {
    const { db, companyId } = await requireMember(can.importData);
    return { ok: true as const, ...(await previewImport(db, companyId, importId, columnMap)) };
  } catch (e) {
    return { ok: false as const, error: message(e) };
  }
}

export async function commitAction(importId: string, columnMap: ColumnMap): Promise<{ error: string }> {
  try {
    const { db, companyId, userId } = await requireMember(can.importData);
    await commitImport(db, companyId, userId, importId, columnMap);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/", "layout");
  redirect(`/import?done=${importId}`);
}

export async function discardAction(form: FormData) {
  const { db, companyId } = await requireMember(can.importData);
  await discardDraft(db, companyId, String(form.get("importId")));
  redirect("/import");
}

export async function loadSampleAction() {
  const { db, companyId, userId } = await requireMember(can.importData);
  // Only into an empty company, so nobody mixes sample rows into real books.
  if (await hasAnyData(db, companyId)) redirect("/import?error=not-empty");
  await loadSampleData(db, companyId, userId);
  revalidatePath("/", "layout");
  redirect("/overview");
}

export async function saveMappingsAction(changes: { accountId: string; categoryId: string | null; excluded: boolean }[]) {
  try {
    const { db, companyId, userId } = await requireMember(can.editMappings);
    const n = await saveMappings(db, companyId, userId, changes);
    revalidatePath("/", "layout");
    return { saved: n };
  } catch (e) {
    return { error: message(e) };
  }
}

export async function confirmAllAction() {
  const { db, companyId, userId } = await requireMember(can.editMappings);
  await confirmAllSuggestions(db, companyId, userId);
  revalidatePath("/", "layout");
}

export interface AddMemberState {
  error?: string;
  added?: string;
  /** New to Vantiq, so they were invited to set a password. */
  invited?: boolean;
  /** The invitation link, shown to the admin only while email isn't set up. */
  inviteLink?: string | null;
}

export async function addMemberAction(_: AddMemberState, form: FormData): Promise<AddMemberState> {
  try {
    const { db, companyId, userId } = await requireMember(can.manageMembers);
    const role = String(form.get("role")) as Role;
    if (!ROLES.includes(role)) return { error: "Choose a role." };
    const email = String(form.get("email") ?? "");
    const { inviteToken } = await addMember(db, userId, companyId, { name: String(form.get("name") ?? ""), email, role });
    revalidatePath("/settings/members");
    return { added: email, invited: !!inviteToken, inviteLink: inviteToken && !emailConfigured() ? `${await appOrigin()}/invite/${inviteToken}` : null };
  } catch (e) {
    return { error: e instanceof AuthError || e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function setRoleAction(form: FormData) {
  const { db, companyId, userId } = await requireMember(can.manageMembers);
  const role = String(form.get("role")) as Role;
  if (!ROLES.includes(role)) return;
  try {
    await setMemberRole(db, userId, companyId, String(form.get("userId")), role);
  } catch (e) {
    redirect(`/settings/members?error=${encodeURIComponent(message(e))}`);
  }
  revalidatePath("/settings/members");
}
