CREATE TABLE "income_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"counterparty" text NOT NULL,
	"program_code" text,
	"award" bigint,
	"receipts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "income_sources" ADD CONSTRAINT "income_sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "income_sources_name_idx" ON "income_sources" USING btree ("company_id","name");--> statement-breakpoint
ALTER TABLE "income_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "income_sources" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "income_sources_tenant" ON "income_sources" USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid) WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);
