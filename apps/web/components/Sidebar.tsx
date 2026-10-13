"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const NAV = [
  { href: "/", label: "Overview", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { href: "/variances", label: "Variances", icon: "M4 19h16M7 15V9m5 6V5m5 10v-3" },
  { href: "/programs", label: "R&D programs", icon: "M9 3h6M10 3v6L5 18a2 2 0 002 3h10a2 2 0 002-3l-5-9V3" },
  { href: "/statements", label: "Statements", icon: "M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4" },
];

const LATER = ["Review pack", "Settings"];

export function Sidebar() {
  const pathname = usePathname();
  const sp = useSearchParams();
  // Keep the period selection when moving between screens, but drop drill-down state.
  const keep = new URLSearchParams();
  for (const k of ["period", "mode"]) {
    const v = sp.get(k);
    if (v) keep.set(k, v);
  }
  const qs = keep.toString() ? `?${keep.toString()}` : "";

  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 md:flex">
      <div className="mb-6 flex items-center gap-2 px-2">
        <Wordmark />
      </div>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={`${item.href}${qs}`}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                active ? "bg-accent-subtle text-ink" : "text-ink-2 hover:bg-subtle hover:text-ink"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={item.icon} />
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-6 border-t border-line pt-4">
        <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-ink-3">Coming next</p>
        {LATER.map((l) => (
          <span key={l} className="block px-2.5 py-1.5 text-[13px] text-ink-3">
            {l}
          </span>
        ))}
      </div>
    </aside>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-baseline text-[19px] font-semibold tracking-[-0.02em] text-ink" aria-label="Vantiq">
      vant
      <span className="relative inline-block">
        ı
        <span className="absolute left-1/2 top-[3px] h-[5px] w-[5px] -translate-x-1/2 rounded-[1px] bg-accent" aria-hidden />
      </span>
      q
    </span>
  );
}
