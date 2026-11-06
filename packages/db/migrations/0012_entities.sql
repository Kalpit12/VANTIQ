CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"currency" char(3) NOT NULL,
	"is_parent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"company_id" uuid NOT NULL,
	"period" char(7) NOT NULL,
	"currency" char(3) NOT NULL,
	"average_rate" numeric(22, 10) NOT NULL,
	"closing_rate" numeric(22, 10) NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rates_company_id_period_currency_pk" PRIMARY KEY("company_id","period","currency")
);
--> statement-breakpoint
CREATE TABLE "intercompany_pairs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"source_account_id" uuid NOT NULL,
	"counterparty_entity_id" uuid NOT NULL,
	"counterparty_account_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_balances" DROP CONSTRAINT "cash_balances_company_id_period_pk";--> statement-breakpoint
ALTER TABLE "budget_lines" ADD COLUMN "entity_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_balances" ADD COLUMN "entity_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "entity_id" uuid;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_pairs" ADD CONSTRAINT "intercompany_pairs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_pairs" ADD CONSTRAINT "intercompany_pairs_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_pairs" ADD CONSTRAINT "intercompany_pairs_source_account_id_source_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."source_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_pairs" ADD CONSTRAINT "intercompany_pairs_counterparty_entity_id_entities_id_fk" FOREIGN KEY ("counterparty_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_pairs" ADD CONSTRAINT "intercompany_pairs_counterparty_account_id_source_accounts_id_fk" FOREIGN KEY ("counterparty_account_id") REFERENCES "public"."source_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intercompany_pairs" ADD CONSTRAINT "intercompany_pairs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entities_code_idx" ON "entities" USING btree ("company_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "intercompany_pairs_side_idx" ON "intercompany_pairs" USING btree ("company_id","entity_id","source_account_id");--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_balances" ADD CONSTRAINT "cash_balances_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_balances" ADD CONSTRAINT "cash_balances_entity_period_key" UNIQUE NULLS NOT DISTINCT("company_id","entity_id","period");--> statement-breakpoint
ALTER TABLE "entities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "entities" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "entities_tenant" ON "entities" USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid) WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "fx_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fx_rates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "fx_rates_tenant" ON "fx_rates" USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid) WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "intercompany_pairs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "intercompany_pairs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "intercompany_pairs_tenant" ON "intercompany_pairs" USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid) WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);