import { NextResponse } from "next/server";
import { getDb, listDueConnections, runSync } from "@vantiq/db";

// A first sync of a large ledger can take a while.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const SIX_HOURS = 6 * 3600_000;

/**
 * Scheduled sync. Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`;
 * any scheduler that sends the same header works. Each company syncs at most
 * every six hours, however often this runs.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ synced: 0, note: "Demo mode: no database." });
  const db = getDb();
  // Ask for anything not synced in the last 5h45m, so a 6-hourly schedule never skips a beat.
  const due = await listDueConnections(db, SIX_HOURS - 15 * 60_000);
  const results = [];
  for (const d of due) {
    const r = await runSync(db, d.companyId, { trigger: "scheduled" });
    results.push({ connectionId: d.connectionId, status: r.status, inserted: r.inserted, updated: r.updated, deleted: r.deleted, outOfBalance: r.outOfBalance.length });
  }
  return NextResponse.json({ synced: results.length, results });
}
