import Link from "next/link";
import { getConnection, getDb, listPeriodChecks } from "@vantiq/db";
import { periodLabel } from "@vantiq/domain";

/** Warns when synced months no longer add up to the accounting system's own net income. */
export async function ReconcileBanner({ companyId }: { companyId: string }) {
  const db = getDb();
  const conn = await getConnection(db, companyId);
  if (!conn) return null;
  const off = (await listPeriodChecks(db, companyId)).filter((c) => c.status === "out_of_balance");
  if (off.length === 0 && conn.status === "active") return null;
  const months = off.map((c) => periodLabel(c.period));
  return (
    <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-bad/40 bg-bad/10 px-4 py-3 text-[13px]">
      <p className="text-ink">
        {off.length > 0 ? (
          <>
            <strong className="font-semibold">Out of balance with {conn.systemName}.</strong> Vantiq&apos;s numbers for {months.length > 3 ? `${months.length} months` : months.join(", ")} don&apos;t match
            its net income, so treat them with care.
          </>
        ) : (
          <>
            <strong className="font-semibold">The last sync with {conn.systemName} failed.</strong> These numbers may be out of date.
          </>
        )}
      </p>
      <Link href="/connections" className="font-medium text-accent hover:underline">
        Check connection →
      </Link>
    </div>
  );
}
