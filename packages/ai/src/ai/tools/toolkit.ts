import { account, and, db, eq, isNull, member, websites } from "@databuddy/db";
import { cacheable } from "@databuddy/redis";
import {
	getGithubIntegrationForOrg,
	isGitHubAppConfigured,
} from "@databuddy/services/github-app";
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

export interface ToolIntegrations {
	github: boolean;
	scrape: boolean;
	searchConsole: boolean;
}

export interface ToolkitParams {
	capabilities: ToolCapability[];
	domain?: string;
	githubRepository?: GitHubRepository | null;
	integrations?: ToolIntegrations;
	organizationId?: string;
	userId?: string;
}

const SEARCH_CONSOLE_SCOPE =
	"https://www.googleapis.com/auth/webmasters.readonly";
const OAUTH_SCOPE_SEPARATOR = /[\s,]+/;

async function hasGitHubRepositoryAccess(
	organizationId: string
): Promise<boolean> {
	if (!isGitHubAppConfigured()) {
		return false;
	}
	const integration = await getGithubIntegrationForOrg(organizationId);
	if (integration?.status !== "active") {
		return false;
	}
	const rows = await db
		.select({ integrations: websites.integrations })
		.from(websites)
		.where(
			and(
				eq(websites.organizationId, organizationId),
				isNull(websites.deletedAt)
			)
		);
	return rows.some((row) => row.integrations?.github);
}

async function hasSearchConsoleGrant(
	organizationId: string,
	userId: string
): Promise<boolean> {
	const rows = await db
		.select({ scope: account.scope })
		.from(account)
		.innerJoin(member, eq(member.userId, account.userId))
		.where(
			and(
				eq(member.organizationId, organizationId),
				eq(account.providerId, "google"),
				eq(account.userId, userId)
			)
		);
	return rows.some((row) =>
		row.scope?.split(OAUTH_SCOPE_SEPARATOR).includes(SEARCH_CONSOLE_SCOPE)
	);
}

const resolveConnectedIntegrations = cacheable(
	async (organizationId: string, userId: string) => {
		const [github, searchConsole] = await Promise.all([
			hasGitHubRepositoryAccess(organizationId),
			hasSearchConsoleGrant(organizationId, userId),
		]);
		return { github, searchConsole };
	},
	{ expireInSec: 30, prefix: "agent:tool-integrations" }
);

export async function resolveToolIntegrations(
	organizationId: string,
	userId: string
): Promise<ToolIntegrations> {
	return {
		...(await resolveConnectedIntegrations(organizationId, userId)),
		scrape: Boolean(process.env.CONTEXT_DEV_API_KEY),
	};
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
	const { integrations } = params;

	if (caps.has("analytics")) {
		Object.assign(tools, ANALYTICS_TOOLS);
	}

	if (caps.has("investigation")) {
		Object.assign(tools, createInvestigationTools());
		if (params.organizationId) {
			Object.assign(
				tools,
				integrations?.scrape === false ? {} : createScrapeTools(),
				integrations?.searchConsole === false
					? {}
					: createSearchConsoleTools({
							domain: params.domain,
							organizationId: params.organizationId,
							userId: params.userId,
						}),
				createGitHubTools({
					repository:
						integrations?.github === false ? null : params.githubRepository,
					organizationId: params.organizationId,
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
