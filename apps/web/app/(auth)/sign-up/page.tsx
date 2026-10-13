import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { signUpAction } from "@/app/actions/auth";
import { currentSession, dbEnabled } from "@/lib/data";
import { DemoNotice } from "@/components/DemoNotice";

export const metadata = { title: "Create account · Vantiq Finance" };

export default async function SignUpPage() {
  if (!dbEnabled()) return <DemoNotice />;
  if ((await currentSession())?.company) redirect("/overview");
  return (
    <>
      <h1 className="mb-1 text-[20px] font-semibold text-ink">Create your account</h1>
      <p className="mb-5 text-[13px] text-ink-2">You'll be the admin for your company and can add your team after.</p>
      <AuthForm
        action={signUpAction}
        submit="Create account"
        fields={[
          { name: "name", label: "Your name", autoComplete: "name" },
          { name: "companyName", label: "Company name", autoComplete: "organization" },
          { name: "email", label: "Work email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "At least 10 characters." },
        ]}
      />
      <p className="mt-5 text-[13px] text-ink-2">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
