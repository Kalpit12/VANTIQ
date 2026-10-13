CREATE TABLE "explanations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"category_id" text NOT NULL,
	"text" text NOT NULL,
	"status" text NOT NULL,
	"cited_transaction_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text NOT NULL,
	"model" text,
	"prompt_version" text NOT NULL,
	"confidence" text NOT NULL,
	"drafted_delta_minor" bigint NOT NULL,
	"drafted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "explanations" ADD CONSTRAINT "explanations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "explanations" ADD CONSTRAINT "explanations_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "explanations" ADD CONSTRAINT "explanations_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "explanations_line_idx" ON "explanations" USING btree ("company_id","scope","category_id");--> statement-breakpoint
ALTER TABLE "explanations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "explanations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "explanations_tenant" ON "explanations" USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid) WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);
