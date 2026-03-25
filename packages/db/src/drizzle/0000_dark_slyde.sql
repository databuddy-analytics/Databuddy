CREATE TYPE "public"."annotation_type" AS ENUM('point', 'line', 'range');--> statement-breakpoint
CREATE TYPE "public"."api_key_type" AS ENUM('user', 'sdk', 'automation');--> statement-breakpoint
CREATE TYPE "public"."api_resource_type" AS ENUM('global', 'website', 'ab_experiment', 'feature_flag', 'analytics_data', 'error_data', 'web_vitals', 'custom_events', 'export_data');--> statement-breakpoint
CREATE TYPE "public"."api_scope" AS ENUM('read:data', 'write:llm', 'write:data', 'read:analytics', 'write:custom-sql', 'read:export', 'write:otel', 'admin:apikeys', 'admin:users', 'admin:organizations', 'admin:websites', 'rate:standard', 'rate:premium', 'rate:enterprise', 'read:experiments', 'track:events', 'read:links', 'write:links');--> statement-breakpoint
CREATE TYPE "public"."chart_type" AS ENUM('metrics');--> statement-breakpoint
CREATE TYPE "public"."db_permission_level" AS ENUM('readonly', 'admin');--> statement-breakpoint
CREATE TYPE "public"."feedback_category" AS ENUM('bug_report', 'feature_request', 'ux_improvement', 'performance', 'documentation', 'other');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."flag_status" AS ENUM('active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."flag_type" AS ENUM('boolean', 'rollout', 'multivariant');--> statement-breakpoint
CREATE TYPE "public"."FunnelStepType" AS ENUM('PAGE_VIEW', 'EVENT', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."MemberRole" AS ENUM('owner', 'admin', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."OrganizationRole" AS ENUM('admin', 'owner', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."Role" AS ENUM('ADMIN', 'USER', 'EARLY_ADOPTER', 'INVESTOR', 'BETA_TESTER', 'GUEST');--> statement-breakpoint
CREATE TYPE "public"."UserStatus" AS ENUM('ACTIVE', 'SUSPENDED', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."VerificationStatus" AS ENUM('PENDING', 'VERIFIED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."WebsiteStatus" AS ENUM('ACTIVE', 'HEALTHY', 'UNHEALTHY', 'INACTIVE', 'PENDING');--> statement-breakpoint
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
CREATE TABLE "annotations" (
	"id" text PRIMARY KEY NOT NULL,
	"website_id" text NOT NULL,
	"chart_type" chart_type NOT NULL,
	"chart_context" jsonb NOT NULL,
	"annotation_type" "annotation_type" NOT NULL,
	"x_value" timestamp (3) NOT NULL,
	"x_end_value" timestamp (3),
	"y_value" integer,
	"text" text NOT NULL,
	"tags" text[],
	"color" text DEFAULT '#3B82F6' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"start" text NOT NULL,
	"key_hash" text NOT NULL,
	"user_id" text,
	"organization_id" text,
	"type" "api_key_type" DEFAULT 'user' NOT NULL,
	"scopes" "api_scope"[] DEFAULT '{}' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"revoked_at" timestamp,
	"rate_limit_enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_time_window" integer,
	"rate_limit_max" integer,
	"expires_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"website_id" text NOT NULL,
	"title" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text,
	"model_type" text NOT NULL,
	"sql" text,
	"chart_type" text,
	"response_type" text,
	"final_result" jsonb,
	"text_response" text,
	"thinking_steps" text[],
	"has_error" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"downvotes" integer DEFAULT 0 NOT NULL,
	"feedback_comments" jsonb,
	"ai_response_time" integer,
	"total_processing_time" integer,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"debug_logs" text[],
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" "feedback_category" NOT NULL,
	"status" "feedback_status" DEFAULT 'pending' NOT NULL,
	"credits_awarded" integer DEFAULT 0 NOT NULL,
	"admin_notes" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"credits_spent" integer NOT NULL,
	"reward_type" text NOT NULL,
	"reward_amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text,
	"description" text,
	"type" "flag_type" DEFAULT 'boolean' NOT NULL,
	"status" "flag_status" DEFAULT 'active' NOT NULL,
	"default_value" jsonb DEFAULT 'false'::jsonb NOT NULL,
	"payload" jsonb,
	"rules" jsonb DEFAULT '[]'::jsonb,
	"persist_across_auth" boolean DEFAULT false NOT NULL,
	"rollout_percentage" integer DEFAULT 0,
	"rollout_by" text,
	"website_id" text,
	"organization_id" text,
	"user_id" text,
	"created_by" text NOT NULL,
	"variants" jsonb DEFAULT '[]'::jsonb,
	"dependencies" text[],
	"target_group_ids" text[],
	"environment" text,
	"folder" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "flags_to_target_groups" (
	"flag_id" text NOT NULL,
	"target_group_id" text NOT NULL,
	CONSTRAINT "flags_to_target_groups_flag_id_target_group_id_pk" PRIMARY KEY("flag_id","target_group_id")
);
--> statement-breakpoint
CREATE TABLE "funnel_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"websiteId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"steps" jsonb NOT NULL,
	"filters" jsonb,
	"ignoreHistoricData" boolean DEFAULT false NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"deletedAt" timestamp (3)
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
	"ignoreHistoricData" boolean DEFAULT false NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"deletedAt" timestamp (3)
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "links" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"target_url" text NOT NULL,
	"expires_at" timestamp with time zone,
	"expired_redirect_url" text,
	"og_title" text,
	"og_description" text,
	"og_image_url" text,
	"og_video_url" text,
	"ios_url" text,
	"android_url" text,
	"external_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "revenue_config" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"website_id" text,
	"webhook_hash" text NOT NULL,
	"stripe_webhook_secret" text,
	"paddle_webhook_secret" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp(3) NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text,
	"active_organization_id" text
);
--> statement-breakpoint
CREATE TABLE "sso_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"oidc_config" text,
	"saml_config" text,
	"user_id" text,
	"provider_id" text NOT NULL,
	"organization_id" text,
	"domain" text NOT NULL,
	"domain_verified" boolean
);
--> statement-breakpoint
CREATE TABLE "target_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"website_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3)
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
CREATE TABLE "uptime_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"website_id" text,
	"organization_id" text NOT NULL,
	"url" text NOT NULL,
	"name" text,
	"granularity" text NOT NULL,
	"cron" text NOT NULL,
	"is_paused" boolean DEFAULT false NOT NULL,
	"timeout" integer,
	"cache_bust" boolean DEFAULT false NOT NULL,
	"json_parsing_config" jsonb,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_alert_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"feature_id" text NOT NULL,
	"alert_type" text NOT NULL,
	"email_sent_to" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"timezone" text DEFAULT 'auto' NOT NULL,
	"dateFormat" text DEFAULT 'MMM D, YYYY' NOT NULL,
	"timeFormat" text DEFAULT 'h:mm a' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
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
	"isPublic" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"deletedAt" timestamp (3),
	"organization_id" text NOT NULL,
	"integrations" jsonb,
	"settings" jsonb
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."assistant_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_redemptions" ADD CONSTRAINT "feedback_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_redemptions" ADD CONSTRAINT "feedback_redemptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "flags_to_target_groups" ADD CONSTRAINT "flags_to_target_groups_flag_id_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags_to_target_groups" ADD CONSTRAINT "flags_to_target_groups_target_group_id_target_groups_id_fk" FOREIGN KEY ("target_group_id") REFERENCES "public"."target_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funnel_definitions" ADD CONSTRAINT "funnel_definitions_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "funnel_definitions" ADD CONSTRAINT "funnel_definitions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_config" ADD CONSTRAINT "revenue_config_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target_groups" ADD CONSTRAINT "target_groups_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "target_groups" ADD CONSTRAINT "target_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_schedules" ADD CONSTRAINT "uptime_schedules_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "uptime_schedules" ADD CONSTRAINT "uptime_schedules_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_alert_log" ADD CONSTRAINT "usage_alert_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_userId_idx" ON "account" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "accounts_accountId_idx" ON "account" USING btree ("account_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_unique" ON "account" USING btree ("provider_id" text_ops,"account_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_annotations_created_by" ON "annotations" USING btree ("created_by" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "apikey_key_hash_unique" ON "apikey" USING btree ("key_hash" text_ops);--> statement-breakpoint
CREATE INDEX "idx_assistant_conversations_user_id" ON "assistant_conversations" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "assistant_messages_conversation_id_idx" ON "assistant_messages" USING btree ("conversation_id" text_ops);--> statement-breakpoint
CREATE INDEX "assistant_messages_createdAt_idx" ON "assistant_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feedback_user_id_idx" ON "feedback" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "feedback_organization_id_idx" ON "feedback" USING btree ("organization_id" text_ops);--> statement-breakpoint
CREATE INDEX "feedback_status_idx" ON "feedback" USING btree ("status");--> statement-breakpoint
CREATE INDEX "feedback_redemptions_user_id_idx" ON "feedback_redemptions" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "feedback_redemptions_organization_id_idx" ON "feedback_redemptions" USING btree ("organization_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "flags_key_website_unique" ON "flags" USING btree ("key","website_id") WHERE "flags"."website_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "flags_key_org_unique" ON "flags" USING btree ("key","organization_id") WHERE "flags"."organization_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "flags_key_user_unique" ON "flags" USING btree ("key","user_id") WHERE "flags"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_flags_created_by" ON "flags" USING btree ("created_by" text_ops);--> statement-breakpoint
CREATE INDEX "idx_flags_website_folder" ON "flags" USING btree ("website_id","folder");--> statement-breakpoint
CREATE INDEX "flags_to_target_groups_flag_id_idx" ON "flags_to_target_groups" USING btree ("flag_id");--> statement-breakpoint
CREATE INDEX "flags_to_target_groups_target_group_id_idx" ON "flags_to_target_groups" USING btree ("target_group_id");--> statement-breakpoint
CREATE INDEX "idx_funnel_definitions_createdBy" ON "funnel_definitions" USING btree ("createdBy" text_ops);--> statement-breakpoint
CREATE INDEX "idx_goals_createdBy" ON "goals" USING btree ("createdBy" text_ops);--> statement-breakpoint
CREATE INDEX "invitations_organizationId_idx" ON "invitation" USING btree ("organization_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_invitation_inviter_id" ON "invitation" USING btree ("inviter_id" text_ops);--> statement-breakpoint
CREATE INDEX "links_organization_id_idx" ON "links" USING btree ("organization_id" text_ops);--> statement-breakpoint
CREATE INDEX "links_created_by_idx" ON "links" USING btree ("created_by" text_ops);--> statement-breakpoint
CREATE INDEX "links_external_id_idx" ON "links" USING btree ("external_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "links_slug_unique" ON "links" USING btree ("slug" text_ops);--> statement-breakpoint
CREATE INDEX "members_userId_idx" ON "member" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "members_organizationId_idx" ON "member" USING btree ("organization_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_organization_logo" ON "organization" USING btree ("logo" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "revenue_config_webhook_hash_unique" ON "revenue_config" USING btree ("webhook_hash" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "revenue_config_owner_website_unique" ON "revenue_config" USING btree ("owner_id","website_id");--> statement-breakpoint
CREATE INDEX "revenue_config_owner_id_idx" ON "revenue_config" USING btree ("owner_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_key" ON "session" USING btree ("token" text_ops);--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "session" USING btree ("userId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "sso_provider_provider_id_unique" ON "sso_provider" USING btree ("provider_id" text_ops);--> statement-breakpoint
CREATE INDEX "sso_provider_organization_id_idx" ON "sso_provider" USING btree ("organization_id" text_ops);--> statement-breakpoint
CREATE INDEX "sso_provider_domain_idx" ON "sso_provider" USING btree ("domain" text_ops);--> statement-breakpoint
CREATE INDEX "idx_sso_provider_user_id" ON "sso_provider" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "target_groups_website_id_idx" ON "target_groups" USING btree ("website_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_target_groups_created_by" ON "target_groups" USING btree ("created_by" text_ops);--> statement-breakpoint
CREATE INDEX "team_organizationId_idx" ON "team" USING btree ("organization_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_two_factor_user_id" ON "two_factor" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "uptime_schedules_website_id_idx" ON "uptime_schedules" USING btree ("website_id" text_ops);--> statement-breakpoint
CREATE INDEX "uptime_schedules_organization_id_idx" ON "uptime_schedules" USING btree ("organization_id" text_ops);--> statement-breakpoint
CREATE INDEX "usage_alert_log_user_id_idx" ON "usage_alert_log" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "usage_alert_log_user_feature_idx" ON "usage_alert_log" USING btree ("user_id" text_ops,"feature_id" text_ops);--> statement-breakpoint
CREATE INDEX "usage_alert_log_created_at_idx" ON "usage_alert_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences" USING btree ("userId" text_ops);--> statement-breakpoint
CREATE INDEX "verifications_expiresAt_idx" ON "verification" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "websites_org_domain_unique" ON "websites" USING btree ("organization_id","domain");