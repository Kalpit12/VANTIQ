import "server-only";
import { Ledger } from "@vantiq/domain";
import { generateSampleCompany } from "@vantiq/fixtures";

/**
 * Data access for the web app. Milestone 1 reads the synthetic sample company;
 * milestone 2 replaces this with the Postgres-backed repository without
 * changing any screen, because screens only talk to `Ledger`.
 */
let cached: Ledger | null = null;

export function getLedger(): Ledger {
  cached ??= new Ledger(generateSampleCompany());
  return cached;
}
