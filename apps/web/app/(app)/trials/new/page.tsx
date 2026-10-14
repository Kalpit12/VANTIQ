import Link from "next/link";
import { can } from "@vantiq/db";
import { redirect } from "next/navigation";
import { createTrialAction } from "@/app/actions/trials";
import { SubmitButton } from "@/components/AuthForm";
import { DriverFields } from "@/components/trials/DriverFields";
import { Card, PageHeader } from "@/components/ui";
import { getWorkspace } from "@/lib/data";
import { one, type SearchParams } from "@/lib/view";

export const metadata = { title: "Add a trial · Vantiq Finance" };

const field = "h-9 rounded-md border border-line-strong bg-surface px-3 text-[14px] text-ink";

export default async function NewTrialPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  if (ws.mode === "demo" || !can.importData(ws.role)) redirect("/trials");
  const cros = ws.ledger.data.vendors.filter((v) => v.type === "cro" || /cro|clinical/i.test(v.name)).map((v) => v.name);
  const error = one(sp, "terr");
  return (
    <>
      <PageHeader title="Add a trial" subtitle="The trial and its CRO contract. Change orders and monthly activity are added on the trial's page." />
      {error && (
        <p role="alert" className="mb-4 rounded-md bg-bad/10 px-3 py-2 text-[13px] text-bad">
          {error}
        </p>
      )}
      <Card className="max-w-[760px] p-6">
        <form action={createTrialAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[13px] font-medium text-ink">
              Trial ID
              <input name="code" required maxLength={40} placeholder="HX-101-202" className={`${field} font-mono`} />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-ink">
              Phase
              <select name="phase" className={field} defaultValue="Phase 2">
                {["Phase 1", "Phase 2", "Phase 3", "Phase 4"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-ink sm:col-span-2">
              Name
              <input name="name" required maxLength={200} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-ink">
              Program
              <select name="programCode" className={field} defaultValue="">
                <option value="">None</option>
                {ws.ledger.data.programs.map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-ink">
              CRO, as named on its invoices
              <input name="croName" required list="cro-names" className={field} />
              <datalist id="cro-names">
                {cros.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-ink">
              First month
              <input name="start" type="month" required className={field} />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-ink">
              Last month (planned)
              <input name="end" type="month" required className={field} />
            </label>
          </div>
          <fieldset>
            <legend className="mb-1 text-[13px] font-medium text-ink">Contract budget</legend>
            <p className="mb-2 text-[12px] text-ink-2">Leave a driver empty if the contract doesn't price it. Study management is a fee per month.</p>
            <DriverFields idPrefix="new" />
          </fieldset>
          <div className="flex items-center gap-3">
            <SubmitButton label="Add trial" pendingLabel="Saving…" />
            <Link href="/trials" className="text-[13px] text-ink-2 hover:underline">
              Cancel
            </Link>
          </div>
        </form>
      </Card>
    </>
  );
}
