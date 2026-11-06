import Link from "next/link";
import { can, getDb, getGroup, listMappings } from "@vantiq/db";
import { periodLabel } from "@vantiq/domain";
import { redirect } from "next/navigation";
import { addEntityAction, addPairAction, importRatesAction, removeEntityAction, removePairAction, removeRateAction, saveRateAction, updateEntityAction } from "@/app/actions/entities";
import { SubmitButton } from "@/components/AuthForm";
import { SettingsTabs } from "@/components/SettingsTabs";
import { Card, PageHeader, StatusPill } from "@/components/ui";
import { getWorkspace } from "@/lib/data";
import { one, type SearchParams } from "@/lib/view";

export const metadata = { title: "Entities · Settings · Vantiq Finance" };

const input = "h-9 rounded-md border border-line-strong bg-surface px-3 text-[14px] text-ink";
const label = "flex flex-col gap-1 text-[13px] text-ink-2";

/**
 * Settings → Entities (design.md 17): the group's entities, monthly FX rates
 * and intercompany pairs. Ledger, budget and cash files name an entity in an
 * Entity column; rows without one belong to the parent.
 */
export default async function EntitySettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  if (ws.mode === "demo") redirect("/entities");
  if (!can.manageEntities(ws.role)) redirect("/settings");
  const db = getDb();
  const [group, accounts] = await Promise.all([getGroup(db, ws.companyId!), listMappings(db, ws.companyId!)]);
  const error = one(sp, "error");
  const at = one(sp, "at") ?? "";
  const saved = one(sp, "saved");
  const subsidiaries = group.entities.filter((e) => !e.parent);
  const currencies = [...new Set(subsidiaries.map((e) => e.currency).filter((c) => c !== group.reportingCurrency))];
  const months = [...new Set(group.rates.map((r) => r.period))].sort().reverse();
  const rateOf = (period: string, currency: string) => group.rates.find((r) => r.period === period && r.currency === currency);
  const code = (id: string) => group.entities.find((e) => e.id === id)?.code ?? "";
  const accountName = new Map(accounts.map((a) => [a.code, a.name]));
  const Notice = ({ anchor }: { anchor: string }) =>
    error && at === anchor ? (
      <p role="alert" className="mx-5 mt-3 rounded-md bg-bad/10 px-3 py-2 text-[13px] text-bad">
        {error}
      </p>
    ) : saved === anchor ? (
      <p role="status" className="mx-5 mt-3 rounded-md bg-good/10 px-3 py-2 text-[13px] text-good">
        Saved.
      </p>
    ) : null;

  return (
    <>
      <PageHeader title="Settings" subtitle={ws.companyName} />
      <SettingsTabs role={ws.role} active="entities" />

      <Card className="overflow-hidden">
        <div id="entities" className="scroll-mt-20 border-b border-line px-5 py-3">
          <h2 className="text-[15px] font-semibold text-ink">Entities</h2>
          <p className="text-[12px] text-ink-3">
            {group.entities.length
              ? `The group reports in ${group.reportingCurrency}. Files name the entity in an Entity column, by code; rows with no entity belong to the parent.`
              : `${ws.companyName} is one entity. Add a subsidiary to report a group: the company becomes the parent, and everything already in Vantiq stays with it.`}
          </p>
        </div>
        <Notice anchor="entities" />
        {group.entities.length > 0 && (
          <ul className="divide-y divide-line">
            {group.entities.map((e) => (
              <li key={e.id} className="flex flex-wrap items-end gap-3 px-5 py-3">
                <form action={updateEntityAction} className="flex flex-1 flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={e.id} />
                  <label className={label}>
                    Code
                    <input name="code" defaultValue={e.code} required maxLength={30} className={`${input} w-32 font-mono`} aria-label={`Code for ${e.name}`} />
                  </label>
                  <label className={`${label} min-w-[220px] flex-1`}>
                    Legal name
                    <input name="name" defaultValue={e.name} required maxLength={120} className={input} aria-label={`Legal name for ${e.code}`} />
                  </label>
                  <span className="flex h-9 items-center gap-2 text-[13px] text-ink-2">
                    Books in {e.currency}
                    {e.parent && <StatusPill tone="accent">Parent</StatusPill>}
                  </span>
                  <SubmitButton label="Save" pendingLabel="Saving…" className="!bg-surface border border-line-strong !text-ink hover:!bg-subtle" />
                </form>
                {!e.parent && (
                  <form action={removeEntityAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <button type="submit" className="h-9 rounded-md px-3 text-[13px] text-ink-2 hover:bg-subtle hover:text-ink">
                      Remove
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <form action={addEntityAction} className="flex flex-wrap items-end gap-2 border-t border-line bg-subtle/50 px-5 py-4">
          <label className={label}>
            Code
            <input name="code" required maxLength={30} placeholder="HLX-UK" className={`${input} w-32 font-mono`} />
          </label>
          <label className={`${label} min-w-[220px] flex-1`}>
            Legal name
            <input name="name" required maxLength={120} placeholder="Helixa Therapeutics Ltd" className={input} />
          </label>
          <label className={label}>
            Currency
            <input name="currency" required maxLength={3} placeholder="GBP" className={`${input} w-24 uppercase`} />
          </label>
          <SubmitButton label="Add subsidiary" pendingLabel="Adding…" />
        </form>
      </Card>

      {group.entities.length > 0 && (
        <>
          <Card className="mt-4 overflow-hidden">
            <div id="rates" className="scroll-mt-20 border-b border-line px-5 py-3">
              <h2 className="text-[15px] font-semibold text-ink">Monthly rates</h2>
              <p className="text-[12px] text-ink-3">
                {group.reportingCurrency} per one unit of each currency. The average rate translates income and costs, the closing rate translates month-end cash. A month with no rate uses the nearest earlier month&apos;s, and the screens say so.
              </p>
            </div>
            <Notice anchor="rates" />
            {currencies.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-ink-3">Every entity keeps its books in {group.reportingCurrency}, so no rates are needed.</p>
            ) : (
              <>
                {months.length > 0 && (
                  <div className="max-h-[360px] overflow-auto">
                    <table className="num w-full text-[13px]">
                      <thead className="sticky top-0 bg-subtle text-[12px] text-ink-3">
                        <tr>
                          <th className="px-5 py-2 text-left font-medium">Month</th>
                          {currencies.map((c) => (
                            <th key={c} className="px-3 py-2 text-right font-medium">
                              {c} average / closing
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {months.map((m) => (
                          <tr key={m} className="border-b border-line/70">
                            <td className="px-5 py-2 text-ink-2">{periodLabel(m)}</td>
                            {currencies.map((c) => {
                              const r = rateOf(m, c);
                              return (
                                <td key={c} className="px-3 py-2 text-right">
                                  {r ? (
                                    <form action={removeRateAction} className="inline-flex items-center gap-2">
                                      <span>
                                        {r.average} / {r.closing}
                                      </span>
                                      <input type="hidden" name="period" value={m} />
                                      <input type="hidden" name="currency" value={c} />
                                      <button type="submit" className="text-[12px] text-ink-3 hover:text-ink" aria-label={`Remove the ${c} rate for ${periodLabel(m)}`}>
                                        ×
                                      </button>
                                    </form>
                                  ) : (
                                    <span className="text-ink-3">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 border-t border-line bg-subtle/50 px-5 py-4 xl:grid-cols-2">
                  <form action={saveRateAction} className="flex flex-wrap items-end gap-2">
                    <label className={label}>
                      Month
                      <input name="period" type="month" required className={`${input} w-40`} />
                    </label>
                    <label className={label}>
                      Currency
                      <select name="currency" className={`${input} w-24`}>
                        {currencies.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label className={label}>
                      Average
                      <input name="average" required inputMode="decimal" placeholder="1.2734" className={`${input} w-28`} />
                    </label>
                    <label className={label}>
                      Closing
                      <input name="closing" required inputMode="decimal" placeholder="1.2811" className={`${input} w-28`} />
                    </label>
                    <SubmitButton label="Save rate" pendingLabel="Saving…" />
                  </form>
                  <form action={importRatesAction} className="flex flex-col gap-2">
                    <label className={label}>
                      Or paste rows from a spreadsheet: month, currency, average, closing
                      <textarea name="rows" rows={3} placeholder={"2026-08\tGBP\t1.2690\t1.2655\n2026-09\tGBP\t1.2817\t1.2902"} className="rounded-md border border-line-strong bg-surface px-3 py-2 font-mono text-[12px] text-ink" />
                    </label>
                    <SubmitButton label="Save pasted rates" pendingLabel="Saving…" className="self-start !bg-surface border border-line-strong !text-ink hover:!bg-subtle" />
                  </form>
                </div>
              </>
            )}
          </Card>

          <Card className="mt-4 overflow-hidden">
            <div id="pairs" className="scroll-mt-20 border-b border-line px-5 py-3">
              <h2 className="text-[15px] font-semibold text-ink">Intercompany pairs</h2>
              <p className="text-[12px] text-ink-3">
                Pair an account in one entity with the account that mirrors it in another, such as a subsidiary&apos;s service income and the parent&apos;s service cost. Each month the amount both sides agree on is eliminated from the group; any difference is flagged on Entities.
              </p>
            </div>
            <Notice anchor="pairs" />
            {group.pairs.length > 0 && (
              <ul className="divide-y divide-line text-[13px]">
                {group.pairs.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="text-ink">
                      <span className="font-mono text-[12px]">{code(p.entityId)}</span> {p.accountCode} {accountName.get(p.accountCode) ?? ""}
                      <span className="mx-2 text-ink-3">↔</span>
                      <span className="font-mono text-[12px]">{code(p.counterpartyEntityId)}</span> {p.counterpartyAccountCode} {accountName.get(p.counterpartyAccountCode) ?? ""}
                    </span>
                    <form action={removePairAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="rounded-md px-2 py-1 text-[12px] text-ink-2 hover:bg-subtle hover:text-ink">
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            {accounts.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-ink-3">
                Import a ledger first, so there are accounts to pair.{" "}
                <Link href="/import" className="font-medium text-accent hover:underline">
                  Import data →
                </Link>
              </p>
            ) : (
              <form action={addPairAction} className="flex flex-wrap items-end gap-2 border-t border-line bg-subtle/50 px-5 py-4">
                {(
                  [
                    ["entityId", "accountCode", "Entity", "Account"],
                    ["counterpartyEntityId", "counterpartyAccountCode", "Mirrored by entity", "Account"],
                  ] as const
                ).map(([ent, acct, entLabel, acctLabel], i) => (
                  <div key={ent} className="flex flex-wrap items-end gap-2">
                    {i === 1 && <span className="flex h-9 items-center px-1 text-ink-3">↔</span>}
                    <label className={label}>
                      {entLabel}
                      <select name={ent} defaultValue={group.entities[i]?.id} className={`${input} w-40`}>
                        {group.entities.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.code}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={label}>
                      {acctLabel}
                      <select name={acct} className={`${input} w-64`}>
                        {accounts.map((a) => (
                          <option key={a.accountId} value={a.code}>
                            {a.code} {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ))}
                <SubmitButton label="Add pair" pendingLabel="Adding…" />
              </form>
            )}
          </Card>
        </>
      )}
    </>
  );
}
