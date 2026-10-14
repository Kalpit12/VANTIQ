import { periodLabel } from "@vantiq/domain";
import type { AuditRow } from "@vantiq/db";

const month = (s: string) => (/^\d{4}-\d{2}$/.test(s) ? periodLabel(s) : s);
const scope = (s: string, names: Map<string, string>) => {
  const [range = "", line] = s.split(" ");
  const [a, b] = range.split("..");
  const when = b ? `${month(a!)} to ${month(b)}` : month(a!);
  return line ? `${names.get(line) ?? line} · ${when}` : when;
};

export const AUDIT_AREAS = [
  { key: "pack", label: "Review packs" },
  { key: "explanation", label: "Explanations" },
  { key: "import", label: "Imports" },
  { key: "mapping", label: "Account mapping" },
  { key: "connection", label: "Connections" },
  { key: "sync", label: "Syncs" },
  { key: "member", label: "Members" },
  { key: "company", label: "Company" },
] as const;

/** One audit event as a plain sentence, e.g. "Approved the Sep 2026 review pack". */
export function describeEvent(e: Pick<AuditRow, "action" | "target" | "detail">, categoryNames?: Map<string, string>): string {
  const names = categoryNames ?? new Map<string, string>();
  const d = e.detail as Record<string, unknown>;
  switch (e.action) {
    case "pack.approved":
      return `Approved the ${month(e.target)} review pack`;
    case "pack.reopened":
      return `Reopened ${month(e.target)}: “${String(d.reason ?? "")}”`;
    case "pack.exported":
      return `Downloaded the ${month(e.target)} review pack as ${String(d.format ?? "pdf").toUpperCase()}`;
    case "explanation.draft":
      return `Drafted ${Array.isArray(d.lines) ? d.lines.length : ""} explanation${Array.isArray(d.lines) && d.lines.length === 1 ? "" : "s"} for ${scope(e.target, names)} (${d.source === "claude" ? "AI" : "auto"})`.replace("  ", " ");
    case "explanation.accept":
      return `Accepted the explanation for ${scope(e.target, names)}`;
    case "explanation.edit":
      return `Edited and accepted the explanation for ${scope(e.target, names)}`;
    case "explanation.reject":
      return `Rejected the explanation for ${scope(e.target, names)}`;
    case "import.ledger":
    case "import.budget":
    case "import.cash":
      return `Imported ${e.action.slice(7)} file ${e.target}: ${Number(d.inserted ?? 0)} rows added${Number(d.duplicates ?? 0) ? `, ${Number(d.duplicates)} duplicates skipped` : ""}`;
    case "mapping.saved":
      return `Changed the mapping of ${e.target}`;
    case "mapping.confirmed_all":
      return `Confirmed the suggested mapping for ${e.target}`;
    case "connection.create":
      return `Connected ${e.target}`;
    case "connection.delete":
      return `Disconnected ${e.target}`;
    case "member.added":
      return `Added ${e.target} as ${String(d.role ?? "member")}`;
    case "member.role_changed":
      return `Changed a member's role to ${String(d.role ?? "")}`;
    case "company.renamed":
      return `Renamed the company from “${String(d.from ?? "")}” to “${e.target}”`;
    default:
      if (e.action.startsWith("sync."))
        return `Synced ${e.target}${e.action === "sync.scheduled" ? " on schedule" : ""}: ${Number(d.inserted ?? 0)} added, ${Number(d.updated ?? 0)} updated, ${Number(d.deleted ?? 0)} removed`;
      return `${e.action} ${e.target}`;
  }
}
