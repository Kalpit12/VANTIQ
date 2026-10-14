import "server-only";
import { getDb, listScenarios } from "@vantiq/db";
import { buildForecast, DEFAULT_SCENARIOS, summarizeForecast, type Scenario } from "@vantiq/domain";
import type { Workspace } from "./data";

/** Scenarios for the workspace: stored ones, or the three standard ones in the demo (read-only, so no drivers set). */
export async function scenariosFor(ws: Workspace): Promise<Scenario[]> {
  if (ws.mode === "demo") return DEFAULT_SCENARIOS.map((s) => ({ ...s, id: s.kind, drivers: [], overrides: [] }));
  return listScenarios(getDb(), ws.companyId!);
}

/** Every scenario's forecast, and the one picked with `?scenario=` (Base when none or unknown). */
export function forecastsFor(ws: Workspace, scenarios: Scenario[], picked: string | undefined) {
  const all = scenarios.map((s) => buildForecast(ws.ledger, s));
  const current = all.find((f) => f.scenario.id === picked) ?? all[0]!;
  return { all, current, summaries: all.map((f) => summarizeForecast(ws.ledger, f)) };
}
