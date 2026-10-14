CREATE TABLE "trial_activity" (
	"company_id" uuid NOT NULL,
	"trial_id" uuid NOT NULL,
	"period" char(7) NOT NULL,
	"sites" integer DEFAULT 0 NOT NULL,
	"patients" integer DEFAULT 0 NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trial_activity_trial_id_period_pk" PRIMARY KEY("trial_id","period")
);
--> statement-breakpoint
CREATE TABLE "trials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"program_code" text,
	"cro_name" text NOT NULL,
	"phase" text NOT NULL,
	"start_period" char(7) NOT NULL,
	"end_period" char(7) NOT NULL,
	"items" jsonb NOT NULL,
	"change_orders" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trial_activity" ADD CONSTRAINT "trial_activity_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_activity" ADD CONSTRAINT "trial_activity_trial_id_trials_id_fk" FOREIGN KEY ("trial_id") REFERENCES "public"."trials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trials" ADD CONSTRAINT "trials_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trials_code_idx" ON "trials" USING btree ("company_id","code");--> statement-breakpoint
ALTER TABLE "trials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trials" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "trials_tenant" ON "trials" USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid) WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "trial_activity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trial_activity" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "trial_activity_tenant" ON "trial_activity" USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid) WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);
