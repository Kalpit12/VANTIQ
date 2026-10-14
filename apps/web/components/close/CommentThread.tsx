import { addCommentAction } from "@/app/actions/close";
import { SubmitButton } from "@/components/AuthForm";

export interface ThreadComment {
  id?: string;
  body: string;
  by: string | null;
  at: string;
}

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC`;
};

/**
 * Comments on a line or a task. The form shows only when the viewer can
 * comment and the month is still open.
 */
export function CommentThread({
  comments,
  anchor,
  period,
  back,
  canComment,
  label,
}: {
  comments: ThreadComment[];
  anchor: string;
  period: string;
  back: string;
  canComment: boolean;
  label: string;
}) {
  const id = `c-${anchor.replace(/[^a-z0-9-]/gi, "-")}`;
  return (
    <div className="flex flex-col gap-2">
      {comments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {comments.map((c, i) => (
            <li key={c.id ?? i} className="rounded-md bg-subtle px-3 py-2 text-[13px]">
              <p className="text-ink">{c.body}</p>
              <p className="mt-0.5 text-[12px] text-ink-3">
                {c.by ?? "Former member"} · {when(c.at)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {canComment && (
        <form action={addCommentAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="anchor" value={anchor} />
          <input type="hidden" name="back" value={back} />
          <label htmlFor={id} className="sr-only">
            {label}
          </label>
          <textarea
            id={id}
            name="body"
            required
            maxLength={2000}
            rows={1}
            placeholder="Add a comment"
            className="min-h-9 flex-1 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-3"
          />
          <SubmitButton label="Comment" pendingLabel="Posting…" className="!h-9 !px-3 !text-[13px]" />
        </form>
      )}
    </div>
  );
}
