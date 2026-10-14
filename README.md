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

Import the repo with **Root Directory** `apps/web`. With no `DATABASE_URL` the deployment runs in demo mode.

To test with a real QuickBooks company for free, create an app at developer.intuit.com (it comes with sandbox companies full of sample books), add `https://<your-domain>/api/connect/quickbooks/callback` as a redirect URI, then set `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `CONNECTION_SECRET_KEY` (32+ random characters; it encrypts stored tokens) and `CRON_SECRET`. At launch, set `MERGE_API_KEY` (from merge.dev) to add Xero, NetSuite and Sage Intacct. `apps/web/vercel.json` runs the scheduled sync once a day, the most the Hobby plan allows; on Pro, change the schedule to `0 */6 * * *` for the 6-hour cadence in the architecture. With none of these set, the Connections screen offers only the sandbox. To turn on accounts, add a Neon Postgres database from the Vercel Marketplace (it sets `DATABASE_URL`) and redeploy. The build runs migrations first (`apps/web` `build` script), so scope `DATABASE_URL` to Production, or give Preview its own database. Uploads are capped at 4 MB per file by the hosting request limit.

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
packages/db         Postgres schema and migrations (Drizzle), row-level security, auth, import pipeline, sync engine, ledger loader
packages/integrations  CSV/Excel parsing, column guessing, amount/date parsing, mapping suggestions, accounting connectors (Merge, sandbox)
packages/ai         Variance explanations: context builder, rule-based drafts, Claude drafts with citation checks
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
| 4. Accounting connections | Connect QuickBooks Online, Xero, NetSuite or Sage Intacct through Merge; 24-month first sync, then incremental and scheduled syncs; month-end net income check with out-of-balance alerts; sandbox connection to try it | Done |
| 5. AI explanations | Drafted explanation for every material variance, citing its transactions (Claude when a key is set, built-in rules otherwise); accept, edit, reject on Overview and Variances | Done |
| 6. Review pack | Monthly pack page and PDF; approval checks and month locking; audit log with CSV export; company settings; Phase 1 end-to-end and accessibility tests | Done |

### Phase 2

| Milestone | Scope | Status |
| --- | --- | --- |
| 7. Trial accruals | Trials with CRO contracts priced by driver (monthly fee, sites, patients, visits), change orders, monthly CRO activity (entered or imported), accrual worked out step by step, month-end journal entry CSV; charts C11 (contract vs work done vs billed), C12 (trial timeline), C13 (accrual by CRO) | Done |
| 8. Close checklist | Standard month-end checklist plus the team's own tasks, owners and reviewers, tick-off and sign-off, comments on tasks and variance lines, chart C15 (close calendar); the pack can't be approved until the checklist is done | Done |
| 9. Board pack sharing | Board pack (board-ready subset of the approved review pack) as a page and PDF, read-only links for the board that expire, revoke, open counts, audit | Done |
| 10. Grants and income | Schedules for grants, partner milestones and licensing with expected receipts and likelihood, matched to income in the books; received, overdue, risk-weighted next 12 months, grant left to draw; chart C14 (receipts timeline) | Done |

### Milestone 10 decisions

- **Received money is never entered twice.** A schedule names who pays; income from that payer in the matching revenue line (Grant income for grants, Collaboration revenue for milestones and licensing) is matched to the schedule in order. A payment counts toward a receipt when it is within 2% of the amount and no earlier than two months before it was expected.
- **Overdue** means the expected month has closed and no matching payment is in the books. A receipt expected in the month being viewed is still just expected.
- **Likelihood** weights each receipt not yet received: "expected in the next 12 months" shows both the weighted figure and the full amount. The chart shades expected money by likelihood, so a 20% Phase 3 milestone reads as much less certain than a 95% grant drawdown.
- **Schedules are edited in place** (add, change, remove a receipt) and every change is in the audit log with the old and new month, amount and likelihood.
- Receipts live as JSON on `income_sources`, like a trial's contract lines, because a schedule is small and always read whole.

### Milestone 9 decisions

- **The board pack** is the approved review pack without the working detail: headline numbers, what moved and why, the top two levels of the income statement, R&D by program, cash and runway. No cited transactions and no internal comments.
- **Only approved months can be shared**, and a link always shows the snapshot that was approved. Reopening the month withdraws every link to it; approving again needs a new link, so the board never sees numbers that changed under them.
- **Links** last 7, 14, 30 or 90 days, carry an optional note to the board, and can be revoked at any time. Only a SHA-256 hash of the token is stored, so a link is shown once when it is created. Every open and PDF download is counted and written to the audit log.
- **The shared page** needs no sign-in, has no way into the app, and is served with `no-store`, `noindex` and `no-referrer` headers.
- `share_links` sits outside row-level security, like `sessions`, because a visitor arrives with a token and no company. It is only read through the shares module, which filters by company everywhere else.

### Milestone 8 decisions

- **The checklist** starts each month from 13 standard biotech close tasks in four sections (books, accruals and adjustments, review, sign-off), plus any tasks the team adds. Owners, reviewers and the team's own tasks carry forward from the previous month; ticks and sign-offs don't.
- **Due dates** are business days into the following month ("day 3"), the way close calendars are written. A task is late once its day has passed and it isn't done.
- **Automatic tasks.** Five tasks are checked by Vantiq itself (transactions in, accounts mapped, books agree with the source, variances explained, pack approved) and can't be ticked by hand.
- **Two-person sign-off.** A task with a reviewer is done only when the reviewer signs it off, and nobody can sign off a task they prepared. Admins and finance can tick any task; anyone else, viewers included, can tick the tasks they own, so department heads can take part without edit access to the books.
- **Comments** are anchored to a reporting line or a close task, never to a transaction, so they survive re-syncs. Anyone in the company can comment. Comments on material lines appear in the review pack and its PDF and are part of the approved snapshot.
- **Approval** now also needs every manual close task done. Once a month is approved, its checklist and comments are locked with it.

### Milestone 7 decisions

- **The accrual** for a trial is the work done to date minus what the CRO billed to date. Work done is each driver's units completed times its price, never more than the units contracted; units beyond the contract are shown and not counted. A change order adds units at its own prices from the month it takes effect, and units are priced against the original contract first.
- **Billed to date** comes from the ledger: CRO-line spend from the vendor named on the trial, tagged to the trial's program. Nothing needs entering twice.
- **Late CRO reports.** A month the CRO hasn't reported is estimated from the average of its last three reports and flagged until the real numbers arrive.
- **Journal entries** book the full accrual (or prepayment) on the last day of the month, to be reversed the next day: Dr 6110 CRO clinical trial services, Cr 2150 Accrued clinical trial costs. The CSV imports into most accounting systems; Vantiq doesn't post it.
- Contract lines and change orders are stored as JSON on the trial rather than in separate tables, since they're small and always read together. Every change is in the audit log.
- The sample company has two trials matched to its CRO invoices: Meridian's change order 4 work ran ahead of billing, and Atlas deferred start-up fees while its September report is late.

### Milestone 6 decisions

- **One pack per month.** The pack shows the month's headline numbers, a summary, every material variance with its explanation and cited transactions, budget vs actual for the month and year to date, R&D by program, and cash and runway. The page and the PDF render from the same data, so they always agree.
- **PDF without a browser.** The PDF is drawn with `@react-pdf/renderer` on the server instead of printing the page with Playwright, because a headless browser doesn't fit in a Vercel function. It uses the built-in Helvetica font.
- **Approval checks.** Finance or Admin can approve a month only when the books agree with the connected system, every account is mapped, and every material line has an accepted or edited explanation. The page lists what's missing with a link to fix it.
- **Locking.** Approving stores a snapshot of the pack and locks the month: its explanations become read-only and the pack keeps showing what was approved. If the books change afterwards, the pack flags a "Post-close change" with the lines that moved. Only an Admin can reopen a month, and must give a reason.
- **Audit log.** Approvals, reopenings, PDF downloads, explanation decisions, imports, mapping changes, connections, syncs, members and company renames are all recorded. Admin and Finance can browse it by area and export it as CSV; nobody can edit or delete an entry.
- **Phase 1 test gate.** One Playwright test walks sign-up, sample data, mapping, drill-down, explanations, approval, PDF download, the audit log and reopening. axe checks (WCAG 2 A and AA) pass on Overview, Variances, R&D programs, Statements and the review pack; fixing them darkened the muted text colour slightly.
- Materiality stays fixed at ±10% and ±$25k for now; making it a company setting is a Phase 2 item.

### Milestone 5 decisions

- **Free by default.** With no `ANTHROPIC_API_KEY`, drafts come from Vantiq's own rules: they name the programs that drove the variance and the standout transactions behind each (entries rare for that line), and are labelled "Auto draft". With a key, Claude writes the draft ("AI draft"); the default model is Sonnet to keep testing cheap (`VANTIQ_AI_MODEL` changes it).
- **Grounding.** Claude sees only the one line's numbers, its split by program, the three prior months and up to 40 of its transactions. It must answer in a fixed JSON shape and cite transaction ids from that list; one unknown id and the draft is thrown away and the rule-based draft is used instead.
- **Human in the loop.** Every draft is stored as a draft until Finance or Admin accepts, edits or rejects it, and each decision is in the audit log. Drafting again never overwrites a confirmed line unless someone asks for that line. A draft whose numbers have since moved is flagged.
- **Evaluation.** `packages/ai/test` checks the drafts against the sample company's scripted events (driver named and cited in 5 of 5 cases) and that every material line in 21 months cites only its own transactions. Live Claude calls are not part of the test suite.
- The demo shows rule-based drafts for every material line, read-only.

### Milestone 4 decisions

- **QuickBooks directly while testing.** Merge is a paid service, so until launch QuickBooks Online connects straight through Intuit's API, which is free with a developer account and its sandbox companies. QuickBooks reports carry no line ids, so each sync re-reads the 24-month General Ledger month by month and mirrors it. Refreshed tokens are re-sealed and saved after every refresh. Like the Merge client, it is tested against fakes shaped like the documented API, not yet against a live Intuit sandbox.
- **Merge** is the unified API for launch (chosen over Codat and Rutter). Merge holds each customer's accounting credentials; Vantiq stores only the per-connection account token, encrypted with AES-256-GCM. The Merge client is tested against fakes shaped like Merge's documented responses; it has **not** yet run against a live Merge account.
- **What syncs:** profit-and-loss lines from General Ledger Transactions for the last 24 months, with vendor (contact), department (DEPARTMENT tracking category) and program (CLASS tracking category). Each line is keyed by its id in the source, so edits update in place and deletions are removed. After the first sync, Merge is asked only for changes.
- **Month-end check:** after every sync, Vantiq adds up each month's net income from the synced lines and compares it with the income statement the system reports. A difference over $1 marks the month out of balance on the Connections screen and the Overview.
- **One source per company.** A company with ledger lines from file imports can't also connect a system, because the same spending would count twice. Budgets still come from file imports.
- **Jobs** run in the request (Sync now, first sync) or from `/api/cron/sync`. A queue (Inngest) replaces this when first syncs outgrow a single request.

### Milestone 2 decisions

- **Sign-in** is email and password with server-side sessions (scrypt hashes, random tokens stored only as SHA-256, httpOnly cookies) instead of Auth.js. It has no extra service to configure. Google and Microsoft sign-in, email invites and password reset arrive with the notifications work; until then an admin adds people with a one-time temporary password.
- **Tenant isolation** uses Postgres row-level security, forced on every tenant table, plus application checks. Tests try cross-company reads and writes on every tenant table.
- **Mapping suggestions** are keyword and account-range rules for now; Claude-drafted suggestions come with milestone 5. Suggested mappings count in the numbers right away and are flagged until someone confirms them.
- **Budgets** are imported by account (and optionally program) and replace the months a file covers. Ledger imports are deduplicated by row content, so re-uploading a file is safe.
