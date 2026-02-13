CREATE TABLE IF NOT EXISTS "alarms" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "user_id" text,
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
  "conditions" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "alarms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade,
  CONSTRAINT "alarms_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE set null,
  CONSTRAINT "alarms_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "websites"("id") ON DELETE set null
);

CREATE INDEX IF NOT EXISTS "alarms_organization_id_idx" ON "alarms" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "alarms_user_id_idx" ON "alarms" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "alarms_website_id_idx" ON "alarms" USING btree ("website_id");
CREATE INDEX IF NOT EXISTS "alarms_enabled_idx" ON "alarms" USING btree ("enabled");
