import {
	type ResolveApiKeyResult,
	isApiKeyPresent,
	resolveApiKey,
} from "@databuddy/api-keys/resolve";
import { auth } from "@databuddy/auth";
import { mergeWideEvent } from "@databuddy/ai/lib/tracing";
import type { ApiAuthWideEventFields } from "@databuddy/shared/evlog-fields";

export interface ResolvedAuth {
	apiKeyResult: ResolveApiKeyResult | null;
	session: Awaited<ReturnType<typeof auth.api.getSession>> | null;
}

const authCache = new WeakMap<Headers, ResolvedAuth>();

export function getResolvedAuth(headers: Headers): ResolvedAuth | undefined {
	return authCache.get(headers);
}

export async function applyAuthWideEvent(headers: Headers): Promise<void> {
	const fields: Partial<ApiAuthWideEventFields> = {};

	const hasKey = isApiKeyPresent(headers);
	const [session, apiKeyResult] = await Promise.all([
		auth.api.getSession({ headers }).catch(() => null),
		hasKey ? resolveApiKey(headers) : null,
	]);

	authCache.set(headers, { session, apiKeyResult });

	const user = session?.user;
	const role = (user as { role?: string } | undefined)?.role;
	const activeOrgId = session?.session.activeOrganizationId;

	const apiKey = apiKeyResult?.key ?? null;

	fields.auth_method =
		user && apiKey ? "both" : apiKey ? "api_key" : user ? "session" : "none";

	if (user) {
		fields.user_id = user.id;
		if (user.email) {
			fields.user_email = user.email;
		}
		if (role) {
			fields.user_role = role;
		}
	}

	if (apiKey) {
		fields.api_key_id = apiKey.id;
		fields.api_key_prefix = apiKey.prefix;
		fields.api_key_type = apiKey.type;
		fields.api_key_scope_count = apiKey.scopes.length;
	}

	if (apiKeyResult) {
		fields.api_key_outcome = apiKeyResult.outcome;
		if (apiKeyResult.prefix) {
			fields.api_key_attempted_prefix = apiKeyResult.prefix;
		}
		if (apiKeyResult.start) {
			fields.api_key_attempted_start = apiKeyResult.start;
		}
		if (apiKeyResult.outcome !== "ok" && apiKeyResult.outcome !== "missing") {
			fields.api_key_resolved = false;
		}
	}

	const orgId = activeOrgId ?? apiKey?.organizationId ?? null;
	if (orgId) {
		fields.organization_id = orgId;
	}

	mergeWideEvent<ApiAuthWideEventFields>(fields);
}
