# Vantiq Finance

Finance review workspace for pharma and biotech companies. See `docs/design.md` and `docs/architecture.md`.

## Run it

Requires Node 20+ and pnpm 10.

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Without a database the app runs in **demo mode**: no sign-in, and every screen shows the built-in sample company, **Helixa Therapeutics** (fictional): 24 months of ledger data, three R&D programs and a budget, generated deterministically in `packages/fixtures`.

### With a database (accounts, imports, mapping)

1. Create a Postgres 16 database and a role that owns it but is **not** a superuser (superusers bypass row-level security). See `.env.example`.
2. `DATABASE_URL=postgres://… pnpm --filter @vantiq/db migrate`
3. `DATABASE_URL=postgres://… pnpm dev`, then create an account at `/sign-up`.

A new company starts empty. Import a general ledger, budget and cash balances from **Import data** (example files are linked there), or click **Try it with sample data** to load Helixa through the same import path.

### Deploying on Vercel

Import the repo with **Root Directory** `apps/web`. With no `DATABASE_URL` the deployment runs in demo mode. To turn on accounts, add a Neon Postgres database from the Vercel Marketplace (it sets `DATABASE_URL`) and redeploy. The build runs migrations first (`apps/web` `build` script), so scope `DATABASE_URL` to Production, or give Preview its own database. Uploads are capped at 4 MB per file by the hosting request limit.

## Test it

```bash
pnpm test           # unit + database integration tests (needs Postgres, see TEST_DATABASE_URL)
pnpm typecheck
pnpm e2e            # builds once, then browser tests against demo (:3100) and signed-in (:3101) copies
```

Database tests drop and recreate the schema of `TEST_DATABASE_URL`, so point it at a throwaway database.

## Layout

```
apps/web            Next.js app: screens, charts, drill-down, sign-in, import, mapping
packages/domain     Pure finance logic: variances, roll-ups, bridge, runway, formatting, standard chart
packages/db         Postgres schema and migrations (Drizzle), row-level security, auth, import pipeline, ledger loader
packages/integrations  CSV/Excel parsing, column guessing, amount/date parsing, mapping suggestions
packages/fixtures   Synthetic sample company and the same data as importable CSV files
tests/e2e           Playwright end-to-end tests
docs                design.md, architecture.md
```

## Phase 1 progress

Phase 1 is built in milestones. Each milestone ends with its tests passing.

| Milestone | Scope | Status |
| --- | --- | --- |
| 1. Foundation | Monorepo, finance math with tests, sample biotech data, Overview, Variances, R&D programs and Statements screens with charts C1–C9, drill-down drawer, light/dark mode, e2e smoke tests | Done |
| 2. Data layer | PostgreSQL + Drizzle schema, tenant isolation, sign-in and roles, CSV/Excel import of ledger and budget, account mapping screen | Done |
| 3. Landing page | Public page at `/` with an animated hero, live product mockup, features, how it works, security and sign-up calls to action; the app overview moves to `/overview` | Done |
| 4. Accounting connections | Unified accounting API (QuickBooks Online, Xero, NetSuite), sync jobs, reconciliation check | Next |
| 5. AI explanations | Claude-drafted variance explanations with cited transactions; accept, edit, reject | Planned |
| 6. Review pack | Pack page, PDF export, audit log, settings; Phase 1 test gate | Planned |

### Milestone 2 decisions

- **Sign-in** is email and password with server-side sessions (scrypt hashes, random tokens stored only as SHA-256, httpOnly cookies) instead of Auth.js. It has no extra service to configure. Google and Microsoft sign-in, email invites and password reset arrive with the notifications work; until then an admin adds people with a one-time temporary password.
- **Tenant isolation** uses Postgres row-level security, forced on every tenant table, plus application checks. Tests try cross-company reads and writes on every tenant table.
- **Mapping suggestions** are keyword and account-range rules for now; Claude-drafted suggestions come with milestone 5. Suggested mappings count in the numbers right away and are flagged until someone confirms them.
- **Budgets** are imported by account (and optionally program) and replace the months a file covers. Ledger imports are deduplicated by row content, so re-uploading a file is safe.
