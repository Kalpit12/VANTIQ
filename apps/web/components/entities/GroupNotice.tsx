import Link from "next/link";
import { formatCompactCurrency, periodLabel, type Entity } from "@vantiq/domain";
import type { Group } from "@/lib/entities";
import { href, type SearchParams, type View } from "@/lib/view";
import { Card, PageHeader } from "../ui";

/**
 * Multi-entity groups, above the review screens (design.md 17). On the
 * consolidated view: rates that are missing and intercompany pairs that don't
 * match for the months shown. On one entity: what the numbers are, and a way back.
 */
export function GroupNotice({ group, entity, view, sp, path }: { group: Group | null; entity: Entity | null; view: View; sp: SearchParams; path: string }) {
  if (!group) return null;
  const periods = new Set(view.periods);
  if (entity) {
    return (
      <p className="mb-4 rounded-md bg-accent-subtle px-3 py-2 text-[13px] text-ink">
        Showing {entity.name} on its own{entity.currency !== group.consolidation.reportingCurrency ? `, translated from ${entity.currency} to ${group.consolidation.reportingCurrency} at each month's average rate` : ""}. Its intercompany lines are included here and eliminated in the group. Explanations are written on the consolidated view.{" "}
        <Link href={href(path, sp, { entity: null, dc: null, dp: null, dper: null })} className="font-medium text-accent hover:underline">
          Back to consolidated →
        </Link>
      </p>
    );
  }
  const flags = group.consolidation.checks.filter((c) => c.basis === "actual" && periods.has(c.period) && c.status !== "matched");
  const rates = group.consolidation.rateIssues.filter((r) => periods.has(r.period));
  if (!flags.length && !rates.length) return null;
  const missing = rates.filter((r) => r.usedPeriod === null);
  const fallback = rates.filter((r) => r.usedPeriod !== null);
  return (
    <div role="status" className="mb-4 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-ink">
      {flags.length > 0 && (
        <p>
          {flags.length} intercompany {flags.length === 1 ? "pair doesn't" : "pairs don't"} match in {view.label}: {formatCompactCurrency(flags.reduce((s, f) => s + Math.abs(f.difference), 0))} is left in the group after elimination.{" "}
          <Link href={`${href("/entities", sp, { dc: null, dp: null, dper: null, entity: null })}#intercompany`} className="font-medium text-accent hover:underline">
            See intercompany →
          </Link>
        </p>
      )}
      {missing.length > 0 && <p>No {[...new Set(missing.map((r) => r.currency))].join(", ")} rates at all, so those entities are left out of the group. Add rates under Settings → Entities.</p>}
      {fallback.length > 0 && (
        <p>
          {[...new Set(fallback.map((r) => `${r.currency} has no ${r.kind} rate for ${periodLabel(r.period)}, so ${periodLabel(r.usedPeriod!)}'s is used`))].join("; ")}.
        </p>
      )}
    </div>
  );
}

/** One entity picked with nothing booked to it yet. */
export function EntityEmpty({ title, entity, sp, path }: { title: string; entity: Entity; sp: SearchParams; path: string }) {
  return (
    <>
      <PageHeader title={title} subtitle={`${entity.name} (${entity.code})`} />
      <Card className="max-w-[720px] p-6">
        <h2 className="text-[17px] font-semibold text-ink">Nothing is booked to {entity.code} yet</h2>
        <p className="mt-1 text-[13px] text-ink-2">Import a ledger with an Entity column naming {entity.code}, or switch back to the whole group.</p>
        <Link href={href(path, sp, { entity: null })} className="mt-3 inline-block text-[13px] font-medium text-accent hover:underline">
          Back to consolidated →
        </Link>
      </Card>
    </>
  );
}
