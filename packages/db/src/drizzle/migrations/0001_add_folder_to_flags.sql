-- Add folder column to flags table to support organizing flags into folders
ALTER TABLE "flags" ADD COLUMN "folder" text;

-- Create an index on folder for better query performance  
CREATE INDEX "idx_flags_folder" ON "flags" ("folder") WHERE "folder" IS NOT NULL;