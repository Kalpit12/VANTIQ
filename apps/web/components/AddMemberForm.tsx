"use client";

import { useActionState } from "react";
import { addMemberAction } from "@/app/actions/data";
import { SubmitButton } from "./AuthForm";

export function AddMemberForm() {
  const [state, action] = useActionState(addMemberAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {[
        { name: "name", label: "Name", type: "text" },
        { name: "email", label: "Work email", type: "email" },
      ].map((f) => (
        <div key={f.name} className="flex flex-col gap-1">
          <label htmlFor={`member-${f.name}`} className="text-[13px] font-medium text-ink">
            {f.label}
          </label>
          <input id={`member-${f.name}`} name={f.name} type={f.type} required className="h-9 rounded-md border border-line-strong bg-surface px-3 text-[14px] text-ink" />
        </div>
      ))}
      <div className="flex flex-col gap-1">
        <label htmlFor="member-role" className="text-[13px] font-medium text-ink">
          Role
        </label>
        <select id="member-role" name="role" defaultValue="finance" className="h-9 rounded-md border border-line-strong bg-surface px-2 text-[14px] text-ink">
          <option value="admin">Admin</option>
          <option value="finance">Finance</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>
      {state.error && (
        <p role="alert" className="rounded-md bg-bad/10 px-3 py-2 text-[13px] text-bad">
          {state.error}
        </p>
      )}
      {state.added && (
        <div role="status" className="rounded-md bg-good/10 px-3 py-2 text-[13px] text-ink">
          {!state.invited ? (
            <>Added {state.added}. They already use Vantiq, so we emailed to let them know.</>
          ) : state.inviteLink ? (
            <>
              Added {state.added}. Email isn&apos;t set up yet, so send them this invitation link yourself. It works once, for 7 days:
              <code className="mt-1 block select-all break-all rounded bg-surface px-2 py-1 font-mono text-[12px]">{state.inviteLink}</code>
            </>
          ) : (
            <>Invitation sent to {state.added}. The link in it works for 7 days.</>
          )}
        </div>
      )}
      <SubmitButton label="Add member" pendingLabel="Adding…" />
    </form>
  );
}
