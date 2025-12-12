# @databuddy/cache

A Redis-based caching implementation for Drizzle ORM that provides automatic query result caching and intelligent cache invalidation.

## Overview

`@databuddy/cache` extends Drizzle ORM's base Cache class to provide Redis-backed caching for database queries. It automatically caches query results and invalidates cache entries when mutations occur on tracked tables, ensuring data consistency while improving query performance.

## Features

- Automatic query result caching with configurable TTL
- Intelligent cache invalidation based on table mutations
- Configurable caching strategies (explicit or automatic)
- Namespace support for cache key isolation
- TypeScript support with full type definitions

## Installation

```bash
bun add @databuddy/cache drizzle-orm
```

## Quick Start

### Basic Usage with Bun's RedisClient

```typescript
import { RedisClient } from "bun";
import { drizzle } from "drizzle-orm/node-postgres";
import { RedisDrizzleCache } from "@databuddy/cache";
import * as schema from "./schema";

// Create Redis client
const redis = new RedisClient(process.env.REDIS_URL!);

// Create cache instance
const cache = new RedisDrizzleCache({
    redis,
    defaultTtl: 300, // 5 minutes
    strategy: "all", // Cache all queries
    namespace: "myapp:drizzle"
});

// Use with Drizzle
const db = drizzle(connectionString, {
    schema,
    cache
});

// Queries are automatically cached
const users = await db.select().from(usersTable);

// Mutations automatically invalidate related cache entries
await db.update(usersTable).set({ name: "John" }).where(eq(usersTable.id, 1));
// Cache entries for 'users' table are now invalidated
```


## Configuration

### RedisCacheConfig

```typescript
type RedisCacheConfig = {
    redis: RedisAdapter | unknown;
    defaultTtl?: number;
    strategy?: "explicit" | "all";
    namespace?: string;
};
```

#### redis

The Redis client instance. Currently supports Bun's `RedisClient` which must implement the following methods:

- `get(key: string): Promise<string | null>` - Retrieve a value from Redis
- `setex(key: string, seconds: number, value: string): Promise<unknown>` - Set a value with TTL
- `unlink(...keys: string[]): Promise<unknown>` - Delete one or more keys

#### defaultTtl

Default time-to-live for cached entries in seconds. Used when no explicit TTL is provided via CacheConfig.

**Default:** `300` (5 minutes)

```typescript
const cache = new RedisDrizzleCache({
    redis,
    defaultTtl: 600 // 10 minutes
});
```

#### strategy

Cache strategy determines when queries are cached:

- `"all"` - All queries are automatically cached (default)
- `"explicit"` - Only queries explicitly marked with `.$withCache()` are cached

**Default:** `"all"`

```typescript
// Explicit strategy
const cache = new RedisDrizzleCache({
    redis,
    strategy: "explicit"
});

// Only explicitly marked queries are cached
const users = await db
    .select()
    .from(usersTable)
    .$withCache({
        key: "all-users",
        ttl: 600,
        tables: ["users"]
    });
```

#### namespace

Optional namespace prefix for all cache keys. Useful for isolating cache entries from different applications or environments.

**Default:** `"drizzle"`

```typescript
const cache = new RedisDrizzleCache({
    redis,
    namespace: "myapp:drizzle" // Keys will be prefixed with "myapp:drizzle:..."
});
```

## Cache Configuration (CacheConfig)

When using explicit caching with `.$withCache()`, you can provide additional cache configuration:

```typescript
await db.select().from(usersTable).$withCache({
    key: "users",
    ttl: 300,
    tables: ["users"],
    config: {
        ex: 60,        // Expire in 60 seconds
        // OR
        px: 60000,     // Expire in 60000 milliseconds
        // OR
        exat: 1735689600, // Expire at Unix timestamp (seconds)
        // OR
        pxat: 1735689600000 // Expire at Unix timestamp (milliseconds)
    }
});
```

### CacheConfig Options

- `ex` - Expiration time in seconds
- `px` - Expiration time in milliseconds
- `exat` - Unix timestamp (seconds) at which the key will expire
- `pxat` - Unix timestamp (milliseconds) at which the key will expire
- `keepTtl` - Retain existing TTL when updating a key

## How It Works

### Caching Strategy: "all"

When using the `"all"` strategy, all queries are automatically cached:

1. Before executing a query, Drizzle checks the cache using the query hash as the key
2. If found, the cached result is returned immediately
3. If not found, the query executes and the result is stored in cache with the configured TTL
4. The cache tracks which tables each cached query depends on

### Cache Invalidation

When mutations (INSERT, UPDATE, DELETE) occur:

1. Drizzle calls `onMutate()` with the affected tables
2. The cache finds all cached queries associated with those tables
3. Those cache entries are deleted
4. Subsequent queries for those tables will execute fresh queries

### Caching Strategy: "explicit"

When using the `"explicit"` strategy:

1. Only queries explicitly marked with `.$withCache()` are cached
2. You must provide a cache key, TTL, and associated tables
3. Cache invalidation works the same way based on table mutations

## API Reference

### RedisDrizzleCache

#### Constructor

```typescript
new RedisDrizzleCache(config: RedisCacheConfig): RedisDrizzleCache
```

Creates a new RedisDrizzleCache instance.

#### Methods

##### strategy()

```typescript
strategy(): "explicit" | "all"
```

Returns the cache strategy being used.

##### get()

```typescript
get(key: string): Promise<any[] | undefined>
```

Retrieves cached data for a given query key. Called automatically by Drizzle.

**Parameters:**
- `key` - The hashed query key to look up in cache

**Returns:** The cached query result as an array, or `undefined` if not found

##### put()

```typescript
put(
    key: string,
    response: any,
    tables: string[],
    isTag: boolean,
    config?: CacheConfig
): Promise<void>
```

Stores query results in the cache. Called automatically by Drizzle after executing a query.

**Parameters:**
- `key` - The hashed query key used as the cache key
- `response` - The query result to cache (will be JSON stringified)
- `tables` - Array of table names involved in the query (used for invalidation)
- `isTag` - Whether this is a tag-based cache entry
- `config` - Optional cache configuration for TTL and expiration

##### onMutate()

```typescript
onMutate(params: {
    tags?: string | string[];
    tables?: string | string[] | Table<any> | Table<any>[];
}): Promise<void>
```

Invalidates cache entries when mutations occur. Called automatically by Drizzle when mutations are executed.

**Parameters:**
- `params.tags` - Optional tag(s) to invalidate (for tag-based invalidation)
- `params.tables` - Table(s) that were mutated (can be Table objects or strings)

## Examples

### Basic Setup

```typescript
import { RedisClient } from "bun";
import { drizzle } from "drizzle-orm/node-postgres";
import { RedisDrizzleCache } from "@databuddy/cache";
import { users, posts } from "./schema";

const redis = new RedisClient(process.env.REDIS_URL!);

const cache = new RedisDrizzleCache({
    redis,
    defaultTtl: 300,
    strategy: "all",
    namespace: "myapp"
});

const db = drizzle(connectionString, {
    schema: { users, posts },
    cache
});
```

### Explicit Caching

```typescript
const cache = new RedisDrizzleCache({
    redis,
    strategy: "explicit"
});

// Only this query will be cached
const popularPosts = await db
    .select()
    .from(posts)
    .where(gt(posts.views, 1000))
    .$withCache({
        key: "popular-posts",
        ttl: 600,
        tables: ["posts"]
    });
```

### Custom TTL per Query

```typescript
// Using explicit caching with custom TTL
const users = await db
    .select()
    .from(usersTable)
    .$withCache({
        key: "all-users",
        ttl: 1800, // 30 minutes
        tables: ["users"],
        config: {
            ex: 1800
        }
    });
```


## Error Handling

The cache implementation handles errors gracefully:

- Cache GET failures return `undefined` and log errors to console
- Cache PUT failures log errors but don't throw
- Cache invalidation failures are logged but don't interrupt the mutation

This ensures that cache failures don't break your application - queries will simply execute without caching.

## Performance Considerations

- Cache hits avoid database queries entirely, significantly improving response times
- Cache invalidation is performed in parallel for better performance
- Table-to-key tracking is maintained in memory for fast invalidation lookups
- Redis operations are non-blocking and asynchronous

## TypeScript Support

Full TypeScript support is provided with comprehensive type definitions:

```typescript
import type { RedisCacheConfig } from "@databuddy/cache";

const config: RedisCacheConfig = {
    redis: myRedisClient,
    defaultTtl: 300,
    strategy: "all",
    namespace: "myapp"
};
```

## Requirements

- Drizzle ORM ^0.45.1
- Bun runtime
- Bun's RedisClient
- A Redis server (local or remote)

## License

See the main repository license.