import { Suspense } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { getWorkspace } from "@/lib/data";

// Demo or workspace mode is decided at runtime from DATABASE_URL, so never prerender.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ws = await getWorkspace();
  const hasData = ws.ledger.hasData();
  return (
    <div className="flex min-h-screen">
      <Suspense>
        <Sidebar
          mode={ws.mode}
          role={ws.role}
          user={ws.session ? { name: ws.session.user.name, email: ws.session.user.email } : null}
          companies={ws.session?.companies ?? []}
          companyId={ws.companyId}
          needsMapping={ws.unmapped.accounts + ws.unconfirmed}
        />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense>
          <TopBar
            companyName={ws.companyName}
            sample={ws.mode === "demo"}
            firstPeriod={hasData ? ws.ledger.firstPeriod() : null}
            latestPeriod={hasData ? ws.ledger.latestPeriod() : null}
          />
        </Suspense>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
