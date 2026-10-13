import type { Cents } from "./types";

/**
 * Number formatting rules from design.md section 4. All inputs are cents.
 */

const EN_DASH = "–";
const MINUS = "−";

function groupInt(n: number): string {
  return Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export type Scale = "units" | "k" | "m";

const DIVISOR: Record<Scale, number> = { units: 100, k: 100_000, m: 100_000_000 };

/**
 * Table amount: no currency symbol, grouped, scaled. Negative numbers use
 * parentheses in financial statements, a minus sign elsewhere. Zero is an en dash.
 */
export function formatAmount(cents: Cents, opts: { scale?: Scale; parens?: boolean; decimals?: number } = {}): string {
  const scale = opts.scale ?? "k";
  const decimals = opts.decimals ?? (scale === "m" ? 1 : 0);
  const value = cents / DIVISOR[scale];
  const rounded = Number(value.toFixed(decimals));
  if (rounded === 0) return EN_DASH;
  const abs = Math.abs(rounded).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (rounded < 0) return opts.parens ? `(${abs})` : `${MINUS}${abs}`;
  return abs;
}

/** Compact currency for KPI cards: `$12.4M`, `$840k`, `−$1.2M`. */
export function formatCompactCurrency(cents: Cents, symbol = "$"): string {
  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  const sign = dollars < 0 ? MINUS : "";
  if (abs >= 1_000_000_000) return `${sign}${symbol}${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${Math.round(abs / 1_000)}k`;
  return `${sign}${symbol}${groupInt(abs)}`;
}

/** Signed variance amount: `+312`, `−88`, `–` for zero. */
export function formatSignedAmount(cents: Cents, scale: Scale = "k"): string {
  const s = formatAmount(cents, { scale });
  if (s === EN_DASH) return s;
  return cents > 0 ? `+${s}` : s;
}

/** Signed percent with one decimal: `+18.2%`, `−4.0%`. Null → em dash. */
export function formatSignedPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "—";
  const v = Number((pct * 100).toFixed(1));
  if (v === 0) return "0.0%";
  return `${v > 0 ? "+" : MINUS}${Math.abs(v).toFixed(1)}%`;
}

/** Full currency for drill-down rows: `$12,480.00`. */
export function formatCurrency(cents: Cents, symbol = "$"): string {
  const abs = (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${cents < 0 ? MINUS : ""}${symbol}${abs}`;
}

/** `2026-09-14` → `14 Sep 2026`. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[(m ?? 1) - 1]} ${y}`;
}

export function formatMonths(months: number | null): string {
  if (months === null) return "Not burning";
  return `${months.toFixed(1)} mo`;
}
