import Link from "next/link";

export function DemoNotice() {
  return (
    <>
      <h1 className="mb-1 text-[20px] font-semibold text-ink">Demo mode</h1>
      <p className="mb-5 text-[13px] text-ink-2">
        This copy of Vantiq has no database connected, so it shows the built-in sample company and needs no sign-in. Set DATABASE_URL to turn on accounts and imports.
      </p>
      <Link href="/overview" className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-[14px] font-medium text-accent-contrast hover:opacity-90">
        Open the sample company
      </Link>
    </>
  );
}
