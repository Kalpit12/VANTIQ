import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { can, quickbooksApp } from "@vantiq/db";
import { quickbooksAuthUrl } from "@vantiq/integrations";
import { requireMember } from "@/lib/data";
import { QB_STATE_COOKIE as STATE_COOKIE } from "@/lib/view";

export const dynamic = "force-dynamic";


/** Sends the user to Intuit to approve read access to their QuickBooks company. */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  try {
    await requireMember(can.importData);
  } catch (e) {
    return NextResponse.redirect(`${origin}/connections?error=${encodeURIComponent(e instanceof Error ? e.message : "Sign in again.")}`);
  }
  const app = quickbooksApp(origin);
  if (!app) return NextResponse.redirect(`${origin}/connections?error=${encodeURIComponent("QuickBooks isn't set up on this server yet.")}`);
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(quickbooksAuthUrl(app, state));
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", maxAge: 600, path: "/api/connect/quickbooks" });
  return res;
}
