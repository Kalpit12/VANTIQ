import { STANDARD_CATEGORIES } from "@vantiq/domain";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, getDb } from "./client";
import { categories } from "./schema";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Applies migrations and refreshes the standard category chart. Safe to run repeatedly. */
export async function migrateDb(url = process.env.DATABASE_URL) {
  const db = getDb(url);
  await migrate(db, { migrationsFolder: path.join(here, "../migrations") });
  for (const c of STANDARD_CATEGORIES) {
    await db
      .insert(categories)
      .values({ id: c.id, parentId: c.parentId, name: c.name, kind: c.kind, sortOrder: c.order })
      .onConflictDoUpdate({ target: categories.id, set: { parentId: c.parentId, name: c.name, kind: c.kind, sortOrder: c.order } });
  }
  await db.execute(sql`select 1`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrateDb()
    .then(() => console.log("Database is up to date."))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
