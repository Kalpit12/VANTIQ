-- Row-level security: each tenant table only shows rows for app.company_id,
-- which withCompany() sets per transaction. FORCE applies the policy to the
-- table owner too, since managed Postgres apps usually connect as the owner.

ALTER TABLE "source_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "source_accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "source_accounts_tenant" ON "source_accounts" USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid) WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "account_mappings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account_mappings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "account_mappings_tenant" ON "account_mappings" USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid) WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "programs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "programs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "programs_tenant" ON "programs" USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid) WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "vendors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vendors" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "vendors_tenant" ON "vendors" USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid) WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "departments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "departments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "departments_tenant" ON "departments" USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid) WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "imports" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "imports_tenant" ON "imports" USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid) WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transactions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "transactions_tenant" ON "transactions" USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid) WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "budget_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "budget_lines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "budget_lines_tenant" ON "budget_lines" USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid) WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "cash_balances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cash_balances" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "cash_balances_tenant" ON "cash_balances" USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid) WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "audit_events_tenant" ON "audit_events" USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid) WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);--> statement-breakpoint
