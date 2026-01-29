DO $$ BEGIN
	CREATE TYPE "AlarmTriggerType" AS ENUM ('uptime', 'traffic_spike', 'error_rate', 'goal', 'custom');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
	CREATE TYPE "AlarmTriggerStatus" AS ENUM ('down', 'up');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "alarms" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"website_id" text,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"notification_channels" text[] DEFAULT '{}'::text[] NOT NULL,
	"slack_webhook_url" text,
	"discord_webhook_url" text,
	"email_addresses" text[] DEFAULT '{}'::text[] NOT NULL,
	"webhook_url" text,
	"webhook_headers" jsonb DEFAULT '{}'::jsonb,
	"trigger_type" "AlarmTriggerType" NOT NULL,
	"trigger_conditions" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "alarms_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade,
	CONSTRAINT "alarms_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade,
	CONSTRAINT "alarms_website_id_website_id_fk" FOREIGN KEY ("website_id") REFERENCES "websites"("id") ON DELETE set null
);

CREATE INDEX IF NOT EXISTS "alarms_user_id_idx" ON "alarms" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "alarms_organization_id_idx" ON "alarms" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "alarms_website_id_idx" ON "alarms" USING btree ("website_id");
CREATE INDEX IF NOT EXISTS "alarms_enabled_idx" ON "alarms" USING btree ("enabled");

CREATE TABLE IF NOT EXISTS "alarm_state" (
	"alarm_id" text NOT NULL,
	"website_id" text NOT NULL,
	"status" "AlarmTriggerStatus" DEFAULT 'up' NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"down_started_at" timestamp(3),
	"last_checked_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "alarm_state_alarm_id_alarms_id_fk" FOREIGN KEY ("alarm_id") REFERENCES "alarms"("id") ON DELETE cascade,
	CONSTRAINT "alarm_state_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "websites"("id") ON DELETE cascade,
	CONSTRAINT "alarm_state_alarm_id_pk" PRIMARY KEY ("alarm_id")
);

CREATE INDEX IF NOT EXISTS "alarm_state_website_id_idx" ON "alarm_state" USING btree ("website_id");

CREATE TABLE IF NOT EXISTS "alarm_trigger_history" (
	"id" text PRIMARY KEY NOT NULL,
	"alarm_id" text NOT NULL,
	"website_id" text NOT NULL,
	"status" "AlarmTriggerStatus" NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb,
	"triggered_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "alarm_trigger_history_alarm_id_alarms_id_fk" FOREIGN KEY ("alarm_id") REFERENCES "alarms"("id") ON DELETE cascade,
	CONSTRAINT "alarm_trigger_history_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "websites"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "alarm_trigger_history_alarm_id_idx" ON "alarm_trigger_history" USING btree ("alarm_id");
CREATE INDEX IF NOT EXISTS "alarm_trigger_history_website_id_idx" ON "alarm_trigger_history" USING btree ("website_id");
