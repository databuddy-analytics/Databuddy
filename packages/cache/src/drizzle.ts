import type { RedisClient } from "bun";
import { getTableName, is, Table } from "drizzle-orm";
import { Cache } from "drizzle-orm/cache/core";
import type { CacheConfig } from "drizzle-orm/cache/core/types";

/**
 * Configuration options for creating a Redis-based Drizzle cache instance.
 *
 * @example
 * ```typescript
 * import { RedisClient } from "bun";
 * import { RedisDrizzleCache } from "@databuddy/cache";
 *
 * const redis = new RedisClient(process.env.REDIS_URL!);
 * const cache = new RedisDrizzleCache({
 *   redis,
 *   defaultTtl: 300, // 5 minutes
 *   strategy: "all",
 *   namespace: "drizzle:db"
 * });
 * ```
 */
export type RedisCacheConfig = {
    /**
     * Redis client instance from Bun.
     * Must be a connected RedisClient instance.
     *
     * @example
     * ```typescript
     * const redis = new RedisClient("redis://localhost:6379");
     * ```
     */
    redis: RedisClient;
    /**
     * Default time-to-live for cached entries in seconds.
     * Used when no explicit TTL is provided via CacheConfig.
     *
     * @default 300 (5 minutes)
     *
     * @example
     * ```typescript
     * // Cache entries expire after 10 minutes
     * defaultTtl: 600
     * ```
     */
    defaultTtl?: number;
    /**
     * Cache strategy determines when queries are cached.
     *
     * - `"all"`: All queries are automatically cached (default)
     * - `"explicit"`: Only queries explicitly marked with `.$withCache()` are cached
     *
     * @default "all"
     *
     * @example
     * ```typescript
     * // Only cache when explicitly requested
     * strategy: "explicit"
     *
     * // Then use in queries:
     * const users = await db.select().from(usersTable).$withCache({
     *   key: "all-users",
     *   ttl: 60
     * });
     * ```
     */
    strategy?: "explicit" | "all";
    /**
     * Optional namespace prefix for all cache keys.
     * Useful for isolating cache entries from different applications or environments.
     *
     * @default "drizzle"
     *
     * @example
     * ```typescript
     * // Cache keys will be prefixed with "myapp:drizzle:..."
     * namespace: "myapp:drizzle"
     * ```
     */
    namespace?: string;
};

/**
 * Redis-based cache implementation for Drizzle ORM.
 *
 * This cache extends Drizzle's base Cache class and uses Redis (via Bun's RedisClient)
 * to store and retrieve query results. It automatically invalidates cache entries
 * when mutations occur on tracked tables.
 *
 * @example
 * ```typescript
 * import { RedisClient } from "bun";
 * import { drizzle } from "drizzle-orm/node-postgres";
 * import { RedisDrizzleCache } from "@databuddy/cache";
 * import { users } from "./schema";
 *
 * // Create Redis client
 * const redis = new RedisClient(process.env.REDIS_URL!);
 *
 * // Create cache instance
 * const cache = new RedisDrizzleCache({
 *   redis,
 *   defaultTtl: 300, // 5 minutes
 *   strategy: "all", // Cache all queries
 *   namespace: "myapp:drizzle"
 * });
 *
 * // Use with Drizzle
 * const db = drizzle(connectionString, {
 *   schema,
 *   cache
 * });
 *
 * // Queries are automatically cached
 * const allUsers = await db.select().from(users);
 *
 * // Mutations automatically invalidate related cache entries
 * await db.update(users).set({ name: "John" }).where(eq(users.id, 1));
 * // Cache entries for 'users' table are now invalidated
 * ```
 *
 * @example
 * ```typescript
 * // Using explicit caching strategy
 * const cache = new RedisDrizzleCache({
 *   redis,
 *   strategy: "explicit"
 * });
 *
 * // Only explicitly marked queries are cached
 * const users = await db
 *   .select()
 *   .from(users)
 *   .$withCache({
 *     key: "all-users",
 *     ttl: 600, // 10 minutes
 *     tables: ["users"]
 *   });
 * ```
 */
export class RedisDrizzleCache extends Cache {
    private readonly redis: RedisClient;
    private readonly defaultTtl: number;
    private readonly namespace: string;
    private readonly _strategy: "explicit" | "all";
    // Track which query keys were used for specific tables for invalidation
    private readonly usedTablesPerKey: Record<string, string[]> = {};

    /**
     * Creates a new RedisDrizzleCache instance.
     *
     * @param config - Configuration options for the cache
     *
     * @example
     * ```typescript
     * const cache = new RedisDrizzleCache({
     *   redis: new RedisClient("redis://localhost:6379"),
     *   defaultTtl: 300,
     *   strategy: "all",
     *   namespace: "drizzle:db"
     * });
     * ```
     */
    constructor({
        redis,
        defaultTtl = 300,
        strategy = "all",
        namespace = "drizzle",
    }: RedisCacheConfig) {
        super();
        this.redis = redis;
        this.defaultTtl = defaultTtl;
        this.namespace = namespace;
        this._strategy = strategy;
    }

    /**
     * Returns the cache strategy being used.
     *
     * @returns The cache strategy: `"explicit"` or `"all"`
     *
     * @example
     * ```typescript
     * const cache = new RedisDrizzleCache({ redis, strategy: "all" });
     * console.log(cache.strategy()); // "all"
     * ```
     */
    override strategy(): "explicit" | "all" {
        return this._strategy;
    }

    /**
     * Retrieves cached data for a given query key.
     *
     * This method is called by Drizzle when checking if a query result exists in cache.
     * The key is a hash of the query and its parameters.
     *
     * @param key - The hashed query key to look up in cache
     * @returns The cached query result as an array, or `undefined` if not found or on error
     *
     * @example
     * ```typescript
     * // This is called automatically by Drizzle
     * const cached = await cache.get("abc123def456");
     * if (cached) {
     *   // Use cached result
     * }
     * ```
     *
     * @remarks
     * - Returns `undefined` if the key doesn't exist in Redis
     * - Returns `undefined` if JSON parsing fails
     * - Logs errors to console but doesn't throw
     */
    override async get(key: string): Promise<any[] | undefined> {
        const cacheKey = this.formatKey(key);
        try {
            const cached = await this.redis.get(cacheKey);
            if (!cached) {
                return;
            }
            return JSON.parse(cached) as any[];
        } catch (error) {
            console.error(
                `[RedisDrizzleCache] GET failed for key ${cacheKey}:`,
                error
            );
            return;
        }
    }

    /**
     * Stores query results in the cache.
     *
     * This method is called by Drizzle after executing a query to store the result.
     * It also tracks which tables are associated with each cache key for invalidation.
     *
     * @param key - The hashed query key used as the cache key
     * @param response - The query result to cache (will be JSON stringified)
     * @param tables - Array of table names involved in the query (used for invalidation)
     * @param _isTag - Whether this is a tag-based cache entry (unused in this implementation)
     * @param config - Optional cache configuration for TTL and expiration
     *
     * @example
     * ```typescript
     * // This is called automatically by Drizzle after a query
     * await cache.put(
     *   "abc123def456",
     *   [{ id: 1, name: "John" }],
     *   ["users"],
     *   false,
     *   { ex: 300 } // 5 minutes TTL
     * );
     * ```
     *
     * @example
     * ```typescript
     * // Using different TTL options
     * await cache.put(key, data, ["users"], false, {
     *   ex: 60,        // Expire in 60 seconds
     *   // OR
     *   px: 60000,     // Expire in 60000 milliseconds
     *   // OR
     *   exat: 1735689600, // Expire at Unix timestamp (seconds)
     *   // OR
     *   pxat: 1735689600000 // Expire at Unix timestamp (milliseconds)
     * });
     * ```
     *
     * @remarks
     * - Automatically tracks table-to-key relationships for invalidation
     * - Uses `setex` Redis command to set key with expiration
     * - Logs errors to console but doesn't throw
     */
    override async put(
        key: string,
        response: any,
        tables: string[],
        _isTag: boolean,
        config?: CacheConfig
    ): Promise<void> {
        const cacheKey = this.formatKey(key);
        const ttl = this.calculateTtl(config);

        try {
            // Store the response in Redis with TTL
            await this.redis.setex(cacheKey, ttl, JSON.stringify(response));

            // Track which tables this key is associated with for invalidation
            for (const table of tables) {
                const keys = this.usedTablesPerKey[table];
                if (keys === undefined) {
                    this.usedTablesPerKey[table] = [key];
                } else if (!keys.includes(key)) {
                    keys.push(key);
                }
            }
        } catch (error) {
            console.error(
                `[RedisDrizzleCache] PUT failed for key ${cacheKey}:`,
                error
            );
        }
    }

    /**
     * Invalidates cache entries when mutations (INSERT, UPDATE, DELETE) occur.
     *
     * This method is called automatically by Drizzle when mutations are executed.
     * It finds all cache keys associated with the affected tables and deletes them.
     *
     * @param params - Mutation parameters containing tags and/or tables
     * @param params.tags - Optional tag(s) to invalidate (for tag-based invalidation)
     * @param params.tables - Table(s) that were mutated (can be Table objects or strings)
     *
     * @example
     * ```typescript
     * // This is called automatically when you update a table
     * await db.update(users).set({ name: "Jane" }).where(eq(users.id, 1));
     * // Cache automatically calls onMutate with tables: ["users"]
     * ```
     *
     * @example
     * ```typescript
     * // Invalidating by table name
     * await cache.onMutate({
     *   tables: ["users", "posts"]
     * });
     * ```
     *
     * @example
     * ```typescript
     * // Invalidating by Table object
     * import { users, posts } from "./schema";
     * await cache.onMutate({
     *   tables: [users, posts]
     * });
     * ```
     *
     * @example
     * ```typescript
     * // Invalidating by tags
     * await cache.onMutate({
     *   tags: ["user-profile", "dashboard"]
     * });
     * ```
     *
     * @remarks
     * - All cache keys associated with the specified tables are deleted
     * - Table-to-key tracking is cleaned up after invalidation
     * - Tag-based invalidation is supported but tags must be tracked separately
     * - Operations are performed in parallel for better performance
     */
    override async onMutate(params: {
        tags?: string | string[];
        tables?: string | string[] | Table<any> | Table<any>[];
    }): Promise<void> {
        const tagsArray = params.tags
            ? Array.isArray(params.tags)
                ? params.tags
                : [params.tags]
            : [];
        const tablesArray = params.tables
            ? Array.isArray(params.tables)
                ? params.tables
                : [params.tables]
            : [];

        const keysToDelete = new Set<string>();

        // Collect all keys associated with affected tables
        for (const table of tablesArray) {
            const tableName = is(table, Table)
                ? getTableName(table)
                : (table as string);
            const keys = this.usedTablesPerKey[tableName] ?? [];
            for (const key of keys) {
                keysToDelete.add(key);
            }
        }

        // Delete cache entries and clean up tracking
        if (keysToDelete.size > 0 || tagsArray.length > 0) {
            const deletePromises: Promise<unknown>[] = [];

            // Delete by tags (if tags are used, you might want to track them separately)
            for (const tag of tagsArray) {
                const tagKey = this.formatKey(`tag:${tag}`);
                deletePromises.push(this.redis.unlink(tagKey));
            }

            // Delete cache entries
            for (const key of keysToDelete) {
                const cacheKey = this.formatKey(key);
                deletePromises.push(this.redis.unlink(cacheKey));
            }

            // Clean up tracking for affected tables
            for (const table of tablesArray) {
                const tableName = is(table, Table)
                    ? getTableName(table)
                    : (table as string);
                this.usedTablesPerKey[tableName] = [];
            }

            await Promise.all(deletePromises);
        }
    }

    /**
     * Formats a cache key with the namespace prefix.
     *
     * @param key - The base cache key (usually a hash)
     * @returns The formatted key with namespace prefix
     *
     * @example
     * ```typescript
     * // If namespace is "drizzle:db"
     * formatKey("abc123") // Returns "drizzle:db:abc123"
     * ```
     *
     * @internal
     */
    private formatKey(key: string): string {
        return `${this.namespace}:${key}`;
    }

    /**
     * Calculates the time-to-live (TTL) in seconds from cache configuration.
     *
     * Supports multiple TTL formats:
     * - `ex`: Expiration time in seconds
     * - `px`: Expiration time in milliseconds (converted to seconds)
     * - `exat`: Unix timestamp in seconds (converted to relative seconds)
     * - `pxat`: Unix timestamp in milliseconds (converted to relative seconds)
     *
     * @param config - Optional cache configuration object
     * @returns TTL in seconds, or defaultTtl if no config provided
     *
     * @example
     * ```typescript
     * // Expire in 60 seconds
     * calculateTtl({ ex: 60 }) // Returns 60
     *
     * // Expire in 5 minutes (300000 ms)
     * calculateTtl({ px: 300000 }) // Returns 300
     *
     * // Expire at specific Unix timestamp
     * const futureTime = Math.floor(Date.now() / 1000) + 600; // 10 minutes from now
     * calculateTtl({ exat: futureTime }) // Returns ~600
     *
     * // No config, use default
     * calculateTtl() // Returns this.defaultTtl (e.g., 300)
     * ```
     *
     * @remarks
     * - If multiple TTL options are provided, `ex` takes precedence
     * - Negative TTL values are clamped to 0
     * - Falls back to `defaultTtl` if no config is provided
     *
     * @internal
     */
    private calculateTtl(config?: CacheConfig): number {
        if (config?.ex !== undefined) {
            return config.ex;
        }
        if (config?.px !== undefined) {
            return Math.floor(config.px / 1000);
        }
        if (config?.exat !== undefined) {
            const now = Math.floor(Date.now() / 1000);
            return Math.max(0, config.exat - now);
        }
        if (config?.pxat !== undefined) {
            const now = Math.floor(Date.now() / 1000);
            return Math.max(0, Math.floor(config.pxat / 1000) - now);
        }
        return this.defaultTtl;
    }
}

