"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, ConnectionError, createConnection, deleteConnection, hasAnyData, loadSampleBudget, runSync } from "@vantiq/db";
import { ACCOUNTING_SYSTEMS, ConnectorError, createMergeLinkToken, exchangeMergePublicToken } from "@vantiq/integrations";
import { requireMember } from "@/lib/data";

const message = (e: unknown) => (e instanceof ConnectionError || e instanceof ConnectorError ? e.message : e instanceof Error ? e.message : "Something went wrong.");

export async function mergeLinkTokenAction(systemId: string): Promise<{ linkToken?: string; error?: string }> {
  try {
    const { companyId, session } = await requireMember(can.importData);
    const apiKey = process.env.MERGE_API_KEY;
    if (!apiKey || !process.env.CONNECTION_SECRET_KEY) return { error: "Connecting needs MERGE_API_KEY and CONNECTION_SECRET_KEY on the server." };
    const system = ACCOUNTING_SYSTEMS.find((s) => s.id === systemId);
    const linkToken = await createMergeLinkToken(apiKey, { id: companyId, name: session.company!.name, email: session.user.email }, fetch, system?.mergeSlug);
    return { linkToken };
  } catch (e) {
    return { error: message(e) };
  }
}

/** Merge Link finished: store the connection and run the first 24-month sync. */
export async function mergeConnectAction(publicToken: string): Promise<{ error?: string }> {
  try {
    const { db, companyId, userId } = await requireMember(can.importData);
    const { accountToken, systemName } = await exchangeMergePublicToken(process.env.MERGE_API_KEY!, publicToken);
    await createConnection(db, companyId, userId, { provider: "merge", systemName, accountToken });
    await runSync(db, companyId, { trigger: "initial", actorId: userId });
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/", "layout");
  return {};
}

/** Practice books: a pretend QuickBooks holding the Helixa sample, plus its budget file. Empty companies only. */
export async function connectSandboxAction() {
  const { db, companyId, userId } = await requireMember(can.importData);
  if (await hasAnyData(db, companyId)) redirect("/connections?error=not-empty");
  try {
    await createConnection(db, companyId, userId, { provider: "sandbox", systemName: "QuickBooks Online (sandbox)" });
  } catch (e) {
    redirect(`/connections?error=${encodeURIComponent(message(e))}`);
  }
  await runSync(db, companyId, { trigger: "initial", actorId: userId });
  await loadSampleBudget(db, companyId, userId);
  revalidatePath("/", "layout");
  redirect("/connections");
}

export async function syncNowAction() {
  const { db, companyId, userId } = await requireMember(can.importData);
  await runSync(db, companyId, { trigger: "manual", actorId: userId });
  revalidatePath("/", "layout");
}

export async function disconnectAction() {
  const { db, companyId, userId } = await requireMember(can.importData);
  await deleteConnection(db, companyId, userId);
  revalidatePath("/", "layout");
}

