import Link from "next/link";
import { formatCompactCurrency, formatSignedPct, type Variance } from "@vantiq/domain";

export interface BulletRow {
  id: string;
  label: string;
  sublabel?: string;
  variance: Variance;
  /** Drill-down link; rows are plain when there is none (the shared board pack). */
  href?: string;
}

/**
 * Actual vs budget rows (charts C3 and C6), sorted largest first.
 * Each row: name and numbers on one line, a full-width track underneath.
 * The bar fills up to the lower of actual and budget; spend past budget is
 * drawn in the unfavorable color, unspent budget as a dashed outline, and a
 * thin marker shows where budget sits. Every row links to its drill-down.
 */
function Row({ href, className, label, children }: { href?: string; className: string; label: string; children: React.ReactNode }) {
  if (!href)
    return (
      <div className={className} role="group" aria-label={label}>
        {children}
      </div>
    );
  return (
    <Link href={href} scroll={false} className={className} aria-label={label}>
      {children}
    </Link>
  );
}

export function BulletRows({ rows }: { rows: BulletRow[] }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.variance.actual, r.variance.comparison])) * 1.04;
  const pct = (v: number) => `${(Math.max(0, v) / max) * 100}%`;
  return (
    <div>
      <ul className="flex flex-col">
        {rows.map((r) => {
          const { actual, comparison, delta, favorable, deltaPct } = r.variance;
          const within = Math.min(actual, comparison || actual);
          const over = comparison > 0 && actual > comparison;
          const under = comparison > 0 && actual < comparison;
          return (
            <li key={r.id} className="border-b border-line/70 last:border-b-0">
              <Row
                href={r.href}
                className={`-mx-2 block rounded-md px-2 py-2.5 ${r.href ? "transition-colors hover:bg-subtle" : ""}`}
                label={`${r.label}: actual ${formatCompactCurrency(actual)}, budget ${formatCompactCurrency(comparison)}, ${formatSignedPct(deltaPct)}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">
                    <span className="text-[13px] font-medium text-ink">{r.label}</span>
                    {r.sublabel && <span className="ml-2 text-[12px] text-ink-3">{r.sublabel}</span>}
                  </span>
                  <span className="num shrink-0 text-[12px] text-ink-3">
                    <span className="text-[13px] font-medium text-ink">{formatCompactCurrency(actual)}</span>
                    {comparison > 0 && <span> of {formatCompactCurrency(comparison)}</span>}
                    <span className={`ml-2 inline-block w-[52px] text-right font-medium ${delta === 0 || comparison === 0 ? "text-ink-3" : favorable ? "text-good" : "text-bad"}`}>
                      {comparison === 0 ? "—" : formatSignedPct(deltaPct)}
                    </span>
                  </span>
                </div>
                <div className="relative mt-2 h-2 rounded-full bg-subtle" aria-hidden>
                  {under && (
                    <span
                      className="absolute inset-y-0 left-0 rounded-full border border-dashed border-line-strong"
                      style={{ width: pct(comparison) }}
                    />
                  )}
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(within), background: "var(--series-1)" }} />
                  {over && (
                    <span
                      className="absolute inset-y-0 rounded-r-full"
                      style={{ left: pct(comparison), width: `calc(${pct(actual)} - ${pct(comparison)})`, background: "var(--unfavorable)", opacity: 0.85 }}
                    />
                  )}
                  {comparison > 0 && (
                    <span className="absolute -top-1 h-4 w-[2px] rounded-full bg-ink-2" style={{ left: `calc(${pct(comparison)} - 1px)` }} />
                  )}
                </div>
              </Row>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-3" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-4 rounded-full" style={{ background: "var(--series-1)" }} /> Spent within budget
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-4 rounded-full" style={{ background: "var(--unfavorable)", opacity: 0.85 }} /> Over budget
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-4 rounded-full border border-dashed border-line-strong" /> Budget not yet spent
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-[2px] rounded-full bg-ink-2" /> Budget
        </span>
      </div>
    </div>
  );
}
