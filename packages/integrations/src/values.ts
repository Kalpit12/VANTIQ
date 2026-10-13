import type { Cents, Period } from "@vantiq/domain";

/**
 * Parses amounts the way accounting exports write them:
 * `1234.5`, `$1,234.50`, `(1,234.50)`, `-1234.50`, `1234.50-`, `1.234,50` is NOT supported
 * (ambiguous with thousands separators) and returns null.
 */
export function parseAmount(raw: string): Cents | null {
  let s = raw.trim();
  if (s === "" || s === "-") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  s = s.replace(/^[A-Z]{3}\s*/i, "").replace(/[$€£\s]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(s)) return null;
  const [whole = "0", frac = ""] = s.replace(/,/g, "").split(".");
  // Exact cents from the string, rounding half away from zero on the third decimal.
  let cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (Number(frac[2] ?? "0") >= 5) cents += 1;
  return negative ? -cents : cents;
}

export type DateOrder = "mdy" | "dmy";

/** Picks day/month order for slash dates: if any first part is above 12, the file is day-first. */
export function detectDateOrder(values: string[]): DateOrder {
  for (const v of values) {
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(v.trim());
    if (m && Number(m[1]) > 12) return "dmy";
  }
  return "mdy";
}

/** Returns `YYYY-MM-DD` or null. Accepts ISO dates, slash dates and Excel serial numbers. */
export function parseDate(raw: string, order: DateOrder = "mdy"): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s))) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    y = Number(match[3]);
    if (y < 100) y += 2000;
    [m, d] = order === "mdy" ? [a, b] : [b, a];
  } else if (/^\d{5}(\.\d+)?$/.test(s)) {
    // Excel serial date (1900 system).
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86_400_000);
    return dt.toISOString().slice(0, 10);
  } else {
    return null;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Returns `YYYY-MM` or null. Accepts `2026-09`, `Sep 2026`, `September 2026`, `9/2026`, `Sep-26` and full dates. */
export function parsePeriod(raw: string, order: DateOrder = "mdy"): Period | null {
  const s = raw.trim();
  let match = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (match) return fmt(Number(match[1]), Number(match[2]));
  match = /^(\d{1,2})[/-](\d{4})$/.exec(s);
  if (match) return fmt(Number(match[2]), Number(match[1]));
  match = /^([a-z]{3})[a-z]*[\s-]+(\d{2}|\d{4})$/i.exec(s);
  if (match) {
    const mi = MONTHS.indexOf(match[1]!.toLowerCase());
    let y = Number(match[2]);
    if (y < 100) y += 2000;
    return mi >= 0 ? fmt(y, mi + 1) : null;
  }
  const date = parseDate(s, order);
  return date ? date.slice(0, 7) : null;
}

function fmt(y: number, m: number): Period | null {
  if (m < 1 || m > 12 || y < 1900 || y > 2200) return null;
  return `${y}-${String(m).padStart(2, "0")}`;
}
