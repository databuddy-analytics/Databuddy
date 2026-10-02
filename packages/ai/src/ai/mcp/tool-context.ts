import {
	getAccessibleWebsites,
	getOrganizationWebsites,
	type WebsiteSummary,
} from "../../lib/accessible-websites";
import {
	type ApiKeyRow,
	hasKeyScope,
	hasWebsiteScopeForOrganization,
} from "@databuddy/api-keys/resolve";
import { websitesApi } from "@databuddy/auth";
import { roleHasPermission } from "@databuddy/auth/permissions";
import { cacheable } from "@databuddy/redis";
import { getMemberRole } from "@databuddy/rpc/organization";
import type { AppContext, ServiceAuth } from "../config/context";
import { getCachedWebsite } from "../../lib/website-utils";
import { matchesWebsiteDomain } from "../../lib/website-domain";

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
	oauth?: NonNullable<ServiceAuth["oauth"]>;
	organizationId?: string | null;
	userId: string | null;
}

export type AuthorizedPrincipal = RequestPrincipal & {
	requestHeaders: Headers;
};

type WebsiteSelectionErrorCode = "invalid_input" | "not_found" | "unauthorized";

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
	organizationId: string;
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
	if (!website.organizationId) {
		return accessDenied();
	}

	if (oauth) {
		const role = await getMemberRole(oauth.user.id, website.organizationId);
		if (!(role && roleHasPermission(role, "website", ["read"]))) {
			return accessDenied();
		}
	} else if (apiKey) {
		if (!hasWebsiteScopeForOrganization(apiKey, website, "read:data")) {
			return accessDenied();
		}
	} else {
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
	}
	return {
		domain: website.domain ?? "unknown",
		organizationId: website.organizationId,
	};
}

type AccessibleWebsite = Omit<WebsiteSummary, "createdAt">;

async function loadWebsiteList(
	principal: "organization" | "user",
	principalId: string,
	organizationId: string | null
): Promise<AccessibleWebsite[]> {
	const list =
		principal === "user"
			? await getAccessibleWebsites({
					apiKey: null,
					organizationId,
					user: { id: principalId },
				})
			: await getOrganizationWebsites(principalId);
	return list.map(({ createdAt: _createdAt, ...website }) => website);
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
	const { apiKey, oauth } = principal;
	const userId = oauth?.user.id ?? principal.userId;
	const organizationId =
		apiKey && !hasKeyScope(apiKey, "read:data")
			? null
			: (oauth?.grant.organizationId ??
				principal.organizationId ??
				apiKey?.organizationId ??
				null);
	if (oauth) {
		const role = oauth.scopes.includes("read:data")
			? await getMemberRole(oauth.user.id, oauth.grant.organizationId)
			: null;
		if (!(role && roleHasPermission(role, "website", ["read"]))) {
			return [];
		}
	}
	let list: AccessibleWebsite[] = [];
	if (apiKey) {
		const keyOrganizationId = apiKey.organizationId;
		list =
			keyOrganizationId &&
			(!organizationId || organizationId === keyOrganizationId)
				? (
						await getCachedWebsiteList("organization", keyOrganizationId, null)
					).filter((website) =>
						hasWebsiteScopeForOrganization(apiKey, website, "read:data")
					)
				: [];
	} else if (userId && organizationId) {
		list = await getCachedWebsiteList("user", userId, organizationId);
	}
	const grantedWebsiteIds = oauth?.grant.websiteIds;
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

export function resolveOrganizationId(
	principal: RequestPrincipal
): string | WebsiteSelectionError {
	const { apiKey, oauth, organizationId } = principal;
	if (oauth?.grant.websiteIds) {
		return new WebsiteSelectionError(
			"invalid_input",
			"This connection is limited to selected websites, so organization-wide data, including organization-wide flags, is not available. Pass websiteId, websiteName, or websiteDomain from list_websites to use one of those websites."
		);
	}
	if (oauth) {
		return oauth.grant.organizationId;
	}
	if (apiKey) {
		if (organizationId && apiKey.organizationId !== organizationId) {
			return new WebsiteSelectionError(
				"unauthorized",
				"API key does not belong to the requested organization"
			);
		}
		return apiKey.organizationId && hasKeyScope(apiKey, "read:data")
			? apiKey.organizationId
			: new WebsiteSelectionError(
					"invalid_input",
					"Scoped API key requires a websiteId for org-level queries",
					WEBSITE_LIST_HINT
				);
	}
	if (organizationId) {
		return organizationId;
	}
	return new WebsiteSelectionError(
		"unauthorized",
		principal.userId
			? "Session requests require an active organization"
			: "Could not determine organization"
	);
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
