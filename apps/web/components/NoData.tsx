import Link from "next/link";
import { loadSampleAction } from "@/app/actions/data";
import { SubmitButton } from "./AuthForm";
import { Card, PageHeader } from "./ui";

/** First screen for a company with no imported ledger yet. */
export function NoData({ title, canImport }: { title: string; canImport: boolean }) {
  return (
    <>
      <PageHeader title={title} />
      <Card className="max-w-[720px] p-6">
        <h2 className="text-[17px] font-semibold text-ink">Bring in your numbers</h2>
        <p className="mt-1 text-[13px] text-ink-2">
          Connect QuickBooks, Xero, NetSuite or Sage Intacct, or upload a general ledger export (CSV or Excel). Add your budget and month-end cash balances to see variances and runway.
        </p>
        {canImport ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link href="/connections" className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-[14px] font-medium text-accent-contrast hover:opacity-90">
              Connect accounting
            </Link>
            <Link href="/import" className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-4 text-[14px] font-medium text-ink hover:bg-subtle">
              Import a file
            </Link>
            <form action={loadSampleAction}>
              <SubmitButton
                label="Try it with sample data"
                pendingLabel="Loading sample data…"
                className="!bg-surface border border-line-strong !text-ink hover:!bg-subtle"
              />
            </form>
          </div>
        ) : (
          <p className="mt-4 text-[13px] text-ink-3">Ask someone with the Finance or Admin role to import your company's ledger.</p>
        )}
      </Card>
    </>
  );
}

/** Shown above review screens while some accounts are unmapped or unconfirmed. */
export function MappingBanner({ unmapped, unconfirmed }: { unmapped: { accounts: number; transactions: number }; unconfirmed: number }) {
  if (unmapped.accounts === 0 && unconfirmed === 0) return null;
  const urgent = unmapped.accounts > 0;
  return (
    <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border px-4 py-3 text-[13px] ${urgent ? "border-warn/40 bg-warn/10" : "border-line bg-surface"}`}>
      <p className="text-ink">
        {urgent ? (
          <>
            <strong className="font-semibold">
              {unmapped.accounts} account{unmapped.accounts === 1 ? "" : "s"} not mapped.
            </strong>{" "}
            Their {unmapped.transactions} transaction{unmapped.transactions === 1 ? " is" : "s are"} left out of these numbers.
          </>
        ) : (
          <>
            Vantiq suggested categories for {unconfirmed} account{unconfirmed === 1 ? "" : "s"}. The numbers use them; confirm they are right.
          </>
        )}
      </p>
      <Link href="/mappings" className="font-medium text-accent hover:underline">
        Review mapping →
      </Link>
    </div>
  );
}
