import Link from "next/link";
import { formatCompactCurrency, formatSignedPct, type Variance } from "@vantiq/domain";

export interface BulletRow {
  id: string;
  label: string;
  sublabel?: string;
  variance: Variance;
  href: string;
}

/**
 * Bullet chart rows (charts C3 and C6): bar = actual, tick = budget, sorted
 * largest first. Every row links to its drill-down.
 */
export function BulletRows({ rows }: { rows: BulletRow[] }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.variance.actual, r.variance.comparison]));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const a = Math.max(0, r.variance.actual) / max;
        const b = Math.max(0, r.variance.comparison) / max;
        const over = r.variance.delta > 0;
        return (
          <li key={r.id}>
            <Link
              href={r.href}
              scroll={false}
              className="group grid grid-cols-[minmax(120px,180px)_1fr_auto] items-center gap-3 rounded-md px-1 py-0.5 hover:bg-subtle"
              title={`${r.label}: actual ${formatCompactCurrency(r.variance.actual)}, budget ${formatCompactCurrency(r.variance.comparison)}, ${formatSignedPct(r.variance.deltaPct)}`}
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-ink">{r.label}</span>
                {r.sublabel && <span className="block truncate text-[11px] text-ink-3">{r.sublabel}</span>}
              </span>
              <span className="relative h-5" aria-hidden>
                <span
                  className="absolute inset-y-[3px] left-0 rounded-r-[4px]"
                  style={{ width: `${a * 100}%`, background: "var(--series-1)", opacity: 0.85 }}
                />
                {r.variance.comparison > 0 && (
                  <span className="absolute -inset-y-0.5 w-[2px] rounded bg-ink" style={{ left: `calc(${b * 100}% - 1px)` }} />
                )}
              </span>
              <span className="num w-[132px] text-right text-[12px]">
                <span className="text-ink">{formatCompactCurrency(r.variance.actual)}</span>
                <span className={`ml-2 ${r.variance.delta === 0 ? "text-ink-3" : r.variance.favorable ? "text-good" : "text-bad"}`}>
                  {r.variance.comparison === 0 && r.variance.actual === 0 ? "–" : formatSignedPct(r.variance.deltaPct)}
                  {r.variance.delta !== 0 && <span className="sr-only">{over ? " over budget" : " under budget"}</span>}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
      <li className="mt-1 flex items-center gap-4 text-[12px] text-ink-3" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: "var(--series-1)" }} /> Actual
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-[2px] bg-ink" /> Budget
        </span>
      </li>
    </ul>
  );
}
