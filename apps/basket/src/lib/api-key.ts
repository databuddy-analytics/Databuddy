/**
 * Thin tracing wrapper around @databuddy/api-keys.
 */
import {
	type ApiKeyRow,
	extractSecret,
	getApiKeyFromHeader as resolveApiKey,
} from "@databuddy/api-keys/resolve";
import { record } from "@lib/tracing";
import { useLogger } from "evlog/elysia";

export type { ApiKeyRow, ApiScope } from "@databuddy/api-keys/resolve";
export { hasKeyScope } from "@databuddy/api-keys/resolve";

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
