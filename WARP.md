# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Essential Commands

### Development
```bash
# Start all services in development mode
bun dev

# Start specific app
bun dashboard:dev              # Dashboard only (port 3000)
cd apps/api && bun dev         # API server (port 3001)
cd apps/basket && bun dev      # Analytics ingestion service (port 4000)

# Email development server
bun email:dev
```

### Database Operations
```bash
# Initialize and manage databases
docker compose up -d           # Start Postgres, ClickHouse, Redis

# PostgreSQL (via Drizzle)
bun db:push                    # Push schema changes
bun db:migrate                 # Run migrations
bun db:studio                  # Open Drizzle Studio
bun db:seed                    # Seed database

# ClickHouse (analytics)
bun clickhouse:init            # Initialize ClickHouse schema

# Generate database types
bun generate-db
```

### Testing & Quality
```bash
# Testing
bun test                       # Run all tests
bun test:watch                 # Watch mode
bun test:coverage              # Coverage report
bun test ./apps               # Test specific directory

# Linting & Formatting
bun lint                       # Check with Ultracite
bun format                     # Fix with Ultracite
bun check-types                # TypeScript type checking

# Build
bun build                      # Build all apps/packages
bun sdk:build                  # Build SDK only
```

### Single Test Execution
```bash
# Run specific test file
bun test path/to/test-file.test.ts

# Run tests matching pattern
bun test --test-name-pattern="pattern"
```

## Architecture Overview

Databuddy is a monorepo analytics platform built with **Turborepo**, **Bun**, and **TypeScript**. The architecture follows a microservices pattern with three main services and shared packages.

### Core Services

**Dashboard (`apps/dashboard`)**
- Next.js 16 app (port 3000) with App Router
- Main user interface for analytics visualization
- Uses React Server Components and Server Actions
- Authentication via Better Auth
- Real-time updates and interactive dashboards

**API (`apps/api`)**
- Elysia-based API server (port 3001)
- Handles RPC endpoints via ORPC (type-safe RPC framework)
- Routes: `/rpc/*` (ORPC), `/query/*`, `/assistant/*`, `/export/*`
- Uses OpenTelemetry for distributed tracing
- Protected/public/admin procedures with middleware

**Basket (`apps/basket`)**
- Analytics event ingestion service (port 4000)
- High-throughput event collection and processing
- Writes to ClickHouse for analytics data
- Handles GeoIP lookups, user agent parsing
- Kafka integration for event streaming (optional)

**Better-Admin (`apps/better-admin`)**
- Admin interface for system management

**Docs (`apps/docs`)**
- Documentation site

### Shared Packages

**`@databuddy/db`**
- Drizzle ORM schemas and migrations
- PostgreSQL (user data, organizations, websites) via Drizzle
- ClickHouse client for analytics data
- Shared database utilities

**`@databuddy/sdk`**
- Official client SDK (NPM package)
- Multi-framework: vanilla JS, React, Vue, Node.js
- AI integration utilities (Vercel AI SDK)
- Built with `unbuild`

**`@databuddy/rpc`**
- Type-safe RPC layer using ORPC
- Router definitions for all API endpoints
- Procedures: `publicProcedure`, `protectedProcedure`, `adminProcedure`
- Shared context creation and middleware

**`@databuddy/auth`**
- Authentication via Better Auth
- User session management
- OAuth providers (Google, GitHub)

**`@databuddy/shared`**
- Common types and utilities
- Logger (Pino with Axiom/Logtail)
- Date utilities (Dayjs)
- Country codes, bot lists, referrer lists

**`@databuddy/validation`**
- Zod v4 schemas for request/response validation
- Used across API and Basket services

**`@databuddy/redis`**
- Redis client and utilities
- Caching and rate limiting

**`@databuddy/email`**
- Email templates and sending (Resend)

**`@databuddy/mapper`**
- Data transformation utilities

**`@databuddy/tracker`**
- Analytics tracking utilities

**`@databuddy/env`**
- Environment variable management

### Data Flow

1. **Event Collection**: Client SDKs → Basket (port 4000) → ClickHouse
2. **Analytics Queries**: Dashboard → API (port 3001) → ClickHouse/PostgreSQL
3. **User Actions**: Dashboard → RPC endpoints → PostgreSQL
4. **Real-time**: Dashboard uses Tanstack Query for data fetching

### Tech Stack Highlights

- **Runtime**: Bun (NOT Node.js, npm, or pnpm)
- **Monorepo**: Turborepo with workspace packages
- **Frontend**: Next.js 16, React 19, Tailwind CSS 4
- **Backend**: Elysia (Bun web framework)
- **RPC**: ORPC (type-safe, like tRPC)
- **Databases**: PostgreSQL (Drizzle), ClickHouse, Redis
- **Validation**: Zod v4 (from `zod/v4`)
- **Auth**: Better Auth
- **State**: Tanstack Query, Jotai
- **Observability**: OpenTelemetry, Pino logging
- **Rate Limiting**: Autumn.js

## Critical Rules

### Package Manager
**ALWAYS use Bun.** Never use npm, pnpm, yarn, or Node.js directly.
```bash
bun install    # NOT npm/pnpm/yarn install
bun run dev    # NOT npm/pnpm/yarn run dev
bun <file>     # NOT node/ts-node
```

### Dependencies & Standards
- **Zod v4**: Import from `zod/v4`, never Zod v3
- **Icons**: Use `@phosphor-icons/react` (NOT Lucide). Import as `<Name>Icon` (e.g., `CaretIcon`), use `weight="duotone"` for most, `weight="fill"` for arrows
- **Dates**: Use `dayjs` (NEVER date-fns)
- **Queries**: Use Tanstack Query (NEVER SWR)
- **Border radius**: Always use `rounded` (NOT `rounded-xl`, `rounded-md`)

### Code Quality
- **Type safety**: NO `any`, `unknown`, or `never` types. Define types in `@databuddy/shared/types/` or package-specific types
- **Shared types**: Create types in `packages/shared/src/types/` for cross-package usage
- **No placeholders**: Never add mock data or placeholder values
- **Error handling**: In Server Actions, use try/catch and return errors (never throw)
- **useEffect**: Avoid unless critical
- **Console usage**: Use `console.error`, `console.time`, `console.json`, `console.table` appropriately (NOT generic `console.log`)

### Naming & Style
- **File naming**: `lower-case-like-this.ts`
- **Formatting**: Ultracite (extends Biome) with tabs (2-space width)
- **Component structure**: Split reusable components, utils into separate files
- **Mobile-first**: Always consider mobile responsiveness

### Architecture Patterns
- **RPC procedures**: Use `publicProcedure`, `protectedProcedure`, or `adminProcedure` from `@databuddy/rpc`
- **Database queries**: Import from `@databuddy/db`
- **Validation**: Define schemas in `@databuddy/validation`
- **Logging**: Use `logger` from `@databuddy/shared/logger`
- **Authentication**: Use `auth` from `@databuddy/auth`

## Environment Setup

1. Copy `.env.example` to `.env`
2. Required for development:
   - `DATABASE_URL`: PostgreSQL connection
   - `CLICKHOUSE_URL`: ClickHouse connection
   - `REDIS_URL`: Redis connection
   - `BETTER_AUTH_SECRET`: Auth secret
   - `BETTER_AUTH_URL`: Auth URL (http://localhost:3000)
   - `NODE_ENV=development`

3. Optional:
   - `AI_API_KEY`: OpenRouter API key (for AI assistant)
   - `GITHUB_CLIENT_ID/SECRET`: GitHub OAuth
   - `GOOGLE_CLIENT_ID/SECRET`: Google OAuth
   - `RESEND_API_KEY`: Email sending
   - `R2_*`: Cloudflare R2 (image uploads)

## Project Structure

```
apps/
  ├── dashboard/       # Next.js 16 frontend (port 3000)
  ├── api/            # Elysia API server (port 3001)
  ├── basket/         # Event ingestion (port 4000)
  ├── better-admin/   # Admin interface
  └── docs/           # Documentation

packages/
  ├── db/             # Drizzle ORM, schemas, migrations
  ├── sdk/            # Client SDK (published to NPM)
  ├── rpc/            # ORPC routers and procedures
  ├── auth/           # Better Auth setup
  ├── shared/         # Common types, utils, logger
  ├── validation/     # Zod schemas
  ├── redis/          # Redis client
  ├── email/          # Email templates
  ├── mapper/         # Data transformations
  ├── tracker/        # Analytics tracking
  └── env/            # Environment config

rust/                # Rust components (if any)
infra/              # Infrastructure as code
docs/               # Documentation
```

## Guidelines (from .cursor/rules)

### Component Architecture
- Decouple state management, data transformations, and API interactions from React lifecycle
- Handle complex data transformations independently of React
- Simplify data flow to eliminate prop drilling and callback hell
- Prioritize modularity and testability

### UI/UX Principles
- Full keyboard support (WAI-ARIA APG patterns)
- Hit targets ≥24px (mobile ≥44px)
- Mobile inputs font-size ≥16px (prevent zoom)
- Honor `prefers-reduced-motion`
- URL reflects state (use `nuqs` for search params)
- Optimistic UI with rollback on error
- Deliberate alignment and optical spacing

### Performance
- Track and minimize re-renders
- Virtualize large lists (e.g., `virtua`)
- Prefer uncontrolled inputs
- Batch layout reads/writes
- Preload above-fold images, lazy-load rest

### Accessibility
- Visible focus rings (`:focus-visible`)
- Redundant status cues (not color-only)
- Icon-only buttons have `aria-label`
- Semantic HTML (`button`, `a`, `label`) before ARIA
- Skeletons mirror final content (prevent layout shift)

## Troubleshooting

### "Module not found" errors
- Ensure you've run `bun install` at the root
- Check package exports in `package.json`
- Verify Turborepo cache: `rm -rf .turbo && bun build`

### SDK changes not reflected
- Rebuild SDK: `bun sdk:build`
- The dev command depends on SDK build (see `turbo.json`)

### Database schema changes
1. Update schema in `packages/db/src/schema/`
2. Run `bun db:push` (development) or `bun db:migrate` (production)
3. Run `bun generate-db` to regenerate types

### Type errors in workspace packages
- Check `tsconfig.json` paths
- Ensure package exports match imports
- Run `bun check-types` to see all errors

### Port conflicts
- Dashboard: 3000
- API: 3001
- Basket: 4000
- PostgreSQL: 5432
- ClickHouse: 8123, 9000
- Redis: 6379
