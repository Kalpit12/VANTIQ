import Link from "next/link";
import {
  formatCurrency,
  formatDate,
  periodLabel,
  UNASSIGNED,
  type Filter,
  type Ledger,
} from "@vantiq/domain";
import { href, one, type SearchParams, type View } from "@/lib/view";
import { EscToClose } from "./EscToClose";

/**
 * Drill-down drawer (design.md 6). Opened by any number or chart mark through
 * URL params: `dc` category, `dp` program (or `none`), `dper` single period.
 * Lists the transactions behind the number; they always sum to it.
 */
export function DrillDrawer({
  ledger,
  sp,
  view,
  path,
  explanation,
  cited,
}: {
  ledger: Ledger;
  sp: SearchParams;
  view: View;
  path: string;
  /** Shown above the transactions when the drawer is opened on a whole line for the view. */
  explanation?: React.ReactNode;
  cited?: string[];
}) {
  const dc = one(sp, "dc");
  if (!dc) return null;
  let category;
  try {
    category = ledger.category(dc);
  } catch {
    return null;
  }
  const dp = one(sp, "dp");
  const dper = one(sp, "dper");
  const programId = dp === undefined ? undefined : dp === "none" || dp === UNASSIGNED ? null : dp;
  const program = programId ? ledger.data.programs.find((p) => p.id === programId) : null;
  const periods = dper ? [dper] : view.periods;
  const filter: Filter = { periods, categoryIds: [dc], programId };
  const txns = ledger.transactionsFor(filter);
  const total = ledger.actual(filter);
  const vendors = new Map(ledger.data.vendors.map((v) => [v.id, v.name]));
  const programs = new Map(ledger.data.programs.map((p) => [p.id, p.code]));
  const citedSet = new Set(!dp && !dper ? (cited ?? []) : []);

  const crumbs: string[] = [];
  for (let c: typeof category | null = category; c; c = c.parentId ? ledger.category(c.parentId) : null) crumbs.unshift(c.name);
  const close = href(path, sp, { dc: null, dp: null, dper: null });
  const periodText = dper ? periodLabel(dper) : view.label;

  return (
    <>
      <Link href={close} scroll={false} aria-label="Close drill-down" className="fixed inset-0 z-30 bg-black/20" />
      <aside
        role="dialog"
        aria-label={`Transactions for ${category.name}`}
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[640px] flex-col border-l border-line bg-surface shadow-[var(--shadow-float)]"
      >
        <div className="border-b border-line px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] text-ink-3">{crumbs.join(" › ")}</p>
              <h2 className="mt-0.5 text-[18px] font-semibold text-ink">
                {category.name}
                {program ? ` · ${program.code}` : programId === null ? " · Unassigned to a program" : ""}
              </h2>
              <p className="text-[13px] text-ink-2">{periodText}</p>
            </div>
            <Link href={close} scroll={false} className="rounded-md border border-line px-2 py-1 text-[12px] text-ink-2 hover:bg-subtle">
              Close <kbd className="ml-1 text-ink-3">Esc</kbd>
            </Link>
          </div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="num text-[22px] font-semibold text-ink">{formatCurrency(total)}</span>
            <span className="text-[12px] text-ink-3">
              {txns.length} transaction{txns.length === 1 ? "" : "s"}, largest first
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {!dp && !dper && explanation}
          <table className="num w-full text-[13px]">
            <thead className="sticky top-0 bg-subtle text-left text-[12px] text-ink-3">
              <tr>
                <th className="px-5 py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Vendor and memo</th>
                <th className="py-2 pr-4 font-medium">Account</th>
                <th className="py-2 pr-4 font-medium">Program</th>
                <th className="px-5 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id} id={`txn-${t.id}`} className={`scroll-mt-10 border-b border-line/70 align-top ${citedSet.has(t.id) ? "bg-accent-subtle/60" : ""}`}>
                  <td className="whitespace-nowrap px-5 py-2 text-ink-2">{formatDate(t.date)}</td>
                  <td className="py-2 pr-3">
                    <div className="text-ink">
                      {(t.vendorId && vendors.get(t.vendorId)) ?? "—"}
                      {citedSet.has(t.id) && <span className="ml-2 rounded bg-accent-subtle px-1.5 py-px text-[11px] font-medium text-accent">Cited</span>}
                    </div>
                    <div className="text-[12px] text-ink-3">{t.memo}</div>
                  </td>
                  <td className="py-2 pr-4 font-mono text-[12px] text-ink-2">{t.accountCode}</td>
                  <td className="whitespace-nowrap py-2 pr-4 text-ink-2">{t.programId ? programs.get(t.programId) : "—"}</td>
                  <td className={`whitespace-nowrap px-5 py-2 text-right ${t.amount < 0 ? "text-good" : "text-ink"}`}>{formatCurrency(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {txns.length === 0 && <p className="px-5 py-8 text-[13px] text-ink-3">No transactions in this period.</p>}
        </div>
        <EscToClose href={close} />
      </aside>
    </>
  );
}
