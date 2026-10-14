import Link from "next/link";
import { can } from "@vantiq/db";
import { DRIVER_METHODS, formatAmount, formatCompactCurrency, periodLabel, trailingPeriods, type Category, type Driver, type Forecast } from "@vantiq/domain";
import { saveDriverAction, saveForecastMonthAction, saveScenarioChangesAction } from "@/app/actions/forecast";
import { SubmitButton } from "@/components/AuthForm";
import { ChartCard } from "@/components/ChartCard";
import { NoData } from "@/components/NoData";
import { ForecastChart } from "@/components/forecast/ForecastChart";
import { Card, PageHeader } from "@/components/ui";
import { getWorkspace } from "@/lib/data";
import { forecastsFor, scenariosFor } from "@/lib/forecast";
import { one, type SearchParams } from "@/lib/view";

export const metadata = { title: "Forecast · Vantiq Finance" };

const field = "h-9 rounded-md border border-line-strong bg-surface px-3 text-[14px] text-ink";
const label = "flex flex-col gap-1 text-[13px] font-medium text-ink";
const ACTUAL_COLUMNS = 3;
const pctText = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(Math.round(x * 1000) / 10)}%`;
const pctInput = (x: number) => String(Math.round(x * 1000) / 10);

function driverText(d: Driver) {
  if (d.method === "flat") return `Fixed ${formatCompactCurrency(d.amount ?? 0)}/mo`;
  if (d.method === "budget") return "Budget";
  return d.growth ? `Run rate ${pctText(d.growth)}/mo` : "Run rate";
}

export default async function ForecastPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  if (!ws.ledger.hasData()) return <NoData title="Forecast" canImport={ws.mode === "db" && can.importData(ws.role)} />;
  const ledger = ws.ledger;
  const scenarios = await scenariosFor(ws);
  const { all, current: f, summaries } = forecastsFor(ws, scenarios, one(sp, "scenario"));
  const s = f.scenario;
  const canEdit = ws.mode === "db" && can.manageForecast(ws.role);
  const error = one(sp, "ferr");
  const actualMonths = trailingPeriods(f.lastActual, ACTUAL_COLUMNS).filter((p) => p >= ledger.firstPeriod());
  const history = trailingPeriods(f.lastActual, 12).filter((p) => p >= ledger.firstPeriod());
  const burn = (x: Forecast) => ({ name: x.scenario.name, values: x.periods.map((p) => -x.netIncome(p)) });
  const rows: { c: Category; depth: number; leaf: boolean }[] = [];
  const walk = (cats: Category[], depth: number) => {
    for (const c of cats) {
      const kids = ledger.childrenOf(c.id);
      rows.push({ c, depth, leaf: kids.length === 0 });
      walk(kids, depth + 1);
    }
  };
  walk(ledger.childrenOf(null), 0);
  const leaves = rows.filter((r) => r.leaf);
  const nameOf = (id: string) => ledger.category(id).name;
  const ownDrivers = s.drivers.filter((d) => rows.some((r) => r.c.id === d.categoryId));
  const sum = summaries.find((x) => x.scenario.id === s.id)!;

  return (
    <>
      <PageHeader title="Forecast" subtitle={`${periodLabel(f.periods[0]!)} to ${periodLabel(f.periods.at(-1)!)}, from the books to ${periodLabel(f.lastActual)} · Scenario: ${s.name}`}>
        <nav aria-label="Scenario" className="flex rounded-md border border-line-strong bg-surface p-0.5">
          {scenarios.map((x) => (
            <Link
              key={x.id}
              href={`/forecast?scenario=${x.id}`}
              aria-current={x.id === s.id ? "page" : undefined}
              className={`rounded px-3 py-1.5 text-[13px] font-medium ${x.id === s.id ? "bg-accent text-accent-contrast" : "text-ink-2 hover:text-ink"}`}
            >
              {x.name}
            </Link>
          ))}
        </nav>
      </PageHeader>
      {error && (
        <p role="alert" className="mb-4 rounded-md bg-bad/10 px-3 py-2 text-[13px] text-bad">
          {error}
        </p>
      )}

      <ChartCard
        title={
          sum.zeroCash
            ? `Cash runs out in ${periodLabel(sum.zeroCash)} under ${s.name}`
            : `${formatCompactCurrency(-sum.netIncome)} net burn over the next 12 months under ${s.name}`
        }
        subtitle={`Net burn by month, USD · ${periodLabel(history[0]!)} to ${periodLabel(f.periods.at(-1)!)}`}
        table={{
          columns: ["Month", "Actual", ...all.map((x) => x.scenario.name)],
          rows: [
            ...history.map((p) => [periodLabel(p), formatCompactCurrency(-ledger.netIncome([p])), ...all.map(() => "")]),
            ...f.periods.map((p) => [periodLabel(p), "", ...all.map((x) => formatCompactCurrency(-x.netIncome(p)))]),
          ],
        }}
      >
        <ForecastChart actual={history.map((p) => ({ p, v: -ledger.netIncome([p]) }))} forecast={f.periods} picked={burn(f)} all={all.map(burn)} />
      </ChartCard>

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
          <h2 className="text-[15px] font-semibold text-ink">Compare scenarios</h2>
          <span className="text-[12px] text-ink-3">Next 12 months. Actuals are the same in every scenario.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[640px] text-[13px]">
            <thead className="bg-subtle text-[12px] text-ink-3">
              <tr>
                <th className="px-5 py-2 text-left font-medium">Scenario</th>
                <th className="px-3 py-2 text-right font-medium">Change to revenue / costs</th>
                <th className="px-3 py-2 text-right font-medium">Revenue</th>
                <th className="px-3 py-2 text-right font-medium">Costs</th>
                <th className="px-3 py-2 text-right font-medium">Net income</th>
                <th className="px-5 py-2 text-right font-medium">Cash at {periodLabel(f.periods.at(-1)!)}</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((x) => (
                <tr key={x.scenario.id} className={`border-t border-line/70 ${x.scenario.id === s.id ? "bg-accent-subtle/50" : ""}`}>
                  <td className="px-5 py-2 font-medium text-ink">
                    <Link href={`/forecast?scenario=${x.scenario.id}`} className="hover:underline">
                      {x.scenario.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right text-ink-2">
                    {pctText(x.scenario.revenueChange)} / {pctText(x.scenario.costChange)}
                  </td>
                  <td className="px-3 py-2 text-right">{formatCompactCurrency(x.revenue)}</td>
                  <td className="px-3 py-2 text-right">{formatCompactCurrency(x.costs)}</td>
                  <td className="px-3 py-2 text-right">{formatCompactCurrency(x.netIncome)}</td>
                  <td className={`px-5 py-2 text-right ${x.zeroCash ? "text-warn" : ""}`}>
                    {x.endingCash === null ? "No cash data" : formatCompactCurrency(x.endingCash)}
                    {x.zeroCash && <span className="block text-[11px]">Below zero from {periodLabel(x.zeroCash)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
          <h2 className="text-[15px] font-semibold text-ink">{s.name} forecast, USD thousands</h2>
          <span className="text-[12px] text-ink-3">Hover a number to see how it was worked out. Marked numbers were set by hand.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[1400px] text-[12px]" aria-label={`${s.name} forecast by month`}>
            <thead className="bg-subtle text-[11px] text-ink-3">
              <tr>
                <th className="sticky left-0 z-10 bg-subtle px-5 py-2 text-left font-medium">Line</th>
                <th className="px-3 py-2 text-left font-medium">Driver</th>
                {actualMonths.map((p) => (
                  <th key={p} className="bg-line/40 px-2 py-2 text-right font-medium">
                    {periodLabel(p, true)}
                    <span className="block font-normal">Actual</span>
                  </th>
                ))}
                {f.periods.map((p, i) => (
                  <th key={p} className={`px-2 py-2 text-right font-medium ${i === 0 ? "border-l-2 border-line-strong" : ""}`}>
                    {periodLabel(p, true)}
                    <span className="block font-normal">{p.slice(0, 4)}</span>
                  </th>
                ))}
                <th className="border-l border-line px-3 py-2 text-right font-medium">12 months</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, depth, leaf }) => {
                const strong = depth === 0;
                const d = f.driverFor(c.id);
                return (
                  <tr key={c.id} className={`border-t border-line/70 ${strong ? "bg-subtle/60" : ""}`}>
                    <td className={`sticky left-0 z-10 bg-surface py-1.5 pr-3 ${strong ? "font-semibold text-ink" : "text-ink-2"}`} style={{ paddingLeft: 20 + depth * 14 }}>
                      {c.name}
                    </td>
                    <td className={`px-3 py-1.5 ${d.from === c.id ? "text-ink" : "text-ink-3"}`}>{d.from === c.id || leaf ? driverText(d.driver) : ""}</td>
                    {actualMonths.map((p) => (
                      <td key={p} className="bg-line/20 px-2 py-1.5 text-right text-ink-2">
                        {formatAmount(ledger.actual({ periods: [p], categoryIds: [c.id] }), { scale: "k", parens: true })}
                      </td>
                    ))}
                    {f.periods.map((p, i) => {
                      const e = leaf ? f.explain(c.id, p) : null;
                      return (
                        <td key={p} title={e ? e.steps.join("\n") : undefined} className={`px-2 py-1.5 text-right ${strong ? "font-semibold" : ""} ${i === 0 ? "border-l-2 border-line-strong" : ""}`}>
                          {e?.overridden && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" aria-label="Set by hand" />}
                          {formatAmount(f.amount(c.id, p), { scale: "k", parens: true })}
                        </td>
                      );
                    })}
                    <td className={`border-l border-line px-3 py-1.5 text-right ${strong ? "font-semibold" : ""}`}>{formatAmount(f.total(c.id), { scale: "k", parens: true })}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-line-strong bg-subtle/60 font-semibold">
                <td className="sticky left-0 z-10 bg-surface px-5 py-2 text-ink">Net income (loss)</td>
                <td />
                {actualMonths.map((p) => (
                  <td key={p} className="bg-line/20 px-2 py-2 text-right">
                    {formatAmount(ledger.netIncome([p]), { scale: "k", parens: true })}
                  </td>
                ))}
                {f.periods.map((p, i) => (
                  <td key={p} className={`px-2 py-2 text-right ${i === 0 ? "border-l-2 border-line-strong" : ""}`}>
                    {formatAmount(f.netIncome(p), { scale: "k", parens: true })}
                  </td>
                ))}
                <td className="border-l border-line px-3 py-2 text-right">{formatAmount(sum.netIncome, { scale: "k", parens: true })}</td>
              </tr>
              <tr className="border-t border-line/70">
                <td className="sticky left-0 z-10 bg-surface px-5 py-2 text-ink-2">Month-end cash</td>
                <td />
                {actualMonths.map((p) => {
                  const v = ledger.cashAt(p);
                  return (
                    <td key={p} className="bg-line/20 px-2 py-2 text-right text-ink-2">
                      {v === null ? "–" : formatAmount(v, { scale: "k", parens: true })}
                    </td>
                  );
                })}
                {f.periods.map((p, i) => {
                  const v = f.cash(p);
                  return (
                    <td key={p} className={`px-2 py-2 text-right ${v !== null && v < 0 ? "text-warn" : "text-ink-2"} ${i === 0 ? "border-l-2 border-line-strong" : ""}`}>
                      {v === null ? "–" : formatAmount(v, { scale: "k", parens: true })}
                    </td>
                  );
                })}
                <td className="border-l border-line" />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-2.5 text-[12px] text-ink-3">
          Costs follow their average over the last {ACTUAL_COLUMNS} months unless a driver says otherwise; revenue follows the budget, or its run rate in months with no budget. Cash moves by net income each month, so it assumes bills are paid in the month they are booked.
        </p>
      </Card>

      {canEdit ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <Card className="p-5" >
            <h2 id="scenario-settings" className="text-[15px] font-semibold text-ink">
              {s.name}: revenue and costs
            </h2>
            <p className="mt-1 text-[13px] text-ink-2">Moves every revenue or cost line after its driver. Use it for the broad case; use drivers for single lines.</p>
            <form key={s.id} action={saveScenarioChangesAction} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="scenario" value={s.id} />
              <label className={`${label} w-[130px]`}>
                Revenue %
                <input name="revenueChange" inputMode="decimal" defaultValue={pctInput(s.revenueChange)} className={`${field} num`} />
              </label>
              <label className={`${label} w-[130px]`}>
                Costs %
                <input name="costChange" inputMode="decimal" defaultValue={pctInput(s.costChange)} className={`${field} num`} />
              </label>
              <SubmitButton label="Save" pendingLabel="Saving…" />
            </form>
          </Card>

          <Card className="p-5">
            <h2 id="drivers" className="text-[15px] font-semibold text-ink">
              Drivers in {s.name}
            </h2>
            <p className="mt-1 text-[13px] text-ink-2">A driver on a subtotal applies to every line under it that has none of its own.</p>
            <form action={saveDriverAction} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="scenario" value={s.id} />
              <label className={label}>
                Line
                <select name="categoryId" required className={field}>
                  {rows.map(({ c, depth }) => (
                    <option key={c.id} value={c.id}>
                      {"  ".repeat(depth)}
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-3">
                <label className={`${label} flex-1`}>
                  Method
                  <select name="method" className={field} defaultValue="run_rate">
                    {DRIVER_METHODS.map((m) => (
                      <option key={m.method} value={m.method}>
                        {m.label}
                      </option>
                    ))}
                    <option value="inherit">Remove (use the line above)</option>
                  </select>
                </label>
                <label className={`${label} w-[110px]`}>
                  Growth %/mo
                  <input name="growth" inputMode="decimal" defaultValue="0" className={`${field} num`} />
                </label>
                <label className={`${label} w-[140px]`}>
                  Fixed USD/mo
                  <input name="amount" inputMode="decimal" placeholder="Fixed only" className={`${field} num`} />
                </label>
              </div>
              <SubmitButton label="Set driver" pendingLabel="Saving…" />
            </form>
            {ownDrivers.length > 0 && (
              <ul className="mt-3 divide-y divide-line border-t border-line text-[13px]">
                {ownDrivers.map((d) => (
                  <li key={d.categoryId} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      <span className="text-ink">{nameOf(d.categoryId)}</span> <span className="text-ink-3">· {driverText(d)}</span>
                    </span>
                    <form action={saveDriverAction}>
                      <input type="hidden" name="scenario" value={s.id} />
                      <input type="hidden" name="categoryId" value={d.categoryId} />
                      <input type="hidden" name="method" value="inherit" />
                      <button className="text-[12px] text-ink-2 underline hover:text-ink" aria-label={`Remove the driver on ${nameOf(d.categoryId)}`}>
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 id="months" className="text-[15px] font-semibold text-ink">
              Set a month by hand
            </h2>
            <p className="mt-1 text-[13px] text-ink-2">For a known one-off, such as a milestone payment or a site close-out. Only in {s.name}.</p>
            <form action={saveForecastMonthAction} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="scenario" value={s.id} />
              <div className="flex flex-wrap gap-3">
                <label className={`${label} flex-[2]`}>
                  Line
                  <select name="categoryId" required className={field}>
                    {leaves.map(({ c }) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`${label} flex-1`}>
                  Month
                  <select name="period" required className={field}>
                    {f.periods.map((p) => (
                      <option key={p} value={p}>
                        {periodLabel(p)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                <label className={`${label} w-[140px]`}>
                  Amount (USD)
                  <input name="amount" inputMode="decimal" required className={`${field} num`} />
                </label>
                <label className={`${label} flex-1`}>
                  Why
                  <input name="note" maxLength={200} placeholder="Phase 2 start milestone" className={field} />
                </label>
              </div>
              <SubmitButton label="Set month" pendingLabel="Saving…" />
            </form>
            {s.overrides.length > 0 && (
              <ul className="mt-3 divide-y divide-line border-t border-line text-[13px]">
                {s.overrides.map((o) => (
                  <li key={`${o.period}${o.categoryId}`} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      <span className="text-ink">
                        {nameOf(o.categoryId)}, {periodLabel(o.period)}
                      </span>{" "}
                      <span className="num text-ink-3">· {formatCompactCurrency(o.amount)}</span>
                      {o.note && <span className="block text-[12px] text-ink-3">{o.note}</span>}
                    </span>
                    <form action={saveForecastMonthAction}>
                      <input type="hidden" name="scenario" value={s.id} />
                      <input type="hidden" name="categoryId" value={o.categoryId} />
                      <input type="hidden" name="period" value={o.period} />
                      <input type="hidden" name="clear" value="1" />
                      <button className="text-[12px] text-ink-2 underline hover:text-ink" aria-label={`Clear ${nameOf(o.categoryId)} in ${periodLabel(o.period)}`}>
                        Clear
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-ink-2">
          {ws.mode === "demo" ? "This sample forecast uses the standard drivers. Sign up to set your own." : "Your role can view the forecast. Ask an admin or someone in Finance to change it."}
        </p>
      )}
    </>
  );
}
