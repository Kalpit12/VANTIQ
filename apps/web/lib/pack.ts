import "server-only";
import {
  formatCompactCurrency,
  formatDate,
  formatSignedPct,
  isMaterial,
  lineAnchor,
  taskStatus,
  periodLabel,
  rangeLabel,
  UNASSIGNED,
  ytdPeriods,
  type Ledger,
  type Period,
  type Variance,
} from "@vantiq/domain";
import { getConnection, getDb, getPack, listPeriodChecks, type ExplanationRow, type PackRecord } from "@vantiq/db";
import type { Workspace } from "./data";
import { closeTasksFor, commentsFor, type ShownComment, type ShownTask } from "./closeData";
import { explanationsFor } from "./explanations";
import { cashProjection, findingTitle, runwayAt, trendPoints, varianceFor } from "./metrics";
import { resolveView } from "./view";

/**
 * Everything one month's review pack shows, as plain JSON. The pack page and
 * the PDF both render from this, and approval stores it as the snapshot, so an
 * approved pack always shows exactly what was approved.
 */
export interface PackData {
  version: 1;
  companyName: string;
  period: Period;
  label: string;
  ytdLabel: string;
  builtAt: string;
  headlines: string[];
  kpis: { label: string; value: string; variance: Variance | null; note: string }[];
  /** Income statement lines with month and year-to-date columns. */
  lines: { id: string; name: string; depth: number; group: boolean; month: Variance; ytd: Variance; material: boolean }[];
  material: {
    id: string;
    name: string;
    parentName: string;
    variance: Variance;
    explanation: { text: string; status: ExplanationRow["status"]; by: string | null; source: "claude" | "rules" } | null;
    cited: { date: string; vendor: string; memo: string; amount: number }[];
    /** Comments on the line; packs approved before milestone 8 have none. */
    comments?: { by: string | null; at: string; body: string }[];
  }[];
  programs: { label: string; sublabel: string; variance: Variance }[];
  opexTrend: { period: Period; label: string; actual: number; budget: number }[];
  cash: { balance: number; avgBurn: number; runwayMonths: number | null; zeroText: string | null; trend: { period: Period; label: string; value: number }[] } | null;
}

export function buildPack(ledger: Ledger, companyName: string, period: Period, expl: Map<string, ExplanationRow>, comments: ShownComment[] = []): PackData {
  const view = resolveView({ period }, ledger);
  const ytd = ytdPeriods(view.period).filter((p) => p >= ledger.firstPeriod());
  const month = [view.period];
  const label = periodLabel(view.period);

  const rev = varianceFor(ledger, month, "rev");
  const opex = varianceFor(ledger, month, "opex");
  const rd = varianceFor(ledger, month, "rd");
  const opexYtd = varianceFor(ledger, ytd, "opex");
  const hasCash = ledger.data.cash.length > 0;
  const runway = runwayAt(ledger, view.period);

  const ytdById = new Map(ledger.tree(ytd).map((r) => [r.category.id, r.variance]));
  const lines = ledger.tree(month).map((r) => ({
    id: r.category.id,
    name: r.category.name,
    depth: r.depth,
    group: r.hasChildren,
    month: r.variance,
    ytd: ytdById.get(r.category.id)!,
    material: !r.hasChildren && isMaterial(r.variance),
  }));

  const vendors = new Map(ledger.data.vendors.map((v) => [v.id, v.name]));
  const byId = new Map(ledger.transactionsFor({ periods: month }).map((t) => [t.id, t]));
  const material = lines
    .filter((l) => l.material)
    .sort((a, b) => Math.abs(b.month.delta) - Math.abs(a.month.delta))
    .map((l) => {
      const e = expl.get(l.id);
      const cat = ledger.category(l.id);
      return {
        id: l.id,
        name: l.name,
        parentName: cat.parentId ? ledger.category(cat.parentId).name : "",
        variance: l.month,
        explanation: e && e.status !== "rejected" ? { text: e.text, status: e.status, by: e.decidedByName, source: e.source } : null,
        cited: (e && e.status !== "rejected" ? e.citedTransactionIds : [])
          .map((id) => byId.get(id))
          .filter((t) => t !== undefined)
          .map((t) => ({ date: t.date, vendor: (t.vendorId && vendors.get(t.vendorId)) || "", memo: t.memo, amount: t.amount })),
        comments: comments.filter((c) => c.anchor === lineAnchor(l.id)).map((c) => ({ by: c.authorName, at: c.at, body: c.body })),
      };
    });

  const programs = ledger
    .programTotals(month, ["rd"])
    .filter((p) => p.variance.actual !== 0 || p.variance.comparison !== 0)
    .sort((a, b) => b.variance.actual - a.variance.actual)
    .map((p) => {
      const prog = ledger.data.programs.find((x) => x.id === p.programId);
      return {
        label: prog && p.programId !== UNASSIGNED ? (prog.name.startsWith(prog.code) ? prog.name : `${prog.code} · ${prog.name}`) : "Not assigned to a program",
        sublabel: prog ? [prog.therapeuticArea, prog.phase].filter(Boolean).join(" · ") : "Shared R&D costs",
        variance: p.variance,
      };
    });

  const cash = hasCash ? cashProjection(ledger, view) : null;
  const headlines = [
    findingTitle("Operating expenses", opex, label) + ` (${formatCompactCurrency(opex.actual)} against ${formatCompactCurrency(opex.comparison)})`,
    findingTitle("Year to date, operating expenses", opexYtd, rangeLabel(ytd)),
    material.length
      ? `${material.length} line${material.length === 1 ? "" : "s"} moved by more than the materiality threshold; the largest is ${material[0]!.name} at ${formatSignedPct(material[0]!.variance.deltaPct)}.`
      : "No line moved by more than the materiality threshold.",
  ];
  if (hasCash) {
    headlines.push(
      runway.months === null
        ? `Cash is ${formatCompactCurrency(runway.cash)} and not decreasing.`
        : `Cash is ${formatCompactCurrency(runway.cash)}, about ${runway.months.toFixed(1)} months of runway at ${formatCompactCurrency(runway.avgBurn)} a month${cash?.zeroText ? `, running out around ${cash.zeroText}` : ""}.`,
    );
  }

  return {
    version: 1,
    companyName,
    period: view.period,
    label,
    ytdLabel: `YTD ${rangeLabel(ytd)}`,
    builtAt: new Date().toISOString(),
    headlines,
    kpis: [
      { label: "Revenue and income", value: formatCompactCurrency(rev.actual), variance: rev, note: `Budget ${formatCompactCurrency(rev.comparison)}` },
      { label: "Operating expenses", value: formatCompactCurrency(opex.actual), variance: opex, note: `Budget ${formatCompactCurrency(opex.comparison)}` },
      { label: "R&D spend", value: formatCompactCurrency(rd.actual), variance: rd, note: `Budget ${formatCompactCurrency(rd.comparison)}` },
      hasCash
        ? { label: "Cash and runway", value: formatCompactCurrency(runway.cash), variance: null, note: runway.months === null ? "Not burning cash" : `${runway.months.toFixed(1)} months at ${formatCompactCurrency(runway.avgBurn)}/mo` }
        : { label: "Cash and runway", value: "—", variance: null, note: "No cash balances imported" },
    ],
    lines,
    material,
    programs,
    opexTrend: trendPoints(ledger, view.trend, ["opex"]).map((p) => ({ period: p.period, label: p.label, actual: p.actual, budget: p.budget })),
    cash: hasCash
      ? {
          balance: runway.cash,
          avgBurn: runway.avgBurn,
          runwayMonths: runway.months,
          zeroText: cash?.zeroText ?? null,
          trend: view.trend.map((p) => ({ period: p, label: periodLabel(p, true), value: ledger.cashAt(p) ?? 0 })),
        }
      : null,
  };
}

/** Lines whose month actual changed since the snapshot was taken. */
export function changedSince(snapshot: PackData, live: PackData) {
  const now = new Map(live.lines.map((l) => [l.id, l.month.actual]));
  return snapshot.lines
    .filter((l) => !l.group && (now.get(l.id) ?? 0) !== l.month.actual)
    .map((l) => ({ name: l.name, was: l.month.actual, now: now.get(l.id) ?? 0 }));
}

export interface Readiness {
  key: "reconciled" | "mapped" | "explained" | "checklist";
  ok: boolean;
  title: string;
  detail: string;
  href?: string;
}

/** What must be true before a month can be approved. All of them block. */
export function readiness(
  pack: PackData,
  opts: { check: "balanced" | "out_of_balance" | "unavailable" | null; unmappedTxns: number; closeOutstanding: number },
): Readiness[] {
  const pending = pack.material.filter((m) => !m.explanation || m.explanation.status === "ai_draft");
  return [
    {
      key: "reconciled",
      ok: opts.check !== "out_of_balance",
      title: "Books agree with the accounting system",
      detail:
        opts.check === "balanced"
          ? "Net income matches the source system's income statement."
          : opts.check === "out_of_balance"
            ? "Net income differs from the source system. Sync again or fix the source first."
            : opts.check === "unavailable"
              ? "The source system could not report this month, so it was not compared."
              : "Imported from files, so there is no source system to compare with.",
      href: opts.check === "out_of_balance" ? "/connections" : undefined,
    },
    {
      key: "mapped",
      ok: opts.unmappedTxns === 0,
      title: "Every account is mapped",
      detail: opts.unmappedTxns === 0 ? "All transactions roll up into a reporting line." : `${opts.unmappedTxns} transactions sit in unmapped accounts and are left out.`,
      href: opts.unmappedTxns ? "/mappings" : undefined,
    },
    {
      key: "explained",
      ok: pending.length === 0,
      title: "Material variances are explained",
      detail:
        pack.material.length === 0
          ? "No line is over the materiality threshold."
          : pending.length === 0
            ? `All ${pack.material.length} material lines have a reviewed explanation.`
            : `${pending.length} of ${pack.material.length} material lines still need an accepted or edited explanation.`,
      href: pending.length ? `/variances?period=${pack.period}` : undefined,
    },
    {
      key: "checklist",
      ok: opts.closeOutstanding === 0,
      title: "Close checklist is done",
      detail: opts.closeOutstanding === 0 ? "Every close task is ticked off and signed off." : `${opts.closeOutstanding} close task${opts.closeOutstanding === 1 ? " is" : "s are"} still open or waiting for sign-off.`,
      href: opts.closeOutstanding ? `/close?period=${pack.period}` : undefined,
    },
  ];
}

export interface PackState {
  /** What the page and PDF show: the approved snapshot when locked, else live numbers. */
  shown: PackData;
  live: PackData;
  record: Omit<PackRecord<PackData>, "snapshot"> | null;
  locked: boolean;
  /** Lines that changed in the books after approval. */
  changes: ReturnType<typeof changedSince>;
  checks: Readiness[];
}

/** Manual close tasks not yet done. Automatic ones mirror the other checks, so they aren't counted twice. */
const outstanding = (tasks: ShownTask[]) => tasks.filter((t) => !t.auto && taskStatus(t, {}) !== "done").length;

export async function packState(ws: Workspace, period: Period): Promise<PackState> {
  const p = resolveView({ period }, ws.ledger).period;
  const [expl, comments, tasks] = await Promise.all([explanationsFor(ws, [p]), commentsFor(ws, p), closeTasksFor(ws, p)]);
  const live = buildPack(ws.ledger, ws.companyName, p, expl, comments);
  if (ws.mode === "demo") {
    return { shown: live, live, record: null, locked: false, changes: [], checks: readiness(live, { check: null, unmappedTxns: 0, closeOutstanding: outstanding(tasks) }) };
  }
  const db = getDb();
  const [rec, conn, checks] = await Promise.all([getPack<PackData>(db, ws.companyId!, live.period), getConnection(db, ws.companyId!), listPeriodChecks(db, ws.companyId!)]);
  const check = conn ? (checks.find((c) => c.period === live.period)?.status ?? null) : null;
  const locked = rec?.status === "approved";
  const { snapshot, ...record } = rec ?? { snapshot: null };
  return {
    shown: locked ? snapshot! : live,
    live,
    record: rec ? (record as PackState["record"]) : null,
    locked,
    changes: locked ? changedSince(snapshot!, live) : [],
    checks: readiness(live, { check, unmappedTxns: ws.unmapped.transactions, closeOutstanding: outstanding(tasks) }),
  };
}

export const packStatusText = (st: Pick<PackState, "locked" | "record">) =>
  st.locked && st.record ? `Approved${st.record.approvedByName ? ` by ${st.record.approvedByName}` : ""} on ${formatDate(st.record.approvedAt.toISOString().slice(0, 10))}` : "Draft, not approved";

/** True when the view is one month whose pack is approved, so explanations are read-only. */
export async function monthLocked(ws: Workspace, periods: Period[]): Promise<boolean> {
  if (ws.mode === "demo" || periods.length !== 1) return false;
  return (await getPack(getDb(), ws.companyId!, periods[0]!))?.status === "approved";
}
