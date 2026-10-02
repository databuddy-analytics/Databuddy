import type { ApiScope } from "@databuddy/api-keys/scopes";

export type McpAction = "workspace" | "flags" | "links";

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
			"Create, update, and delete goals and annotations; create funnels and reply to investigations. The key can also edit, publish, and delete the websites it can access through the Databuddy API.",
		scopes: ["manage:websites"],
	},
	{
		value: "flags",
		label: "Feature flags",
		description:
			"Create, update, and target feature flags for the websites this key can access.",
		scopes: ["manage:flags"],
	},
	{
		value: "links",
		label: "Short links",
		description:
			"Create, update, and delete short links across this organization.",
		scopes: ["read:links", "write:links"],
	},
];

function actionScopes(actions: readonly McpAction[]): ApiScope[] {
	return MCP_ACTION_OPTIONS.filter(({ value }) =>
		actions.includes(value)
	).flatMap(({ scopes }) => scopes);
}

export function getMcpScopes(actions: readonly McpAction[]): ApiScope[] {
	return ["read:data", ...actionScopes(actions)];
}

export function getMcpScopeGrant(
	actions: readonly McpAction[],
	websiteIds: readonly string[]
): { resources?: Record<string, ApiScope[]>; scopes: ApiScope[] } {
	if (websiteIds.length === 0) {
		return { scopes: getMcpScopes(actions) };
	}

	const websiteScopes = getMcpScopes(
		actions.filter((action) => action !== "links")
	);

	return {
		scopes: actionScopes(actions.filter((action) => action === "links")),
		resources: Object.fromEntries(
			websiteIds.map((websiteId) => [`website:${websiteId}`, websiteScopes])
		),
	};
}

export function getMcpScopeSummary(scopes: readonly string[]): string {
	const granted = new Set(scopes);
	const actions = MCP_ACTION_OPTIONS.filter((option) =>
		option.scopes.some(
			(scope) => !scope.startsWith("read:") && granted.has(scope)
		)
	).map(({ label }) => label);

	return actions.length > 0
		? `Analytics + ${actions.join(", ")}`
		: "Read-only analytics";
}
