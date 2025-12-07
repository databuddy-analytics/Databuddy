import { Agent } from "@ai-sdk-tools/agents";
import {
	extendedMemoryConfig,
	maxMemoryConfig,
	memoryTools,
	minimalMemoryConfig,
	standardMemoryConfig,
	withUserProfile,
} from "./config/memory";
import { models } from "./config/models";
import { buildAnalyticsInstructions } from "./prompts/analytics";
import { buildReflectionInstructions } from "./prompts/reflection";
import { buildTriageInstructions } from "./prompts/triage";
import { executeSqlQueryTool } from "./tools/execute-sql-query";
import { getTopPagesTool } from "./tools/get-top-pages";
import { competitorAnalysisTool, webSearchTool } from "./tools/web-search";

/**
 * Tools available to analytics agents.
 */
const analyticsTools = {
	get_top_pages: getTopPagesTool,
	execute_sql_query: executeSqlQueryTool,
	web_search: webSearchTool,
	competitor_analysis: competitorAnalysisTool,
	...(Object.keys(memoryTools).length > 0 ? memoryTools : {}),
} as const;

/**
 * Tools available to triage agent.
 */
const triageTools = {
	web_search: webSearchTool,
	competitor_analysis: competitorAnalysisTool,
	...(Object.keys(memoryTools).length > 0 ? memoryTools : {}),
} as const;

/**
 * Creates an analytics specialist agent with user-specific memory.
 * Handles website traffic analysis, user behavior, and performance metrics.
 * Uses standard memory for typical analytical conversations.
 */
export function createAnalyticsAgent(userId: string) {
	return new Agent({
		name: "analytics",
		model: withUserProfile(models.analytics, userId),
		temperature: 0.3,
		instructions: buildAnalyticsInstructions,
		tools: analyticsTools,
		memory: standardMemoryConfig,
		modelSettings: {
			failureMode: {
				maxAttempts: 2,
			},
		},
		maxTurns: 10,
	});
}

/**
 * Creates a reflection orchestrator agent with user-specific memory.
 * Reviews responses, decides next steps, and handles complex multi-step reasoning.
 * Memory allocation scales with model capability.
 */
export const createReflectionAgent = (
	userId: string,
	variant: "standard" | "haiku" | "max" = "standard"
) => {
	const config = {
		standard: {
			model: withUserProfile(models.advanced, userId),
			maxTurns: 15,
			memory: extendedMemoryConfig, // 30 messages for Sonnet
		},
		haiku: {
			model: withUserProfile(models.analytics, userId),
			maxTurns: 15,
			memory: standardMemoryConfig, // 20 messages for Haiku
		},
		max: {
			model: withUserProfile(models.advanced, userId),
			maxTurns: 20,
			memory: maxMemoryConfig, // 40 messages for deep investigations
		},
	}[variant];

	return new Agent({
		name: `reflection-${variant}`,
		temperature: 0.2,
		instructions: buildReflectionInstructions,
		modelSettings: {
			failureMode: {
				maxAttempts: 2,
			},
		},
		handoffs: [createAnalyticsAgent(userId)],
		...config,
	});
};

/**
 * Creates a triage agent with user-specific memory.
 * Routes user requests to the appropriate specialist.
 * This is the main entry point for all agent interactions.
 * Uses minimal memory since it only routes and doesn't need long context.
 */
export function createTriageAgent(userId: string) {
	return new Agent({
		name: "triage",
		model: withUserProfile(models.triage, userId),
		temperature: 0.1,
		instructions: buildTriageInstructions,
		tools: triageTools,
		memory: minimalMemoryConfig,
		modelSettings: {
			toolChoice: {
				type: "tool",
				toolName: "handoff_to_agent",
			},
			failureMode: {
				maxAttempts: 2,
			},
		},
		handoffs: [createAnalyticsAgent(userId)],
		maxTurns: 1,
	});
}
