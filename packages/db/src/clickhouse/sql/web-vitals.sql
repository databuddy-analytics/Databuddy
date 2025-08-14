-- Dedicated web vitals table for performance metrics
CREATE TABLE IF NOT EXISTS analytics.web_vitals (
  id UUID,
  client_id String,
  event_id Nullable(String),
  
  anonymous_id String,
  session_id String,
  timestamp DateTime64(3, 'UTC'),
  
  path String,
  
  fcp Nullable(Int32),
  lcp Nullable(Int32),
  cls Nullable(Float32),
  fid Nullable(Int32),
  inp Nullable(Int32),
  
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
