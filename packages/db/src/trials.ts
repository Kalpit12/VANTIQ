import { DRIVERS, periodLabel, type ChangeOrder, type ContractItem, type Period, type Trial, type TrialActivity } from "@vantiq/domain";
import { generateSampleTrials } from "@vantiq/fixtures";
import type { RawTable } from "@vantiq/integrations";
import { eq, inArray } from "drizzle-orm";
import type { Db, Tx } from "./client";
import { auditEvents, trialActivity, trials } from "./schema";
import { withCompany } from "./tenant";

export class TrialError extends Error {}

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const isPeriod = (p: string) => PERIOD.test(p);

export interface TrialInput {
  code: string;
  name: string;
  programCode: string | null;
  croName: string;
  phase: string;
  start: Period;
  end: Period;
  items: ContractItem[];
}

function checkItems(items: ContractItem[], where: string) {
  for (const i of items) {
    if (!DRIVERS.some((d) => d.driver === i.driver)) throw new TrialError(`${where}: unknown driver.`);
    if (!Number.isInteger(i.units) || i.units < 0 || i.units > 1_000_000) throw new TrialError(`${where}: units must be a whole number.`);
    if (!Number.isInteger(i.unitCost) || i.unitCost < 0 || i.unitCost > 1e12) throw new TrialError(`${where}: enter a unit cost of zero or more.`);
  }
  if (!items.some((i) => i.units > 0 && i.unitCost > 0)) throw new TrialError(`${where}: add at least one priced line.`);
}

function checkTrial(t: TrialInput) {
  if (!t.code.trim() || t.code.length > 40) throw new TrialError("Enter a trial ID of 40 characters or fewer.");
  if (!t.name.trim() || t.name.length > 200) throw new TrialError("Enter the trial's name.");
  if (!t.croName.trim()) throw new TrialError("Enter the CRO's name as it appears on its invoices.");
  if (!isPeriod(t.start) || !isPeriod(t.end) || t.end < t.start) throw new TrialError("Enter a start month and an end month after it.");
  checkItems(t.items, "Contract");
}

type TrialRow = typeof trials.$inferSelect;
const toTrial = (r: TrialRow, activity: TrialActivity[]): Trial => ({
  id: r.id,
  code: r.code,
  name: r.name,
  programCode: r.programCode,
  croName: r.croName,
  phase: r.phase,
  end: r.endPeriod,
  contract: { start: r.startPeriod, items: r.items, changeOrders: r.changeOrders },
  activity,
});

async function activityFor(tx: Tx, ids: string[]) {
  if (!ids.length) return new Map<string, (TrialActivity & { source: string; updatedAt: Date })[]>();
  const rows = await tx.select().from(trialActivity).where(inArray(trialActivity.trialId, ids)).orderBy(trialActivity.period);
  const out = new Map<string, (TrialActivity & { source: string; updatedAt: Date })[]>();
  for (const r of rows) {
    const list = out.get(r.trialId) ?? [];
    list.push({ period: r.period, sites: r.sites, patients: r.patients, visits: r.visits, source: r.source, updatedAt: r.updatedAt });
    out.set(r.trialId, list);
  }
  return out;
}

export async function listTrials(db: Db, companyId: string): Promise<Trial[]> {
  return withCompany(db, companyId, async (tx) => {
    const rows = await tx.select().from(trials).orderBy(trials.code);
    const acts = await activityFor(tx, rows.map((r) => r.id));
    return rows.map((r) => toTrial(r, acts.get(r.id) ?? []));
  });
}

export async function getTrial(db: Db, companyId: string, id: string): Promise<Trial | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return withCompany(db, companyId, async (tx) => {
    const [row] = await tx.select().from(trials).where(eq(trials.id, id));
    if (!row) return null;
    return toTrial(row, (await activityFor(tx, [row.id])).get(row.id) ?? []);
  });
}

export async function createTrial(db: Db, companyId: string, userId: string | null, input: TrialInput): Promise<string> {
  checkTrial(input);
  return withCompany(db, companyId, async (tx) => {
    const [dup] = await tx.select({ id: trials.id }).from(trials).where(eq(trials.code, input.code.trim()));
    if (dup) throw new TrialError(`There is already a trial ${input.code.trim()}.`);
    const [row] = await tx
      .insert(trials)
      .values({
        companyId,
        code: input.code.trim(),
        name: input.name.trim(),
        programCode: input.programCode?.trim() || null,
        croName: input.croName.trim(),
        phase: input.phase.trim(),
        startPeriod: input.start,
        endPeriod: input.end,
        items: input.items.filter((i) => i.units > 0),
      })
      .returning({ id: trials.id });
    await tx.insert(auditEvents).values({ companyId, actorId: userId, action: "trial.created", target: input.code.trim(), detail: { cro: input.croName } });
    return row!.id;
  });
}

export async function addChangeOrder(db: Db, companyId: string, userId: string, trialId: string, co: Omit<ChangeOrder, "number">) {
  if (!isPeriod(co.effective)) throw new TrialError("Enter the month the change order takes effect.");
  if (!co.description.trim() || co.description.length > 300) throw new TrialError("Describe the change order in 300 characters or fewer.");
  checkItems(co.items, "Change order");
  return withCompany(db, companyId, async (tx) => {
    const [row] = await tx.select().from(trials).where(eq(trials.id, trialId)).for("update");
    if (!row) throw new TrialError("That trial does not exist.");
    const number = Math.max(0, ...row.changeOrders.map((c) => c.number)) + 1;
    const next = [...row.changeOrders, { number, effective: co.effective, description: co.description.trim(), items: co.items.filter((i) => i.units > 0) }];
    await tx.update(trials).set({ changeOrders: next }).where(eq(trials.id, trialId));
    await tx.insert(auditEvents).values({ companyId, actorId: userId, action: "trial.change_order", target: row.code, detail: { number, effective: co.effective, description: co.description.trim() } });
    return number;
  });
}

/** Records activity for some months, replacing what was there for those months. */
export async function saveActivity(db: Db, companyId: string, userId: string | null, trialId: string, rows: TrialActivity[], source: "manual" | "import" | "sample") {
  for (const r of rows) {
    if (!isPeriod(r.period)) throw new TrialError(`"${r.period}" is not a month.`);
    for (const k of ["sites", "patients", "visits"] as const) if (!Number.isInteger(r[k]) || r[k] < 0 || r[k] > 1_000_000) throw new TrialError(`${periodLabel(r.period)}: ${k} must be a whole number of zero or more.`);
  }
  await withCompany(db, companyId, async (tx) => {
    const [trial] = await tx.select({ code: trials.code }).from(trials).where(eq(trials.id, trialId));
    if (!trial) throw new TrialError("That trial does not exist.");
    for (const r of rows) {
      const values = { sites: r.sites, patients: r.patients, visits: r.visits, source, updatedAt: new Date() };
      await tx
        .insert(trialActivity)
        .values({ companyId, trialId, period: r.period, ...values })
        .onConflictDoUpdate({ target: [trialActivity.trialId, trialActivity.period], set: values });
    }
    if (source !== "sample")
      await tx.insert(auditEvents).values({ companyId, actorId: userId, action: "trial.activity", target: trial.code, detail: { months: rows.map((r) => r.period), source } });
  });
}

const HEADERS = {
  trial: /^(trial|study|protocol)(\s*(id|code|number))?$/i,
  month: /^(month|period|date)$/i,
  sites: /sites?/i,
  patients: /patients?|subjects?|enrol/i,
  visits: /visits?/i,
};

/** `2026-09`, `2026-09-30`, `09/2026` or `Sep 2026` → `2026-09`. */
function monthOf(s: string): Period | null {
  const v = s.trim();
  let m = /^(\d{4})-(\d{1,2})(-\d{1,2})?$/.exec(v);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}`;
  m = /^(\d{1,2})\/(\d{4})$/.exec(v);
  if (m) return `${m[2]}-${m[1]!.padStart(2, "0")}`;
  m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(v);
  if (m) {
    const i = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[1]!.toLowerCase());
    if (i >= 0) return `${m[2]}-${String(i + 1).padStart(2, "0")}`;
  }
  return null;
}

export interface ActivityImportResult {
  saved: { trial: string; months: number }[];
  errors: string[];
}

/**
 * A CRO activity report: one row per trial and month with sites activated,
 * patients enrolled and visits completed in that month.
 */
export async function importActivity(db: Db, companyId: string, userId: string, table: RawTable): Promise<ActivityImportResult> {
  const col = (k: keyof typeof HEADERS) => table.headers.findIndex((h) => HEADERS[k].test(h.trim()));
  const idx = { trial: col("trial"), month: col("month"), sites: col("sites"), patients: col("patients"), visits: col("visits") };
  const missing = Object.entries(idx).filter(([, i]) => i < 0).map(([k]) => k);
  if (missing.length) throw new TrialError(`The file needs columns for trial, month, sites, patients and visits. Missing: ${missing.join(", ")}.`);
  const list = await listTrials(db, companyId);
  const byCode = new Map(list.map((t) => [t.code.toLowerCase(), t]));
  const rows = new Map<string, TrialActivity[]>();
  const errors: string[] = [];
  table.rows.forEach((r, n) => {
    const line = n + 2;
    const trial = byCode.get((r[idx.trial] ?? "").trim().toLowerCase());
    if (!trial) return void errors.push(`Row ${line}: no trial "${(r[idx.trial] ?? "").trim()}".`);
    const period = monthOf(r[idx.month] ?? "");
    if (!period || !isPeriod(period)) return void errors.push(`Row ${line}: "${r[idx.month] ?? ""}" is not a month.`);
    const num = (i: number) => {
      const v = (r[i] ?? "").replace(/,/g, "").trim();
      return v === "" ? 0 : Number(v);
    };
    const a = { period, sites: num(idx.sites), patients: num(idx.patients), visits: num(idx.visits) };
    if (![a.sites, a.patients, a.visits].every((x) => Number.isInteger(x) && x >= 0)) return void errors.push(`Row ${line}: counts must be whole numbers of zero or more.`);
    rows.set(trial.id, [...(rows.get(trial.id) ?? []).filter((x) => x.period !== period), a]);
  });
  const saved: ActivityImportResult["saved"] = [];
  for (const [trialId, acts] of rows) {
    await saveActivity(db, companyId, userId, trialId, acts, "import");
    saved.push({ trial: list.find((t) => t.id === trialId)!.code, months: acts.length });
  }
  return { saved, errors };
}

/** The Helixa sample trials, for a company that loaded the sample books. */
export async function loadSampleTrials(db: Db, companyId: string, userId: string | null) {
  for (const t of generateSampleTrials()) {
    const exists = await withCompany(db, companyId, (tx) => tx.select({ id: trials.id }).from(trials).where(eq(trials.code, t.code)));
    if (exists.length) continue;
    const id = await createTrial(db, companyId, userId, {
      code: t.code,
      name: t.name,
      programCode: t.programCode,
      croName: t.croName,
      phase: t.phase,
      start: t.contract.start,
      end: t.end,
      items: t.contract.items,
    });
    await withCompany(db, companyId, (tx) => tx.update(trials).set({ changeOrders: t.contract.changeOrders }).where(eq(trials.id, id)));
    await saveActivity(db, companyId, userId, id, t.activity, "sample");
  }
}

