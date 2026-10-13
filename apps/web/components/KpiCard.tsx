import Link from "next/link";
import type { Variance } from "@vantiq/domain";
import { VarianceChip } from "./ui";

/** Headline metric with a 12-period sparkline and delta vs budget (design.md 6, chart C1). */
export function KpiCard({
  label,
  value,
  variance,
  caption,
  series,
  href,
  tone,
}: {
  label: string;
  value: string;
  variance?: Variance;
  caption: string;
  series: number[];
  href?: string;
  tone?: "warn";
}) {
  const cls = "group flex flex-col rounded-[10px] border border-line bg-surface p-4 transition-colors";
  const body = (
    <>
      <span className="text-[12px] font-medium text-ink-2">{label}</span>
      <span className={`num mt-1 text-[28px] font-semibold leading-[34px] tracking-[-0.01em] ${tone === "warn" ? "text-warn" : "text-ink"}`}>
        {value}
      </span>
      <div className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-3">
        {variance && <VarianceChip v={variance} />}
        <span className="truncate">{caption}</span>
      </div>
      <Sparkline values={series} />
    </>
  );
  return href ? (
    <Link href={href} scroll={false} className={`${cls} hover:border-line-strong`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 160;
  const h = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-8 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke="var(--series-1)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
