import { hasKeyScope } from "@databuddy/api-keys/resolve";
import {
	LINKS_SCOPE_MAP,
	type LinksPermission,
	requiredScopesForResource,
} from "@databuddy/api-keys/scopes";
import type { PermissionFor, ResourceType, User } from "@databuddy/auth";
import { db } from "@databuddy/db";
import { cacheNamespaces, cacheable } from "@databuddy/redis";
import type { PlanId } from "@databuddy/shared/types/features";
import { z } from "zod";
import { rpcError } from "../errors";
import { record } from "../lib/logger";
import { type Context, os } from "../orpc";

type Website = NonNullable<Awaited<ReturnType<typeof getWebsiteById>>>;

export type WorkspaceTier = "authed" | "demo";

export interface Workspace {
	getCreatedBy: () => Promise<string>;
	isPublicAccess: boolean;
	organizationId: string;
	plan: PlanId;
	role: string | null;
	tier: WorkspaceTier;
	user: User | null;
	website: Website | null;
}

export interface WithWorkspaceOptions<R extends ResourceType = "organization"> {
	allowPublicAccess?: boolean;
	organizationId?: string | null;
	permissions?: PermissionFor<R>[];
	requiredPlans?: PlanId[];
	resource?: R;
	websiteId?: string;
}

const getWebsiteById = cacheable(
	async (id: string) => {
		if (!id) {
			return null;
		}
		return await db.query.websites.findFirst({
			where: { id },
		});
	},
	{
		expireInSec: 600,
		prefix: cacheNamespaces.websiteById,
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

const _getOrganizationRole = async (
	userId: string,
	organizationId: string
): Promise<string | null> => {
	const membership = await db.query.member.findFirst({
		where: { userId, organizationId },
		columns: { role: true },
	});
	return membership?.role ?? null;
};

const getOrganizationRole = cacheable(_getOrganizationRole, {
	expireInSec: 300,
	prefix: cacheNamespaces.organizationRole,
	staleWhileRevalidate: true,
	staleTime: 60,
});

const ROLE_PERMISSIONS: Record<string, Record<string, readonly string[]>> = {
	owner: {
		website: ["create", "read", "update", "delete", "view_analytics"],
		organization: ["read", "update", "delete"],
		subscription: ["read", "update"],
		link: ["create", "read", "update", "delete", "view_analytics"],
		llm: ["read", "view_analytics", "manage"],
	},
	admin: {
		website: ["create", "read", "update", "delete", "view_analytics"],
		organization: ["read", "update"],
		subscription: ["read", "update"],
		link: ["create", "read", "update", "delete", "view_analytics"],
		llm: ["read", "view_analytics", "manage"],
	},
	member: {
		website: ["read", "update", "view_analytics"],
		organization: ["read"],
		subscription: ["read"],
		link: ["create", "read", "update", "view_analytics"],
		llm: ["read", "view_analytics"],
	},
	viewer: {
		website: ["read", "view_analytics"],
		organization: ["read"],
		subscription: ["read"],
		link: ["read", "view_analytics"],
		llm: ["read", "view_analytics"],
	},
};

function hasRolePermission(
	role: string,
	resource: string,
	permissions: string[]
): boolean {
	const allowed = ROLE_PERMISSIONS[role]?.[resource];
	if (!allowed) {
		return false;
	}
	return permissions.every((p) => allowed.includes(p));
}

async function getPlan(context: Context): Promise<PlanId> {
	const billing = await context.getBilling();
	return (billing?.planId ?? "free") as PlanId;
}

function requirePlan(plan: PlanId, requiredPlans: PlanId[] | undefined): void {
	if (!requiredPlans?.length) {
		return;
	}
	if (!requiredPlans.includes(plan)) {
		throw rpcError.featureUnavailable("workspace_action", requiredPlans.at(0));
	}
}

function resolveApiKeyWorkspace(
	context: Context,
	organizationId: string,
	plan: PlanId,
	resource: string,
	permissions: string[]
): Omit<Workspace, "website" | "getCreatedBy"> {
	if (!context.apiKey) {
		throw rpcError.unauthorized();
	}

	if (context.apiKey.organizationId !== organizationId) {
		throw rpcError.forbidden("API key does not have access to this workspace");
	}

	const requiredScopes = requiredScopesForResource(resource, permissions);
	for (const scope of requiredScopes) {
		if (!hasKeyScope(context.apiKey, scope)) {
			throw rpcError.forbidden(`API key missing required scope: ${scope}`);
		}
	}

	return {
		organizationId,
		user: null,
		role: null,
		plan,
		isPublicAccess: false,
		tier: "authed",
	};
}

export const workspaceInputSchema = z.object({
	organizationId: z.string().nullish(),
});

export const websiteInputSchema = z.object({
	websiteId: z.string().min(1, "Website ID is required"),
});

export async function withWorkspace<R extends ResourceType = "organization">(
	context: Context,
	options: WithWorkspaceOptions<R> & { websiteId: string }
): Promise<Workspace & { website: Website }>;
export async function withWorkspace<R extends ResourceType = "organization">(
	context: Context,
	options?: WithWorkspaceOptions<R>
): Promise<Workspace>;
export async function withWorkspace<R extends ResourceType = "organization">(
	context: Context,
	options: WithWorkspaceOptions<R> = {} as WithWorkspaceOptions<R>
): Promise<Workspace> {
	const {
		websiteId,
		resource = "organization" as R,
		permissions = [],
		requiredPlans,
		allowPublicAccess = false,
	} = options;

	let website: Website | null = null;

	const planPromise = record("ws.getPlan", () => getPlan(context));

	if (websiteId) {
		const [found, plan] = await Promise.all([
			record("ws.getWebsiteById", () => getWebsiteById(websiteId)),
			planPromise,
		]);
		if (!found) {
			throw rpcError.notFound("website", websiteId);
		}
		website = found;

		const isReadOnly = permissions.every(
			(p) => p === "read" || p === "view_analytics"
		);

		if (allowPublicAccess && isReadOnly && website.isPublic) {
			const orgId = website.organizationId ?? "";
			return {
				organizationId: orgId,
				user: context.user ?? null,
				role: null,
				plan,
				isPublicAccess: !context.user,
				tier: "demo",
				website,
				getCreatedBy: () => _resolveCreatedBy(context, orgId),
			};
		}
	}

	const organizationId =
		options.organizationId ?? website?.organizationId ?? context.organizationId;

	if (!organizationId) {
		throw rpcError.badRequest("Workspace is required");
	}

	const effectiveResource = websiteId ? "website" : (resource as string);
	const effectivePermissions = permissions as string[];
	const getCreatedBy = () => _resolveCreatedBy(context, organizationId);

	if (
		context.user &&
		context.organizationId &&
		organizationId !== context.organizationId
	) {
		throw rpcError.forbidden(
			"Resource does not belong to the active organization"
		);
	}

	if (context.user) {
		const userId = context.user.id;
		const [plan, role] = await Promise.all([
			planPromise,
			record("ws.getOrgRole", () =>
				getOrganizationRole(userId, organizationId)
			),
		]);
		requirePlan(plan, requiredPlans);

		if (!role) {
			throw rpcError.forbidden("You are not a member of this organization");
		}

		if (
			effectivePermissions.length > 0 &&
			!hasRolePermission(role, effectiveResource, effectivePermissions)
		) {
			throw rpcError.forbidden(
				`Missing required ${effectiveResource} permissions: ${effectivePermissions.join(", ")}`
			);
		}

		return {
			organizationId,
			user: context.user,
			role,
			plan,
			isPublicAccess: false,
			tier: "authed",
			website,
			getCreatedBy,
		};
	}

	if (context.apiKey) {
		const plan = await planPromise;
		requirePlan(plan, requiredPlans);
		const ws = resolveApiKeyWorkspace(
			context,
			organizationId,
			plan,
			effectiveResource,
			effectivePermissions
		);
		return { ...ws, website, getCreatedBy };
	}

	throw rpcError.unauthorized();
}

export async function withLinksAccess(
	context: Context,
	options: {
		organizationId: string;
		permission: LinksPermission;
	}
): Promise<Workspace> {
	if (context.apiKey) {
		const scope = LINKS_SCOPE_MAP[options.permission];
		if (!hasKeyScope(context.apiKey, scope)) {
			throw rpcError.forbidden(`API key missing ${scope} scope`);
		}
	}

	return await withWorkspace(context, {
		organizationId: options.organizationId,
		resource: "link",
		permissions: [options.permission],
	});
}

export async function withFlagsWrite(
	context: Context,
	options: {
		websiteId: string;
		permissions: PermissionFor<"website">[];
	}
): Promise<Workspace & { website: Website }> {
	if (context.apiKey && !hasKeyScope(context.apiKey, "manage:flags")) {
		throw rpcError.forbidden("API key missing manage:flags scope");
	}

	return await withWorkspace<"website">(context, {
		websiteId: options.websiteId,
		resource: "website",
		permissions: options.permissions,
	});
}

async function _resolveCreatedBy(
	context: Context,
	organizationId: string
): Promise<string> {
	if (context.user) {
		return context.user.id;
	}

	if (context.apiKey) {
		const ownerRow = await db.query.member.findFirst({
			where: { organizationId, role: "owner" },
			columns: { userId: true },
		});
		if (!ownerRow) {
			throw rpcError.forbidden(
				"Could not resolve organization owner for API key"
			);
		}
		return ownerRow.userId;
	}

	throw rpcError.unauthorized();
}

export function hasApiKeyOrgAccess(
	workspace: Pick<Workspace, "organizationId">,
	context: Pick<Context, "apiKey">
): boolean {
	return (
		!!context.apiKey &&
		context.apiKey.organizationId === workspace.organizationId
	);
}

export const withWebsiteRead = os.middleware(
	async ({ context, next }, input: { websiteId: string }) => {
		const workspace = await withWorkspace<"website">(context, {
			websiteId: input.websiteId,
			permissions: ["read"],
			allowPublicAccess: true,
		});
		return next({ context: { workspace } });
	}
);

export const withWebsiteWrite = (
	permissions: PermissionFor<"website">[] = ["update"]
) =>
	os.middleware(async ({ context, next }, input: { websiteId: string }) => {
		const workspace = await withWorkspace<"website">(context, {
			websiteId: input.websiteId,
			permissions,
		});
		return next({ context: { workspace } });
	});

export type { PermissionFor, ResourceType } from "@databuddy/auth";
export type { PlanId } from "@databuddy/shared/types/features";
export type { Website };
