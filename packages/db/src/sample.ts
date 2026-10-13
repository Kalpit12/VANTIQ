import { generateSampleCompany, sampleFiles } from "@vantiq/fixtures";
import { parseCsv } from "@vantiq/integrations";
import { guessColumns } from "@vantiq/integrations";
import type { Db } from "./client";
import { commitImport, createDraft } from "./imports";
import { programs } from "./schema";
import { withCompany } from "./tenant";

/**
 * Loads the Helixa sample data into a company through the real import path
 * (the same three files a customer would upload), so trying the sample also
 * exercises import, deduplication and mapping.
 */
export async function loadSampleData(db: Db, companyId: string, userId: string) {
  const data = generateSampleCompany();
  const files = sampleFiles(data);
  await withCompany(db, companyId, (tx) =>
    tx
      .insert(programs)
      .values(data.programs.map((p) => ({ companyId, code: p.code, name: p.name, therapeuticArea: p.therapeuticArea, phase: p.phase })))
      .onConflictDoNothing(),
  );
  for (const [kind, csv, name] of [
    ["ledger", files.ledgerCsv, "helixa-general-ledger.csv"],
    ["budget", files.budgetCsv, "helixa-budget.csv"],
    ["cash", files.cashCsv, "helixa-cash-balances.csv"],
  ] as const) {
    const table = parseCsv(csv);
    const id = await createDraft(db, companyId, userId, kind, name, table);
    await commitImport(db, companyId, userId, id, guessColumns(table.headers, kind));
  }
}
