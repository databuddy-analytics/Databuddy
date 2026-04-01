import { createGateway } from "ai";

const apiKey = process.env.AI_GATEWAY_API_KEY ?? process.env.AI_API_KEY ?? "";

const headers: Record<string, string> = {
	"HTTP-Referer": "https://www.databuddy.cc/",
	"X-Title": "Databuddy",
};

export const gateway = createGateway({
	apiKey,
	headers,
});

const overrideModel: string | null = null;
// const overrideModel = "openai/gpt-oss-20b";

const modelNames = {
	triage: overrideModel ?? "openai/gpt-oss-120b",
	analytics: overrideModel ?? "anthropic/claude-sonnet-4.5",
	advanced: overrideModel ?? "anthropic/claude-sonnet-4.5",
	perplexity: "perplexity/sonar-pro",
} as const;

const baseModels = {
	triage: gateway.chat(modelNames.triage),
	analytics: gateway.chat(modelNames.analytics),
	analyticsMcp: gateway.chat(modelNames.analytics),
	advanced: gateway.chat(modelNames.advanced),
	perplexity: gateway.chat(modelNames.perplexity),
} as const;

export const models = {
	triage: baseModels.triage,
	analytics: baseModels.analytics,
	analyticsMcp: baseModels.analyticsMcp,
	advanced: baseModels.advanced,
	perplexity: baseModels.perplexity,
} as const;

export type ModelKey = keyof typeof models;
