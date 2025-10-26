-- ============================================================================
-- Custom Events Table
-- ============================================================================
-- User-defined custom events and tracking data beyond standard page views
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics.custom_events (
    id UUID,
    client_id String,
    event_name String,
    anonymous_id String,
    session_id String,
    properties JSON,
    timestamp DateTime64(3, 'UTC') DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (client_id, timestamp, id)
SETTINGS index_granularity = 8192;
