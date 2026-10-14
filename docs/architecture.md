# Vantiq Finance — Architecture

Status: v1 draft · 2026-10-13 · Companion to [design.md](./design.md)

This document describes how Vantiq Finance is built. It is organized around three build phases. Each phase ends with a test gate that must pass before the next phase starts.

---

## 1. Goals and constraints

- **Correctness first.** Every number shown must reconcile to the source ledger. Tests prove this.
- **Auditability.** Every edit, approval, AI suggestion and export is recorded with who, when and what.
- **Tenant isolation.** One company can never see another company's data.
- **Small-team friendly, enterprise-ready.** Simple single-entity setup in Phase 1; multi-entity, SSO and data residency by Phase 3 without a rewrite.
- **Security.** Built to pass SOC 2 Type II and pharma vendor security reviews. No patient or clinical data is stored; only financial and contract data.

---

## 2. System overview

```
                 ┌──────────────────────────────┐
  Browser ─────▶ │  Web app (Next.js, React)    │
                 │  UI + server actions / API   │
                 └──────────────┬───────────────┘
                                │
          ┌─────────────────────┼─────────────────────────┐
          ▼                     ▼                         ▼
 ┌─────────────────┐  ┌──────────────────┐     ┌────────────────────┐
 │ PostgreSQL      │  │ Job queue        │     │ Object storage     │
 │ (tenant data,   │◀─│ (sync, compute,  │────▶│ (CSV uploads,      │
 │  ledger, audit) │  │  AI, PDF export) │     │  PDF packs, docs)  │
 └─────────────────┘  └────────┬─────────┘     └────────────────────┘
                               │
            ┌──────────────────┼────────────────────┐
            ▼                  ▼                    ▼
  ┌──────────────────┐ ┌───────────────┐  ┌──────────────────┐
  │ Unified          │ │ Claude API    │  │ Email (Resend /  │
  │ accounting API   │ │ (explanations,│  │ Postmark)        │
  │ (QuickBooks,     │ │  mapping)     │  │                  │
  │ Xero, NetSuite,  │ └───────────────┘  └──────────────────┘
  │ Sage Intacct)    │
  └──────────────────┘
```

The app is a **modular monolith**: one deployable web app plus one worker process sharing the same codebase and database. This is the fastest way to build and test phase by phase. Modules have clear boundaries so a module can be split out later if needed.

---

## 3. Tech stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript everywhere | Strict mode on |
| Monorepo | pnpm workspaces + Turborepo | `apps/web`, `apps/worker`, `packages/*` |
| Frontend | Next.js (App Router), React, Tailwind CSS, shadcn/ui | Tokens from design.md as CSS variables |
| Tables / charts | TanStack Table, Recharts, Visx | Virtualized rows for large ledgers |
| API | Next.js route handlers + tRPC for typed internal API | Public REST API later (Phase 3) |
| Validation | Zod | Shared schemas between client, server and AI outputs |
| Database | PostgreSQL 16 (managed: Neon, Supabase or AWS RDS) | Row-level security for tenant isolation |
| ORM / migrations | Drizzle ORM + drizzle-kit | SQL-first, explicit migrations |
| Money | Integer minor units (`bigint`) + currency code | Never floats. Decimal.js for calculations |
| Jobs | Inngest (or BullMQ + Redis if self-hosting) | Retries, schedules, step functions |
| Auth | Auth.js (email + Google/Microsoft) in Phase 1; WorkOS for SAML SSO and SCIM in Phase 3 | Session cookies, httpOnly |
| Accounting data | Unified API provider (Merge, Codat or Rutter; pick after a spike) | One integration covers QuickBooks Online, Xero, NetSuite, Sage Intacct; native SAP connector in Phase 3 |
| AI | Claude API via `@anthropic-ai/sdk` | See section 8 |
| PDF export | `@react-pdf/renderer` on the server, from the same data as the pack page (Phase 1); Playwright rendering later if the PDF must match the page pixel for pixel | Same content on screen and in PDF |
| File storage | S3-compatible (AWS S3 or Cloudflare R2) | Encrypted, signed URLs |
| Email | Resend or Postmark | Invites, review requests, approvals |
| Hosting | Vercel (web) + Fly.io or AWS (worker) in Phase 1; AWS with US and EU regions in Phase 3 | |
| Observability | Sentry (errors), OpenTelemetry + Grafana/Axiom (logs, traces) | |
| CI/CD | GitHub Actions | Lint, typecheck, test, migrate, deploy previews |

---

## 4. Repository layout

```
vantiq/
├─ apps/
│  ├─ web/                 Next.js app (UI + API)
│  └─ worker/              Background jobs (sync, compute, AI, PDF)
├─ packages/
│  ├─ db/                  Drizzle schema, migrations, seed data
│  ├─ domain/              Pure business logic: variance, accruals, runway
│  ├─ integrations/        Unified accounting API client + CSV importer
│  ├─ ai/                  Claude prompts, schemas, evaluation set
│  ├─ ui/                  Design tokens + shared components
│  └─ config/              ESLint, TS config, Tailwind preset
├─ tests/
│  ├─ e2e/                 Playwright end-to-end tests
│  └─ fixtures/            Sample biotech ledgers (synthetic)
└─ docs/                   design.md, architecture.md, ADRs
```

`packages/domain` has no framework or database imports. All financial math lives there so it can be unit-tested exhaustively.

---

## 5. Data model

### 5.1 Tenancy

- Every tenant-owned table has `company_id`.
- PostgreSQL row-level security (RLS) policies enforce `company_id = current_setting('app.company_id')`. The app sets this per request after auth.
- Phase 3 adds `entity_id` under company for multi-entity groups.

### 5.2 Core tables (Phase 1)

| Table | Key fields | Notes |
| --- | --- | --- |
| `companies` | id, name, fiscal_year_start, base_currency, region | |
| `users`, `memberships` | user_id, company_id, role | Roles: admin, finance, viewer (Phase 2 adds owner scopes) |
| `connections` | id, provider, status, last_synced_at, cursor | Credentials kept by the unified API provider, not us |
| `source_accounts` | id, external_id, code, name, type | Their chart of accounts |
| `vantiq_categories` | id, parent_id, name, kind (revenue, cogs, opex, other) | Standard pharma chart, seeded |
| `account_mappings` | source_account_id, category_id, mapped_by (user/ai), confirmed | |
| `departments`, `classes` | id, external_id, name | From ledger dimensions |
| `programs` | id, name, therapeutic_area, phase, status | R&D programs |
| `program_tags` | program_id, dimension (department/class/project), external_id | Links ledger dimensions to programs |
| `vendors` | id, external_id, name, type (cro, cmo, other) | |
| `transactions` | id, external_id, date, account_id, vendor_id, department_id, class_id, amount_minor, currency, memo, source_hash | Immutable once synced; updates create new versions |
| `period_balances` | company_id, period, account_id, dimension keys, amount_minor | Materialized monthly totals for fast reads |
| `budgets`, `budget_lines` | budget_id, version, period, category_id/account_id, program_id, amount_minor | Imported from CSV/Excel in Phase 1 |
| `variances` | period, comparison, row_key, actual, comparison_value, delta, delta_pct, is_material | Computed per period |
| `explanations` | variance_id, text, status (ai_draft, accepted, edited, rejected), cited_transaction_ids, model, prompt_version, author_id | |
| `review_packs` | id, period, status, layout_json, pdf_url | |
| `audit_events` | id, company_id, actor_id, action, target, before, after, at | Append-only |

### 5.3 Phase 2 tables

`trials`, `cro_contracts`, `change_orders`, `trial_activity` (sites, patients, visits by month), `accrual_estimates`; `inventory_batches`; `income_schedules` (grants, milestones, licensing); `close_tasks`; `comments`; `approvals`; `share_links`.

### 5.4 Phase 3 tables

`entities`, `fx_rates`, `intercompany_pairs`, `forecasts`, `forecast_lines`, `scenarios`, `drivers`, `sso_connections`, `api_keys`.

### 5.5 Money rules

- Store amounts as `bigint` minor units with an ISO currency code.
- Round only for display. Calculations use Decimal.js.
- Sign convention: debits positive in storage; "favorable" is computed from category kind, not from the sign.

---

## 6. Data flow

### 6.1 Sync pipeline

1. User connects an accounting system through the unified API's hosted link flow.
2. Worker job `sync.initial` pulls chart of accounts, dimensions, vendors and 24 months of transactions.
3. Raw records are stored, then normalized into `transactions` with a `source_hash` for idempotency.
4. `compute.period_balances` rebuilds monthly balances for affected periods.
5. `compute.variances` recalculates budget vs actual for open periods.
6. `ai.explain_variances` drafts explanations for new material variances.
7. Incremental sync runs every 6 hours and on demand ("Sync now").

CSV/Excel upload follows the same path from step 3, with a column-mapping step.

### 6.2 Reconciliation check

After every sync, a job compares Vantiq's trial balance per period to the source system's trial balance. Any difference above $1 marks the period "Out of balance" in the UI and blocks pack approval.

Phase 1 implementation (milestone 4): Vantiq stores only profit-and-loss lines, so the check compares each month's **net income** (the sum of synced lines) with the net income on the source system's own monthly income statement, read through Merge. Results live in `period_checks`; months the source can't report show "No report". Since milestone 6, an out-of-balance month can't be approved.

### 6.3 Locking

When a review pack is approved, its period is locked: its numbers, explanations and comments are snapshotted. Later syncs that change a locked period raise a "Post-close change" alert instead of silently changing the pack.

Phase 1 implementation (milestone 6): the snapshot is the pack's full data in `review_packs.snapshot`; the alert is computed when the pack is opened by comparing the snapshot with the live books. Reopening needs an Admin and a reason, both audited.

---

## 7. Domain logic (packages/domain)

| Function | Phase | Description |
| --- | --- | --- |
| `computeVariance(actual, comparison, kind)` | 1 | Delta, %, favorable flag |
| `isMaterial(variance, thresholds)` | 1 | Abs and % thresholds, configurable |
| `rollupByCategory`, `rollupByProgram` | 1 | Hierarchical totals |
| `runwayMonths(cash, burnSeries)` | 1 | Average net burn over trailing 3 months |
| `estimateAccrual(contract, activity, billed)` | 2 | Work done by activity drivers minus billed to date |
| `expiryBuckets(batches, asOf)` | 2 | 0–3, 3–6, 6–12 months |
| `forecastFromDrivers(drivers, scenario)` | 3 | Driver-based monthly forecast |
| `consolidate(entities, fx, eliminations)` | 3 | Multi-entity roll-up |

All functions are pure and covered by unit tests plus property-based tests (fast-check) for invariants such as "sum of children equals parent".

---

## 7a. Charts and graphs

- **Library**: Recharts for standard charts (line, bar, stacked bar, bullet); Visx (D3-based) for custom charts: variance bridge, heatmap, Gantt timeline, runway with scenario band. Both render SVG, so the same component works on screen and in the PDF.
- **One chart package**: `packages/ui/charts` wraps every chart type in a Vantiq component (`<TrendChart>`, `<VarianceBridge>`, `<BulletChart>`, `<Heatmap>`, `<Timeline>`, `<RunwayChart>`, `<KpiCard>`). Each applies the design tokens, tooltip, drill-down, legend, "view as table" and export behavior from design.md section 7, so screens never style charts themselves.
- **Chart data API**: each chart reads from a typed endpoint `charts.<name>({ companyId, period, comparison, filters })` that returns rows already aggregated in `packages/domain`. The browser never sums raw transactions.
- **Same numbers everywhere**: charts and tables on a screen call the same domain functions, and a test asserts their totals match.
- **Performance**: chart queries read from `period_balances`; responses cached per company and period and invalidated after each sync. Target: chart data under 300 ms (p95).
- **Export**: PNG/SVG from the rendered SVG in the browser; CSV from the chart data endpoint; PDF via the Playwright pack render.
- **Tests**: Storybook stories for every chart state (empty, partial month, negative values, many series, dark mode) with visual snapshots in CI; unit tests on chart data endpoints; an automated colorblind-palette check on the chart tokens.

---

## 8. AI layer

### 8.1 Uses

| Feature | Phase | Input | Output |
| --- | --- | --- | --- |
| Variance explanation | 1 | Variance row + top driving transactions + prior period notes | 1–3 sentence explanation + cited transaction IDs + confidence |
| Account mapping suggestions | 1 | Source account name, code, type, sample transactions | Suggested Vantiq category + reason |
| Pack summary | 2 | Confirmed explanations + KPIs | Executive summary paragraph |
| Ask your numbers (Q&A) | 3 | Question + tool access to read-only queries | Answer with linked figures |

### 8.2 Approach

- SDK: official `@anthropic-ai/sdk` for TypeScript.
- Model: `claude-opus-5-5` by default, with effort set explicitly per feature (for example `low` for account mapping, `medium` for variance explanations). The model ID and effort are configuration, so they can be tuned per feature against the evaluation set.
- Structured outputs: responses are constrained to a JSON schema via `output_config.format` and parsed with the SDK's `messages.parse()`, validated by the same Zod schema the UI uses.
- Refusal handling: check `stop_reason` before reading content; enable server-side fallbacks (`fallbacks: "default"`).
- Grounding: the model only sees the company's own aggregated data and the specific transactions for that variance. Every cited transaction ID is checked to exist and belong to the variance; otherwise the draft is discarded.
- Phase 1 implementation (milestone 5): drafts default to Sonnet for cost while testing, and fall back to a rule-based draft (labelled as such) when no key is set or Claude's answer fails validation.
- Human in the loop: AI output is always stored as `ai_draft` and shown with an "AI draft" label until a user accepts or edits it.
- Batch jobs: explanations for a whole period are generated in the background after sync; the Message Batches API can be used for large backfills at lower cost.
- Privacy: no data used for training; prompts and outputs logged in our database for audit; inference region pinned where available (Phase 3).
- Prompt versions live in `packages/ai` and are recorded on every explanation.

### 8.3 AI evaluation

`packages/ai/evals` holds a set of synthetic variance cases with expected key drivers. CI runs a small sample on prompt changes; the full set runs before each release. Metrics: driver correctness, citation validity (must be 100%), length, and tone.

---

## 9. Security and compliance

- Tenant isolation through RLS plus application checks; tests attempt cross-tenant reads on every API route.
- Encryption: TLS 1.2+ in transit, AES-256 at rest (managed database and storage).
- Secrets in the hosting provider's secret manager, never in the repo.
- Roles: admin, finance, viewer in Phase 1; department owner scopes in Phase 2; custom roles and SSO/SCIM in Phase 3.
- Audit log is append-only and exportable.
- Backups: daily snapshots, point-in-time recovery, restore tested quarterly.
- Data residency: US region in Phase 1; EU region added in Phase 3.
- Compliance path: SOC 2 Type I during Phase 2, Type II during Phase 3. GDPR-ready data processing agreement. Because Vantiq handles financial data only, HIPAA and GxP validation are out of scope; this is stated in the security documentation.

---

## 10. Build phases and test gates

### Phase 1: Biotech review (MVP)

Scope:
- Monorepo, CI, auth, companies, roles.
- Unified accounting API integration (QuickBooks Online, Xero, NetSuite) and CSV upload.
- Account mapping with AI suggestions.
- Programs and program tagging.
- Period balances, budget import, variance engine.
- Screens: Onboarding, Overview, Variances, Statements, R&D by program, Review pack (PDF), Drill-down, Settings.
- Public landing page at `/` (the app overview lives at `/overview`).
- AI variance explanations (draft, accept, edit).
- Audit log.

Test gate (all must pass):
- [ ] Unit tests: 100% of `packages/domain` functions covered; property tests for roll-ups.
- [ ] Reconciliation: for 3 synthetic biotech ledgers (fixtures), Vantiq trial balance equals source for all 24 months.
- [ ] Integration tests against the unified API sandbox for each provider.
- [ ] Tenant isolation test suite passes for every route.
- [ ] AI evals: citation validity 100%, driver correctness ≥ 85% on the eval set.
- [x] Playwright e2e: onboarding → mapping → overview → drill-down → explanation accept → PDF export.
- [ ] Accessibility: axe checks pass on all Phase 1 screens; design.md Phase 1 checks pass.
- [ ] Charts C1–C10 built in `packages/ui/charts`, visual snapshots approved, chart totals match tables.
- [ ] Pilot: 2–3 friendly biotechs run one real monthly review in Vantiq.

### Phase 2: Deeper pharma

Scope:
- Trials, CRO contracts, change orders, activity import, accrual estimates and journal entry export.
- Inventory batches and expiry watchlist.
- Grants, milestones and licensing income schedules.
- Close checklist, comments, owner assignments, approvals, period locking.
- Board pack export and expiring share links.
- Charts C11–C17: trial accrual curves, trial Gantt, expiry exposure, receipts timeline, close progress, variance heatmap.
- Sage Intacct connector; email notifications.

Test gate:
- [x] Accrual engine unit tests against hand-calculated cases, including change orders and late CRO reports.
- [ ] Locking tests: post-close changes never alter an approved pack.
- [ ] Comment anchoring survives re-sync.
- [ ] Permission tests for department owner scopes.
- [ ] e2e: full monthly close from sync to CFO approval to board pack share.
- [ ] SOC 2 Type I readiness controls in place.
- [ ] Pilots use Vantiq for at least two consecutive month-ends without Excel.

### Phase 3: Larger firms

Scope:
- Multi-entity, FX, intercompany flags, consolidated views.
- Forecasts, drivers, scenarios; runway by trial milestone.
- SAML SSO, SCIM, custom roles; SAP connector.
- EU region deployment; inference region pinning.
- Ask-your-numbers Q&A.
- Charts C18–C21: forecast with scenario band, runway by scenario, entity small multiples, Q&A answer charts.
- Public REST API.

Test gate:
- [ ] Consolidation tests: eliminations and FX translation against reference workbooks.
- [ ] Load test: 5 entities, 2M transactions, Overview loads in under 2 seconds (p95).
- [ ] SSO/SCIM tested with Okta and Microsoft Entra ID.
- [ ] EU tenant data never leaves the EU region (verified by infrastructure tests).
- [ ] Penetration test with no high findings open.

---

## 11. Testing strategy (all phases)

| Level | Tooling | What it covers |
| --- | --- | --- |
| Unit | Vitest, fast-check | Domain math, formatters, Zod schemas |
| Integration | Vitest + Testcontainers (Postgres) | Repositories, RLS, sync normalization, jobs |
| Contract | Recorded fixtures from unified API sandbox | Provider payload changes |
| AI evals | Custom runner in `packages/ai/evals` | Explanation quality and citation validity |
| End-to-end | Playwright | Critical user journeys per phase |
| Visual / a11y | Playwright screenshots + axe-core | Design regressions, accessibility |
| Performance | k6 | API latency under realistic data sizes |

CI runs lint, typecheck, unit and integration tests on every pull request; e2e and AI evals on merge to main and before release. Every pull request gets a preview deployment seeded with synthetic data.

---

## 12. Environments

| Env | Purpose | Data |
| --- | --- | --- |
| Local | Development | Seeded synthetic biotech ledgers |
| Preview | Per pull request | Synthetic data |
| Staging | Pre-release testing, pilot dry runs | Synthetic + sandbox connections |
| Production | Customers | Real data |

---

## 13. Open technical decisions

- Unified accounting API vendor (Merge vs Codat vs Rutter): run a one-week spike on NetSuite and QuickBooks data quality, especially dimensions (department, class, project).
- Hosting for Phase 1: Vercel + Fly.io for speed, or AWS from day one to avoid a later move.
- How CRO activity data enters in Phase 2: CSV template first, or integration with clinical systems (CTMS) later.
- Whether budgets are edited in Vantiq in Phase 1 or only imported.
