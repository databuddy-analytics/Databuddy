import { createGateway } from "ai";

const rawApiKey =
	process.env.AI_GATEWAY_API_KEY ?? process.env.AI_API_KEY ?? "";
const apiKey = rawApiKey.trim();

export const isAiGatewayConfigured = apiKey.length > 0;

if (!isAiGatewayConfigured) {
	// Log once at module load so misconfiguration is visible before the first call.
	console.warn(
		"[ai/config/models] AI_GATEWAY_API_KEY is not set — gateway-backed tools (ask, agents) will fail until configured."
	);
}

const headers: Record<string, string> = {
	"HTTP-Referer": "https://www.databuddy.cc/",
	"X-Title": "Databuddy",
};

export const gateway = createGateway({
	apiKey,
	headers,
});

export const modelNames = {
	triage: "openai/gpt-oss-120b",
	analytics: "anthropic/claude-sonnet-4.6",
	advanced: "anthropic/claude-sonnet-4.6",
	perplexity: "perplexity/sonar-pro",
} as const;

const baseModels = {
	triage: gateway.chat(modelNames.triage),
	analytics: gateway.chat(modelNames.analytics),
	advanced: gateway.chat(modelNames.advanced),
	perplexity: gateway.chat(modelNames.perplexity),
} as const;

export const models = {
	triage: baseModels.triage,
	analytics: baseModels.analytics,
	advanced: baseModels.advanced,
	perplexity: baseModels.perplexity,
} as const;

export type ModelKey = keyof typeof models;
