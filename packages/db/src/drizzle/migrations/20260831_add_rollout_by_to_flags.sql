-- Adds the rollout_by column to the flags table.
-- This column was defined in the Drizzle schema but not present in production,
-- causing every query to /public/v1/flags/bulk to return a 500 error
-- (PostgreSQL error 42703: column d0.rollout_by does not exist).
-- Apply this migration to production before or at the same time as deploying
-- any build that includes packages/db/src/drizzle/schema/flags.ts with rolloutBy.

ALTER TABLE flags ADD COLUMN IF NOT EXISTS rollout_by TEXT;
