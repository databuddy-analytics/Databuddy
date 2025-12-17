import { RedisProvider } from "@ai-sdk-tools/memory/redis";
import { redis } from "@databuddy/redis";
import { supermemoryTools, withSupermemory } from "@supermemory/tools/ai-sdk";
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

/**
 * Supermemory configuration for enhanced memory management.
 * User Profiles: Automatic personalization with user context
 * Memory Tools: Agent-based memory operations (search, add, fetch)
 * Enhanced Analytics: Agents can remember user preferences and analysis patterns
 */
export const supermemoryApiKey = process.env.SUPERMEMORY_API_KEY;

/**
 * Supermemory tools for agent-based memory operations.
 * Includes search_memory, add_memory, and other memory management tools.
 */
export const memoryTools = supermemoryApiKey
	? supermemoryTools(supermemoryApiKey)
	: {};

/**
 * Wraps a model with user profile context for personalization.
 * Automatically injects user-specific context into every LLM call.
 */
export function withUserProfile(model: any, userId: string) {
	if (!supermemoryApiKey) {
		return model;
	}
	return withSupermemory(model, userId);
}
