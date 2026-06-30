import { hasKeyScope } from "@databuddy/api-keys/resolve";
import { requiredScopesForResource } from "@databuddy/api-keys/scopes";
import type { User } from "@databuddy/auth";
import {
	type PermissionFor,
	type ResourceType,
	roleHasPermission,
} from "@databuddy/auth/permissions";
import { db } from "@databuddy/db";
import { cacheNamespaces, cacheable } from "@databuddy/redis";
import type { PlanId } from "@databuddy/shared/types/features";
import { z } from "zod";
import { rpcError } from "../errors";
import { type Context, os } from "../orpc";
import { getMemberRole, getOrganizationOwnerId } from "../utils/organization";

type Website = NonNullable<Awaited<ReturnType<typeof getWebsiteById>>>;

export type WorkspaceTier = "authed" | "demo";

export type Permissions<R extends ResourceType> = readonly [
	PermissionFor<R>,
	...PermissionFor<R>[],
];

interface BaseOptions {
	allowCrossOrg?: boolean;
	requiredPlans?: PlanId[];
}

interface WebsiteImplicitOptions extends BaseOptions {
	organizationId?: string | null;
	permissions: Permissions<"website">;
	resource?: undefined;
	websiteId: string;
}

interface WebsiteExplicitOptions<R extends ResourceType> extends BaseOptions {
	organizationId?: string | null;
	permissions: Permissions<R>;
	resource: R;
	websiteId: string;
}

interface OrgScopeOptions<R extends ResourceType> extends BaseOptions {
	organizationId?: string | null;
	permissions: Permissions<R>;
	resource: R;
	websiteId?: undefined;
}

export interface AuthedWorkspace {
	getCreatedBy: () => Promise<string>;
	organizationId: string;
	plan: PlanId;
	role: string | null;
	tier: "authed";
	user: User | null;
	website: Website | null;
}

export interface DemoWorkspace {
	organizationId: string;
	plan: PlanId;
	role: null;
	tier: "demo";
	user: null;
	website: Website;
}

export type Workspace = AuthedWorkspace | DemoWorkspace;

export type PublicWorkspace =
	| (AuthedWorkspace & { website: Website })
	| DemoWorkspace;

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

async function getPlanId(context: Context): Promise<PlanId> {
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

async function requireWebsite(websiteId: string): Promise<Website> {
	const website = await getWebsiteById(websiteId);
	if (!website) {
		throw rpcError.notFound("website", websiteId);
	}
	return website;
}

const READ_ONLY_PERMISSIONS = new Set(["read", "view_analytics"]);

function isReadOnly(permissions: readonly string[]): boolean {
	return permissions.every((p) => READ_ONLY_PERMISSIONS.has(p));
}

type Grant =
	| { granted: true; user: User; role: string }
	| { granted: true; user: null; role: null }
	| { granted: false; denied: Error };

async function resolveGrant(
	context: Context,
	input: {
		organizationId: string;
		resource: string;
		permissions: readonly string[];
		allowCrossOrg: boolean;
	}
): Promise<Grant> {
	const { organizationId, resource, permissions, allowCrossOrg } = input;

	if (context.user) {
		if (
			!allowCrossOrg &&
			context.organizationId &&
			context.organizationId !== organizationId
		) {
			return {
				granted: false,
				denied: rpcError.forbidden(
					"Resource does not belong to the active organization"
				),
			};
		}

		const role = await getMemberRole(context.user.id, organizationId);
		if (!role) {
			return {
				granted: false,
				denied: rpcError.forbidden("You are not a member of this organization"),
			};
		}

		if (!roleHasPermission(role, resource, permissions)) {
			return {
				granted: false,
				denied: rpcError.forbidden(
					`Missing required ${resource} permissions: ${permissions.join(", ")}`
				),
			};
		}

		return { granted: true, user: context.user, role };
	}

	if (context.apiKey) {
		if (context.apiKey.organizationId !== organizationId) {
			return {
				granted: false,
				denied: rpcError.forbidden(
					"API key does not have access to this workspace"
				),
			};
		}

		for (const scope of requiredScopesForResource(resource, permissions)) {
			if (!hasKeyScope(context.apiKey, scope)) {
				return {
					granted: false,
					denied: rpcError.forbidden(
						`API key missing required scope: ${scope}`
					),
				};
			}
		}

		return { granted: true, user: null, role: null };
	}

	return { granted: false, denied: rpcError.unauthorized() };
}

interface ResolveInput {
	allowCrossOrg: boolean;
	organizationId?: string | null;
	permissions: readonly string[];
	requiredPlans: PlanId[] | undefined;
	resource?: string;
	websiteId?: string;
}

interface ResolvedAuthed {
	kind: "authed";
	workspace: AuthedWorkspace;
}

interface ResolvedDenied {
	denied: Error;
	kind: "denied";
	organizationId: string;
	permissions: readonly string[];
	plan: PlanId;
	website: Website | null;
}

async function resolveWorkspace(
	context: Context,
	input: ResolveInput
): Promise<ResolvedAuthed | ResolvedDenied> {
	const planPromise = getPlanId(context);
	const website = input.websiteId
		? await requireWebsite(input.websiteId)
		: null;

	const organizationId =
		input.organizationId ?? website?.organizationId ?? context.organizationId;

	if (!organizationId) {
		throw rpcError.badRequest("Workspace is required");
	}

	const effectiveResource =
		input.resource ?? (input.websiteId ? "website" : "organization");
	const getCreatedBy = () => resolveCreatedBy(context, organizationId);

	const [grant, plan] = await Promise.all([
		resolveGrant(context, {
			organizationId,
			resource: effectiveResource,
			permissions: input.permissions,
			allowCrossOrg: input.allowCrossOrg,
		}),
		planPromise,
	]);

	if (!grant.granted) {
		return {
			kind: "denied",
			denied: grant.denied,
			website,
			organizationId,
			plan,
			permissions: input.permissions,
		};
	}

	requirePlan(plan, input.requiredPlans);

	return {
		kind: "authed",
		workspace: {
			tier: "authed",
			organizationId,
			user: grant.user,
			role: grant.role,
			plan,
			website,
			getCreatedBy,
		},
	};
}

export const workspaceInputSchema = z.object({
	organizationId: z.string().nullish(),
});

export function withWorkspace<R extends ResourceType>(
	context: Context,
	options: WebsiteExplicitOptions<R>
): Promise<AuthedWorkspace & { website: Website }>;
export function withWorkspace(
	context: Context,
	options: WebsiteImplicitOptions
): Promise<AuthedWorkspace & { website: Website }>;
export function withWorkspace<R extends ResourceType>(
	context: Context,
	options: OrgScopeOptions<R>
): Promise<AuthedWorkspace>;
export async function withWorkspace(
	context: Context,
	options:
		| WebsiteImplicitOptions
		| WebsiteExplicitOptions<ResourceType>
		| OrgScopeOptions<ResourceType>
): Promise<AuthedWorkspace> {
	const resolved = await resolveWorkspace(context, {
		websiteId: options.websiteId,
		organizationId: options.organizationId,
		resource: options.resource,
		permissions: options.permissions,
		allowCrossOrg: options.allowCrossOrg ?? false,
		requiredPlans: options.requiredPlans,
	});

	if (resolved.kind === "denied") {
		throw resolved.denied;
	}

	return resolved.workspace;
}

export function withPublicWorkspace<R extends ResourceType>(
	context: Context,
	options: WebsiteExplicitOptions<R>
): Promise<PublicWorkspace>;
export function withPublicWorkspace(
	context: Context,
	options: WebsiteImplicitOptions
): Promise<PublicWorkspace>;
export async function withPublicWorkspace(
	context: Context,
	options: WebsiteImplicitOptions | WebsiteExplicitOptions<ResourceType>
): Promise<PublicWorkspace> {
	const resolved = await resolveWorkspace(context, {
		websiteId: options.websiteId,
		organizationId: options.organizationId,
		resource: options.resource,
		permissions: options.permissions,
		allowCrossOrg: options.allowCrossOrg ?? false,
		requiredPlans: options.requiredPlans,
	});

	if (resolved.kind === "authed") {
		return resolved.workspace as PublicWorkspace;
	}

	if (resolved.website?.isPublic && isReadOnly(resolved.permissions)) {
		return {
			tier: "demo",
			organizationId: resolved.organizationId,
			user: null,
			role: null,
			plan: resolved.plan,
			website: resolved.website,
		};
	}

	throw resolved.denied;
}

async function resolveCreatedBy(
	context: Context,
	organizationId: string
): Promise<string> {
	if (context.user) {
		return context.user.id;
	}

	if (context.apiKey) {
		const ownerId = await getOrganizationOwnerId(organizationId);
		if (!ownerId) {
			throw rpcError.forbidden(
				"Could not resolve organization owner for API key"
			);
		}
		return ownerId;
	}

	throw rpcError.unauthorized();
}

export const withWebsiteRead = os.middleware(
	async ({ context, next }, input: { websiteId: string }) => {
		const workspace = await withPublicWorkspace(context, {
			websiteId: input.websiteId,
			permissions: ["read"],
		});
		return next({ context: { workspace } });
	}
);
