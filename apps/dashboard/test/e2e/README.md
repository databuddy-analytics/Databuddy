# Dashboard E2E plumbing

This folder contains the local DB/session plumbing used by dashboard E2E tests.

Read [`STANDARDS.md`](./STANDARDS.md) before adding or changing E2E tests.

## Isolated database

Use `run-local.sh` to create a per-run Postgres database, push the Drizzle schema into it, start local ClickHouse, initialize the ClickHouse schema, run a command, and drop the Postgres database on exit:

```bash
bun run --cwd apps/dashboard test:e2e:local
bun run --cwd apps/dashboard test:e2e:local:regression
bun run --cwd apps/dashboard test:e2e:local:core

# Or run an arbitrary command inside the isolated DB env:
apps/dashboard/test/e2e/run-local.sh bun run --cwd apps/dashboard dev
```

Set `DATABUDDY_E2E_KEEP_DB=true` to keep the Postgres database for debugging.

## ClickHouse analytics data

Local E2E starts the `clickhouse` service from `docker-compose.yaml`, waits for `/ping`, and initializes the ClickHouse schema. Nothing is seeded by default; a test that needs analytics asks for the `seededAnalytics` fixture, which seeds the session website and returns the counts it wrote.

Useful toggles:

```bash
DATABUDDY_E2E_START_CLICKHOUSE=false  # do not start docker compose clickhouse
DATABUDDY_E2E_CLICKHOUSE_EVENTS=500   # seed size for tests that use seededAnalytics
DATABUDDY_E2E_SERVE_BUILD=true        # build once and serve with next start, as CI does
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

## Fixtures

`fixtures.ts` extends Playwright's `test` with:

| Fixture | What it gives you |
|---|---|
| `e2eSession` | A fresh user, organization, and (by default) the "E2E Website" `e2e.databuddy.local`. |
| `authenticatedPage` | `page` with that session's cookies. Destructure it as `authenticatedPage: page`. |
| `withWebsite` | Option. `test.use({ withWebsite: false })` gives a fresh account with no website, for onboarding flows. |
| `seededAnalytics` | Seeds ClickHouse for the session website and returns `AnalyticsSeed` counts. Opt in only when the test reads analytics. |
| `mockRpc(procedure, reply)` | Answers `**/rpc/<procedure>` with a value, or with `reply(input)` for stateful mocks. Handles the CORS preflight. |

Also exported: `expect`, `fulfillRpc(page, route, json, status)` for hand-written routes that need gating, `corsHeaders(page)`, `testKey()`, and `TRACKING_VERIFIED`, the `websites/isTrackingSetup` reply that lifts the no-events setup gate on `/websites/[id]` pages.
