import { addMonths, periodLabel, periodRange, type Period, type Trial } from "@vantiq/domain";

/**
 * Chart C12: the trial on a month axis. The contract runs start to end; the
 * CRO has reported up to its last report and the rest up to the as-of month
 * is estimated; change orders are markers at the month they take effect.
 */
export function TrialTimeline({ trial, asOf, lastReported }: { trial: Trial; asOf: Period; lastReported: Period | null }) {
  const start = trial.contract.start;
  const end = trial.end >= asOf ? trial.end : asOf;
  const months = periodRange(start, end);
  const W = 1000;
  const L = 130;
  const R = 16;
  const x = (p: Period) => L + ((W - L - R) * months.indexOf(p)) / months.length;
  const xEnd = (p: Period) => x(p) + (W - L - R) / months.length;
  const rows = [
    { label: "Contract", y: 30 },
    { label: "CRO reports", y: 64 },
    { label: "Change orders", y: 98 },
  ];
  const reportedEnd = lastReported && lastReported >= start ? (lastReported > asOf ? asOf : lastReported) : null;
  const estStart = reportedEnd ? addMonths(reportedEnd, 1) : start;
  const years = months.filter((p) => p.endsWith("-01") || p === start);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} 150`} className="h-auto w-full" role="img" aria-label={`${trial.code} timeline from ${periodLabel(start)} to ${periodLabel(trial.end)}`}>
        {rows.map((r) => (
          <text key={r.label} x={0} y={r.y + 4} className="fill-[var(--text-secondary)] text-[12px]">
            {r.label}
          </text>
        ))}
        {years.map((p) => (
          <g key={p}>
            <line x1={x(p)} x2={x(p)} y1={12} y2={118} className="stroke-[var(--grid)]" />
            <text x={x(p) + 3} y={136} className="fill-[var(--text-muted)] text-[11px]">
              {periodLabel(p)}
            </text>
          </g>
        ))}
        <rect x={x(start)} y={22} width={xEnd(trial.end) - x(start)} height={16} rx={3} className="fill-[var(--accent-subtle)] stroke-[var(--accent)]" />
        {reportedEnd && <rect x={x(start)} y={56} width={xEnd(reportedEnd) - x(start)} height={16} rx={3} className="fill-[var(--series-1)]" />}
        {estStart <= asOf && (
          <rect x={x(estStart)} y={56} width={xEnd(asOf) - x(estStart)} height={16} rx={3} className="fill-[var(--warning)] opacity-40" strokeDasharray="4 3" />
        )}
        {trial.contract.changeOrders.map((c) => (
          <g key={c.number}>
            <path d={`M${x(c.effective)} 90 l8 8 -8 8 -8 -8z`} className="fill-[var(--series-2)]" />
            <text x={x(c.effective) + 12} y={102} className="fill-[var(--text-primary)] text-[12px]">
              CO {c.number}
            </text>
          </g>
        ))}
        <line x1={xEnd(asOf)} x2={xEnd(asOf)} y1={12} y2={118} className="stroke-[var(--text-primary)]" strokeDasharray="3 3" />
        <text x={xEnd(asOf) - 4} y={10} textAnchor="end" className="fill-[var(--text-primary)] text-[11px]">
          {periodLabel(asOf)}
        </text>
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-4 text-[12px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm border border-accent bg-accent-subtle" aria-hidden /> Contract term
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-[var(--series-1)]" aria-hidden /> Reported by the CRO
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-[var(--warning)] opacity-40" aria-hidden /> Estimated
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rotate-45 bg-[var(--series-2)]" aria-hidden /> Change order
        </span>
      </figcaption>
    </figure>
  );
}
