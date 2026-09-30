import {
	getAccessibleWebsites,
	getMemberWebsites,
	getReadableOrganizationIds,
	type WebsiteSummary,
} from "../../lib/accessible-websites";
import {
	type ApiKeyRow,
	hasKeyScope,
	hasWebsiteScopeForOrganization,
} from "@databuddy/api-keys/resolve";
import { type User, websitesApi } from "@databuddy/auth";
import { roleHasPermission } from "@databuddy/auth/permissions";
import { db } from "@databuddy/db";
import { getRedisCache } from "@databuddy/redis";
import { getMemberRole } from "@databuddy/rpc/organization";
import type { AppContext } from "../config/context";
import { getCachedWebsite } from "../../lib/website-utils";
import { matchesWebsiteDomain } from "../../lib/website-domain";

const ACCESSIBLE_WEBSITES_TTL_SEC = 30;
const ACCESSIBLE_WEBSITES_KEY_PREFIX = "mcp:accessible_websites:v2:";

export interface WebsiteSelectorInput {
	websiteDomain?: string;
	websiteId?: string;
	websiteName?: string;
}

export interface RequestPrincipal {
	apiKey: ApiKeyRow | null;
	oauthUserId?: string | null;
	organizationId?: string | null;
	userId: string | null;
}

export type AuthorizedPrincipal = RequestPrincipal & {
	oauthUser?: User | null;
	requestHeaders: Headers;
};

export async function loadOAuthUser(userId: string): Promise<User | null> {
	const user = await db.query.user.findFirst({ where: { id: userId } });
	return user ?? null;
}

interface WebsiteAccess {
	domain: string;
	organizationId: string | null;
}

export async function ensureWebsiteAccess(
	websiteId: string,
	principal: AuthorizedPrincipal
): Promise<WebsiteAccess | Error> {
	const { apiKey, oauthUserId, organizationId } = principal;
	const website = await getCachedWebsite(websiteId);
	if (!website) {
		return new Error("Website not found");
	}
	if (organizationId && website.organizationId !== organizationId) {
		return new Error("Website is not in this organization");
	}

	if (oauthUserId) {
		if (!website.organizationId) {
			return new Error("Access denied to this website");
		}
		const role = await getMemberRole(oauthUserId, website.organizationId);
		if (!(role && roleHasPermission(role, "website", ["read"]))) {
			return new Error("Access denied to this website");
		}
		return {
			domain: website.domain ?? "unknown",
			organizationId: website.organizationId,
		};
	}

	if (apiKey) {
		const hasWebsiteAccess = hasWebsiteScopeForOrganization(
			apiKey,
			website,
			"read:data"
		);
		if (!hasWebsiteAccess) {
			return new Error("Access denied to this website");
		}
		return {
			domain: website.domain ?? "unknown",
			organizationId: website.organizationId,
		};
	}

	const hasPermission =
		website.organizationId &&
		(
			await websitesApi.hasPermission({
				headers: principal.requestHeaders,
				body: {
					organizationId: website.organizationId,
					permissions: { website: ["read"] },
				},
			})
		).success;
	if (!hasPermission) {
		return new Error("Access denied to this website");
	}
	return {
		domain: website.domain ?? "unknown",
		organizationId: website.organizationId,
	};
}
function accessibleWebsitesCacheKey(
	principal: RequestPrincipal
): string | null {
	const organizationId =
		principal.organizationId ?? principal.apiKey?.organizationId;
	if (principal.apiKey) {
		return `apikey:${principal.apiKey.id}:org:${organizationId ?? "none"}`;
	}
	if (principal.oauthUserId && !organizationId) {
		return `oauth:${principal.oauthUserId}`;
	}
	if (principal.userId && organizationId) {
		return `user:${principal.userId}:org:${organizationId}`;
	}
	return null;
}
export async function getCachedAccessibleWebsites(
	principal: RequestPrincipal
): Promise<WebsiteSummary[]> {
	const scopedApiKey =
		principal.apiKey && !hasKeyScope(principal.apiKey, "read:data");
	const authCtx = {
		apiKey: principal.apiKey,
		organizationId: scopedApiKey
			? null
			: (principal.organizationId ?? principal.apiKey?.organizationId ?? null),
		user: principal.userId ? { id: principal.userId } : null,
	};
	const { oauthUserId } = principal;
	const loadWebsites = () =>
		oauthUserId && !authCtx.organizationId
			? getMemberWebsites(oauthUserId)
			: getAccessibleWebsites(authCtx);
	const cacheKey = accessibleWebsitesCacheKey(principal);
	const redis = cacheKey ? getRedisCache() : null;
	if (!(cacheKey && redis)) {
		return loadWebsites();
	}

	const redisKey = `${ACCESSIBLE_WEBSITES_KEY_PREFIX}${cacheKey}`;
	try {
		const cached = await redis.get(redisKey);
		if (cached) {
			return JSON.parse(cached) as WebsiteSummary[];
		}
	} catch {
		// Cache read failure — fall through to DB
	}

	const result = await loadWebsites();
	try {
		await redis.setex(
			redisKey,
			ACCESSIBLE_WEBSITES_TTL_SEC,
			JSON.stringify(result)
		);
	} catch {
		// Cache write failure — non-fatal
	}
	return result;
}

export async function resolveWebsiteId(
	input: WebsiteSelectorInput,
	principal: RequestPrincipal
): Promise<string | Error> {
	if (input.websiteId) {
		return input.websiteId;
	}

	const list = await getCachedAccessibleWebsites(principal);

	const domain = input.websiteDomain;
	if (domain) {
		const match = list.find((website) =>
			matchesWebsiteDomain(website.domain, domain)
		);
		if (match) {
			return match.id;
		}
		return new Error(
			`No accessible website found with domain "${input.websiteDomain}"`
		);
	}

	if (input.websiteName) {
		const name = input.websiteName.toLowerCase();
		const match = list.find((w) => w.name?.toLowerCase() === name);
		if (match) {
			return match.id;
		}
		return new Error(
			`No accessible website found with name "${input.websiteName}"`
		);
	}

	return new Error(
		"One of websiteId, websiteName, or websiteDomain is required"
	);
}

export async function getOrganizationId(
	websiteId: string
): Promise<string | Error> {
	const website = await getCachedWebsite(websiteId);
	if (!website) {
		return new Error("Website not found");
	}
	if (!website.organizationId) {
		return new Error("Website is not associated with an organization");
	}
	return website.organizationId;
}

/**
 * Resolve the set of organization IDs to query, based on auth principal and
 * an optional explicit websiteId. Used by org-wide tools (insights, summaries).
 *
 * Resolution order:
 * 1. If websiteId provided → resolve via getOrganizationId (single org)
 * 2. If an organization is scoped on the request → use that organization
 * 3. If API key → use apiKey.organizationId (single org)
 * 4. If OAuth user → their only readable organization, or ask for a website
 * Session users must have an active organization; never fan out across all memberships.
 */
export async function resolveOrganizationIds(
	websiteId: string | undefined,
	principal: RequestPrincipal
): Promise<string[] | Error> {
	if (websiteId) {
		const orgId = await getOrganizationId(websiteId);
		if (orgId instanceof Error) {
			return orgId;
		}
		return [orgId];
	}
	if (principal.organizationId) {
		if (
			principal.apiKey &&
			principal.apiKey.organizationId !== principal.organizationId
		) {
			return new Error("API key does not belong to the requested organization");
		}
		if (principal.apiKey && !hasKeyScope(principal.apiKey, "read:data")) {
			return new Error(
				"Scoped API key requires a websiteId for org-level queries"
			);
		}
		return [principal.organizationId];
	}
	if (
		principal.apiKey?.organizationId &&
		hasKeyScope(principal.apiKey, "read:data")
	) {
		return [principal.apiKey.organizationId];
	}
	if (principal.apiKey && !hasKeyScope(principal.apiKey, "read:data")) {
		return new Error(
			"Scoped API key requires a websiteId for org-level queries"
		);
	}
	if (principal.oauthUserId) {
		const organizationIds = await getReadableOrganizationIds(
			principal.oauthUserId
		);
		if (organizationIds.length === 1) {
			return organizationIds;
		}
		return new Error(
			organizationIds.length === 0
				? "This account is not a member of any organization with website access."
				: `This account belongs to ${organizationIds.length} organizations. Pass websiteId, websiteName, or websiteDomain from list_websites to choose one.`
		);
	}
	if (principal.userId) {
		return new Error("Session requests require an active organization");
	}
	return new Error("Could not determine organization");
}

export function buildRpcContext(principal: AuthorizedPrincipal): AppContext {
	return {
		userId: principal.userId,
		websiteId: "",
		websiteDomain: "",
		timezone: "UTC",
		currentDateTime: new Date().toISOString(),
		chatId: "",
		organizationId:
			principal.organizationId ?? principal.apiKey?.organizationId,
		requestHeaders: principal.requestHeaders,
		serviceAuth: principal.apiKey
			? { apiKey: principal.apiKey, session: null }
			: principal.oauthUser
				? {
						apiKey: null,
						oauth: {
							organizationId: principal.organizationId ?? null,
							user: principal.oauthUser,
						},
						session: null,
					}
				: undefined,
	};
}
