import {
	getAccessibleWebsites,
	type WebsiteSummary,
} from "../../lib/accessible-websites";
import {
	type ApiKeyRow,
	hasKeyScope,
	hasWebsiteScopeForOrganization,
} from "@databuddy/api-keys/resolve";
import { websitesApi } from "@databuddy/auth";
import { roleHasPermission } from "@databuddy/auth/permissions";
import { db } from "@databuddy/db";
import { getRedisCache } from "@databuddy/redis";
import { getMemberRole } from "@databuddy/rpc/organization";
import type { AppContext, ServiceAuth } from "../config/context";
import { mergeWideEvent } from "../../lib/tracing";
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
	oauth?: NonNullable<ServiceAuth["oauth"]>;
	organizationId?: string | null;
	userId: string | null;
}

export type AuthorizedPrincipal = RequestPrincipal & {
	requestHeaders: Headers;
};

export type WebsiteSelectionErrorCode =
	| "invalid_input"
	| "not_found"
	| "unauthorized";

export class WebsiteSelectionError extends Error {
	readonly code: WebsiteSelectionErrorCode;
	readonly hint?: string;

	constructor(code: WebsiteSelectionErrorCode, message: string, hint?: string) {
		super(message);
		this.name = "WebsiteSelectionError";
		this.code = code;
		this.hint = hint;
	}
}

const WEBSITE_LIST_HINT = "Website IDs come from list_websites.";

interface WebsiteAccess {
	domain: string;
	organizationId: string | null;
}

function accessDenied(): WebsiteSelectionError {
	return new WebsiteSelectionError(
		"unauthorized",
		"Access denied to this website",
		WEBSITE_LIST_HINT
	);
}

export async function ensureWebsiteAccess(
	websiteId: string,
	principal: AuthorizedPrincipal
): Promise<WebsiteAccess | WebsiteSelectionError> {
	const { apiKey, oauth, organizationId } = principal;
	if (
		oauth &&
		(!oauth.scopes.includes("read:data") ||
			(oauth.grant.websiteIds && !oauth.grant.websiteIds.includes(websiteId)))
	) {
		return accessDenied();
	}
	const website = await getCachedWebsite(websiteId);
	if (!website || website.deletedAt) {
		return new WebsiteSelectionError(
			"not_found",
			"Website not found",
			WEBSITE_LIST_HINT
		);
	}
	const scopedOrganizationId = oauth?.grant.organizationId ?? organizationId;
	if (scopedOrganizationId && website.organizationId !== scopedOrganizationId) {
		return new WebsiteSelectionError(
			"unauthorized",
			"This website belongs to a different organization than this connection.",
			WEBSITE_LIST_HINT
		);
	}

	if (oauth) {
		if (!website.organizationId) {
			return accessDenied();
		}
		const role = await getMemberRole(oauth.user.id, website.organizationId);
		if (!(role && roleHasPermission(role, "website", ["read"]))) {
			return accessDenied();
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
			return accessDenied();
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
		return accessDenied();
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
		principal.oauth?.grant.organizationId ??
		principal.organizationId ??
		principal.apiKey?.organizationId;
	if (principal.apiKey) {
		return `apikey:${principal.apiKey.id}:org:${organizationId ?? "none"}`;
	}
	const userId = principal.oauth?.user.id ?? principal.userId;
	if (userId && organizationId) {
		return `user:${userId}:org:${organizationId}`;
	}
	return null;
}
function mergeCacheFailure(operation: "read" | "write"): void {
	mergeWideEvent({ [`mcp_websites_cache_${operation}_error`]: true });
}

export async function getCachedAccessibleWebsites(
	principal: RequestPrincipal
): Promise<WebsiteSummary[]> {
	const scopedApiKey =
		principal.apiKey && !hasKeyScope(principal.apiKey, "read:data");
	const userId = principal.oauth?.user.id ?? principal.userId;
	const authCtx = {
		apiKey: principal.apiKey,
		organizationId: scopedApiKey
			? null
			: (principal.oauth?.grant.organizationId ??
				principal.organizationId ??
				principal.apiKey?.organizationId ??
				null),
		user: userId ? { id: userId } : null,
	};
	const { oauth } = principal;
	if (oauth) {
		if (!oauth.scopes.includes("read:data")) {
			return [];
		}
		const membership = await db.query.member.findFirst({
			where: {
				userId: oauth.user.id,
				organizationId: oauth.grant.organizationId,
			},
			columns: { role: true },
		});
		if (
			!(membership && roleHasPermission(membership.role, "website", ["read"]))
		) {
			return [];
		}
	}
	const grantedWebsiteIds = oauth?.grant.websiteIds;
	const restrictWebsites = (list: WebsiteSummary[]) =>
		grantedWebsiteIds
			? list.filter((website) => grantedWebsiteIds.includes(website.id))
			: list;
	const cacheKey = accessibleWebsitesCacheKey(principal);
	const redis = cacheKey ? getRedisCache() : null;
	if (!(cacheKey && redis)) {
		return restrictWebsites(await getAccessibleWebsites(authCtx));
	}

	const redisKey = `${ACCESSIBLE_WEBSITES_KEY_PREFIX}${cacheKey}`;
	try {
		const cached = await redis.get(redisKey);
		if (cached) {
			return restrictWebsites(JSON.parse(cached) as WebsiteSummary[]);
		}
	} catch {
		mergeCacheFailure("read");
	}

	const result = await getAccessibleWebsites(authCtx);
	try {
		await redis.setex(
			redisKey,
			ACCESSIBLE_WEBSITES_TTL_SEC,
			JSON.stringify(result)
		);
	} catch {
		mergeCacheFailure("write");
	}
	return restrictWebsites(result);
}

function singleMatch(
	matches: WebsiteSummary[],
	selector: string
): string | WebsiteSelectionError {
	const [match, ...others] = matches;
	if (!match) {
		return new WebsiteSelectionError(
			"not_found",
			`No accessible website found with ${selector}`,
			"list_websites shows the websites this connection can use."
		);
	}
	if (others.length > 0) {
		return new WebsiteSelectionError(
			"invalid_input",
			`${matches.length} accessible websites match ${selector}. Pass websiteId from list_websites to choose one.`,
			WEBSITE_LIST_HINT
		);
	}
	return match.id;
}

export async function resolveWebsiteId(
	input: WebsiteSelectorInput,
	principal: RequestPrincipal
): Promise<string | WebsiteSelectionError> {
	if (input.websiteId) {
		return input.websiteId;
	}

	const list = await getCachedAccessibleWebsites(principal);

	const domain = input.websiteDomain;
	if (domain) {
		return singleMatch(
			list.filter((website) => matchesWebsiteDomain(website.domain, domain)),
			`domain "${domain}"`
		);
	}

	if (input.websiteName) {
		const name = input.websiteName.toLowerCase();
		return singleMatch(
			list.filter((website) => website.name?.toLowerCase() === name),
			`name "${input.websiteName}"`
		);
	}

	return new WebsiteSelectionError(
		"invalid_input",
		"One of websiteId, websiteName, or websiteDomain is required",
		WEBSITE_LIST_HINT
	);
}

export function resolveOrganizationId(
	principal: RequestPrincipal
): string | Error {
	if (principal.oauth?.grant.websiteIds) {
		return new Error(
			"This connection is limited to selected websites. Pass websiteId, websiteName, or websiteDomain from list_websites."
		);
	}
	if (principal.oauth) {
		return principal.oauth.grant.organizationId;
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
		return principal.organizationId;
	}
	if (principal.apiKey) {
		return principal.apiKey.organizationId &&
			hasKeyScope(principal.apiKey, "read:data")
			? principal.apiKey.organizationId
			: new Error("Scoped API key requires a websiteId for org-level queries");
	}
	if (principal.userId) {
		return new Error("Session requests require an active organization");
	}
	return new Error("Could not determine organization");
}

export function buildRpcContext(principal: AuthorizedPrincipal): AppContext {
	return {
		userId: principal.oauth?.user.id ?? principal.userId,
		websiteId: "",
		websiteDomain: "",
		timezone: "UTC",
		currentDateTime: new Date().toISOString(),
		chatId: "",
		organizationId:
			principal.oauth?.grant.organizationId ??
			principal.organizationId ??
			principal.apiKey?.organizationId,
		requestHeaders: principal.requestHeaders,
		serviceAuth: principal.apiKey
			? { apiKey: principal.apiKey, session: null }
			: principal.oauth
				? { apiKey: null, oauth: principal.oauth, session: null }
				: undefined,
	};
}
