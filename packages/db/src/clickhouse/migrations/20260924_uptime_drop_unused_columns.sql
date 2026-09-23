-- Nothing writes these columns and Vector skips unknown fields, so this can be
-- applied before or after the deploy. ReplicatedMergeTree replicates the ALTER.
ALTER TABLE uptime.uptime_monitor
	DROP COLUMN IF EXISTS content_hash,
	DROP COLUMN IF EXISTS json_data;
