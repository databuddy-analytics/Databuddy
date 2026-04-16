import { auth, websitesApi } from "@databuddy/auth";
import { db, eq } from "@databuddy/db";
import { member } from "@databuddy/db/schema";
import { getRedisCache } from "@databuddy/redis";
import {
	getAccessibleWebsites,
	type WebsiteSummary,
} from "../../lib/accessible-websites";
import {
	type ApiKeyRow,
	getAccessibleWebsiteIds,
	hasGlobalAccess,
	hasKeyScope,
	hasWebsiteScope,
} from "../../lib/api-key";
import { getCachedWebsite, validateWebsite } from "../../lib/website-utils";
import type { AppContext } from "../config/context";

const PROTOCOL_RE = /^https?:\/\//;
const ACCESSIBLE_WEBSITES_TTL_SEC = 30;
const ACCESSIBLE_WEBSITES_KEY_PREFIX = "mcp:accessible_websites:";

export interface WebsiteSelectorInput {
	websiteDomain?: string;
	websiteId?: string;
	websiteName?: string;
}

export interface RequestPrincipal {
	apiKey: ApiKeyRow | null;
	userId: string | null;
}

export async function ensureWebsiteAccess(
	websiteId: string,
	headers: Headers,
	apiKey: ApiKeyRow | null
): Promise<{ domain: string } | Error> {
	const validation = await validateWebsite(websiteId);
	if (!(validation.success && validation.website)) {
		return new Error(validation.error ?? "Website not found");
	}
	const { website } = validation;

	if (apiKey) {
		if (!hasKeyScope(apiKey, "read:data")) {
			return new Error("API key missing read:data scope");
		}
		const accessibleIds = getAccessibleWebsiteIds(apiKey);
		const hasWebsiteAccess =
			hasWebsiteScope(apiKey, websiteId, "read:data") ||
			accessibleIds.includes(websiteId) ||
			(hasGlobalAccess(apiKey) &&
				apiKey.organizationId === website.organizationId);
		if (!hasWebsiteAccess) {
			return new Error("Access denied to this website");
		}
		return { domain: website.domain ?? "unknown" };
	}

	const session = await auth.api.getSession({ headers });
	if (session?.user?.role === "ADMIN") {
		return { domain: website.domain ?? "unknown" };
	}

	const hasPermission =
		website.organizationId &&
		(
			await websitesApi.hasPermission({
				headers,
				body: {
					organizationId: website.organizationId,
					permissions: { website: ["read"] },
				},
			})
		).success;
	if (!hasPermission) {
		return new Error("Access denied to this website");
	}
	return { domain: website.domain ?? "unknown" };
}

/**
 * Stable cache key for accessible websites, scoped by principal ID.
 * Does NOT include the apiKey object itself — keeps secrets out of Redis keys.
 */
function accessibleWebsitesCacheKey(
	principal: RequestPrincipal
): string | null {
	if (principal.apiKey) {
		return `apikey:${(principal.apiKey as { id: string }).id}`;
	}
	if (principal.userId) {
		return `user:${principal.userId}`;
	}
	return null;
}

/**
 * Cached version of getAccessibleWebsites keyed by stable principal ID.
 * Falls back to a direct fetch when Redis is unavailable or the principal
 * is anonymous.
 */
export async function getCachedAccessibleWebsites(
	principal: RequestPrincipal
): Promise<WebsiteSummary[]> {
	const authCtx = {
		user: principal.userId ? { id: principal.userId } : null,
		apiKey: principal.apiKey,
	};
	const cacheKey = accessibleWebsitesCacheKey(principal);
	const redis = cacheKey ? getRedisCache() : null;
	if (!(cacheKey && redis)) {
		return getAccessibleWebsites(authCtx);
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

	const result = await getAccessibleWebsites(authCtx);
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

	if (input.websiteDomain) {
		const domain = input.websiteDomain.toLowerCase().replace(PROTOCOL_RE, "");
		const match = list.find((w) => w.domain?.toLowerCase() === domain);
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
 * 2. If API key → use apiKey.organizationId (single org)
 * 3. If session user → list all org memberships (multi-org)
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
	if (principal.apiKey?.organizationId && hasGlobalAccess(principal.apiKey)) {
		return [principal.apiKey.organizationId];
	}
	if (principal.apiKey && !hasGlobalAccess(principal.apiKey)) {
		return new Error(
			"Scoped API key requires a websiteId for org-level queries"
		);
	}
	if (principal.userId) {
		const memberships = await db.query.member.findMany({
			where: eq(member.userId, principal.userId),
			columns: { organizationId: true },
		});
		if (memberships.length === 0) {
			return new Error("User has no organization memberships");
		}
		return memberships.map((m) => m.organizationId);
	}
	return new Error("Could not determine organization");
}

export function buildRpcContext(
	principal: RequestPrincipal & {
		requestHeaders: Headers;
	}
): AppContext {
	return {
		userId: principal.userId ?? "",
		websiteId: "",
		websiteDomain: "",
		timezone: "UTC",
		currentDateTime: new Date().toISOString(),
		chatId: "",
		requestHeaders: principal.requestHeaders,
	};
}

export function coerceQueriesArray(val: unknown): unknown[] | undefined {
	if (Array.isArray(val)) {
		return val;
	}
	if (typeof val === "string") {
		try {
			const parsed = JSON.parse(val) as unknown;
			return Array.isArray(parsed) ? parsed : undefined;
		} catch {
			return undefined;
		}
	}
	return undefined;
}
