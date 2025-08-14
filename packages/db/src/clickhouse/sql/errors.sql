-- Dedicated errors table for error events
CREATE TABLE IF NOT EXISTS analytics.errors (
  id UUID,
  client_id String,
  event_id Nullable(String),
  
  anonymous_id String,
  session_id String,
  timestamp DateTime64(3, 'UTC'),
  
  path String,
  
  message String,
  filename Nullable(String),
  lineno Nullable(Int32),
  colno Nullable(Int32),
  stack Nullable(String),
  error_type Nullable(String),
  
  ip Nullable(String),
  user_agent Nullable(String),
  browser_name Nullable(String),
  browser_version Nullable(String),
  os_name Nullable(String),
  os_version Nullable(String),
  device_type Nullable(String),
  country Nullable(String),
  region Nullable(String),
  
  created_at DateTime64(3, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (client_id, timestamp, id)
SETTINGS index_granularity = 8192;
