import Link from "next/link";
import { getDb, MIN_PASSWORD, peekEmailToken } from "@vantiq/db";
import { acceptInviteAction } from "@/app/actions/auth";
import { AuthForm } from "@/components/AuthForm";
import { DemoNotice } from "@/components/DemoNotice";
import { dbEnabled } from "@/lib/data";

export const metadata = { title: "Join your team · Vantiq Finance", referrer: "no-referrer" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  if (!dbEnabled()) return <DemoNotice />;
  const { token } = await params;
  const invite = await peekEmailToken(getDb(), token, "invite");
  if (!invite)
    return (
      <>
        <h1 className="mb-1 text-[20px] font-semibold text-ink">This invitation has expired</h1>
        <p className="mb-5 text-[13px] text-ink-2">Invitations work once, for 7 days. Ask your admin to add you again, or sign in if you already set a password.</p>
        <Link href="/sign-in" className="text-[13px] font-medium text-accent hover:underline">
          Sign in
        </Link>
      </>
    );
  return (
    <>
      <h1 className="mb-1 text-[20px] font-semibold text-ink">Join {invite.companyName}</h1>
      <p className="mb-5 text-[13px] text-ink-2">
        Welcome, {invite.name}. Choose a password for {invite.email} to start using Vantiq.
      </p>
      <AuthForm
        action={acceptInviteAction}
        submit="Join"
        hidden={{ token }}
        fields={[{ name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: `At least ${MIN_PASSWORD} characters.` }]}
      />
    </>
  );
}
