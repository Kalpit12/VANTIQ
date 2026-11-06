import Link from "next/link";
import { formatAmount, formatCompactCurrency, formatCurrency, periodLabel, type Category, type IntercompanyCheck, type Ledger, type Period } from "@vantiq/domain";
import { ChartCard } from "@/components/ChartCard";
import { DrillDrawer } from "@/components/DrillDrawer";
import { EntityMultiples } from "@/components/entities/EntityMultiples";
import { GroupNotice } from "@/components/entities/GroupNotice";
import { NoData } from "@/components/NoData";
import { Card, PageHeader, StatusPill } from "@/components/ui";
import { getWorkspace } from "@/lib/data";
import { formatMoney } from "@/lib/entities";
import { trendPoints } from "@/lib/metrics";
import { href, one, resolveView, type SearchParams } from "@/lib/view";
import { can } from "@vantiq/db";

export const metadata = { title: "Entities · Vantiq Finance" };

const SLOTS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];

/**
 * Entities and consolidation (design.md 17, chart C20): each entity in the
 * reporting currency, what is eliminated, the group total, the rates used,
 * and every intercompany pair month by month.
 */
export default async function EntitiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  if (!ws.ledger.hasData()) return <NoData title="Entities" canImport={ws.mode === "db" && can.importData(ws.role)} />;
  const group = ws.group;
  if (!group) {
    return (
      <>
        <PageHeader title="Entities" subtitle={ws.companyName} />
        <Card className="max-w-[720px] p-6">
          <h2 className="text-[17px] font-semibold text-ink">{ws.companyName} is one entity</h2>
          <p className="mt-1 text-[13px] text-ink-2">
            Add subsidiaries to report the group: each keeps its books in its own currency, Vantiq translates them at monthly rates and eliminates intercompany charges.
          </p>
          {ws.mode === "db" && can.manageEntities(ws.role) && (
            <Link href="/settings/entities" className="mt-3 inline-block text-[13px] font-medium text-accent hover:underline">
              Set up entities →
            </Link>
          )}
        </Card>
      </>
    );
  }
  const view = resolveView(sp, ws.ledger);
  const cur = group.consolidation.reportingCurrency;
  const entities = group.entities;
  const color = new Map(entities.map((e, i) => [e.id, SLOTS[i] ?? "var(--series-other)"]));
  const ledgers = entities.map((e) => ({ entity: e, ledger: group.ledgerOf(e.id) }));
  const de = one(sp, "de");
  const drillEntity = de ? entities.find((e) => e.code === de) : undefined;
  const drillLedger = drillEntity ? group.ledgerOf(drillEntity.id) : ws.ledger;
  const drill = (dc: string, code: string | null) => href("/entities", sp, { dc, de: code, dp: null, dper: null });

  // C20: operating expenses by entity, one scale.
  const panels = ledgers.map(({ entity, ledger }) => ({ code: entity.code, name: entity.name, currency: entity.currency, color: color.get(entity.id)!, points: trendPoints(ledger, view.trend, ["opex"]) }));
  const opexBy = ledgers.map(({ entity, ledger }) => ({ entity, opex: ledger.actual({ periods: view.periods, categoryIds: ["opex"] }) }));
  const groupOpex = ws.ledger.actual({ periods: view.periods, categoryIds: ["opex"] });
  const top = [...opexBy].sort((a, b) => b.opex - a.opex)[0]!;
  const share = groupOpex ? Math.round((top.opex / opexBy.reduce((s, x) => s + x.opex, 0)) * 100) : 0;

  // Consolidation table: each entity, eliminations, group.
  const lines: { category: Category | null; label: string; depth: number; value: (l: Ledger) => number }[] = [
    ...ws.ledger
      .tree(view.periods)
      .filter((r) => r.depth <= 1)
      .map((r) => ({ category: r.category, label: r.category.name, depth: r.depth, value: (l: Ledger) => l.actual({ periods: view.periods, categoryIds: [r.category.id] }) })),
    { category: null, label: "Net income (loss)", depth: 0, value: (l: Ledger) => l.netIncome(view.periods) },
  ];

  const checks = group.consolidation.checks.filter((c) => c.basis === "actual" && view.periods.includes(c.period));
  const eliminated = checks.reduce((s, c) => s + c.eliminated, 0);
  const unmatched = checks.filter((c) => c.status !== "matched");
  const accountName = (entityId: string, code: string) => group.consolidation.entities.find((e) => e.entity.id === entityId)?.transactions.find((t) => t.accountCode === code)?.categoryId;
  const categoryName = (id: string | undefined) => (id ? ws.ledger.category(id).name : "");

  const rate = (currency: string, period: Period, kind: "average" | "closing") => (currency === cur ? "1" : (group.rates.find((r) => r.currency === currency && r.period === period)?.[kind] ?? "—"));
  const opexLeaves = new Set(ws.ledger.leavesOf("opex"));
  const entityRows = group.consolidation.entities.map((e) => {
    const inView = e.transactions.filter((t) => view.periods.includes(t.date.slice(0, 7)) && opexLeaves.has(t.categoryId));
    return {
      entity: e.entity,
      translated: e.translated,
      opexLocal: inView.reduce((s, t) => s + (t.original?.amount ?? t.amount), 0),
      opexUsd: inView.reduce((s, t) => s + t.amount, 0),
      cashLocal: e.localCash.find((c) => c.period === view.period)?.balance ?? null,
      cashUsd: e.cash.find((c) => c.period === view.period)?.balance ?? null,
    };
  });

  return (
    <>
      <PageHeader title="Entities" subtitle={`${entities.length} entities consolidated in ${cur} · ${view.label} · income and costs at each month's average rate, cash at month-end rates`} />
      <GroupNotice group={group} entity={null} view={view} sp={sp} path="/entities" />

      <ChartCard
        title={`${top.entity.name} carries ${share}% of the group's operating expenses in ${view.label}`}
        subtitle={`Operating expenses by entity, ${cur} · ${periodLabel(view.trend[0]!)}–${periodLabel(view.period)} · one scale for every entity · bars actual, dashed budget · click a month for transactions`}
        legend={entities.map((e) => ({ label: e.code, color: color.get(e.id)! }))}
        table={{
          columns: ["Month", ...entities.map((e) => e.code)],
          rows: view.trend.map((p, i) => [periodLabel(p), ...panels.map((x) => formatCompactCurrency(x.points[i]!.actual))]),
        }}
      >
        <EntityMultiples panels={panels} measure="Operating expenses" dc="opex" />
      </ChartCard>

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
          <h2 className="text-[15px] font-semibold text-ink">Consolidation, {view.label}</h2>
          <span className="text-[12px] text-ink-3">{cur} thousands · each entity translated, intercompany eliminated · click a number for transactions</span>
        </div>
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[820px] text-[13px]">
            <thead className="bg-subtle text-[12px] text-ink-3">
              <tr>
                <th className="sticky left-0 bg-subtle px-5 py-2 text-left font-medium">Line</th>
                {entities.map((e) => (
                  <th key={e.id} className="px-3 py-2 text-right font-medium">
                    <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: color.get(e.id) }} aria-hidden />
                    {e.code}
                  </th>
                ))}
                <th className="border-l border-line px-3 py-2 text-right font-medium">Eliminations</th>
                <th className="px-5 py-2 text-right font-medium">Consolidated</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const values = ledgers.map(({ ledger }) => line.value(ledger));
                const total = line.value(ws.ledger);
                const elim = total - values.reduce((s, v) => s + v, 0);
                const strong = line.depth === 0;
                return (
                  <tr key={line.label} className={`border-b border-line/70 ${strong ? "bg-subtle/60 font-semibold" : ""} ${line.category ? "" : "border-t-2 border-line-strong"}`}>
                    <td className={`sticky left-0 bg-inherit py-2 pr-3 ${strong ? "text-ink" : "text-ink-2"}`} style={{ paddingLeft: 20 + line.depth * 16 }}>
                      {line.label}
                    </td>
                    {ledgers.map(({ entity }, i) => (
                      <td key={entity.id} className="px-3 py-2 text-right">
                        {line.category ? (
                          <Link href={drill(line.category.id, entity.code)} scroll={false} className="hover:underline">
                            {formatAmount(values[i]!, { parens: true })}
                          </Link>
                        ) : (
                          formatAmount(values[i]!, { parens: true })
                        )}
                      </td>
                    ))}
                    <td className="border-l border-line px-3 py-2 text-right text-ink-2">{formatAmount(elim, { parens: true })}</td>
                    <td className="px-5 py-2 text-right">
                      {line.category ? (
                        <Link href={drill(line.category.id, null)} scroll={false} className="hover:underline">
                          {formatAmount(total, { parens: true })}
                        </Link>
                      ) : (
                        formatAmount(total, { parens: true })
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 2xl:grid-cols-5">
        <Card className="overflow-hidden 2xl:col-span-2">
          <div className="border-b border-line px-5 py-3">
            <h2 className="text-[15px] font-semibold text-ink">Entities and rates, {periodLabel(view.period)}</h2>
            <p className="text-[12px] text-ink-3">Rates are {cur} per one unit of the entity&apos;s currency</p>
          </div>
          <div className="overflow-x-auto">
            <table className="num w-full min-w-[620px] text-[13px]">
              <thead className="bg-subtle text-[12px] text-ink-3">
                <tr>
                  <th className="px-5 py-2 text-left font-medium">Entity</th>
                  <th className="px-3 py-2 text-right font-medium">Average rate</th>
                  <th className="px-3 py-2 text-right font-medium">Operating expenses, {view.mode === "ytd" ? "YTD" : "month"}</th>
                  <th className="px-3 py-2 text-right font-medium">Closing rate</th>
                  <th className="px-5 py-2 text-right font-medium">Cash at month end</th>
                </tr>
              </thead>
              <tbody>
                {entityRows.map((r) => (
                  <tr key={r.entity.id} className="border-b border-line/70 align-top">
                    <td className="px-5 py-2">
                      <div className="font-medium text-ink">{r.entity.name}</div>
                      <div className="text-[12px] text-ink-3">
                        <span className="font-mono">{r.entity.code}</span> · {r.entity.currency}
                        {r.entity.parent ? " · parent" : ""}
                        {!r.translated && " · no rates, left out"}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-ink-2">{rate(r.entity.currency, view.period, "average")}</td>
                    <td className="px-3 py-2 text-right">
                      <div>{formatCurrency(r.opexUsd)}</div>
                      {r.entity.currency !== cur && <div className="text-[12px] text-ink-3">{formatMoney(r.opexLocal, r.entity.currency)}</div>}
                    </td>
                    <td className="px-3 py-2 text-right text-ink-2">{rate(r.entity.currency, view.period, "closing")}</td>
                    <td className="px-5 py-2 text-right">
                      <div>{r.cashUsd === null ? "—" : formatCurrency(r.cashUsd)}</div>
                      {r.entity.currency !== cur && r.cashLocal !== null && <div className="text-[12px] text-ink-3">{formatMoney(r.cashLocal, r.entity.currency)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden 2xl:col-span-3">
          <div id="intercompany" className="scroll-mt-20 border-b border-line px-5 py-3">
            <h2 className="text-[15px] font-semibold text-ink">
              {unmatched.length ? `${unmatched.length} intercompany ${unmatched.length === 1 ? "pair doesn't" : "pairs don't"} match in ${view.label}` : `Intercompany matches in ${view.label}`}
            </h2>
            <p className="text-[12px] text-ink-3">
              {formatCompactCurrency(eliminated)} eliminated. Where the two sides differ, the amount they agree on is eliminated and the rest stays in the group until it is fixed.
            </p>
          </div>
          {checks.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-ink-3">
              {group.consolidation.checks.length === 0 ? "No intercompany pairs are set up." : `No intercompany activity in ${view.label}.`}
              {ws.mode === "db" && can.manageEntities(ws.role) && (
                <>
                  {" "}
                  <Link href="/settings/entities" className="font-medium text-accent hover:underline">
                    Pair accounts →
                  </Link>
                </>
              )}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="num w-full min-w-[760px] text-[13px]">
                <thead className="bg-subtle text-[12px] text-ink-3">
                  <tr>
                    <th className="px-5 py-2 text-left font-medium">Pair</th>
                    <th className="px-3 py-2 text-left font-medium">Month</th>
                    <th className="px-3 py-2 text-right font-medium">One side</th>
                    <th className="px-3 py-2 text-right font-medium">Other side</th>
                    <th className="px-3 py-2 text-right font-medium">Eliminated</th>
                    <th className="px-3 py-2 text-right font-medium">Left in group</th>
                    <th className="px-5 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((c) => (
                    <PairRow key={`${c.pairId}-${c.period}`} c={c} code={(id) => group.byId.get(id)?.code ?? ""} name={(id, acct) => categoryName(accountName(id, acct))} reporting={cur} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <DrillDrawer ledger={drillLedger} sp={sp} view={view} path="/entities" entities={group.byId} />
    </>
  );
}

function Side({ side, code, name, reporting }: { side: IntercompanyCheck["side"]; code: string; name: string; reporting: string }) {
  return (
    <>
      <div className="text-[12px] text-ink-3">
        <span className="font-mono">{code}</span> · {side.accountCode}
        {name ? ` ${name}` : ""}
      </div>
      <div>{formatCurrency(side.translated)}</div>
      {side.currency !== reporting && <div className="text-[12px] text-ink-3">{formatMoney(side.local, side.currency)}</div>}
    </>
  );
}

function PairRow({ c, code, name, reporting }: { c: IntercompanyCheck; code: (id: string) => string; name: (id: string, acct: string) => string; reporting: string }) {
  const label = c.status === "matched" ? "Matched" : c.status === "one_sided" ? "One side only" : "Sides differ";
  return (
    <tr className="border-b border-line/70 align-top">
      <td className="whitespace-nowrap px-5 py-2 font-mono text-[12px] text-ink-2">
        {code(c.side.entityId)} {c.side.accountCode} ↔ {code(c.counterparty.entityId)} {c.counterparty.accountCode}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-ink-2">{periodLabel(c.period)}</td>
      <td className="px-3 py-2 text-right">
        <Side side={c.side} code={code(c.side.entityId)} name={name(c.side.entityId, c.side.accountCode)} reporting={reporting} />
      </td>
      <td className="px-3 py-2 text-right">
        <Side side={c.counterparty} code={code(c.counterparty.entityId)} name={name(c.counterparty.entityId, c.counterparty.accountCode)} reporting={reporting} />
      </td>
      <td className="px-3 py-2 text-right">{formatCurrency(c.eliminated)}</td>
      <td className={`px-3 py-2 text-right ${c.status === "matched" ? "text-ink-3" : "font-medium text-ink"}`}>{formatCurrency(Math.abs(c.difference))}</td>
      <td className="px-5 py-2">
        <StatusPill tone={c.status === "matched" ? "neutral" : "warn"}>{label}</StatusPill>
      </td>
    </tr>
  );
}
