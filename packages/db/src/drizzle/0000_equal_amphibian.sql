CREATE TYPE "public"."ab_test_status" AS ENUM('draft', 'running', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."ab_variant_type" AS ENUM('visual', 'redirect', 'code');--> statement-breakpoint
CREATE TYPE "public"."api_key_type" AS ENUM('user', 'sdk', 'automation');--> statement-breakpoint
CREATE TYPE "public"."api_scope" AS ENUM('read:data', 'write:data', 'read:experiments', 'track:events', 'admin:apikeys');--> statement-breakpoint
CREATE TYPE "public"."FunnelGoalType" AS ENUM('COMPLETION', 'STEP_CONVERSION', 'TIME_TO_CONVERT');--> statement-breakpoint
CREATE TYPE "public"."FunnelStepType" AS ENUM('PAGE_VIEW', 'EVENT', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."MemberRole" AS ENUM('owner', 'admin', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."OrganizationRole" AS ENUM('admin', 'owner', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."Role" AS ENUM('ADMIN', 'USER', 'EARLY_ADOPTER', 'INVESTOR', 'BETA_TESTER', 'GUEST');--> statement-breakpoint
CREATE TYPE "public"."UserStatus" AS ENUM('ACTIVE', 'SUSPENDED', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."VerificationStatus" AS ENUM('PENDING', 'VERIFIED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."WebsiteStatus" AS ENUM('ACTIVE', 'HEALTHY', 'UNHEALTHY', 'INACTIVE', 'PENDING');--> statement-breakpoint
CREATE TABLE "ab_experiments" (
	"id" text PRIMARY KEY NOT NULL,
	"websiteId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "ab_test_status" DEFAULT 'draft' NOT NULL,
	"trafficAllocation" integer DEFAULT 100 NOT NULL,
	"startDate" timestamp(3),
	"endDate" timestamp(3),
	"primaryGoal" text,
	"createdBy" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"deletedAt" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "ab_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"experimentId" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"target" text NOT NULL,
	"description" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ab_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"experimentId" text NOT NULL,
	"name" text NOT NULL,
	"type" "ab_variant_type" DEFAULT 'visual' NOT NULL,
	"content" jsonb NOT NULL,
	"trafficWeight" integer DEFAULT 50 NOT NULL,
	"isControl" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"start" text NOT NULL,
	"key" text NOT NULL,
	"user_id" text,
	"organization_id" text,
	"type" "api_key_type" DEFAULT 'user' NOT NULL,
	"scopes" "api_scope"[] DEFAULT '{}' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_time_window" integer,
	"rate_limit_max" integer,
	"request_count" integer DEFAULT 0 NOT NULL,
	"remaining" integer,
	"last_request" timestamp,
	"last_refill_at" timestamp,
	"refill_interval" integer,
	"refill_amount" integer,
	"expires_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funnel_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"websiteId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"steps" jsonb NOT NULL,
	"filters" jsonb,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"deletedAt" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "funnel_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"funnelId" text NOT NULL,
	"goalType" "FunnelGoalType" NOT NULL,
	"targetValue" text,
	"description" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" text PRIMARY KEY NOT NULL,
	"websiteId" text NOT NULL,
	"type" text NOT NULL,
	"target" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"filters" jsonb,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"deletedAt" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member',
	"team_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"team_id" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp(3) NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text,
	"active_organization_id" text
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"firstName" text,
	"lastName" text,
	"status" "UserStatus" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deletedAt" timestamp(3),
	"role" "Role" DEFAULT 'USER' NOT NULL,
	"two_factor_enabled" boolean,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"timezone" text DEFAULT 'auto' NOT NULL,
	"dateFormat" text DEFAULT 'MMM D, YYYY' NOT NULL,
	"timeFormat" text DEFAULT 'h:mm a' NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_stripe_config" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"webhook_token" text NOT NULL,
	"stripe_secret_key" text NOT NULL,
	"stripe_publishable_key" text,
	"webhook_secret" text NOT NULL,
	"is_live_mode" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_webhook_at" timestamp,
	"webhook_failure_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "websites" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"name" text,
	"status" "WebsiteStatus" DEFAULT 'ACTIVE' NOT NULL,
	"userId" text,
	"isPublic" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"deletedAt" timestamp(3),
	"organization_id" text
);
--> statement-breakpoint
ALTER TABLE "ab_experiments" ADD CONSTRAINT "ab_experiments_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ab_experiments" ADD CONSTRAINT "ab_experiments_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ab_goals" ADD CONSTRAINT "ab_goals_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "public"."ab_experiments"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ab_variants" ADD CONSTRAINT "ab_variants_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "public"."ab_experiments"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funnel_definitions" ADD CONSTRAINT "funnel_definitions_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "funnel_definitions" ADD CONSTRAINT "funnel_definitions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "funnel_goals" ADD CONSTRAINT "funnel_goals_funnelId_fkey" FOREIGN KEY ("funnelId") REFERENCES "public"."funnel_definitions"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_stripe_config" ADD CONSTRAINT "user_stripe_config_userId_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_organizationId_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "ab_experiments_websiteId_idx" ON "ab_experiments" USING btree ("websiteId");--> statement-breakpoint
CREATE INDEX "ab_experiments_createdBy_idx" ON "ab_experiments" USING btree ("createdBy");--> statement-breakpoint
CREATE INDEX "ab_experiments_status_idx" ON "ab_experiments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ab_goals_experimentId_idx" ON "ab_goals" USING btree ("experimentId");--> statement-breakpoint
CREATE INDEX "ab_variants_experimentId_idx" ON "ab_variants" USING btree ("experimentId");--> statement-breakpoint
CREATE INDEX "apikey_user_id_idx" ON "apikey" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "apikey_organization_id_idx" ON "apikey" USING btree ("organization_id" text_ops);--> statement-breakpoint
CREATE INDEX "apikey_prefix_idx" ON "apikey" USING btree ("prefix" text_ops);--> statement-breakpoint
CREATE INDEX "apikey_enabled_idx" ON "apikey" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "funnel_definitions_createdBy_idx" ON "funnel_definitions" USING btree ("createdBy" text_ops);--> statement-breakpoint
CREATE INDEX "funnel_definitions_websiteId_idx" ON "funnel_definitions" USING btree ("websiteId" text_ops);--> statement-breakpoint
CREATE INDEX "funnel_goals_funnelId_idx" ON "funnel_goals" USING btree ("funnelId" text_ops);--> statement-breakpoint
CREATE INDEX "goals_websiteId_idx" ON "goals" USING btree ("websiteId" text_ops);--> statement-breakpoint
CREATE INDEX "goals_createdBy_idx" ON "goals" USING btree ("createdBy" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_key" ON "session" USING btree ("token" text_ops);--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("userId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences" USING btree ("userId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "user_stripe_config_userId_key" ON "user_stripe_config" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "user_stripe_config_webhookToken_key" ON "user_stripe_config" USING btree ("webhook_token" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "websites_user_domain_unique" ON "websites" USING btree ("userId","domain") WHERE "websites"."organization_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "websites_org_domain_unique" ON "websites" USING btree ("organization_id","domain") WHERE "websites"."organization_id" is not null;--> statement-breakpoint
CREATE INDEX "websites_userId_idx" ON "websites" USING btree ("userId" text_ops);