# Vantiq Finance — Design

Status: v1 draft · 2026-10-13 · Source plan: [Vantiq Finance: Product Plan](https://claude.ai/code/artifact/80485d5c-dc69-49d6-ad71-9712a0b8a49c)

Vantiq Finance is a finance review workspace built only for pharma and biotech companies, from 50-person biotechs to mid-size pharma firms. This document defines how it looks, feels and behaves. It is organized so each build phase can be designed, built and tested on its own.

---

## 1. Design principles

1. **Calm, precise, trustworthy.** Finance people are checking numbers for errors. The interface stays quiet so the numbers stand out: lots of white space, one accent color, no decoration.
2. **Every number is a door.** Any figure can be clicked to see what is behind it (department → account → vendor → transaction) and commented on.
3. **Built for the review meeting.** Screens are designed to be presented on a shared screen as well as read alone. The review pack is a first-class "document", not an export.
4. **Speak pharma natively.** Programs, trials, CROs, batches, milestones and grants are real objects in the product, not custom tags on generic accounts.
5. **Explain, don't just show.** Every material variance carries a short written explanation, drafted by AI and confirmed by a person. AI text is always labelled and always cites the transactions it is based on.
6. **Simple for small teams, deep for large ones.** A 50-person biotech should be live in an afternoon. Larger firms unlock entities, roles and controls without a different product.

---

## 2. Brand

Vantiq has no existing brand, so this is a proposal.

### 2.1 Name and wordmark

- Wordmark: **vantiq** in lowercase, set in Inter Display Semibold with -2% letter spacing. The dot of the "i" is replaced by a small solid square in the accent color, a nod to a data cell.
- Product name in text: "Vantiq Finance", or "Vantiq" once established.
- App icon / favicon: the square "i" dot alone, accent on ink, rounded 22%.

### 2.2 Personality

| Is | Is not |
| --- | --- |
| Clear, exact, quietly confident | Flashy, "crypto", gamified |
| Clinical in the good sense: clean, careful | Cold or sterile |
| Helpful, plain-spoken | Jargon-heavy, salesy |

Voice: short sentences, numbers first, no exclamation marks. Example empty state: "No variances above 10% this month."

---

## 3. Design tokens

All colors are defined as tokens and have light and dark values. Components never use raw hex values.

### 3.1 Color

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `bg/canvas` | `#F7F8F7` | `#0E1113` | App background |
| `bg/surface` | `#FFFFFF` | `#161A1D` | Cards, tables, panels |
| `bg/subtle` | `#F0F2F1` | `#1D2226` | Hover rows, table headers |
| `border/default` | `#E3E6E4` | `#2A3035` | Dividers, card borders |
| `border/strong` | `#C9CECB` | `#3A4249` | Inputs, focused rows |
| `text/primary` | `#111827` | `#EEF1F0` | Body, numbers |
| `text/secondary` | `#4B5563` | `#A6AFAB` | Labels, captions |
| `text/muted` | `#6B7280` | `#7D8783` | Hints, disabled |
| `accent/default` | `#0E6E6A` (deep teal) | `#3FB8AF` | Primary buttons, links, selection, key chart series |
| `accent/subtle` | `#E3F2F0` | `#11302E` | Selected rows, accent backgrounds |
| `status/favorable` | `#1B7F4B` | `#4CC38A` | Favorable variance |
| `status/unfavorable` | `#B42318` | `#F97066` | Unfavorable variance |
| `status/warning` | `#B54708` | `#F5A524` | Needs attention, due soon |
| `status/info` | `#175CD3` | `#6CA8FF` | Neutral info, AI-drafted label |

Rules:

- Green and red are used **only** for favorable and unfavorable variances. Never for decoration, never for brand.
- "Favorable" depends on the line: revenue above budget is green, expense above budget is red. The variance component decides this, not the screen.
- Never rely on color alone: variances also show a sign (+/−) and an arrow icon.
- All text meets WCAG AA contrast (4.5:1) on its background in both themes.

### 3.2 Chart palette

Chart colors are separate from the UI accent and from the favorable/unfavorable colors, so a series is never mistaken for "good" or "bad".

| Slot | Hue | Light | Dark |
| --- | --- | --- | --- |
| 1 | Blue | `#2A78D6` | `#3987E5` |
| 2 | Orange | `#EB6834` | `#D95926` |
| 3 | Violet | `#6250D6` | `#9085E9` |
| 4 | Yellow | `#EDA100` | `#C98500` |
| 5 | Magenta | `#E87BA4` | `#D55181` |
| Other | Gray | `#9CA3AF` | `#6B7280` |

- Validated with a colorblind-safety checker (deuteranopia, protanopia, tritanopia) in this exact order, in both themes. Light mode: yellow and magenta are below 3:1 contrast on white, so charts using them must show direct labels or the "view as table" toggle (always present anyway).
- Slots are assigned in fixed order and follow the entity: if "Trial ABC-201" is blue on one chart, it is blue everywhere in that view, even after filtering.
- Maximum 5 series per chart; the rest fold into gray "Other", or the chart splits into small multiples.
- Green and red never appear as series colors.

**Actual, budget, forecast** (the core comparison in every finance chart):

| Series | Style |
| --- | --- |
| Actual | Solid, slot color (slot 1 when alone) |
| Budget | Dashed 2px neutral line (`text/secondary`), or hollow bar with neutral outline |
| Forecast | Same hue as actual, dashed line or 40% tint fill |
| Prior year | Thin dotted neutral line |

**Sequential** (heatmaps, magnitude): one hue, blue, from `#EAF2FC` to `#1B4F8F`. **Diverging** (variance heatmaps): `status/favorable` ↔ neutral gray ↔ `status/unfavorable`, always with the signed value printed in the cell so color is never the only signal.

### 3.3 Typography

| Role | Font | Size / line height | Weight |
| --- | --- | --- | --- |
| Display (pack titles) | Inter Display | 32 / 40 | 600 |
| H1 (page title) | Inter | 24 / 32 | 600 |
| H2 (section) | Inter | 18 / 26 | 600 |
| H3 (card title) | Inter | 15 / 22 | 600 |
| Body | Inter | 14 / 22 | 400 |
| Small / labels | Inter | 12 / 18 | 500 |
| KPI value | Inter | 28 / 34 | 600, tabular |
| Table numbers | Inter | 13 / 20 | 400, tabular |
| Codes (account, trial IDs) | JetBrains Mono | 12 / 18 | 400 |

- Turn on tabular figures (`font-variant-numeric: tabular-nums`) everywhere numbers appear, so columns align.
- Numbers in tables are right-aligned; text is left-aligned.

### 3.4 Spacing, radius, elevation

- Spacing scale (px): 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: 6 for inputs and buttons, 10 for cards and drawers, 999 for pills.
- Elevation: borders instead of shadows for cards. Only floating elements (menus, drawers, dialogs) get a soft shadow.
- Layout grid: 12 columns, 24px gutters, max content width 1440px. Tables may go full width.

### 3.5 Motion

- 150ms ease-out for hovers and small changes; 220ms for drawers and dialogs.
- No animation on number changes beyond a brief highlight on updated cells.
- Respect `prefers-reduced-motion`.

---

## 4. Number and date formatting

Finance users will judge the product on these details.

| Case | Format | Example |
| --- | --- | --- |
| Currency in tables | Thousands, no decimals, currency code in column header | `1,284` (header: "USD k") |
| Currency in KPI cards | Compact with one decimal | `$12.4M` |
| Negative numbers | Parentheses in financial statements; minus sign elsewhere | `(1,284)` / `−1,284` |
| Variance amount | Signed | `+312` / `−88` |
| Variance percent | Signed, one decimal | `+18.2%` |
| Zero | En dash | `–` |
| Missing | Muted em dash, tooltip with reason | `—` |
| Periods | Fiscal label plus months | `Q2 FY26 (Apr–Jun 2026)` |
| Dates | Day month year | `13 Oct 2026` |

- Units scale (units, thousands, millions) is a per-view toggle, remembered per user.
- Multi-currency (Phase 3): amounts show in the reporting currency, with a hover showing the original currency and the FX rate used.

---

## 5. Layout and navigation

```
┌──────────────────────────────────────────────────────────────┐
│ Top bar: Company ▾ · Period picker [Sep 2026 ▾ vs Budget ▾]   │
│          Search / ⌘K · Comments · Profile                      │
├────────────┬─────────────────────────────────────────────────┤
│ Sidebar    │  Page                                            │
│ Overview   │  Title · status pill · actions                   │
│ Review pack│  ──────────────────────────────────────────────  │
│ Variances  │  Content (cards, tables, charts)                 │
│ Statements │                                                  │
│ R&D        │                      ┌───────────────────────┐   │
│ Trials     │                      │ Drill-down drawer      │   │
│ Inventory  │                      │ (slides in from right) │   │
│ Close      │                      └───────────────────────┘   │
│ ─────────  │                                                  │
│ Settings   │                                                  │
└────────────┴─────────────────────────────────────────────────┘
```

- **Period picker** is always visible and drives every screen: period (month, quarter, YTD), comparison (budget, forecast, prior period, prior year), entity (Phase 3).
- **Command palette** (⌘K / Ctrl+K): jump to any screen, account, program, trial or vendor.
- Sidebar collapses to icons below 1280px. Below 768px the app is read-only and optimized for reviewing packs and approving.
- Keyboard: `j/k` to move rows, `Enter` to drill down, `c` to comment, `Esc` to close drawers.

---

## 6. Core components

| Component | Purpose | Key states / notes |
| --- | --- | --- |
| **KPI card** | Headline metric | Value, vs-comparison delta (amount and %), sparkline of last 12 periods, click to drill |
| **Variance chip** | Shows a variance | Favorable/unfavorable color, arrow, signed %, tooltip with amounts |
| **Financial table** | Statements, BvA grids | Sticky header and first column, expandable row groups, right-aligned tabular numbers, subtotal rows bold, per-cell comment indicator |
| **Drill-down drawer** | Show what is behind a number | Breadcrumb (Opex › R&D › CRO fees › Vendor X), transaction list, link to source document in the ledger |
| **AI explanation block** | Variance explanation | Label "AI draft" in `status/info`, cited transactions as chips, actions: Accept, Edit, Reject; becomes "Confirmed by {name}" after accept |
| **Comment thread** | Discussion on a number or block | Mentions, resolve, appears in margin of review pack |
| **Status pill** | Workflow state | Draft, In review, Changes requested, Approved, Locked |
| **Owner avatar** | Who owns a line | Click to reassign |
| **Period picker** | Global time control | Presets plus custom range |
| **Empty state** | No data yet | One sentence and one action, no illustration clutter |
| **Sync status** | Data freshness | "Synced from NetSuite 12 min ago", warning if older than 24h |

Base component library: shadcn/ui (Radix primitives) themed with the tokens above. Tables: TanStack Table. Charts: see section 7 and architecture.md section 7a.

---

## 7. Charts and graphs

Charts are a core part of Vantiq, not decoration. Every screen that shows numbers has at least one chart, and every chart can be clicked through to the numbers behind it.

### 7.1 Choosing the chart

| Question the user is asking | Chart | Avoid |
| --- | --- | --- |
| How did we get from budget to actual? | Variance bridge (waterfall) | Two separate totals |
| How is this metric trending? | Line: actual solid, budget dashed, forecast tinted | Area charts with many series |
| Where is the money going this period? | Horizontal bar, sorted largest first | Pie or donut charts |
| Actual vs budget across many lines | Bullet chart (bar = actual, tick = budget) | Clustered bars with 3+ series |
| What is the mix, and how is it changing? | 100% stacked bar by month (max 5 parts + Other) | Stacked areas |
| How long will the cash last? | Cash line with zero-cash date, milestone markers, scenario band | Single runway number alone |
| Which cost centers are off, month by month? | Heatmap (rows = lines, columns = months, diverging color, value in cell) | Many small line charts |
| When does something happen? | Timeline / Gantt (trials, expiries, milestones) | Tables of dates alone |
| One headline number | KPI card with sparkline and delta | A chart with one bar |

Never: pie charts, 3D charts, dual y-axes (two scales on one chart), or rainbow colors. Two measures with different scales get two charts, side by side.

### 7.2 Chart catalog by screen and phase

| # | Screen | Chart | Phase |
| --- | --- | --- | --- |
| C1 | Overview | KPI cards with 12-month sparklines (Revenue/Income, Opex, R&D, Cash, Runway) | 1 |
| C2 | Overview | Opex: actual vs budget by month, line (12 months + YTD) | 1 |
| C3 | Overview | Spend by R&D program, horizontal bar vs budget tick | 1 |
| C4 | Overview | Cash balance trend with simple runway projection | 1 |
| C5 | Variances | Variance bridge: budget → each material category → actual | 1 |
| C6 | Variances | Bullet chart per category (actual vs budget) beside the table | 1 |
| C7 | Statements | Monthly P&L trend, small multiples (Revenue, Gross margin, Opex, Net loss) | 1 |
| C8 | R&D by program | Program spend over time, line per program (max 5 + Other) | 1 |
| C9 | R&D by program | Program cost mix (CRO, CMC, personnel, lab, consultants), 100% stacked bar by month | 1 |
| C10 | Review pack | All of C1–C9 available as pack blocks; static rendering for PDF | 1 |
| C11 | Trial accruals | Per trial: cumulative contract value vs work done vs billed, three lines over time | 2 |
| C12 | Trial accruals | Trial timeline (Gantt) with change orders as markers | 2 |
| C13 | Trial accruals | Accrual by CRO, horizontal bar | 2 |
| C14 | Inventory | Expiry exposure by bucket (0–3, 3–6, 6–12 months), bar by product | 2 |
| C15 | Grants and milestones | Expected receipts timeline with probability shown as fill opacity and label | 2 |
| C16 | Close checklist | Close progress bar and tasks completed by day | 2 |
| C17 | Variances | Variance heatmap: lines × months, diverging colors with values in cells | 2 |
| C18 | Forecast | Actual + forecast line with scenario band (downside to upside) | 3 |
| C19 | Runway | Cash runway by scenario with trial milestones and financing events on the timeline | 3 |
| C20 | Entities | Spend by entity, small multiples sharing one scale | 3 |
| C21 | Ask your numbers | Answer charts generated from the same chart components (line, bar, bridge) | 3 |

### 7.3 Chart anatomy

- **Title states the finding**, not the topic: "R&D spend is 12% over budget, driven by Trial ABC-201", with a quiet subtitle naming the measure, unit and period ("USD k · Jan–Sep 2026").
- **Axes and grid are quiet**: light gray grid lines on the value axis only; no chart borders. Bar axes always start at zero.
- **Marks**: 2px lines; bars with 4px rounded ends at the data end only; 2px surface-colored gaps between stacked segments and adjacent bars; markers at least 8px.
- **Labels**: label the last point of each line and the largest bars directly; never a number on every point. A legend is always shown when there are 2 or more series.
- **Text never uses the series color**: values and labels are in text tokens; the colored mark next to them carries identity.
- **Today line**: charts that span past and future show a thin vertical line at the current period, with forecast to the right.
- **Empty and partial data**: an unfinished month is shown hatched and labelled "Month to date".

### 7.4 Chart interactions

- **Hover**: line and area charts show a vertical crosshair and a tooltip listing every series at that period (actual, budget, variance, %). Bars and cells show a tooltip for that mark. Hit areas are larger than the marks.
- **Click to drill**: clicking a bar, point or cell opens the drill-down drawer filtered to that line and period.
- **Period and comparison**: charts follow the global period picker; comparison (budget, forecast, prior year) toggles which reference series is shown.
- **Legend toggles**: clicking a legend item hides or shows that series without repainting the others.
- **View as table**: every chart has a toggle to show its data as a table, which is also the screen-reader view.
- **Comment**: right-click or `c` on a point adds a comment anchored to that number and period.
- **Export**: each chart exports as PNG, SVG or CSV; charts in the review pack render as vector graphics in the PDF.
- **Keyboard**: arrow keys move between points or bars; `Enter` drills down.

### 7.5 Chart acceptance checks (every phase)

- [ ] Every chart in the catalog for that phase is present, follows the period picker and drills down on click.
- [ ] Totals in every chart match the table next to it to the unit (automated test).
- [ ] Colors follow slot order and stay with the same entity across filters.
- [ ] No dual-axis, pie or 3D charts.
- [ ] Each chart has a finding-style title, unit and period subtitle, and a "view as table" toggle.
- [ ] Charts render correctly in light mode, dark mode and in the PDF export.

---

## 8. Screens by build phase

Each phase lists its screens and the design acceptance checks used when testing that phase.

### Phase 1: Biotech review (MVP)

Goal: a small biotech can replace its Excel monthly review pack.

**1. Onboarding and connection**
- Steps: create company → connect accounting system (QuickBooks Online, Xero, NetSuite, or CSV upload) → map accounts → set fiscal year and currency → invite team.
- Account mapping screen: two columns (their accounts → Vantiq standard categories), AI-suggested mappings pre-filled and marked, bulk accept.
- Pharma setup step: create R&D programs (name, therapeutic area, phase) and tag departments or classes to them.

**2. Overview (home)**
- Row of 5 KPI cards: Revenue/Income, Operating expenses, R&D spend, Cash balance, Runway (months).
- "Needs attention" list: top variances above threshold, each with owner and explanation status.
- Spend by program bar chart; cash trend line.

**3. Budget vs actual (Variance explorer)**
- Financial table: rows = categories (expandable to accounts), columns = Actual, Budget, Variance, Var %, Explanation.
- Threshold control (default ±10% and ±$25k, whichever larger) highlights material rows.
- Clicking the explanation cell opens the AI explanation block.

**4. Statements**
- P&L, balance sheet, cash flow. Monthly columns or period comparison toggle.

**5. R&D by program**
- Table of programs: Actual, Budget, Variance, % of total R&D, phase.
- Program detail: spend by category (CRO, CMC/manufacturing, personnel, lab supplies, consultants) and by month.

**6. Review pack**
- Document-style page assembled automatically: cover, summary KPIs, variance bridge, statements, R&D by program, explanations.
- Sections can be reordered or hidden. Export to PDF with Vantiq or company branding.

**7. Drill-down drawer** (available from every number).

**8. Settings**: company, connections, account mapping, programs, users (Admin, Finance, Viewer).

Phase 1 design acceptance checks:
- [ ] Every number on Overview, Variances, Statements and R&D opens the drill-down drawer.
- [ ] Numbers use tabular figures and follow section 4 formatting in all tables.
- [ ] Favorable/unfavorable colors are correct for both revenue and expense lines.
- [ ] Every AI explanation shows the "AI draft" label and at least one cited transaction.
- [ ] Light and dark themes pass AA contrast (automated check).
- [ ] Review pack PDF matches the on-screen pack layout.
- [ ] A new user can connect, map and see Overview in under 30 minutes using the sample data set.
- [ ] Charts C1–C10 (section 7.2) are built and pass the chart checks in section 7.5.

### Phase 2: Deeper pharma

Goal: run the whole monthly review in Vantiq.

**9. Clinical trial accruals**
- Trial list: trial ID, program, CRO, phase, contract value, billed to date, estimated work done, suggested accrual, last CRO report date.
- Trial detail: contract and change orders timeline, activity drivers (sites activated, patients enrolled, visits), accrual calculation shown step by step, "Post journal entry" export.
- Warning when a CRO report is older than the threshold.

**10. Inventory and expiry watchlist**
- Batches with product, lot, quantity, value, expiry date. Grouped by "Expires in 0–3, 3–6, 6–12 months". Suggested write-off amounts.

**11. Grants, milestones and licensing income**
- Schedule of expected receipts with probability, status and timeline chart.

**12. Close checklist**
- Tasks per period with owner, due date, status, linked evidence. Progress bar for the period.

**13. Review workflow**
- Comments on any number or pack section, @mentions, assignment of variance explanations to owners, approvals on the pack (Finance → CFO), lock period after approval.

**14. Board pack export**
- Board-ready subset of the review pack, branded, with a read-only share link that expires.

Phase 2 design acceptance checks:
- [ ] Accrual calculation is visible step by step; no "black box" numbers.
- [ ] Approving a pack locks its numbers and shows who approved and when.
- [ ] Comments stay attached to the right number after data re-syncs.
- [ ] Expiry buckets and accrual warnings use `status/warning`, never red.
- [ ] Charts C11–C17 are built and pass the chart checks in section 7.5.

### Phase 3: Larger firms

Goal: win mid-size pharma companies.

**15. Forecast and scenarios**: monthly forecast grid, driver inputs, scenario switcher (Base, Upside, Downside), compare scenarios side by side.

**16. Cash runway by milestone**: cash line with trial milestones, financing events and zero-cash date; scenario overlays.

**17. Entities and consolidation view**: entity switcher in top bar, consolidated vs per-entity, intercompany flags.

**18. Admin and security**: SSO configuration, roles and per-department permissions, audit log viewer, data region display.

Phase 3 design acceptance checks:
- [ ] Every screen respects the entity switcher and permission scope.
- [ ] Scenario changes never alter actuals; scenario name is always visible.
- [ ] Audit log covers every edit, approval and export.
- [ ] Charts C18–C21 are built and pass the chart checks in section 7.5.

---

## 9. Accessibility

- WCAG 2.2 AA target.
- All interactive elements keyboard reachable with visible focus ring (2px `accent/default`).
- Tables use proper header associations; charts have a text summary and a "view as table" toggle.
- Minimum hit target 32×32px (44×44 on touch).

---

## 10. Design references

Patterns borrowed from: Ramp (tables, approvals), Mercury (tone, spacing), Brex (dense tables, dark mode), Stripe Dashboard (KPI cards, comparisons), Pigment (planning grid), Runway (scenarios), Digits (AI explanations), Linear (speed, command palette). Full links are in the product plan.

---

## 11. Open design decisions

- Accent color: deep teal is proposed; alternatives are ink blue (`#1E3A8A`) or forest (`#166534`).
- Whether the review pack should also export to PowerPoint in Phase 2.
- Whether to allow company logos and colors inside the app (only in exports is proposed).
