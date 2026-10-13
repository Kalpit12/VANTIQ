"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError, getDb, signIn, signOut, signUp, switchCompany } from "@vantiq/db";
import { SESSION_COOKIE } from "@/lib/data";

export interface FormState {
  error?: string;
  values?: Record<string, string>;
}

async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function signInAction(_: FormState, form: FormData): Promise<FormState> {
  const email = str(form, "email");
  try {
    const s = await signIn(getDb(), email, str(form, "password"));
    await setSessionCookie(s.token, s.expiresAt);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message, values: { email } };
    throw e;
  }
  redirect("/overview");
}

export async function signUpAction(_: FormState, form: FormData): Promise<FormState> {
  const values = { name: str(form, "name"), email: str(form, "email"), companyName: str(form, "companyName") };
  try {
    const s = await signUp(getDb(), { ...values, password: str(form, "password") });
    await setSessionCookie(s.token, s.expiresAt);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message, values };
    throw e;
  }
  redirect("/overview");
}

export async function signOutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await signOut(getDb(), token);
  jar.delete(SESSION_COOKIE);
  redirect("/sign-in");
}

export async function switchCompanyAction(form: FormData) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/sign-in");
  await switchCompany(getDb(), token, str(form, "companyId"));
  redirect("/overview");
}
