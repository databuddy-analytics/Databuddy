import type { ToolInfo, Usage } from "../shared/types";
import type { Model } from "./providers";
import { isV3 } from "./providers";

/** Extracts a numeric token count from v2 (number) or v3 (object with .total) formats */
function getTokenCount(value: unknown): number | undefined {
	if (typeof value === "number") {
		return value;
	}
	if (value && typeof value === "object" && "total" in value) {
		const total = (value as { total: unknown }).total;
		if (typeof total === "number") {
			return total;
		}
	}
	return undefined;
}

/** Extracts reasoning tokens from v2 or v3 formats */
function getReasoningTokens(
	usage: Record<string, unknown>
): number | undefined {
	if (typeof usage.reasoningTokens === "number") {
		return usage.reasoningTokens;
	}

	const outputTokens = usage.outputTokens;
	if (
		outputTokens &&
		typeof outputTokens === "object" &&
		"reasoning" in outputTokens
	) {
		const reasoning = (outputTokens as { reasoning: unknown }).reasoning;
		if (typeof reasoning === "number") {
			return reasoning;
		}
	}
	return undefined;
}

/** Extracts cached input tokens from v2 or v3 formats */
function getCachedTokens(usage: Record<string, unknown>): number | undefined {
	if (typeof usage.cachedInputTokens === "number") {
		return usage.cachedInputTokens;
	}

	const inputTokens = usage.inputTokens;
	if (
		inputTokens &&
		typeof inputTokens === "object" &&
		"cacheRead" in inputTokens
	) {
		const cacheRead = (inputTokens as { cacheRead: unknown }).cacheRead;
		if (typeof cacheRead === "number") {
			return cacheRead;
		}
	}
	return undefined;
}

/** Extracts cache creation tokens from Anthropic provider metadata */
function getCacheCreationTokens(metadata: unknown): number | undefined {
	if (!metadata || typeof metadata !== "object" || !("anthropic" in metadata)) {
		return undefined;
	}

	const anthropic = (metadata as { anthropic: unknown }).anthropic;
	if (!anthropic || typeof anthropic !== "object") {
		return undefined;
	}

	if ("cacheCreationInputTokens" in anthropic) {
		const tokens = (anthropic as { cacheCreationInputTokens: unknown })
			.cacheCreationInputTokens;
		if (typeof tokens === "number") {
			return tokens;
		}
	}
	return undefined;
}

/** Extracts web search count from provider metadata */
function getWebSearchCount(metadata: unknown, usage?: unknown): number {
	// Anthropic web search
	if (metadata && typeof metadata === "object" && "anthropic" in metadata) {
		const anthropic = (metadata as { anthropic: unknown }).anthropic;
		if (
			anthropic &&
			typeof anthropic === "object" &&
			"server_tool_use" in anthropic
		) {
			const serverToolUse = (anthropic as { server_tool_use: unknown })
				.server_tool_use;
			if (
				serverToolUse &&
				typeof serverToolUse === "object" &&
				"web_search_requests" in serverToolUse
			) {
				const count = (serverToolUse as { web_search_requests: unknown })
					.web_search_requests;
				if (typeof count === "number") {
					return count;
				}
			}
		}
	}

	// OpenAI/Perplexity search context
	if (
		usage &&
		typeof usage === "object" &&
		"search_context_size" in usage &&
		(usage as { search_context_size?: unknown }).search_context_size
	) {
		return 1;
	}

	return 0;
}

/** Builds a complete Usage object from raw usage data and provider metadata */
export function buildUsage(
	rawUsage: {
		inputTokens?: unknown;
		outputTokens?: unknown;
		totalTokens?: number;
	},
	metadata: unknown
): Usage {
	const usageObj = rawUsage as Record<string, unknown>;
	const inputTokens = getTokenCount(rawUsage.inputTokens) ?? 0;
	const outputTokens = getTokenCount(rawUsage.outputTokens) ?? 0;

	return {
		inputTokens,
		outputTokens,
		totalTokens: rawUsage.totalTokens ?? inputTokens + outputTokens,
		cachedInputTokens: getCachedTokens(usageObj),
		cacheCreationInputTokens: getCacheCreationTokens(metadata),
		reasoningTokens: getReasoningTokens(usageObj),
		webSearchCount: getWebSearchCount(metadata, rawUsage),
	};
}

/**
 * Adjusts input tokens for Anthropic v3 models where inputTokens.total includes cache tokens.
 * Mutates the usage object in place.
 */
export function adjustAnthropicCache(
	model: Model,
	provider: string,
	usage: Usage
): void {
	if (!(isV3(model) && provider.toLowerCase().includes("anthropic"))) {
		return;
	}

	const cacheTokens =
		(usage.cachedInputTokens ?? 0) + (usage.cacheCreationInputTokens ?? 0);
	if (usage.inputTokens && cacheTokens > 0) {
		usage.inputTokens = Math.max(usage.inputTokens - cacheTokens, 0);
		usage.totalTokens = usage.inputTokens + usage.outputTokens;
	}
}

/** Builds tool information from model output content */
export function buildToolInfo(
	content: Array<{ type: string; toolName?: string }>,
	params?: { tools?: Array<{ name: string }> }
): ToolInfo {
	const calls = content.filter((p) => p.type === "tool-call");
	const results = content.filter((p) => p.type === "tool-result");
	const available = params?.tools?.map((t) => t.name) ?? [];

	return {
		callCount: calls.length,
		resultCount: results.length,
		calledTools: [
			...new Set(calls.map((c) => c.toolName).filter(Boolean)),
		] as string[],
		availableTools: available.length > 0 ? available : undefined,
	};
}

/** Token count extractor for streaming */
export {
	getCachedTokens,
	getReasoningTokens,
	getTokenCount,
	getWebSearchCount,
};
