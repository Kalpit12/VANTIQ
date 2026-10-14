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
    /** revenue, expense, asset, liability or equity, when a connected system says so. */
    classification: text("classification"),
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

export const CONNECTION_STATUS = ["active", "error"] as const;
export type ConnectionProvider = "quickbooks" | "merge" | "sandbox";

/**
 * A company's link to its accounting system. One per company. The provider's
 * account token is stored encrypted (secrets.ts); the customer's own
 * accounting credentials never reach Vantiq.
 */
export const connections = pgTable(
  "connections",
  {
    id: id(),
    companyId: companyId(),
    /** "quickbooks" (direct, for testing), "merge" (all systems, at launch) or "sandbox" (the built-in practice books). */
    provider: text("provider").$type<ConnectionProvider>().notNull(),
    systemName: text("system_name").notNull(),
    status: text("status").$type<(typeof CONNECTION_STATUS)[number]>().notNull().default("active"),
    accountTokenEnc: text("account_token_enc"),
    /** Start time of the last successful sync; the next one asks for changes since then. */
    syncedThrough: timestamp("synced_through", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("connections_company_idx").on(t.companyId)],
);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: id(),
    companyId: companyId(),
    connectionId: uuid("connection_id").notNull().references(() => connections.id, { onDelete: "cascade" }),
    trigger: text("trigger").$type<"initial" | "manual" | "scheduled">().notNull(),
    status: text("status").$type<"running" | "done" | "failed">().notNull(),
    inserted: integer("inserted").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    deleted: integer("deleted").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("sync_runs_connection_idx").on(t.connectionId, t.startedAt)],
);

export const PERIOD_CHECK_STATUS = ["balanced", "out_of_balance", "unavailable"] as const;
export type PeriodCheckStatus = (typeof PERIOD_CHECK_STATUS)[number];

/** After each sync: does Vantiq's copy of a month add up to the source system's own net income? */
export const periodChecks = pgTable(
  "period_checks",
  {
    companyId: companyId(),
    connectionId: uuid("connection_id").notNull().references(() => connections.id, { onDelete: "cascade" }),
    period: char("period", { length: 7 }).notNull(),
    /** Net income as the source reports it; null when it could not say. */
    sourceMinor: bigint("source_minor", { mode: "number" }),
    vantiqMinor: money("vantiq_minor"),
    status: text("status").$type<PeriodCheckStatus>().notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.connectionId, t.period] })],
);

export const transactions = pgTable(
  "transactions",
  {
    id: id(),
    companyId: companyId(),
    importId: uuid("import_id").references(() => imports.id, { onDelete: "set null" }),
    /** Set for lines that came from a connected accounting system rather than a file. */
    connectionId: uuid("connection_id").references(() => connections.id, { onDelete: "set null" }),
    externalId: text("external_id"),
    date: date("date", { mode: "string" }).notNull(),
    sourceAccountId: uuid("source_account_id").notNull().references(() => sourceAccounts.id),
    vendorId: uuid("vendor_id").references(() => vendors.id),
    departmentId: uuid("department_id").references(() => departments.id),
    programId: uuid("program_id").references(() => programs.id),
    /** Debit-positive minor units, as in the source ledger. */
    amountMinor: money("amount_minor"),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    memo: text("memo").notNull().default(""),
    /** Makes re-importing the same file a no-op; for synced lines it is `ext:<connection>:<external id>`. */
    sourceHash: text("source_hash").notNull(),
  },
  (t) => [uniqueIndex("transactions_hash_idx").on(t.companyId, t.sourceHash), index("transactions_date_idx").on(t.companyId, t.date), index("transactions_connection_idx").on(t.connectionId)],
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

export const EXPLANATION_STATUS = ["ai_draft", "accepted", "edited", "rejected"] as const;
export type ExplanationStatus = (typeof EXPLANATION_STATUS)[number];

/**
 * The written reason beside one variance line for one view of the books
 * (`scope`: a month like 2026-09, or a range like 2026-01..2026-09). Drafts are
 * always stored as `ai_draft` until a person accepts, edits or rejects them.
 */
export const explanations = pgTable(
  "explanations",
  {
    id: id(),
    companyId: companyId(),
    scope: text("scope").notNull(),
    categoryId: text("category_id").notNull().references(() => categories.id),
    text: text("text").notNull(),
    status: text("status").$type<ExplanationStatus>().notNull(),
    citedTransactionIds: jsonb("cited_transaction_ids").$type<string[]>().notNull().default([]),
    /** "claude" or "rules"; a person's edit keeps the draft's source for the record. */
    source: text("source").$type<"claude" | "rules">().notNull(),
    model: text("model"),
    promptVersion: text("prompt_version").notNull(),
    confidence: text("confidence").$type<"low" | "medium" | "high">().notNull(),
    /** The variance when drafted, so a later change in the numbers can be flagged. */
    draftedDeltaMinor: bigint("drafted_delta_minor", { mode: "number" }).notNull(),
    draftedAt: timestamp("drafted_at", { withTimezone: true }).notNull().defaultNow(),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("explanations_line_idx").on(t.companyId, t.scope, t.categoryId)],
);

export const PACK_STATUS = ["approved", "reopened"] as const;
export type PackStatus = (typeof PACK_STATUS)[number];

/**
 * A month's review pack once someone approves it. Approval snapshots the
 * pack's numbers and explanations into `snapshot`, which locks the month:
 * the pack shows the snapshot, and later changes to the books are flagged
 * rather than silently changing what was approved. Reopening unlocks it.
 */
export const reviewPacks = pgTable(
  "review_packs",
  {
    id: id(),
    companyId: companyId(),
    period: char("period", { length: 7 }).notNull(),
    status: text("status").$type<PackStatus>().notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull(),
    reopenedBy: uuid("reopened_by").references(() => users.id, { onDelete: "set null" }),
    reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("review_packs_period_idx").on(t.companyId, t.period)],
);

/**
 * A clinical trial and its CRO contract. The contract lines and change orders
 * are small and always read together, so they live as JSON on the trial
 * (shapes from @vantiq/domain: ContractItem[] and ChangeOrder[]).
 */
export const trials = pgTable(
  "trials",
  {
    id: id(),
    companyId: companyId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    programCode: text("program_code"),
    croName: text("cro_name").notNull(),
    phase: text("phase").notNull(),
    startPeriod: char("start_period", { length: 7 }).notNull(),
    endPeriod: char("end_period", { length: 7 }).notNull(),
    items: jsonb("items").$type<ContractItemJson[]>().notNull(),
    changeOrders: jsonb("change_orders").$type<ChangeOrderJson[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("trials_code_idx").on(t.companyId, t.code)],
);

export interface ContractItemJson {
  driver: "monthly" | "site" | "patient" | "visit";
  unitCost: number;
  units: number;
}
export interface ChangeOrderJson {
  number: number;
  effective: string;
  description: string;
  items: ContractItemJson[];
}

/** New activity a CRO reported for one trial and month (not cumulative). */
export const trialActivity = pgTable(
  "trial_activity",
  {
    companyId: companyId(),
    trialId: uuid("trial_id").notNull().references(() => trials.id, { onDelete: "cascade" }),
    period: char("period", { length: 7 }).notNull(),
    sites: integer("sites").notNull().default(0),
    patients: integer("patients").notNull().default(0),
    visits: integer("visits").notNull().default(0),
    source: text("source").$type<"manual" | "import" | "sample">().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.trialId, t.period] })],
);

/**
 * One task on a month's close checklist. Each month starts from the standard
 * checklist (CLOSE_TEMPLATE in @vantiq/domain) plus the team's own tasks,
 * with owners and reviewers carried over from the month before. The owner
 * ticks a task off (prepared); its reviewer, when it has one, signs it off.
 */
export const closeTasks = pgTable(
  "close_tasks",
  {
    id: id(),
    companyId: companyId(),
    period: char("period", { length: 7 }).notNull(),
    key: text("key").notNull(),
    section: text("section").$type<"books" | "accruals" | "review" | "signoff">().notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    dueDay: integer("due_day").notNull(),
    auto: text("auto").$type<"synced" | "mapped" | "reconciled" | "explained" | "approved">(),
    href: text("href"),
    custom: boolean("custom").notNull().default(false),
    sortOrder: integer("sort_order").notNull(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    preparedBy: uuid("prepared_by").references(() => users.id, { onDelete: "set null" }),
    preparedAt: timestamp("prepared_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("close_tasks_key_idx").on(t.companyId, t.period, t.key)],
);

/**
 * A comment on a month, anchored to something that survives a re-sync: a
 * variance line by its reporting category (`line:<category id>`) or a close
 * task by its key (`task:<key>`), never to a transaction row.
 */
export const comments = pgTable(
  "comments",
  {
    id: id(),
    companyId: companyId(),
    period: char("period", { length: 7 }).notNull(),
    anchor: text("anchor").notNull(),
    body: text("body").notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("comments_period_idx").on(t.companyId, t.period, t.anchor)],
);

/**
 * A read-only link to one approved month's board pack, for people outside
 * Vantiq. Only a hash of the token is stored. Like `sessions`, this table sits
 * outside row-level security because a visitor arrives with a token and no
 * company; it is only read through the shares module, which filters by
 * company everywhere else. A link stops working when it expires, is revoked,
 * or the month is reopened (`pack_approved_at` no longer matches).
 */
export const shareLinks = pgTable(
  "share_links",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    period: char("period", { length: 7 }).notNull(),
    tokenHash: text("token_hash").notNull(),
    label: text("label").notNull(),
    note: text("note").notNull().default(""),
    packApprovedAt: timestamp("pack_approved_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id, { onDelete: "set null" }),
    viewCount: integer("view_count").notNull().default(0),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("share_links_token_idx").on(t.tokenHash), index("share_links_company_idx").on(t.companyId, t.period)],
);

/**
 * A grant, partner collaboration or license and its schedule of expected
 * receipts (shape ExpectedReceipt[] from @vantiq/domain). What was actually
 * received is never stored here: it comes from the ledger, matched by
 * counterparty, so income is only ever entered once.
 */
export const incomeSources = pgTable(
  "income_sources",
  {
    id: id(),
    companyId: companyId(),
    name: text("name").notNull(),
    kind: text("kind").$type<"grant" | "milestone" | "license">().notNull(),
    counterparty: text("counterparty").notNull(),
    programCode: text("program_code"),
    award: bigint("award", { mode: "number" }),
    receipts: jsonb("receipts").$type<ExpectedReceiptJson[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("income_sources_name_idx").on(t.companyId, t.name)],
);

export interface ExpectedReceiptJson {
  id: string;
  label: string;
  expected: string;
  amount: number;
  probability: number;
}

/**
 * One lot of a product on hand (design.md 10): clinical supply, drug
 * substance, reference materials. A lot is identified by product and lot
 * number; the expiry watchlist and suggested write-offs are worked out from
 * these rows in @vantiq/domain.
 */
export const inventoryBatches = pgTable(
  "inventory_batches",
  {
    id: id(),
    companyId: companyId(),
    product: text("product").notNull(),
    programCode: text("program_code"),
    lot: text("lot").notNull(),
    quantity: integer("quantity").notNull(),
    unit: text("unit").notNull().default("units"),
    unitCost: bigint("unit_cost", { mode: "number" }).notNull(),
    expiry: date("expiry", { mode: "string" }).notNull(),
    monthlyUsage: integer("monthly_usage"),
    location: text("location").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("inventory_batches_lot_idx").on(t.companyId, t.product, t.lot)],
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
  "connections",
  "sync_runs",
  "period_checks",
  "explanations",
  "review_packs",
  "trials",
  "trial_activity",
  "close_tasks",
  "comments",
  "income_sources",
  "inventory_batches",
] as const;
