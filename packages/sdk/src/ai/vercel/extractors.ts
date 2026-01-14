/**
 * Token extraction utilities for Vercel AI SDK
 * 
 * Adapted from PostHog's AI SDK implementation:
 * https://github.com/PostHog/posthog-js/tree/main/packages/ai
 */

import type { LanguageModel } from "./guards";
import type { TokenUsage, ToolCallInfo } from "./types";

export const extractTokenCount = (value: unknown): number | undefined => {
	if (typeof value === "number") {
		return value;
	}
	if (
		value &&
		typeof value === "object" &&
		"total" in value &&
		typeof (value as { total: unknown }).total === "number"
	) {
		return (value as { total: number }).total;
	}
	return undefined;
};

export const extractReasoningTokens = (
	usage: Record<string, unknown>
): number | undefined => {
	if ("reasoningTokens" in usage && typeof usage.reasoningTokens === "number") {
		return usage.reasoningTokens;
	}
	if (
		"outputTokens" in usage &&
		usage.outputTokens &&
		typeof usage.outputTokens === "object" &&
		"reasoning" in usage.outputTokens &&
		typeof (usage.outputTokens as { reasoning: unknown }).reasoning === "number"
	) {
		return (usage.outputTokens as { reasoning: number }).reasoning;
	}
	return undefined;
};

export const extractCacheReadTokens = (
	usage: Record<string, unknown>
): number | undefined => {
	if (
		"cachedInputTokens" in usage &&
		typeof usage.cachedInputTokens === "number"
	) {
		return usage.cachedInputTokens;
	}
	if (
		"inputTokens" in usage &&
		usage.inputTokens &&
		typeof usage.inputTokens === "object" &&
		"cacheRead" in usage.inputTokens &&
		typeof (usage.inputTokens as { cacheRead: unknown }).cacheRead === "number"
	) {
		return (usage.inputTokens as { cacheRead: number }).cacheRead;
	}
	return undefined;
};

export const extractCacheCreationTokens = (
	providerMetadata: unknown
): number | undefined => {
	if (
		providerMetadata &&
		typeof providerMetadata === "object" &&
		"anthropic" in providerMetadata &&
		providerMetadata.anthropic &&
		typeof providerMetadata.anthropic === "object" &&
		"cacheCreationInputTokens" in providerMetadata.anthropic &&
		typeof providerMetadata.anthropic.cacheCreationInputTokens === "number"
	) {
		return providerMetadata.anthropic.cacheCreationInputTokens;
	}
	return undefined;
};

const calculateWebSearchCount = (result: {
	usage?: unknown;
	providerMetadata?: unknown;
}): number => {
	if (!result || typeof result !== "object") {
		return 0;
	}
	if (
		result.usage &&
		typeof result.usage === "object" &&
		result.usage !== null &&
		"search_context_size" in result.usage &&
		(result.usage as { search_context_size?: unknown }).search_context_size
	) {
		return 1;
	}
	return 0;
};

export const extractWebSearchCount = (
	providerMetadata: unknown,
	usage?: unknown
): number => {
	if (
		providerMetadata &&
		typeof providerMetadata === "object" &&
		"anthropic" in providerMetadata &&
		providerMetadata.anthropic &&
		typeof providerMetadata.anthropic === "object" &&
		"server_tool_use" in providerMetadata.anthropic
	) {
		const serverToolUse = providerMetadata.anthropic.server_tool_use;
		if (
			serverToolUse &&
			typeof serverToolUse === "object" &&
			"web_search_requests" in serverToolUse &&
			typeof serverToolUse.web_search_requests === "number"
		) {
			return serverToolUse.web_search_requests;
		}
	}
	return calculateWebSearchCount({ usage, providerMetadata });
};

export const extractToolInfo = (
	content: Array<{ type: string; toolName?: string }>,
	params?: { tools?: Array<{ name: string }> }
): ToolCallInfo => {
	const toolCalls = content.filter((part) => part.type === "tool-call");
	const toolResults = content.filter((part) => part.type === "tool-result");
	const toolCallNames = [
		...new Set(
			toolCalls
				.map((c) => c.toolName)
				.filter((name): name is string => Boolean(name))
		),
	];
	const availableTools = params?.tools?.map((t) => t.name) ?? [];

	return {
		toolCallCount: toolCalls.length,
		toolResultCount: toolResults.length,
		toolCallNames,
		availableTools: availableTools.length > 0 ? availableTools : undefined,
	};
};

export const extractAdditionalTokenValues = (
	providerMetadata: unknown
): Record<string, unknown> => {
	if (
		providerMetadata &&
		typeof providerMetadata === "object" &&
		"anthropic" in providerMetadata &&
		providerMetadata.anthropic &&
		typeof providerMetadata.anthropic === "object" &&
		"cacheCreationInputTokens" in providerMetadata.anthropic
	) {
		return {
			cacheCreationInputTokens:
				providerMetadata.anthropic.cacheCreationInputTokens,
		};
	}
	return {};
};

export const extractUsage = (
	usage: {
		inputTokens?: unknown;
		outputTokens?: unknown;
		totalTokens?: number;
	},
	providerMetadata: unknown
): TokenUsage => {
	const usageObj = usage as Record<string, unknown>;
	const inputTokens = extractTokenCount(usage.inputTokens) ?? 0;
	const outputTokens = extractTokenCount(usage.outputTokens) ?? 0;
	const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;
	const cachedInputTokens = extractCacheReadTokens(usageObj);
	const cacheCreationInputTokens = extractCacheCreationTokens(providerMetadata);
	const reasoningTokens = extractReasoningTokens(usageObj);
	const webSearchCount = extractWebSearchCount(providerMetadata, usage);

	return {
		inputTokens,
		outputTokens,
		totalTokens,
		cachedInputTokens,
		cacheCreationInputTokens,
		reasoningTokens,
		webSearchCount,
	};
};

export const adjustAnthropicV3CacheTokens = (
	model: LanguageModel,
	provider: string,
	usage: TokenUsage
): void => {
	if (
		model.specificationVersion === "v3" &&
		provider.toLowerCase().includes("anthropic")
	) {
		const cacheReadTokens = usage.cachedInputTokens ?? 0;
		const cacheWriteTokens = usage.cacheCreationInputTokens ?? 0;
		const cacheTokens = cacheReadTokens + cacheWriteTokens;
		if (usage.inputTokens && cacheTokens > 0) {
			usage.inputTokens = Math.max(usage.inputTokens - cacheTokens, 0);
			// Recalculate totalTokens after adjustment
			usage.totalTokens = usage.inputTokens + usage.outputTokens;
		}
	}
};
