import { Wordmark } from "@/components/Sidebar";

// Demo or workspace mode is decided at runtime from DATABASE_URL, so never prerender.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-10">
      <div className="mb-6">
        <Wordmark />
      </div>
      <div className="w-full max-w-[400px] rounded-[10px] border border-line bg-surface p-6">{children}</div>
      <p className="mt-6 max-w-[400px] text-center text-[12px] text-ink-3">Finance review for pharma and biotech teams.</p>
    </div>
  );
}
