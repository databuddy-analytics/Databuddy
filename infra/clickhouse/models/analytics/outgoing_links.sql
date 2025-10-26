-- ============================================================================
-- Outgoing Links Table
-- ============================================================================
-- External link clicks and outbound traffic tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics.outgoing_links (
    id UUID,
    client_id String,
    anonymous_id String,
    session_id String,
    href String,
    text Nullable(String),
    properties JSON,
    timestamp DateTime64(3, 'UTC') DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (client_id, timestamp, id)
SETTINGS index_granularity = 8192;
