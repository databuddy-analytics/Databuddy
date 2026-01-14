import { Agent } from "@ai-sdk-tools/agents";
import type { AppContext } from "./config/context";

import {
	extendedMemoryConfig,
	maxMemoryConfig,
	minimalMemoryConfig,
	standardMemoryConfig,
} from "./config/memory";
import { models, track } from "./config/models";
import { buildAnalyticsInstructions } from "./prompts/analytics";
import { buildReflectionInstructions } from "./prompts/reflection";
import { buildTriageInstructions } from "./prompts/triage";
import { createAnnotationTools } from "./tools/annotations";
import { executeQueryBuilderTool } from "./tools/execute-query-builder";
import { executeSqlQueryTool } from "./tools/execute-sql-query";
import { createFunnelTools } from "./tools/funnels";
import { getTopPagesTool } from "./tools/get-top-pages";

/**
 * Creates analytics tools with context-aware funnels tools.
 */
function createAnalyticsTools(context: {
	userId: string;
	websiteId: string;
	websiteDomain: string;
	timezone: string;
	requestHeaders?: Headers;
}) {
	const appContext: AppContext = {
		userId: context.userId,
		websiteId: context.websiteId,
		websiteDomain: context.websiteDomain,
		timezone: context.timezone,
		currentDateTime: new Date().toISOString(),
		chatId: crypto.randomUUID(),
		requestHeaders: context.requestHeaders,
	};
	const funnelTools = createFunnelTools(appContext);
	const annotationTools = createAnnotationTools(appContext);

	return {
		get_top_pages: getTopPagesTool,
		execute_query_builder: executeQueryBuilderTool,
		execute_sql_query: executeSqlQueryTool,
		...funnelTools,
		...annotationTools,
	} as const;
}

/**
 * Creates an analytics specialist agent with user-specific memory.
 * Handles website traffic analysis, user behavior, and performance metrics.
 * Uses standard memory for typical analytical conversations.
 */
export function createAnalyticsAgent(
	userId: string,
	context: {
		websiteId: string;
		websiteDomain: string;
		timezone: string;
		requestHeaders?: Headers;
	}
) {
	const tools = createAnalyticsTools({
		userId,
		...context,
	});

	return new Agent({
		name: "analytics",
		model: track(models.analytics, { clientId: context.websiteId }),
		temperature: 0.3,
		instructions: buildAnalyticsInstructions,
		tools,
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
	context: {
		websiteId: string;
		websiteDomain: string;
		timezone: string;
		requestHeaders?: Headers;
	},
	variant: "standard" | "haiku" | "max" = "standard"
) => {
	const config = {
		standard: {
			model: models.advanced,
			maxTurns: 15,
			memory: extendedMemoryConfig, // 30 messages for Sonnet
		},
		haiku: {
			model: models.analytics,
			maxTurns: 15,
			memory: standardMemoryConfig, // 20 messages for Haiku
		},
		max: {
			model: models.advanced,
			maxTurns: 20,
			memory: maxMemoryConfig, // 40 messages for deep investigations
		},
	}[variant];

	return new Agent({
		name: `reflection-${variant}`,
		model: track(config.model, { clientId: context.websiteId }),
		temperature: 0.2,
		instructions: buildReflectionInstructions,
		modelSettings: {
			failureMode: {
				maxAttempts: 2,
			},
		},
		handoffs: [createAnalyticsAgent(userId, context)],
		maxTurns: config.maxTurns,
		memory: config.memory,
	});
};

/**
 * Creates a triage agent with user-specific memory.
 * Routes user requests to the appropriate specialist.
 * This is the main entry point for all agent interactions.
 * Uses minimal memory since it only routes and doesn't need long context.
 */
export function createTriageAgent(
	userId: string,
	context: {
		websiteId: string;
		websiteDomain: string;
		timezone: string;
		requestHeaders?: Headers;
	}
) {
	return new Agent({
		name: "triage",
		model: track(models.triage, { clientId: context.websiteId }),
		temperature: 0.1,
		instructions: buildTriageInstructions,
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
		handoffs: [createAnalyticsAgent(userId, context)],
		maxTurns: 1,
	});
}
