/**
 * TODO: Migrate remaining routers to use withWorkspace/withWebsite:
 * - uptime.ts
 * - websites.ts
 * - flags.ts
 * - apikeys.ts
 * - annotations.ts
 * - funnels.ts
 * - goals.ts
 * - insights.ts
 * - organizations.ts
 * - billing.ts
 * - target-groups.ts
 *
 * After migration, remove authorizeWebsiteAccess from utils/auth.ts
 */

import {
	type PermissionFor,
	type ResourceType,
	type User,
	websitesApi,
} from "@databuddy/auth";
import { db, eq, websites } from "@databuddy/db";
import { cacheable } from "@databuddy/redis";
import { logger } from "@databuddy/shared/logger";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import type { Context } from "../orpc";

/**
 * Plan IDs that map to Autumn billing products.
 */
type PlanId = "free" | "pro" | "team" | "enterprise";

/**
 * Website data returned from the database.
 */
type Website = NonNullable<Awaited<ReturnType<typeof getWebsiteById>>>;

/**
 * Workspace context for the user.
 */
interface Workspace {
	/** Organization ID (workspace) */
	organizationId: string | null;
	/** The authenticated user (null for public access without auth) */
	user: User | null;
	/** User's role in the workspace (null for public access) */
	role: string | null;
	/** The billing plan for this workspace */
	plan: PlanId;
	/** Whether this is public/anonymous access (no authenticated user) */
	isPublicAccess: boolean;
}

/**
 * Extended context with workspace information.
 */
interface WorkspaceContext extends Context {
	user: User;
	session: NonNullable<Context["session"]>;
	workspace: Workspace;
}

/**
 * Extended context with workspace and website.
 */
interface WebsiteWorkspaceContext extends WorkspaceContext {
	website: Website;
}

/**
 * Configuration for withWorkspace.
 */
interface WithWorkspaceConfig<R extends ResourceType = "organization"> {
	/**
	 * Resource type to check permissions against.
	 * @default "organization"
	 */
	resource?: R;

	/**
	 * Required permission(s) for this action.
	 * User must have ALL specified permissions.
	 */
	permissions?: PermissionFor<R>[];

	/**
	 * Plans that are allowed to use this endpoint.
	 * If not specified, all plans are allowed.
	 */
	requiredPlans?: PlanId[];
}

/**
 * Configuration for withWebsite (extends workspace config).
 */
interface WithWebsiteConfig {
	/**
	 * Required website permission(s) for this action.
	 * User must have ALL specified permissions.
	 * @default ["read"]
	 */
	permissions?: PermissionFor<"website">[];

	/**
	 * Plans that are allowed to use this endpoint.
	 * If not specified, all plans are allowed.
	 */
	requiredPlans?: PlanId[];

	/**
	 * Whether to allow access to public websites without authentication.
	 * Only applies when permission is "read" or "view_analytics".
	 * @default false
	 */
	allowPublicAccess?: boolean;
}

/**
 * Cached website lookup to reduce database queries.
 */
const getWebsiteById = cacheable(
	async (id: string) => {
		try {
			if (!id) {
				return null;
			}
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

/**
 * Get user's role in an organization.
 */
async function getOrganizationRole(
	userId: string,
	organizationId: string
): Promise<string | null> {
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
}

/**
 * Check if user has required permissions via better-auth.
 */
async function checkPermissions<R extends ResourceType>(
	headers: Headers,
	resource: R,
	permissions: PermissionFor<R>[]
): Promise<boolean> {
	try {
		const { success } = await websitesApi.hasPermission({
			headers,
			body: { permissions: { [resource]: permissions } },
		});
		return success;
	} catch (error) {
		logger.error(
			{ error, resource, permissions },
			"Error checking permissions"
		);
		return false;
	}
}

/**
 * Validates user's plan meets requirements.
 */
function validatePlan(plan: PlanId, requiredPlans: PlanId[] | undefined): void {
	if (!requiredPlans || requiredPlans.length === 0) {
		return;
	}

	if (!requiredPlans.includes(plan)) {
		throw new ORPCError("FEATURE_UNAVAILABLE", {
			message: `This feature requires one of these plans: ${requiredPlans.join(", ")}`,
			data: {
				feature: "workspace_action",
				requiredPlan: requiredPlans.at(0),
			},
		});
	}
}

/**
 * Base input schema for workspace operations.
 */
export const workspaceInputSchema = z.object({
	organizationId: z.string().nullish(),
});

/**
 * Base input schema for website operations.
 */
export const websiteInputSchema = z.object({
	websiteId: z.string().min(1, "Website ID is required"),
});

/**
 * Establishes workspace context and checks permissions for any resource type.
 *
 * The workspace represents the org/user context. Use this for:
 * - Checking permissions on any resource (website, link, llm, subscription, etc.)
 * - Organization-level operations
 * - Getting the billing/plan context
 *
 * @example
 * ```ts
 * // Check link permissions
 * createLink: protectedProcedure
 *   .input(workspaceInputSchema.extend({ ... }))
 *   .handler(async ({ context, input }) => {
 *     const workspace = await withWorkspace(context, {
 *       organizationId: input.organizationId,
 *       resource: "link",
 *       permissions: ["create"],
 *     });
 *   })
 *
 * // Check LLM analytics permissions with plan requirement
 * getLLMAnalytics: protectedProcedure
 *   .input(workspaceInputSchema)
 *   .handler(async ({ context, input }) => {
 *     const workspace = await withWorkspace(context, {
 *       organizationId: input.organizationId,
 *       resource: "llm",
 *       permissions: ["view_analytics"],
 *       requiredPlans: ["pro", "team", "enterprise"],
 *     });
 *   })
 *
 * // Check subscription/billing permissions
 * manageBilling: protectedProcedure
 *   .input(workspaceInputSchema)
 *   .handler(async ({ context, input }) => {
 *     const workspace = await withWorkspace(context, {
 *       organizationId: input.organizationId,
 *       resource: "subscription",
 *       permissions: ["manage_billing"],
 *     });
 *   })
 * ```
 */
export async function withWorkspace<R extends ResourceType = "organization">(
	context: Context,
	options: {
		organizationId?: string | null;
		resource?: R;
		permissions?: PermissionFor<R>[];
		requiredPlans?: PlanId[];
	} = {}
): Promise<Workspace> {
	const {
		organizationId,
		resource = "organization" as R,
		permissions = [],
		requiredPlans,
	} = options;

	// Must be authenticated
	if (!context.user) {
		throw new ORPCError("UNAUTHORIZED", {
			message: "Authentication is required",
		});
	}

	const plan = (context.billing?.planId ?? "free") as PlanId;

	// Validate plan requirements
	validatePlan(plan, requiredPlans);

	// Workspace is required
	if (!organizationId) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Workspace is required",
		});
	}

	// Check workspace membership and permissions
	const role = await getOrganizationRole(context.user.id, organizationId);

	if (!role) {
		throw new ORPCError("FORBIDDEN", {
			message: "You are not a member of this organization",
		});
	}

	// Check permissions via better-auth
	if (permissions.length > 0) {
		const hasPermission = await checkPermissions(
			context.headers,
			resource,
			permissions
		);

		if (!hasPermission) {
			throw new ORPCError("FORBIDDEN", {
				message: `You do not have the required ${resource} permissions: ${permissions.join(", ")}`,
			});
		}
	}

	return {
		organizationId,
		user: context.user,
		role,
		plan,
		isPublicAccess: false,
	};
}

/**
 * Authorizes access to a website within a workspace context.
 *
 * This is the most common pattern - it:
 * - Fetches and validates the website exists
 * - Checks website-level permissions via better-auth
 * - Validates plan requirements
 * - Handles public website access
 *
 * @example
 * ```ts
 * // Basic read access
 * getWebsiteData: protectedProcedure
 *   .input(websiteInputSchema)
 *   .handler(async ({ context, input }) => {
 *     const { workspace, website } = await withWebsite(context, input.websiteId, {
 *       permissions: ["read"],
 *     });
 *     // Both workspace and website available
 *   })
 *
 * // Update with plan requirement
 * updateWebsite: protectedProcedure
 *   .input(websiteInputSchema.extend({ name: z.string() }))
 *   .handler(async ({ context, input }) => {
 *     const { website } = await withWebsite(context, input.websiteId, {
 *       permissions: ["update", "configure"],
 *       requiredPlans: ["pro", "team", "enterprise"],
 *     });
 *   })
 *
 * // Public dashboard access
 * getPublicStats: publicProcedure
 *   .input(websiteInputSchema)
 *   .handler(async ({ context, input }) => {
 *     const { website } = await withWebsite(context, input.websiteId, {
 *       permissions: ["view_analytics"],
 *       allowPublicAccess: true,
 *     });
 *   })
 * ```
 */
export async function withWebsite(
	context: Context,
	websiteId: string,
	config: WithWebsiteConfig = {}
): Promise<{ workspace: Workspace; website: Website }> {
	const {
		permissions = ["read"],
		requiredPlans,
		allowPublicAccess = false,
	} = config;

	// Fetch website first
	const website = await getWebsiteById(websiteId);

	if (!website) {
		throw new ORPCError("NOT_FOUND", {
			message: "Website not found",
			data: { resourceType: "website", resourceId: websiteId },
		});
	}

	const isReadOnly = permissions.every(
		(p) => p === "read" || p === "view_analytics"
	);

	if (allowPublicAccess && isReadOnly && website.isPublic) {
		const plan = (context.billing?.planId ?? "free") as PlanId;
		const isPublicAccess = !context.user;
		return {
			workspace: {
				organizationId: website.organizationId,
				user: context.user ?? null,
				role: null,
				plan,
				isPublicAccess,
			},
			website,
		};
	}

	// Must be authenticated for non-public access
	if (!context.user) {
		throw new ORPCError("UNAUTHORIZED", {
			message: "Authentication is required",
		});
	}

	const plan = (context.billing?.planId ?? "free") as PlanId;

	// Validate plan requirements
	validatePlan(plan, requiredPlans);

	// Website must belong to a workspace
	if (!website.organizationId) {
		throw new ORPCError("FORBIDDEN", {
			message: "Website must belong to a workspace",
		});
	}

	const role = await getOrganizationRole(
		context.user.id,
		website.organizationId
	);

	if (!role) {
		throw new ORPCError("FORBIDDEN", {
			message: "You are not a member of this workspace",
		});
	}

	const hasPermission = await checkPermissions(
		context.headers,
		"website",
		permissions
	);

	if (!hasPermission) {
		throw new ORPCError("FORBIDDEN", {
			message: `You do not have the required permissions: ${permissions.join(", ")}`,
		});
	}

	return {
		workspace: {
			organizationId: website.organizationId,
			user: context.user,
			role,
			plan,
			isPublicAccess: false,
		},
		website,
	};
}

/**
 * Convenience wrappers for common website permission patterns.
 */
export const withReadWebsite = (context: Context, websiteId: string) =>
	withWebsite(context, websiteId, { permissions: ["read"] });

export const withUpdateWebsite = (context: Context, websiteId: string) =>
	withWebsite(context, websiteId, { permissions: ["update"] });

export const withDeleteWebsite = (context: Context, websiteId: string) =>
	withWebsite(context, websiteId, { permissions: ["delete"] });

export const withAnalyticsWebsite = (context: Context, websiteId: string) =>
	withWebsite(context, websiteId, {
		permissions: ["view_analytics"],
		allowPublicAccess: true,
	});

export const withConfigureWebsite = (context: Context, websiteId: string) =>
	withWebsite(context, websiteId, { permissions: ["configure"] });

export type {
	PlanId,
	Website,
	WebsiteWorkspaceContext,
	WithWebsiteConfig,
	WithWorkspaceConfig,
	Workspace,
	WorkspaceContext,
};

export type { PermissionFor, ResourceType } from "@databuddy/auth";
