import { Ledger, periodRange } from "@vantiq/domain";
import { generateSampleCompany, sampleFiles } from "@vantiq/fixtures";
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
  listDueConnections,
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
