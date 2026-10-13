"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { mergeConnectAction, mergeLinkTokenAction } from "@/app/actions/connections";

interface MergeLinkApi {
  initialize(opts: { linkToken: string; onSuccess: (publicToken: string) => void; onExit?: () => void; onReady?: () => void }): void;
  openLink(): void;
}
declare global {
  interface Window {
    MergeLink?: MergeLinkApi;
  }
}

const MERGE_LINK_SRC = "https://cdn.merge.dev/initialize.js";

function loadMergeLink(): Promise<MergeLinkApi> {
  if (window.MergeLink) return Promise.resolve(window.MergeLink);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = MERGE_LINK_SRC;
    s.async = true;
    s.onload = () => (window.MergeLink ? resolve(window.MergeLink) : reject(new Error("Merge Link did not load.")));
    s.onerror = () => reject(new Error("Could not load Merge Link. Check your connection and try again."));
    document.head.appendChild(s);
  });
}

/**
 * Opens Merge Link for one accounting system. The customer signs in to their
 * system inside Merge's window; Vantiq only receives a token, then runs the
 * first sync.
 */
export function ConnectSystem({ systemId, systemName, enabled }: { systemId: string; systemName: string; enabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "opening" | "syncing">("idle");
  const [, startTransition] = useTransition();

  async function open() {
    setError(null);
    setStage("opening");
    try {
      const { linkToken, error: tokenError } = await mergeLinkTokenAction(systemId);
      if (!linkToken) throw new Error(tokenError ?? "Could not start connecting.");
      const link = await loadMergeLink();
      link.initialize({
        linkToken,
        onReady: () => link.openLink(),
        onExit: () => setStage((s) => (s === "opening" ? "idle" : s)),
        onSuccess: (publicToken) => {
          setStage("syncing");
          startTransition(async () => {
            const res = await mergeConnectAction(publicToken);
            if (res.error) {
              setError(res.error);
              setStage("idle");
            } else router.refresh();
          });
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start connecting.");
      setStage("idle");
    }
  }

  return (
    <div className="mt-auto pt-3">
      <button
        type="button"
        onClick={open}
        disabled={!enabled || stage !== "idle"}
        className="h-8 w-full rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={`Connect ${systemName}`}
      >
        {stage === "opening" ? "Opening…" : stage === "syncing" ? "Reading 24 months…" : "Connect"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
