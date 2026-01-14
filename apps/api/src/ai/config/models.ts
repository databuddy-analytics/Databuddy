import { databuddyLLM } from "@databuddy/sdk/ai/vercel";
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


export const { track, transport } = databuddyLLM({
	apiUrl: process.env.DATABUDDY_API_URL ?? "https://basket.databuddy.cc/llm",
	apiKey: process.env.DATABUDDY_API_KEY,
	computeCosts: true,
});

const overrideModel: string | null = null;

const modelNames = {
	triage: overrideModel ?? "anthropic/claude-haiku-4.5",
	analytics: overrideModel ?? "anthropic/claude-haiku-4.5",
	advanced: overrideModel ?? "anthropic/claude-sonnet-4.5",
	perplexity: "perplexity/sonar-pro",
} as const;

const baseModels = {
	triage: openrouter.chat(modelNames.triage),
	analytics: openrouter.chat(modelNames.analytics),
	advanced: openrouter.chat(modelNames.advanced),
	perplexity: openrouter.chat(modelNames.perplexity),
} as const;

export const models = {
	triage: baseModels.triage,
	analytics: baseModels.analytics,
	advanced: baseModels.advanced,
	perplexity: baseModels.perplexity,
} as const;

export type ModelKey = keyof typeof models;
