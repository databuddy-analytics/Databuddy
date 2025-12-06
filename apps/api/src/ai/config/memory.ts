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
 * Memory configurations for different agent types.
 * Higher-capability models get more memory to support complex, multi-step reasoning.
 */

/** Minimal memory for simple routing (triage) */
export const minimalMemoryConfig = {
	provider: memoryProvider,
	history: {
		enabled: true,
		limit: 10, // ~5 turns - just enough for context
	},
} as const;

/** Standard memory for typical analytical queries */
export const standardMemoryConfig = {
	provider: memoryProvider,
	history: {
		enabled: true,
		limit: 20, // ~10 turns - good for most conversations
	},
} as const;

/** Extended memory for complex multi-step investigations */
export const extendedMemoryConfig = {
	provider: memoryProvider,
	history: {
		enabled: true,
		limit: 30, // ~15 turns - deep analysis sessions
	},
} as const;

/** Maximum memory for advanced reasoning with Sonnet */
export const maxMemoryConfig = {
	provider: memoryProvider,
	history: {
		enabled: true,
		limit: 40, // ~20 turns - complex multi-step workflows
	},
} as const;

/** @deprecated Use specific memory configs instead */
export const defaultMemoryConfig = standardMemoryConfig;

