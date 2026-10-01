import { createHash, randomUUID } from "node:crypto";
import { defineRequestState } from "@better-auth/core/context";
import { and, db, eq, inArray, isNull, ne } from "@databuddy/db";
import {
	oauthConsent,
	oauthRefreshToken,
	websites,
} from "@databuddy/db/schema";
import { isApiScope, type ApiScope } from "@databuddy/shared/api-scopes";
import {
	decodeMcpGrantReference,
	encodeMcpGrantReference,
	MCP_GRANT_CLAIM,
	mcpAccessGrantSchema,
	type McpAccessGrant,
} from "@databuddy/shared/mcp-access";
import type { BetterAuthPlugin } from "better-auth";
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import { roleHasPermission } from "./permissions";

const selection = defineRequestState<{
	grant: McpAccessGrant;
	grantId: string;
} | null>(() => null);

function referenceHash(reference: string): string {
	return createHash("sha256").update(reference).digest("hex");
}

export const mcpPostLogin = {
	page: "/consent",
	shouldRedirect: async () => !(await selection.get()),
	consentReferenceId: async () => {
		const selected = await selection.get();
		if (!selected) {
			throw new APIError("BAD_REQUEST", {
				message:
					"Choose an organization and website access before allowing this connection.",
			});
		}
		return encodeMcpGrantReference(selected.grant, selected.grantId);
	},
};

export function mcpAccessTokenClaims({
	referenceId,
}: {
	referenceId?: string;
}): Record<string, string> {
	return referenceId && decodeMcpGrantReference(referenceId)
		? { [MCP_GRANT_CLAIM]: referenceHash(referenceId) }
		: {};
}

export function resolveMcpConsent(
	consents: { referenceId: string | null; scopes: unknown }[],
	hash: string,
	tokenScopes: string[]
): { grant: McpAccessGrant; scopes: ApiScope[] } | null {
	let grant: McpAccessGrant | null = null;
	let scopes = tokenScopes.filter(isApiScope);
	for (const consent of consents) {
		if (!consent.referenceId || referenceHash(consent.referenceId) !== hash) {
			continue;
		}
		const decoded = decodeMcpGrantReference(consent.referenceId);
		if (!(decoded && Array.isArray(consent.scopes))) {
			return null;
		}
		grant = decoded;
		// Intersect duplicate native consents too, so an older row cannot widen access.
		const consentScopes = consent.scopes;
		scopes = scopes.filter((scope) => consentScopes.includes(scope));
	}
	return grant ? { grant, scopes } : null;
}

export async function getMcpAccessGrant(
	userId: string,
	clientId: string,
	hash: string,
	tokenScopes: string[]
) {
	const consents = await db
		.select({
			referenceId: oauthConsent.referenceId,
			scopes: oauthConsent.scopes,
		})
		.from(oauthConsent)
		.where(
			and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId))
		);
	return resolveMcpConsent(consents, hash, tokenScopes);
}

export const mcpConsentAccess = {
	id: "mcp-consent-access",
	hooks: {
		before: [
			{
				matcher: (context) => context.path === "/oauth2/consent",
				handler: createAuthMiddleware(async (ctx) => {
					if (ctx.body?.accept !== true) {
						return;
					}
					const parsed = mcpAccessGrantSchema.safeParse({
						organizationId: ctx.body.organizationId,
						websiteIds: ctx.body.websiteIds,
					});
					if (!parsed.success) {
						throw new APIError("BAD_REQUEST", {
							message:
								"Choose an organization and all websites or at least one website.",
						});
					}
					if (
						typeof ctx.body.oauth_query !== "string" ||
						!ctx.body.oauth_query
					) {
						throw new APIError("BAD_REQUEST", {
							message: "Reconnect to start a new authorization request.",
						});
					}
					const session = await getSessionFromCtx(ctx);
					if (!session) {
						throw new APIError("UNAUTHORIZED");
					}
					const grant = parsed.data;
					const membership = await db.query.member.findFirst({
						where: {
							userId: session.user.id,
							organizationId: grant.organizationId,
						},
					});
					if (
						!(
							membership &&
							roleHasPermission(membership.role, "website", ["read"])
						)
					) {
						throw new APIError("FORBIDDEN", {
							message: "You do not have access to this organization.",
						});
					}
					if (grant.websiteIds) {
						const ids = [...new Set(grant.websiteIds)];
						const selected = await db
							.select({ id: websites.id })
							.from(websites)
							.where(
								and(
									eq(websites.organizationId, grant.organizationId),
									inArray(websites.id, ids),
									isNull(websites.deletedAt)
								)
							);
						if (selected.length !== ids.length) {
							throw new APIError("FORBIDDEN", {
								message:
									"Every selected website must belong to this organization.",
							});
						}
					}
					await selection.set({ grant, grantId: randomUUID() });
				}),
			},
			{
				matcher: (context) => context.path === "/oauth2/delete-consent",
				handler: createAuthMiddleware(async (ctx) => {
					const session = await getSessionFromCtx(ctx);
					if (!(session && typeof ctx.body?.id === "string")) {
						return;
					}
					const [consent] = await db
						.select({
							clientId: oauthConsent.clientId,
						})
						.from(oauthConsent)
						.where(
							and(
								eq(oauthConsent.id, ctx.body.id),
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
					// Better Auth refresh families are owned by the user and client.
					await db
						.delete(oauthConsent)
						.where(
							and(
								eq(oauthConsent.userId, session.user.id),
								eq(oauthConsent.clientId, consent.clientId),
								ne(oauthConsent.id, ctx.body.id)
							)
						);
				}),
			},
		],
	},
} satisfies BetterAuthPlugin;
