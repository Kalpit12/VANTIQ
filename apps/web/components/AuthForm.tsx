"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/actions/auth";

export interface Field {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
}

export function AuthForm({
  action,
  fields,
  submit,
  hidden,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  fields: Field[];
  submit: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {fields.map((f) => (
        <div key={f.name} className="flex flex-col gap-1">
          <label htmlFor={f.name} className="text-[13px] font-medium text-ink">
            {f.label}
          </label>
          <input
            id={f.name}
            name={f.name}
            type={f.type ?? "text"}
            required
            autoComplete={f.autoComplete}
            defaultValue={state.values?.[f.name]}
            className="h-9 rounded-md border border-line-strong bg-surface px-3 text-[14px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          {f.hint && <p className="text-[12px] text-ink-3">{f.hint}</p>}
        </div>
      ))}
      {state.error && (
        <p role="alert" className="rounded-md bg-bad/10 px-3 py-2 text-[13px] text-bad">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="rounded-md bg-good/10 px-3 py-2 text-[13px] text-ink">
          {state.notice}
        </p>
      )}
      <SubmitButton label={submit} />
    </form>
  );
}

export function SubmitButton({ label, pendingLabel, className = "" }: { label: string; pendingLabel?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`h-9 rounded-md bg-accent px-4 text-[14px] font-medium text-accent-contrast hover:opacity-90 disabled:opacity-60 ${className}`}
    >
      {pending ? (pendingLabel ?? "Working…") : label}
    </button>
  );
}
