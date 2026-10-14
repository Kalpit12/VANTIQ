import Link from "next/link";
import {
  buildBridge,
  DEFAULT_THRESHOLDS,
  formatAmount,
  formatCompactCurrency,
  formatSignedAmount,
  formatSignedPct,
  isMaterial,
} from "@vantiq/domain";
import { ChartCard } from "@/components/ChartCard";
import { DrillDrawer } from "@/components/DrillDrawer";
import { BulletRows } from "@/components/charts/BulletRows";
import { VarianceBridge } from "@/components/charts/VarianceBridge";
import { Card, PageHeader, StatusPill, VarianceChip } from "@/components/ui";
import { MappingBanner, NoData } from "@/components/NoData";
import { getWorkspace } from "@/lib/data";
import { can } from "@vantiq/db";
import { findingTitle, varianceFor } from "@/lib/metrics";
import { href, one, resolveView, type SearchParams } from "@/lib/view";
import { draftExplanationsAction } from "@/app/actions/explanations";
import { SubmitButton } from "@/components/AuthForm";
import { ExplanationBlock } from "@/components/ExplanationBlock";
import { ExplanationCell } from "@/components/ExplanationCell";
import { explanationsFor, materialCategoryIds } from "@/lib/explanations";
import { monthLocked } from "@/lib/pack";

export default async function VariancesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  if (!ws.ledger.hasData()) return <NoData title="Variances" canImport={ws.mode === "db" && can.importData(ws.role)} />;
  const ledger = ws.ledger;
  const view = resolveView(sp, ledger);
  const drill = (dc: string) => href("/variances", sp, { dc, dp: null, dper: null });

  const rows = ledger.tree(view.periods);
  const opex = varianceFor(ledger, view.periods, "opex");
  const opexLeaves = rows.filter((r) => !r.hasChildren && r.category.kind === "opex");
  const steps = buildBridge(
    { label: "Budget", value: opex.comparison },
    opexLeaves.map((r) => ({ id: r.category.id, label: r.category.name, delta: r.variance.delta, favorable: r.variance.favorable })),
    "Actual",
    { favorableWhenPositive: false, maxSteps: 6 },
  );
  const biggest = [...opexLeaves].sort((a, b) => Math.abs(b.variance.delta) - Math.abs(a.variance.delta))[0];
  const material = rows.filter((r) => !r.hasChildren && isMaterial(r.variance));
  const expl = await explanationsFor(ws, view.periods);
  const locked = await monthLocked(ws, view.periods);
  const canExplain = ws.mode === "db" && can.explain(ws.role) && !locked;
  const missing = materialCategoryIds(ledger, view.periods).filter((id) => !expl.has(id));
  const back = href("/variances", sp, { xerr: null });
  const dc = one(sp, "dc");
  const dcLeaf = dc && rows.some((r) => r.category.id === dc && !r.hasChildren) ? dc : null;
  const bulletRows = opexLeaves
    .filter((r) => r.variance.actual !== 0 || r.variance.comparison !== 0)
    .sort((a, b) => b.variance.actual - a.variance.actual)
    .map((r) => ({
      id: r.category.id,
      label: r.category.name,
      sublabel: r.category.parentId ? ledger.category(r.category.parentId).name : undefined,
      variance: r.variance,
      href: drill(r.category.id),
    }));

  return (
    <>
      <PageHeader
        title="Variances"
        subtitle={`Budget vs actual · ${view.label} · ${material.length} material line${material.length === 1 ? "" : "s"} (over ±${DEFAULT_THRESHOLDS.pct * 100}% and ±${formatCompactCurrency(DEFAULT_THRESHOLDS.abs)}, whichever is larger)`}
      >
        {canExplain && missing.length > 0 && (
          <form action={draftExplanationsAction}>
            <input type="hidden" name="period" value={view.period} />
            <input type="hidden" name="mode" value={view.mode} />
            <input type="hidden" name="back" value={back} />
            <SubmitButton label={`Draft ${missing.length} explanation${missing.length === 1 ? "" : "s"}`} pendingLabel="Drafting…" />
          </form>
        )}
      </PageHeader>
      <MappingBanner unmapped={ws.unmapped} unconfirmed={ws.unconfirmed} />
      {locked && (
        <p className="mb-4 rounded-md bg-accent-subtle px-3 py-2 text-[13px] text-ink">
          {view.label} is approved and locked, so its explanations can&apos;t change.{" "}
          <Link href={`/pack?period=${view.period}`} className="font-medium text-accent hover:underline">
            Open the review pack →
          </Link>
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-5">
        <ChartCard
          className="xl:col-span-3"
          title={
            biggest
              ? `${findingTitle("Operating expenses", opex, view.label)}, driven by ${biggest.category.name}`
              : findingTitle("Operating expenses", opex, view.label)
          }
          subtitle="From budget to actual operating expenses, USD · click a bar for transactions"
          table={{
            columns: ["Step", "Change", "Running total"],
            rows: steps.map((s) => [s.label, s.kind === "step" ? formatCompactCurrency(s.delta) : "", formatCompactCurrency(s.to)]),
          }}
        >
          <VarianceBridge steps={steps} />
        </ChartCard>
        <ChartCard
          className="xl:col-span-2"
          title="Actual vs budget by expense line"
          subtitle={`Operating expenses, USD · ${view.label} · largest first`}
          table={{
            columns: ["Line", "Actual", "Budget", "Variance"],
            rows: bulletRows.map((r) => [r.label, formatCompactCurrency(r.variance.actual), formatCompactCurrency(r.variance.comparison), formatSignedPct(r.variance.deltaPct)]),
          }}
        >
          <BulletRows rows={bulletRows} />
        </ChartCard>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-[15px] font-semibold text-ink">Budget vs actual</h2>
          <span className="text-[12px] text-ink-3">USD thousands · click any number for transactions</span>
        </div>
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[820px] text-[13px]">
            <thead className="bg-subtle text-[12px] text-ink-3">
              <tr>
                <th className="sticky left-0 bg-subtle px-5 py-2 text-left font-medium">Line</th>
                <th className="px-3 py-2 text-right font-medium">Actual</th>
                <th className="px-3 py-2 text-right font-medium">Budget</th>
                <th className="px-3 py-2 text-right font-medium">Variance</th>
                <th className="px-3 py-2 text-right font-medium">Var %</th>
                <th className="px-5 py-2 text-left font-medium">Explanation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const mat = !r.hasChildren && isMaterial(r.variance);
                const strong = r.depth === 0 || r.hasChildren;
                return (
                  <tr
                    key={r.category.id}
                    className={`border-b border-line/70 ${r.depth === 0 ? "bg-subtle/60" : ""} ${mat ? "shadow-[inset_3px_0_0_var(--warning)]" : ""}`}
                  >
                    <td className={`sticky left-0 bg-inherit py-2 pr-3 ${strong ? "font-semibold text-ink" : "text-ink-2"}`} style={{ paddingLeft: 20 + r.depth * 16 }}>
                      {r.category.name}
                    </td>
                    <td className={`px-3 py-2 text-right ${strong ? "font-semibold" : ""}`}>
                      <Link href={drill(r.category.id)} scroll={false} className="hover:underline">
                        {formatAmount(r.variance.actual)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right text-ink-2">{formatAmount(r.variance.comparison)}</td>
                    <td className={`px-3 py-2 text-right ${r.variance.delta === 0 ? "text-ink-3" : r.variance.favorable ? "text-good" : "text-bad"}`}>
                      {formatSignedAmount(r.variance.delta)}
                    </td>
                    <td className="px-3 py-2 text-right">{r.variance.comparison === 0 ? <span className="text-ink-3">—</span> : <VarianceChip v={r.variance} />}</td>
                    <td className="px-5 py-2">
                      <ExplanationCell row={expl.get(r.category.id)} material={mat} href={drill(r.category.id)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <DrillDrawer
        ledger={ledger}
        sp={sp}
        view={view}
        path="/variances"
        cited={dcLeaf ? expl.get(dcLeaf)?.citedTransactionIds : undefined}
        explanation={
          dcLeaf && (expl.has(dcLeaf) || material.some((r) => r.category.id === dcLeaf)) ? (
            <ExplanationBlock row={expl.get(dcLeaf)} ledger={ledger} categoryId={dcLeaf} view={view} back={back} canEdit={canExplain} demo={ws.mode === "demo"} error={one(sp, "xerr")} />
          ) : undefined
        }
      />
    </>
  );
}
