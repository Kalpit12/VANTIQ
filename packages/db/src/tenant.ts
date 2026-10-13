import { sql } from "drizzle-orm";
import type { Db, Tx } from "./client";

/**
 * Runs `fn` in a transaction scoped to one company. Row-level security hides
 * every other company's rows, so a query that forgets a company_id filter
 * still cannot leak data.
 */
export async function withCompany<T>(db: Db, companyId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.company_id', ${companyId}, true)`);
    return fn(tx);
  });
}
