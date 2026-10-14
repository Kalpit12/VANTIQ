"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, saveDriver, saveForecastOverride, saveScenarioChanges } from "@vantiq/db";
import type { DriverMethod } from "@vantiq/domain";
import { requireMember } from "@/lib/data";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const money = (s: string) => Math.round(Number(s.replace(/[$,\s]/g, "") || "NaN") * 100);
const pct = (s: string) => Number(s.replace(/[%\s+]/g, "").replace("−", "-") || "0") / 100;
const back = (scenario: string, anchor: string, error?: unknown) => {
  const q = new URLSearchParams({ scenario });
  if (error !== undefined) q.set("ferr", error instanceof Error ? error.message : "Could not save.");
  return `/forecast?${q}#${anchor}`;
};

async function run(form: FormData, anchor: string, fn: (ctx: Awaited<ReturnType<typeof requireMember>>, scenario: string) => Promise<void>) {
  const ctx = await requireMember(can.manageForecast);
  const scenario = str(form, "scenario");
  try {
    await fn(ctx, scenario);
  } catch (e) {
    redirect(back(scenario, anchor, e));
  }
  revalidatePath("/forecast");
  redirect(back(scenario, anchor));
}

export async function saveScenarioChangesAction(form: FormData) {
  await run(form, "scenario-settings", ({ db, companyId, userId }, scenario) =>
    saveScenarioChanges(db, companyId, userId, scenario, pct(str(form, "revenueChange")), pct(str(form, "costChange"))),
  );
}

export async function saveDriverAction(form: FormData) {
  await run(form, "drivers", ({ db, companyId, userId }, scenario) => {
    const method = str(form, "method");
    if (method === "inherit") return saveDriver(db, companyId, userId, scenario, str(form, "categoryId"), null);
    return saveDriver(db, companyId, userId, scenario, str(form, "categoryId"), {
      method: method as DriverMethod,
      growth: pct(str(form, "growth")),
      amount: method === "flat" ? money(str(form, "amount")) : null,
    });
  });
}

export async function saveForecastMonthAction(form: FormData) {
  await run(form, "months", ({ db, companyId, userId }, scenario) =>
    saveForecastOverride(db, companyId, userId, scenario, {
      period: str(form, "period"),
      categoryId: str(form, "categoryId"),
      amount: form.get("clear") ? null : money(str(form, "amount")),
      note: str(form, "note"),
    }),
  );
}
