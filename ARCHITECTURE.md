# Databuddy Architecture

This document provides a comprehensive overview of Databuddy's system architecture, design decisions, and technical implementation.

## Table of Contents

- [System Overview](#system-overview)
- [Architecture Diagram](#architecture-diagram)
- [Core Services](#core-services)
- [Shared Packages](#shared-packages)
- [Data Flow](#data-flow)
- [Database Architecture](#database-architecture)
- [Technology Stack](#technology-stack)
- [Design Decisions](#design-decisions)
- [Security Considerations](#security-considerations)
- [Performance Optimizations](#performance-optimizations)

## System Overview

Databuddy is a **privacy-first, open-source web analytics platform** built as a monorepo using **Turborepo** and **Bun**. The architecture follows a **microservices pattern** with three main services (Dashboard, API, Basket) and multiple shared packages for code reuse and type safety.

### Key Characteristics

- **Monorepo Structure**: Turborepo workspace with apps and packages
- **Type-Safe**: End-to-end TypeScript with strict type checking
- **Real-Time**: Live analytics updates using Tanstack Query
- **Scalable**: Microservices architecture with dedicated ingestion service
- **Privacy-First**: GDPR compliant, no cookies, lightweight tracking
- **Modern Stack**: Next.js 15, React 19, Bun runtime, Tailwind CSS 4

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          Client Layer                            │
├─────────────────────────────────────────────────────────────────┤
│  Browser/App → @databuddy/sdk → Tracking Events                 │
└──────────────────┬──────────────────────────────┬───────────────┘
                   │                              │
                   ▼                              ▼
         ┌──────────────────┐          ┌──────────────────┐
         │   Dashboard UI   │          │   Basket API     │
         │   (Next.js 15)   │          │   (Port 4000)    │
         │   Port 3000      │          │   Event Ingest   │
         └────────┬─────────┘          └────────┬─────────┘
                  │                              │
                  │ ORPC Calls                   │ High-throughput
                  ▼                              │ Event Processing
         ┌──────────────────┐                   │
         │    API Server    │                   │
         │  (Elysia/ORPC)   │                   │
         │   Port 3001      │                   │
         └────────┬─────────┘                   │
                  │                              │
    ┌─────────────┼──────────────────────────────┤
    │             │                              │
    ▼             ▼                              ▼
┌─────────┐  ┌──────────┐               ┌──────────────┐
│  Redis  │  │PostgreSQL│               │  ClickHouse  │
│ Caching │  │ User Data│               │  Analytics   │
│Rate Lmt │  │  Auth    │               │  Time-Series │
└─────────┘  └──────────┘               └──────────────┘
```

## Core Services

### 1. Dashboard (`apps/dashboard`)

**Technology**: Next.js 15 with App Router, React 19, React Server Components

**Port**: 3000

**Purpose**: Primary user interface for analytics visualization and platform management

**Key Features**:
- Real-time analytics dashboards with interactive charts
- Website management and configuration
- User authentication and session management
- Team and organization management
- Data export capabilities
- Responsive design for mobile and desktop

**Architecture**:
- **App Router**: File-based routing with nested layouts
- **Server Components**: Server-side rendering for improved performance
- **Server Actions**: Type-safe mutations without API endpoints
- **Client Components**: Interactive UI elements (charts, forms)
- **State Management**: Tanstack Query (server state) + Jotai (client state)

**Key Technologies**:
- Tailwind CSS 4 for styling
- Phosphor Icons for iconography
- Radix UI for accessible components
- Framer Motion for animations
- Better Auth for authentication

### 2. API Server (`apps/api`)

**Technology**: Elysia (Bun web framework) + ORPC (type-safe RPC)

**Port**: 3001

**Purpose**: Backend API server handling all business logic, data queries, and orchestration

**Key Routes**:
- `/rpc/*` - Type-safe ORPC endpoints (primary interface)
- `/query/*` - Direct query endpoints
- `/export/*` - Data export endpoints
- `/assistant/*` - AI assistant endpoints

**Architecture**:
- **ORPC Framework**: End-to-end type-safe RPC (similar to tRPC)
- **Procedure Types**:
  - `publicProcedure` - No authentication required
  - `protectedProcedure` - Requires user authentication
  - `adminProcedure` - Requires admin privileges
- **Middleware**: Authentication, rate limiting, input validation
- **OpenTelemetry**: Distributed tracing and observability

**Responsibilities**:
- User authentication and authorization
- Data aggregation and analytics queries
- Website CRUD operations
- Team and organization management
- Rate limiting and abuse prevention
- AI-powered insights (when configured)

### 3. Basket (`apps/basket`)

**Technology**: Elysia (Bun web framework)

**Port**: 4000

**Purpose**: High-throughput event ingestion service for analytics data collection

**Key Features**:
- Lightweight event collection endpoint
- GeoIP lookup for location data
- User agent parsing for device/browser info
- Bot detection and filtering
- Direct ClickHouse writes for speed
- Optional Kafka/Redpanda integration for event streaming

**Architecture**:
- **Stateless Design**: Horizontally scalable ingestion nodes
- **Optimized for Throughput**: Minimal processing, fast writes
- **Batching**: Groups events for efficient ClickHouse insertion
- **Privacy-First**: No cookies, no PII collection by default

**Data Processing Pipeline**:
1. Receive event from SDK
2. Validate and sanitize data
3. Enrich with GeoIP and user agent data
4. Filter bots and invalid traffic
5. Write to ClickHouse (or queue in Kafka)
6. Return success response

### 4. Better-Admin (`apps/better-admin`)

**Purpose**: Administrative interface for platform management

**Features**:
- System configuration
- User management
- Monitoring and health checks

### 5. Docs (`apps/docs`)

**Technology**: Fumadocs (Next.js-based documentation framework)

**Purpose**: User-facing documentation website

**Content**:
- Getting started guides
- SDK documentation
- API reference
- Integration guides
- Security and privacy information

## Shared Packages

Databuddy uses a shared package architecture to promote code reuse, maintain consistency, and ensure type safety across services.

### `@databuddy/db`

**Purpose**: Database layer for all services

**Responsibilities**:
- Drizzle ORM schemas and migrations
- PostgreSQL client configuration
- ClickHouse client configuration
- Shared database utilities and query builders

**Key Files**:
- `schema/` - Drizzle table definitions
- `migrations/` - Database migrations
- `clickhouse-client.ts` - ClickHouse connection
- `index.ts` - Database exports

### `@databuddy/sdk`

**Purpose**: Official client SDK (published to NPM)

**Frameworks Supported**:
- Vanilla JavaScript
- React
- Vue
- Node.js server-side

**Features**:
- Automatic page view tracking
- Custom event tracking
- User identification
- Session management
- Privacy controls
- AI SDK integration (Vercel AI SDK compatibility)

**Build**: Uses `unbuild` for cross-environment compatibility

### `@databuddy/rpc`

**Purpose**: Type-safe RPC layer using ORPC

**Key Components**:
- Router definitions for all API endpoints
- Procedure definitions (`publicProcedure`, `protectedProcedure`, `adminProcedure`)
- Shared context creation
- Middleware implementations
- Type exports for client-side usage

**Benefits**:
- End-to-end type safety (compile-time errors)
- Auto-completion in IDE
- Automatic input/output validation
- No manual API client maintenance

### `@databuddy/auth`

**Purpose**: Authentication and authorization

**Technology**: Better Auth

**Features**:
- Email/password authentication
- OAuth providers (Google, GitHub)
- Session management
- Role-based access control (RBAC)
- Multi-factor authentication support

### `@databuddy/shared`

**Purpose**: Common utilities and types used across all packages

**Contents**:
- TypeScript type definitions
- Logger configuration (Pino + Axiom/Logtail)
- Date utilities (Day.js)
- Country codes and geolocation data
- Bot detection lists
- Referrer classification

### `@databuddy/validation`

**Purpose**: Centralized data validation using Zod v4

**Contents**:
- Request/response schemas
- Form validation schemas
- Database input validation
- API contract definitions

### `@databuddy/redis`

**Purpose**: Redis client and caching utilities

**Features**:
- Connection pooling
- Caching helpers
- Rate limiting implementation
- Session storage

### `@databuddy/email`

**Purpose**: Email templates and sending

**Technology**: Resend API

**Features**:
- Welcome emails
- Password reset emails
- Team invitation emails
- Analytics report emails

### `@databuddy/mapper`

**Purpose**: Data transformation and mapping utilities

**Use Cases**:
- API response formatting
- Database model transformations
- Analytics data aggregation

### `@databuddy/tracker`

**Purpose**: Internal analytics tracking utilities

**Use Cases**:
- Event formatting
- Data normalization
- Tracking configuration

### `@databuddy/env`

**Purpose**: Environment variable management

**Features**:
- Type-safe environment access
- Validation on startup
- Default values
- Development/production configurations

## Data Flow

### 1. Event Collection Flow

```
Client App
    ↓ (SDK sends event)
Basket Service (Port 4000)
    ↓ (Validates & enriches)
GeoIP Lookup + User Agent Parsing
    ↓ (Writes batch)
ClickHouse (Analytics Database)
```

**Details**:
1. User visits website with Databuddy SDK installed
2. SDK automatically tracks page view or custom event
3. Event sent to `basket.databuddy.cc/event` endpoint
4. Basket validates event data and filters bots
5. Enriches with GeoIP (country, city) and user agent data
6. Writes to ClickHouse in batches for efficiency
7. Returns 200 OK response

### 2. Analytics Query Flow

```
Dashboard UI
    ↓ (ORPC call via Tanstack Query)
API Server (Port 3001)
    ↓ (Executes query)
ClickHouse / PostgreSQL
    ↓ (Returns aggregated data)
API Server (processes & formats)
    ↓ (Type-safe response)
Dashboard UI (renders chart/table)
```

**Details**:
1. User opens analytics dashboard
2. Dashboard makes ORPC call (e.g., `getPageViews`)
3. API server authenticates user and checks permissions
4. Queries ClickHouse for time-series analytics data
5. Aggregates and formats data
6. Returns type-safe response to client
7. Dashboard renders interactive chart

### 3. User Authentication Flow

```
User Login Form (Dashboard)
    ↓ (Server Action)
Better Auth (via @databuddy/auth)
    ↓ (Verifies credentials)
PostgreSQL (user table)
    ↓ (Creates session)
Redis (session storage)
    ↓ (Returns session token)
Dashboard (sets cookie, redirects)
```

**Details**:
1. User enters credentials on login page
2. Server Action calls Better Auth
3. Better Auth verifies password hash from PostgreSQL
4. Creates session in Redis
5. Returns session token
6. Dashboard sets httpOnly cookie and redirects to dashboard

## Database Architecture

### PostgreSQL (Primary Database)

**Purpose**: Relational data storage for users, organizations, websites, and configuration

**Schema Overview**:
- `users` - User accounts, authentication
- `organizations` - Multi-tenant organizations
- `websites` - Tracked websites and their settings
- `teams` - Team memberships and roles
- `api_keys` - API access tokens
- `sessions` - User sessions (via Better Auth)
- `email_verification` - Email confirmation tokens
- `password_reset` - Password reset tokens

**ORM**: Drizzle ORM with TypeScript types

**Migrations**: Version-controlled SQL migrations in `packages/db/migrations/`

### ClickHouse (Analytics Database)

**Purpose**: Time-series analytics data storage optimized for analytical queries

**Why ClickHouse?**:
- Columnar storage for fast aggregations
- Excellent compression (10-100x smaller than PostgreSQL)
- Real-time ingestion with sub-second query times
- Handles billions of events efficiently
- Optimized for read-heavy analytical workloads

**Schema Overview**:
- `events` - All tracked events (page views, custom events)
  - Timestamp, website_id, visitor_id
  - URL, referrer, utm parameters
  - Country, city, device, browser, OS
  - Custom properties (JSON)
- `sessions` - User sessions
- `performance` - Core Web Vitals metrics

**Data Retention**:
- Configurable per website
- Automatic TTL (Time To Live) policies
- Aggregation tables for historical data

### Redis (Cache & Sessions)

**Purpose**: High-speed caching and session storage

**Use Cases**:
- Session storage (Better Auth)
- Rate limiting counters
- API response caching
- Real-time analytics caching
- Background job queues

**Configuration**:
- Redis 7+ with persistence enabled
- Separate namespaces for different data types
- TTL policies for automatic cleanup

## Technology Stack

### Runtime & Build Tools

- **Bun**: JavaScript runtime and package manager (NOT Node.js)
- **Turborepo**: Monorepo build system with intelligent caching
- **TypeScript 5.9**: Static typing and compile-time checks
- **Ultracite**: Linting and formatting (extends Biome)
- **Prettier**: Code formatting

### Frontend

- **Next.js 15**: React framework with App Router
- **React 19**: UI library with Server Components
- **Tailwind CSS 4**: Utility-first CSS framework
- **Radix UI**: Unstyled, accessible component primitives
- **Phosphor Icons**: Icon library (NOT Lucide)
- **Framer Motion**: Animation library
- **Tanstack Query**: Server state management
- **Jotai**: Client state management
- **Sonner**: Toast notifications
- **Vaul**: Drawer component

### Backend

- **Elysia**: Bun web framework (like Express but faster)
- **ORPC**: Type-safe RPC framework (like tRPC)
- **Drizzle ORM**: TypeScript ORM for PostgreSQL
- **Better Auth**: Authentication library
- **Zod v4**: Schema validation
- **Pino**: Fast JSON logger
- **OpenTelemetry**: Distributed tracing

### Databases

- **PostgreSQL**: Primary relational database
- **ClickHouse**: Columnar analytics database
- **Redis**: In-memory cache and session store

### External Services

- **Resend**: Email sending
- **Cloudflare R2**: Object storage (images, exports)
- **Axiom/Logtail**: Log aggregation
- **GeoIP**: IP geolocation
- **Stripe**: Payment processing (for cloud version)

## Design Decisions

### Why Bun over Node.js?

1. **Performance**: 3-4x faster runtime and package manager
2. **Built-in TypeScript**: No need for ts-node or compilation step
3. **Modern APIs**: Native support for Web APIs, fetch, WebSocket
4. **Simpler Tooling**: All-in-one runtime, bundler, test runner
5. **Better DX**: Faster installs, faster test runs, faster dev server

### Why ORPC over REST or GraphQL?

1. **Type Safety**: End-to-end types from server to client
2. **Developer Experience**: Auto-completion, compile-time errors
3. **No Code Generation**: Types are inferred automatically
4. **Lightweight**: Much smaller than GraphQL
5. **React Query Integration**: First-class Tanstack Query support

### Why Monorepo (Turborepo)?

1. **Code Sharing**: Shared packages reduce duplication
2. **Type Safety**: Changes propagate across packages
3. **Atomic Commits**: Update multiple packages in one commit
4. **Build Caching**: Turborepo caches builds intelligently
5. **Consistent Tooling**: Same lint/format/test commands everywhere

### Why ClickHouse for Analytics?

1. **Performance**: 100-1000x faster than PostgreSQL for analytics
2. **Compression**: 10-100x smaller storage footprint
3. **Scalability**: Handles billions of events
4. **Real-Time**: Sub-second query times
5. **Cost-Effective**: Less storage, less compute needed

### Why Zod v4?

1. **Performance**: 2-3x faster than Zod v3
2. **Better Errors**: More detailed validation messages
3. **Smaller Bundle**: Reduced client-side bundle size
4. **Modern APIs**: Improved DX with better type inference

## Security Considerations

### Authentication

- **Password Hashing**: bcrypt with high cost factor
- **Session Management**: Secure httpOnly cookies
- **CSRF Protection**: Token-based CSRF prevention
- **Rate Limiting**: Autumn.js for login/signup endpoints

### Data Privacy

- **GDPR Compliance**: No cookies, minimal data collection
- **Data Encryption**: TLS 1.3 for all connections
- **PII Handling**: No email/name in analytics data
- **IP Anonymization**: Optional IP address hashing
- **Right to Deletion**: API endpoints for data removal

### API Security

- **Input Validation**: All inputs validated with Zod
- **SQL Injection**: Parameterized queries via Drizzle ORM
- **XSS Prevention**: React auto-escapes, Content Security Policy
- **API Keys**: Secure token generation with proper scopes
- **Rate Limiting**: Per-IP and per-user rate limits

### Infrastructure

- **Environment Variables**: Never committed to git
- **Secret Management**: Use secret managers in production
- **Database Credentials**: Stored in secure vault
- **HTTPS Only**: Force HTTPS in production
- **Security Headers**: Helmet.js equivalent headers

## Performance Optimizations

### Frontend

1. **React Server Components**: Reduce client-side JavaScript
2. **Code Splitting**: Automatic route-based splitting
3. **Image Optimization**: Next.js Image component
4. **Lazy Loading**: Dynamic imports for heavy components
5. **Caching**: Aggressive CDN caching for static assets
6. **Prefetching**: Next.js automatic prefetching

### Backend

1. **Connection Pooling**: Database connection reuse
2. **Query Optimization**: Indexed columns, efficient queries
3. **Redis Caching**: Cache expensive computations
4. **Batch Processing**: Group analytics writes
5. **Horizontal Scaling**: Stateless services for easy scaling

### Database

1. **ClickHouse Materialized Views**: Pre-aggregated data
2. **PostgreSQL Indexes**: B-tree indexes on foreign keys
3. **Query Planning**: EXPLAIN ANALYZE for optimization
4. **Partitioning**: Time-based partitioning in ClickHouse
5. **Compression**: Zstd compression in ClickHouse

### Analytics Ingestion

1. **Lightweight Beacon**: Minimal SDK footprint (<2KB)
2. **Batching**: Client-side event batching
3. **Async Processing**: Non-blocking event writes
4. **CDN Distribution**: Edge locations for low latency
5. **Bot Filtering**: Early rejection of invalid traffic

## Scalability Considerations

### Horizontal Scaling

- **Dashboard**: Multiple Next.js instances behind load balancer
- **API**: Stateless design, scale to N instances
- **Basket**: Horizontally scalable ingestion nodes
- **Databases**: Read replicas, sharding (when needed)

### Vertical Scaling

- **ClickHouse**: Scale up for larger datasets
- **PostgreSQL**: Increase connection pool size
- **Redis**: Use Redis Cluster for high availability

### Monitoring

- **OpenTelemetry**: Distributed tracing across services
- **Pino Logging**: Structured JSON logs to Axiom
- **Health Checks**: `/health` endpoints on all services
- **Metrics**: Request rate, error rate, latency (RED metrics)

## Future Architecture Considerations

1. **Edge Deployment**: Deploy Basket to Cloudflare Workers or similar
2. **GraphQL Layer**: Optional GraphQL API for third-party integrations
3. **Webhooks**: Event-driven integrations
4. **Plugin System**: User-defined analytics plugins
5. **Multi-Region**: Deploy to multiple regions for lower latency
6. **Machine Learning**: Anomaly detection, predictive analytics

---

For deployment guides, see [DEPLOYMENT.md](DEPLOYMENT.md).

For contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

For development setup, see [WARP.md](WARP.md).
