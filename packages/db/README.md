# @databuddy/db

Database layer for Databuddy, providing type-safe access to PostgreSQL (via Drizzle ORM) and ClickHouse (for analytics).

## Overview

This package contains all database-related code for the Databuddy platform:
- **PostgreSQL**: User data, organizations, websites, authentication (via Drizzle ORM)
- **ClickHouse**: Time-series analytics data (events, sessions, performance metrics)
- Database schemas, migrations, and seed scripts
- Type-safe database clients and query builders

## Installation

This package is internal to the Databuddy monorepo and is not published to NPM.

```bash
# Within the monorepo
bun install
```

## Usage

### Import Database Client

```typescript
import { db } from '@databuddy/db'
import { websites, users, organizations } from '@databuddy/db'

// Query with Drizzle ORM
const allWebsites = await db.select().from(websites)

// Insert data
await db.insert(users).values({
  email: 'user@example.com',
  name: 'John Doe',
})
```

### Import ClickHouse Client

```typescript
import { clickhouse } from '@databuddy/db/clickhouse'

// Query analytics events
const result = await clickhouse.query({
  query: 'SELECT count() FROM events WHERE timestamp > now() - INTERVAL 1 DAY',
  format: 'JSONEachRow',
})

const data = await result.json()
```

## Database Structure

### PostgreSQL Tables

**Core Tables**:
- `users` - User accounts and authentication
- `organizations` - Multi-tenant organizations
- `websites` - Tracked websites and configuration
- `teams` - Team memberships and roles
- `api_keys` - API access tokens

**Authentication** (Better Auth):
- `sessions` - User sessions
- `accounts` - OAuth provider accounts
- `verifications` - Email verification tokens

### ClickHouse Tables

**Analytics Tables**:
- `events` - All tracked events (page views, custom events)
- `sessions` - User sessions
- `performance` - Core Web Vitals and performance metrics

## Scripts

### PostgreSQL Commands

```bash
# Push schema changes (development)
bun db:push

# Run migrations (production)
bun db:migrate

# Deploy migrations (alias for migrate)
bun db:deploy

# Open Drizzle Studio (database GUI)
bun db:studio

# Seed database with sample data
bun db:seed
```

### ClickHouse Commands

```bash
# Initialize ClickHouse schema
bun clickhouse:init
```

## Migrations

Migrations are stored in `src/drizzle/migrations/` and managed by Drizzle Kit.

### Create a New Migration

1. Update schema in `src/drizzle/schema.ts`
2. Generate migration:
   ```bash
   cd packages/db
   bun drizzle-kit generate
   ```
3. Review generated SQL in `src/drizzle/migrations/`
4. Run migration:
   ```bash
   bun db:migrate
   ```

### Migration Best Practices

- Always review generated SQL before running
- Test migrations on development database first
- Create backup before running production migrations
- Never edit existing migrations (create new ones)
- Use transactions for complex migrations

## Schema Definition

### Example Table Schema

```typescript
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const websites = pgTable('websites', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  domain: text('domain').notNull(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

## Connection Configuration

### PostgreSQL

Configure via environment variable:

```env
DATABASE_URL="postgres://user:password@host:5432/database"
```

The client automatically handles:
- Connection pooling
- SSL configuration
- Query logging (in development)
- Error handling

### ClickHouse

Configure via environment variable:

```env
CLICKHOUSE_URL="http://user:password@host:8123/database"
```

## Type Safety

All database tables are fully typed using Drizzle ORM:

```typescript
import { type Website, type User } from '@databuddy/db'

// InferModel gives you the TypeScript type
const website: Website = {
  id: '123',
  name: 'My Website',
  domain: 'example.com',
  organizationId: '456',
  createdAt: new Date(),
  updatedAt: new Date(),
}
```

## Exports

### Main Exports

```typescript
// Database client
export { db } from './client'

// All table schemas
export * from './drizzle/schema'

// ClickHouse client
export { clickhouse } from './clickhouse'
```

### Available Imports

```typescript
import {
  db,                    // PostgreSQL client
  clickhouse,           // ClickHouse client
  users,                // User table
  organizations,        // Organization table
  websites,             // Website table
  teams,                // Team table
  apiKeys,              // API keys table
  sessions,             // Session table
  // ... and more
} from '@databuddy/db'
```

## Seeding

The seed script (`src/seed.ts`) populates the database with sample data for development:

```bash
bun db:seed
```

This creates:
- Sample users
- Organizations
- Websites
- API keys
- Test data for all tables

**Note**: Only use seeding in development, never in production.

## ClickHouse Setup

### Initial Setup

```bash
# Initialize ClickHouse schema and tables
bun clickhouse:init
```

This creates:
- `events` table with proper partitioning
- `sessions` table
- `performance` table
- Indexes for common queries
- TTL policies for data retention

### ClickHouse Schema Example

```sql
CREATE TABLE events (
  id UUID,
  timestamp DateTime,
  website_id String,
  visitor_id String,
  session_id String,
  event_type String,
  url String,
  referrer String,
  country String,
  city String,
  device String,
  browser String,
  os String,
  properties String  -- JSON
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (website_id, timestamp)
TTL timestamp + INTERVAL 365 DAY;
```

## Performance Considerations

### PostgreSQL

- Use indexes for frequently queried columns
- Use `db.select()` with `.where()` for filtered queries
- Avoid `SELECT *`, specify columns explicitly
- Use transactions for multiple related queries
- Use prepared statements (Drizzle handles this automatically)

### ClickHouse

- Partition tables by date for time-series data
- Use materialized views for common aggregations
- Configure TTL for automatic data cleanup
- Use sampling for approximate queries on large datasets
- Batch inserts for high-throughput scenarios

## Troubleshooting

### Connection Issues

**PostgreSQL**:
```typescript
// Test connection
import { db } from '@databuddy/db'
await db.select().from(users).limit(1)
```

**ClickHouse**:
```typescript
// Test connection
import { clickhouse } from '@databuddy/db/clickhouse'
await clickhouse.ping()
```

### Common Errors

**"relation does not exist"**:
- Run migrations: `bun db:migrate`
- Ensure database is created
- Check `DATABASE_URL` is correct

**"Connection refused"**:
- Check database is running: `docker compose ps`
- Verify connection string
- Check firewall/network settings

**ClickHouse "Database does not exist"**:
- Run ClickHouse setup: `bun clickhouse:init`
- Check `CLICKHOUSE_URL` is correct
- Ensure ClickHouse is running

## Related Documentation

- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [ClickHouse Documentation](https://clickhouse.com/docs/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Databuddy Architecture](../../ARCHITECTURE.md)
- [Deployment Guide](../../DEPLOYMENT.md)
