# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Databuddy is a comprehensive analytics platform — a Turborepo monorepo using Bun as the package manager and runtime. It consists of multiple apps (dashboard, API, data collectors) and shared packages, backed by PostgreSQL, ClickHouse, and Redis.

## Development Commands

```bash
# Start dashboard + API only (most common)
bun run dev:dashboard

# Start all apps
bun run dev

# Lint
bun run lint

# Format
bun run format

# Type check
bun run check-types

# Run tests
bun run test
bun run test:watch

# Database
bun run db:push          # Apply schema changes (no migration files)
bun run db:migrate       # Run migration files
bun run db:studio        # Open Drizzle Studio GUI
bun run db:seed <WEBSITE_ID> [EVENT_COUNT]  # Seed sample analytics data

# SDK (must build before dev if SDK changed)
bun run sdk:build

# Build everything
bun run build
```

**Note:** All commands use `dotenv --` prefix internally to load `.env` — just run them from root.

### Running a single test

```bash
# From root
cd apps/api && bun test path/to/test.ts

# Or with filter
cd apps/api && bun test --test-name-pattern "test name"
```

## Initial Setup

```bash
bun install
cp .env.example .env
docker-compose up -d          # PostgreSQL, ClickHouse, Redis
bun run db:push
bun run clickhouse:init       # from packages/db
bun run sdk:build
bun run dev:dashboard
```

## Architecture

### Monorepo Structure

```
apps/
  dashboard/   # Next.js 16 frontend (React 19, TailwindCSS 4)
  api/         # Elysia.js backend (Bun, port 3001)
  basket/      # Analytics event ingestion service
  uptime/      # Uptime monitoring
  cron/        # Scheduled jobs
  links/       # Short link service
  docs/        # Documentation site
  status/      # Status page app
  slack/       # Slack integration

packages/
  db/          # Drizzle ORM schemas + clients (PostgreSQL + ClickHouse)
  rpc/         # ORPC router — type-safe API layer between dashboard and api
  auth/        # Better-Auth integration + permission system
  sdk/         # Public analytics SDK (React, Vue, Node.js)
  cache/       # Redis-backed Drizzle caching layer
  redis/       # Redis client, pub/sub, BullMQ job queues
  shared/      # Shared types, utilities, constants
  validation/  # Zod schemas
  services/    # Business logic services
  email/       # Email via Resend
  notifications/ # Notification system
  tracker/     # Lightweight client-side tracking scripts
  mapper/      # Data transformation utilities
  env/         # Environment configuration (type-safe env vars)
  devtools/    # Browser devtools extension
  encryption/  # Encryption utilities
  evals/       # AI eval framework
  api-keys/    # API key management and scopes
```

### Data Flow

```
Browser (SDK/tracker) → basket (ingestion) → ClickHouse (analytics warehouse)
                                           → PostgreSQL (relational data)

Dashboard (Next.js) ←→ ORPC (rpc package) ←→ API (Elysia) → PostgreSQL + ClickHouse + Redis
```

### Key Patterns

**RPC Layer (`packages/rpc`)**: The central type-safe API contract between dashboard and api. Dashboard uses ORPC client with TanStack Query; API implements the procedures. Adding a new endpoint means defining it in `rpc`, implementing it in `api`, and calling it from `dashboard`.

**Database Layer (`packages/db`)**: Single source of truth for all schemas. Uses Drizzle ORM for PostgreSQL (relational data: users, websites, settings) and a ClickHouse client for analytics data (events, sessions, pageviews). Schema changes use `db:push` for development; `db:migrate` for production migrations.

**Caching (`packages/cache`)**: Redis cache sits in front of Drizzle queries. Cache keys and TTLs are defined alongside queries.

**Auth (`packages/auth`)**: Better-Auth handles sessions. The package also contains the permission system used across all apps.

**State management in Dashboard**: Jotai for local UI state, TanStack Query for server state.

### Tech Stack

- **Runtime**: Bun 1.3.14+
- **Frontend**: Next.js 16, React 19, TailwindCSS 4, Radix UI, Recharts
- **Backend**: Elysia.js (Bun-native HTTP framework)
- **API layer**: ORPC (type-safe RPC with OpenAPI generation)
- **Auth**: Better-Auth
- **ORM**: Drizzle ORM
- **Databases**: PostgreSQL 17, ClickHouse 25.5, Redis 7
- **Validation**: Zod 4
- **Linting/Formatting**: Biome via Ultracite
- **Build**: Turborepo + Bun

## Code Style

- **Linter/Formatter**: Ultracite (Biome-based). Run `bun run lint` / `bun run format`.
- **TypeScript**: Strict mode. Always use proper types — avoid `any`.
- **Commit format**: `<type>(<scope>): <description>` (e.g., `feat(dashboard): add export button`, `fix(api): handle null session`)
- **Commit slicing rule**: Prefer one commit per coherent product or technical slice, not one giant snapshot and not ultra-fragmented file-by-file commits.
  - Split commits by intent: feature, bug fix, refactor, style/copy pass, or migration slice.
  - Use the dominant surface as scope: `dashboard`, `api`, `rpc`, `basket`, `docs`, `db`, `sdk`, `tracker`, `deps`, `ci`.
  - Group closely related UI files into one commit when they ship one visible change.
  - Keep unrelated surfaces in separate commits even if they were edited in the same session.
  - For broad migrations, follow the repo’s existing pattern: one commit per meaningful area, e.g. `feat(dashboard): migrate home, events, insights, and links pages to DS primitives`.
  - Before committing, check `git diff --stat` and `git status --short`; if the diff mixes unrelated intents, split it.
  - Only make a single snapshot commit for the whole worktree when the user explicitly asks to include everything as-is.
- **PRs**: Open against `staging` branch (not `main`).

## Integration Tests

Test infra lives in `packages/test`. Integration tests live in `apps/api/src/integration/`.

```bash
# Run integration tests (requires Docker: postgres + redis)
cd apps/api && bun test src/integration/

# One-time setup for test DB
cd packages/db && DATABASE_URL="postgres://databuddy:databuddy_dev_password@localhost:5432/databuddy_test" bunx drizzle-kit push
```

**Key helpers from `@databuddy/test`:**
- `signUp()` — creates a real user via better-auth with session cookie
- `addToOrganization(userId, orgId, role)` — inserts member row
- `userContext(user, orgId)` / `apiKeyContext(orgId, scopes)` — builds RPC Context
- `insertOrganization()` / `insertWebsite()` / `insertApiKey()` — DB factories
- `expectCode(promise, "FORBIDDEN")` — asserts ORPCError code
- `reset()` / `cleanup()` — truncate tables / close connections
- `import "@databuddy/test/env"` — sets test env vars (must be first import)

**Rules for integration tests:**
- Always `import "@databuddy/test/env"` as the first line
- Use `const iit = hasTestDb ? it : it.skip` for graceful skip when Docker is down
- Use `userContext` / `apiKeyContext` / `expectCode` from the test package — don't redefine locally
- Type API key objects against `Context["apiKey"]` to catch schema drift
- `beforeEach(() => reset())` and `afterAll(() => cleanup())` in every file

## Drift Prevention

- **Type test objects against their source type.** Fake API keys must be typed as `Context["apiKey"]`, fake users as `User`, etc. If the schema adds a required field, the test must fail to compile — not silently pass with a partial object.
- **Never hand-write dependency versions.** Use `bun add <pkg>` to add dependencies. Hand-written version ranges drift from lockfile reality and cause phantom resolution bugs.
- **Shared test helpers over local copies.** `expectCode`, `userContext`, `apiKeyContext`, env setup — these live in `@databuddy/test`. If you're about to define a helper that already exists there, import it instead.
- **Scope maps must match.** If `RESOURCE_SCOPE_OVERRIDES` changes in `packages/api-keys/src/scopes.ts`, the integration tests in `link-handlers.test.ts` and `with-workspace.test.ts` must be updated to match. The link resource is mapped there (`read:links` for read, `write:links` for create/update/delete), as is the flag resource (`manage:flags` for create/update/delete). Both are enforced solely by `withWorkspace`; there are no separate pre-check layers. New resources also need role grants in `packages/auth/src/permissions.ts` (statement plus each role).

## AI Policy Note

The project has a formal AI usage policy (`AI_POLICY.md`). For contributions: all AI usage must be disclosed, PRs must reference an accepted issue, and all AI-generated code must be fully human-verified. Maintainers are exempt and may use AI at their discretion.
