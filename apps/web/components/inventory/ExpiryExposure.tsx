import { EXPIRY_BUCKETS, formatCompactCurrency, type ExpiryBucket, type ExpirySummary } from "@vantiq/domain";

/**
 * Bucket colors: the warning color, strongest for stock already expired and
 * fading as expiry gets further away (never red, design.md Phase 2 checks);
 * stock more than a year out is neutral.
 */
export const BUCKET_STYLE: Record<ExpiryBucket, React.CSSProperties> = {
  expired: { background: "var(--warning)" },
  "0-3": { background: "color-mix(in srgb, var(--warning) 70%, transparent)" },
  "3-6": { background: "color-mix(in srgb, var(--warning) 42%, transparent)" },
  "6-12": { background: "color-mix(in srgb, var(--warning) 20%, transparent)" },
  later: { background: "color-mix(in srgb, var(--series-other) 45%, transparent)" },
};

/** Chart C14: expiry exposure, one bar per product split by when its stock expires. */
export function ExpiryExposure({ byProduct }: { byProduct: ExpirySummary["byProduct"] }) {
  const totals = byProduct.map((p) => Object.values(p.values).reduce((s, v) => s + v, 0));
  const max = Math.max(1, ...totals);
  return (
    <figure>
      <ul className="flex flex-col gap-3">
        {byProduct.map((p, i) => (
          <li key={p.product}>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate font-medium text-ink">{p.product}</span>
              <span className="num shrink-0 text-[12px] text-ink-3">
                {p.atRisk === 0 ? (
                  `${formatCompactCurrency(totals[i]!)}, none within a year`
                ) : (
                  <>
                    <span className="font-medium text-warn">{p.atRisk === totals[i] ? `all ${formatCompactCurrency(p.atRisk)}` : formatCompactCurrency(p.atRisk)}</span>
                    {p.atRisk === totals[i] ? "" : ` of ${formatCompactCurrency(totals[i]!)}`} within a year
                  </>
                )}
              </span>
            </div>
            <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-subtle" role="img" aria-label={`${p.product}: ${EXPIRY_BUCKETS.filter((b) => p.values[b.bucket]).map((b) => `${b.label.toLowerCase()} ${formatCompactCurrency(p.values[b.bucket])}`).join(", ")}`}>
              {EXPIRY_BUCKETS.map((b) =>
                p.values[b.bucket] ? <span key={b.bucket} className="h-full border-r border-[var(--bg-surface)] last:border-r-0" style={{ ...BUCKET_STYLE[b.bucket], width: `${(p.values[b.bucket] / max) * 100}%` }} /> : null,
              )}
            </div>
          </li>
        ))}
      </ul>
      <figcaption className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
        {EXPIRY_BUCKETS.map((b) => (
          <span key={b.bucket} className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm" style={BUCKET_STYLE[b.bucket]} aria-hidden /> {b.label.replace("Expires in ", "").replace("Expires after", "After")}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
