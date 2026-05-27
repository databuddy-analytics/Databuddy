import type { ToolSet } from "ai";
import { createAnnotationTools } from "./annotations";
import { executeSqlQueryTool } from "./execute-sql-query";
import { createFlagTools } from "./flags";
import { createFunnelTools } from "./funnels";
import { getDataTool } from "./get-data";
import { createGoalTools } from "./goals";
import { createInvestigationTools } from "./investigation-tools";
import { createLinksTools } from "./links";
import { createMemoryTools } from "./memory";
import { createProfileTools } from "./profiles";
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
	organizationId?: string;
	userId?: string;
}

const ANALYTICS_TOOLS: ToolSet = {
	get_data: getDataTool,
	execute_sql_query: executeSqlQueryTool,
};

const MUTATION_TOOLS: ToolSet = {
	...createFunnelTools(),
	...createGoalTools(),
	...createAnnotationTools(),
	...createFlagTools(),
	...createLinksTools(),
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

	if (caps.has("investigation") && params.domain && params.organizationId) {
		Object.assign(
			tools,
			createInvestigationTools({
				domain: params.domain,
				organizationId: params.organizationId,
				userId: params.userId,
			})
		);
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
