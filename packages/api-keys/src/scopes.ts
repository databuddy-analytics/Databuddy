import type { ApiScope } from "@databuddy/shared/api-scopes";

export { API_SCOPES, type ApiScope } from "@databuddy/shared/api-scopes";

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
	link: {
		read: "read:links",
		view_analytics: "read:links",
		create: "write:links",
		update: "write:links",
		delete: "write:links",
	},
	flag: {
		create: "manage:flags",
		update: "manage:flags",
		delete: "manage:flags",
	},
	monitor: {
		read: "read:monitors",
		view_analytics: "read:monitors",
		create: "write:monitors",
		update: "write:monitors",
		delete: "write:monitors",
	},
	status_page: {
		read: "read:status_pages",
		view_analytics: "read:status_pages",
		create: "write:status_pages",
		update: "write:status_pages",
		delete: "write:status_pages",
	},
	organization: {
		update: "manage:config",
		delete: "manage:config",
	},
};

export function requiredScopesForResource(
	resource: string,
	permissions: readonly string[]
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
