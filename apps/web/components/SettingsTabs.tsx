import Link from "next/link";
import { can, type Role } from "@vantiq/db";

/** Tabs across the settings screens; each only shows to roles that can open it. */
export function SettingsTabs({ role, active }: { role: Role; active: "general" | "members" | "audit" }) {
  const tabs = [
    { key: "general", href: "/settings", label: "Company", show: true },
    { key: "members", href: "/settings/members", label: "Members", show: can.manageMembers(role) },
    { key: "audit", href: "/settings/audit", label: "Audit log", show: can.viewAudit(role) },
  ].filter((t) => t.show);
  return (
    <nav aria-label="Settings" className="mb-5 flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium ${t.key === active ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
