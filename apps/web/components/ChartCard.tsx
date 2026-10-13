"use client";

import { useState } from "react";

export interface TableData {
  columns: string[];
  /** First cell is the row label; the rest are pre-formatted values. */
  rows: string[][];
}

/**
 * Wrapper for every chart (design.md 7.3–7.4): a finding-style title, a quiet
 * unit/period subtitle, and a "view as table" toggle that is also the
 * screen-reader view of the chart.
 */
export function ChartCard({
  title,
  subtitle,
  table,
  legend,
  children,
  className = "",
}: {
  title: string;
  subtitle: string;
  table: TableData;
  legend?: { label: string; color: string; dashed?: boolean }[];
  children: React.ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`flex flex-col rounded-[10px] border border-line bg-surface p-5 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-[22px] text-ink">{title}</h2>
          <p className="text-[12px] text-ink-3">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="shrink-0 rounded-md border border-line px-2 py-1 text-[12px] text-ink-2 hover:bg-subtle"
        >
          {asTable ? "View chart" : "View as table"}
        </button>
      </div>
      {legend && legend.length > 1 && !asTable && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2" aria-label="Legend">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <svg width="16" height="8" aria-hidden>
                <line x1="0" y1="4" x2="16" y2="4" stroke={l.color} strokeWidth="2.5" strokeDasharray={l.dashed ? "4 3" : undefined} />
              </svg>
              {l.label}
            </li>
          ))}
        </ul>
      )}
      {asTable ? (
        <div className="max-h-80 overflow-auto">
          <table className="num w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-ink-3">
                {table.columns.map((c, i) => (
                  <th key={c} className={`py-1.5 font-medium ${i > 0 ? "text-right" : ""}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => (
                <tr key={r[0]} className="border-b border-line/60">
                  {r.map((cell, i) => (
                    <td key={i} className={`py-1.5 ${i > 0 ? "text-right" : "text-ink-2"}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="min-h-0 flex-1">{children}</div>
      )}
    </section>
  );
}
