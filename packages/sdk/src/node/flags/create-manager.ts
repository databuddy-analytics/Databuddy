import type { FlagsConfig } from "@/core/flags/types";
import { ServerFlagsManager } from "./flags-manager";

/**
 * Create a ServerFlagsManager with in-memory caching
 * 
 * @example
 * ```typescript
 * import { createServerFlagsManager } from '@databuddy/sdk/node';
 * 
 * const manager = createServerFlagsManager({
 *   clientId: process.env.DATABUDDY_CLIENT_ID!,
 * });
 * 
 * await manager.waitForInitialization();
 * const flag = await manager.getFlag('my-feature');
 * ```
 */
export function createServerFlagsManager(config: FlagsConfig): ServerFlagsManager {
    return new ServerFlagsManager({
        config,
    });
}

/**
 * Alias for createServerFlagsManager (for backwards compatibility)
 * 
 * @example
 * ```typescript
 * import { createServerFlagsManagerInMemory } from '@databuddy/sdk/node';
 * 
 * const manager = createServerFlagsManagerInMemory({
 *   clientId: process.env.DATABUDDY_CLIENT_ID!,
 * });
 * 
 * await manager.waitForInitialization();
 * const flag = await manager.getFlag('my-feature');
 * ```
 */
export function createServerFlagsManagerInMemory(config: FlagsConfig): ServerFlagsManager {
    return createServerFlagsManager(config);
}
