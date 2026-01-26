import { Agent } from "@ai-sdk-tools/agents";
import type { LanguageModel } from "ai";
import type { AppContext } from "../config/context";
import { standardMemoryConfig } from "../config/memory";
import { models } from "../config/models";
import { buildAnalyticsInstructions } from "../prompts/analytics";
import { createAnnotationTools } from "../tools/annotations";
import { executeQueryBuilderTool } from "../tools/execute-query-builder";
import { executeSqlQueryTool } from "../tools/execute-sql-query";
import { createFunnelTools } from "../tools/funnels";
import { getTopPagesTool } from "../tools/get-top-pages";
import { createGoalTools } from "../tools/goals";
import { createLinksTools } from "../tools/links";
import type { AgentContext, StreamConfig } from "./types";

function createTools(context: AgentContext) {
	const appContext: AppContext = {
		userId: context.userId,
		websiteId: context.websiteId,
		websiteDomain: context.websiteDomain,
		timezone: context.timezone,
		currentDateTime: new Date().toISOString(),
		chatId: crypto.randomUUID(),
		requestHeaders: context.requestHeaders,
	};

	return {
		get_top_pages: getTopPagesTool,
		execute_query_builder: executeQueryBuilderTool,
		execute_sql_query: executeSqlQueryTool,
		...createFunnelTools(appContext),
		...createGoalTools(appContext),
		...createAnnotationTools(appContext),
		...createLinksTools(appContext),
	};
}

export const streamConfig: StreamConfig = {
	maxRounds: 5,
	maxSteps: 20,
};

export function create(context: AgentContext) {
	console.log("[Analytics Agent] Creating analytics agent");
	return new Agent({
		name: "analytics",
		model: models.analytics as LanguageModel,
		temperature: 0.3,
		instructions: (ctx) => {
			const prompt = buildAnalyticsInstructions(ctx);
			console.log("[Analytics Agent] Instructions length:", prompt.length);
			return prompt;
		},
		memory: standardMemoryConfig,
		maxTurns: 10,
		tools: createTools(context),
		modelSettings: {
			failureMode: { maxAttempts: 2 },
		},
	});
}
