import { isMaterial, Ledger, periodRange } from "@vantiq/domain";
import { generateSampleCompany } from "@vantiq/fixtures";
import { describe, expect, it } from "vitest";
import { buildVarianceContext, draftExplanation, draftWithRules, type MessagesClient } from "../src";

const ledger = new Ledger(generateSampleCompany());
const memoOf = (id: string) => ledger.data.transactions.find((t) => t.id === id)?.memo ?? "";

/**
 * Evaluation set (architecture.md 8.3): the sample company's scripted events,
 * each with the driver a good explanation must name and cite.
 */
const CASES = [
  { period: "2026-09", category: "rd-cro", driver: /Change order 4/, mentions: ["HX-101", "Meridian"] },
  { period: "2026-08", category: "rd-cmc", driver: /Engineering batch EB-07/, mentions: ["Kestrel"] },
  { period: "2026-03", category: "ga-professional", driver: /FY2025 annual audit/, mentions: ["Clearline"] },
  { period: "2026-09", category: "ga-professional", driver: /Licensing term sheet review/, mentions: ["Harbor"] },
  { period: "2026-08", category: "rev-collab", driver: /first patient dosed \(received late\)/, mentions: ["Novagen"] },
];

describe("rule-based drafts (the free path)", () => {
  for (const c of CASES) {
    it(`names and cites the driver of ${c.category} in ${c.period}`, () => {
      const d = draftWithRules(buildVarianceContext(ledger, c.category, [c.period]));
      expect(d.citedTransactionIds.some((id) => c.driver.test(memoOf(id))), d.text).toBe(true);
      for (const m of c.mentions) expect(d.text).toContain(m);
      expect(d.source).toBe("rules");
    });
  }

  it("mentions the HX-204 underspend that offsets HX-101 on CRO costs", () => {
    const d = draftWithRules(buildVarianceContext(ledger, "rd-cro", ["2026-09"]));
    expect(d.text).toMatch(/Partly offset by HX-204/);
    expect(d.citedTransactionIds.some((id) => /site start-up fees deferred/.test(memoOf(id)))).toBe(true);
  });

  it("cites only transactions behind the number, for every material line in every month", () => {
    let lines = 0;
    for (const p of periodRange("2025-01", "2026-09")) {
      for (const r of ledger.tree([p])) {
        if (r.hasChildren || !isMaterial(r.variance)) continue;
        lines++;
        const ctx = buildVarianceContext(ledger, r.category.id, [p]);
        const d = draftWithRules(ctx);
        const behind = new Set(ledger.transactionsFor({ periods: [p], categoryIds: [r.category.id] }).map((t) => t.id));
        // Lines with no entries at all (a budgeted milestone that never came) have nothing to cite.
        if (behind.size) expect(d.citedTransactionIds.length, `${p} ${r.category.id}`).toBeGreaterThan(0);
        else expect(d.text).toMatch(/Nothing was recorded/);
        for (const id of d.citedTransactionIds) expect(behind.has(id), `${p} ${r.category.id} cites ${id}`).toBe(true);
        expect(d.text.length).toBeLessThan(500);
      }
    }
    expect(lines).toBeGreaterThanOrEqual(5);
  });
});

function fakeClaude(reply: unknown, stop: string = "end_turn") {
  const calls: Parameters<MessagesClient["messages"]["create"]>[0][] = [];
  const client: MessagesClient = {
    messages: {
      create: async (params) => {
        calls.push(params);
        return { content: [{ type: "text", text: typeof reply === "string" ? reply : JSON.stringify(reply) }], stop_reason: stop } as never;
      },
    },
  };
  return { client, calls };
}

describe("Claude drafts (against a fake client; no live calls)", () => {
  const ctx = buildVarianceContext(ledger, "rd-cmc", ["2026-08"]);
  const eb07 = ctx.transactions.find((t) => /EB-07/.test(t.memo))!.id;

  it("asks for a fixed JSON shape at medium effort and sends only this line's transactions", async () => {
    const { client, calls } = fakeClaude({ explanation: "Kestrel billed an unplanned engineering batch (EB-07) for a process change.", cited_transaction_ids: [eb07], confidence: "high" });
    const d = await draftExplanation(ledger, "rd-cmc", ["2026-08"], { client, model: "test-model" });
    expect(d).toMatchObject({ source: "claude", model: "test-model", confidence: "high", citedTransactionIds: [eb07] });
    const p = calls[0]!;
    expect(p.output_config?.effort).toBe("medium");
    expect(p.output_config?.format?.type).toBe("json_schema");
    const payload = JSON.parse(String(p.messages[0]!.content).split("\n\n")[1]!);
    const allowed = new Set(ledger.transactionsFor({ periods: ["2026-08"], categoryIds: ["rd-cmc"] }).map((t) => t.id));
    expect(payload.transactions.every((t: { id: string }) => allowed.has(t.id))).toBe(true);
  });

  it("discards a draft that cites a transaction outside the variance, and falls back to the rules", async () => {
    const { client } = fakeClaude({ explanation: "Made up.", cited_transaction_ids: [eb07, "t99999"], confidence: "high" });
    const d = await draftExplanation(ledger, "rd-cmc", ["2026-08"], { client });
    expect(d.source).toBe("rules");
    expect(d.note).toMatch(/cited transactions/);
  });

  it("falls back on a refusal, bad JSON or an unreachable API", async () => {
    expect((await draftExplanation(ledger, "rd-cmc", ["2026-08"], { client: fakeClaude({}, "refusal").client })).note).toMatch(/declined/);
    expect((await draftExplanation(ledger, "rd-cmc", ["2026-08"], { client: fakeClaude("not json").client })).note).toMatch(/JSON/);
    const down: MessagesClient = { messages: { create: async () => Promise.reject(new Error("ECONNRESET")) } };
    expect(await draftExplanation(ledger, "rd-cmc", ["2026-08"], { client: down })).toMatchObject({ source: "rules", note: "Claude could not be reached." });
  });

  it("uses the rules when no API key is configured", async () => {
    expect((await draftExplanation(ledger, "rd-cmc", ["2026-08"], { client: null })).source).toBe("rules");
  });
});
