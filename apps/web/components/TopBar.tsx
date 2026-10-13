"use client";

import { periodLabel, periodRange } from "@vantiq/domain";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function TopBar({
  companyName,
  sample,
  firstPeriod,
  latestPeriod,
}: {
  companyName: string;
  sample: boolean;
  firstPeriod: string | null;
  latestPeriod: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const period = sp.get("period") ?? latestPeriod ?? "";
  const mode = sp.get("mode") === "ytd" ? "ytd" : "month";
  const periods = firstPeriod && latestPeriod ? periodRange(firstPeriod, latestPeriod).reverse() : [];
  // Period controls only apply to the review screens.
  const showPeriod = periods.length > 0 && !/^\/(import|mappings|settings)/.test(pathname);

  const go = (changes: Record<string, string>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) q.set(k, v);
    for (const k of ["dc", "dp", "dper"]) q.delete(k);
    router.push(`${pathname}?${q.toString()}`);
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-line bg-surface/95 px-6 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-ink">{companyName}</span>
        {sample && <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium text-ink-2">Sample data</span>}
      </div>
      {showPeriod && (
      <div className="ml-4 flex items-center gap-2">
        <label className="sr-only" htmlFor="period">
          Period
        </label>
        <select
          id="period"
          value={period}
          onChange={(e) => go({ period: e.target.value })}
          className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink"
        >
          {periods.map((p) => (
            <option key={p} value={p}>
              {periodLabel(p)}
            </option>
          ))}
        </select>
        <div role="group" aria-label="Period type" className="flex h-8 overflow-hidden rounded-md border border-line-strong text-[13px]">
          {(["month", "ytd"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => go({ mode: m })}
              className={`px-3 ${mode === m ? "bg-accent text-accent-contrast" : "bg-surface text-ink-2 hover:bg-subtle"}`}
            >
              {m === "month" ? "Month" : "Year to date"}
            </button>
          ))}
        </div>
        <span className="text-[13px] text-ink-3">vs Budget</span>
      </div>
      )}
      <div className="ml-auto flex items-center gap-3">
        {sample && <span className="hidden text-[12px] text-ink-3 lg:inline">Demo mode: built-in sample ledger</span>}
        <ThemeToggle />
      </div>
    </header>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setTheme(t === "dark" || t === "light" ? t : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("vantiq-theme", next);
    } catch {}
    setTheme(next);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-line-strong text-ink-2 hover:bg-subtle"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        {theme === "dark" ? (
          <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66l1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14l-1.41-1.41M12 17a5 5 0 100-10 5 5 0 000 10z" />
        ) : (
          <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
        )}
      </svg>
    </button>
  );
}
