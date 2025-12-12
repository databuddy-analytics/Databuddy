import type { RedisClient } from "bun";
import { getTableName, is, Table } from "drizzle-orm";
import { Cache } from "drizzle-orm/cache/core";
import type { CacheConfig } from "drizzle-orm/cache/core/types";

export type RedisCacheConfig = {
    /** Redis client instance */
    redis: RedisClient;
    /** Default TTL in seconds */
    defaultTtl?: number;
    /** Cache strategy: 'explicit' (only cache when .$withCache() is used) or 'all' (cache all queries) */
    strategy?: "explicit" | "all";
    /** Optional namespace prefix for cache keys */
    namespace?: string;
};

export class RedisDrizzleCache extends Cache {
    private readonly redis: RedisClient;
    private readonly defaultTtl: number;
    private readonly namespace: string;
    private readonly _strategy: "explicit" | "all";
    // Track which query keys were used for specific tables for invalidation
    private readonly usedTablesPerKey: Record<string, string[]> = {};

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

    override strategy(): "explicit" | "all" {
        return this._strategy;
    }

    /**
     * Retrieve cached data for a query key
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
     * Store query results in cache
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
     * Invalidate cache entries when mutations occur
     */
    override async onMutate(params: {
        tags: string | string[];
        tables: string | string[] | Table<any> | Table<any>[];
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
     * Format cache key with namespace prefix
     */
    private formatKey(key: string): string {
        return `${this.namespace}:${key}`;
    }

    /**
     * Calculate TTL from config, converting to seconds
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
