import { logger } from "@/logger";
import type {
    FlagResult,
    FlagState,
    FlagsConfig,
    FlagsManager,
    FlagsManagerOptions,
} from "@/core/flags/types";

export class ServerFlagsManager implements FlagsManager {
    private config: FlagsConfig;
    private onFlagsUpdate?: (flags: Record<string, FlagResult>) => void;
    private onConfigUpdate?: (config: FlagsConfig) => void;
    private memoryFlags: Record<string, FlagResult> = {};
    private pendingFlags: Set<string> = new Set();
    private initPromise: Promise<void>;

    constructor(options: FlagsManagerOptions) {
        this.config = this.withDefaults(options.config);
        this.onFlagsUpdate = options.onFlagsUpdate;
        this.onConfigUpdate = options.onConfigUpdate;

        logger.setDebug(this.config.debug ?? false);
        logger.debug("ServerFlagsManager initialized with config:", {
            clientId: this.config.clientId,
            debug: this.config.debug,
            isPending: this.config.isPending,
            hasUser: !!this.config.user,
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
            autoFetch: config.autoFetch ?? false,  // Default to false to use /evaluate endpoint
            environment: config.environment,
        };
    }

    private async initialize(): Promise<void> {
        if (this.config.autoFetch && !this.config.isPending) {
            await this.fetchAllFlags();
        }
    }

    public async waitForInitialization(): Promise<void> {
        await this.initPromise;
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
        if (this.config.environment) {
            params.set("environment", this.config.environment);
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

        // If a specific user is provided and differs from config.user, fetch fresh
        const isDifferentUser = user && (user.userId !== this.config.user?.userId);

        if (!isDifferentUser && this.memoryFlags[key]) {
            logger.debug(`Memory cache hit: ${key}`);
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

        return this.fetchFlag(key, user);
    }

    private async fetchFlag(key: string, user?: FlagsConfig["user"]): Promise<FlagResult> {
        this.pendingFlags.add(key);

        const targetUser = user || this.config.user;

        const params = new URLSearchParams();
        params.set("key", key);
        params.set("clientId", this.config.clientId);
        if (this.config.environment) {
            params.set("environment", this.config.environment);
        }
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
        this.getFlag(key).catch((err) => logger.error(`Background fetch error for ${key}:`, err)); return {
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
        }

        await this.fetchAllFlags();
    }

    updateUser(user: FlagsConfig["user"]): void {
        this.config = { ...this.config, user };
        this.onConfigUpdate?.(this.config);
        this.refresh().catch((err) => logger.error("Refresh error after user update:", err));
    }

    updateConfig(config: FlagsConfig): void {
        this.config = this.withDefaults(config);
        this.onConfigUpdate?.(this.config);

        if (this.config.autoFetch && !this.config.isPending) {
            this.fetchAllFlags().catch((err) => logger.error("Fetch error after config update:", err));
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
