# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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

packages/
  db/          # Drizzle ORM schemas + clients (PostgreSQL + ClickHouse)
  rpc/         # ORPC router — type-safe API layer between dashboard and api
  auth/        # Better-Auth integration + permission system
  sdk/         # Public analytics SDK (React, Vue, Node.js)
  cache/       # Redis-backed Drizzle caching layer
  redis/       # Redis client, pub/sub, BullMQ job queues
  shared/      # Shared types, utilities, constants
  validation/  # Zod schemas
  ai/          # AI/LLM integrations (OpenAI, Groq, OpenRouter)
  services/    # Business logic services
  email/       # Email via Resend
  notifications/ # Notification system
  tracker/     # Lightweight client-side tracking scripts
  mapper/      # Data transformation utilities
  query/       # Query builders
  env/         # Environment configuration (type-safe env vars)
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

**Dashboard design system (`apps/dashboard/components/ds`)**: Dashboard UI must be built from DS primitives. Feature code should not use raw form/control primitives (`button`, `input`, `select`, `textarea`, native dialogs), Base UI, Radix, or one-off styled controls directly. If a needed primitive or variant does not exist, add or extend a DS component first, then consume it from the feature. Raw control elements belong inside `components/ds` implementations only.

For picker controls, use the component that matches the interaction:
- Use `DropdownMenu` for menu-style folder/status/filter/sort/action pickers.
- Use `Select` only when the established UI pattern is explicitly a select/combobox.
- Use `Field` with DS inputs for form labeling, descriptions, errors, ids, and accessibility wiring.

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
- **Dashboard UI**: Use `apps/dashboard/components/ds` primitives exactly. Do not hand-roll controls in feature components; extend the DS layer first when the current API is missing something.
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

## CI and Review Lessons

- Always run `bun run lint`, `bun run check-types`, and relevant tests before pushing; formatter-only drift can fail CI.
- Keep workspace dependencies explicit in each package's `package.json`; typecheck can pass locally from hoisting while CI or package boundaries fail.
- Process lifecycle code must fail safe: `uncaughtException` handlers should log/capture then exit non-zero, and graceful shutdown must have a timeout plus a concurrent-signal guard.
- API error handlers must preserve valid 4xx statuses (400/401/403/404/422/429, etc.) instead of collapsing everything to 500.
- Avoid regexes with broad wildcards over user/model text or tagged prompt payloads; prefer deterministic delimiter parsing.
- Avoid O(n²) accumulator patterns such as spreading arrays inside loops; mutate local arrays with `push` when grouping buffered items.
- Empty `catch {}` blocks need a reason comment or minimal logging, especially in instrumentation paths.
- Eval guardrail regexes should be precise and bounded; avoid broad `.*` patterns that can fail unrelated output.
- CI service containers should mirror local Docker requirements; ClickHouse needs the high `nofile` ulimit, generous health startup time, and a health command supported inside the ClickHouse image.
- Dashboard Playwright web servers should not use `bash -lc`; login shells can reset PATH on CI and hide Bun. Use `bash -c` or an explicit Bun path, build dist-only workspace packages such as `@databuddy/sdk`/`@databuddy/devtools` before starting the API/dashboard, and set E2E boolean env vars as `"true"`/`"false"` because `readBooleanEnv` does not treat `"1"` as enabled.
- Bun `mock.module` state can affect files in the same package test command; mocks for shared modules like `../lib/logger` must include every method later tests may call.
- Client-side `NEXT_PUBLIC_*` checks must use direct `process.env.NEXT_PUBLIC_NAME` access (or a helper that does); dynamic helpers like `readBooleanEnv("NEXT_PUBLIC_...")` are not inlined into the browser bundle.

## AI Policy Note

The project has a formal AI usage policy (`AI_POLICY.md`). For contributions: all AI usage must be disclosed, PRs must reference an accepted issue, and all AI-generated code must be fully human-verified. Maintainers are exempt and may use AI at their discretion.
