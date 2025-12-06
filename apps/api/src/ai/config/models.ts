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
export const models = {
	/** Fast, cheap model for routing/triage decisions */
	triage: openrouter.chat(process.env.AI_TRIAGE_MODEL ?? "anthropic/claude-haiku-4.5"),

	/** Balanced model for most analytical tasks */
	analytics: openrouter.chat(process.env.AI_ANALYTICS_MODEL ?? "anthropic/claude-haiku-4.5"),

	/** High-capability model for complex reasoning and reflection */
	advanced: openrouter.chat(process.env.AI_ADVANCED_MODEL ?? "anthropic/claude-sonnet-4.5"),
} as const;

export type ModelKey = keyof typeof models;
