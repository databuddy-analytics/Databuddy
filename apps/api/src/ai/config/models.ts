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

export const { track } = databuddyLLM({
	apiKey: process.env.DATABUDDY_API_KEY,
	computeCosts: true,
});

const overrideModel: string | null = null;

const modelNames = {
	triage: overrideModel ?? "openai/gpt-oss-safeguard-20b",
	analytics: overrideModel ?? "anthropic/claude-sonnet-4.5",
	advanced: overrideModel ?? "anthropic/claude-sonnet-4.5",
	perplexity: "perplexity/sonar-pro",
} as const;

const baseModels = {
	triage: track(openrouter.chat(modelNames.triage)),
	analytics: track(openrouter.chat(modelNames.analytics)),
	advanced: track(openrouter.chat(modelNames.advanced)),
	perplexity: track(openrouter.chat(modelNames.perplexity)),
} as const;

export const models = {
	triage: baseModels.triage,
	analytics: baseModels.analytics,
	advanced: baseModels.advanced,
	perplexity: baseModels.perplexity,
} as const;

export type ModelKey = keyof typeof models;
