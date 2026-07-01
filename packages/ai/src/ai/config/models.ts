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
	quick: "google/gemini-2.5-flash-lite",
	balanced: "anthropic/claude-sonnet-4.6",
	deep: "deepseek/deepseek-v4-flash",
} as const;

export type AgentModelKey = "quick" | "balanced" | "deep";
export type AgentSource = "dashboard" | "mcp" | "slack";

export const models = {
	tiny: gateway.chat(modelNames.tiny),
	quick: gateway.chat(modelNames.quick),
	balanced: gateway.chat(modelNames.balanced),
	deep: gateway.chat(modelNames.deep),
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

export function getDefaultAgentModelId(_source?: AgentSource): string {
	return modelNames.balanced;
}
