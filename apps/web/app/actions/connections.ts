"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, ConnectionError, createConnection, deleteConnection, hasAnyData, intacctSender, loadSampleBudget, runSync } from "@vantiq/db";
import { ACCOUNTING_SYSTEMS, ConnectorError, createMergeLinkToken, exchangeMergePublicToken, verifyIntacct, type IntacctCredentials } from "@vantiq/integrations";
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

export interface IntacctFormState {
  error?: string;
  values?: { companyId?: string; userId?: string; entityId?: string; programDimension?: string };
}

/** Sage Intacct signs in with a Web Services user: check the credentials, store them sealed, then run the first 24-month sync. */
export async function intacctConnectAction(_: IntacctFormState, form: FormData): Promise<IntacctFormState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const credentials: IntacctCredentials = {
    companyId: get("companyId"),
    userId: get("userId"),
    password: String(form.get("password") ?? ""),
    entityId: get("entityId") || undefined,
    programDimension: get("programDimension") === "class" ? "class" : "project",
  };
  const values = { companyId: credentials.companyId, userId: credentials.userId, entityId: credentials.entityId, programDimension: credentials.programDimension };
  if (!credentials.companyId || !credentials.userId || !credentials.password) return { error: "Enter the company ID, Web Services user ID and password.", values };
  try {
    const { db, companyId, userId } = await requireMember(can.importData);
    const sender = intacctSender();
    if (!sender || !process.env.CONNECTION_SECRET_KEY) return { error: "Connecting Sage Intacct needs INTACCT_SENDER_ID, INTACCT_SENDER_PASSWORD and CONNECTION_SECRET_KEY on the server.", values };
    await verifyIntacct({ sender, credentials, endpoint: process.env.INTACCT_ENDPOINT || undefined });
    await createConnection(db, companyId, userId, { provider: "sage_intacct", systemName: "Sage Intacct", accountToken: JSON.stringify(credentials) });
    await runSync(db, companyId, { trigger: "initial", actorId: userId });
  } catch (e) {
    return { error: message(e), values };
  }
  revalidatePath("/", "layout");
  redirect("/connections");
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

