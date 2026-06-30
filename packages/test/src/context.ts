import { auth, type User } from "@databuddy/auth";
import type { Context } from "@databuddy/rpc";
import type { AuthUser } from "./auth";
import { db } from "./db";

type TestUser = { id: string; name: string; email: string } & Partial<
	Omit<User, "id" | "name" | "email">
>;

interface ContextOverrides {
	apiKey?: Context["apiKey"];
	headers?: Headers;
	organizationId?: string | null;
	session?: Context["session"];
	user?: TestUser;
}

export function context(overrides: ContextOverrides = {}): Context {
	const user = overrides.user
		? ({
				emailVerified: true,
				image: null,
				firstName: null,
				lastName: null,
				status: "ACTIVE",
				createdAt: new Date(),
				updatedAt: new Date(),
				deletedAt: null,
				role: "USER",
				twoFactorEnabled: false,
				...overrides.user,
			} as User)
		: undefined;

	const now = new Date();
	const session: Context["session"] =
		overrides.session ??
		(user
			? {
					id: `session-${user.id}`,
					expiresAt: new Date(Date.now() + 86_400_000),
					token: `token-${user.id}`,
					createdAt: now,
					updatedAt: now,
					ipAddress: "127.0.0.1",
					userAgent: "test",
					userId: user.id,
					activeOrganizationId: overrides.organizationId ?? null,
				}
			: undefined);

	return {
		db: db() as Context["db"],
		auth,
		session,
		user,
		apiKey: overrides.apiKey,
		getBilling: async () => undefined,
		organizationId: overrides.organizationId ?? null,
		headers: overrides.headers ?? new Headers(),
		anonymousId: null,
		sessionId: null,
	};
}

export function userContext(user: AuthUser, orgId: string): Context {
	return context({
		user: { id: user.id, name: "test", email: user.email },
		organizationId: orgId,
		headers: user.headers,
	});
}

export function apiKeyContext(
	orgId: string,
	scopes: string[],
	targetOrgId?: string
): Context {
	const apiKey: Context["apiKey"] = {
		id: `key-${Math.random().toString(36).slice(2, 6)}`,
		name: "Test Key",
		prefix: "db_test",
		start: "test",
		keyHash: `hash-${Math.random().toString(36).slice(2, 6)}`,
		userId: null,
		organizationId: orgId,
		type: "user",
		scopes,
		enabled: true,
		revokedAt: null,
		rateLimitEnabled: false,
		rateLimitTimeWindow: null,
		rateLimitMax: null,
		expiresAt: null,
		lastUsedAt: null,
		metadata: {},
		createdAt: new Date(),
		updatedAt: new Date(),
	};
	return context({ apiKey, organizationId: targetOrgId ?? orgId });
}
