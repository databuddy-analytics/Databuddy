import type { FlagsConfig } from "@/core/flags/types";
import { NodeFlagsManager } from "./flags-manager";

/**
 * Create a NodeFlagsManager with Redis caching (default)
 * Automatically uses Redis from @databuddy/redis package if available
 * Falls back to in-memory caching if Redis is not available
 * 
 * @example
 * ```typescript
 * import { createNodeFlagsManager } from '@databuddy/sdk/node';
 * 
 * const manager = createNodeFlagsManager({
 *   clientId: process.env.DATABUDDY_CLIENT_ID!,
 * });
 * 
 * await manager.waitForInitialization();
 * const flag = await manager.getFlag('my-feature');
 * ```
 */
export function createNodeFlagsManager(
    config: FlagsConfig,
    options?: {
        cachePrefix?: string;
        cacheTTL?: number;
    }
): NodeFlagsManager {
    return new NodeFlagsManager({
        config,
        useRedis: true,
        ...options,
    });
}

/**
 * Create a NodeFlagsManager without Redis (in-memory only)
 * Useful for development or environments without Redis
 * 
 * @example
 * ```typescript
 * import { createNodeFlagsManagerInMemory } from '@databuddy/sdk/node';
 * 
 * const manager = createNodeFlagsManagerInMemory({
 *   clientId: process.env.DATABUDDY_CLIENT_ID!,
 * });
 * 
 * await manager.waitForInitialization();
 * const flag = await manager.getFlag('my-feature');
 * ```
 */
export function createNodeFlagsManagerInMemory(
    config: FlagsConfig
): NodeFlagsManager {
    return new NodeFlagsManager({
        config: {
            ...config,
            skipStorage: true,
        },
        useRedis: false,
    });
}
