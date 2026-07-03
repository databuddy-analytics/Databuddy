import {
	type ApiKeyRow,
	extractSecret,
	getAccessibleWebsiteIds as _getAccessibleWebsiteIds,
	getApiKeyFromHeader as resolveApiKey,
	hasGlobalAccess as _hasGlobalAccess,
	hasKeyScope as _hasKeyScope,
	hasWebsiteScope as _hasWebsiteScope,
} from "@databuddy/api-keys/resolve";
import { record } from "@lib/tracing";
import { useLogger } from "evlog/elysia";

export type { ApiKeyRow, ApiScope } from "@databuddy/api-keys/resolve";

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
