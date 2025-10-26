-- ============================================================================
-- Events Table
-- ============================================================================
-- Main analytics events table storing all user interactions and page views
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics.events (
    id UUID,
    client_id String,
    event_name String,
    anonymous_id String,
    time DateTime64(3, 'UTC'),
    session_id String,
    
    -- Event metadata
    event_type LowCardinality(String) DEFAULT 'track',
    event_id Nullable(String),
    session_start_time Nullable(DateTime64(3, 'UTC')),
    timestamp DateTime64(3, 'UTC') DEFAULT time,
    
    -- Page information
    referrer Nullable(String),
    url String,
    path String,
    title Nullable(String),
    
    -- User information
    ip String,
    user_agent String,
    browser_name Nullable(String),
    browser_version Nullable(String),
    os_name Nullable(String),
    os_version Nullable(String),
    device_type Nullable(String),
    device_brand Nullable(String),
    device_model Nullable(String),
    
    -- Geographic information
    country Nullable(String),
    region Nullable(String),
    city Nullable(String),
    
    -- Device specifications
    screen_resolution Nullable(String),
    viewport_size Nullable(String),
    language Nullable(String),
    timezone Nullable(String),
    
    -- Network information
    connection_type Nullable(String),
    rtt Nullable(Int16),
    downlink Nullable(Float32),
    
    -- User behavior metrics
    time_on_page Nullable(Float32),
    scroll_depth Nullable(Float32),
    interaction_count Nullable(Int16),
    page_count UInt8 DEFAULT 1,
    
    -- UTM parameters
    utm_source Nullable(String),
    utm_medium Nullable(String),
    utm_campaign Nullable(String),
    utm_term Nullable(String),
    utm_content Nullable(String),
    
    -- Performance metrics
    load_time Nullable(Int32),
    dom_ready_time Nullable(Int32),
    dom_interactive Nullable(Int32),
    ttfb Nullable(Int32),
    connection_time Nullable(Int32),
    request_time Nullable(Int32),
    render_time Nullable(Int32),
    redirect_time Nullable(Int32),
    domain_lookup_time Nullable(Int32),
    
    -- Additional data
    properties String,
    created_at DateTime64(3, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(time)
ORDER BY (client_id, time, id)
SETTINGS index_granularity = 8192;
