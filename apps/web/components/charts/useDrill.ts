"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export interface DrillTarget {
  /** Category id */
  dc: string;
  /** Program id, "none" for unassigned, or undefined for all programs */
  dp?: string;
  /** Single period, or undefined for the current view's periods */
  dper?: string;
}

/** Opens the drill-down drawer by updating the URL (design.md 7.4 "click to drill"). */
export function useDrill() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return useCallback(
    (t: DrillTarget) => {
      const q = new URLSearchParams(sp.toString());
      q.set("dc", t.dc);
      if (t.dp) q.set("dp", t.dp);
      else q.delete("dp");
      if (t.dper) q.set("dper", t.dper);
      else q.delete("dper");
      router.push(`${pathname}?${q.toString()}`, { scroll: false });
    },
    [router, pathname, sp],
  );
}
