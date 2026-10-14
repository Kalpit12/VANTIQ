"use client";

import { useEffect, useState } from "react";

/** A read-only field with a copy button, for a link shown only once. */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  // Shown once: drop the token from its cookie as soon as it is on screen.
  // A plain request rather than a server action, which would refresh the page and hide the link.
  useEffect(() => {
    void fetch("/pack/new-link", { method: "DELETE" }).catch(() => undefined);
  }, []);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="sr-only" htmlFor="new-share-link">
        {label}
      </label>
      <input
        id="new-share-link"
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2.5 font-mono text-[12px] text-ink"
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          } catch {
            document.getElementById("new-share-link")?.focus();
          }
        }}
        className="h-9 shrink-0 rounded-md bg-accent px-4 text-[14px] font-medium text-accent-contrast hover:opacity-90"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
