import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const clients = new Map<string, { db: Db; sql: postgres.Sql }>();

/** One pooled client per connection string, reused across requests and hot reloads. */
export function getDb(url = process.env.DATABASE_URL): Db {
  if (!url) throw new Error("DATABASE_URL is not set.");
  let c = clients.get(url);
  if (!c) {
    const sql = postgres(url, { max: Number(process.env.DATABASE_POOL_SIZE ?? 5), prepare: false, onnotice: () => {} });
    c = { db: drizzle(sql, { schema }), sql };
    clients.set(url, c);
  }
  return c.db;
}

export async function closeDb(url = process.env.DATABASE_URL) {
  const c = url ? clients.get(url) : undefined;
  if (c) {
    clients.delete(url!);
    await c.sql.end({ timeout: 5 });
  }
}
