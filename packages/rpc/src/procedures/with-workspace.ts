import { hasKeyScope } from "@databuddy/api-keys/resolve";
import {
	LINKS_SCOPE_MAP,
	type LinksPermission,
} from "@databuddy/api-keys/scopes";
import {
	type PermissionFor,
	type ResourceType,
	type User,
	websitesApi,
} from "@databuddy/auth";
import { db, eq, websites } from "@databuddy/db";
import { cacheable } from "@databuddy/redis";
import type { PlanId } from "@databuddy/shared/types/features";
import { z } from "zod";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
import { type Context, os } from "../orpc";

type Website = NonNullable<Awaited<ReturnType<typeof getWebsiteById>>>;

export interface Workspace {
	organizationId: string;
	user: User | null;
	role: string | null;
	plan: PlanId;
	isPublicAccess: boolean;
	website: Website | null;
	getCreatedBy: () => Promise<string>;
}

export interface WithWorkspaceOptions<R extends ResourceType = "organization"> {
	organizationId?: string | null;
	websiteId?: string;
	resource?: R;
	permissions?: PermissionFor<R>[];
	requiredPlans?: PlanId[];
	allowPublicAccess?: boolean;
}

const getWebsiteById = cacheable(
	async (id: string) => {
		if (!id) {
			return null;
		}
		try {
			return await db.query.websites.findFirst({
				where: eq(websites.id, id),
			});
		} catch (error) {
			logger.error({ error, id }, "Error fetching website by ID");
			return null;
		}
	},
	{
		expireInSec: 600,
		prefix: "website_by_id",
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

const _getOrganizationRole = async (
	userId: string,
	organizationId: string
): Promise<string | null> => {
	try {
		const membership = await db.query.member.findFirst({
			where: (m, { and, eq }) =>
				and(eq(m.userId, userId), eq(m.organizationId, organizationId)),
			columns: { role: true },
		});
		return membership?.role ?? null;
	} catch (error) {
		logger.error({ error, userId, organizationId }, "Error fetching org role");
		return null;
	}
};

const getOrganizationRole = cacheable(_getOrganizationRole, {
	expireInSec: 120,
	prefix: "rpc:org_role",
});

async function checkPermissions<R extends ResourceType>(
	headers: Headers,
	resource: R,
	permissions: PermissionFor<R>[],
	organizationId?: string
): Promise<boolean> {
	const { success } = await websitesApi.hasPermission({
		headers,
		body: {
			...(organizationId && { organizationId }),
			permissions: { [resource]: permissions },
		},
	});
	return success;
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

async function resolveUserWorkspace(
	context: Context & { user: User },
	organizationId: string,
	options: {
		resource: string;
		permissions: string[];
		plan: PlanId;
	}
): Promise<Omit<Workspace, "website" | "getCreatedBy">> {
	if (context.user.role === "ADMIN") {
		return {
			organizationId,
			user: context.user,
			role: "admin",
			plan: options.plan,
			isPublicAccess: false,
		};
	}

	const role = await getOrganizationRole(context.user.id, organizationId);
	if (!role) {
		throw rpcError.forbidden("You are not a member of this organization");
	}

	if (options.permissions.length > 0) {
		try {
			const allowed = await checkPermissions(
				context.headers,
				options.resource as ResourceType,
				options.permissions as PermissionFor<ResourceType>[],
				organizationId
			);
			if (!allowed) {
				throw rpcError.forbidden(
					`Missing required ${options.resource} permissions: ${options.permissions.join(", ")}`
				);
			}
		} catch (error) {
			if (error instanceof Error && "code" in error) {
				throw error;
			}
			logger.error(
				{ error, resource: options.resource, permissions: options.permissions },
				"Permission check failed"
			);
			throw rpcError.forbidden("Permission check failed");
		}
	}

	return {
		organizationId,
		user: context.user,
		role,
		plan: options.plan,
		isPublicAccess: false,
	};
}

function resolveApiKeyWorkspace(
	context: Context,
	organizationId: string,
	plan: PlanId
): Omit<Workspace, "website" | "getCreatedBy"> {
	if (!context.apiKey) {
		throw rpcError.unauthorized();
	}

	if (context.apiKey.organizationId !== organizationId) {
		throw rpcError.forbidden("API key does not have access to this workspace");
	}

	return {
		organizationId,
		user: null,
		role: null,
		plan,
		isPublicAccess: false,
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

	if (websiteId) {
		const found = await getWebsiteById(websiteId);
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
				plan: await getPlan(context),
				isPublicAccess: !context.user,
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

	const plan = await getPlan(context);
	requirePlan(plan, requiredPlans);

	const resolvedResource = websiteId
		? ("website" as string)
		: (resource as string);
	const resolvedPermissions = websiteId
		? (permissions as string[])
		: (permissions as string[]);

	const getCreatedBy = () => _resolveCreatedBy(context, organizationId);

	if (context.user) {
		const ws = await resolveUserWorkspace(
			context as Context & { user: User },
			organizationId,
			{
				resource: resolvedResource,
				permissions: resolvedPermissions,
				plan,
			}
		);
		return { ...ws, website, getCreatedBy };
	}

	if (context.apiKey) {
		const ws = resolveApiKeyWorkspace(context, organizationId, plan);
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

async function _resolveCreatedBy(
	context: Context,
	organizationId: string
): Promise<string> {
	if (context.user) {
		return context.user.id;
	}

	if (context.apiKey) {
		const ownerRow = await db.query.member.findFirst({
			where: (m, { and, eq }) =>
				and(eq(m.organizationId, organizationId), eq(m.role, "owner")),
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

export async function isFullyAuthorized(
	context: Context,
	websiteId: string
): Promise<boolean> {
	try {
		const workspace = await withWorkspace(context, {
			websiteId,
		});
		return !workspace.isPublicAccess;
	} catch {
		return false;
	}
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
export type { PlanId, Website };
