"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { acceptInvite, AuthError, getDb, requestPasswordReset, resetPassword, signIn, signOut, signUp, switchCompany } from "@vantiq/db";
import { sendEmailsAfterResponse } from "@/lib/email";
import { SESSION_COOKIE } from "@/lib/data";

export interface FormState {
  error?: string;
  notice?: string;
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

export async function forgotPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const email = str(form, "email").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address.", values: { email } };
  await requestPasswordReset(getDb(), email);
  await sendEmailsAfterResponse();
  return { notice: `If ${email} has a Vantiq account, a link to reset the password is on its way. It works for an hour.`, values: { email } };
}

export async function resetPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const s = await resetPassword(getDb(), str(form, "token"), str(form, "password"));
    await setSessionCookie(s.token, s.expiresAt);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  redirect("/overview");
}

export async function acceptInviteAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const s = await acceptInvite(getDb(), str(form, "token"), str(form, "password"));
    await setSessionCookie(s.token, s.expiresAt);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  redirect("/overview");
}
