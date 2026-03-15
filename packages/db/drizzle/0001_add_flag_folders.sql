ALTER TABLE "flags" ADD COLUMN "folder" text;
CREATE INDEX "idx_flags_folder" ON "flags" ("folder");
