"use client";

import { useActionState, useState } from "react";
import { intacctConnectAction } from "@/app/actions/connections";
import { SubmitButton } from "./AuthForm";

const input = "h-9 rounded-md border border-line-strong bg-surface px-3 text-[14px] text-ink";

/** Sage Intacct connects with a Web Services user the customer creates; the form opens in place on its card. */
export function IntacctConnect() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(intacctConnectAction, {});
  const v = state.values ?? {};
  if (!open && !state.error)
    return (
      <div className="mt-auto pt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Connect Sage Intacct"
          className="h-8 w-full rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink hover:bg-subtle"
        >
          Connect
        </button>
      </div>
    );
  const field = (name: string, label: string, opts: { type?: string; required?: boolean; hint?: string; value?: string } = {}) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`intacct-${name}`} className="text-[12px] font-medium text-ink">
        {label}
      </label>
      <input id={`intacct-${name}`} name={name} type={opts.type ?? "text"} required={opts.required ?? true} defaultValue={opts.value} autoComplete="off" className={input} />
      {opts.hint && <p className="text-[11px] text-ink-3">{opts.hint}</p>}
    </div>
  );
  return (
    <form action={action} className="mt-3 flex flex-col gap-2.5 border-t border-line pt-3">
      {field("companyId", "Company ID", { value: v.companyId })}
      {field("userId", "Web Services user ID", { value: v.userId, hint: "A read-only user in Intacct with the General Ledger permission." })}
      {field("password", "Password", { type: "password" })}
      {field("entityId", "Entity ID (optional)", { required: false, value: v.entityId, hint: "Only for multi-entity companies. Blank reads the top level." })}
      <div className="flex flex-col gap-1">
        <label htmlFor="intacct-programDimension" className="text-[12px] font-medium text-ink">
          Programs come from
        </label>
        <select id="intacct-programDimension" name="programDimension" defaultValue={v.programDimension ?? "project"} className={input}>
          <option value="project">Projects</option>
          <option value="class">Classes</option>
        </select>
      </div>
      {state.error && (
        <p role="alert" className="rounded-md bg-bad/10 px-3 py-2 text-[12px] text-bad">
          {state.error}
        </p>
      )}
      <SubmitButton label="Connect" pendingLabel="Reading 24 months…" />
    </form>
  );
}
