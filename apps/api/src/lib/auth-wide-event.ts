import { resolveApiKey } from "@databuddy/api-keys/resolve";
import { auth } from "@databuddy/auth";
import { isApiKeyPresent } from "./api-key";
import { mergeWideEvent } from "./tracing";

/**
 * Resolves session + API key from request headers and merges identity
 * fields into the active evlog wide event. Runs once globally in
 * onBeforeHandle so every request carries tenant context.
 */
export async function applyAuthWideEvent(headers: Headers): Promise<void> {
	const fields: Record<string, string | number | boolean> = {};

	const hasKey = isApiKeyPresent(headers);
	const [session, apiKeyResult] = await Promise.all([
		auth.api.getSession({ headers }).catch(() => null),
		hasKey ? resolveApiKey(headers) : null,
	]);

	const user = session?.user as
		| { id: string; email?: string; name?: string; role?: string }
		| undefined;
	const activeOrgId = (
		session?.session as { activeOrganizationId?: string | null } | undefined
	)?.activeOrganizationId;

	const apiKey = apiKeyResult?.key ?? null;
	const hasUser = Boolean(user);
	const hasApiKey = Boolean(apiKey);

	if (hasUser && hasApiKey) {
		fields.auth_method = "both";
	} else if (hasApiKey) {
		fields.auth_method = "api_key";
	} else if (hasUser) {
		fields.auth_method = "session";
	} else {
		fields.auth_method = "none";
	}

	if (user) {
		fields.user_id = user.id;
		if (user.email) {
			fields.user_email = user.email;
		}
		if (user.role) {
			fields.user_role = user.role;
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

	mergeWideEvent(fields);
}
