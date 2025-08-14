-- Stripe Charges table
CREATE TABLE IF NOT EXISTS analytics.stripe_charges (
  id String,
  client_id String,
  webhook_token String,
  created DateTime64(3, 'UTC'),
  status LowCardinality(String),
  currency LowCardinality(String),
  amount UInt64,
  amount_captured UInt64,
  amount_refunded UInt64,
  paid UInt8,
  refunded UInt8,
  livemode UInt8,
  failure_code Nullable(String),
  failure_message Nullable(String),
  outcome_type Nullable(String),
  risk_level LowCardinality(String),
  card_brand LowCardinality(String),
  payment_intent_id Nullable(String),
  session_id Nullable(String),
  created_at DateTime64(3, 'UTC') DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created)
ORDER BY (client_id, webhook_token, created, id)
SETTINGS index_granularity = 8192;
