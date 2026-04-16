import type { SystemModelMessage } from "ai";

/** Anthropic cache control with 1-hour TTL for agent sessions. */
const ANTHROPIC_CACHE_1H = {
	anthropic: {
		cacheControl: { type: "ephemeral", ttl: "1h" },
	},
};

/**
 * Wraps a system prompt string with Anthropic prompt caching (1-hour TTL).
 * The system prompt is large (~5-10K tokens) and mostly static across turns,
 * so caching gives ~90% input cost reduction on subsequent turns.
 * 1-hour TTL prevents cache misses when users take >5 min between queries.
 */
export function cachedSystemPrompt(content: string): SystemModelMessage {
	return {
		role: "system",
		content,
		providerOptions: ANTHROPIC_CACHE_1H,
	};
}

/** Re-export for use in prepareStep conversation caching. */
export { ANTHROPIC_CACHE_1H };
