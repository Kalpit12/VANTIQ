import { billedForTrial, estimateAccrual, Ledger, periodRange } from "@vantiq/domain";
import { generateSampleCompany, generateSampleTrials, sampleFiles } from "@vantiq/fixtures";
import { guessColumns, parseCsv, sandboxConnector } from "@vantiq/integrations";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthError,
  addMember,
  can,
  closeDb,
  commitImport,
  ConnectionError,
  createConnection,
  createDraft,
  decryptSecret,
  deleteConnection,
  encryptSecret,
  getConnection,
  openConnector,
  connections,
  listDueConnections,
  decideExplanation,
  listExplanations,
  saveDrafts,
  scopeOf,
  listPeriodChecks,
  listSyncRuns,
  runSync,
  getDb,
  getSession,
  listMappings,
  loadLedger,
  loadSampleData,
  migrateDb,
  saveMappings,
  signIn,
  signOut,
  signUp,
  TENANT_TABLES,
  transactions,
  withCompany,
  approvePack,
  getPack,
  listAuditEvents,
  listPacks,
  recordPackExport,
  renameCompany,
  reopenPack,
  addChangeOrder,
  createTrial,
  importActivity,
  listTrials,
  saveActivity,
  TrialError,
  addCloseTask,
  addComment,
  assignCloseTask,
  CloseError,
  listCloseTasks,
  listComments,
  prepareCloseTask,
  reviewCloseTask,
  createShareLink,
  listShareLinks,
  openShareLink,
  revokeShareLink,
  ShareError,
  shareLinks,
  type Db,
} from "../src";

/**
 * Integration tests against a real Postgres. The connection must use a
 * non-superuser role, because superusers bypass row-level security.
 * Local default: postgres://vantiq:vantiq@localhost:5432/vantiq_test
 */
const url = process.env.TEST_DATABASE_URL ?? "postgres://vantiq:vantiq@localhost:5432/vantiq_test";
let db: Db;

async function freshCompany(name: string) {
  const email = `${name.toLowerCase().replace(/\W/g, "")}-${Math.random().toString(36).slice(2)}@example.com`;
  const { token } = await signUp(db, { name: `${name} CFO`, email, password: "correct horse battery", companyName: name });
  const s = (await getSession(db, token))!;
  return { token, email, userId: s.user.id, companyId: s.company!.id };
}

beforeAll(async () => {
  db = getDb(url);
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  await migrateDb(url);
  await migrateDb(url); // idempotent
});
afterAll(() => closeDb(url));

describe("auth", () => {
  it("signs up, signs in, and signs out", async () => {
    const a = await freshCompany("Auth Co");
    const s = await getSession(db, a.token);
    expect(s?.company).toMatchObject({ name: "Auth Co", role: "admin" });
    await expect(signIn(db, a.email, "wrong password!!")).rejects.toThrow(AuthError);
    const { token } = await signIn(db, a.email.toUpperCase(), "correct horse battery");
    expect((await getSession(db, token))?.user.email).toBe(a.email);
    await signOut(db, token);
    expect(await getSession(db, token)).toBeNull();
  });

  it("rejects duplicate emails and short passwords", async () => {
    const a = await freshCompany("Dup Co");
    await expect(signUp(db, { name: "X", email: a.email, password: "long enough pw", companyName: "Y" })).rejects.toThrow(/already exists/);
    await expect(signUp(db, { name: "X", email: "new@example.com", password: "short", companyName: "Y" })).rejects.toThrow(/at least/);
  });

  it("adds a viewer who can read but not import", async () => {
    const a = await freshCompany("Team Co");
    const { tempPassword } = await addMember(db, a.userId, a.companyId, { name: "Vera Viewer", email: `vera-${a.email}`, role: "viewer" });
    expect(tempPassword).toBeTruthy();
    const { token } = await signIn(db, `vera-${a.email}`, tempPassword!);
    const s = (await getSession(db, token))!;
    expect(s.company).toMatchObject({ id: a.companyId, role: "viewer" });
    expect(can.view(s.company!.role)).toBe(true);
    expect(can.importData(s.company!.role)).toBe(false);
  });
});

describe("sample data through the import path", () => {
  let a: Awaited<ReturnType<typeof freshCompany>>;
  beforeAll(async () => {
    a = await freshCompany("Helixa Import Test");
    await loadSampleData(db, a.companyId, a.userId);
  });

  it("reproduces the sample company exactly: every period, category and program", async () => {
    const expected = new Ledger(generateSampleCompany());
    const { data, unmapped } = await loadLedger(db, a.companyId);
    const actual = new Ledger(data);
    expect(unmapped.accounts).toBe(0);
    expect(data.transactions).toHaveLength(expected.data.transactions.length);
    const progByCode = new Map(data.programs.map((p) => [p.code, p.id]));
    const periods = periodRange(expected.firstPeriod(), expected.latestPeriod());
    for (const p of periods) {
      for (const c of expected.data.categories) {
        expect(actual.actual({ periods: [p], categoryIds: [c.id] }), `${p} ${c.id} actual`).toBe(expected.actual({ periods: [p], categoryIds: [c.id] }));
        expect(actual.budget({ periods: [p], categoryIds: [c.id] }), `${p} ${c.id} budget`).toBe(expected.budget({ periods: [p], categoryIds: [c.id] }));
      }
      for (const prog of expected.data.programs) {
        const id = progByCode.get(prog.code)!;
        expect(actual.actual({ periods: [p], categoryIds: ["rd"], programId: id })).toBe(expected.actual({ periods: [p], categoryIds: ["rd"], programId: prog.id }));
      }
      expect(actual.cashAt(p)).toBe(expected.cashAt(p));
    }
  });

  it("importing the same ledger file again adds nothing", async () => {
    const table = parseCsv(sampleFiles().ledgerCsv);
    const id = await createDraft(db, a.companyId, a.userId, "ledger", "again.csv", table);
    const res = await commitImport(db, a.companyId, a.userId, id, guessColumns(table.headers, "ledger"));
    expect(res.inserted).toBe(0);
    expect(res.duplicates).toBe(table.rows.length);
  });

  it("re-importing a budget replaces the months it covers", async () => {
    const before = new Ledger((await loadLedger(db, a.companyId)).data);
    const table = parseCsv("Month,Account,Project,Budget\n2026-09,7310,,1000\n");
    const id = await createDraft(db, a.companyId, a.userId, "budget", "sep-revised.csv", table);
    await commitImport(db, a.companyId, a.userId, id, guessColumns(table.headers, "budget"));
    const after = new Ledger((await loadLedger(db, a.companyId)).data);
    expect(after.budget({ periods: ["2026-09"], categoryIds: ["opex"] })).toBe(100_000);
    expect(after.budget({ periods: ["2026-08"], categoryIds: ["opex"] })).toBe(before.budget({ periods: ["2026-08"], categoryIds: ["opex"] }));
  });

  it("changing a mapping moves amounts between categories without re-importing", async () => {
    const before = new Ledger((await loadLedger(db, a.companyId)).data);
    const sw = (await listMappings(db, a.companyId)).find((m) => m.code === "7310")!;
    expect(sw.categoryId).toBe("ga-software");
    await saveMappings(db, a.companyId, a.userId, [{ accountId: sw.accountId, categoryId: "ga-professional", excluded: false }]);
    const moved = new Ledger((await loadLedger(db, a.companyId)).data);
    const q = { periods: ["2026-08"] };
    expect(moved.actual({ ...q, categoryIds: ["ga-software"] })).toBe(0);
    expect(moved.actual({ ...q, categoryIds: ["ga-professional"] })).toBe(
      before.actual({ ...q, categoryIds: ["ga-professional"] }) + before.actual({ ...q, categoryIds: ["ga-software"] }),
    );
    await saveMappings(db, a.companyId, a.userId, [{ accountId: sw.accountId, categoryId: null, excluded: true }]);
    const excluded = new Ledger((await loadLedger(db, a.companyId)).data);
    expect(excluded.actual({ ...q, categoryIds: ["opex"] })).toBe(before.actual({ ...q, categoryIds: ["opex"] }) - before.actual({ ...q, categoryIds: ["ga-software"] }));
    expect((await listMappings(db, a.companyId)).find((m) => m.code === "7310")).toMatchObject({ status: "confirmed", excluded: true });
  });

  it("flags accounts with no mapping and leaves them out", async () => {
    const table = parseCsv("Date,Account,Account Name,Amount\n2026-09-15,6999,Miscellaneous,500\n");
    const id = await createDraft(db, a.companyId, a.userId, "ledger", "misc.csv", table);
    await commitImport(db, a.companyId, a.userId, id, guessColumns(table.headers, "ledger"));
    const loaded = await loadLedger(db, a.companyId);
    expect(loaded.unmapped).toEqual({ accounts: 1, transactions: 1 });
  });
});

describe("connected accounting system", () => {
  const TODAY = "2026-09-30"; // the sample books end in September 2026
  let a: Awaited<ReturnType<typeof freshCompany>>;
  beforeAll(async () => {
    process.env.CONNECTION_SECRET_KEY ??= "test-secret-key-for-connection-tokens";
    a = await freshCompany("Sync Co");
    await createConnection(db, a.companyId, a.userId, { provider: "sandbox", systemName: "QuickBooks Online (sandbox)" });
  });

  it("first sync brings in 24 months that match the sample books, every month balanced", async () => {
    const res = await runSync(db, a.companyId, { trigger: "initial", actorId: a.userId, today: TODAY });
    const data = generateSampleCompany();
    expect(res).toMatchObject({ status: "done", inserted: data.transactions.length, updated: 0, deleted: 0, outOfBalance: [] });
    const expected = new Ledger(data);
    const actual = new Ledger((await loadLedger(db, a.companyId)).data);
    for (const p of periodRange("2024-10", "2026-09")) {
      expect(actual.actual({ periods: [p], categoryIds: ["opex"] }), p).toBe(expected.actual({ periods: [p], categoryIds: ["opex"] }));
      expect(actual.actual({ periods: [p], categoryIds: ["revenue"] }), p).toBe(expected.actual({ periods: [p], categoryIds: ["revenue"] }));
      expect(actual.cashAt(p)).toBe(expected.cashAt(p));
    }
    const checks = await listPeriodChecks(db, a.companyId);
    expect(checks).toHaveLength(24);
    expect(checks.every((c) => c.status === "balanced")).toBe(true);
    expect((await getConnection(db, a.companyId))?.lastSyncedAt).toBeTruthy();
  });

  it("syncing again changes nothing", async () => {
    const res = await runSync(db, a.companyId, { trigger: "manual", today: TODAY });
    expect(res).toMatchObject({ status: "done", inserted: 0, updated: 0, deleted: 0 });
  });

  it("applies edits and deletions made at the source", async () => {
    const data = generateSampleCompany();
    const [first, second, ...rest] = data.transactions;
    const edited = { ...data, transactions: [{ ...first!, amount: first!.amount + 12_345 }, ...rest] };
    const res = await runSync(db, a.companyId, { trigger: "manual", today: TODAY, connector: sandboxConnector({ data: edited }) });
    expect(res).toMatchObject({ status: "done", inserted: 0, updated: 1, deleted: 1, outOfBalance: [] });
    const rows = await withCompany(db, a.companyId, (tx) => tx.select().from(transactions).where(eq(transactions.externalId, second!.id)));
    expect(rows).toHaveLength(0);
    // Put the original books back for the next tests.
    expect(await runSync(db, a.companyId, { trigger: "manual", today: TODAY })).toMatchObject({ inserted: 1, updated: 1 });
  });

  it("flags a month whose net income no longer matches the source", async () => {
    const res = await runSync(db, a.companyId, { trigger: "scheduled", today: TODAY, connector: sandboxConnector({ reportedDrift: { "2026-08": 250_000 } }) });
    expect(res.outOfBalance).toEqual(["2026-08"]);
    const aug = (await listPeriodChecks(db, a.companyId)).find((c) => c.period === "2026-08")!;
    expect(aug).toMatchObject({ status: "out_of_balance" });
    expect(aug.sourceMinor! - aug.vantiqMinor).toBe(250_000);
    // A within-a-dollar rounding difference still counts as balanced.
    const ok = await runSync(db, a.companyId, { trigger: "manual", today: TODAY, connector: sandboxConnector({ reportedDrift: { "2026-08": 100 } }) });
    expect(ok.outOfBalance).toEqual([]);
  });

  it("records a failed read without touching the books", async () => {
    const before = (await loadLedger(db, a.companyId)).data.transactions.length;
    const broken = { ...sandboxConnector(), listLines: async () => Promise.reject(new Error("socket hang up")) };
    const res = await runSync(db, a.companyId, { trigger: "manual", today: TODAY, connector: broken });
    expect(res).toMatchObject({ status: "failed", error: "Sync failed: socket hang up" });
    expect((await loadLedger(db, a.companyId)).data.transactions).toHaveLength(before);
    expect(await getConnection(db, a.companyId)).toMatchObject({ status: "error", lastError: "Sync failed: socket hang up" });
    expect((await listSyncRuns(db, a.companyId))[0]).toMatchObject({ status: "failed" });
    expect((await runSync(db, a.companyId, { trigger: "manual", today: TODAY })).status).toBe("done");
    expect(await getConnection(db, a.companyId)).toMatchObject({ status: "active", lastError: null });
  });

  it("lists connections due for a scheduled sync across companies", async () => {
    const due = await listDueConnections(db, 6 * 3600_000, new Date(Date.now() + 7 * 3600_000));
    expect(due.map((d) => d.companyId)).toContain(a.companyId);
    expect((await listDueConnections(db, 6 * 3600_000)).map((d) => d.companyId)).not.toContain(a.companyId);
  });

  it("refuses a second connection, or connecting over file-imported books", async () => {
    await expect(createConnection(db, a.companyId, a.userId, { provider: "sandbox", systemName: "Again" })).rejects.toThrow(ConnectionError);
    const b = await freshCompany("Files First Co");
    await loadSampleData(db, b.companyId, b.userId);
    await expect(createConnection(db, b.companyId, b.userId, { provider: "sandbox", systemName: "X" })).rejects.toThrow(/file imports/);
  });

  it("keeps synced lines after disconnecting", async () => {
    const c = await freshCompany("Disconnect Co");
    await createConnection(db, c.companyId, c.userId, { provider: "sandbox", systemName: "Sandbox" });
    await runSync(db, c.companyId, { trigger: "initial", today: TODAY });
    const n = (await loadLedger(db, c.companyId)).data.transactions.length;
    await deleteConnection(db, c.companyId, c.userId);
    expect(await getConnection(db, c.companyId)).toBeNull();
    expect((await loadLedger(db, c.companyId)).data.transactions).toHaveLength(n);
  });

  it("saves refreshed QuickBooks tokens back to the connection, sealed", async () => {
    process.env.QUICKBOOKS_CLIENT_ID = "cid";
    process.env.QUICKBOOKS_CLIENT_SECRET = "secret";
    const q = await freshCompany("QuickBooks Co");
    const creds = { realmId: "9130", environment: "sandbox", tokens: { accessToken: "old", refreshToken: "rt-old", expiresAt: 0 } };
    await createConnection(db, q.companyId, q.userId, { provider: "quickbooks", systemName: "QuickBooks Online (Intuit sandbox)", accountToken: JSON.stringify(creds) });
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string) =>
      new Response(
        JSON.stringify(String(input).includes("/tokens/bearer") ? { access_token: "new", refresh_token: "rt-new", expires_in: 3600 } : { QueryResponse: { Account: [] } }),
      )) as typeof fetch;
    try {
      const [row] = await withCompany(db, q.companyId, (tx) => tx.select().from(connections));
      await openConnector(row!, db).listAccounts();
    } finally {
      globalThis.fetch = realFetch;
    }
    const [after] = await withCompany(db, q.companyId, (tx) => tx.select().from(connections));
    expect(after!.accountTokenEnc).not.toContain("rt-new");
    expect(JSON.parse(decryptSecret(after!.accountTokenEnc!)).tokens).toMatchObject({ accessToken: "new", refreshToken: "rt-new" });
  });

  it("encrypts provider tokens so the database never holds them in the clear", async () => {
    const sealed = encryptSecret("acct-token-123", "k".repeat(32));
    expect(sealed).not.toContain("acct-token-123");
    expect(decryptSecret(sealed, "k".repeat(32))).toBe("acct-token-123");
    expect(() => decryptSecret(sealed, "x".repeat(32))).toThrow();
    const d = await freshCompany("Token Co");
    await createConnection(db, d.companyId, d.userId, { provider: "merge", systemName: "Xero", accountToken: "acct-token-123" });
    const [row] = await withCompany(db, d.companyId, (tx) => tx.execute<{ t: string }>(sql`select account_token_enc as t from connections`));
    expect(row!.t).not.toContain("acct-token-123");
    expect(decryptSecret(row!.t)).toBe("acct-token-123");
  });
});

describe("variance explanations", () => {
  const draft = (categoryId: string, text: string) => ({ categoryId, text, citedTransactionIds: ["t1"], source: "rules" as const, confidence: "medium" as const, promptVersion: "test/1", deltaMinor: 42_000_00 });

  it("stores drafts per line and view, then records a person's decision", async () => {
    const a = await freshCompany("Explain Co");
    expect(scopeOf(["2026-09"])).toBe("2026-09");
    expect(scopeOf(["2026-01", "2026-02", "2026-03"])).toBe("2026-01..2026-03");
    expect(await saveDrafts(db, a.companyId, a.userId, ["2026-09"], [draft("rd-cro", "First draft."), draft("rd-cmc", "CMC draft.")])).toBe(2);
    let list = await listExplanations(db, a.companyId, ["2026-09"]);
    expect(list.get("rd-cro")).toMatchObject({ status: "ai_draft", text: "First draft.", citedTransactionIds: ["t1"] });
    expect((await listExplanations(db, a.companyId, ["2026-08"])).size).toBe(0);

    await decideExplanation(db, a.companyId, a.userId, ["2026-09"], "rd-cro", { action: "edit", text: "  Meridian billed two new sites early.  " });
    await decideExplanation(db, a.companyId, a.userId, ["2026-09"], "rd-cmc", { action: "reject" });
    list = await listExplanations(db, a.companyId, ["2026-09"]);
    expect(list.get("rd-cro")).toMatchObject({ status: "edited", text: "Meridian billed two new sites early.", decidedByName: "Explain Co CFO" });
    expect(list.get("rd-cmc")?.status).toBe("rejected");

    // Drafting again leaves decided lines alone, unless asked to replace them.
    await saveDrafts(db, a.companyId, a.userId, ["2026-09"], [draft("rd-cro", "Second draft."), draft("rd-cmc", "CMC again.")]);
    list = await listExplanations(db, a.companyId, ["2026-09"]);
    expect(list.get("rd-cro")?.text).toBe("Meridian billed two new sites early.");
    expect(list.get("rd-cmc")).toMatchObject({ status: "ai_draft", text: "CMC again." });
    await saveDrafts(db, a.companyId, a.userId, ["2026-09"], [draft("rd-cro", "Third draft.")], true);
    expect((await listExplanations(db, a.companyId, ["2026-09"])).get("rd-cro")).toMatchObject({ status: "ai_draft", text: "Third draft.", decidedByName: null });

    await expect(decideExplanation(db, a.companyId, a.userId, ["2026-09"], "ga-people", { action: "accept" })).rejects.toThrow(/no draft/);
    await expect(decideExplanation(db, a.companyId, a.userId, ["2026-09"], "rd-cro", { action: "edit", text: " " })).rejects.toThrow(/1,200/);
    const audit = await withCompany(db, a.companyId, (tx) => tx.execute<{ action: string }>(sql`select action from audit_events order by at`));
    expect(audit.map((r) => r.action)).toEqual(expect.arrayContaining(["explanation.draft", "explanation.edit", "explanation.reject"]));
  });
});

describe("review packs and audit log", () => {
  it("approving locks the month's explanations until someone reopens it", async () => {
    const a = await freshCompany("Pack Co");
    const d = { categoryId: "rd-cro", text: "Draft.", citedTransactionIds: [], source: "rules" as const, confidence: "medium" as const, promptVersion: "test/1", deltaMinor: 1 };
    await saveDrafts(db, a.companyId, a.userId, ["2026-09"], [d]);
    expect(await getPack(db, a.companyId, "2026-09")).toBeNull();

    await approvePack(db, a.companyId, a.userId, "2026-09", { total: 123 });
    const pack = await getPack<{ total: number }>(db, a.companyId, "2026-09");
    expect(pack).toMatchObject({ status: "approved", snapshot: { total: 123 }, approvedByName: "Pack Co CFO" });
    await expect(approvePack(db, a.companyId, a.userId, "2026-09", {})).rejects.toThrow(/already approved/);
    await expect(decideExplanation(db, a.companyId, a.userId, ["2026-09"], "rd-cro", { action: "accept" })).rejects.toThrow(/locked/);
    await expect(saveDrafts(db, a.companyId, a.userId, ["2026-09"], [d])).rejects.toThrow(/locked/);
    // Other months and year-to-date views stay open.
    expect(await saveDrafts(db, a.companyId, a.userId, ["2026-08"], [d])).toBe(1);
    expect(await saveDrafts(db, a.companyId, a.userId, ["2026-01", "2026-09"], [d])).toBe(1);

    await expect(reopenPack(db, a.companyId, a.userId, "2026-09", "  ")).rejects.toThrow(/why/);
    await reopenPack(db, a.companyId, a.userId, "2026-09", "Late CRO invoice");
    expect(await getPack(db, a.companyId, "2026-09")).toMatchObject({ status: "reopened", reopenedByName: "Pack Co CFO" });
    await decideExplanation(db, a.companyId, a.userId, ["2026-09"], "rd-cro", { action: "accept" });
    await expect(reopenPack(db, a.companyId, a.userId, "2026-09", "again")).rejects.toThrow(/not approved/);
    await approvePack(db, a.companyId, a.userId, "2026-09", { total: 456 });
    expect((await listPacks(db, a.companyId)).map((p) => [p.period, p.status])).toEqual([["2026-09", "approved"]]);

    // Another company sees none of it.
    const b = await freshCompany("Other Pack Co");
    expect(await getPack(db, b.companyId, "2026-09")).toBeNull();
    expect(await listAuditEvents(db, b.companyId, { area: "pack" })).toHaveLength(0);
  });

  it("lists the audit log newest first, by area and page", async () => {
    const a = await freshCompany("Audit Co");
    await approvePack(db, a.companyId, a.userId, "2026-08", {});
    await recordPackExport(db, a.companyId, a.userId, "2026-08", "pdf");
    await renameCompany(db, a.companyId, a.userId, "  Audit Co Inc  ");
    await renameCompany(db, a.companyId, a.userId, "Audit Co Inc"); // no change, no event
    await expect(renameCompany(db, a.companyId, a.userId, " ")).rejects.toThrow(/company name/);
    const all = await listAuditEvents(db, a.companyId);
    expect(all.map((e) => e.action)).toEqual(["company.renamed", "pack.exported", "pack.approved"]);
    expect(all[0]).toMatchObject({ target: "Audit Co Inc", detail: { from: "Audit Co" }, actorName: "Audit Co CFO" });
    expect((await listAuditEvents(db, a.companyId, { area: "pack" })).map((e) => e.action)).toEqual(["pack.exported", "pack.approved"]);
    expect((await listAuditEvents(db, a.companyId, { before: all[1]!.at })).map((e) => e.action)).toEqual(["pack.approved"]);
    expect((await getSession(db, a.token))?.company?.name).toBe("Audit Co Inc");
  });
});

describe("clinical trials", () => {
  const items = [
    { driver: "monthly" as const, unitCost: 10_000_00, units: 12 },
    { driver: "visit" as const, unitCost: 500_00, units: 100 },
  ];
  const input = { code: "HX-9-001", name: "Test study", programCode: "HX-9", croName: "Test CRO", phase: "Phase 1", start: "2026-01", end: "2026-12", items };

  it("stores a trial, its change orders and CRO activity", async () => {
    const a = await freshCompany("Trial Co");
    const id = await createTrial(db, a.companyId, a.userId, input);
    await expect(createTrial(db, a.companyId, a.userId, input)).rejects.toThrow(/already a trial/);
    await expect(createTrial(db, a.companyId, a.userId, { ...input, code: "X", end: "2025-12" })).rejects.toThrow(TrialError);
    await expect(createTrial(db, a.companyId, a.userId, { ...input, code: "X", items: [{ driver: "visit", unitCost: 0, units: 0 }] })).rejects.toThrow(/priced line/);

    expect(await addChangeOrder(db, a.companyId, a.userId, id, { effective: "2026-03", description: "More visits", items: [{ driver: "visit", unitCost: 600_00, units: 50 }] })).toBe(1);
    expect(await addChangeOrder(db, a.companyId, a.userId, id, { effective: "2026-05", description: "Extension", items: [{ driver: "monthly", unitCost: 10_000_00, units: 3 }] })).toBe(2);
    await saveActivity(db, a.companyId, a.userId, id, [{ period: "2026-01", sites: 1, patients: 2, visits: 10 }], "manual");
    await saveActivity(db, a.companyId, a.userId, id, [{ period: "2026-01", sites: 1, patients: 2, visits: 12 }, { period: "2026-02", sites: 0, patients: 1, visits: 20 }], "manual");
    await expect(saveActivity(db, a.companyId, a.userId, id, [{ period: "2026-02", sites: -1, patients: 0, visits: 0 }], "manual")).rejects.toThrow(/whole number/);

    const [t] = await listTrials(db, a.companyId);
    expect(t).toMatchObject({ code: "HX-9-001", croName: "Test CRO", end: "2026-12" });
    expect(t!.contract.changeOrders.map((c) => c.number)).toEqual([1, 2]);
    expect(t!.activity.map((x) => [x.period, x.visits])).toEqual([["2026-01", 12], ["2026-02", 20]]);
    expect(estimateAccrual(t!.contract, t!.activity, new Map(), "2026-02").earned).toBe(2 * 10_000_00 + 32 * 500_00);

    const other = await freshCompany("Other Trial Co");
    expect(await listTrials(db, other.companyId)).toEqual([]);
    const audit = await withCompany(db, a.companyId, (tx) => tx.execute<{ action: string }>(sql`select action from audit_events where action like 'trial.%'`));
    expect(audit.map((r) => r.action).sort()).toEqual(["trial.activity", "trial.activity", "trial.change_order", "trial.change_order", "trial.created"]);
  });

  it("imports a CRO activity report and lists the rows it skipped", async () => {
    const a = await freshCompany("Import Trial Co");
    await createTrial(db, a.companyId, a.userId, input);
    const table = parseCsv(
      ["Study ID,Month,Sites activated,Patients enrolled,Visits", "HX-9-001,2026-01,2,3,40", "hx-9-001,02/2026,0,1,\"1,050\"", "HX-9-001,Mar 2026,,,", "NOPE,2026-01,1,1,1", "HX-9-001,someday,1,1,1", "HX-9-001,2026-04,1.5,1,1"].join("\n"),
    );
    const res = await importActivity(db, a.companyId, a.userId, table);
    expect(res.saved).toEqual([{ trial: "HX-9-001", months: 3 }]);
    expect(res.errors).toEqual(['Row 5: no trial "NOPE".', 'Row 6: "someday" is not a month.', "Row 7: counts must be whole numbers of zero or more."]);
    const [t] = await listTrials(db, a.companyId);
    expect(t!.activity.map((x) => [x.period, x.sites, x.patients, x.visits])).toEqual([["2026-01", 2, 3, 40], ["2026-02", 0, 1, 1050], ["2026-03", 0, 0, 0]]);
    await expect(importActivity(db, a.companyId, a.userId, parseCsv("Trial,Month\nHX-9-001,2026-01"))).rejects.toThrow(/Missing: sites, patients, visits/);
  });

  it("loads the sample trials with the sample books, and their accruals match the fixtures", async () => {
    const a = await freshCompany("Sample Trial Co");
    await loadSampleData(db, a.companyId, a.userId);
    await loadSampleData(db, a.companyId, a.userId).catch(() => undefined); // a second load never duplicates trials
    const stored = await listTrials(db, a.companyId);
    expect(stored.map((t) => t.code)).toEqual(["HX-101-201", "HX-204-101"]);
    const ledger = (await loadLedger(db, a.companyId)).data;
    const fixture = new Ledger(generateSampleCompany()).data;
    for (const [i, t] of generateSampleTrials().entries()) {
      const mine = estimateAccrual(stored[i]!.contract, stored[i]!.activity, billedForTrial(ledger, stored[i]!), "2026-09");
      const expected = estimateAccrual(t.contract, t.activity, billedForTrial(fixture, t), "2026-09");
      expect(mine.accrual).toBe(expected.accrual);
    }
  });
});

describe("close checklist", () => {
  it("assigns owners and reviewers, and keeps preparing and signing off apart", async () => {
    const a = await freshCompany("Close Co");
    const admin = { userId: a.userId, role: "admin" as const };
    const add = async (name: string, role: "finance" | "viewer") => {
      const email = `${name.toLowerCase()}-${a.email}`;
      const { tempPassword } = await addMember(db, a.userId, a.companyId, { name, email, role });
      const s = (await getSession(db, (await signIn(db, email, tempPassword!)).token))!;
      return { userId: s.user.id, role };
    };
    const fin = await add("Farah", "finance");
    const head = await add("Hugo", "viewer"); // a department head with read-only access

    const tasks = await listCloseTasks(db, a.companyId, "2026-09");
    expect(tasks.map((t) => t.key).slice(0, 4)).toEqual(["synced", "bank", "mapped", "reconciled"]);
    expect(tasks.every((t) => !t.preparedAt)).toBe(true);
    expect((await listCloseTasks(db, a.companyId, "2026-09")).length).toBe(tasks.length); // created once

    // Only admins and finance assign; the reviewer must be someone else; assignees must be members.
    await expect(assignCloseTask(db, a.companyId, head, "2026-09", "flux", { ownerId: head.userId, reviewerId: null })).rejects.toThrow(CloseError);
    await expect(assignCloseTask(db, a.companyId, admin, "2026-09", "flux", { ownerId: fin.userId, reviewerId: fin.userId })).rejects.toThrow(/someone other/);
    const outsider = await freshCompany("Outside Co");
    await expect(assignCloseTask(db, a.companyId, admin, "2026-09", "flux", { ownerId: outsider.userId, reviewerId: null })).rejects.toThrow(/in this company/);
    await assignCloseTask(db, a.companyId, fin, "2026-09", "flux", { ownerId: head.userId, reviewerId: fin.userId });
    await assignCloseTask(db, a.companyId, admin, "2026-09", "bank", { ownerId: fin.userId, reviewerId: a.userId });

    // A viewer can tick off a task they own, and nothing else.
    await expect(prepareCloseTask(db, a.companyId, head, "2026-09", "bank", true)).rejects.toThrow(/owner/);
    await prepareCloseTask(db, a.companyId, head, "2026-09", "flux", true);
    // Automatic tasks can't be ticked by hand.
    await expect(prepareCloseTask(db, a.companyId, admin, "2026-09", "mapped", true)).rejects.toThrow(/itself/);

    // Sign-off: only the reviewer (or an admin), only once prepared, never by the preparer.
    await expect(reviewCloseTask(db, a.companyId, head, "2026-09", "flux")).rejects.toThrow(/reviewer/);
    await expect(reviewCloseTask(db, a.companyId, admin, "2026-09", "bank")).rejects.toThrow(/ticked/);
    await expect(prepareCloseTask(db, a.companyId, admin, "2026-09", "bank", true)).rejects.toThrow(/reviewer/);
    await prepareCloseTask(db, a.companyId, fin, "2026-09", "bank", true);
    await reviewCloseTask(db, a.companyId, admin, "2026-09", "bank");
    await reviewCloseTask(db, a.companyId, fin, "2026-09", "flux");
    const after = await listCloseTasks(db, a.companyId, "2026-09");
    expect(after.find((t) => t.key === "flux")).toMatchObject({ ownerName: "Hugo", reviewerName: "Farah", preparedByName: "Hugo", reviewedByName: "Farah" });
    expect(after.find((t) => t.key === "bank")).toMatchObject({ preparedByName: "Farah", reviewedByName: "Close Co CFO" });

    // Un-ticking clears the sign-off.
    await prepareCloseTask(db, a.companyId, fin, "2026-09", "bank", false);
    expect((await listCloseTasks(db, a.companyId, "2026-09")).find((t) => t.key === "bank")).toMatchObject({ preparedAt: null, reviewedAt: null });

    // The team's own task, and owners, carry forward to the next month; ticks don't.
    await expect(addCloseTask(db, a.companyId, head, "2026-09", { title: "Nope", section: "books", dueDay: 2 })).rejects.toThrow(CloseError);
    const key = await addCloseTask(db, a.companyId, fin, "2026-09", { title: "Reconcile grant receivable", section: "books", dueDay: 4 });
    const oct = await listCloseTasks(db, a.companyId, "2026-10");
    expect(oct.find((t) => t.key === key)).toMatchObject({ title: "Reconcile grant receivable", custom: true, dueDay: 4 });
    expect(oct.find((t) => t.key === "flux")).toMatchObject({ ownerId: head.userId, reviewerId: fin.userId, preparedAt: null, reviewedAt: null });

    const audit = await withCompany(db, a.companyId, (tx) => tx.execute<{ action: string }>(sql`select action from audit_events where action like 'close.%'`));
    expect(new Set(audit.map((r) => r.action))).toEqual(new Set(["close.assigned", "close.prepared", "close.reviewed", "close.reopened", "close.task_added"]));
    // Another company sees none of it.
    expect((await listCloseTasks(db, outsider.companyId, "2026-09")).every((t) => !t.ownerId)).toBe(true);
  });

  it("an approved month refuses checklist changes and comments until reopened", async () => {
    const a = await freshCompany("Locked Close Co");
    const admin = { userId: a.userId, role: "admin" as const };
    await addComment(db, a.companyId, a.userId, "2026-09", "task:bank", "Statement requested from the bank.");
    await approvePack(db, a.companyId, a.userId, "2026-09", { ok: true });
    await expect(prepareCloseTask(db, a.companyId, admin, "2026-09", "bank", true)).rejects.toThrow(/locked/);
    await expect(assignCloseTask(db, a.companyId, admin, "2026-09", "bank", { ownerId: a.userId, reviewerId: null })).rejects.toThrow(/locked/);
    await expect(addCloseTask(db, a.companyId, admin, "2026-09", { title: "Late task", section: "books", dueDay: 2 })).rejects.toThrow(/locked/);
    await expect(addComment(db, a.companyId, a.userId, "2026-09", "task:bank", "Too late")).rejects.toThrow(/locked/);
    await reopenPack(db, a.companyId, a.userId, "2026-09", "Bank statement arrived");
    await addComment(db, a.companyId, a.userId, "2026-09", "task:bank", "Reconciled.");
    expect((await listComments(db, a.companyId, "2026-09")).map((c) => c.body)).toEqual(["Statement requested from the bank.", "Reconciled."]);
    await expect(addComment(db, a.companyId, a.userId, "2026-09", "row:123", "x")).rejects.toThrow(/line or a task/);
  });

  it("comments stay on their line through a re-sync, and post-close changes never alter the approved pack", async () => {
    process.env.CONNECTION_SECRET_KEY ??= "test-secret-key-for-connection-tokens";
    const TODAY = "2026-09-30";
    const a = await freshCompany("Resync Co");
    await createConnection(db, a.companyId, a.userId, { provider: "sandbox", systemName: "QuickBooks Online (sandbox)" });
    await runSync(db, a.companyId, { trigger: "initial", actorId: a.userId, today: TODAY });
    await addComment(db, a.companyId, a.userId, "2026-09", "line:rd-cro", "Meridian change order 4 started in July.");
    const cro = (l: Ledger) => l.actual({ periods: ["2026-09"], categoryIds: ["rd-cro"] });
    const before = cro(new Ledger((await loadLedger(db, a.companyId)).data));
    await approvePack(db, a.companyId, a.userId, "2026-09", { cro: before });

    // The source edits a September CRO invoice and deletes another after approval.
    const data = generateSampleCompany();
    const sept = data.transactions.filter((t) => t.date.startsWith("2026-09") && t.categoryId === "rd-cro");
    const edited = {
      ...data,
      transactions: data.transactions.filter((t) => t.id !== sept[1]!.id).map((t) => (t.id === sept[0]!.id ? { ...t, amount: t.amount + 50_000_00 } : t)),
    };
    const res = await runSync(db, a.companyId, { trigger: "manual", today: TODAY, connector: sandboxConnector({ data: edited }) });
    expect(res).toMatchObject({ updated: 1, deleted: 1 });
    expect(cro(new Ledger((await loadLedger(db, a.companyId)).data))).not.toBe(before);

    expect(await getPack<{ cro: number }>(db, a.companyId, "2026-09")).toMatchObject({ status: "approved", snapshot: { cro: before } });
    expect(await listComments(db, a.companyId, "2026-09")).toMatchObject([{ anchor: "line:rd-cro", body: "Meridian change order 4 started in July.", authorName: "Resync Co CFO" }]);
  });
});

describe("board pack share links", () => {
  it("shares only approved months, expires, can be revoked, and stops working when the month is reopened", async () => {
    const a = await freshCompany("Share Co");
    const input = { period: "2026-09", label: "Board of directors", note: "Ahead of Thursday's meeting.", days: 14 };
    await expect(createShareLink(db, a.companyId, a.userId, input)).rejects.toThrow(/Approve the Sep 2026 review pack/);
    await approvePack(db, a.companyId, a.userId, "2026-09", { total: 1 });
    await expect(createShareLink(db, a.companyId, a.userId, { ...input, days: 365 })).rejects.toThrow(ShareError);
    await expect(createShareLink(db, a.companyId, a.userId, { ...input, label: " " })).rejects.toThrow(ShareError);

    const t0 = new Date("2026-10-14T12:00:00Z");
    const link = await createShareLink(db, a.companyId, a.userId, input, t0);
    expect(link.expiresAt.toISOString()).toBe("2026-10-28T12:00:00.000Z");
    // Only a hash is stored.
    const [stored] = await db.select().from(shareLinks).where(eq(shareLinks.id, link.id));
    expect(stored!.tokenHash).not.toContain(link.token);
    expect(JSON.stringify(stored)).not.toContain(link.token);

    const opened = await openShareLink<{ total: number }>(db, link.token, "view", t0);
    expect(opened).toMatchObject({ status: "active", snapshot: { total: 1 }, label: "Board of directors", note: "Ahead of Thursday's meeting.", approvedByName: "Share Co CFO" });
    await openShareLink(db, link.token, "pdf", t0);
    expect(await openShareLink(db, link.token, "view", new Date("2026-10-28T12:00:01Z"))).toEqual({ status: "expired" });
    expect(await openShareLink(db, "not-a-real-token-at-all-xx", "view")).toEqual({ status: "missing" });
    expect(await openShareLink(db, "x'; drop table share_links; --", "view")).toEqual({ status: "missing" });

    const [row] = await listShareLinks(db, a.companyId, "2026-09", t0);
    expect(row).toMatchObject({ label: "Board of directors", viewCount: 2, status: "active", createdByName: "Share Co CFO" });

    // Reopening withdraws the link; approving again doesn't bring it back.
    await reopenPack(db, a.companyId, a.userId, "2026-09", "Late invoice");
    expect(await openShareLink(db, link.token, "view", t0)).toEqual({ status: "withdrawn" });
    await approvePack(db, a.companyId, a.userId, "2026-09", { total: 2 });
    expect(await openShareLink(db, link.token, "view", t0)).toEqual({ status: "withdrawn" });

    const fresh = await createShareLink(db, a.companyId, a.userId, input, t0);
    expect(await openShareLink(db, fresh.token, "view", t0)).toMatchObject({ status: "active", snapshot: { total: 2 } });
    // Another company can't revoke it.
    const b = await freshCompany("Other Share Co");
    await expect(revokeShareLink(db, b.companyId, b.userId, fresh.id)).rejects.toThrow(ShareError);
    expect(await listShareLinks(db, b.companyId, "2026-09")).toHaveLength(0);
    await revokeShareLink(db, a.companyId, a.userId, fresh.id);
    expect(await openShareLink(db, fresh.token, "view", t0)).toEqual({ status: "revoked" });
    await expect(revokeShareLink(db, a.companyId, a.userId, fresh.id)).rejects.toThrow(/already revoked/);

    const audit = await listAuditEvents(db, a.companyId, { area: "share" });
    expect(audit.map((e) => e.action).sort()).toEqual(["share.created", "share.created", "share.downloaded", "share.revoked", "share.viewed", "share.viewed"]);
  });
});

describe("tenant isolation", () => {
  it("row-level security is enabled and forced on every tenant table", async () => {
    const rows = await db.execute<{ relname: string; on: boolean; forced: boolean }>(
      sql`select relname, relrowsecurity as on, relforcerowsecurity as forced from pg_class where relname in ${sql.raw(`(${TENANT_TABLES.map((t) => `'${t}'`).join(",")})`)}`,
    );
    expect(rows).toHaveLength(TENANT_TABLES.length);
    for (const r of rows) expect([r.relname, r.on, r.forced]).toEqual([r.relname, true, true]);
  });

  it("one company never sees or writes another company's rows", async () => {
    const a = await freshCompany("Tenant A");
    const b = await freshCompany("Tenant B");
    const table = parseCsv("Date,Account,Account Name,Amount\n2026-09-01,6110,CRO services,12345\n");
    const id = await createDraft(db, a.companyId, a.userId, "ledger", "a.csv", table);
    await commitImport(db, a.companyId, a.userId, id, guessColumns(table.headers, "ledger"));

    expect((await loadLedger(db, a.companyId)).data.transactions).toHaveLength(1);
    expect((await loadLedger(db, b.companyId)).data.transactions).toHaveLength(0);
    for (const t of TENANT_TABLES) {
      const [r] = await withCompany(db, b.companyId, (tx) => tx.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(t)} where company_id = ${a.companyId}`));
      expect(r?.n, t).toBe(0);
    }
    // Without a company set, nothing is visible at all.
    expect(await db.select().from(transactions)).toHaveLength(0);
    // B cannot read A's draft import by id, or write rows tagged with A's company.
    expect(await withCompany(db, b.companyId, (tx) => tx.execute(sql`select * from imports where id = ${id}`))).toHaveLength(0);
    const [aTxn] = await withCompany(db, a.companyId, (tx) => tx.select().from(transactions));
    const forged = await withCompany(db, b.companyId, (tx) => tx.insert(transactions).values({ ...aTxn!, id: undefined, sourceHash: "forged" })).catch((e) => e);
    expect(String(forged?.cause ?? forged)).toMatch(/row-level security/);
    await withCompany(db, b.companyId, (tx) => tx.update(transactions).set({ memo: "tampered" }).where(eq(transactions.id, aTxn!.id)));
    const [still] = await withCompany(db, a.companyId, (tx) => tx.select().from(transactions).where(eq(transactions.id, aTxn!.id)));
    expect(still?.memo).toBe("");
  });
});
