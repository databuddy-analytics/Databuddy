import type { ToolSet } from "ai";
import { createGitHubTools } from "./github-tools";
import { createScrapeTools } from "./scrape-page";
import { createSearchConsoleTools } from "./search-console";

export interface InvestigationToolsParams {
	domain: string;
	organizationId: string;
	userId?: string;
}

export function createInvestigationTools(
	params: InvestigationToolsParams
): ToolSet {
	return {
		...createScrapeTools(params.domain),
		...createSearchConsoleTools({
			domain: params.domain,
			organizationId: params.organizationId,
			userId: params.userId,
		}),
		...createGitHubTools({
			organizationId: params.organizationId,
			userId: params.userId,
		}),
	};
}
