CREATE TABLE "review_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"period" char(7) NOT NULL,
	"status" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone NOT NULL,
	"reopened_by" uuid,
	"reopened_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "review_packs" ADD CONSTRAINT "review_packs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_packs" ADD CONSTRAINT "review_packs_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_packs" ADD CONSTRAINT "review_packs_reopened_by_users_id_fk" FOREIGN KEY ("reopened_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_packs_period_idx" ON "review_packs" USING btree ("company_id","period");--> statement-breakpoint
ALTER TABLE "review_packs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "review_packs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "review_packs_tenant" ON "review_packs" USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid) WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);
