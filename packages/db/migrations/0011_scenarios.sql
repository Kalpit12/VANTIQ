CREATE TABLE "scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"revenue_change_bp" integer DEFAULT 0 NOT NULL,
	"cost_change_bp" integer DEFAULT 0 NOT NULL,
	"drivers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"overrides" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scenarios_kind_idx" ON "scenarios" USING btree ("company_id","kind");--> statement-breakpoint
ALTER TABLE "scenarios" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scenarios" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "scenarios_tenant" ON "scenarios" USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid) WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);
