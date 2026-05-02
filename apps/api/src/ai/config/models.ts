import { createGateway } from "ai";

const apiKey = (
	process.env.AI_GATEWAY_API_KEY ??
	process.env.AI_API_KEY ??
	""
).trim();

export const isAiGatewayConfigured = apiKey.length > 0;

const gateway = createGateway({
	apiKey,
	headers: {
		"HTTP-Referer": "https://www.databuddy.cc/",
		"X-Title": "Databuddy",
	},
});

export const modelNames = {
	tiny: "openai/gpt-oss-120b",
	quick: "xai/grok-4.20-non-reasoning-beta",
	balanced: "anthropic/claude-sonnet-4.6",
	deep: "openai/gpt-5.5",
	perplexity: "perplexity/sonar-pro",
} as const;

export type AgentModelKey = "quick" | "balanced" | "deep";

export const models = {
	tiny: gateway.chat(modelNames.tiny),
	quick: gateway.chat(modelNames.quick),
	balanced: gateway.chat(modelNames.balanced),
	deep: gateway.chat(modelNames.deep),
	perplexity: gateway.chat(modelNames.perplexity),
} as const;

export const ANTHROPIC_CACHE_1H = {
	anthropic: {
		cacheControl: { type: "ephemeral", ttl: "1h" },
	},
} as const;

export const AI_MODEL_MAX_RETRIES = 3;

export function createModelFromId(modelId: string) {
	return gateway.chat(modelId);
}
