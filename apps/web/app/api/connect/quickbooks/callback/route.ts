import { NextResponse, type NextRequest } from "next/server";
import { can, ConnectionError, createConnection, quickbooksApp, runSync } from "@vantiq/db";
import { ConnectorError, exchangeQuickbooksCode, type QuickbooksCredentials } from "@vantiq/integrations";
import { requireMember } from "@/lib/data";
import { QB_STATE_COOKIE as STATE_COOKIE } from "@/lib/view";

export const dynamic = "force-dynamic";
// The first sync reads 24 months of reports before redirecting back.
export const maxDuration = 300;

/** Intuit sends the user back here with a one-time code and the QuickBooks company id. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const back = (error?: string) => NextResponse.redirect(`${url.origin}/connections${error ? `?error=${encodeURIComponent(error)}` : ""}`);
  const p = url.searchParams;
  if (p.get("error")) return back("QuickBooks access wasn't granted.");
  const state = req.cookies.get(STATE_COOKIE)?.value;
  const code = p.get("code");
  const realmId = p.get("realmId");
  if (!state || state !== p.get("state") || !code || !realmId) return back("That QuickBooks sign-in expired or didn't come from Vantiq. Try connecting again.");
  try {
    const { db, companyId, userId } = await requireMember(can.importData);
    const app = quickbooksApp(url.origin)!;
    const tokens = await exchangeQuickbooksCode(app, code);
    const environment = process.env.QUICKBOOKS_ENVIRONMENT === "production" ? "production" : "sandbox";
    const credentials: QuickbooksCredentials = { realmId, environment, tokens };
    await createConnection(db, companyId, userId, {
      provider: "quickbooks",
      systemName: environment === "sandbox" ? "QuickBooks Online (Intuit sandbox)" : "QuickBooks Online",
      accountToken: JSON.stringify(credentials),
    });
    await runSync(db, companyId, { trigger: "initial", actorId: userId });
  } catch (e) {
    return back(e instanceof ConnectionError || e instanceof ConnectorError || e instanceof Error ? e.message : "Connecting QuickBooks failed.");
  }
  const res = back();
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/connect/quickbooks" });
  return res;
}
