import {
	type ApiKeyRow,
	extractSecret,
	getAccessibleWebsiteIds as _getAccessibleWebsiteIds,
	getApiKeyFromHeader as resolveApiKey,
	hasGlobalAccess as _hasGlobalAccess,
	hasKeyScope as _hasKeyScope,
	hasWebsiteScope as _hasWebsiteScope,
} from "@databuddy/api-keys/resolve";
import { basketErrors } from "@lib/structured-errors";
import { record } from "@lib/tracing";
import { useLogger } from "evlog/elysia";

export type { ApiKeyRow } from "@databuddy/api-keys/resolve";

export const hasKeyScope = _hasKeyScope;
export const hasGlobalAccess = _hasGlobalAccess;
export const getAccessibleWebsiteIds = _getAccessibleWebsiteIds;
export const hasWebsiteScope = _hasWebsiteScope;

export function getApiKeyFromHeader(
	headers: Headers
): Promise<ApiKeyRow | null> {
	return record("getApiKeyFromHeader", async () => {
		const log = useLogger();
		const secret = extractSecret(headers);

		if (!secret) {
			return null;
		}

		const key = await resolveApiKey(headers);
		log.set({ auth: { method: "api_key", valid: Boolean(key) } });

		return key;
	});
}

export type ApiKeyWebsiteDenial =
	| "missing_website_id"
	| "missing_scope"
	| "website_not_found"
	| "website_scope_mismatch"
	| "website_not_active";

export function denyApiKeyWebsiteAccess(
	apiKey: ApiKeyRow,
	websiteId: string | undefined,
	website: { organizationId: string | null; status: string } | null
): ApiKeyWebsiteDenial | null {
	if (!websiteId) {
		return "missing_website_id";
	}
	if (!hasWebsiteScope(apiKey, websiteId, "track:events")) {
		return "missing_scope";
	}
	if (!website) {
		return "website_not_found";
	}
	if (
		!apiKey.organizationId ||
		website.organizationId !== apiKey.organizationId
	) {
		return "website_scope_mismatch";
	}
	if (website.status !== "ACTIVE") {
		return "website_not_active";
	}
	return null;
}

export const API_KEY_DENIAL_ERRORS: Record<ApiKeyWebsiteDenial, () => Error> = {
	missing_website_id: basketErrors.identifyMissingWebsiteId,
	missing_scope: basketErrors.trackMissingScope,
	website_not_found: basketErrors.trackWebsiteNotFound,
	website_scope_mismatch: basketErrors.trackWebsiteScopeMismatch,
	website_not_active: basketErrors.trackWebsiteNotFound,
};
