import Link from "next/link";
import { SHARE_DAYS, type ShareLinkRow } from "@vantiq/db";
import { formatDate } from "@vantiq/domain";
import { createShareAction, revokeShareAction } from "@/app/actions/shares";
import { SubmitButton } from "@/components/AuthForm";
import { Card, StatusPill } from "@/components/ui";
import { CopyField } from "./CopyField";

const field = "h-9 rounded-md border border-line-strong bg-surface px-2.5 text-[13px] text-ink";
const day = (d: Date) => formatDate(d.toISOString().slice(0, 10));
const STATUS: Record<ShareLinkRow["status"], { text: string; tone: "accent" | "neutral" | "warn" }> = {
  active: { text: "Active", tone: "accent" },
  expired: { text: "Expired", tone: "neutral" },
  revoked: { text: "Revoked", tone: "neutral" },
  withdrawn: { text: "Month reopened", tone: "warn" },
};

/**
 * The board pack section of the review pack page: preview, PDF, and read-only
 * links for the board that expire. Links need the month to be approved.
 */
export function SharePanel({
  period,
  label,
  mode,
  locked,
  canShare,
  links,
  newLink,
  error,
}: {
  period: string;
  label: string;
  mode: "demo" | "db";
  locked: boolean;
  canShare: boolean;
  links: ShareLinkRow[];
  newLink: { url: string; label: string } | null;
  error?: string;
}) {
  return (
    <Card className="scroll-mt-20 p-5">
      <section id="board" aria-labelledby="board-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="board-heading" className="text-[15px] font-semibold text-ink">
              Board pack
            </h2>
            <p className="mt-0.5 max-w-[640px] text-[13px] text-ink-2">
              The board-ready version of this pack: headline numbers, what moved and why, the income statement, R&amp;D by program and runway. No transaction detail or internal comments.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/pack/board?period=${period}`} className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3 text-[14px] font-medium text-ink hover:bg-subtle">
              Preview
            </Link>
            <a href={`/pack/board/pdf?period=${period}`} className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3 text-[14px] font-medium text-ink hover:bg-subtle">
              Download board PDF
            </a>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-md bg-bad/10 px-3 py-2 text-[13px] text-bad">
            {error}
          </p>
        )}

        {newLink && (
          <div role="status" className="mt-4 rounded-md border border-accent/40 bg-accent-subtle p-3">
            <p className="mb-2 text-[13px] text-ink">
              <strong className="font-semibold">Link for {newLink.label} is ready.</strong> Copy it now: for security, Vantiq only shows it once.
            </p>
            <CopyField value={newLink.url} label={`Board pack link for ${newLink.label}`} />
          </div>
        )}

        {mode === "demo" ? (
          <p className="mt-4 text-[13px] text-ink-3">Sign up and approve a month to send the board a link that expires.</p>
        ) : !locked ? (
          <p className="mt-4 text-[13px] text-ink-3">Approve {label} to share its board pack. Links show exactly what was approved.</p>
        ) : (
          <>
            {links.length > 0 && (
              <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Board pack links">
                <table className="w-full min-w-[640px] text-[13px]">
                  <thead className="text-[12px] text-ink-3">
                    <tr className="border-b border-line">
                      <th className="py-2 pr-3 text-left font-medium">For</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-left font-medium">Works until</th>
                      <th className="px-3 py-2 text-right font-medium">Opened</th>
                      <th className="py-2 pl-3 text-right font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {links.map((l) => (
                      <tr key={l.id} className="border-b border-line/70">
                        <td className="py-2 pr-3">
                          <span className="font-medium text-ink">{l.label}</span>
                          <span className="block text-[12px] text-ink-3">
                            {l.createdByName ?? "A former member"} · {day(l.createdAt)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <StatusPill tone={STATUS[l.status].tone}>{STATUS[l.status].text}</StatusPill>
                        </td>
                        <td className="px-3 py-2 text-ink-2">{day(l.expiresAt)}</td>
                        <td className="num px-3 py-2 text-right text-ink-2">
                          {l.viewCount === 0 ? "Not yet" : `${l.viewCount} time${l.viewCount === 1 ? "" : "s"}, last ${day(l.lastViewedAt!)}`}
                        </td>
                        <td className="py-2 pl-3 text-right">
                          {canShare && l.status === "active" && (
                            <form action={revokeShareAction}>
                              <input type="hidden" name="period" value={period} />
                              <input type="hidden" name="id" value={l.id} />
                              <button type="submit" className="h-8 rounded-md border border-line-strong px-3 text-[13px] text-ink hover:bg-subtle" aria-label={`Revoke the link for ${l.label}`}>
                                Revoke
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {canShare && (
              <form action={createShareAction} className="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 md:grid-cols-[minmax(0,1fr)_160px]">
                <input type="hidden" name="period" value={period} />
                <label className="flex flex-col gap-1 text-[13px] font-medium text-ink">
                  Who is it for?
                  <input name="label" required maxLength={120} placeholder="Board of directors, Q3 meeting" className={field} />
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-medium text-ink">
                  Link works for
                  <select name="days" defaultValue="14" className={field}>
                    {SHARE_DAYS.map((d) => (
                      <option key={d} value={d}>
                        {d} days
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-medium text-ink md:col-span-2">
                  Note to the board (optional)
                  <textarea name="note" maxLength={1000} rows={3} placeholder="Shown at the top of the pack." className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink" />
                </label>
                <div className="md:col-span-2">
                  <SubmitButton label="Create link" pendingLabel="Creating…" />
                </div>
              </form>
            )}
          </>
        )}
      </section>
    </Card>
  );
}
