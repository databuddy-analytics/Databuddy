import type { ToolSet } from "ai";
import { createAnnotationTools } from "./annotations";
import { describeSchemaTool } from "./describe-schema";
import { discoverQueryTypesTool } from "./discover-query-types";
import { executeSqlQueryTool } from "./execute-sql-query";
import { createFeedbackTools } from "./feedback";
import { createFlagTools } from "./flags";
import { createFunnelTools } from "./funnels";
import { getDataTool } from "./get-data";
import { createGoalTools } from "./goals";
import { createGitHubTools, type GitHubRepository } from "./github-tools";
import { createInvestigationTools } from "./investigations";
import { createLinksTools } from "./links";
import { listWebsitesTool } from "./list-websites";
import { createMemoryTools } from "./memory";
import { createProfileTools } from "./profiles";
import { createScrapeTools } from "./scrape-page";
import { createSearchConsoleTools } from "./search-console";
import { dashboardActionsTool } from "./dashboard-actions";

export type ToolCapability =
	| "analytics"
	| "investigation"
	| "mutations"
	| "memory"
	| "dashboard";

export interface ToolkitParams {
	capabilities: ToolCapability[];
	domain?: string;
	githubRepository?: GitHubRepository | null;
	organizationId?: string;
	userId?: string;
}

const GOAL_TOOLS = createGoalTools();
const FUNNEL_TOOLS = createFunnelTools();

const ANALYTICS_TOOLS: ToolSet = {
	list_websites: listWebsitesTool,
	discover_query_types: discoverQueryTypesTool,
	describe_schema: describeSchemaTool,
	get_data: getDataTool,
	execute_sql_query: executeSqlQueryTool,
	list_goals: GOAL_TOOLS.list_goals,
	get_goal_analytics: GOAL_TOOLS.get_goal_analytics,
	list_funnels: FUNNEL_TOOLS.list_funnels,
	get_funnel_analytics: FUNNEL_TOOLS.get_funnel_analytics,
	get_funnel_analytics_by_referrer:
		FUNNEL_TOOLS.get_funnel_analytics_by_referrer,
};

const MUTATION_TOOLS: ToolSet = {
	...FUNNEL_TOOLS,
	...GOAL_TOOLS,
	...createAnnotationTools(),
	...createFlagTools(),
	...createLinksTools(),
	...createFeedbackTools(),
};

const MEMORY_TOOLS: ToolSet = {
	...createMemoryTools(),
	...createProfileTools(),
};

const DASHBOARD_TOOLS: ToolSet = {
	dashboard_actions: dashboardActionsTool,
};

export function createToolkit(params: ToolkitParams): ToolSet {
	const tools: ToolSet = {};
	const caps = new Set(params.capabilities);

	if (caps.has("analytics")) {
		Object.assign(tools, ANALYTICS_TOOLS);
	}

	if (caps.has("investigation")) {
		Object.assign(tools, createInvestigationTools());
		if (params.organizationId) {
			Object.assign(
				tools,
				createScrapeTools(),
				createSearchConsoleTools({
					domain: params.domain,
					organizationId: params.organizationId,
					userId: params.userId,
				}),
				createGitHubTools({
					repository: params.githubRepository,
					organizationId: params.organizationId,
					userId: params.userId,
				})
			);
		}
	}

	if (caps.has("mutations")) {
		Object.assign(tools, MUTATION_TOOLS);
	}

	if (caps.has("memory")) {
		Object.assign(tools, MEMORY_TOOLS);
	}

	if (caps.has("dashboard")) {
		Object.assign(tools, DASHBOARD_TOOLS);
	}

	return tools;
}
