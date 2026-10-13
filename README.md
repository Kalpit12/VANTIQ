# Vantiq Finance

Finance review workspace for pharma and biotech companies. See `docs/design.md` and `docs/architecture.md`.

## Run it

Requires Node 20+ and pnpm 10.

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

The app currently runs on a built-in sample company, **Helixa Therapeutics** (fictional): 24 months of ledger data, three R&D programs and a budget, generated deterministically in `packages/fixtures`.

## Test it

```bash
pnpm test           # unit tests (finance math, sample data reconciliation)
pnpm typecheck
pnpm e2e            # end-to-end browser tests (builds and starts the app on :3100)
```

## Layout

```
apps/web            Next.js app: screens, charts, drill-down
packages/domain     Pure finance logic: variances, roll-ups, bridge, runway, formatting
packages/fixtures   Synthetic sample company used for development and tests
tests/e2e           Playwright end-to-end tests
docs                design.md, architecture.md
```

## Phase 1 progress

Phase 1 is built in milestones. Each milestone ends with its tests passing.

| Milestone | Scope | Status |
| --- | --- | --- |
| 1. Foundation | Monorepo, finance math with tests, sample biotech data, Overview, Variances, R&D programs and Statements screens with charts C1–C9, drill-down drawer, light/dark mode, e2e smoke tests | Done |
| 2. Data layer | PostgreSQL + Drizzle schema, tenant isolation, sign-in and roles, CSV/Excel import of ledger and budget, account mapping screen | Next |
| 3. Accounting connections | Unified accounting API (QuickBooks Online, Xero, NetSuite), sync jobs, reconciliation check | Planned |
| 4. AI explanations | Claude-drafted variance explanations with cited transactions; accept, edit, reject | Planned |
| 5. Review pack | Pack page, PDF export, audit log, settings; Phase 1 test gate | Planned |
