import { type LanguageModel, stepCountIs } from "ai";
import type { AppContext } from "../config/context";
import { models } from "../config/models";
import { buildAnalyticsInstructions } from "../prompts/analytics";
import { createAnnotationTools } from "../tools/annotations";
import { executeQueryBuilderTool } from "../tools/execute-query-builder";
import { executeSqlQueryTool } from "../tools/execute-sql-query";
import { createFunnelTools } from "../tools/funnels";
import { getDataTool } from "../tools/get-data";
import { getTopPagesTool } from "../tools/get-top-pages";
import { createGoalTools } from "../tools/goals";
import { createLinksTools } from "../tools/links";
import { createMemoryTools } from "../tools/memory";
import { createProfileTools } from "../tools/profiles";
import { webSearchTool } from "../tools/web-search";
import type { AgentConfig, AgentContext } from "./types";

function createTools() {
	return {
		get_top_pages: getTopPagesTool,
		get_data: getDataTool,
		execute_query_builder: executeQueryBuilderTool,
		execute_sql_query: executeSqlQueryTool,
		web_search: webSearchTool,
		...createMemoryTools(),
		...createProfileTools(),
		...createFunnelTools(),
		...createGoalTools(),
		...createAnnotationTools(),
		...createLinksTools(),
	};
}

export const maxSteps = 20;

export function createConfig(context: AgentContext): AgentConfig {
	const appContext: AppContext = {
		userId: context.userId,
		websiteId: context.websiteId,
		websiteDomain: context.websiteDomain,
		timezone: context.timezone,
		currentDateTime: new Date().toISOString(),
		chatId: context.chatId,
		requestHeaders: context.requestHeaders,
	};

	return {
		model: models.analytics as LanguageModel,
		system: buildAnalyticsInstructions(appContext),
		tools: createTools(),
		stopWhen: stepCountIs(20),
		temperature: 0.3,
		experimental_context: appContext,
	};
}
