"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signOutAction, switchCompanyAction } from "@/app/actions/auth";

type Role = "admin" | "finance" | "viewer";

const NAV = [
  { href: "/overview", label: "Overview", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { href: "/variances", label: "Variances", icon: "M4 19h16M7 15V9m5 6V5m5 10v-3" },
  { href: "/programs", label: "R&D programs", icon: "M9 3h6M10 3v6L5 18a2 2 0 002 3h10a2 2 0 002-3l-5-9V3" },
  { href: "/statements", label: "Statements", icon: "M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4" },
];

const DATA_NAV = [
  { href: "/connections", label: "Connections", icon: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" },
  { href: "/import", label: "Import data", icon: "M12 15V3m0 0L8 7m4-4l4 4M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" },
  { href: "/mappings", label: "Account mapping", icon: "M4 6h7M4 12h7M4 18h7M15 6l5 6-5 6" },
];

export function Sidebar({
  mode,
  role,
  user,
  companies,
  companyId,
  needsMapping,
}: {
  mode: "demo" | "db";
  role: Role;
  user: { name: string; email: string } | null;
  companies: { id: string; name: string; role: Role }[];
  companyId: string | null;
  needsMapping: number;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  // Keep the period selection when moving between screens, but drop drill-down state.
  const keep = new URLSearchParams();
  for (const k of ["period", "mode"]) {
    const v = sp.get(k);
    if (v) keep.set(k, v);
  }
  const qs = keep.toString() ? `?${keep.toString()}` : "";
  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 md:flex">
      <div className="mb-6 flex items-center gap-2 px-2">
        <Wordmark />
      </div>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV.map((item) => (
          <NavLink key={item.href} href={`${item.href}${qs}`} label={item.label} icon={item.icon} active={isActive(item.href)} />
        ))}
      </nav>
      {mode === "db" && (
        <nav aria-label="Data" className="mt-6 flex flex-col gap-0.5 border-t border-line pt-4">
          <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-ink-3">Data</p>
          {DATA_NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActive(item.href)}
              badge={item.href === "/mappings" && needsMapping > 0 ? needsMapping : undefined}
            />
          ))}
          {role === "admin" && (
            <NavLink href="/settings/members" label="Members" icon="M16 19v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1M9 10a3 3 0 100-6 3 3 0 000 6zM22 19v-1a4 4 0 00-3-3.9M16 4.1a3 3 0 010 5.8" active={isActive("/settings")} />
          )}
        </nav>
      )}
      <div className="mt-6 border-t border-line pt-4">
        <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-ink-3">Coming next</p>
        <span className="block px-2.5 py-1.5 text-[13px] text-ink-3">Review pack</span>
      </div>
      {user && (
        <div className="mt-auto border-t border-line px-1 pt-3">
          <p className="truncate px-1.5 text-[13px] font-medium text-ink">{user.name}</p>
          <p className="truncate px-1.5 text-[12px] text-ink-3">{user.email}</p>
          {companies.length > 1 && (
            <form action={switchCompanyAction} className="mt-2 px-1.5">
              <label htmlFor="company-switch" className="sr-only">
                Company
              </label>
              <select
                id="company-switch"
                name="companyId"
                defaultValue={companyId ?? undefined}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
                className="h-8 w-full rounded-md border border-line-strong bg-surface px-2 text-[12px] text-ink"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </form>
          )}
          <form action={signOutAction}>
            <button type="submit" className="mt-2 w-full rounded-md px-1.5 py-1 text-left text-[12px] text-ink-2 hover:bg-subtle hover:text-ink">
              Sign out
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}

function NavLink({ href, label, icon, active, badge }: { href: string; label: string; icon: string; active: boolean; badge?: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
        active ? "bg-accent-subtle text-ink" : "text-ink-2 hover:bg-subtle hover:text-ink"
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={icon} />
      </svg>
      <span className="flex-1">{label}</span>
      {badge !== undefined && (
        <span className="num rounded-full bg-warn/15 px-1.5 text-[11px] font-semibold text-warn" aria-label={`${badge} to review`}>
          {badge}
        </span>
      )}
    </Link>
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
