import { hasKeyScope } from "@databuddy/api-keys/resolve";
import { requiredScopesForResource } from "@databuddy/api-keys/scopes";
import type { User } from "@databuddy/auth";
import {
	type PermissionFor,
	type ResourceType,
	roleHasPermission,
} from "@databuddy/auth/permissions";
import { db } from "@databuddy/db";
import { billingMode } from "@databuddy/env/app";
import { cacheNamespaces, cacheable } from "@databuddy/redis";
import { normalizePlanId, type PlanId } from "@databuddy/shared/types/features";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { rpcError } from "../errors";
import { type Context, os } from "../orpc";
import { getMemberRole, getOrganizationOwnerId } from "../utils/organization";

const RESOURCE_NOUNS: Record<string, string> = {
	audit_log: "the audit log",
	flag: "feature flags",
	llm: "AI features",
	organization: "organization settings",
	status_page: "status pages",
	subscription: "billing",
};

const PERMISSION_VERBS: Record<string, string> = {
	read: "view",
	update: "edit",
	view_analytics: "view analytics for",
};

function roleDeniedMessage(
	role: string,
	resource: string,
	permission: string | undefined
): string {
	const noun = RESOURCE_NOUNS[resource] ?? `${resource.replaceAll("_", " ")}s`;
	const verb = permission
		? (PERMISSION_VERBS[permission] ?? permission)
		: "change";
	return `Your ${role} role can't ${verb} ${noun} in this organization. Ask an owner or admin for access.`;
}

type Website = NonNullable<Awaited<ReturnType<typeof getWebsiteById>>>;

export type Permissions<R extends ResourceType> = readonly [
	PermissionFor<R>,
	...PermissionFor<R>[],
];

interface BaseOptions {
	allowCrossOrg?: boolean;
}

interface IncludedPlanOptions {
	includePlan: true;
	requiredPlans?: PlanId[];
}

interface RequiredPlanOptions {
	includePlan?: false;
	requiredPlans: PlanId[];
}

type PlanAwareOptions = IncludedPlanOptions | RequiredPlanOptions;

interface PlanFreeOptions {
	includePlan?: false;
	requiredPlans?: never;
}

interface WebsiteImplicitBase extends BaseOptions {
	organizationId?: string | null;
	permissions: Permissions<"website">;
	resource?: undefined;
	websiteId: string;
}

interface WebsiteExplicitBase<R extends ResourceType> extends BaseOptions {
	organizationId?: string | null;
	permissions: Permissions<R>;
	resource: R;
	websiteId: string;
}

interface OrgScopeBase<R extends ResourceType> extends BaseOptions {
	organizationId?: string | null;
	permissions: Permissions<R>;
	resource: R;
	websiteId?: undefined;
}

type WebsiteImplicitOptions = WebsiteImplicitBase & PlanFreeOptions;
type WebsiteImplicitPlanOptions = WebsiteImplicitBase & PlanAwareOptions;
type WebsiteExplicitOptions<R extends ResourceType> = WebsiteExplicitBase<R> &
	PlanFreeOptions;
type WebsiteExplicitPlanOptions<R extends ResourceType> =
	WebsiteExplicitBase<R> & PlanAwareOptions;
type OrgScopeOptions<R extends ResourceType> = OrgScopeBase<R> &
	PlanFreeOptions;
type OrgScopePlanOptions<R extends ResourceType> = OrgScopeBase<R> &
	PlanAwareOptions;

export interface AuthedWorkspace {
	getCreatedBy: () => Promise<string>;
	organizationId: string;
	role: string | null;
	tier: "authed";
	user: User | null;
	website: Website | null;
}

export type AuthedWorkspaceWithPlan = AuthedWorkspace & { plan: PlanId };

interface DemoWorkspace {
	organizationId: string;
	role: null;
	tier: "demo";
	user: null;
	website: Website;
}

type DemoWorkspaceWithPlan = DemoWorkspace & { plan: PlanId };

export type Workspace = AuthedWorkspace | DemoWorkspace;

export type PublicWorkspace =
	| (AuthedWorkspace & { website: Website })
	| DemoWorkspace;

export type PublicWorkspaceWithPlan =
	| (AuthedWorkspaceWithPlan & { website: Website })
	| DemoWorkspaceWithPlan;

const getWebsiteById = cacheable(
	async (id: string) =>
		await db.query.websites.findFirst({
			where: { id },
		}),
	{
		expireInSec: 600,
		prefix: cacheNamespaces.websiteById,
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

async function getPlanId(
	context: Context,
	organizationId: string
): Promise<PlanId> {
	const billing = await context.getBilling(organizationId);
	return normalizePlanId(billing?.planId ?? null);
}

function requirePlan(plan: PlanId, requiredPlans: PlanId[] | undefined): void {
	if (!(billingMode() === "live" && requiredPlans?.length)) {
		return;
	}
	if (!requiredPlans.includes(plan)) {
		throw rpcError.featureUnavailable("workspace_action", requiredPlans.at(0));
	}
}

async function requireWebsite(websiteId: string): Promise<Website> {
	const website = await getWebsiteById(websiteId);
	if (!website || website.deletedAt) {
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
		websiteId?: string;
	}
): Promise<Grant> {
	const { organizationId, resource, permissions, allowCrossOrg } = input;
	const oauth = context.oauth;
	if (oauth) {
		if (oauth.grant.organizationId !== organizationId) {
			return {
				granted: false,
				denied: rpcError.forbidden(
					"This connection does not have access to this organization. Reconnect it and choose this organization."
				),
			};
		}
		const websiteIds = oauth.grant.websiteIds;
		if (
			websiteIds &&
			(input.websiteId
				? !websiteIds.includes(input.websiteId)
				: resource !== "link")
		) {
			return {
				granted: false,
				denied: rpcError.forbidden(
					"This connection only has access to the websites selected when it was connected."
				),
			};
		}
		for (const scope of requiredScopesForResource(resource, permissions)) {
			if (!oauth.scopes.includes(scope)) {
				return {
					granted: false,
					denied: rpcError.forbidden(
						`This connection is missing the ${scope} scope. Reconnect it with that scope to continue.`
					),
				};
			}
		}
	}

	if (context.user) {
		if (
			!allowCrossOrg &&
			context.organizationId &&
			context.organizationId !== organizationId
		) {
			return {
				granted: false,
				denied: rpcError.forbidden(
					"This item belongs to a different organization. Switch organizations and try again."
				),
			};
		}

		const role = await getMemberRole(context.user.id, organizationId);
		if (!role) {
			return {
				granted: false,
				denied: rpcError.forbidden(
					"You are not a member of this organization. Ask an owner or admin to invite you."
				),
			};
		}

		if (!roleHasPermission(role, resource, permissions)) {
			return {
				granted: false,
				denied: rpcError.forbidden(
					roleDeniedMessage(role, resource, permissions[0])
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
					"This API key does not have access to this organization."
				),
			};
		}

		for (const scope of requiredScopesForResource(resource, permissions)) {
			if (
				!hasKeyScope(
					context.apiKey,
					scope,
					input.websiteId ? `website:${input.websiteId}` : undefined
				)
			) {
				return {
					granted: false,
					denied: rpcError.forbidden(
						`This API key is missing the ${scope} scope. Create a key with that scope to continue.`
					),
				};
			}
		}

		return { granted: true, user: null, role: null };
	}

	return { granted: false, denied: rpcError.unauthorized() };
}

interface ResolveInput {
	allowCrossOrg?: boolean;
	includePlan?: boolean;
	organizationId?: string | null;
	permissions: readonly string[];
	requiredPlans?: PlanId[];
	resource?: string;
	websiteId?: string;
}

interface ResolvedAuthed {
	kind: "authed";
	workspace: AuthedWorkspace & { plan?: PlanId };
}

interface ResolvedDenied {
	denied: Error;
	kind: "denied";
	organizationId: string;
	plan: PromiseSettledResult<PlanId | null>;
	website: Website | null;
}

async function resolveWorkspace(
	context: Context,
	input: ResolveInput
): Promise<ResolvedAuthed | ResolvedDenied> {
	const website = input.websiteId
		? await requireWebsite(input.websiteId)
		: null;

	const organizationId =
		input.organizationId ?? website?.organizationId ?? context.organizationId;

	if (!organizationId) {
		throw rpcError.badRequest("Select an organization and try again.");
	}
	if (website && website.organizationId !== organizationId) {
		throw rpcError.forbidden(
			"This website belongs to a different organization. Switch organizations and try again."
		);
	}

	const effectiveResource =
		input.resource ?? (input.websiteId ? "website" : "organization");
	const getCreatedBy = () => resolveCreatedBy(context, organizationId);
	const planPromise =
		input.includePlan || input.requiredPlans !== undefined
			? getPlanId(context, context.organizationId ?? organizationId)
			: Promise.resolve(null);

	const [grantResult, planResult] = await Promise.allSettled([
		resolveGrant(context, {
			organizationId,
			resource: effectiveResource,
			permissions: input.permissions,
			allowCrossOrg: input.allowCrossOrg ?? false,
			websiteId: website?.id,
		}),
		planPromise,
	]);

	if (grantResult.status === "rejected") {
		throw grantResult.reason;
	}
	const grant = grantResult.value;

	if (!grant.granted) {
		return {
			kind: "denied",
			denied: grant.denied,
			website,
			organizationId,
			plan: planResult,
		};
	}

	if (planResult.status === "rejected") {
		throw planResult.reason;
	}
	const plan = planResult.value;

	if (input.requiredPlans !== undefined) {
		requirePlan(requireResolvedPlan(plan), input.requiredPlans);
	}

	return {
		kind: "authed",
		workspace: {
			tier: "authed",
			organizationId,
			user: grant.user,
			role: grant.role,
			website,
			getCreatedBy,
			...(plan && { plan }),
		},
	};
}

function requireResolvedPlan(plan: PlanId | null): PlanId {
	if (!plan) {
		throw new Error("Workspace plan was not resolved");
	}
	return plan;
}

function requirePublicAuthedWorkspace<W extends AuthedWorkspace>(
	workspace: W
): W & { website: Website } {
	if (!workspace.website) {
		throw new Error("Public workspace website was not resolved");
	}
	return { ...workspace, website: workspace.website };
}

export const workspaceInputSchema = z.object({
	organizationId: z.string().nullish(),
});

export function withWorkspace<R extends ResourceType>(
	context: Context,
	options: WebsiteExplicitPlanOptions<R>
): Promise<AuthedWorkspaceWithPlan & { website: Website }>;
export function withWorkspace(
	context: Context,
	options: WebsiteImplicitPlanOptions
): Promise<AuthedWorkspaceWithPlan & { website: Website }>;
export function withWorkspace<R extends ResourceType>(
	context: Context,
	options: OrgScopePlanOptions<R>
): Promise<AuthedWorkspaceWithPlan>;
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
		| WebsiteImplicitPlanOptions
		| WebsiteExplicitOptions<ResourceType>
		| WebsiteExplicitPlanOptions<ResourceType>
		| OrgScopeOptions<ResourceType>
		| OrgScopePlanOptions<ResourceType>
): Promise<AuthedWorkspace | AuthedWorkspaceWithPlan> {
	const resolved = await resolveWorkspace(context, options);
	if (resolved.kind === "denied") {
		throw resolved.denied;
	}
	return resolved.workspace;
}

export async function hasAccess(check: Promise<unknown>): Promise<boolean> {
	try {
		await check;
		return true;
	} catch (error) {
		if (
			error instanceof ORPCError &&
			(error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
		) {
			return false;
		}
		throw error;
	}
}

export function withPublicWorkspace<R extends ResourceType>(
	context: Context,
	options: WebsiteExplicitPlanOptions<R>
): Promise<PublicWorkspaceWithPlan>;
export function withPublicWorkspace(
	context: Context,
	options: WebsiteImplicitPlanOptions
): Promise<PublicWorkspaceWithPlan>;
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
	options:
		| WebsiteImplicitOptions
		| WebsiteImplicitPlanOptions
		| WebsiteExplicitOptions<ResourceType>
		| WebsiteExplicitPlanOptions<ResourceType>
): Promise<PublicWorkspace | PublicWorkspaceWithPlan> {
	const resolved = await resolveWorkspace(context, options);

	if (resolved.kind === "authed") {
		return requirePublicAuthedWorkspace(resolved.workspace);
	}

	if (
		!context.oauth &&
		resolved.website?.isPublic &&
		isReadOnly(options.permissions)
	) {
		if (resolved.plan.status === "rejected") {
			throw resolved.plan.reason;
		}
		return {
			tier: "demo",
			organizationId: resolved.organizationId,
			user: null,
			role: null,
			website: resolved.website,
			...(resolved.plan.value && { plan: resolved.plan.value }),
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
				"This API key's organization has no owner. Add an owner and try again."
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
