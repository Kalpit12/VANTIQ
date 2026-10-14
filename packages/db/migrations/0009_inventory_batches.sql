CREATE TABLE "inventory_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"product" text NOT NULL,
	"program_code" text,
	"lot" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit" text DEFAULT 'units' NOT NULL,
	"unit_cost" bigint NOT NULL,
	"expiry" date NOT NULL,
	"monthly_usage" integer,
	"location" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_batches_lot_idx" ON "inventory_batches" USING btree ("company_id","product","lot");--> statement-breakpoint
ALTER TABLE "inventory_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventory_batches" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "inventory_batches_tenant" ON "inventory_batches" USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid) WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);
