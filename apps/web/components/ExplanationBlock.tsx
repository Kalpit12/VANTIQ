import { formatCompactCurrency, formatDate, type Ledger } from "@vantiq/domain";
import type { ExplanationRow } from "@vantiq/db";
import { decideExplanationAction, draftExplanationsAction } from "@/app/actions/explanations";
import { isStale } from "@/lib/explanations";
import type { View } from "@/lib/view";
import { SubmitButton } from "./AuthForm";

/**
 * The AI explanation block (design.md 4): label, text, cited transactions as
 * chips, and Accept / Edit / Reject. Drafts are always labelled until a person
 * decides; rule-based drafts say so.
 */
export function ExplanationBlock({
  row,
  ledger,
  categoryId,
  view,
  back,
  canEdit,
  demo,
  error,
}: {
  row: ExplanationRow | undefined;
  ledger: Ledger;
  categoryId: string;
  view: View;
  back: string;
  canEdit: boolean;
  demo: boolean;
  error?: string;
}) {
  const hidden = (
    <>
      <input type="hidden" name="period" value={view.period} />
      <input type="hidden" name="mode" value={view.mode} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="back" value={back} />
    </>
  );
  const ghost = "!h-8 !px-3 !text-[13px] !bg-surface border border-line-strong !text-ink hover:!bg-subtle";

  if (!row) {
    return (
      <section aria-label="Explanation" className="border-b border-line bg-subtle/50 px-5 py-4">
        <p className="text-[13px] text-ink-2">No explanation for this line yet.</p>
        {canEdit && (
          <form action={draftExplanationsAction} className="mt-2">
            {hidden}
            <SubmitButton label="Draft an explanation" pendingLabel="Drafting…" className="!h-8 !px-3 !text-[13px]" />
          </form>
        )}
      </section>
    );
  }

  const delta = ledger.variance({ periods: view.periods, categoryIds: [categoryId] }).delta;
  const stale = row.status !== "rejected" && isStale(row, delta);
  const txns = new Map(ledger.data.transactions.map((t) => [t.id, t]));
  const vendors = new Map(ledger.data.vendors.map((v) => [v.id, v.name]));
  const cited = row.citedTransactionIds.map((id) => txns.get(id)).filter((t) => t !== undefined);
  const label =
    row.status === "ai_draft"
      ? row.source === "claude"
        ? "AI draft"
        : "Auto draft"
      : `${row.status === "accepted" ? "Confirmed" : row.status === "edited" ? "Edited and confirmed" : "Rejected"}${row.decidedByName ? ` by ${row.decidedByName}` : ""}`;
  const tone = row.status === "ai_draft" ? "bg-info/10 text-info" : row.status === "rejected" ? "bg-subtle text-ink-3" : "bg-accent-subtle text-accent";

  return (
    <section aria-label="Explanation" className="border-b border-line bg-subtle/50 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{label}</span>
        {row.status === "ai_draft" && <span className="text-[11px] text-ink-3">{row.source === "claude" ? `Confidence: ${row.confidence}` : "Written by Vantiq's rules, no AI"}</span>}
        {stale && <span className="text-[11px] font-medium text-warn">The numbers changed since this was written</span>}
      </div>
      <p className={`mt-2 text-[14px] leading-6 ${row.status === "rejected" ? "text-ink-3 line-through" : "text-ink"}`}>{row.text}</p>
      {cited.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Cited transactions">
          {cited.map((t) => (
            <li key={t.id}>
              <a href={`#txn-${t.id}`} className="num inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-[12px] text-ink-2 hover:border-accent hover:text-ink">
                {formatDate(t.date)} · {(t.vendorId && vendors.get(t.vendorId)) || "No vendor"} · {formatCompactCurrency(t.amount)}
              </a>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-bad">
          {error}
        </p>
      )}
      {canEdit && !demo && (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          {row.status === "ai_draft" && (
            <form action={decideExplanationAction}>
              {hidden}
              <input type="hidden" name="action" value="accept" />
              <SubmitButton label="Accept" pendingLabel="Saving…" className="!h-8 !px-3 !text-[13px]" />
            </form>
          )}
          <details className="group">
            <summary className="flex h-8 cursor-pointer list-none items-center rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink hover:bg-subtle">Edit</summary>
            <form action={decideExplanationAction} className="mt-2 w-[min(560px,80vw)]">
              {hidden}
              <input type="hidden" name="action" value="edit" />
              <label htmlFor={`edit-${categoryId}`} className="sr-only">
                Explanation
              </label>
              <textarea
                id={`edit-${categoryId}`}
                name="text"
                defaultValue={row.text}
                rows={4}
                maxLength={1200}
                className="w-full rounded-md border border-line-strong bg-surface p-2 text-[14px] leading-6 text-ink"
              />
              <SubmitButton label="Save and confirm" pendingLabel="Saving…" className="mt-2 !h-8 !px-3 !text-[13px]" />
            </form>
          </details>
          {row.status === "ai_draft" && (
            <form action={decideExplanationAction}>
              {hidden}
              <input type="hidden" name="action" value="reject" />
              <SubmitButton label="Reject" pendingLabel="Saving…" className={ghost} />
            </form>
          )}
          <form action={draftExplanationsAction}>
            {hidden}
            <SubmitButton label="Draft again" pendingLabel="Drafting…" className={ghost} />
          </form>
        </div>
      )}
      {demo && <p className="mt-2 text-[12px] text-ink-3">In your own workspace, Finance and Admin can accept, edit or reject each draft.</p>}
    </section>
  );
}
