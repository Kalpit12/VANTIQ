"use client";

import { useMemo, useState, useTransition } from "react";
import { formatCompactCurrency } from "@vantiq/domain";
import type { MappingRow } from "@vantiq/db";
import { confirmAllAction, saveMappingsAction } from "@/app/actions/data";
import { Card, StatusPill } from "./ui";

const EXCLUDE = "__exclude__";
type Group = { label: string; options: { id: string; name: string }[] };
type Filter = "review" | "all";

export function MappingTable({ rows, groups, canEdit }: { rows: MappingRow[]; groups: Group[]; canEdit: boolean }) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>(() => (rows.some((r) => r.status !== "confirmed") ? "review" : "all"));
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const valueOf = (r: MappingRow) => edits[r.accountId] ?? (r.excluded ? EXCLUDE : (r.categoryId ?? ""));
  const counts = {
    unmapped: rows.filter((r) => r.status === "unmapped").length,
    suggested: rows.filter((r) => r.status === "suggested").length,
  };
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) => (filter === "all" || r.status !== "confirmed" || r.accountId in edits) && (!q || `${r.code} ${r.name}`.toLowerCase().includes(q)),
    );
  }, [rows, filter, query, edits]);
  const changed = Object.entries(edits).filter(([id, v]) => {
    const r = rows.find((x) => x.accountId === id)!;
    return v !== "" && (v !== (r.excluded ? EXCLUDE : (r.categoryId ?? "")) || r.status !== "confirmed");
  });

  const save = () =>
    start(async () => {
      const res = await saveMappingsAction(changed.map(([accountId, v]) => ({ accountId, categoryId: v === EXCLUDE ? null : v, excluded: v === EXCLUDE })));
      if ("error" in res && res.error) setNotice({ tone: "bad", text: res.error });
      else {
        setNotice({ tone: "good", text: `Saved ${changed.length} account${changed.length === 1 ? "" : "s"}. Every screen now uses the new mapping.` });
        setEdits({});
      }
    });

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-center gap-2" role="group" aria-label="Show">
          {(["review", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`h-8 rounded-md px-3 text-[13px] ${filter === f ? "bg-accent-subtle font-medium text-ink" : "text-ink-2 hover:bg-subtle"}`}
            >
              {f === "review" ? `Needs review (${counts.unmapped + counts.suggested})` : `All accounts (${rows.length})`}
            </button>
          ))}
          <label htmlFor="mapping-search" className="sr-only">
            Search accounts
          </label>
          <input
            id="mapping-search"
            type="search"
            placeholder="Search accounts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ml-2 h-8 w-48 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink"
          />
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            {counts.suggested > 0 && changed.length === 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => {
                  await confirmAllAction();
                  setNotice({ tone: "good", text: `Confirmed ${counts.suggested} suggested mapping${counts.suggested === 1 ? "" : "s"}.` });
                })}
                className="h-8 rounded-md border border-line-strong px-3 text-[13px] text-ink hover:bg-subtle disabled:opacity-50"
              >
                Confirm all {counts.suggested} suggestions
              </button>
            )}
            <button
              type="button"
              disabled={pending || changed.length === 0}
              onClick={save}
              className="h-8 rounded-md bg-accent px-3 text-[13px] font-medium text-accent-contrast hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Saving…" : changed.length ? `Save ${changed.length} change${changed.length === 1 ? "" : "s"}` : "Save"}
            </button>
          </div>
        )}
      </div>
      {notice && (
        <p role="status" className={`border-b border-line px-5 py-2 text-[13px] ${notice.tone === "good" ? "bg-good/10 text-ink" : "bg-bad/10 text-bad"}`}>
          {notice.text}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="num w-full min-w-[760px] text-[13px]">
          <thead className="bg-subtle text-left text-[12px] text-ink-3">
            <tr>
              <th className="px-5 py-2 font-medium">Account</th>
              <th className="py-2 pr-4 text-right font-medium">Transactions</th>
              <th className="py-2 pr-4 text-right font-medium">Net activity</th>
              <th className="py-2 pr-4 font-medium">Vantiq category</th>
              <th className="px-5 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const v = valueOf(r);
              const edited = r.accountId in edits;
              return (
                <tr key={r.accountId} className={`border-b border-line/70 ${edited ? "bg-accent-subtle/50" : ""}`}>
                  <td className="px-5 py-2">
                    <span className="font-mono text-[12px] text-ink-2">{r.code}</span> <span className="text-ink">{r.name || "No name in file"}</span>
                  </td>
                  <td className="py-2 pr-4 text-right text-ink-2">{r.transactions.toLocaleString("en-US")}</td>
                  <td className="py-2 pr-4 text-right text-ink-2">{formatCompactCurrency(r.total)}</td>
                  <td className="py-2 pr-4">
                    <label htmlFor={`map-${r.accountId}`} className="sr-only">
                      Category for {r.code} {r.name}
                    </label>
                    <select
                      id={`map-${r.accountId}`}
                      value={v}
                      disabled={!canEdit}
                      onChange={(e) => setEdits((m) => ({ ...m, [r.accountId]: e.target.value }))}
                      className={`h-8 w-full max-w-[280px] rounded-md border bg-surface px-2 text-[13px] text-ink ${v === "" ? "border-warn" : "border-line-strong"}`}
                    >
                      <option value="">Choose a category…</option>
                      {groups.map((g) => (
                        <optgroup key={g.label} label={g.label}>
                          {g.options.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      <optgroup label="Other">
                        <option value={EXCLUDE}>Not in the P&amp;L (balance sheet)</option>
                      </optgroup>
                    </select>
                  </td>
                  <td className="px-5 py-2">
                    {edited ? (
                      <StatusPill tone="info">Unsaved</StatusPill>
                    ) : r.status === "confirmed" ? (
                      <StatusPill tone="accent">Confirmed</StatusPill>
                    ) : r.status === "suggested" ? (
                      <span title={r.reason}>
                        <StatusPill tone="neutral">Suggested</StatusPill>
                        <span className="ml-2 text-[12px] text-ink-3">{r.reason}</span>
                      </span>
                    ) : (
                      <StatusPill tone="warn">Not mapped</StatusPill>
                    )}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-[13px] text-ink-3">
                  {filter === "review" ? "Every account is mapped and confirmed." : "No accounts match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
