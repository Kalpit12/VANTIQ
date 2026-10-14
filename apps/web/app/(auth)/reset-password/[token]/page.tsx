import Link from "next/link";
import { getDb, MIN_PASSWORD, peekEmailToken } from "@vantiq/db";
import { resetPasswordAction } from "@/app/actions/auth";
import { AuthForm } from "@/components/AuthForm";
import { DemoNotice } from "@/components/DemoNotice";
import { dbEnabled } from "@/lib/data";

export const metadata = { title: "Choose a new password · Vantiq Finance", referrer: "no-referrer" };

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  if (!dbEnabled()) return <DemoNotice />;
  const { token } = await params;
  const link = await peekEmailToken(getDb(), token, "reset");
  if (!link)
    return (
      <>
        <h1 className="mb-1 text-[20px] font-semibold text-ink">This link has expired</h1>
        <p className="mb-5 text-[13px] text-ink-2">Reset links work once, for an hour.</p>
        <Link href="/forgot-password" className="text-[13px] font-medium text-accent hover:underline">
          Send a new link
        </Link>
      </>
    );
  return (
    <>
      <h1 className="mb-1 text-[20px] font-semibold text-ink">Choose a new password</h1>
      <p className="mb-5 text-[13px] text-ink-2">For {link.email}. You&apos;ll be signed out everywhere else.</p>
      <AuthForm
        action={resetPasswordAction}
        submit="Save password"
        hidden={{ token }}
        fields={[{ name: "password", label: "New password", type: "password", autoComplete: "new-password", hint: `At least ${MIN_PASSWORD} characters.` }]}
      />
    </>
  );
}
