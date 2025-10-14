# @databuddy/db

Database package for PostgreSQL (Drizzle ORM) and ClickHouse. Includes clients, schemas, setup utilities, and a modular seeding system used for demos/tests.

## Package structure

- `src/client.ts` – Drizzle client for PostgreSQL (Node/Postgres)
- `src/drizzle/` – Drizzle schema and relations
  - `schema.ts` – table definitions
  - `relations.ts` – relations graph
- `src/clickhouse/` – ClickHouse client + schema + setup
  - `client.ts` – client, retry wrapper, helpers (`TABLE_NAMES`, `chQuery`, `chCommand`, date utils)
  - `schema.ts` – SQL DDL for analytics/observability tables
  - `setup.ts` – creates databases/tables
  - `index.ts` – barrel export
- `src/seed/` – modular data seeding (pure factories + scenarios + CLI)
  - `context.ts`, `config.ts`, `factories/`, `scenarios/`, `utils/`

## Environment variables

- `DATABASE_URL` – Postgres connection string (for Drizzle)
- `CLICKHOUSE_URL` – ClickHouse HTTP endpoint

## Scripts (from this package)

- `bun run db:push` – apply Drizzle schema
- `bun run db:studio` – open Drizzle Studio
- `bun run db:migrate` / `bun run db:deploy` – run migrations
- `bun run clickhouse:init` – create ClickHouse DB/tables
- `bun run db:seed` – run seeding CLI (see Seeding below)

## PostgreSQL (Drizzle)

- Client: `src/client.ts` builds a Drizzle instance from `DATABASE_URL` and merges `schema` + `relations`.
- Schema: `src/drizzle/schema.ts` contains enums and tables; `relations.ts` wires relations.
- Usage (other packages):
  - Import: `import { db } from '@databuddy/db/client'`
  - Use Drizzle queries/transactions as usual.

## ClickHouse

- Client: `src/clickhouse/client.ts`
  - `TABLE_NAMES` – stable table name map
  - Resilient `insert` (retry wrapper)
  - Helpers: `chQuery`, `chQueryWithMeta`, `chCommand`, date formatting utilities
- Schema + setup
  - Run `bun run clickhouse:init` to create `analytics` and `observability` databases and tables (see `schema.ts`).
- Usage (other packages):
  - Import: `import { clickHouse, TABLE_NAMES } from '@databuddy/db/clickhouse'`
  - Insert with `JSONEachRow`; query with `chQuery` / `clickHouse.query`.

## Seeding (scenarios for demos/tests)

- Location: `src/seed/*`
  - Pure factories (no IO) in `factories/`
  - Scenarios compose factories and insert via `db` and `clickHouse`
- Quickstart: run from repo root `bun run db:seed`
- Options (via args/env, depending on runner):
  - `--scenario`: `base` | `demo` | `analyticsHeavy` (default: `base`)
  - `--fakerSeed`: deterministic generation
  - `--users`, `events`: scenario-specific knobs
  - `--dryRun`: generate only, no inserts
  - `--reset`: `append` | `truncate` (truncate clears curated data tables)
  - `--batchSizeEvents`: ClickHouse insert chunk size
- Tips for determinism
  - Use `fakerSeed` and `ctx.now` anchor; sort by time before inserts.

## Exports

- `@databuddy/db/client` – Drizzle `db` instance
- `@databuddy/db/clickhouse` – CH client + helpers (`clickHouse`, `TABLE_NAMES`, etc.)
- `@databuddy/db/seed` – seed CLI/programmatic entry (for internal tooling/tests)

## Troubleshooting

- ClickHouse DateTime64 inputs: we send ms since epoch in JSONEachRow; ensure client/server mapping is correct. If needed, switch to ISO strings.
- Large datasets: increase `batchSizeEvents` to reduce insert calls.

## Contributing

See root `CONTRIBUTING.md` for workflow. The “Seeding data” section explains how to extend scenarios safely.
