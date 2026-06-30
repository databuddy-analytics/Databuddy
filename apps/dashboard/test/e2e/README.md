# Dashboard E2E plumbing

This folder contains the local DB/session plumbing used by dashboard E2E tests.

Read [`STANDARDS.md`](./STANDARDS.md) before adding or changing E2E tests.

## Isolated database

Use `run-local.sh` to create a per-run Postgres database, push the Drizzle schema into it, start local ClickHouse, initialize the ClickHouse schema, run a command, and drop the Postgres database on exit:

```bash
bun run --cwd apps/dashboard test:e2e:local
bun run --cwd apps/dashboard test:e2e:local:smoke
bun run --cwd apps/dashboard test:e2e:local:regression
bun run --cwd apps/dashboard test:e2e:local:pr

# Or run an arbitrary command inside the isolated DB env:
apps/dashboard/test/e2e/run-local.sh bun run --cwd apps/dashboard dev
```

Set `DATABUDDY_E2E_KEEP_DB=true` to keep the Postgres database for debugging.

## ClickHouse analytics data

Local E2E starts the `clickhouse` service from `docker-compose.yaml`, waits for `/ping`, initializes the ClickHouse schema, and seeds each test website with analytics data.

Useful toggles:

```bash
DATABUDDY_E2E_START_CLICKHOUSE=false  # do not start docker compose clickhouse
DATABUDDY_E2E_SEED_CLICKHOUSE=false  # do not seed per-test analytics data
DATABUDDY_E2E_CLICKHOUSE_EVENTS=500   # seed size per test website
CLICKHOUSE_URL=http://default:@localhost:8123/databuddy_analytics
```

## Session bootstrap

When `DATABUDDY_E2E_MODE=true` and `DATABUDDY_E2E_TEST_KEY` is set, tests can create a signed-in user via:

```http
POST /api/test/e2e/session
x-e2e-test-key: <DATABUDDY_E2E_TEST_KEY>
content-type: application/json

{
  "runScope": "local-run",
  "testScope": "api-key-delete",
  "withWebsite": true
}
```

The route returns `userId`, `organizationId`, and optionally `websiteId`, and forwards Better Auth `Set-Cookie` headers so browser tests can start authenticated. Outside E2E mode, the route returns `404`.
