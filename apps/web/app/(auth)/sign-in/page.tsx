import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { signInAction } from "@/app/actions/auth";
import { currentSession, dbEnabled } from "@/lib/data";
import { DemoNotice } from "@/components/DemoNotice";

export const metadata = { title: "Sign in · Vantiq Finance" };

export default async function SignInPage() {
  if (!dbEnabled()) return <DemoNotice />;
  if ((await currentSession())?.company) redirect("/");
  return (
    <>
      <h1 className="mb-1 text-[20px] font-semibold text-ink">Sign in</h1>
      <p className="mb-5 text-[13px] text-ink-2">Welcome back.</p>
      <AuthForm
        action={signInAction}
        submit="Sign in"
        fields={[
          { name: "email", label: "Work email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
      />
      <p className="mt-5 text-[13px] text-ink-2">
        New to Vantiq?{" "}
        <Link href="/sign-up" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
