import Link from "next/link";
import { forgotPasswordAction } from "@/app/actions/auth";
import { AuthForm } from "@/components/AuthForm";
import { DemoNotice } from "@/components/DemoNotice";
import { dbEnabled } from "@/lib/data";

export const metadata = { title: "Reset your password · Vantiq Finance" };

export default function ForgotPasswordPage() {
  if (!dbEnabled()) return <DemoNotice />;
  return (
    <>
      <h1 className="mb-1 text-[20px] font-semibold text-ink">Reset your password</h1>
      <p className="mb-5 text-[13px] text-ink-2">Enter the email you sign in with and we&apos;ll send you a link to choose a new password.</p>
      <AuthForm action={forgotPasswordAction} submit="Send reset link" fields={[{ name: "email", label: "Work email", type: "email", autoComplete: "email" }]} />
      <p className="mt-5 text-[13px] text-ink-2">
        Remembered it?{" "}
        <Link href="/sign-in" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
