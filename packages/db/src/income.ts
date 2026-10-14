import { INCOME_KINDS, type ExpectedReceipt, type IncomeKind, type IncomeSource } from "@vantiq/domain";
import { generateSampleIncome } from "@vantiq/fixtures";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { auditEvents, incomeSources } from "./schema";
import { withCompany } from "./tenant";

export class IncomeError extends Error {}

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX = 1e13;

export interface IncomeSourceInput {
  name: string;
  kind: IncomeKind;
  counterparty: string;
  programCode: string | null;
  award: number | null;
}

export type ReceiptInput = Omit<ExpectedReceipt, "id">;

function checkSource(s: IncomeSourceInput) {
  if (!s.name.trim() || s.name.length > 120) throw new IncomeError("Enter a name of 120 characters or fewer.");
  if (!INCOME_KINDS.some((k) => k.kind === s.kind)) throw new IncomeError("Choose grant, partner milestones or licensing.");
  if (!s.counterparty.trim() || s.counterparty.length > 200) throw new IncomeError("Enter who pays, as their name appears in your books.");
  if (s.award !== null && (!Number.isInteger(s.award) || s.award <= 0 || s.award > MAX)) throw new IncomeError("Enter the total award as an amount above zero, or leave it blank.");
}

function checkReceipt(r: ReceiptInput) {
  if (!r.label.trim() || r.label.length > 120) throw new IncomeError("Describe the receipt in 120 characters or fewer.");
  if (!PERIOD.test(r.expected)) throw new IncomeError("Enter the month you expect the money.");
  if (!Number.isInteger(r.amount) || r.amount <= 0 || r.amount > MAX) throw new IncomeError("Enter an amount above zero.");
  if (!(r.probability >= 0 && r.probability <= 1)) throw new IncomeError("Enter a likelihood between 0% and 100%.");
}

const toSource = (r: typeof incomeSources.$inferSelect): IncomeSource => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  counterparty: r.counterparty,
  programCode: r.programCode,
  award: r.award,
  receipts: r.receipts,
});

export async function listIncomeSources(db: Db, companyId: string): Promise<IncomeSource[]> {
  const rows = await withCompany(db, companyId, (tx) => tx.select().from(incomeSources).orderBy(incomeSources.createdAt, incomeSources.name));
  return rows.map(toSource);
}

export async function createIncomeSource(db: Db, companyId: string, userId: string | null, input: IncomeSourceInput, receipts: ReceiptInput[] = []): Promise<string> {
  checkSource(input);
  receipts.forEach(checkReceipt);
  return withCompany(db, companyId, async (tx) => {
    const [dup] = await tx.select({ id: incomeSources.id }).from(incomeSources).where(eq(incomeSources.name, input.name.trim()));
    if (dup) throw new IncomeError(`There is already a schedule called ${input.name.trim()}.`);
    const [row] = await tx
      .insert(incomeSources)
      .values({
        companyId,
        name: input.name.trim(),
        kind: input.kind,
        counterparty: input.counterparty.trim(),
        programCode: input.programCode?.trim() || null,
        award: input.award,
        receipts: receipts.map((r) => ({ ...r, label: r.label.trim(), id: randomUUID() })),
      })
      .returning({ id: incomeSources.id });
    await tx.insert(auditEvents).values({ companyId, actorId: userId, action: "income.created", target: input.name.trim(), detail: { kind: input.kind, counterparty: input.counterparty.trim() } });
    return row!.id;
  });
}

/** Adds, changes (`receiptId` given) or removes (`input` null) one expected receipt. */
export async function saveReceipt(db: Db, companyId: string, userId: string, sourceId: string, receiptId: string | null, input: ReceiptInput | null) {
  if (input) checkReceipt(input);
  if (!/^[0-9a-f-]{36}$/i.test(sourceId)) throw new IncomeError("That schedule does not exist.");
  await withCompany(db, companyId, async (tx) => {
    const [row] = await tx.select().from(incomeSources).where(eq(incomeSources.id, sourceId)).for("update");
    if (!row) throw new IncomeError("That schedule does not exist.");
    const before = receiptId ? row.receipts.find((r) => r.id === receiptId) : undefined;
    if (receiptId && !before) throw new IncomeError("That receipt is no longer on the schedule.");
    const next = !input
      ? row.receipts.filter((r) => r.id !== receiptId)
      : before
        ? row.receipts.map((r) => (r.id === receiptId ? { ...input, label: input.label.trim(), id: r.id } : r))
        : [...row.receipts, { ...input, label: input.label.trim(), id: randomUUID() }];
    await tx.update(incomeSources).set({ receipts: next }).where(eq(incomeSources.id, sourceId));
    await tx.insert(auditEvents).values({
      companyId,
      actorId: userId,
      action: !input ? "income.receipt_removed" : before ? "income.receipt_changed" : "income.receipt_added",
      target: row.name,
      detail: { label: input?.label.trim() ?? before?.label, ...(before && { before: { expected: before.expected, amount: before.amount, probability: before.probability } }), ...(input && { expected: input.expected, amount: input.amount, probability: input.probability }) },
    });
  });
}

export async function loadSampleIncome(db: Db, companyId: string, userId: string | null) {
  const existing = new Set((await listIncomeSources(db, companyId)).map((s) => s.name));
  for (const s of generateSampleIncome()) {
    if (existing.has(s.name)) continue;
    await createIncomeSource(db, companyId, userId, s, s.receipts);
  }
}
