import { formatCompactCurrency, periodLabel, periodRange, type IncomeSource, type Period, type ReceiptRow } from "@vantiq/domain";

const niceStep = (max: number) => {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
};

/**
 * Chart C14: income by month. Money already received is a solid bar; money
 * still expected is drawn at its full amount, shaded by how likely it is
 * (a 90% milestone is nearly solid, a 20% one barely there), stacked when
 * several fall in one month. Receipts past their month and not yet in the
 * books sit in their expected month with a dashed warning outline.
 */
export function ReceiptsTimeline({ rows, asOf, from, to }: { rows: { source: IncomeSource; receipts: ReceiptRow[] }[]; asOf: Period; from: Period; to: Period }) {
  const months = periodRange(from, to);
  const items = rows.flatMap((r) => r.receipts.map((c) => ({ ...c, source: r.source.name })));
  const inMonth = (p: Period) => ({
    received: items.filter((c) => c.status === "received" && c.receivedOn!.slice(0, 7) === p),
    open: items.filter((c) => c.status !== "received" && c.expected === p).sort((a, b) => b.probability - a.probability),
  });
  const cols = months.map((p) => ({ p, ...inMonth(p) }));
  const max = Math.max(1, ...cols.map((c) => Math.max(c.received.reduce((s, r) => s + r.receivedAmount!, 0), c.open.reduce((s, r) => s + r.amount, 0))));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const W = 1000;
  const H = 260;
  const L = 52;
  const T = 18;
  const B = 28;
  const band = (W - L) / months.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const x = (i: number) => L + i * band;
  const asOfX = x(months.indexOf(asOf) + 1);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Income received and expected by month, ${periodLabel(from)} to ${periodLabel(to)}`}>
        {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((v) => (
          <g key={v}>
            <line x1={L} x2={W} y1={y(v)} y2={y(v)} className="stroke-[var(--grid)]" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-[var(--text-muted)] text-[11px]">
              {formatCompactCurrency(v)}
            </text>
          </g>
        ))}
        {cols.map((c, i) => {
          let acc = 0;
          const w = band * 0.62;
          const bx = x(i) + (band - w) / 2;
          return (
            <g key={c.p}>
              {c.received.map((r) => {
                const y0 = y(acc + r.receivedAmount!);
                const h = y(acc) - y0;
                acc += r.receivedAmount!;
                return (
                  <rect key={r.id} x={bx} y={y0} width={w} height={Math.max(1, h - 1)} rx={2} className="fill-[var(--series-1)]">
                    <title>{`${r.source}: ${r.label}, ${formatCompactCurrency(r.receivedAmount!)} received`}</title>
                  </rect>
                );
              })}
              {c.open.map((r) => {
                const y0 = y(acc + r.amount);
                const h = y(acc) - y0;
                acc += r.amount;
                const overdue = r.status === "overdue";
                return (
                  <rect
                    key={r.id}
                    x={bx + 0.5}
                    y={y0 + 0.5}
                    width={w - 1}
                    height={Math.max(1, h - 1.5)}
                    rx={2}
                    fillOpacity={overdue ? 0.12 : 0.12 + 0.78 * r.probability}
                    strokeDasharray={overdue ? "4 3" : undefined}
                    className={overdue ? "fill-[var(--unfavorable)] stroke-[var(--unfavorable)]" : "fill-[var(--series-3)] stroke-[var(--series-3)]"}
                  >
                    <title>{`${r.source}: ${r.label}, ${formatCompactCurrency(r.amount)} ${overdue ? "overdue" : `expected, ${Math.round(r.probability * 100)}% likely`}`}</title>
                  </rect>
                );
              })}
              {(c.p.endsWith("-01") || i === 0) && (
                <text x={x(i) + 2} y={H - 8} className="fill-[var(--text-muted)] text-[11px]">
                  {periodLabel(c.p)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={asOfX} x2={asOfX} y1={T - 6} y2={H - B} className="stroke-[var(--text-primary)]" strokeDasharray="3 3" />
        <text x={asOfX - 4} y={T - 8} textAnchor="end" className="fill-[var(--text-primary)] text-[11px]">
          Books to {periodLabel(asOf)}
        </text>
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-4 text-[12px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-[var(--series-1)]" aria-hidden /> Received
        </span>
        <span className="flex items-center gap-1.5">
          <span className="flex" aria-hidden>
            {[0.9, 0.5, 0.2].map((p) => (
              <span key={p} className="h-2.5 w-2 border border-[var(--series-3)] bg-[var(--series-3)]" style={{ backgroundColor: `color-mix(in srgb, var(--series-3) ${Math.round((0.12 + 0.78 * p) * 100)}%, transparent)` }} />
            ))}
          </span>
          Expected, darker when more likely
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm border border-dashed border-[var(--unfavorable)] bg-[var(--unfavorable)]/10" aria-hidden /> Overdue
        </span>
      </figcaption>
    </figure>
  );
}
