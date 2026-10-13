import { sql } from "drizzle-orm";
import { bigint, boolean, char, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/*
 * Tenancy (architecture.md 5.1): every tenant-owned table has company_id and a
 * row-level security policy (migrations/0001_rls.sql) that only shows rows
 * whose company_id matches `app.company_id`, set per transaction by
 * `withCompany`. Users, memberships and sessions sit outside RLS and are only
 * read through the auth module.
 */

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const companyId = () => uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => bigint(name, { mode: "number" }).notNull();

export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull(),
  baseCurrency: char("base_currency", { length: 3 }).notNull().default("USD"),
  fiscalYearStart: integer("fiscal_year_start").notNull().default(1),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(sql`lower(${t.email})`)],
);

export const ROLES = ["admin", "finance", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const memberships = pgTable(
  "memberships",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    companyId: companyId(),
    role: text("role").$type<Role>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.companyId] })],
);

export const sessions = pgTable("sessions", {
  /** SHA-256 of the cookie token; the token itself is never stored. */
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

/** Vantiq's standard chart, shared by all companies (seeded from @vantiq/domain). */
export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const sourceAccounts = pgTable(
  "source_accounts",
  {
    id: id(),
    companyId: companyId(),
    code: text("code").notNull(),
    name: text("name").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("source_accounts_code_idx").on(t.companyId, t.code)],
);

export const MAPPING_STATUS = ["suggested", "confirmed"] as const;

export const accountMappings = pgTable("account_mappings", {
  sourceAccountId: uuid("source_account_id")
    .primaryKey()
    .references(() => sourceAccounts.id, { onDelete: "cascade" }),
  companyId: companyId(),
  /** Leaf category, or null when the account is excluded from the P&L. */
  categoryId: text("category_id").references(() => categories.id),
  excluded: boolean("excluded").notNull().default(false),
  status: text("status").$type<(typeof MAPPING_STATUS)[number]>().notNull(),
  reason: text("reason").notNull().default(""),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const programs = pgTable(
  "programs",
  {
    id: id(),
    companyId: companyId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    therapeuticArea: text("therapeutic_area").notNull().default(""),
    phase: text("phase"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("programs_code_idx").on(t.companyId, t.code)],
);

export const vendors = pgTable(
  "vendors",
  {
    id: id(),
    companyId: companyId(),
    name: text("name").notNull(),
    type: text("type").notNull().default("other"),
  },
  (t) => [uniqueIndex("vendors_name_idx").on(t.companyId, t.name)],
);

export const departments = pgTable(
  "departments",
  {
    id: id(),
    companyId: companyId(),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("departments_name_idx").on(t.companyId, t.name)],
);

export const IMPORT_KINDS = ["ledger", "budget", "cash"] as const;

export const imports = pgTable(
  "imports",
  {
    id: id(),
    companyId: companyId(),
    kind: text("kind").$type<(typeof IMPORT_KINDS)[number]>().notNull(),
    filename: text("filename").notNull(),
    status: text("status").$type<"draft" | "done">().notNull(),
    headers: jsonb("headers").$type<string[]>().notNull(),
    /** Raw rows, kept only while the import is a draft. */
    rows: jsonb("rows").$type<string[][] | null>(),
    columnMap: jsonb("column_map").$type<Record<string, number | null> | null>(),
    rowCount: integer("row_count").notNull(),
    inserted: integer("inserted").notNull().default(0),
    duplicates: integer("duplicates").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("imports_company_idx").on(t.companyId, t.createdAt)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: id(),
    companyId: companyId(),
    importId: uuid("import_id").references(() => imports.id, { onDelete: "set null" }),
    date: date("date", { mode: "string" }).notNull(),
    sourceAccountId: uuid("source_account_id").notNull().references(() => sourceAccounts.id),
    vendorId: uuid("vendor_id").references(() => vendors.id),
    departmentId: uuid("department_id").references(() => departments.id),
    programId: uuid("program_id").references(() => programs.id),
    /** Debit-positive minor units, as in the source ledger. */
    amountMinor: money("amount_minor"),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    memo: text("memo").notNull().default(""),
    /** Makes re-importing the same file a no-op. */
    sourceHash: text("source_hash").notNull(),
  },
  (t) => [uniqueIndex("transactions_hash_idx").on(t.companyId, t.sourceHash), index("transactions_date_idx").on(t.companyId, t.date)],
);

export const budgetLines = pgTable(
  "budget_lines",
  {
    id: id(),
    companyId: companyId(),
    importId: uuid("import_id").references(() => imports.id, { onDelete: "set null" }),
    period: char("period", { length: 7 }).notNull(),
    sourceAccountId: uuid("source_account_id").notNull().references(() => sourceAccounts.id),
    programId: uuid("program_id").references(() => programs.id),
    /** Natural-sign minor units: positive for planned spend and planned income. */
    amountMinor: money("amount_minor"),
  },
  (t) => [index("budget_lines_period_idx").on(t.companyId, t.period)],
);

export const cashBalances = pgTable(
  "cash_balances",
  {
    companyId: companyId(),
    period: char("period", { length: 7 }).notNull(),
    balanceMinor: money("balance_minor"),
    importId: uuid("import_id").references(() => imports.id, { onDelete: "set null" }),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.period] })],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    companyId: companyId(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    target: text("target").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_events_company_idx").on(t.companyId, t.at)],
);

/** Tables guarded by row-level security. Kept here so tests can check every one. */
export const TENANT_TABLES = [
  "source_accounts",
  "account_mappings",
  "programs",
  "vendors",
  "departments",
  "imports",
  "transactions",
  "budget_lines",
  "cash_balances",
  "audit_events",
] as const;
