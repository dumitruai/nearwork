CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_unique" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_match_id_unique" UNIQUE("match_id")
);
--> statement-breakpoint
CREATE TABLE "employee_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"radius_meters" integer DEFAULT 5000 NOT NULL,
	"location_source" text,
	"demo_preset_key" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "radius_check" CHECK ("employee_preferences"."radius_meters" IN (1000,5000,10000,20000)),
	CONSTRAINT "location_check" CHECK ((("employee_preferences"."location_source" IS NULL AND "employee_preferences"."demo_preset_key" IS NULL) OR
    ("employee_preferences"."location_source" = 'device' AND "employee_preferences"."demo_preset_key" IS NULL) OR
    ("employee_preferences"."location_source" = 'demo' AND "employee_preferences"."demo_preset_key" IS NOT NULL AND "employee_preferences"."demo_preset_key" IN ('camden','stratford'))) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "employee_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"profile_type" text DEFAULT 'employee' NOT NULL,
	"bio" text,
	"categories" text[] NOT NULL,
	"availability" text[] NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_type_check" CHECK ("employee_profiles"."profile_type" = 'employee'),
	CONSTRAINT "employee_categories_check" CHECK (cardinality("employee_profiles"."categories") > 0 AND "employee_profiles"."categories" <@ ARRAY['hospitality','retail','delivery','cleaning','warehouse']::text[] AND array_position("employee_profiles"."categories", NULL) IS NULL),
	CONSTRAINT "employee_availability_check" CHECK (cardinality("employee_profiles"."availability") > 0 AND "employee_profiles"."availability" <@ ARRAY['morning','afternoon','evening','weekend']::text[] AND array_position("employee_profiles"."availability", NULL) IS NULL),
	CONSTRAINT "employee_bio_check" CHECK ("employee_profiles"."bio" IS NULL OR length("employee_profiles"."bio") <= 500)
);
--> statement-breakpoint
CREATE TABLE "employer_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"profile_type" text DEFAULT 'employer' NOT NULL,
	"company_name" text NOT NULL,
	"industry" text NOT NULL,
	"workplace_label" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"seed_key" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employer_profiles_seed_key_unique" UNIQUE("seed_key"),
	CONSTRAINT "employer_type_check" CHECK ("employer_profiles"."profile_type" = 'employer'),
	CONSTRAINT "employer_coordinates_check" CHECK ("employer_profiles"."latitude" BETWEEN -90 AND 90 AND "employer_profiles"."longitude" BETWEEN -180 AND 180),
	CONSTRAINT "employer_name_check" CHECK (length(trim("employer_profiles"."company_name")) BETWEEN 1 AND 160)
);
--> statement-breakpoint
CREATE TABLE "job_decisions" (
	"employee_user_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_decisions_employee_user_id_job_id_pk" PRIMARY KEY("employee_user_id","job_id"),
	CONSTRAINT "decision_check" CHECK ("job_decisions"."decision" IN ('pass','interested'))
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_user_id" text NOT NULL,
	"seed_key" text,
	"role" text NOT NULL,
	"category" text NOT NULL,
	"hourly_pay_minor" integer NOT NULL,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"weekly_hours_min" integer NOT NULL,
	"weekly_hours_max" integer NOT NULL,
	"availability" text[] NOT NULL,
	"schedule_summary" text NOT NULL,
	"description" text NOT NULL,
	"area_label" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"mock_employer_interested" boolean,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_seed_key_unique" UNIQUE("seed_key"),
	CONSTRAINT "job_role_check" CHECK (length(trim("jobs"."role")) BETWEEN 1 AND 160),
	CONSTRAINT "job_category_check" CHECK ("jobs"."category" = ANY(ARRAY['hospitality','retail','delivery','cleaning','warehouse']::text[])),
	CONSTRAINT "job_pay_check" CHECK ("jobs"."hourly_pay_minor" > 0 AND "jobs"."currency" = 'GBP'),
	CONSTRAINT "job_hours_check" CHECK ("jobs"."weekly_hours_min" > 0 AND "jobs"."weekly_hours_max" >= "jobs"."weekly_hours_min" AND "jobs"."weekly_hours_max" <= 168),
	CONSTRAINT "job_availability_check" CHECK (cardinality("jobs"."availability") > 0 AND "jobs"."availability" <@ ARRAY['morning','afternoon','evening','weekend']::text[] AND array_position("jobs"."availability", NULL) IS NULL),
	CONSTRAINT "job_coordinates_check" CHECK ("jobs"."latitude" BETWEEN -90 AND 90 AND "jobs"."longitude" BETWEEN -180 AND 180),
	CONSTRAINT "job_demo_check" CHECK (("jobs"."is_demo" AND "jobs"."mock_employer_interested" IS NOT NULL) OR (NOT "jobs"."is_demo" AND "jobs"."mock_employer_interested" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_user_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_pair_unique" UNIQUE("employee_user_id","job_id"),
	CONSTRAINT "match_source_check" CHECK ("matches"."source" IN ('employer_acceptance','demo'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_user_id" text NOT NULL,
	"client_message_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_retry_unique" UNIQUE("conversation_id","sender_user_id","client_message_id"),
	CONSTRAINT "message_body_check" CHECK (length(trim("messages"."body")) > 0 AND length("messages"."body") <= 4000)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"profile_type" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_id_type_unique" UNIQUE("id","profile_type"),
	CONSTRAINT "users_profile_type_check" CHECK ("users"."profile_type" IN ('employee','employer'))
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_preferences" ADD CONSTRAINT "employee_preferences_user_id_employee_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."employee_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_user_id_profile_type_users_id_profile_type_fk" FOREIGN KEY ("user_id","profile_type") REFERENCES "public"."users"("id","profile_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_profiles" ADD CONSTRAINT "employer_profiles_user_id_profile_type_users_id_profile_type_fk" FOREIGN KEY ("user_id","profile_type") REFERENCES "public"."users"("id","profile_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_decisions" ADD CONSTRAINT "job_decisions_employee_user_id_employee_profiles_user_id_fk" FOREIGN KEY ("employee_user_id") REFERENCES "public"."employee_profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_decisions" ADD CONSTRAINT "job_decisions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_employer_user_id_employer_profiles_user_id_fk" FOREIGN KEY ("employer_user_id") REFERENCES "public"."employer_profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_employee_user_id_job_id_job_decisions_employee_user_id_job_id_fk" FOREIGN KEY ("employee_user_id","job_id") REFERENCES "public"."job_decisions"("employee_user_id","job_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "decisions_job_idx" ON "job_decisions" USING btree ("job_id","decision","created_at","employee_user_id");--> statement-breakpoint
CREATE INDEX "decisions_saved_idx" ON "job_decisions" USING btree ("employee_user_id","created_at" DESC NULLS LAST,"job_id") WHERE "job_decisions"."decision" = 'interested';--> statement-breakpoint
CREATE INDEX "jobs_employer_idx" ON "jobs" USING btree ("employer_user_id");--> statement-breakpoint
CREATE INDEX "matches_employee_idx" ON "matches" USING btree ("employee_user_id","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "matches_job_idx" ON "matches" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "messages_history_idx" ON "messages" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "messages_sender_idx" ON "messages" USING btree ("sender_user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");