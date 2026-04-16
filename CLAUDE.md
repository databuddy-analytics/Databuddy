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

### Tech Stack

- **Runtime**: Bun 1.3.4+
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
- **PRs**: Open against `staging` branch (not `main`).

## AI Policy Note

The project has a formal AI usage policy (`AI_POLICY.md`). For contributions: all AI usage must be disclosed, PRs must reference an accepted issue, and all AI-generated code must be fully human-verified. Maintainers are exempt and may use AI at their discretion.
