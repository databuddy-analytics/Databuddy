import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const apiKey = process.env.AI_API_KEY;

const headers = {
	"HTTP-Referer": "https://www.databuddy.cc/",
	"X-Title": "Databuddy",
};

export const openrouter = createOpenRouter({
	apiKey,
	headers,
});

/**
 * Model configurations for different agent types.
 * Centralized here for easy switching and environment-based overrides.
 */

const modelNames = {
	triage: "anthropic/claude-haiku-4.5",
	analytics: "anthropic/claude-haiku-4.5",
	// triage: "z-ai/glm-4.6",
	// analytics: "z-ai/glm-4.6",
	advanced: "anthropic/claude-sonnet-4.5",
	// advanced: "z-ai/glm-4.6",
	perplexity: "perplexity/sonar-pro",
} as const;

export const models = {
	/** Fast, cheap model for routing/triage decisions */
	triage: openrouter.chat(modelNames.triage),

	/** Balanced model for most analytical tasks */
	analytics: openrouter.chat(modelNames.analytics),

	/** High-capability model for complex reasoning and reflection */
	advanced: openrouter.chat(modelNames.advanced),

	/** Perplexity model for real-time web search and competitor analysis */
	perplexity: openrouter.chat(modelNames.perplexity),
} as const;

export type ModelKey = keyof typeof models;
