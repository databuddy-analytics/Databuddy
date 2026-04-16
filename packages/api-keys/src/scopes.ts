export const API_SCOPES = [
	"read:data",
	"track:events",
	"track:llm",
	"read:links",
	"write:links",
	"manage:websites",
	"manage:flags",
	"manage:config",
] as const;

export type ApiScope = (typeof API_SCOPES)[number] | LegacyScope;

type LegacyScope = "write:llm";

export type LinksPermission = "read" | "create" | "update" | "delete";

export const LINKS_SCOPE_MAP = {
	read: "read:links",
	create: "write:links",
	update: "write:links",
	delete: "write:links",
} as const satisfies Record<LinksPermission, ApiScope>;

type PermissionName =
	| "read"
	| "view_analytics"
	| "create"
	| "update"
	| "delete"
	| "cancel"
	| "manage";

const DEFAULT_SCOPE_MAP: Record<PermissionName, ApiScope> = {
	read: "read:data",
	view_analytics: "read:data",
	create: "manage:config",
	update: "manage:config",
	delete: "manage:config",
	cancel: "manage:config",
	manage: "manage:config",
};

const RESOURCE_SCOPE_OVERRIDES: Partial<
	Record<string, Partial<Record<PermissionName, ApiScope>>>
> = {
	website: {
		create: "manage:websites",
		update: "manage:websites",
		delete: "manage:websites",
	},
	organization: {
		update: "manage:config",
		delete: "manage:config",
	},
};

export function requiredScopesForResource(
	resource: string,
	permissions: string[]
): ApiScope[] {
	const scopes = new Set<ApiScope>();
	const overrides = RESOURCE_SCOPE_OVERRIDES[resource];

	for (const p of permissions) {
		const perm = p as PermissionName;
		const scope = overrides?.[perm] ?? DEFAULT_SCOPE_MAP[perm];
		if (scope) {
			scopes.add(scope);
		}
	}

	return [...scopes];
}
