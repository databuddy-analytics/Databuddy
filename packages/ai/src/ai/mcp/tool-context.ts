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
import { cacheable } from "@databuddy/redis";
import { getMemberRole } from "@databuddy/rpc/organization";
import type { McpAccessGrant } from "@databuddy/shared/mcp-access";
import type { AppContext } from "../config/context";
import { getCachedWebsite } from "../../lib/website-utils";
import { matchesWebsiteDomain } from "../../lib/website-domain";

const OAUTH_USER_TTL_SEC = 15;
const ACCESSIBLE_WEBSITES_TTL_SEC = 30;
const ACCESSIBLE_WEBSITES_STALE_SEC = 10;
const UNAUTHORIZED_STATUS_CODES = new Set([401, 403]);

export interface WebsiteSelectorInput {
	websiteDomain?: string;
	websiteId?: string;
	websiteName?: string;
}

export interface RequestPrincipal {
	apiKey: ApiKeyRow | null;
	oauthGrant?: McpAccessGrant;
	oauthScopes?: string[] | null;
	oauthUserId?: string | null;
	organizationId?: string | null;
	userId: string | null;
}

export type AuthorizedPrincipal = RequestPrincipal & {
	oauthUser?: User | null;
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

export const loadOAuthUser = cacheable(
	async (userId: string): Promise<User | null> =>
		(await db.query.user.findFirst({ where: { id: userId } })) ?? null,
	{ expireInSec: OAUTH_USER_TTL_SEC, prefix: "mcp:oauth-user" }
);

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

function isAuthRejection(error: unknown): boolean {
	return (
		error instanceof Error &&
		"statusCode" in error &&
		typeof error.statusCode === "number" &&
		UNAUTHORIZED_STATUS_CODES.has(error.statusCode)
	);
}

export async function ensureWebsiteAccess(
	websiteId: string,
	principal: AuthorizedPrincipal
): Promise<WebsiteAccess | WebsiteSelectionError> {
	const { apiKey, oauthGrant, oauthScopes, oauthUserId, organizationId } =
		principal;
	if (
		oauthUserId &&
		((oauthScopes && !oauthScopes.includes("read:data")) ||
			(oauthGrant?.websiteIds && !oauthGrant.websiteIds.includes(websiteId)))
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
	const scopedOrganizationId = oauthGrant?.organizationId ?? organizationId;
	if (scopedOrganizationId && website.organizationId !== scopedOrganizationId) {
		return new WebsiteSelectionError(
			"unauthorized",
			"This website belongs to a different organization than this connection.",
			WEBSITE_LIST_HINT
		);
	}

	if (oauthUserId) {
		if (!website.organizationId) {
			return accessDenied();
		}
		const role = await getMemberRole(oauthUserId, website.organizationId);
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

	if (!website.organizationId) {
		return accessDenied();
	}
	try {
		const permission = await websitesApi.hasPermission({
			headers: principal.requestHeaders,
			body: {
				organizationId: website.organizationId,
				permissions: { website: ["read"] },
			},
		});
		if (!permission.success) {
			return accessDenied();
		}
	} catch (error) {
		if (isAuthRejection(error)) {
			return accessDenied();
		}
		throw error;
	}
	return {
		domain: website.domain ?? "unknown",
		organizationId: website.organizationId,
	};
}

type AccessibleWebsite = Pick<
	WebsiteSummary,
	"domain" | "id" | "isPublic" | "name" | "organizationId" | "organizationName"
>;

type WebsiteListPrincipal = "api_key" | "member" | "user";

function toAccessibleWebsites(list: WebsiteSummary[]): AccessibleWebsite[] {
	return list.map(
		({ domain, id, isPublic, name, organizationId, organizationName }) => ({
			domain,
			id,
			isPublic,
			name,
			organizationId,
			organizationName,
		})
	);
}

async function loadWebsiteList(
	principal: WebsiteListPrincipal,
	principalId: string,
	organizationId: string | null
): Promise<AccessibleWebsite[]> {
	if (principal === "member") {
		return toAccessibleWebsites(await getMemberWebsites(principalId));
	}
	if (principal === "user") {
		return toAccessibleWebsites(
			await getAccessibleWebsites({
				apiKey: null,
				organizationId,
				user: { id: principalId },
			})
		);
	}
	const apiKey = await db.query.apikey.findFirst({
		where: { id: principalId },
	});
	return apiKey
		? toAccessibleWebsites(
				await getAccessibleWebsites({ apiKey, organizationId, user: null })
			)
		: [];
}

const getCachedWebsiteList = cacheable(loadWebsiteList, {
	expireInSec: ACCESSIBLE_WEBSITES_TTL_SEC,
	prefix: "mcp:accessible-website-list",
	reviveDates: false,
	staleTime: ACCESSIBLE_WEBSITES_STALE_SEC,
	staleWhileRevalidate: true,
});

export async function getCachedAccessibleWebsites(
	principal: RequestPrincipal
): Promise<AccessibleWebsite[]> {
	const { apiKey, oauthUserId, userId } = principal;
	const organizationId =
		apiKey && !hasKeyScope(apiKey, "read:data")
			? null
			: (principal.oauthGrant?.organizationId ??
				principal.organizationId ??
				apiKey?.organizationId ??
				null);
	if (oauthUserId) {
		if (principal.oauthScopes && !principal.oauthScopes.includes("read:data")) {
			return [];
		}
		if (
			organizationId &&
			!(await getReadableOrganizationIds(oauthUserId)).includes(organizationId)
		) {
			return [];
		}
	}
	let list: AccessibleWebsite[] = [];
	if (apiKey) {
		list = await getCachedWebsiteList("api_key", apiKey.id, organizationId);
	} else if (oauthUserId && !organizationId) {
		list = await getCachedWebsiteList("member", oauthUserId, null);
	} else if (userId && organizationId) {
		list = await getCachedWebsiteList("user", userId, organizationId);
	}
	const grantedWebsiteIds = principal.oauthGrant?.websiteIds;
	return grantedWebsiteIds
		? list.filter((website) => grantedWebsiteIds.includes(website.id))
		: list;
}

function singleMatch(
	matches: AccessibleWebsite[],
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
		const candidates = matches
			.map((website) => `${website.id} in ${website.organizationName}`)
			.join(", ");
		return new WebsiteSelectionError(
			"invalid_input",
			`${matches.length} accessible websites match ${selector}: ${candidates}. Pass websiteId to choose one.`,
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

export async function resolveOrganizationId(
	principal: RequestPrincipal
): Promise<string | WebsiteSelectionError> {
	if (principal.oauthGrant?.websiteIds) {
		return new WebsiteSelectionError(
			"invalid_input",
			"This connection is limited to selected websites, so organization-wide data, including organization-wide flags, is not available. Pass websiteId, websiteName, or websiteDomain from list_websites to use one of those websites."
		);
	}
	if (principal.oauthGrant) {
		return principal.oauthGrant.organizationId;
	}
	if (principal.organizationId) {
		if (
			principal.apiKey &&
			principal.apiKey.organizationId !== principal.organizationId
		) {
			return new WebsiteSelectionError(
				"unauthorized",
				"API key does not belong to the requested organization"
			);
		}
		if (principal.apiKey && !hasKeyScope(principal.apiKey, "read:data")) {
			return scopedApiKeyError();
		}
		return principal.organizationId;
	}
	if (principal.apiKey) {
		return principal.apiKey.organizationId &&
			hasKeyScope(principal.apiKey, "read:data")
			? principal.apiKey.organizationId
			: scopedApiKeyError();
	}
	if (principal.oauthUserId) {
		const organizationIds = await getReadableOrganizationIds(
			principal.oauthUserId
		);
		const [onlyOrganizationId] = organizationIds;
		if (onlyOrganizationId && organizationIds.length === 1) {
			return onlyOrganizationId;
		}
		return organizationIds.length === 0
			? new WebsiteSelectionError(
					"unauthorized",
					"This account is not a member of any organization with website access."
				)
			: new WebsiteSelectionError(
					"invalid_input",
					`This account belongs to ${organizationIds.length} organizations, so organization-wide data, including organization-wide flags, cannot be selected over this connection. Pass websiteId, websiteName, or websiteDomain from list_websites to use one website's data.`
				);
	}
	if (principal.userId) {
		return new WebsiteSelectionError(
			"unauthorized",
			"Session requests require an active organization"
		);
	}
	return new WebsiteSelectionError(
		"unauthorized",
		"Could not determine organization"
	);
}

function scopedApiKeyError(): WebsiteSelectionError {
	return new WebsiteSelectionError(
		"invalid_input",
		"Scoped API key requires a websiteId for org-level queries",
		WEBSITE_LIST_HINT
	);
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
			principal.oauthGrant?.organizationId ??
			principal.organizationId ??
			principal.apiKey?.organizationId,
		requestHeaders: principal.requestHeaders,
		serviceAuth: principal.apiKey
			? { apiKey: principal.apiKey, session: null }
			: principal.oauthUser
				? {
						apiKey: null,
						oauth: {
							organizationId:
								principal.oauthGrant?.organizationId ??
								principal.organizationId ??
								null,
							grant: principal.oauthGrant,
							scopes: principal.oauthScopes ?? undefined,
							user: principal.oauthUser,
						},
						session: null,
					}
				: undefined,
	};
}
