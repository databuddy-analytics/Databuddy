-- ============================================================================
-- Errors Table
-- ============================================================================
-- JavaScript errors and exceptions captured from client-side applications
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics.errors (
    id UUID,
    client_id String,
    event_id Nullable(String),
    
    -- User identification
    anonymous_id String,
    session_id String,
    timestamp DateTime64(3, 'UTC'),
    
    -- Page information
    path String,
    
    -- Error details
    message String,
    filename Nullable(String),
    lineno Nullable(Int32),
    colno Nullable(Int32),
    stack Nullable(String),
    error_type Nullable(String),
    
    -- User information
    ip Nullable(String),
    user_agent Nullable(String),
    browser_name Nullable(String),
    browser_version Nullable(String),
    os_name Nullable(String),
    os_version Nullable(String),
    device_type Nullable(String),
    
    -- Geographic information
    country Nullable(String),
    region Nullable(String),
    
    created_at DateTime64(3, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (client_id, timestamp, id)
SETTINGS index_granularity = 8192;
