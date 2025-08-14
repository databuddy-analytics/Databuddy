-- Stripe Refunds table
CREATE TABLE IF NOT EXISTS analytics.stripe_refunds (
  id String,
  client_id String,
  webhook_token String,
  created DateTime64(3, 'UTC'),
  amount UInt64,
  status LowCardinality(String),
  reason LowCardinality(String),
  currency LowCardinality(String),
  charge_id String,
  payment_intent_id Nullable(String),
  metadata JSON,
  session_id Nullable(String),
  created_at DateTime64(3, 'UTC') DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created)
ORDER BY (client_id, webhook_token, created, id)
SETTINGS index_granularity = 8192;
