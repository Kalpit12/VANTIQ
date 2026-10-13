"use client";

import { useActionState, useState } from "react";
import { uploadAction } from "@/app/actions/data";
import { SubmitButton } from "./AuthForm";

const KINDS = [
  { value: "ledger", title: "General ledger", text: "Transaction detail: date, account, amount. Debit and credit columns work too." },
  { value: "budget", title: "Budget", text: "Monthly budget by account, optionally by program. Replaces the months it covers." },
  { value: "cash", title: "Cash balances", text: "Month-end cash. Powers the cash chart and runway." },
] as const;

export function UploadForm() {
  const [state, action] = useActionState(uploadAction, {});
  const [kind, setKind] = useState<string>("ledger");
  return (
    <form action={action} className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink">What's in the file?</legend>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {KINDS.map((k) => (
            <label
              key={k.value}
              className={`flex cursor-pointer flex-col gap-1 rounded-[10px] border p-4 transition-colors ${kind === k.value ? "border-accent bg-accent-subtle" : "border-line hover:bg-subtle"}`}
            >
              <span className="flex items-center gap-2">
                <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="accent-[var(--accent)]" />
                <span className="text-[14px] font-medium text-ink">{k.title}</span>
              </span>
              <span className="text-[12px] text-ink-2">{k.text}</span>
              <a href={`/import-sample/${k.value}`} className="mt-1 text-[12px] font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                Example file
              </a>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor="file" className="text-[13px] font-medium text-ink">
          File
        </label>
        <input
          id="file"
          name="file"
          type="file"
          required
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="text-[13px] text-ink-2 file:mr-3 file:h-9 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:text-[13px] file:font-medium file:text-ink hover:file:bg-subtle"
        />
        <p className="text-[12px] text-ink-3">CSV or Excel (.xlsx), up to 4 MB. The first row must hold the column names.</p>
      </div>
      {state.error && (
        <p role="alert" className="rounded-md bg-bad/10 px-3 py-2 text-[13px] text-bad">
          {state.error}
        </p>
      )}
      <div>
        <SubmitButton label="Upload and check columns" pendingLabel="Reading file…" />
      </div>
    </form>
  );
}
