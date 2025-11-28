import { logger } from "@/logger";
import type {
    FlagResult,
    FlagState,
    FlagsConfig,
    FlagsManager,
    FlagsManagerOptions,
} from "@/core/flags/types";

export class NodeFlagsManager implements FlagsManager {
    private config: FlagsConfig;
    private redis?: any; // Will be lazy-loaded from @databuddy/redis
    private cachePrefix: string;
    private cacheTTL: number;
    private onFlagsUpdate?: (flags: Record<string, FlagResult>) => void;
    private onConfigUpdate?: (config: FlagsConfig) => void;
    private memoryFlags: Record<string, FlagResult> = {};
    private pendingFlags: Set<string> = new Set();
    private initPromise: Promise<void>;
    private useRedis: boolean;

    constructor(options: FlagsManagerOptions & {
        cachePrefix?: string;
        cacheTTL?: number;
        useRedis?: boolean;
    }) {
        this.config = this.withDefaults(options.config);
        this.cachePrefix = options.cachePrefix || "databuddy:flags:";
        this.cacheTTL = options.cacheTTL || 3600; // 1 hour default
        this.useRedis = options.useRedis ?? true; // Use Redis by default
        this.onFlagsUpdate = options.onFlagsUpdate;
        this.onConfigUpdate = options.onConfigUpdate;

        logger.setDebug(this.config.debug ?? false);
        logger.debug("NodeFlagsManager initialized with config:", {
            clientId: this.config.clientId,
            debug: this.config.debug,
            isPending: this.config.isPending,
            hasUser: !!this.config.user,
            useRedis: this.useRedis,
        });

        this.initPromise = this.initialize();
    }

    private withDefaults(config: FlagsConfig): FlagsConfig {
        return {
            clientId: config.clientId,
            apiUrl: config.apiUrl ?? "https://api.databuddy.cc",
            user: config.user,
            disabled: config.disabled ?? false,
            debug: config.debug ?? false,
            skipStorage: config.skipStorage ?? false,
            isPending: config.isPending,
            autoFetch: config.autoFetch !== false,
        };
    }

    private async getRedis() {
        if (!this.useRedis || this.config.skipStorage) {
            return null;
        }

        if (!this.redis) {
            try {
                // Lazy-load Redis from @databuddy/redis package
                const redisModule = await import("@databuddy/redis");
                this.redis = redisModule.redis;
                logger.debug("Redis client loaded successfully");
            } catch (err) {
                logger.warn("Failed to load Redis, falling back to in-memory cache:", err);
                this.useRedis = false;
                return null;
            }
        }

        return this.redis;
    }

    private getCacheKey(key: string, userId?: string): string {
        const userPart = userId ? `:user:${userId}` : "";
        return `${this.cachePrefix}${this.config.clientId}:${key}${userPart}`;
    }

    private async initialize(): Promise<void> {
        const redis = await this.getRedis();

        if (redis) {
            await this.loadCachedFlags();
        }

        if (this.config.autoFetch && !this.config.isPending) {
            await this.fetchAllFlags();
        }
    }

    public async waitForInitialization(): Promise<void> {
        await this.initPromise;
    }

    private async loadCachedFlags(): Promise<void> {
        const redis = await this.getRedis();
        if (!redis) {
            return;
        }

        try {
            const pattern = `${this.cachePrefix}${this.config.clientId}:*`;
            const keys = await redis.keys(pattern);

            for (const fullKey of keys) {
                const value = await redis.get(fullKey);
                if (value) {
                    try {
                        const flagResult = JSON.parse(value) as FlagResult;
                        // Extract the flag key from the cache key
                        const flagKey = fullKey
                            .replace(`${this.cachePrefix}${this.config.clientId}:`, "")
                            .split(":user:")[0];
                        this.memoryFlags[flagKey] = flagResult;
                    } catch (err) {
                        logger.warn(`Error parsing cached flag ${fullKey}:`, err);
                    }
                }
            }

            if (Object.keys(this.memoryFlags).length > 0) {
                this.notifyFlagsUpdate();
                logger.debug("Loaded cached flags:", Object.keys(this.memoryFlags));
            }
        } catch (err) {
            logger.warn("Error loading cached flags:", err);
        }
    }

    async fetchAllFlags(user?: FlagsConfig["user"]): Promise<void> {
        if (this.config.isPending) {
            logger.debug("Session pending, skipping bulk fetch");
            return;
        }

        const targetUser = user || this.config.user;

        const params = new URLSearchParams();
        params.set("clientId", this.config.clientId);
        if (targetUser?.userId) {
            params.set("userId", targetUser.userId);
        }
        if (targetUser?.email) {
            params.set("email", targetUser.email);
        }
        if (targetUser?.properties) {
            params.set("properties", JSON.stringify(targetUser.properties));
        }

        const url = `${this.config.apiUrl}/public/v1/flags/bulk?${params.toString()}`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            logger.debug("Bulk fetch response:", result);

            if (result.flags) {
                this.memoryFlags = result.flags;
                this.notifyFlagsUpdate();

                const redis = await this.getRedis();
                if (redis) {
                    try {
                        // Cache all flags with Redis
                        for (const [key, value] of Object.entries(result.flags)) {
                            const cacheKey = this.getCacheKey(key, targetUser?.userId);
                            await redis.set(
                                cacheKey,
                                JSON.stringify(value),
                                "EX",
                                this.cacheTTL
                            );
                        }
                        logger.debug("Bulk flags synced to Redis cache");
                    } catch (err) {
                        logger.warn("Bulk Redis cache error:", err);
                    }
                }
            }
        } catch (err) {
            logger.error("Bulk fetch error:", err);
        }
    }

    async getFlag(key: string, user?: FlagsConfig["user"]): Promise<FlagResult> {
        logger.debug(`Getting: ${key}`);

        if (this.config.isPending) {
            logger.debug(`Session pending for: ${key}`);
            return {
                enabled: false,
                value: false,
                payload: null,
                reason: "SESSION_PENDING",
            };
        }

        // If a specific user is provided, we bypass memory cache unless we implement user-aware caching.
        // For now, if user is provided and differs from config.user, we fetch fresh.
        // If no user provided (or matches config), we check memory.
        const isDifferentUser = user && (user.userId !== this.config.user?.userId);

        if (!isDifferentUser && this.memoryFlags[key]) {
            logger.debug(`Memory: ${key}`);
            return this.memoryFlags[key];
        }

        if (!isDifferentUser && this.pendingFlags.has(key)) {
            logger.debug(`Pending: ${key}`);
            return {
                enabled: false,
                value: false,
                payload: null,
                reason: "FETCHING",
            };
        }

        // Check Redis cache
        const redis = await this.getRedis();
        if (!isDifferentUser && redis) {
            try {
                const cacheKey = this.getCacheKey(key, user?.userId);
                const cached = await redis.get(cacheKey);
                if (cached) {
                    logger.debug(`Redis cache hit: ${key}`);
                    const flagResult = JSON.parse(cached) as FlagResult;
                    this.memoryFlags[key] = flagResult;
                    this.notifyFlagsUpdate();
                    return flagResult;
                }
            } catch (err) {
                logger.warn(`Redis cache error: ${key}`, err);
            }
        }

        return this.fetchFlag(key, user);
    }

    private async fetchFlag(key: string, user?: FlagsConfig["user"]): Promise<FlagResult> {
        this.pendingFlags.add(key);

        const targetUser = user || this.config.user;

        const params = new URLSearchParams();
        params.set("key", key);
        params.set("clientId", this.config.clientId);
        if (targetUser?.userId) {
            params.set("userId", targetUser.userId);
        }
        if (targetUser?.email) {
            params.set("email", targetUser.email);
        }
        if (targetUser?.properties) {
            params.set("properties", JSON.stringify(targetUser.properties));
        }

        const url = `${this.config.apiUrl}/public/v1/flags/evaluate?${params.toString()}`;

        logger.debug(`Fetching: ${key}`);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result: FlagResult = await response.json();

            logger.debug(`Response for ${key}:`, result);

            // Only cache if it's for the default user
            const isDefaultUser = !user || (user.userId === this.config.user?.userId);

            if (isDefaultUser) {
                this.memoryFlags[key] = result;
                this.notifyFlagsUpdate();

                const redis = await this.getRedis();
                if (redis) {
                    try {
                        const cacheKey = this.getCacheKey(key, targetUser?.userId);
                        await redis.set(
                            cacheKey,
                            JSON.stringify(result),
                            "EX",
                            this.cacheTTL
                        );
                        logger.debug(`Cached to Redis: ${key}`);
                    } catch (err) {
                        logger.warn(`Redis cache error: ${key}`, err);
                    }
                }
            }

            return result;
        } catch (err) {
            logger.error(`Fetch error: ${key}`, err);

            const fallback = {
                enabled: false,
                value: false,
                payload: null,
                reason: "ERROR",
            };

            // Only cache fallback if default user
            const isDefaultUser = !user || (user.userId === this.config.user?.userId);
            if (isDefaultUser) {
                this.memoryFlags[key] = fallback;
                this.notifyFlagsUpdate();
            }

            return fallback;
        } finally {
            this.pendingFlags.delete(key);
        }
    }

    isEnabled(key: string): FlagState {
        if (this.memoryFlags[key]) {
            return {
                enabled: this.memoryFlags[key].enabled,
                isLoading: false,
                isReady: true,
            };
        }
        if (this.pendingFlags.has(key)) {
            return {
                enabled: false,
                isLoading: true,
                isReady: false,
            };
        }
        // Trigger fetch but don't await
        this.getFlag(key);
        return {
            enabled: false,
            isLoading: true,
            isReady: false,
        };
    }

    async refresh(forceClear = false): Promise<void> {
        logger.debug("Refreshing", { forceClear });

        if (forceClear) {
            this.memoryFlags = {};
            this.notifyFlagsUpdate();

            const redis = await this.getRedis();
            if (redis) {
                try {
                    const pattern = `${this.cachePrefix}${this.config.clientId}:*`;
                    const keys = await redis.keys(pattern);
                    if (keys.length > 0) {
                        await redis.del(...keys);
                    }
                    logger.debug("Redis cache cleared");
                } catch (err) {
                    logger.warn("Redis cache clear error:", err);
                }
            }
        }

        await this.fetchAllFlags();
    }

    updateUser(user: FlagsConfig["user"]): void {
        this.config = { ...this.config, user };
        this.onConfigUpdate?.(this.config);
        this.refresh();
    }

    updateConfig(config: FlagsConfig): void {
        this.config = this.withDefaults(config);
        this.onConfigUpdate?.(this.config);

        this.getRedis().then((redis) => {
            if (redis) {
                this.loadCachedFlags();
            }
        });

        if (this.config.autoFetch && !this.config.isPending) {
            this.fetchAllFlags();
        }
    }

    getMemoryFlags(): Record<string, FlagResult> {
        return { ...this.memoryFlags };
    }

    getPendingFlags(): Set<string> {
        return new Set(this.pendingFlags);
    }

    private notifyFlagsUpdate(): void {
        this.onFlagsUpdate?.(this.getMemoryFlags());
    }
}
