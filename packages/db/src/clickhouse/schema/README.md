# ClickHouse schema

The `.sql` files in this directory are the source of truth for our ClickHouse
schema. They mirror what is deployed in production (`SHOW CREATE TABLE`), so a
file here should always be byte-comparable to the live table definition. One
file per object, named exactly after the table/view it defines.

## Layout

Files are grouped by database, then by logical domain:

```
schema/
  analytics/
    core/         events, custom_events
    errors/       error_spans
    web-vitals/   web_vitals_spans, web_vitals_hourly, web_vitals_hourly_mv
    pageviews/    daily_pageviews, daily_pageviews_mv
    traffic/      blocked_traffic, ai_traffic_spans
    links/        outgoing_links, link_visits
    revenue/      revenue
  uptime/
    uptime_monitor
```

Materialized views keep the `_mv` suffix and live in the same domain as the
table they feed. Every statement is `CREATE ... IF NOT EXISTS`, so applying the
whole tree is idempotent and safe to re-run.

All tables use the `Replicated*MergeTree` engine family with `{shard}` /
`{replica}` macros, matching the production cluster. Single-node deployments
need ClickHouse Keeper enabled (a one-node Keeper is fine).

## Applying

Apply base tables first, then materialized views (an MV requires both the table
it reads from and the table it writes into to already exist):

```bash
# 1. base tables
find analytics uptime -name '*.sql' ! -name '*_mv.sql' | sort \
  | xargs -I{} clickhouse-client --queries-file {}

# 2. materialized views
find analytics -name '*_mv.sql' | sort \
  | xargs -I{} clickhouse-client --queries-file {}
```

## Changing an existing table

Never edit a shipped `.sql` in a way that assumes a fresh table — deployed
tables already exist. Instead:

1. Add a forward-only, dated `ALTER ... IF NOT EXISTS` to `changes/`.
2. Apply it to every environment.
3. Update the table's `.sql` here so it still mirrors the live definition.
