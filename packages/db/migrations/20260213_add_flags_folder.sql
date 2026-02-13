ALTER TABLE "flags" ADD COLUMN IF NOT EXISTS "folder" text;

CREATE INDEX IF NOT EXISTS "idx_flags_website_folder"
	ON "flags" USING btree ("website_id", "folder");
