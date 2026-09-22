-- Apply after deploying tracker and Basket code that stops sending these three
-- counters. The ClickHouse bootstrap command uses CREATE IF NOT EXISTS and will
-- not alter existing tables, so clusters created before 2026-09-22 keep the
-- columns until this runs. Nothing reads them: no builder in
-- packages/ai/src/query/builders/engagement.ts references them, and scroll_count
-- counted scroll events rather than gestures, so it reported hundreds per page
-- view. max_scroll_depth remains the meaningful scroll signal.
ALTER TABLE analytics.engagement_spans
	DROP COLUMN IF EXISTS scroll_count;

ALTER TABLE analytics.engagement_spans
	DROP COLUMN IF EXISTS key_count;

ALTER TABLE analytics.engagement_spans
	DROP COLUMN IF EXISTS copy_count;
