-- Events table stores all raw events
-- Optimizations:
-- 1. Use LowCardinality(String) for fields with limited distinct values
-- 2. Reorder ORDER BY to prioritize time-based queries
-- 3. Add materialized views for common aggregations
-- 4. Remove Nullable where 0 is a sensible default

CREATE TABLE IF NOT EXISTS analytics.events (
  id UUID,
  client_id String,
  event_name String,
  anonymous_id String,
  time DateTime64(3, 'UTC'),
  session_id String,
  
  event_type LowCardinality(String) DEFAULT 'track', -- 'track', 'error', 'web_vitals'
  event_id Nullable(String), -- UUID from client for deduplication
  session_start_time Nullable(DateTime64(3, 'UTC')), -- New session tracking
  timestamp DateTime64(3, 'UTC') DEFAULT time, -- Alias for new format
  
  referrer Nullable(String),
  url String,
  path String,
  title Nullable(String),
  
  ip String,
  user_agent String,
  browser_name Nullable(String),
  browser_version Nullable(String),
  os_name Nullable(String),
  os_version Nullable(String),
  device_type Nullable(String),
  device_brand Nullable(String),
  device_model Nullable(String),
  country Nullable(String),
  region Nullable(String),
  city Nullable(String),
  
  screen_resolution Nullable(String),
  viewport_size Nullable(String),
  language Nullable(String),
  timezone Nullable(String),
  
  connection_type Nullable(String),
  rtt Nullable(Int16),
  downlink Nullable(Float32), -- New field
  
  time_on_page Nullable(Float32),
  scroll_depth Nullable(Float32),
  interaction_count Nullable(Int16),
  exit_intent UInt8,
  page_count UInt8 DEFAULT 1,
  is_bounce UInt8 DEFAULT 1,
  has_exit_intent Nullable(UInt8), -- New field
  page_size Nullable(Int32),
  
  utm_source Nullable(String),
  utm_medium Nullable(String),
  utm_campaign Nullable(String),
  utm_term Nullable(String),
  utm_content Nullable(String),
  
  load_time Nullable(Int32),
  dom_ready_time Nullable(Int32),
  dom_interactive Nullable(Int32), -- New field
  ttfb Nullable(Int32),
  connection_time Nullable(Int32),
  request_time Nullable(Int32),
  render_time Nullable(Int32),
  redirect_time Nullable(Int32), -- New field
  domain_lookup_time Nullable(Int32), -- New field
  
  fcp Nullable(Int32),
  lcp Nullable(Int32),
  cls Nullable(Float32),
  fid Nullable(Int32), -- New field
  inp Nullable(Int32), -- New field
  
  href Nullable(String),
  text Nullable(String),
  
  value Nullable(String),
  
  error_message Nullable(String),
  error_filename Nullable(String),
  error_lineno Nullable(Int32),
  error_colno Nullable(Int32),
  error_stack Nullable(String),
  error_type Nullable(String),
  
  properties String,
  
  created_at DateTime64(3, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(time)
ORDER BY (client_id, time, id)
SETTINGS index_granularity = 8192;
