export type { DeduplicationCache } from "./interface";
export { MemoryLRUCache } from "./memory";

import type { DedupStrategy } from "../types";
import type { DeduplicationCache } from "./interface";
import { MemoryLRUCache } from "./memory";

/**
 * No-op cache that never deduplicates
 */
class NoopCache implements DeduplicationCache {
	async isDuplicate(_eventId: string): Promise<boolean> {
		return false;
	}
	async add(_eventId: string): Promise<void> {}
	async remove(_eventId: string): Promise<void> {}
	async clear(): Promise<void> {}
	async size(): Promise<number> {
		return 0;
	}
	async close(): Promise<void> {}
}

/**
 * Create a deduplication cache based on strategy
 */
export function createDeduplicationCache(
	strategy: DedupStrategy,
	options: {
		maxSize?: number;
		ttlSeconds?: number;
	} = {},
): DeduplicationCache {
	switch (strategy) {
		case "memory":
			return new MemoryLRUCache(options.maxSize, options.ttlSeconds);

		case "none":
		default:
			return new NoopCache();
	}
}
