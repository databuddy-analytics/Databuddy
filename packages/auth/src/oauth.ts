import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { and, db, eq, isNull, isUniqueViolationFor } from "@databuddy/db";
import { oauthConsent, oauthRefreshToken } from "@databuddy/db/schema";
import { config } from "@databuddy/env/app";
import { API_SCOPES } from "@databuddy/shared/api-scopes";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { jwt } from "better-auth/plugins";
import { baseAuthOptions } from "./auth";

const database: typeof baseAuthOptions.database = (options) => {
	const adapter = baseAuthOptions.database(options);
	return {
		...adapter,
		create: <T extends Record<string, unknown>, R = T>(
			data: Parameters<typeof adapter.create<T, R>>[0]
		) =>
			adapter.create<T, R>(data).catch((error) => {
				// oauth-provider treats a concurrent resource seed as a no-op only when
				// the error message says "duplicate"; Drizzle keeps that in `cause`.
				if (
					data.model === "oauthResource" &&
					error instanceof Error &&
					error.cause instanceof Error &&
					isUniqueViolationFor(error, "oauth_resource_identifier_unique")
				) {
					throw error.cause;
				}
				throw error;
			}),
	};
};

const revokeTokensWithConsent = {
	id: "revoke-tokens-with-consent",
	hooks: {
		before: [
			{
				matcher: (context) => context.path === "/oauth2/delete-consent",
				handler: createAuthMiddleware(async (ctx) => {
					const session = await getSessionFromCtx(ctx);
					const consentId = (ctx.body as { id?: unknown } | undefined)?.id;
					if (!session || typeof consentId !== "string") {
						return;
					}
					const [consent] = await db
						.select({ clientId: oauthConsent.clientId })
						.from(oauthConsent)
						.where(
							and(
								eq(oauthConsent.id, consentId),
								eq(oauthConsent.userId, session.user.id)
							)
						)
						.limit(1);
					if (!consent) {
						return;
					}
					await db
						.update(oauthRefreshToken)
						.set({ revoked: new Date() })
						.where(
							and(
								eq(oauthRefreshToken.userId, session.user.id),
								eq(oauthRefreshToken.clientId, consent.clientId),
								isNull(oauthRefreshToken.revoked)
							)
						);
				}),
			},
		],
	},
} satisfies BetterAuthPlugin;

export const oauthAuthOptions = {
	...baseAuthOptions,
	database,
	plugins: [
		...baseAuthOptions.plugins,
		jwt(),
		mcp({
			loginPage: "/login",
			consentPage: "/consent",
			resource: config.urls.mcp,
			scopes: ["openid", "profile", "email", "offline_access", ...API_SCOPES],
		}),
		cimd({
			fetchClientMetadataResource,
			metadataProfile: "mcp-2026-07-28",
		}),
		revokeTokensWithConsent,
	],
};

export const oauthAuth = betterAuth(oauthAuthOptions);
