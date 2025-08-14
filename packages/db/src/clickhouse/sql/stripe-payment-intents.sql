-- Stripe Payment Intents table
CREATE TABLE IF NOT EXISTS analytics.stripe_payment_intents (
  id String,
  client_id String,
  webhook_token String,
  created DateTime64(3, 'UTC'),
  status LowCardinality(String),
  currency LowCardinality(String),
  amount UInt64,
  amount_received UInt64,
  amount_capturable UInt64,
  livemode UInt8,
  metadata JSON,
  payment_method_types Array(String),
  failure_reason Nullable(String),
  canceled_at Nullable(DateTime64(3, 'UTC')),
  cancellation_reason Nullable(String),
  description Nullable(String),
  application_fee_amount Nullable(UInt64),
  setup_future_usage Nullable(String),
  session_id Nullable(String),
  created_at DateTime64(3, 'UTC') DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created)
ORDER BY (client_id, webhook_token, created, id)
SETTINGS index_granularity = 8192;
