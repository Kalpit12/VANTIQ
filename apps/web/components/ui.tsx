import { formatSignedPct, type Variance } from "@vantiq/domain";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.01em] text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-ink-2">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[10px] border border-line bg-surface ${className}`}>{children}</section>;
}

/** Arrow + signed % in favorable/unfavorable color. Never color alone (design.md 3.1). */
export function VarianceChip({ v, size = "sm" }: { v: Variance; size?: "sm" | "md" }) {
  if (v.delta === 0) return <span className="num text-ink-3">0.0%</span>;
  const up = v.delta > 0;
  const color = v.favorable ? "text-good" : "text-bad";
  return (
    <span
      className={`num inline-flex items-center gap-0.5 font-medium ${color} ${size === "md" ? "text-[13px]" : "text-[12px]"}`}
      title={v.favorable ? "Favorable" : "Unfavorable"}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className={up ? "" : "rotate-180"}>
        <path d="M5 1.5L8.5 6.5H1.5z" fill="currentColor" />
      </svg>
      {formatSignedPct(v.deltaPct)}
      <span className="sr-only">{v.favorable ? " favorable" : " unfavorable"}</span>
    </span>
  );
}

export function StatusPill({ tone, children }: { tone: "info" | "warn" | "neutral" | "accent"; children: React.ReactNode }) {
  const styles = {
    info: "bg-info/10 text-info",
    warn: "bg-warn/10 text-warn",
    neutral: "bg-subtle text-ink-2",
    accent: "bg-accent-subtle text-accent",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${styles}`}>{children}</span>;
}
