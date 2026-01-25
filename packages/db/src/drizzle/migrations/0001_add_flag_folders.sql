-- Migration: Add flag folders support
-- Issue: #271 - Add folder system to organize feature flags in dashboard UI

-- Create flag_folders table
CREATE TABLE IF NOT EXISTS "flag_folders" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"icon" text DEFAULT 'folder',
	"position" integer DEFAULT 0 NOT NULL,
	"website_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL,
	"deleted_at" timestamp(3)
);

-- Add indexes for flag_folders
CREATE INDEX IF NOT EXISTS "flag_folders_website_id_idx" ON "flag_folders" USING btree ("website_id");
CREATE INDEX IF NOT EXISTS "idx_flag_folders_created_by" ON "flag_folders" USING btree ("created_by");

-- Add foreign keys for flag_folders
ALTER TABLE "flag_folders" ADD CONSTRAINT "flag_folders_website_id_fkey" 
	FOREIGN KEY ("website_id") REFERENCES "websites"("id") 
	ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "flag_folders" ADD CONSTRAINT "flag_folders_created_by_fkey" 
	FOREIGN KEY ("created_by") REFERENCES "user"("id") 
	ON UPDATE CASCADE ON DELETE RESTRICT;

-- Add folder_id column to flags table
ALTER TABLE "flags" ADD COLUMN IF NOT EXISTS "folder_id" text;

-- Add index for folder_id in flags
CREATE INDEX IF NOT EXISTS "idx_flags_folder_id" ON "flags" USING btree ("folder_id");

-- Add foreign key for folder_id in flags
ALTER TABLE "flags" ADD CONSTRAINT "flags_folder_id_fkey" 
	FOREIGN KEY ("folder_id") REFERENCES "flag_folders"("id") 
	ON UPDATE CASCADE ON DELETE SET NULL;
