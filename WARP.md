# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Databuddy is a comprehensive analytics and data management platform built as a monorepo using Turborepo, Bun, and modern web technologies. The platform provides real-time analytics, user tracking, and data visualization capabilities.

## Core Architecture

### Monorepo Structure

This is a Turborepo monorepo with the following key applications and packages:

**Applications (`apps/`):**
- `dashboard/` - Next.js 15 frontend application (main analytics dashboard)
- `api/` - Elysia.js backend API server with tRPC
- `database/` - Database management UI (Next.js)
- `basket/` - Data collection service
- `docs/` - Documentation site

**Packages (`packages/`):**
- `sdk/` - Analytics SDK for React/Vue (published package)
- `db/` - Database layer with Drizzle ORM (PostgreSQL + ClickHouse)
- `rpc/` - tRPC API definitions and procedures  
- `auth/` - Authentication system
- `redis/` - Redis client and utilities
- `validation/` - Zod schemas and validation
- `email/` - Email templates and sending
- `shared/` - Shared types and utilities
- `env/` - Environment variable validation

### Technology Stack

- **Runtime**: Bun (required for all operations)
- **Frontend**: Next.js 15 with React 19, TypeScript 5.8+
- **Backend**: Elysia.js with tRPC
- **Database**: PostgreSQL (via Drizzle ORM) + ClickHouse (analytics)
- **Cache**: Redis
- **Styling**: Tailwind CSS 4.x
- **Icons**: Phosphor Icons (only, never Lucide)
- **State**: Jotai + TanStack Query
- **Forms**: React Hook Form + Zod v4
- **Dates**: Dayjs (never date-fns)
- **Linting**: Ultracite (Biome-based)

## Development Commands

### Essential Commands (Always use `bun`)

```bash
# Install dependencies
bun install

# Development (starts all apps)
bun run dev

# Build all packages/apps
bun run build

# Database operations
bun run db:push          # Push schema changes
bun run db:studio        # Open Drizzle Studio
bun run db:migrate       # Run migrations
bun run db:seed <WEBSITE_ID> [DOMAIN] [EVENT_COUNT]  # Seed test data

# SDK build (required before dev)
bun run sdk:build

# Individual app development
bun run dashboard:dev    # Dashboard only

# Linting and formatting
bun run lint            # Lint with Ultracite
bun run format          # Format with Ultracite
bun run check-types     # TypeScript check

# Testing
bun run test            # Run tests with Vitest

# Email development
bun run email:dev       # Email templates server
```

### Testing Commands

```bash
# Run all tests
bun run test

# Run specific test file
bun test path/to/test.ts

# Watch mode
bun test --watch
```

## Critical Development Rules

### Package Manager
- **ALWAYS use `bun`** - Never use npm, pnpm, or Node.js commands
- Package manager is enforced via `.cursor/rules/use-bun-instead-of-node-vite-npm-pnpm.mdc`

### Code Quality Standards
- **Ultracite**: Strict linting/formatting (subsecond performance, AI-friendly)
- **Type Safety**: No `any`, `unknown`, `never` types - use explicit types from `@shared/types`
- **Zod v4**: Required everywhere (from `zod/v4`, not v3)
- **Error Handling**: Never throw in server actions - use try/catch and return errors
- **React**: Almost never use `useEffect` unless critical

### UI/UX Standards
- **Icons**: Only Phosphor Icons (`@phosphor-icons/react`) - use `Icon` suffix
- **Border Radius**: Always use `rounded` (never `rounded-xl`, `rounded-md`)
- **Dates**: Dayjs only (never date-fns)
- **State Management**: TanStack Query for data fetching (never SWR)
- **Naming**: lower-case-kebab-case for files/components
- **No Mock Data**: Never add placeholders or mock data

### Architecture Patterns
- **Modularity**: Split components/utils for reusability and performance
- **Complexity**: Favor less complex, fewer-line solutions
- **Mobile First**: Always consider mobile responsiveness
- **Error Boundaries**: Always implement properly
- **Console Usage**: Use appropriate methods (`console.error`, `console.time`, `console.json`)

## Database Architecture

### Primary Database (PostgreSQL)
- **ORM**: Drizzle ORM
- **Migrations**: Located in `packages/db/`
- **Studio**: Access via `bun run db:studio`

### Analytics Database (ClickHouse)
- **Purpose**: High-performance analytics and event storage
- **Setup**: `bun run clickhouse:init`
- **Access**: Via `packages/db/clickhouse/`

### Redis Cache
- **Package**: `@databuddy/redis`
- **Usage**: Session storage, caching, rate limiting

## API Architecture

### tRPC Setup
- **Definitions**: `packages/rpc/src/`
- **Client**: Auto-generated TypeScript client
- **Server**: Elysia.js integration in `apps/api/`

### Authentication
- **Package**: `@databuddy/auth`
- **Method**: Better Auth integration
- **Providers**: Google, GitHub

## SDK Architecture

The `@databuddy/sdk` package provides analytics tracking for external applications:

- **Core**: Framework-agnostic analytics client
- **React**: React-specific hooks and components  
- **Vue**: Vue 3 composables and components
- **Build**: Uses Unbuild for multi-format output

## Environment Setup

### Required Services
- PostgreSQL database
- Redis server
- ClickHouse (for analytics)
- Cloudflare account (deployment)
- Vercel account (deployment)

### Environment Files
- Copy `.env.example` to `.env`
- Configure database URLs, API keys, and service credentials

## Important Workspace Features

### Turborepo Configuration
- **Caching**: Build artifacts cached for performance
- **Dependencies**: Managed via workspace protocol
- **Pipelines**: Defined in `turbo.json`

### Shared Dependencies (Catalog)
Key shared versions defined in root `package.json`:
- React 19.0.0
- Next.js 15.3.4+  
- TypeScript 5.8.3+
- Zod 3.25.76 (workspace packages use v4)
- Tailwind CSS 4.1.4+

## Testing Strategy

- **Framework**: Vitest 3.x
- **Location**: Tests alongside source files (`.test.ts` suffix)
- **Coverage**: Available via `@vitest/coverage-v8`
- **Example**: See `apps/basket/src/hooks/auth.test.ts`

## Deployment Architecture

- **Dashboard**: Vercel (Next.js app)
- **API**: Deployed separately (Elysia.js)
- **Database**: PostgreSQL + ClickHouse cluster
- **CDN**: Cloudflare for static assets and edge functions

## Development Workflow

1. **Setup**: `bun install` → `bun run db:push` → `bun run sdk:build`
2. **Development**: `bun run dev` (starts all services)
3. **Database**: Use `bun run db:studio` for visual management
4. **Testing**: `bun run test` for validation
5. **Linting**: Automatic via Ultracite on save

## Key Files to Understand

- `turbo.json` - Monorepo build pipeline configuration  
- `packages/db/src/schema/` - Database schema definitions
- `packages/rpc/src/` - API route definitions and types
- `apps/dashboard/` - Main user interface
- `.cursor/rules/` - Development standards and constraints

## Performance Considerations

- **Build Performance**: Turborepo caching + Bun's speed
- **Runtime Performance**: React 19 + Next.js 15 optimizations
- **Database Performance**: ClickHouse for analytics, PostgreSQL for transactional
- **SDK Performance**: Minimal bundle size, tree-shakeable

## Security & Compliance

- **Authentication**: Better Auth with OAuth providers
- **Data Protection**: GDPR compliant data handling
- **API Security**: Rate limiting via Upstash Redis
- **Environment**: Secure environment variable handling via `@databuddy/env`
