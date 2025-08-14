CREATE TABLE IF NOT EXISTS analytics.email_events (
    event_id UUID DEFAULT generateUUIDv4(),
    email_hash String,
    domain String,
    labels Array(LowCardinality(String)),
    event_time DateTime,
    received_at DateTime,
    ingestion_time DateTime DEFAULT now(),
    metadata_json JSON
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (domain, event_time)
SETTINGS index_granularity = 8192;
