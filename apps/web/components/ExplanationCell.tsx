import Link from "next/link";
import type { ExplanationRow } from "@vantiq/db";
import { stateOf } from "@/lib/explanations";
import { StatusPill } from "./ui";

/** The Explanation column: status plus the start of the text, opening the line's drawer. */
export function ExplanationCell({ row, material, href }: { row: ExplanationRow | undefined; material: boolean; href: string }) {
  const state = stateOf(row);
  if (state === "pending") return material ? <StatusPill tone="warn">Needs explanation</StatusPill> : <span className="text-ink-3">–</span>;
  return (
    <Link href={href} scroll={false} className="flex max-w-[360px] items-start gap-2 font-sans hover:underline">
      <ExplanationPill row={row} />
      <span className={`line-clamp-2 text-[12px] ${state === "rejected" ? "text-ink-3 line-through" : "text-ink-2"}`}>{row!.text}</span>
    </Link>
  );
}

export function ExplanationPill({ row }: { row: ExplanationRow | undefined }) {
  const state = stateOf(row);
  if (state === "pending") return <StatusPill tone="neutral">Explanation pending</StatusPill>;
  if (state === "draft") return <StatusPill tone="info">{row!.source === "claude" ? "AI draft" : "Auto draft"}</StatusPill>;
  if (state === "rejected") return <StatusPill tone="neutral">Rejected</StatusPill>;
  return <StatusPill tone="accent">Confirmed</StatusPill>;
}
