import { periodLabel } from "@vantiq/domain";
import type { AuditRow } from "@vantiq/db";

const month = (s: string) => (/^\d{4}-\d{2}$/.test(s) ? periodLabel(s) : s);
const scope = (s: string, names: Map<string, string>) => {
  const [range = "", line] = s.split(" ");
  const [a, b] = range.split("..");
  const when = b ? `${month(a!)} to ${month(b)}` : month(a!);
  return line ? `${names.get(line) ?? line} · ${when}` : when;
};

/** Close task targets are stored as "2026-09 Task title". */
const taskName = (target: string) => `“${target.replace(/^\d{4}-\d{2} /, "")}”`;

export const AUDIT_AREAS = [
  { key: "pack", label: "Review packs" },
  { key: "close", label: "Close checklist" },
  { key: "share", label: "Board pack links" },
  { key: "comment", label: "Comments" },
  { key: "explanation", label: "Explanations" },
  { key: "import", label: "Imports" },
  { key: "mapping", label: "Account mapping" },
  { key: "connection", label: "Connections" },
  { key: "sync", label: "Syncs" },
  { key: "member", label: "Members" },
  { key: "trial", label: "Trials" },
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
      return d.format === "board_pdf" ? `Downloaded the ${month(e.target)} board pack as PDF` : `Downloaded the ${month(e.target)} review pack as ${String(d.format ?? "pdf").toUpperCase()}`;
    case "share.created":
      return `Shared the ${month(e.target)} board pack with ${String(d.label ?? "")} for ${Number(d.days ?? 0)} days`;
    case "share.revoked":
      return `Revoked the ${month(e.target)} board pack link for ${String(d.label ?? "")}`;
    case "share.viewed":
      return `The ${month(e.target)} board pack link for ${String(d.label ?? "")} was opened`;
    case "share.downloaded":
      return `The ${month(e.target)} board pack PDF was downloaded from the link for ${String(d.label ?? "")}`;
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
    case "trial.created":
      return `Added trial ${e.target} (${String(d.cro ?? "")})`;
    case "trial.change_order":
      return `Added change order ${Number(d.number ?? 0)} to ${e.target}, effective ${month(String(d.effective ?? ""))}: ${String(d.description ?? "")}`;
    case "trial.activity":
      return `${d.source === "import" ? "Imported" : "Recorded"} CRO activity for ${e.target}: ${Array.isArray(d.months) ? (d.months as string[]).map(month).join(", ") : ""}`;
    case "trial.journal_exported":
      return `Downloaded accrual journal entries for ${month(e.target)}${Array.isArray(d.trials) ? ` (${(d.trials as string[]).join(", ")})` : ""}`;
    case "close.assigned":
      return `Assigned ${taskName(e.target)} (${month(String(d.period ?? ""))})`;
    case "close.prepared":
      return `Ticked off ${taskName(e.target)} (${month(String(d.period ?? ""))})`;
    case "close.reviewed":
      return `Signed off ${taskName(e.target)} (${month(String(d.period ?? ""))})`;
    case "close.reopened":
      return `Un-ticked ${taskName(e.target)} (${month(String(d.period ?? ""))})`;
    case "close.task_added":
      return `Added the close task ${taskName(e.target)} (${month(String(d.period ?? ""))})`;
    case "comment.added": {
      const a = String(d.anchor ?? "");
      const on = a.startsWith("line:") ? (names.get(a.slice(5)) ?? a.slice(5)) : a.startsWith("task:") ? "a close task" : a;
      return `Commented on ${on} (${month(String(d.period ?? ""))})`;
    }
    case "company.renamed":
      return `Renamed the company from “${String(d.from ?? "")}” to “${e.target}”`;
    default:
      if (e.action.startsWith("sync."))
        return `Synced ${e.target}${e.action === "sync.scheduled" ? " on schedule" : ""}: ${Number(d.inserted ?? 0)} added, ${Number(d.updated ?? 0)} updated, ${Number(d.deleted ?? 0)} removed`;
      return `${e.action} ${e.target}`;
  }
}
