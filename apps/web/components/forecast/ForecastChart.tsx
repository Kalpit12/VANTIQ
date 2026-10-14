import { formatCompactCurrency, periodLabel, type Period } from "@vantiq/domain";

const niceStep = (span: number) => {
  const raw = span / 4;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
};

export interface ForecastSeries {
  name: string;
  values: number[];
}

/**
 * Chart C18: net burn by month. Actual months are a solid line; the picked
 * scenario carries on as a dashed line, inside a band from the lowest to the
 * highest of all scenarios, so the spread between Upside and Downside is
 * visible without three crossing lines.
 */
export function ForecastChart({ actual, forecast, picked, all }: { actual: { p: Period; v: number }[]; forecast: Period[]; picked: ForecastSeries; all: ForecastSeries[] }) {
  const months = [...actual.map((a) => a.p), ...forecast];
  const lo = forecast.map((_, i) => Math.min(...all.map((s) => s.values[i]!)));
  const hi = forecast.map((_, i) => Math.max(...all.map((s) => s.values[i]!)));
  const every = [...actual.map((a) => a.v), ...lo, ...hi, 0];
  const min = Math.min(...every);
  const max = Math.max(...every);
  const step = niceStep(max - min || 1);
  const bottom = Math.floor(min / step) * step;
  const top = Math.ceil(max / step) * step || step;
  const W = 1000;
  const H = 260;
  const L = 56;
  const R = 12;
  const T = 22;
  const B = 28;
  const dx = (W - L - R) / Math.max(1, months.length - 1);
  const x = (i: number) => L + i * dx;
  const y = (v: number) => T + (H - T - B) * (1 - (v - bottom) / (top - bottom));
  const n = actual.length;
  const last = actual[n - 1];
  const path = (pts: [number, number][]) => pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
  const start: [number, number][] = last ? [[x(n - 1), y(last.v)]] : [];
  const band =
    path([...start, ...hi.map((v, i) => [x(n + i), y(v)] as [number, number])]) +
    path([...lo.map((v, i) => [x(n + i), y(v)] as [number, number]).reverse(), ...start]).replace(/^M/, "L") +
    "Z";
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Net burn by month: actuals to ${last ? periodLabel(last.p) : ""}, then the ${picked.name} forecast`}>
        {Array.from({ length: Math.round((top - bottom) / step) + 1 }, (_, i) => bottom + i * step).map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? "stroke-[var(--text-muted)]" : "stroke-[var(--grid)]"} />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-[var(--text-muted)] text-[11px]">
              {formatCompactCurrency(v)}
            </text>
          </g>
        ))}
        <path d={band} className="fill-[var(--series-1)]" fillOpacity={0.14} />
        <path d={path(actual.map((a, i) => [x(i), y(a.v)]))} fill="none" strokeWidth={2.5} className="stroke-[var(--text-primary)]" />
        <path d={path([...start, ...picked.values.map((v, i) => [x(n + i), y(v)] as [number, number])])} fill="none" strokeWidth={2.5} strokeDasharray="6 4" className="stroke-[var(--series-1)]" />
        {picked.values.map((v, i) => (
          <circle key={i} cx={x(n + i)} cy={y(v)} r={3} className="fill-[var(--series-1)]">
            <title>{`${periodLabel(forecast[i]!)}, ${picked.name}: ${formatCompactCurrency(v)} net burn (scenarios range ${formatCompactCurrency(lo[i]!)} to ${formatCompactCurrency(hi[i]!)})`}</title>
          </circle>
        ))}
        {actual.map((a, i) => (
          <circle key={a.p} cx={x(i)} cy={y(a.v)} r={2.5} className="fill-[var(--text-primary)]">
            <title>{`${periodLabel(a.p)} actual: ${formatCompactCurrency(a.v)} net burn`}</title>
          </circle>
        ))}
        {last && (
          <>
            <line x1={x(n - 1)} x2={x(n - 1)} y1={T - 8} y2={H - B} className="stroke-[var(--text-muted)]" strokeDasharray="3 3" />
            <text x={x(n - 1) + 6} y={T - 10} className="fill-[var(--text-secondary)] text-[11px]">
              Forecast from {periodLabel(forecast[0]!)}
            </text>
          </>
        )}
        {months.map((p, i) =>
          p.endsWith("-01") || i === 0 ? (
            <text key={p} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : "middle"} className="fill-[var(--text-muted)] text-[11px]">
              {periodLabel(p)}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-4 text-[12px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 bg-[var(--text-primary)]" aria-hidden /> Actual
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-5 border-t-2 border-dashed border-[var(--series-1)]" aria-hidden /> {picked.name} forecast
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-sm bg-[var(--series-1)] opacity-30" aria-hidden /> Range across {all.map((s) => s.name).join(", ")}
        </span>
        <span className="text-ink-3">Above zero means spending more than coming in.</span>
      </figcaption>
    </figure>
  );
}
