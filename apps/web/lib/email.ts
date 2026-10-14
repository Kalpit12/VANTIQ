import "server-only";
import { claimQueuedEmails, getDb, markEmail, type OutboxEmail } from "@vantiq/db";
import { headers } from "next/headers";
import { after } from "next/server";

/**
 * Delivers the email outbox. With RESEND_API_KEY set, emails go out through
 * Resend; without it they are kept as "logged" so admins can still read them
 * under Settings → Notifications (and invitations show their link instead).
 */

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);

/** The app's public address for links in emails. */
export async function appOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  } catch {
    // Outside a request (cron): fall through.
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain-text body to simple HTML: paragraphs, with links made clickable. */
export function bodyHtml(text: string): string {
  const paras = text.split(/\n{2,}/).map((p) =>
    escape(p)
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#0e6e6a">$1</a>')
      .replace(/\n/g, "<br>"),
  );
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#111827;max-width:560px">${paras
    .map((p) => `<p style="margin:0 0 14px">${p}</p>`)
    .join("")}<p style="margin:24px 0 0;font-size:12px;color:#5f6673">Vantiq Finance</p></div>`;
}

async function send(e: OutboxEmail, origin: string): Promise<{ status: "sent" | "logged" | "failed"; providerId?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: "logged" };
  const text = e.body.replaceAll("{{origin}}", origin);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": e.id },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Vantiq Finance <onboarding@resend.dev>", to: [e.to], subject: e.subject, text, html: bodyHtml(text) }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { status: "failed", error: `${res.status}: ${json.message ?? res.statusText}` };
    return { status: "sent", providerId: json.id };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

/** Sends everything queued, a batch at a time. */
export async function deliverQueued(origin?: string) {
  const db = getDb();
  const from = origin ?? (await appOrigin());
  let total = 0;
  for (let round = 0; round < 8; round++) {
    const batch = await claimQueuedEmails(db, 25);
    if (!batch.length) break;
    for (const e of batch) await markEmail(db, e.id, await send(e, from));
    total += batch.length;
  }
  return total;
}

/** Delivers queued email after the response is sent, so the person never waits on it. */
export async function sendEmailsAfterResponse() {
  if (!process.env.DATABASE_URL) return;
  const origin = await appOrigin();
  after(() => deliverQueued(origin).catch((e) => console.error("email delivery failed", e)));
}
