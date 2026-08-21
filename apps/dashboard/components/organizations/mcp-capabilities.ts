import type { ApiScope } from "@databuddy/api-keys/scopes";

export type McpAction = "workspace" | "flags" | "links";

const MCP_ACTION_SCOPES: Record<McpAction, readonly ApiScope[]> = {
	workspace: ["manage:websites"],
	flags: ["manage:flags"],
	links: ["read:links", "write:links"],
};

export const MCP_ACTION_OPTIONS: Array<{
	description: string;
	label: string;
	scopes: readonly ApiScope[];
	value: McpAction;
}> = [
	{
		value: "workspace",
		label: "Workspace actions",
		description:
			"Create, update, and delete goals and annotations; create funnels and reply to investigations.",
		scopes: MCP_ACTION_SCOPES.workspace,
	},
	{
		value: "flags",
		label: "Feature flags",
		description:
			"Create, update, and target feature flags for the websites this key can access.",
		scopes: MCP_ACTION_SCOPES.flags,
	},
	{
		value: "links",
		label: "Short links",
		description:
			"Create, update, and delete short links across this organization.",
		scopes: MCP_ACTION_SCOPES.links,
	},
];

export function getMcpScopes(actions: readonly McpAction[]): ApiScope[] {
	const scopes = new Set<ApiScope>(["read:data"]);

	for (const action of actions) {
		for (const scope of MCP_ACTION_SCOPES[action]) {
			scopes.add(scope);
		}
	}

	return [...scopes];
}

/**
 * Links are organization-owned, while analytics, flags, and workspace actions
 * can be constrained to individual websites. Keep that distinction at key
 * creation so the setup UI never creates a connection that advertises links
 * but cannot call link tools.
 */
export function getMcpScopeGrant(
	actions: readonly McpAction[],
	websiteIds: readonly string[]
): { resources?: Record<string, ApiScope[]>; scopes: ApiScope[] } {
	const scopes = getMcpScopes(actions);
	if (websiteIds.length === 0) {
		return { scopes };
	}

	const globalScopes = actions.includes("links")
		? [...MCP_ACTION_SCOPES.links]
		: [];
	const websiteScopes = scopes.filter((scope) => !globalScopes.includes(scope));

	return {
		scopes: globalScopes,
		resources: Object.fromEntries(
			websiteIds.map((websiteId) => [`website:${websiteId}`, websiteScopes])
		),
	};
}

export function getMcpScopeSummary(scopes: readonly string[]): string {
	const scopeSet = new Set(scopes);
	const actions: string[] = [];

	if (scopeSet.has("manage:websites")) {
		actions.push("Workspace actions");
	}
	if (scopeSet.has("manage:flags")) {
		actions.push("Feature flags");
	}
	if (scopeSet.has("write:links")) {
		actions.push("Short links");
	}

	return actions.length > 0
		? `Analytics + ${actions.join(", ")}`
		: "Read-only analytics";
}
