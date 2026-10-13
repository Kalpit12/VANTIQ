"use client";

import { useEffect, useState, useTransition } from "react";
import { formatCurrency } from "@vantiq/domain";
import type { ColumnMap, FieldSpec, ImportKind, ImportRecord } from "@vantiq/integrations";
import { commitAction, discardAction, previewAction } from "@/app/actions/data";
import { Card } from "./ui";

type Preview = Awaited<ReturnType<typeof previewAction>>;

/**
 * Step 2 of an import: confirm which column holds which field, see what the
 * rows turn into, and fix problems before anything is saved.
 */
export function ColumnMapper({
  importId,
  kind,
  fields,
  headers,
  sampleRows,
  initial,
}: {
  importId: string;
  kind: ImportKind;
  fields: FieldSpec[];
  headers: string[];
  sampleRows: string[][];
  initial: ColumnMap;
}) {
  const [map, setMap] = useState<ColumnMap>(() => Object.fromEntries(fields.map((f) => [f.key, initial[f.key] ?? null])));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, startCheck] = useTransition();
  const [saving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => startCheck(async () => setPreview(await previewAction(importId, map))), 150);
    return () => clearTimeout(t);
  }, [importId, map]);

  const ready = preview?.ok === true && preview.valid > 0;
  const usedBy = (col: number) => fields.find((f) => map[f.key] === col)?.label;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <Card className="p-5">
        <h2 className="mb-1 text-[15px] font-semibold text-ink">Which column holds what?</h2>
        <p className="mb-4 text-[12px] text-ink-3">Vantiq guessed from the column names. Change any that are wrong.</p>
        <div className="flex flex-col gap-3">
          {fields.map((f) => (
            <div key={f.key} className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-3">
              <label htmlFor={`col-${f.key}`} className="text-[13px] text-ink">
                {f.label}
                {f.required && <span className="text-bad"> *</span>}
                {f.hint && <span className="block text-[11px] leading-4 text-ink-3">{f.hint}</span>}
              </label>
              <select
                id={`col-${f.key}`}
                value={map[f.key] ?? ""}
                onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value === "" ? null : Number(e.target.value) }))}
                className="h-8 min-w-0 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink"
              >
                <option value="">Not in this file</option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                    {usedBy(i) && map[f.key] !== i ? ` (used for ${usedBy(i)})` : ""}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex min-w-0 flex-col gap-4">
        <Card className="p-5" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Check</h2>
              {!preview || checking ? (
                <p className="text-[13px] text-ink-3">Checking every row…</p>
              ) : preview.ok ? (
                <p className="text-[13px] text-ink-2">
                  <strong className="font-semibold text-ink">{preview.valid.toLocaleString("en-US")} rows ready to import.</strong>
                  {preview.errors.length > 0 && <span className="text-bad"> {preview.errors.length}{preview.errors.length >= 200 ? "+" : ""} with problems will be skipped.</span>}
                  {preview.skipped > 0 && ` ${preview.skipped} blank, zero or total lines ignored.`}
                </p>
              ) : (
                <p className="text-[13px] text-bad">{preview.error}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <form action={discardAction}>
                <input type="hidden" name="importId" value={importId} />
                <button type="submit" className="h-9 rounded-md border border-line-strong px-3 text-[13px] text-ink-2 hover:bg-subtle">
                  Discard
                </button>
              </form>
              <button
                type="button"
                disabled={!ready || checking || saving}
                onClick={() =>
                  startSave(async () => {
                    const res = await commitAction(importId, map);
                    if (res?.error) setSaveError(res.error);
                  })
                }
                className="h-9 rounded-md bg-accent px-4 text-[14px] font-medium text-accent-contrast hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Importing…" : ready ? `Import ${preview.valid.toLocaleString("en-US")} rows` : "Import"}
              </button>
            </div>
          </div>
          {saveError && (
            <p role="alert" className="mt-3 rounded-md bg-bad/10 px-3 py-2 text-[13px] text-bad">
              {saveError}
            </p>
          )}
          {preview?.ok && preview.errors.length > 0 && (
            <ul className="mt-3 max-h-40 overflow-auto rounded-md border border-line text-[12px]">
              {preview.errors.slice(0, 50).map((e) => (
                <li key={e.row} className="flex gap-3 border-b border-line/70 px-3 py-1.5 last:border-b-0">
                  <span className="num w-16 shrink-0 text-ink-3">Row {e.row + 1}</span>
                  <span className="text-ink">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
          {preview?.ok && preview.sample.length > 0 && <ResultSample kind={kind} rows={preview.sample} />}
        </Card>

        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-5 py-3 text-[13px] font-semibold text-ink">First rows of the file</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-subtle text-left text-ink-3">
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} className="whitespace-nowrap px-3 py-2 font-medium">
                      {h || `Column ${i + 1}`}
                      {usedBy(i) && <span className="ml-1 rounded bg-accent-subtle px-1 text-[11px] text-accent">{usedBy(i)}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleRows.map((r, ri) => (
                  <tr key={ri} className="border-b border-line/70">
                    {headers.map((_, i) => (
                      <td key={i} className="max-w-[220px] truncate whitespace-nowrap px-3 py-1.5 text-ink-2">
                        {r[i]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ResultSample({ kind, rows }: { kind: ImportKind; rows: ImportRecord[] }) {
  const cols: [string, (r: ImportRecord) => string, boolean?][] =
    kind === "ledger"
      ? [
          ["Date", (r) => ("date" in r ? r.date : "")],
          ["Account", (r) => ("accountCode" in r ? `${r.accountCode} ${r.accountName}`.trim() : "")],
          ["Vendor and memo", (r) => ("vendor" in r ? [r.vendor, r.memo].filter(Boolean).join(" · ") : "")],
          ["Debit (+) / credit (−)", (r) => ("amount" in r ? formatCurrency(r.amount) : ""), true],
        ]
      : kind === "budget"
        ? [
            ["Month", (r) => ("period" in r ? r.period : "")],
            ["Account", (r) => ("accountCode" in r ? `${r.accountCode} ${r.accountName}`.trim() : "")],
            ["Program", (r) => ("program" in r ? r.program || "—" : "")],
            ["Budget", (r) => ("amount" in r ? formatCurrency(r.amount) : ""), true],
          ]
        : [
            ["Month", (r) => ("period" in r ? r.period : "")],
            ["Closing cash", (r) => ("balance" in r ? formatCurrency(r.balance) : ""), true],
          ];
  return (
    <div className="mt-4">
      <p className="mb-1 text-[12px] font-medium text-ink-3">How Vantiq reads the first rows</p>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="num w-full text-[12px]">
          <thead className="bg-subtle text-left text-ink-3">
            <tr>
              {cols.map(([h, , right]) => (
                <th key={h} className={`whitespace-nowrap px-3 py-1.5 font-medium ${right ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.row} className="border-b border-line/70 last:border-b-0">
                {cols.map(([h, f, right]) => (
                  <td key={h} className={`max-w-[260px] truncate whitespace-nowrap px-3 py-1.5 text-ink ${right ? "text-right" : ""}`}>
                    {f(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
