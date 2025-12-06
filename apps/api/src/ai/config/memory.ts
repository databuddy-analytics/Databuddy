import { RedisProvider } from "@ai-sdk-tools/memory/redis";
import { redis } from "@databuddy/redis";
import type { RedisClientType } from "redis";

/**
 * Shared memory provider for all agents.
 * Uses Redis for persistent conversation history.
 */
export const memoryProvider = new RedisProvider(
	redis as unknown as RedisClientType
);

/**
 * Default memory configuration for agents.
 */
export const defaultMemoryConfig = {
	provider: memoryProvider,
	history: {
		enabled: true,
		limit: 10,
	},
} as const;
