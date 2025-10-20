-- ============================================================================
-- Web Vitals Table
-- ============================================================================
-- Core Web Vitals metrics for measuring user experience and page performance
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics.web_vitals (
    id UUID,
    client_id String,
    event_id Nullable(String),
    
    -- User identification
    anonymous_id String,
    session_id String,
    timestamp DateTime64(3, 'UTC'),
    
    -- Page information
    path String,
    
    -- Core Web Vitals
    fcp Nullable(Int32),  -- First Contentful Paint
    lcp Nullable(Int32),  -- Largest Contentful Paint
    cls Nullable(Float32), -- Cumulative Layout Shift
    fid Nullable(Int32),  -- First Input Delay
    inp Nullable(Int32),  -- Interaction to Next Paint
    
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
